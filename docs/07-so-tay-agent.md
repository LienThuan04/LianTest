# 07 — Sổ tay agent (playbook tiếp quản)

Dành cho agent/người mới clone repo về và muốn **tiếp tục dự án mà không quên gì**.

## A. 5 phút đầu (định hướng)

1. Đọc `../CLAUDE.md` (luật cứng) → `docs/02` (quy ước) → `docs/03` (đang ở đâu).
2. Xác nhận môi trường: `pnpm install`; kiểm `.env` có `DATABASE_URL`, `SUPABASE_*`,
   `LIMIT_UPLOAD_FILE_SIZEMB`. `pnpm run build` phải sạch.
3. Nguồn đối chiếu PHP hiện ở `../PHP/`, trước đây tên `../DHT_OneTest/`.
   Cả 7 phase đã có code; đọc kết quả kiểm chứng mới trong `docs/03` trước khi làm.

## B. Quy trình thêm 1 "slice" (1 nhóm chức năng PHP)

Bám theo cách slice 1–5 của `exams` đã làm:
1. **Đọc nguồn PHP**: controller method + model method + JS trang + view PHP. Ghi ra
   các route JS gọi (URL + method + body).
2. **Schema** (nếu cần bảng mới): sửa `prisma/schema.prisma` → `npx prisma migrate dev
   --name <ten>` → `npx prisma generate`.
3. **Service**: viết logic thay `*Model.php`. Truy vấn phức tạp → `$queryRaw`. Lấy
   `userId` từ JWT. Giữ quirk PHP vô hại (ghi chú `// KHÁC PHP`).
4. **DTO + interfaces**: input (class-validator, form urlencoded) + type trả về.
5. **Controller**: route mỏng. SSR → `@Render('pages/<x>')`; AJAX → `@SkipTransform()`
   + `@Permissions(...)`. Giữ **đúng URL** JS gốc gọi.
6. **Exclude prefix**: thêm mọi route path gốc vào `src/config/app-setup.config.ts`.
7. **View + JS**: port `.php` → `views/pages/<x>.ejs`; bê JS gốc vào
   `public/js/pages/`, đổi `./`→`/`; trang path sâu thêm `<base href="/">`. Bê plugin
   cần thiết vào `public/js/plugins/`.
8. **Ảnh** (nếu có): upload Supabase trước tx, đọc trả URL (xem `docs/06`).
9. **Kiểm**: `pnpm run build` sạch → boot `node dist/src/main.js` xem `Mapped ... route`.
10. **Commit hạt mịn** (tiếng Việt, KHÔNG co-author). **Cập nhật `docs/03-tien-do.md`.**

## C. Kiểm chứng khi không có DB local

- `pnpm run build` (compile) là kiểm chính.
- `pnpm test` chạy unit; `pnpm run test:e2e --testPathPatterns "app|public-pages|setup-app"`
  chạy các kiểm tra công khai/harness không cần DB.
- Các bộ e2e nghiệp vụ cần PostgreSQL test có dữ liệu mẫu và Storage test riêng.
  Thiếu DB, tài khoản hoặc fixture phải FAIL rõ ràng, không được `return` để pass giả.
- `PrismaService` xác nhận kết nối bằng `SELECT 1` trước khi app sẵn sàng.
  Log route mapping chỉ xác nhận routing/DI, không chứng minh nghiệp vụ chạy đúng.
- Khởi động thông thường tắt `SEED_DB`/`CLEAR_DB`. Không seed/clear DB chứa dữ liệu cần giữ.

## D. Bẫy hay gặp (đã dính)

- **Quên exclude prefix** → route path gốc bị `/api/v1`, JS gốc 404.
- **Quên `@SkipTransform`** → AJAX bị bọc `{statusCode,message,data}`, JS gốc vỡ.
- **Trang path sâu thiếu `<base href="/">`** → `pagination.js` gọi sai URL.
- **`npm install`** tạo `package-lock.json` rác → chỉ dùng **pnpm**.
- **`cd` Bash sang DHT_OneTest** → git PowerShell chạy nhầm repo. Luôn về `.../NestJS`.
- **Upload ảnh trong `$transaction`** → risk timeout. Upload TRƯỚC tx.
- **BigInt** từ `COUNT(*)` → dùng `::int`.
- **Dữ liệu rỗng** khi test là do thiếu `phancong`/`giaodethi`/`nhom` (xem `docs/03`
  §Phụ thuộc dữ liệu), KHÔNG phải bug.
- **Commit lẫn `dashmix.app.min.js`** (vendored, build tự đổi) — bỏ ra khỏi commit.

## E. Khi kết thúc phiên (BẮT BUỘC)

1. `pnpm run build` sạch.
2. Commit hạt mịn (nếu user yêu cầu commit/push).
3. **Cập nhật `docs/03-tien-do.md`**: đã làm gì, route mới, còn gì, quirk mới. Nếu
   đổi quy ước → cập nhật `docs/02`. Nếu thêm cơ chế hạ tầng → thêm/ sửa doc tương ứng.
4. Đây là cách duy nhất để phiên/agent sau (kể cả khi mất trí nhớ máy) đọc repo là
   tiếp tục được y như cũ.
