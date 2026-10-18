# 01 — Tổng quan LianTest

[Chỉ mục tài liệu](README.md) · [README tiếng Việt](../README.vi.md)

## Ứng dụng

**LianTest** hỗ trợ quản lý câu hỏi, tổ chức thi trực tuyến và chấm điểm cho
Admin, Giáo viên và Sinh viên. Người tạo là **LianHarman** (`LienThuan04`).

- Quản lý người dùng, nhóm quyền và quyền thao tác động theo tài nguyên.
- Quản lý năm học, học kỳ, môn học, chương, phân công giáo viên và nhóm học phần.
- Ngân hàng câu hỏi trắc nghiệm, tự luận, đọc hiểu; hỗ trợ ảnh và nhập Word/Excel.
- Tạo đề thủ công hoặc tự động theo độ khó, giao đề cho nhóm và quản lý lịch thi.
- Sinh viên làm/nộp bài; chấm tự động và chấm tự luận; xem kết quả, thống kê,
  xuất Excel và trang in để lưu PDF bằng trình duyệt.
- Đăng nhập bằng mã tài khoản, đăng ký sinh viên, khôi phục mật khẩu qua OTP email,
  cập nhật hồ sơ và avatar; thông báo trong hệ thống.

## Công nghệ và luồng xử lý

Backend dùng **NestJS 11/TypeScript**, Express, **EJS SSR**, **Prisma 7/PostgreSQL**,
Passport JWT, bcrypt, guards và DTO validation. Supabase Storage lưu ảnh;
Nodemailer gửi email qua SMTP.

Frontend nằm trong `views/` và `public/`: HTML do EJS render, CSS/Bootstrap/Dashmix,
JavaScript/jQuery và các plugin CKEditor, Select2, SweetAlert2, Chart.js, flatpickr.
Frontend được phục vụ cùng ứng dụng NestJS.

Trình duyệt gửi yêu cầu điều hướng, form hoặc AJAX đến NestJS. Sau bước xác thực,
phân quyền và kiểm tra đầu vào, controller gọi service; service dùng Prisma để
đọc/ghi PostgreSQL. Kết quả được render thành HTML qua EJS hoặc trả JSON cho
JavaScript cập nhật giao diện. Ảnh được tải từ URL public của Storage.
Sơ đồ chi tiết nằm trong [README](../README.vi.md#kiến-trúc-và-luồng-xử-lý).

## Bố trí repo

- `src/`: module nghiệp vụ, hạ tầng, DTO, service và dữ liệu seed.
- `views/`, `public/`: template EJS, tài nguyên tĩnh và JavaScript giao diện.
- `prisma/`: schema và migration cơ sở dữ liệu.
- `test/`: E2E và kiểm tra frontend; unit test nằm cạnh mã nguồn trong `src/`.
- `docs/`, `docs_API/`: hướng dẫn dự án và hợp đồng API.

Xem [quy ước phát triển](02-quy-uoc-va-cach-lam.md),
[kiến trúc module](04-kien-truc-module.md) và [trạng thái kiểm chứng](03-tien-do.md).
