# Tài liệu LianTest

[README chính](../README.md) · [README tiếng Việt](../README.vi.md)

Tài liệu mô tả kiến trúc, cách phát triển và vận hành ứng dụng NestJS hiện tại.
Cài đặt, biến môi trường, sơ đồ hoạt động và ảnh giao diện nằm trong README chính.

| Tài liệu                                        | Nội dung                                                 |
| ----------------------------------------------- | -------------------------------------------------------- |
| [Tổng quan](01-tong-quan.md)                    | Tính năng, công nghệ và luồng xử lý                      |
| [Quy ước phát triển](02-quy-uoc-va-cach-lam.md) | Cấu trúc module, route/response, quyền, DB và Git        |
| [Trạng thái dự án](03-tien-do.md)               | Các kiểm chứng đã ghi nhận và phạm vi còn cần kiểm tra   |
| [Kiến trúc và module](04-kien-truc-module.md)   | Cấu trúc mã nguồn, hạ tầng, route và bảng dữ liệu        |
| [Supabase Storage](06-luu-tru-file-supabase.md) | Upload, URL ảnh, avatar và dọn ảnh thay thế              |
| [Phát triển và kiểm thử](07-so-tay-agent.md)    | Quy trình làm việc, fixture và kiểm tra bằng trình duyệt |
| [API hiện tại](../docs_API/README.md)           | Xác thực, nhóm route, nhập Excel và hợp đồng dữ liệu     |
| [Dữ liệu seed](../src/seed-db/data/README.md)   | Bộ JSON, kiểm tra dữ liệu và cách seed                   |
| [Thiết kế giao diện](../DESIGN.md)              | Phong cách và thành phần giao diện                       |

Người mới nên đọc tổng quan → quy ước → kiến trúc. Trước khi sửa một tính năng,
đọc controller/service, EJS và JavaScript liên quan, sau đó chọn kiểm thử phù hợp.
Hướng dẫn dành cho agent ở [CLAUDE.md](../CLAUDE.md).
