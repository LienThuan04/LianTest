# LianTest media audit

Ngày: 2026-10-18, Asia/Ho_Chi_Minh. Phạm vi: `NestJS/public/media`.

Yêu cầu: xóa file không dùng, thay các asset giao diện đang dùng bằng một bộ nhận
diện riêng. Tên website là **LianTest**, người tạo vẫn là **LianHarman**.

## Nhận diện

Theo thiết kế light đã duyệt trong `DESIGN.md`: indigo `#4255ff`, nền trắng/lilac,
nét mảnh, giấy thi và dấu tích. Logo là chữ L kèm dấu tích; không dùng logo X,
ảnh stock, nhân vật hoạt họa hay gradient cũ. SVG được vẽ riêng bằng mã vector;
favicon/avatar raster xuất từ cùng mẫu vector bằng Chrome headless. Không thêm
dependency hoặc lấy hình từ dịch vụ bên ngoài.

| Asset | Vai trò |
|---|---|
| `favicons/favicon.svg` | Logo trên landing/auth/sidebar/footer và favicon SVG |
| `favicons/favicon.png` | Favicon PNG 32×32 |
| `favicons/favicon-192x192.png` | Favicon PNG 192×192 |
| `favicons/apple-touch-icon-180x180.png` | Apple touch icon 180×180 |
| `avatars/ANHSV.png` | Avatar trung tính mới, giữ tên file tương thích dữ liệu cũ |
| `avatars/avatar2.jpg` | Avatar dự phòng mới; sửa trường hợp mặc định trước đây bị 404 |
| `svg/empty-state.svg` | Chưa có nội dung/nhóm, dùng chung ở EJS và HTML do JS sinh |
| `svg/awaiting-review.svg` | Chờ chấm tự luận, thay `ChamDiem.gif` |

Giữ thêm một ảnh cá nhân trong `avatars/` vì tên file đang được dữ liệu PHP mẫu
tham chiếu. Đây là nội dung người dùng, không phải asset nhận diện để vẽ đè hoặc
xóa theo kết quả tìm literal trong source. URL avatar bên ngoài cũng giữ nguyên.

## Dọn file

- Xóa 13 file quảng bá/background không còn được dùng trong `various/`, rồi bỏ
  thư mục rỗng.
- Xóa `svg/google-icon.svg`, `svg/no-data.jpg`, `svg/empty_data.png` và
  `avatars/ChamDiem.gif`; mọi nơi dùng hai file sau đã chuyển sang SVG mới.
- Tổng: **17 file cũ**, **5.448.629 byte**. Sau thay thế còn **9 file**, gồm 8
  asset giao diện và 1 ảnh người dùng cần giữ.
- Trước khi xóa: đối chiếu EJS, source TypeScript, JS trang, CSS, script và test;
  từng đường dẫn tuyệt đối phải nằm trong `public/media` và là file thường.
  Không xóa đệ quy hoặc sửa DB/bucket.
- Sửa avatar fallback ở bảng chấm bài: dùng `avatar2.jpg` thay đường dẫn ảnh admin
  không tồn tại; không đổi dữ liệu avatar của tài khoản.

## Kiểm chứng

- Kiểm tra tham chiếu ảnh tĩnh: **0 đường dẫn hỏng** sau dọn.
- Favicon PNG/ảnh đại diện có đúng định dạng và kích thước; SVG và raster mới đã
  được mở kiểm tra. Trình duyệt tải được cả 4 nhóm asset mới.
- Preview nhận diện và bằng chứng local: `../../.codegraph/browser-qa/asset-theme.png`.
- Manifest xóa/giữ/kích thước: `../../.codegraph/media-audit.json`.
- Hồi quy/QA tổng thể được cập nhật tại [14-frontend-migration-verification.md](./14-frontend-migration-verification.md).

Bộ asset này đi cùng bản migration giao diện LianTest. User đã yêu cầu commit/push
toàn bộ phần hoàn thành ngày 2026-10-18; các bằng chứng kiểm chứng vẫn lưu local.
