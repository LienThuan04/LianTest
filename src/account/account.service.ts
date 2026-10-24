import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { PrismaService } from '@/prisma/prisma.service';
import { SupabaseStorageService } from '@/storage/supabase-storage.service';
import { removeUnreferencedImages } from '@/storage/image-cleanup';
import { comparePassword, generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import { avatarSrc, DEFAULT_AVATAR } from '@/common/utils/avatar.util';
import type {
  IAccountActionResult,
  IProfileView,
} from '@/account/interfaces/account.types';

/** Đuôi ảnh hợp lệ — y `$validImageExtension` của NguoiDungModel::uploadFile. */
const VALID_AVATAR_EXT = ['.jpg', '.jpeg', '.png'];

/**
 * Nghiệp vụ trang cá nhân — thay account.php + phần hồ sơ của NguoiDungModel
 * (getById/checkPassword/changePassword/updateProfile/uploadFile/getRole).
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /**
   * Bản đồ quyền của 1 nhóm: { chucnang: [hanhdong, ...] } — thay
   * NguoiDungModel::getRole() (PHP lưu vào $_SESSION['user_role']).
   * permission.js dùng map này để ẩn/hiện nút theo data-role/data-action.
   */
  async getRoleMap(manhomquyen: number): Promise<Record<string, string[]>> {
    const rows = await this.prisma.chiTietQuyen.findMany({
      where: { manhomquyen },
      select: { chucnang: true, hanhdong: true },
    });
    const map: Record<string, string[]> = {};
    for (const { chucnang, hanhdong } of rows) {
      (map[chucnang] ??= []).push(hanhdong);
    }
    return map;
  }

  /** Hồ sơ để render trang `/account` — thay NguoiDungModel::getById(). */
  async getProfile(id: string): Promise<IProfileView | null> {
    const user = await this.prisma.nguoiDung.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        hoten: true,
        gioitinh: true,
        ngaysinh: true,
        avatar: true,
        manhomquyen: true,
      },
    });
    if (!user) return null;
    return {
      ...user,
      // Ô flatpickr đọc chuỗi `Y-m-d` (cột là DATE nên cắt phần giờ là đủ).
      ngaysinh: user.ngaysinh ? user.ngaysinh.toISOString().slice(0, 10) : '',
      avatar: user.avatar || DEFAULT_AVATAR,
      avatarUrl: avatarSrc(user.avatar),
    };
  }

  /**
   * POST /account/changePassword — đổi mật khẩu của chính mình.
   * Thay Account::changePassword: sai mật khẩu cũ → `valid:false` kèm thông báo.
   */
  async changePassword(
    id: string,
    matkhaucu: string,
    matkhaumoi: string,
  ): Promise<IAccountActionResult> {
    const user = await this.prisma.nguoiDung.findUnique({
      where: { id },
      select: { matkhau: true },
    });
    if (!user?.matkhau) {
      return { valid: false, message: 'Mật khẩu hiện tại không đúng.' };
    }

    const ok = await comparePassword(matkhaucu, user.matkhau);
    if (!ok) {
      return { valid: false, message: 'Mật khẩu hiện tại không đúng.' };
    }

    const salt = parseInt(
      this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );
    try {
      await this.prisma.nguoiDung.update({
        where: { id },
        data: { matkhau: await generatePasswordHash(matkhaumoi, salt) },
      });
      return { valid: true, message: 'Thay đổi mật khẩu thành công!' };
    } catch (err) {
      this.logger.error('Đổi mật khẩu thất bại', err as Error);
      return {
        valid: false,
        message: 'Lỗi khi cập nhật mật khẩu. Vui lòng thử lại.',
      };
    }
  }

  /**
   * POST /account/changeProfile — cập nhật họ tên/email/giới tính/ngày sinh.
   * Thay Account::changeProfile + NguoiDungModel::updateProfile.
   *
   * Giữ nguyên hành vi PHP: đổi sang email đã có người dùng khác → từ chối;
   * ngày sinh rỗng → mặc định `2004-01-01`.
   * KHÁC PHP: so email cũ lấy từ CSDL (PHP so với `$_SESSION['user_email']`),
   * và bắt P2002 để không 500 khi có race condition.
   */
  async changeProfile(
    id: string,
    hoten: string,
    email: string,
    ngaysinh?: string,
    gioitinh?: string,
  ): Promise<IAccountActionResult> {
    const other = await this.prisma.nguoiDung.findUnique({
      where: { email },
      select: { id: true },
    });
    if (other && other.id !== id) {
      return { valid: false, message: 'Địa chỉ email đã tồn tại !' };
    }

    try {
      await this.prisma.nguoiDung.update({
        where: { id },
        data: {
          hoten,
          email,
          gioitinh: gioitinh != null ? Boolean(Number(gioitinh)) : false,
          ngaysinh: new Date(ngaysinh || '2004-01-01'),
        },
      });
      return { valid: true, message: 'Thay đổi hồ sơ thành công !' };
    } catch (err) {
      this.logger.error('Cập nhật hồ sơ thất bại', err as Error);
      return { valid: false, message: 'Cập nhật hồ sơ thất bại !' };
    }
  }

  /**
   * POST /account/uploadFile — lưu ảnh đại diện mới, trả `true|false` y PHP
   * (account_setting.js chỉ `console.log` kết quả).
   *
   * Thay NguoiDungModel::uploadFile. **Ảnh đẩy lên Supabase Storage** (thư mục
   * `avatars/`) và cột `avatar` lưu **URL đầy đủ** — như ảnh câu hỏi, xem
   * `docs/06`. Nhờ vậy triển khai trên hạ tầng ephemeral (container không gắn
   * volume) không mất ảnh. Ảnh CŨ dạng TÊN FILE trong `public/media/avatars/`
   * (dữ liệu seed / bản PHP) vẫn hiển thị được nhờ `avatarSrc()` phía server và
   * `avatarUrl()` phía client.
   * KHÁC PHP: chỉ nhận đúng đuôi .jpg/.jpeg/.png; tên file trên storage do
   * SupabaseStorageService sinh ngẫu nhiên (tên gốc có thể chứa `../`).
   */
  async uploadAvatar(id: string, file?: Express.Multer.File): Promise<boolean> {
    if (!file?.buffer?.length) return false;

    const ext = extname(file.originalname || '').toLowerCase();
    if (!VALID_AVATAR_EXT.includes(ext)) return false;

    const uploadedImages: string[] = [];
    try {
      const url = await this.storage.uploadImage(file.buffer, 'avatars');
      if (!url) return false;
      uploadedImages.push(url);

      const cu = await this.prisma.nguoiDung.findUnique({
        where: { id },
        select: { avatar: true },
      });
      await this.prisma.nguoiDung.update({
        where: { id },
        data: { avatar: url },
      });
      // Dọn ảnh cũ trên storage (bỏ qua nếu là tên file cũ trên đĩa).
      await removeUnreferencedImages(
        this.prisma,
        this.storage,
        [cu?.avatar],
        this.logger,
      );
      return true;
    } catch (err) {
      this.logger.error('Lưu ảnh đại diện thất bại', err as Error);
      return false;
    } finally {
      await removeUnreferencedImages(
        this.prisma,
        this.storage,
        uploadedImages,
        this.logger,
      );
    }
  }
}
