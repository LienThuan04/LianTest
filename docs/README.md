# docs/ — Sổ tay dự án (đọc để tiếp quản)

Bộ tài liệu **tự chứa** giúp bất kỳ agent/người nào clone repo về là hiểu được dự
án và **tiếp tục làm mà không quên gì**. Đây là "bộ nhớ dài hạn" đi kèm mã nguồn.

> Bắt đầu ở `../CLAUDE.md` (luật cứng + định hướng nhanh), rồi đọc theo thứ tự dưới.

| # | File | Nội dung |
|---|------|----------|
| 00 | [README.md](./README.md) | (file này) chỉ mục & cách dùng |
| 01 | [01-tong-quan.md](./01-tong-quan.md) | Dự án là gì, nguồn PHP ở đâu, stack, mục tiêu |
| 02 | [02-quy-uoc-va-cach-lam.md](./02-quy-uoc-va-cach-lam.md) | **Cách làm & quy ước bắt buộc** (quan trọng nhất) |
| 03 | [03-tien-do.md](./03-tien-do.md) | **Tiến độ chi tiết** (living doc — cập nhật mỗi phiên) |
| 04 | [04-kien-truc-module.md](./04-kien-truc-module.md) | Cấu trúc `src/`, module, route inventory, hạ tầng |
| 05 | [05-anh-xa-va-nguon-php.md](./05-anh-xa-va-nguon-php.md) | Ánh xạ PHP↔NestJS, nơi có nguồn PHP, RBAC seed |
| 06 | [06-luu-tru-file-supabase.md](./06-luu-tru-file-supabase.md) | Lưu ảnh trên Supabase Storage (DB chỉ lưu URL) |
| 07 | [07-so-tay-agent.md](./07-so-tay-agent.md) | **Playbook**: các bước tiếp quản, thêm slice, bẫy hay gặp |
| 13 | [13-frontend-ui-audit.md](./13-frontend-ui-audit.md) | Inventory 32 template và baseline trước migration |
| 14 | [14-frontend-migration-verification.md](./14-frontend-migration-verification.md) | **Checkpoint frontend mới nhất**, kiểm chứng và giới hạn môi trường |
| 15 | [15-media-audit.md](./15-media-audit.md) | Nhận diện LianTest, asset mới và danh sách dọn media |
| Seed | [Hướng dẫn dữ liệu JSON](../src/seed-db/data/README.md) | Tùy chỉnh 11 file seed, quan hệ dữ liệu, kiểm tra và chạy seed |

## Quy tắc vàng cho agent tiếp quản

1. Đọc `../CLAUDE.md` + `02` + `03` trước khi gõ dòng code nào.
2. Trước khi tìm/sửa 1 tính năng: xem `03` (đã port chưa?) + `05` (nguồn PHP ở đâu).
3. Làm theo đúng `02` (SkipTransform, exclude prefix, giữ URL cũ, Supabase URL…).
4. **Kết thúc phiên: cập nhật `03-tien-do.md`** (đánh dấu đã làm gì, còn gì) — đây là
   cách giữ mạch cho phiên/agent sau. Nếu đổi quy ước → cập nhật `02`.
5. Commit hạt mịn, tiếng Việt, KHÔNG co-author. Chỉ commit/push khi user yêu cầu.
