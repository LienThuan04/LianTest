/**
 * JWT payload cho hệ thi — thay $_SESSION của PHP (user_id, user_role...).
 * manhomquyen dùng cho PermissionsGuard tra bảng chitietquyen. Xem docs/06.
 */
export interface IExamJwtPayload {
  id: string; // nguoidung.id
  email: string;
  hoten: string;
  manhomquyen: number; // nhomquyen.manhomquyen
  roleName: string; // nhomquyen.tennhomquyen
}

/** Danh tính trong req.user: bổ sung avatar hiện tại từ DB ở mỗi request. */
export interface IExamAuthenticatedUser extends IExamJwtPayload {
  avatar: string | null;
}

/**
 * Payload vé khôi phục mật khẩu — thay `$_SESSION['checkMail']` của PHP.
 * Ký bằng JWT, gửi kèm cookie httpOnly ngắn hạn (10 phút).
 * `verified` chỉ bật SAU khi nhập đúng OTP → bước đổi mật khẩu bắt buộc có cờ này.
 */
export interface IRecoveryTicket {
  email: string;
  purpose: 'recover';
  verified: boolean;
  /** HMAC phía server của phiên bản mật khẩu; không chứa hash/OTP thật. */
  passwordVersion: string;
}

/** Shape {status,message} mà signup/recover JS đọc. */
export interface IAuthActionResult {
  status: 'success' | 'error';
  message: string;
}

export interface IExamLoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    hoten: string;
    manhomquyen: number;
    roleName: string;
    avatar: string | null;
  };
}
