# Hướng dẫn làm việc với LianTest

LianTest là ứng dụng thi trực tuyến dùng NestJS/TypeScript, EJS SSR và PostgreSQL/Prisma.
Người tạo: **LianHarman** (`LienThuan04`). Bắt đầu từ [README tiếng Việt](README.vi.md)
và [chỉ mục tài liệu](docs/README.md).

## Quy ước dự án

1. Dùng **pnpm** để quản lý gói. Theo quy ước repo, `pnpm-lock.yaml` và
   `pnpm-workspace.yaml` chỉ lưu local, không thêm lại vào Git.
2. CSDL là **PostgreSQL**. Thay đổi schema bằng migration Prisma mới;
   không dùng `db pull`. Sau khi sửa schema, sinh Prisma client rồi build.
3. Controller xử lý HTTP/DTO/quyền; service chứa nghiệp vụ và truy vấn Prisma.
   Lấy danh tính từ JWT (`req.user`), không tin mã người dùng do client gửi để cấp quyền.
4. Giữ hợp đồng URL và response mà giao diện đang sử dụng. Route AJAX dùng
   `@SkipTransform()` để trả raw JSON; SSR dùng `@Render()` và không bị bọc response.
   Route ở path gốc cần `VERSION_NEUTRAL` và được loại khỏi prefix `/api/v1`
   trong `src/config/app-setup.config.ts`.
5. Ảnh upload lưu ở **Supabase Storage public bucket**, DB lưu URL. Upload trước
   transaction; chỉ dọn ảnh thay thế sau khi DB ghi thành công và hết tham chiếu.
   Xem [hướng dẫn Storage](docs/06-luu-tru-file-supabase.md).
6. Dữ liệu mẫu ở `src/seed-db/data/*.json`; không thêm mảng seed hardcode trong TS.
   Đọc [hướng dẫn seed](src/seed-db/data/README.md) trước khi sửa.
   `SEED_DB=false`, `CLEAR_DB=false`, `SEED_DEMO_DATA=false` khi chạy thông thường.
7. Chạy lệnh Git, Prisma và ứng dụng tại thư mục gốc repo `NestJS/`.
   Không đưa `.env`, thông tin xác thực, dữ liệu test hoặc thay đổi vendor ngoài ý muốn vào commit.
8. Commit theo từng nội dung, message conventional bằng **tiếng Việt**;
   không thêm `Co-Authored-By`. Chỉ commit/push khi người dùng yêu cầu.

## Kiểm chứng và bàn giao

- Các lệnh chính: `pnpm run build`, `pnpm run lint`, `pnpm test --runInBand`.
  Script lint có `--fix`; kiểm tra diff sau khi chạy.
- `pnpm run start:prod` chạy `node dist/src/main.js` từ gốc repo.
  Cần cấu hình DB/JWT/Storage/SMTP; Prisma chạy `SELECT 1` trước khi app sẵn sàng.
- E2E nghiệp vụ cần DB/Storage test riêng và đủ fixture. Không bỏ qua test để che
  điều kiện tiên quyết bị thiếu. Log route mapping không chứng minh nghiệp vụ đúng.
- Khi thay đổi giao diện, kiểm tra trang liên quan trên desktop/mobile và các request
  phát sinh. Xem [hướng dẫn phát triển và kiểm thử](docs/07-so-tay-agent.md).
- Cập nhật [trạng thái dự án](docs/03-tien-do.md) với kết quả thực tế và phần chưa
  kiểm chứng; cập nhật tài liệu liên quan khi thay đổi hợp đồng hoặc cấu hình.
