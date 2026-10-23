import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  IAnnouncementDetail,
  IAnnouncementListItem,
  IAnnouncementPaginationArgs,
  IAnnouncementRow,
  IGroupAnnouncementRow,
  INotificationRow,
} from '@/announcements/interfaces/announcement.types';

/**
 * Nghiệp vụ Thông báo — thay AnnouncementModel.php.
 * 1 thông báo (`thongbao`) gửi cho NHIỀU nhóm (`chitietthongbao`); mỗi SV trong
 * các nhóm đó có 1 dòng trạng thái đọc (`trangthaithongbao`, mặc định 'chưa xem').
 * `is_auto = 1` = thông báo sinh tự động khi tạo đề (ExamsService.createNotification)
 * → KHÔNG hiện trong danh sách quản lý của GV, chỉ hiện ở chuông/offcanvas nhóm.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActor(actorId: string) {
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: actorId },
      select: { manhomquyen: true, trangthai: true },
    });
    if (!actor || actor.trangthai !== 1) {
      throw new ForbiddenException('Tài khoản không có quyền truy cập.');
    }
    return actor;
  }

  async assertCanManageAnnouncement(matb: number, actorId: string): Promise<void> {
    const [notice, actor] = await Promise.all([this.getById(matb), this.getActor(actorId)]);
    if (!notice) throw new NotFoundException('Không tìm thấy thông báo.');
    if (notice.nguoitao !== actorId && actor.manhomquyen !== 3) {
      throw new ForbiddenException('Bạn không có quyền với thông báo này.');
    }
  }

  private async assertTargetGroups(nhom: number[], actorId: string): Promise<void> {
    const ids = [...new Set(nhom)];
    if (!ids.length) throw new BadRequestException('Vui lòng chọn nhóm nhận thông báo.');
    const actor = await this.getActor(actorId);
    const groups = await this.prisma.nhom.findMany({
      where: { manhom: { in: ids }, trangthai: 1 },
      select: { manhom: true, giangvien: true },
    });
    if (groups.length !== ids.length) throw new NotFoundException('Nhóm nhận không tồn tại.');
    if (actor.manhomquyen !== 3 && groups.some((group) => group.giangvien !== actorId)) {
      throw new ForbiddenException('Bạn không quản lý nhóm nhận thông báo.');
    }
  }

  private async assertCanReadAnnouncement(matb: number, actorId: string): Promise<void> {
    const [notice, actor] = await Promise.all([this.getById(matb), this.getActor(actorId)]);
    if (!notice) throw new NotFoundException('Không tìm thấy thông báo.');
    if (notice.nguoitao === actorId || actor.manhomquyen === 3) return;
    const groups = await this.prisma.chiTietThongBao.findMany({
      where: { matb },
      select: { manhom: true },
    });
    const membership = await this.prisma.chiTietNhom.count({
      where: { manguoidung: actorId, manhom: { in: groups.map((group) => group.manhom) } },
    });
    if (membership === 0) throw new ForbiddenException('Bạn không phải người nhận thông báo.');
  }

  private async assertCanReadGroup(manhom: number, actorId: string): Promise<void> {
    const [group, actor] = await Promise.all([
      this.prisma.nhom.findUnique({ where: { manhom }, select: { giangvien: true, trangthai: true } }),
      this.getActor(actorId),
    ]);
    if (!group || group.trangthai !== 1) throw new NotFoundException('Không tìm thấy nhóm.');
    if (group.giangvien === actorId || actor.manhomquyen === 3) return;
    const membership = await this.prisma.chiTietNhom.count({ where: { manhom, manguoidung: actorId } });
    if (membership === 0) throw new ForbiddenException('Bạn không thuộc nhóm này.');
  }

  /**
   * Chuỗi thời gian JS gửi lên có dạng 'YYYY/M/D H:m:s' (announcement.js) —
   * new Date() hiểu được; rỗng/không hợp lệ → dùng thời điểm hiện tại.
   */
  private parseThoiGianTao(raw?: string): Date {
    if (!raw) return new Date();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  /**
   * Gửi 1 thông báo tới danh sách nhóm + sinh trạng thái 'chưa xem' cho từng SV.
   * Thay AnnouncementModel::sendAnnouncement (INSERT IGNORE → skipDuplicates).
   */
  private async sendToGroups(
    tx: Prisma.TransactionClient,
    matb: number,
    nhom: number[],
  ): Promise<string[]> {
    const uniq = [...new Set(nhom)];
    if (!uniq.length) return [];

    // Chỉ gửi tới nhóm CÓ THẬT (PHP dựa FK; ở đây chitietthongbao.manhom không
    // có FK trong schema Prisma nên tự lọc để tránh dòng mồ côi).
    const valid = await tx.nhom.findMany({
      where: { manhom: { in: uniq } },
      select: { manhom: true },
    });
    const manhoms = valid.map((n) => n.manhom);
    if (!manhoms.length) return [];

    await tx.chiTietThongBao.createMany({
      data: manhoms.map((manhom) => ({ matb, manhom })),
      skipDuplicates: true,
    });

    const members = await tx.chiTietNhom.findMany({
      where: { manhom: { in: manhoms } },
      select: { manguoidung: true },
      distinct: ['manguoidung'],
    });
    const userIds = [...new Set(members.map((m) => m.manguoidung))];
    if (userIds.length) {
      await tx.trangThaiThongBao.createMany({
        data: userIds.map((manguoidung) => ({ matb, manguoidung })),
        skipDuplicates: true,
      });
    }
    return userIds;
  }

  /**
   * POST /teacher_announcement/sendAnnouncement — tạo thông báo & gửi cho nhóm.
   * Thay AnnouncementModel::create (trả mã thông báo mới, false nếu lỗi).
   * LƯU Ý: PHP nhận `mamonhoc` nhưng KHÔNG dùng (môn suy ra từ nhóm) — giữ nguyên.
   * KHÁC PHP: bọc trong $transaction để không còn thông báo "cụt" khi lỗi giữa chừng.
   */
  async create(
    noidung: string,
    thoigiantao: string | undefined,
    nguoitao: string,
    nhom: number[],
  ): Promise<number | false> {
    await this.assertTargetGroups(nhom, nguoitao);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tb = await tx.thongBao.create({
          data: {
            noidung,
            thoigiantao: this.parseThoiGianTao(thoigiantao),
            nguoitao,
            is_auto: 0,
          },
        });
        await this.sendToGroups(tx, tb.matb, nhom);
        return tb.matb;
      });
    } catch {
      return false;
    }
  }

  /** Lấy 1 thông báo theo mã (kiểm quyền sở hữu). Thay getById. */
  getById(matb: number) {
    return this.prisma.thongBao.findUnique({ where: { matb } });
  }

  /**
   * POST /teacher_announcement/updateAnnounce — sửa nội dung + đổi nhóm nhận.
   * Thay updateAnnounce: cập nhật nội dung, xoá hết chitietthongbao rồi gửi lại.
   * Dọn trạng thái của người không còn nhận, giữ trạng thái đọc của người còn nhận.
   */
  async updateAnnounce(
    matb: number,
    noidung: string,
    nhom: number[],
    actorId: string,
  ): Promise<boolean> {
    await this.assertCanManageAnnouncement(matb, actorId);
    await this.assertTargetGroups(nhom, actorId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.thongBao.update({ where: { matb }, data: { noidung } });
        await tx.chiTietThongBao.deleteMany({ where: { matb } });
        const recipients = await this.sendToGroups(tx, matb, nhom);
        await tx.trangThaiThongBao.deleteMany({
          where: { matb, manguoidung: { notIn: recipients } },
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * POST /teacher_announcement/deleteAnnounce — xoá CỨNG thông báo.
   * Thay deleteAnnounce + deleteDetailAnnounce (chitietthongbao/trangthaithongbao
   * đã onDelete: Cascade trong schema nên chỉ cần xoá thongbao).
   */
  async deleteAnnounce(matb: number, actorId: string): Promise<boolean> {
    await this.assertCanManageAnnouncement(matb, actorId);
    try {
      await this.prisma.thongBao.delete({ where: { matb } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * POST /teacher_announcement/getDetail — chi tiết 1 thông báo (trang cập nhật).
   * Thay getDetail: thông tin môn/năm/kỳ lấy theo nhóm ĐẦU TIÊN nhận thông báo
   * (như PHP lấy dòng đầu của phép nối), kèm mảng mã nhóm đang nhận.
   */
  async getDetail(matb: number, actorId: string): Promise<IAnnouncementDetail | null> {
    await this.assertCanReadAnnouncement(matb, actorId);
    const rows = await this.prisma.$queryRaw<
      {
        matb: number;
        noidung: string | null;
        tenmonhoc: string;
        namhoc: number | null;
        hocky: number | null;
      }[]
    >(Prisma.sql`
      SELECT TB.matb, TB.noidung, MH.tenmonhoc, N.namhoc, N.hocky
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN nhom N ON CTTB.manhom = N.manhom
      JOIN monhoc MH ON N.mamonhoc = MH.mamonhoc
      WHERE TB.matb = ${matb}
      LIMIT 1
    `);
    const tb = rows[0];
    if (!tb) return null;

    const groups = await this.prisma.chiTietThongBao.findMany({
      where: { matb },
      select: { manhom: true },
    });
    return { ...tb, nhom: groups.map((g) => g.manhom) };
  }

  /**
   * POST /teacher_announcement/getAnnounce — thông báo của 1 nhóm (offcanvas
   * class_detail / client_group). Thay getAnnounce.
   * QUIRK PHP: câu gốc nối thêm `chitietnhom` cùng mã nhóm → nhóm CHƯA có thành
   * viên nào sẽ không thấy thông báo. Giữ nguyên bằng EXISTS.
   */
  async getAnnounce(manhom: number, actorId: string): Promise<IGroupAnnouncementRow[]> {
    await this.assertCanReadGroup(manhom, actorId);
    return this.prisma.$queryRaw<IGroupAnnouncementRow[]>(Prisma.sql`
      SELECT DISTINCT TB.matb, TB.noidung, ND.avatar, TB.thoigiantao
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN nguoidung ND ON TB.nguoitao = ND.id
      WHERE CTTB.manhom = ${manhom}
        AND EXISTS (SELECT 1 FROM chitietnhom CTN WHERE CTN.manhom = ${manhom})
      ORDER BY TB.thoigiantao DESC
    `);
  }

  /**
   * POST /teacher_announcement/getNotifications — 5 thông báo mới nhất của các
   * nhóm mà user đang tham gia (chuông thông báo ở header). Thay getNotifications.
   */
  getNotifications(userId: string): Promise<INotificationRow[]> {
    return this.prisma.$queryRaw<INotificationRow[]>(Prisma.sql`
      SELECT N.tennhom, ND.avatar, ND.hoten, TB.noidung, TB.thoigiantao,
             CTN.manhom, MH.mamonhoc, MH.tenmonhoc
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN chitietnhom CTN ON CTTB.manhom = CTN.manhom
      JOIN nguoidung ND ON TB.nguoitao = ND.id
      JOIN nhom N ON CTN.manhom = N.manhom
      JOIN monhoc MH ON MH.mamonhoc = N.mamonhoc
      WHERE CTN.manguoidung = ${userId}
      ORDER BY TB.thoigiantao DESC
      LIMIT 5
    `);
  }

  /** POST /teacher_announcement/markAsRead — đánh dấu đã xem tất cả. */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      await this.prisma.trangThaiThongBao.updateMany({
        where: { manguoidung: userId, trangthai: 'chưa xem' },
        data: { trangthai: 'đã xem' },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** POST /teacher_announcement/getUnreadCount — số thông báo chưa xem. */
  countUnread(userId: string): Promise<number> {
    return this.prisma.trangThaiThongBao.count({
      where: { manguoidung: userId, trangthai: 'chưa xem' },
    });
  }

  /**
   * POST /teacher_announcement/getListAnnounce — thông báo GV đã tạo, gộp tên
   * nhóm thành mảng. Thay getAll (announcement.js có hàm gọi nhưng chưa dùng —
   * danh sách thật chạy qua phân trang bên dưới).
   */
  async getAll(userId: string): Promise<IAnnouncementListItem[]> {
    const rows = await this.prisma.$queryRaw<
      {
        matb: number;
        tennhom: string;
        noidung: string | null;
        tenmonhoc: string;
        namhoc: number | null;
        tennamhoc: string | null;
        hocky: number | null;
        tenhocky: string | null;
        thoigiantao: Date | null;
      }[]
    >(Prisma.sql`
      SELECT CTTB.matb, N.tennhom, TB.noidung, MH.tenmonhoc,
             N.namhoc, NH.tennamhoc, N.hocky, HK.tenhocky, TB.thoigiantao
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN nhom N ON CTTB.manhom = N.manhom
      JOIN monhoc MH ON N.mamonhoc = MH.mamonhoc
      LEFT JOIN namhoc NH ON N.namhoc = NH.manamhoc
      LEFT JOIN hocky HK ON N.hocky = HK.mahocky
      WHERE TB.is_auto = 0 AND TB.nguoitao = ${userId}
      ORDER BY TB.thoigiantao DESC
    `);

    const items: IAnnouncementListItem[] = [];
    for (const r of rows) {
      const found = items.find((i) => i.matb === r.matb);
      if (found) {
        found.nhom.push(r.tennhom);
      } else {
        items.push({
          matb: r.matb,
          noidung: r.noidung,
          tenmonhoc: r.tenmonhoc,
          tennamhoc: r.tennamhoc,
          // QUIRK PHP: gán `hocky` (mã) vào khoá tenhocky — giữ nguyên.
          tenhocky: r.hocky,
          thoigiantao: r.thoigiantao,
          nhom: [r.tennhom],
        });
      }
    }
    return items;
  }

  // ── Phân trang (pagination.js, model=AnnouncementModel) ─────────────────────

  /**
   * WHERE của danh sách thông báo GV — thay AnnouncementModel::getQuery.
   * Bảo mật hơn PHP: nguoitao lấy từ JWT, KHÔNG tin `args.id` do client gửi.
   */
  private buildWhere(
    args: IAnnouncementPaginationArgs,
    userId: string,
  ): Prisma.Sql {
    const input = (args.input ?? args.content ?? args.filter?.keyword ?? '')
      .toString()
      .trim();
    const conds: Prisma.Sql[] = [
      Prisma.sql`TB.nguoitao = ${userId}`,
      Prisma.sql`TB.is_auto = 0`,
    ];
    if (input) {
      conds.push(Prisma.sql`TB.noidung ILIKE ${`%${input}%`}`);
    }
    // PHP chỉ lọc khi CÓ CẢ năm học và học kỳ (select "học kỳ" gửi cặp namhoc-hocky).
    const namhoc = args.filter?.namhoc;
    const hocky = args.filter?.hocky;
    if (namhoc && hocky) {
      conds.push(
        Prisma.sql`N.namhoc = ${Number(namhoc)} AND N.hocky = ${Number(hocky)}`,
      );
    }
    if (args.filter?.mamonhoc) {
      conds.push(Prisma.sql`MH.mamonhoc = ${args.filter.mamonhoc}`);
    }
    return Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`;
  }

  /** POST /teacher_announcement/getTotalPages — tổng số trang. */
  async countPages(
    args: IAnnouncementPaginationArgs,
    userId: string,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || 10;
    const where = this.buildWhere(args, userId);
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT TB.matb)::int AS total
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN nhom N ON CTTB.manhom = N.manhom
      JOIN monhoc MH ON N.mamonhoc = MH.mamonhoc
      JOIN namhoc NH ON N.namhoc = NH.manamhoc
      JOIN hocky HK ON N.hocky = HK.mahocky
      ${where}
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) || 0 };
  }

  /**
   * POST /teacher_announcement/pagination — 1 trang danh sách thông báo.
   * STRING_AGG(DISTINCT ...) thay GROUP_CONCAT; MIN() cho các cột không gộp
   * (MySQL cho phép chọn cột bất kỳ khi GROUP BY, Postgres thì không).
   */
  listAnnouncements(
    args: IAnnouncementPaginationArgs,
    userId: string,
  ): Promise<IAnnouncementRow[]> {
    const limit = Number(args.limit) || 10;
    const page = Number(args.page) || 1;
    const offset = (page - 1) * limit;
    const where = this.buildWhere(args, userId);
    return this.prisma.$queryRaw<IAnnouncementRow[]>(Prisma.sql`
      SELECT TB.matb, TB.noidung, TB.thoigiantao, TB.nguoitao, TB.is_auto,
             MIN(MH.tenmonhoc) AS tenmonhoc,
             MIN(NH.tennamhoc) AS tennamhoc,
             MIN(HK.tenhocky) AS tenhocky,
             STRING_AGG(DISTINCT N.tennhom, ', ') AS nhom
      FROM thongbao TB
      JOIN chitietthongbao CTTB ON TB.matb = CTTB.matb
      JOIN nhom N ON CTTB.manhom = N.manhom
      JOIN monhoc MH ON N.mamonhoc = MH.mamonhoc
      JOIN namhoc NH ON N.namhoc = NH.manamhoc
      JOIN hocky HK ON N.hocky = HK.mahocky
      ${where}
      GROUP BY TB.matb
      ORDER BY TB.thoigiantao DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }
}
