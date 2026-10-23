import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ForbiddenException } from '@/common/exceptions/app.exception';
import { generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import { readXlsSheetRows, readXlsxSheetRows } from '@/common/utils/excel.util';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import type {
  IActionStatus,
  IExcelImportResult,
  IImportUserRow,
  IPaginationArgs,
  IUserRow,
} from '@/users/interfaces/users.types';

/** Kiểm email — tương đương FILTER_VALIDATE_EMAIL của PHP ở mức thực dụng. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nghiệp vụ quản lý người dùng hệ thi — thay NguoiDungModel (phần user.php).
 * Phân trang phía server giữ đúng giao thức pagination.js (getTotalPages +
 * pagination). Xem user.php + getQuery() gốc.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Kiểm quyền từ trạng thái/nhóm hiện tại trong DB trước mọi thao tác ghi. */
  private async requirePermission(
    actorId: string,
    action: 'create' | 'update' | 'delete',
    resource = 'nguoidung',
  ) {
    if (!actorId)
      throw new ForbiddenException('Không xác định được người dùng');
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: actorId },
      select: { id: true, manhomquyen: true, trangthai: true },
    });
    if (!actor || actor.trangthai !== 1 || actor.manhomquyen == null) {
      throw new ForbiddenException(
        'Tài khoản không có quyền thực hiện thao tác',
      );
    }
    const allowed = await this.prisma.chiTietQuyen.count({
      where: {
        manhomquyen: actor.manhomquyen,
        chucnang: resource,
        hanhdong: action,
      },
    });
    if (!allowed)
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác');
    return actor;
  }

  /** Quyền quản lý người dùng không đồng nghĩa quyền cấp/sửa nhóm đặc quyền. */
  private async assertCanManageUser(
    actorId: string,
    targetId: string,
    action: 'update' | 'delete',
    newRole?: number,
  ): Promise<void> {
    const actor = await this.requirePermission(actorId, action);
    if (actor.manhomquyen === 3) return;
    const target = await this.prisma.nguoiDung.findUnique({
      where: { id: targetId },
      select: { manhomquyen: true },
    });
    if (
      (target?.manhomquyen != null && ![1, 2].includes(target.manhomquyen)) ||
      (newRole != null && ![1, 2].includes(newRole))
    ) {
      throw new ForbiddenException(
        'Chỉ quản trị viên được quản lý tài khoản đặc quyền',
      );
    }
  }

  /** Nhóm quyền đang hoạt động — cho dropdown lọc + select2 (getAllRoles). */
  getAllRoles() {
    return this.prisma.nhomQuyen.findMany({
      where: { trangthai: true },
      orderBy: { manhomquyen: 'asc' },
      select: { manhomquyen: true, tennhomquyen: true },
    });
  }

  /** Điều kiện lọc giống getQuery() gốc: bỏ admin (3) + chỉ user còn hoạt động. */
  private buildWhere(args: IPaginationArgs): Prisma.NguoiDungWhereInput {
    const where: Prisma.NguoiDungWhereInput = { trangthai: 1 };
    const role = args.filter?.role ? Number(args.filter.role) : 0;
    if (role) where.manhomquyen = role;
    else where.manhomquyen = { not: 3 };

    const input = (args.input ?? args.content ?? '').trim();
    if (input) {
      where.OR = [
        { hoten: { contains: input, mode: 'insensitive' } },
        { id: { contains: input, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /** POST /user/getTotalPages — tổng số trang theo filter. */
  async getTotalPages(args: IPaginationArgs): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || 10;
    const total = await this.prisma.nguoiDung.count({
      where: this.buildWhere(args),
    });
    return { totalPages: Math.ceil(total / limit) || 0 };
  }

  /** POST /user/pagination — 1 trang dữ liệu (đã JOIN tennhomquyen). */
  async paginate(args: IPaginationArgs): Promise<IUserRow[]> {
    const limit = Number(args.limit) || 10;
    const page = Number(args.page) || 1;
    const rows = await this.prisma.nguoiDung.findMany({
      where: this.buildWhere(args),
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { nhomQuyen: { select: { tennhomquyen: true } } },
    });
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      hoten: u.hoten,
      avatar: u.avatar,
      gioitinh: u.gioitinh ? 1 : 0,
      ngaysinh: fmt(u.ngaysinh),
      ngaythamgia: fmt(u.ngaythamgia),
      trangthai: u.trangthai,
      manhomquyen: u.manhomquyen,
      tennhomquyen: u.nhomQuyen?.tennhomquyen ?? null,
    }));
  }

  /** Kiểm tra trùng id HOẶC email — thay checkUser() (trả mảng bản ghi khớp). */
  checkUser(mssv?: string, email?: string) {
    const or: Prisma.NguoiDungWhereInput[] = [];
    if (mssv) or.push({ id: mssv });
    if (email) or.push({ email });
    if (or.length === 0) return Promise.resolve([]);
    return this.prisma.nguoiDung.findMany({
      where: { OR: or },
      select: { id: true, email: true, hoten: true },
    });
  }

  /** Chi tiết 1 người dùng — thay getById(). */
  getDetail(id: string) {
    return this.prisma.nguoiDung.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        hoten: true,
        gioitinh: true,
        ngaysinh: true,
        avatar: true,
        ngaythamgia: true,
        sodienthoai: true,
        trangthai: true,
        manhomquyen: true,
      },
    });
  }

  /** Tạo người dùng — thay create(). Như PHP: luôn nhóm 2, trạng thái 1. */
  async create(
    dto: CreateUserDto,
  ): Promise<{ status: string; message: string }> {
    const dupEmail = await this.prisma.nguoiDung.findUnique({
      where: { email: dto.email },
    });
    if (dupEmail) return { status: 'error', message: 'Email đã được sử dụng' };
    const dupId = await this.prisma.nguoiDung.findUnique({
      where: { id: dto.masinhvien },
    });
    if (dupId)
      return { status: 'error', message: 'Mã sinh viên đã được sử dụng' };

    try {
      const salt = parseInt(
        this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
        10,
      );
      await this.prisma.nguoiDung.create({
        data: {
          id: dto.masinhvien,
          email: dto.email,
          hoten: dto.hoten,
          gioitinh: dto.gioitinh != null ? Boolean(dto.gioitinh) : false,
          ngaysinh: new Date(dto.ngaysinh || '2004-01-01'),
          sodienthoai: dto.sodienthoai ? Number(dto.sodienthoai) : null,
          matkhau: await generatePasswordHash(dto.password, salt),
          trangthai: 1,
          manhomquyen: 2,
        },
      });
      return { status: 'success', message: 'Thêm người dùng thành công' };
    } catch (err) {
      this.logger.error('Thêm người dùng thất bại', err as Error);
      return { status: 'error', message: 'Thêm người dùng thất bại' };
    }
  }

  /** Cập nhật người dùng — thay update(). password trống = giữ nguyên. */
  async update(
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<{ status: string; message: string }> {
    await this.assertCanManageUser(actorId, dto.id, 'update', dto.role);
    const existing = await this.prisma.nguoiDung.findUnique({
      where: { email: dto.email },
    });
    if (existing && existing.id !== dto.id)
      return { status: 'error', message: 'Email đã được sử dụng' };

    try {
      const data: Prisma.NguoiDungUpdateInput = {
        email: dto.email,
        hoten: dto.hoten,
        gioitinh: dto.gioitinh != null ? Boolean(dto.gioitinh) : false,
        ngaysinh: new Date(dto.ngaysinh || '2004-01-01'),
        sodienthoai: dto.sodienthoai ? Number(dto.sodienthoai) : null,
        trangthai: dto.status != null ? Number(dto.status) : 1,
      };
      if (dto.role != null)
        data.nhomQuyen = { connect: { manhomquyen: Number(dto.role) } };
      if (dto.password) {
        const salt = parseInt(
          this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
          10,
        );
        data.matkhau = await generatePasswordHash(dto.password, salt);
      }
      await this.prisma.nguoiDung.update({ where: { id: dto.id }, data });
      return { status: 'success', message: 'Cập nhật người dùng thành công' };
    } catch (err) {
      this.logger.error('Cập nhật người dùng thất bại', err as Error);
      return { status: 'error', message: 'Cập nhật người dùng thất bại' };
    }
  }

  /** Xoá mềm (trangthai=0) — thay delete(). */
  async delete(
    id: string,
    actorId: string,
  ): Promise<{ status: string; message: string }> {
    await this.assertCanManageUser(actorId, id, 'delete');
    try {
      await this.prisma.nguoiDung.update({
        where: { id },
        data: { trangthai: 0 },
      });
      return { status: 'success', message: 'Xóa người dùng thành công' };
    } catch (err) {
      this.logger.error('Xoá người dùng thất bại', err as Error);
      return { status: 'error', message: 'Xóa người dùng thất bại' };
    }
  }

  /** Khoá/mở khoá — thay setStatus(). Dùng bởi modal "Thành viên" trang phân quyền. */
  async setStatus(
    id: string,
    status: number,
    actorId: string,
  ): Promise<boolean> {
    await this.assertCanManageUser(actorId, id, 'update');
    try {
      await this.prisma.nguoiDung.update({
        where: { id },
        data: { trangthai: status ? 1 : 0 },
      });
      return true;
    } catch (err) {
      this.logger.error('Đổi trạng thái thất bại', err as Error);
      return false;
    }
  }

  // ================== NHẬP SINH VIÊN TỪ FILE EXCEL (Phase 7) ==================

  /**
   * POST /user/addExcel — đọc file danh sách SV (.xls/.xlsx) và trả về JSON để
   * client xem trước rồi gửi sang addFileExcelGroup. Thay `User::addExcel`
   * (PHPExcel) bằng exceljs (.xlsx) + SheetJS (.xls).
   *
   * Bố cục file giữ y bản PHP (mẫu danh sách lớp của trường): bỏ 2 dòng đầu,
   * dữ liệu từ **dòng 3**; cột **B** = MSSV, **C** = họ đệm, **D** = tên,
   * **H** = email. Dòng thiếu mssv/họ tên/email hoặc email sai định dạng bị BỎ QUA.
   *
   * Đọc được cả 2 định dạng: `.xlsx` (OOXML) qua exceljs và **`.xls` cũ (BIFF)**
   * qua `xlsx`/SheetJS — exceljs không đọc được BIFF nên phải rẽ nhánh theo đuôi
   * file. Sau khi đọc, cả 2 nhánh cho cùng ma trận chuỗi nên phần lọc dữ liệu
   * bên dưới dùng chung.
   */
  async parseStudentExcel(
    file: Express.Multer.File | undefined,
  ): Promise<IExcelImportResult> {
    if (!file || !file.buffer?.length) {
      return { status: 'error', message: 'Chưa chọn file để tải lên' };
    }
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      return {
        status: 'error',
        message: 'Chỉ hỗ trợ file Excel (.xlsx, .xls)',
      };
    }

    let rows: string[][] | null;
    try {
      rows =
        ext === 'xls'
          ? readXlsSheetRows(file.buffer)
          : await readXlsxSheetRows(file.buffer);
    } catch (err) {
      this.logger.error('Đọc file Excel thất bại', err as Error);
      return {
        status: 'error',
        message: 'Không thể đọc file: ' + (err as Error).message,
      };
    }

    if (!rows) {
      return { status: 'error', message: 'File Excel không có sheet nào' };
    }

    const data: IImportUserRow[] = [];
    // Dữ liệu từ dòng 3 → chỉ số mảng 2; cột B/C/D/H → chỉ số 1/2/3/7.
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const mssv = row[1] ?? '';
      const hoDem = row[2] ?? '';
      const ten = row[3] ?? '';
      const email = row[7] ?? '';
      const fullname = `${hoDem} ${ten}`.trim();

      if (!mssv || !email || !fullname) continue;
      if (!EMAIL_RE.test(email)) continue;

      data.push({ fullname, email, mssv, nhomquyen: 2, trangthai: 1 });
    }

    if (data.length === 0) {
      return { status: 'error', message: 'Không có dữ liệu hợp lệ trong file' };
    }
    return { status: 'success', data };
  }

  /**
   * POST /user/addFileExcelGroup — tạo tài khoản SV từ danh sách đã đọc rồi thêm
   * hết vào 1 nhóm. Thay `User::addFileExcelGroup` + `NguoiDungModel::addFileGroup`.
   *
   * Giữ nguyên phân loại kết quả của PHP: `success` (đã thêm vào nhóm),
   * `exists` (đã có sẵn trong nhóm), `errors` (dữ liệu thiếu / email trùng).
   * SV đã có tài khoản thì chỉ thêm vào nhóm, KHÔNG đụng tới mật khẩu cũ.
   *
   * KHÁC PHP: (1) băm mật khẩu 1 lần cho cả lô thay vì mỗi vòng lặp; (2) cập nhật
   * sỉ số nhóm 1 lần ở cuối thay vì sau mỗi lần join; (3) email trùng bắt bằng
   * P2002 của Prisma nên không phụ thuộc truy vấn kiểm tra trước đó.
   */
  async addStudentsFromFile(
    listUser: IImportUserRow[],
    password: string,
    manhom: number,
    actorId: string,
  ): Promise<IActionStatus> {
    const actor = await this.requirePermission(actorId, 'update', 'hocphan');
    const group = await this.prisma.nhom.findUnique({
      where: { manhom },
      select: { giangvien: true, trangthai: true },
    });
    if (
      !group ||
      group.trangthai !== 1 ||
      (group.giangvien !== actor.id && actor.manhomquyen !== 3)
    ) {
      throw new ForbiddenException('Bạn không có quyền quản lý nhóm này');
    }
    if (listUser.length === 0 || !password || !manhom) {
      return {
        status: 'error',
        message: 'Dữ liệu, mật khẩu hoặc nhóm không hợp lệ',
      };
    }

    const salt = parseInt(
      this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );
    const hashed = await generatePasswordHash(password, salt);

    const success: string[] = [];
    const exists: string[] = [];
    const errors: string[] = [];

    for (const user of listUser) {
      if (
        !user ||
        typeof user.mssv !== 'string' ||
        typeof user.email !== 'string' ||
        typeof user.fullname !== 'string'
      ) {
        errors.push('Dữ liệu sinh viên không hợp lệ');
        continue;
      }
      const mssv = (user.mssv ?? '').trim();
      const email = (user.email ?? '').trim();
      const fullname = (user.fullname ?? '').trim();
      if (!mssv || !email || !fullname) {
        errors.push(`Dữ liệu không hợp lệ cho MSSV: ${mssv}`);
        continue;
      }

      const account = await this.prisma.nguoiDung.findUnique({
        where: { id: mssv },
        select: { id: true, manhomquyen: true },
      });

      if (account && account.manhomquyen !== 2) {
        errors.push(`Tài khoản ${mssv} không phải sinh viên`);
        continue;
      }

      if (!account) {
        try {
          await this.prisma.nguoiDung.create({
            data: {
              id: mssv,
              email,
              hoten: fullname,
              matkhau: hashed,
              trangthai: 1,
              manhomquyen: 2,
            },
          });
        } catch (err) {
          const code = (err as Prisma.PrismaClientKnownRequestError).code;
          errors.push(
            code === 'P2002'
              ? `Email ${email} đã tồn tại cho MSSV ${mssv}`
              : `Lỗi thêm MSSV ${mssv}`,
          );
          continue;
        }
      }

      const inGroup = await this.prisma.chiTietNhom.findFirst({
        where: { manhom, manguoidung: mssv },
        select: { manguoidung: true },
      });
      if (inGroup) {
        exists.push(mssv);
        continue;
      }
      try {
        await this.prisma.chiTietNhom.create({
          data: { manhom, manguoidung: mssv, hienthi: 1 },
        });
        success.push(mssv);
      } catch {
        errors.push(`Không thể thêm MSSV ${mssv} vào nhóm`);
      }
    }

    if (success.length > 0) {
      const siso = await this.prisma.chiTietNhom.count({ where: { manhom } });
      await this.prisma.nhom.update({ where: { manhom }, data: { siso } });
    }

    let message = '';
    if (success.length > 0) {
      message += `Đã thêm ${success.length} sinh viên thành công. `;
    }
    if (exists.length > 0) {
      message += `Sinh viên đã có trong nhóm: ${exists.join(', ')}. `;
    }
    if (errors.length > 0) {
      message += `Lỗi: ${errors.join(', ')}`;
      return { status: 'error', message: message.trim() };
    }
    return {
      status: 'success',
      message: message.trim() || 'Thêm người dùng thành công!',
    };
  }

  /**
   * POST /user/addFileExcel — tạo tài khoản hàng loạt từ danh sách đã đọc ở
   * `addExcel` (tab "Nhập từ file" của trang Người dùng). Thay
   * `User::addFileExcel` + `NguoiDungModel::addFile`.
   *
   * KHÁC PHP: (1) băm mật khẩu **1 lần** cho cả lô thay vì mỗi vòng lặp;
   * (2) MSSV đã có tài khoản → **bỏ qua** và báo lại (`exists`) thay vì để INSERT
   * chết vì trùng khoá chính; (3) email trùng bắt bằng `P2002` nên không 500;
   * (4) trả `{status,message}` liệt kê rõ đã thêm / đã tồn tại / lỗi, thay vì chỉ
   * `true|false` như PHP (JS cũ chỉ báo "thành công" bất kể kết quả thật).
   * Admin được nhập nhóm quyền cấu hình trong file; người dùng khác chỉ được
   * cấp nhóm giáo viên/sinh viên, không được dùng import để tự cấp đặc quyền.
   */
  async addUsersFromFile(
    listUser: IImportUserRow[],
    password: string,
    actorId: string,
  ): Promise<IActionStatus> {
    const actor = await this.requirePermission(actorId, 'create');
    if (
      actor.manhomquyen !== 3 &&
      listUser.some(
        (user) => user && ![1, 2].includes(Number(user.nhomquyen ?? 2)),
      )
    ) {
      throw new ForbiddenException(
        'Chỉ quản trị viên được cấp nhóm quyền đặc biệt',
      );
    }
    if (listUser.length === 0 || !password) {
      return { status: 'error', message: 'Dữ liệu hoặc mật khẩu không hợp lệ' };
    }

    const salt = parseInt(
      this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );
    const hashed = await generatePasswordHash(password, salt);

    const success: string[] = [];
    const exists: string[] = [];
    const errors: string[] = [];

    for (const user of listUser) {
      if (
        !user ||
        typeof user.mssv !== 'string' ||
        typeof user.email !== 'string' ||
        typeof user.fullname !== 'string'
      ) {
        errors.push('Dữ liệu người dùng không hợp lệ');
        continue;
      }
      const mssv = (user.mssv ?? '').trim();
      const email = (user.email ?? '').trim();
      const fullname = (user.fullname ?? '').trim();
      if (!mssv || !email || !fullname) {
        errors.push(`Dữ liệu không hợp lệ cho MSSV: ${mssv}`);
        continue;
      }

      const account = await this.prisma.nguoiDung.findUnique({
        where: { id: mssv },
        select: { id: true },
      });
      if (account) {
        exists.push(mssv);
        continue;
      }

      try {
        await this.prisma.nguoiDung.create({
          data: {
            id: mssv,
            email,
            hoten: fullname,
            matkhau: hashed,
            trangthai: Number(user.trangthai ?? 1),
            manhomquyen: Number(user.nhomquyen ?? 2),
          },
        });
        success.push(mssv);
      } catch (err) {
        const code = (err as Prisma.PrismaClientKnownRequestError).code;
        errors.push(
          code === 'P2002'
            ? `Email ${email} đã tồn tại cho MSSV ${mssv}`
            : `Lỗi thêm MSSV ${mssv}`,
        );
      }
    }

    let message = '';
    if (success.length > 0) {
      message += `Đã thêm ${success.length} người dùng thành công. `;
    }
    if (exists.length > 0) {
      message += `Đã có tài khoản: ${exists.join(', ')}. `;
    }
    if (errors.length > 0) {
      message += `Lỗi: ${errors.join(', ')}`;
      return { status: 'error', message: message.trim() };
    }
    return {
      status: 'success',
      message: message.trim() || 'Thêm người dùng thành công!',
    };
  }
}
