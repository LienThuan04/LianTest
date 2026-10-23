import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClassModulesService } from '@/class-modules/class-modules.service';
import type {
  IGroupDetail,
  IGroupStudentRow,
} from '@/class-modules/interfaces/class-modules.types';
import type {
  IClientGroupRow,
  IClientScheduleArgs,
  ITestScheduleRow,
} from '@/client/interfaces/client.types';

/**
 * Nghiệp vụ phía sinh viên — thay client.php của DHT_OneTest.
 * Tái dùng ClassModulesService cho các thao tác nhóm dùng chung (join /
 * getDetailGroup / getSvList); phần riêng của SV (tham gia bằng mã mời, danh
 * sách nhóm đang học, ẩn/thoát nhóm, lịch kiểm tra) implement ở đây.
 */
@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classModules: ClassModulesService,
  ) {}

  /** Lấy manhom từ mã mời. Thay NhomModel::getIdFromInvitedCode (null nếu sai). */
  private async getIdFromInvitedCode(mamoi: string): Promise<number | null> {
    const row = await this.prisma.nhom.findFirst({
      where: { mamoi },
      select: { manhom: true },
    });
    return row?.manhom ?? null;
  }

  /**
   * POST /client/joinGroup — SV tham gia nhóm bằng mã mời. Thay Client::joinGroup.
   * Trả 0 nếu mã mời sai, 1 nếu đã trong nhóm, còn lại là chi tiết nhóm vừa vào
   * (getDetailGroup) để client_group.js đẩy vào danh sách.
   */
  async joinGroup(
    mamoi: string,
    userId: string,
  ): Promise<0 | 1 | IGroupDetail | null> {
    const manhom = await this.getIdFromInvitedCode(mamoi);
    if (manhom == null) return 0; // Mã mời không hợp lệ
    const ok = await this.classModules.join(manhom, userId);
    if (!ok) return 1; // Đã tham gia nhóm này
    return this.classModules.getDetailGroup(manhom);
  }

  /**
   * POST /client/loadDataGroups — nhóm SV đang tham gia theo trạng thái hiển thị.
   * Thay NhomModel::getAllGroup_User($user_id, $hienthi). Bỏ nhóm trangthai=0.
   */
  getAllGroupUser(userId: string, hienthi: number): Promise<IClientGroupRow[]> {
    return this.prisma.$queryRaw<IClientGroupRow[]>(Prisma.sql`
      SELECT MH.mamonhoc, MH.tenmonhoc,
             N.manhom, N.tennhom, N.namhoc, N.hocky,
             NH.tennamhoc, HK.tenhocky,
             ND.hoten, ND.avatar, CTN.hienthi
      FROM chitietnhom CTN
      JOIN nhom N ON CTN.manhom = N.manhom
      JOIN nguoidung ND ON ND.id = N.giangvien
      JOIN monhoc MH ON MH.mamonhoc = N.mamonhoc
      LEFT JOIN namhoc NH ON NH.manamhoc = N.namhoc
      LEFT JOIN hocky HK ON HK.mahocky = N.hocky
      WHERE CTN.manguoidung = ${userId}
        AND CTN.hienthi = ${hienthi}
        AND N.trangthai <> 0
    `);
  }

  /**
   * POST /client/getFriendList — bạn cùng nhóm (trừ chính mình). Thay getFriendList.
   * KHÁC PHP: lọc bỏ user bằng filter thay vòng lặp array_splice (PHP có lỗi tiềm
   * ẩn xoá nhầm phần tử cuối khi không tìm thấy — user luôn có trong nhóm nên
   * thực tế không kích hoạt; ở đây tránh hẳn bằng filter cho an toàn).
   */
  async getFriendList(
    manhom: number,
    userId: string,
  ): Promise<IGroupStudentRow[]> {
    const membership = await this.prisma.chiTietNhom.count({
      where: { manhom, manguoidung: userId },
    });
    if (membership === 0) {
      throw new ForbiddenException('Bạn không thuộc nhóm này.');
    }
    const list = await this.classModules.getSvList(manhom);
    return list.filter((sv) => sv.id !== userId);
  }

  /**
   * POST /client/hide — SV ẩn/hiện 1 nhóm của mình (chitietnhom.hienthi).
   * Thay NhomModel::sv_hide. Trả true nếu cập nhật được (client_group.js chỉ
   * kiểm truthy). giatri phải là 0 hoặc 1.
   */
  async svHide(manhom: number, masv: string, giatri: number): Promise<boolean> {
    if (giatri !== 0 && giatri !== 1) return false;
    const res = await this.prisma.chiTietNhom.updateMany({
      where: { manhom, manguoidung: masv },
      data: { hienthi: giatri },
    });
    return res.count > 0;
  }

  /**
   * POST /client/delete — SV thoát nhóm (xoá bản ghi chitietnhom của mình).
   * Thay NhomModel::SVDelete. Trả true. LƯU Ý (giữ như PHP): KHÔNG cập nhật lại
   * siso của nhóm sau khi SV rời — khác kickUser (GV) có updateSiso.
   */
  async svDelete(manhom: number, userId: string): Promise<boolean> {
    try {
      await this.prisma.chiTietNhom.deleteMany({
        where: { manhom, manguoidung: userId },
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── Lịch kiểm tra (test_schedule) — phân trang model=DeThiModel ──────────────

  /**
   * Dựng câu truy vấn lịch thi SV (thay DeThiModel::getQuery case
   * "getUserTestSchedule"). T1 = các đề được giao cho nhóm SV tham gia; T2 = kết
   * quả của SV (chỉ lộ điểm khi xemdiemthi=1). filter: 0=đang mở chưa thi,
   * 1=quá hạn chưa thi, 2=chưa mở, 3=đã thi. Search theo tên đề/tên môn.
   */
  private buildScheduleBase(args: IClientScheduleArgs): Prisma.Sql {
    const manguoidung = String(args.manguoidung ?? '');
    const input = (args.input ?? args.content ?? '').trim();
    const filter = args.filter != null ? String(args.filter) : '';

    let filterSql = Prisma.empty;
    switch (filter) {
      case '0':
        filterSql = Prisma.sql` AND CURRENT_TIMESTAMP BETWEEN T1.thoigianbatdau AND T1.thoigianketthuc AND (T2.dathi IS NULL OR T2.dathi = 0)`;
        break;
      case '1':
        filterSql = Prisma.sql` AND CURRENT_TIMESTAMP > T1.thoigianketthuc AND (T2.dathi IS NULL OR T2.dathi = 0)`;
        break;
      case '2':
        filterSql = Prisma.sql` AND CURRENT_TIMESTAMP < T1.thoigianbatdau`;
        break;
      case '3':
        filterSql = Prisma.sql` AND T2.dathi = 1`;
        break;
    }

    let searchSql = Prisma.empty;
    if (input) {
      const like = `%${input}%`;
      searchSql = Prisma.sql` AND (T1.tende ILIKE ${like} OR T1.tenmonhoc ILIKE ${like})`;
    }

    return Prisma.sql`
      SELECT T1.*, T2.diemthi, T2.dathi, T2.xemdiemthi, T2.diem_tuluan, T2.trangthai_tuluan
      FROM (
        SELECT DT.made, DT.tende, DT.thoigianbatdau, DT.thoigianketthuc, CTN.manhom,
               N.tennhom, MH.tenmonhoc, N.namhoc, N.hocky
        FROM chitietnhom CTN, giaodethi GDT, dethi DT, monhoc MH, nhom N
        WHERE N.trangthai <> 0
          AND N.manhom = CTN.manhom
          AND CTN.manhom = GDT.manhom
          AND DT.made = GDT.made
          AND MH.mamonhoc = DT.monthi
          AND DT.trangthai = 1
          AND CTN.manguoidung = ${manguoidung}
      ) T1
      LEFT JOIN (
        SELECT DISTINCT DT.made,
               CASE WHEN DT.xemdiemthi = 1 THEN KQ.diemthi ELSE NULL END AS diemthi,
               CASE WHEN KQ.manguoidung IS NOT NULL THEN 1 ELSE 0 END AS dathi,
               CASE WHEN DT.xemdiemthi = 1 THEN KQ.diem_tuluan ELSE NULL END AS diem_tuluan,
               CASE WHEN DT.xemdiemthi = 1 THEN KQ.trangthai_tuluan ELSE NULL END AS trangthai_tuluan,
               DT.xemdiemthi
        FROM chitietnhom CTN, giaodethi GDT, dethi DT, monhoc MH, nhom N, ketqua KQ
        WHERE N.manhom = CTN.manhom
          AND CTN.manhom = GDT.manhom
          AND DT.made = GDT.made
          AND MH.mamonhoc = DT.monthi
          AND KQ.made = DT.made
          AND DT.trangthai = 1
          AND KQ.manguoidung = ${manguoidung}
      ) T2 ON T1.made = T2.made
      WHERE 1 = 1${filterSql}${searchSql}
    `;
  }

  /** POST /client/getTotalPages — tổng số trang lịch thi. */
  async countUserTestSchedulePages(
    args: IClientScheduleArgs,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || 10;
    const base = this.buildScheduleBase(args);
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM (${base}) sub
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) || 0 };
  }

  /** POST /client/pagination — 1 trang lịch thi (mảng, ORDER BY made DESC). */
  listUserTestSchedule(args: IClientScheduleArgs): Promise<ITestScheduleRow[]> {
    const limit = Number(args.limit) || 10;
    const page = Number(args.page) || 1;
    const offset = (page - 1) * limit;
    const base = this.buildScheduleBase(args);
    return this.prisma.$queryRaw<ITestScheduleRow[]>(Prisma.sql`
      SELECT * FROM (${base}) sub
      ORDER BY sub.made DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }
}
