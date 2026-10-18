# 02 — Cách làm & quy ước bắt buộc

Đây là "tinh thần" của dự án. Làm sai những điều này = phá vỡ tính nhất quán và có
thể làm hỏng hành vi so với bản PHP gốc. (Tóm tắt luật cứng ở `../CLAUDE.md`.)

## 1. Quyết định nền tảng (đã chốt)

| Vấn đề | Quyết định | Ghi chú |
|--------|-----------|---------|
| CSDL | **PostgreSQL** (KHÔNG MySQL) | Tái dùng hạ tầng khung NestJS. Bảng mới = **migration Prisma**, KHÔNG `db pull`. |
| Stack nền demo | **Đã gỡ hẳn** (User/Role/Session/File…) | Hệ thi là stack DUY NHẤT. `JwtStrategy` ở `exam-auth/passport/`. Role hệ thi = `src/roles/` (NhomQuyen). |
| View engine | **EJS** (`@Render`) | View ở `views/pages/*.ejs`, partial ở `views/partials/`. |
| Lưu file/ảnh | **Supabase Storage**, DB lưu **public URL** | Xem [06](./06-luu-tru-file-supabase.md). |
| Quản lý gói | **pnpm** | `pnpm-lock.yaml`/`pnpm-workspace.yaml` chỉ lưu local theo yêu cầu user; KHÔNG `npm install`. |

## 2. Quy ước port (theo NGHIÊM NGẶT)

1. **Additive** vào repo — KHÔNG dựng lại module demo nền đã gỡ.
2. **AJAX route** (jQuery gọi) → `@SkipTransform()` để trả **raw** (mảng/object/
   boolean) đúng shape JS gốc, KHÔNG bọc `{statusCode,message,data}` của
   `TransformInterceptor`.
3. **Route path gốc** (vd `/test/...`, `/question/...`) dùng
   `@Controller({ path, version: VERSION_NEUTRAL })` VÀ phải thêm vào mảng
   `exclude` trong `src/config/app-setup.config.ts` — nếu không sẽ bị prefix
   `/api/v1` và JS gốc gọi 404.
4. **Giữ URL cũ** mà JS gốc gọi (vd `/test/start/:made`, `/question/pagination`).
   KHÔNG đổi sang REST lý tưởng. Mục tiêu: bê JS/CSS/view gốc, sửa tối thiểu.
5. **JS gốc bê nguyên**, chỉ đổi URL tương đối `./x` → `/x`. Trang ở **path sâu**
   (vd `/test/detail/:made`) thêm **`<base href="/">`** trong `<head>` để
   `pagination.js` (dùng `./controller/...`) resolve về gốc.
6. **Truy vấn phức tạp** (STRING_AGG/GROUP_CONCAT, UNION, GROUP BY, JOIN nhiều
   bảng) → **`prisma.$queryRaw`** với `Prisma.sql`. CRUD đơn giản → Prisma client.
   Dùng `COUNT(*)::int` để tránh BigInt.
7. **An toàn hơn PHP:** `userId` lấy từ **JWT** (`req.user`), KHÔNG tin
   `args.id`/`$_POST` client gửi. Search/filter tham số hoá (chống SQLi).
8. **Giữ quirk PHP** khi vô hại — ghi chú `// KHÁC PHP` hoặc `// QUIRK` trong code
   để hành vi khớp bản gốc; sửa những chỗ rõ ràng là lỗi (vd search bị bỏ ràng buộc).
9. **Thời gian**: trả **ISO** (`toISOString`) cho đếm ngược / so sánh tuyệt đối.
10. **Ảnh**: upload lên Supabase → lưu **URL**; đọc trả thẳng URL. Xem [06](./06-luu-tru-file-supabase.md).

## 3. Khung 1 module nghiệp vụ

```
src/<module>/
├── <module>.module.ts       khai báo (PrismaModule tự có qua @Global; StorageModule @Global)
├── <module>.controller.ts    route MỎNG (@Render cho SSR, @SkipTransform cho AJAX)
├── <module>.service.ts       logic + Prisma (thay *Model.php)
├── dto/                       class-validator (form urlencoded → ép kiểu)
└── interfaces/                types trả về (I...)
```
Đăng ký module vào `src/app.module.ts`. Gắn `@Permissions('<chucnang>','<hanhdong>')`
theo bảng quyền (xem [05](./05-anh-xa-va-nguon-php.md)). Guard mặc định = cần đăng nhập;
`@Public()` cho route khách.

## 4. Lệnh & quy trình

```bash
# LUÔN đứng ở thư mục NestJS trước khi git/prisma (Bash & PowerShell chung cwd!)
pnpm install                 # cài deps
pnpm add <pkg>               # thêm gói (KHÔNG npm)
npx prisma migrate dev --name <ten>   # tạo + áp migration (cần DB)
npx prisma migrate deploy    # áp migration đang chờ (deploy/CI)
npx prisma generate          # sinh lại client sau khi đổi schema
pnpm run build               # build (BẮT BUỘC kiểm sau mỗi thay đổi)
node dist/src/main.js        # boot: xem log "Mapped ... route"
```

- **Bash & PowerShell DÙNG CHUNG cwd.** `cd` ở Bash sang `DHT_OneTest` sẽ làm lệnh
  git PowerShell chạy nhầm repo → luôn về `.../NestJS` trước khi git/prisma.
- Môi trường có thể **không có DB local** — kiểm bằng `pnpm run build` + route
  mapping trong log boot. DB thật có thể là remote (Prisma Postgres/Supabase).
- `pnpm run start:prod` chạy `node dist/src/main.js`. Prisma chọn driver theo URL
  và chạy `SELECT 1` trước khi báo kết nối thành công; DB không truy cập được thì
  startup thất bại. Không coi log route mapping là bằng chứng nghiệp vụ chạy đúng.
- Khởi động thông thường dùng `SEED_DB=false`, `CLEAR_DB=false`. Chỉ chuỗi chính xác
  `CLEAR_DB=true` mới cho phép xoá trước khi seed; luôn dùng DB test riêng cho e2e.
- Dữ liệu seed chỉnh tại `src/seed-db/data/*.json`, không hardcode thêm mảng TS.
  Sau build chạy `pnpm run seed:check` để kiểm tra không cần DB; đọc hướng dẫn
  `src/seed-db/data/README.md` về mã tham chiếu và hành vi khi DB đã có dữ liệu.

## 5. Git

- **Commit hạt mịn** (1 file/concern). Message **tiếng Việt** conventional:
  `feat(exams): ...`, `chore(config): ...`, `feat(prisma): ...`.
- **TUYỆT ĐỐI KHÔNG** `Co-Authored-By` / tên Claude trong commit message.
- **Chỉ commit/push khi user yêu cầu.** Nhánh làm việc = `NestJS`.
- File vendored (vd `public/js/dashmix.app.min.js`) đôi khi bị build đổi — KHÔNG
  commit lẫn vào commit nghiệp vụ nếu không phải mình sửa.
