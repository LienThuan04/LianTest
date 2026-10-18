# 03 — Trạng thái dự án

[Chỉ mục tài liệu](README.md) · [README tiếng Việt](../README.vi.md)

Cập nhật: **18/10/2026**. Đây là bản ghi trạng thái hiện tại; kết quả kiểm tra bên
dưới chỉ áp dụng cho phạm vi và môi trường được mô tả.

## Chức năng hiện có

Ứng dụng có xác thực/khôi phục mật khẩu, người dùng/RBAC, năm học/môn/chương,
phân công và nhóm học phần, ngân hàng câu hỏi, tạo/giao đề, làm/nộp bài, chấm điểm,
thông báo, thống kê, nhập/xuất Excel và trang in PDF. Chi tiết module/route ở
[kiến trúc](04-kien-truc-module.md) và [tài liệu API](../docs_API/README.md).

Dữ liệu mẫu được đọc từ 11 file JSON ở `src/seed-db/data/`. Startup và CLI dùng
chung loader/validation; seed mặc định tắt. `seed:check` chạy không cần DB sau build.
Sửa JSON không tự cập nhật bản ghi đã tồn tại trong DB.

## Kiểm chứng đã ghi nhận

| Phạm vi                      | Kết quả và điều kiện                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, lint, unit test       | Build/lint đạt; **120/120 unit test**, 9 suite                                                                                                  |
| Khởi động phục vụ ảnh README | Chạy bản build với PostgreSQL/PGlite và Storage fixture riêng; áp 22 migration DB, seed 13 tài khoản                                            |
| Giao diện README             | Đăng nhập Admin/Giáo viên/Sinh viên; chụp landing desktop/mobile, dashboard, ngân hàng câu hỏi và lịch thi sinh viên                            |
| Kiểm tra các trang đã chụp   | Không ghi nhận lỗi JavaScript, ảnh hỏng hoặc tràn ngang tài liệu ở các trang được kiểm tra                                                      |
| Tài liệu                     | README song ngữ, sơ đồ luồng trình duyệt → NestJS → Prisma → PostgreSQL và 5 ảnh giao diện; các hướng dẫn đang dùng có liên kết từ README chính |

Ảnh nằm trong [docs/images/](images/), được nhúng ở README hai ngôn ngữ. Các kiểm
tra này dùng fixture riêng, không xác nhận cấu hình DB/Storage/SMTP triển khai thực tế.

## Phạm vi cần kiểm chứng khi thay đổi

- **E2E nghiệp vụ:** cần PostgreSQL/Storage test riêng, tài khoản và dữ liệu liên
  quan. Chưa chạy lại toàn bộ E2E trong đợt chỉnh tài liệu này; không suy ra kết
  quả E2E từ unit test hoặc ảnh chụp.
- **Thi trên trình duyệt:** cần kiểm tra đầy đủ làm bài, nháp có ảnh, nộp và xem
  kết quả. Luồng này phụ thuộc tài nguyên CDN `idb`/CKEditor; ảnh chụp và kiểm tra
  HTTP không chứng minh đầy đủ hành vi của editor/IndexedDB trên trình duyệt.
- **Dịch vụ bên ngoài:** kiểm tra gửi OTP/email và upload/dọn ảnh bằng cấu hình
  môi trường mục tiêu trước khi triển khai.

Quy trình và lệnh kiểm tra nằm trong [hướng dẫn phát triển và kiểm thử](07-so-tay-agent.md).
