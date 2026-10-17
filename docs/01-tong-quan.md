# 01 — Tổng quan

## Dự án là gì

Chuyển hệ **Thi Trắc Nghiệm Online `DHT_OneTest`** (đồ án web) từ **PHP MVC thuần**
sang **NestJS SSR**. Sản phẩm cuối là repo này (`NestJS/`), giữ nguyên nghiệp vụ +
giao diện của hệ thi cũ, chỉ đổi nền công nghệ để chuẩn hơn (typed, an toàn SQL,
JWT chuẩn, RBAC bằng guard/decorator).

Tính năng hệ thi (nghiệp vụ cần port):
- Người dùng (Admin/Giáo viên/Sinh viên) + phân quyền động (RBAC theo bảng quyền).
- Môn học → chương → **câu hỏi** (mcq / tự luận `essay` / đọc hiểu `reading`) → đáp án.
- **Tạo đề** (thủ công chọn câu / tự động random theo độ khó), giao đề cho nhóm lớp.
- SV **vào thi → làm bài → nộp**, chấm tự động (mcq/đọc hiểu) + **chấm tay tự luận**.
- **Thống kê** kết quả, xuất Excel và trang in để lưu PDF bằng trình duyệt.
- Đăng nhập mã tài khoản/mật khẩu, đăng ký sinh viên và quên mật khẩu qua OTP email.
  Google OAuth/refresh token của khung BaseAuth cũ không thuộc luồng hiện tại.

## Bối cảnh thư mục (QUAN TRỌNG)

Workspace hiện tại:

```
DoAnHP_WEB-ontest-DHT/
├── .codegraph/   ← chỉ mục code dùng chung, dữ liệu local
├── PHP/          ← nguồn PHP MVC, repo Git riêng
└── NestJS/       ← sản phẩm chuyển đổi, nhánh Git `NestJS`
```

- Repo NestJS không chứa nguồn PHP. Máy cũ gọi nguồn này là `DHT_OneTest/`;
  các đường dẫn đó trong ghi chú lịch sử tương ứng với `../PHP/` ở workspace này.
- Cả 7 phase đã có triển khai; kiểm chứng hiện tại và thay đổi sau bàn giao được
  ghi ở `docs/03-tien-do.md`. Việc có code không thay thế kết quả kiểm thử mới.

## Stack thực tế

- NestJS 11, TypeScript, **Prisma 7 + PostgreSQL** (DB có thể là Prisma Postgres/
  Supabase remote — xem `.env`), Passport JWT, bcrypt, throttler,
  Swagger, Multer, Nodemailer, **EJS** (SSR), **@supabase/supabase-js** (lưu file).
- Frontend: theme Dashmix (Bootstrap) + jQuery + CKEditor + Select2 + SweetAlert2 +
  Chart.js + flatpickr — **bê nguyên từ PHP**, để trong `public/`, sửa tối thiểu.

## Mục tiêu & nguyên tắc

1. Giữ nguyên nghiệp vụ + UI hệ thi cũ.
2. Bám đúng quy ước khung NestJS (module/service/dto/interface, guard, response).
3. SSR bằng EJS qua `@Render()`; AJAX trả raw JSON (`@SkipTransform`).
4. An toàn hơn PHP: Prisma (chống SQLi), JWT (thay cookie-token tự chế), RBAC guard.
5. **Không dịch 1-1 mù quáng**: SQL nối chuỗi / logic trong controller PHP → nắn về
   đúng tầng (controller mỏng → service → prisma). Giữ quirk PHP khi vô hại (ghi chú).

→ Cách làm & quy ước chi tiết: [02-quy-uoc-va-cach-lam.md](./02-quy-uoc-va-cach-lam.md).
