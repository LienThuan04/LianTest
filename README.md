# LianTest — hệ thi trực tuyến NestJS

Phát triển bởi **LianHarman**.

Giao diện mới theo `DESIGN.md` đang có trong working tree, kèm landing public,
demo thi thử độc lập và bộ nhận diện LianTest. Trạng thái kiểm chứng/giới hạn môi
trường ở [docs/14](docs/14-frontend-migration-verification.md); audit media ở
[docs/15](docs/15-media-audit.md). Đợt cập nhật này đi cùng bản refactor seed JSON.

Chuyển hệ `DHT_OneTest` từ PHP MVC sang NestJS SSR, giữ nghiệp vụ và giao diện.
Stack: NestJS 11, EJS/jQuery, PostgreSQL/Prisma 7, JWT/RBAC và Supabase Storage.

Các nhóm chức năng đã triển khai: người dùng/quyền, môn/chương, ngân hàng câu hỏi,
nhập Word/Excel, tạo/giao đề, làm bài/chấm điểm, nhóm học phần, phân công, thông báo,
thống kê, xuất Excel và trang in để lưu PDF.

## Chạy local

```powershell
pnpm install
Copy-Item .env.example .env
# Điền DATABASE_URL, JWT_ACCESS_TOKEN_SECRET, SUPABASE_* và cấu hình email.
# Giữ SEED_DB=false và CLEAR_DB=false khi chạy bình thường.
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm run start:dev
```

Chỉ áp migration vào DB đã chọn cho ứng dụng; dùng DB test riêng khi chạy e2e.
Nguồn PHP để đối chiếu hiện ở thư mục anh em `../PHP/` (máy cũ tên `DHT_OneTest/`).

`DATABASE_URL` hỗ trợ PostgreSQL trực tiếp (`postgres://`, `postgresql://`) hoặc
Prisma Accelerate (`prisma://`, `prisma+postgres://`). App xác minh DB bằng truy vấn
thật trước khi sẵn sàng; không báo kết nối thành công khi chỉ mới tạo pool.

Theo yêu cầu quản lý repo, `pnpm-lock.yaml` và `pnpm-workspace.yaml` chỉ lưu trên
máy, được `.gitignore` và không commit. Vẫn sử dụng pnpm để quản lý gói.

## Build và production

```powershell
pnpm run build
pnpm run start:prod
```

Entrypoint của bản build là `dist/src/main.js`. Các trang nghiệp vụ ở path gốc,
ví dụ `/auth/signin`, `/dashboard`, `/question`, `/test`; Swagger ở `/swagger` khi
`MODE=development`. Ảnh mới cần bucket Supabase public đã cấu hình.

## Seed và kiểm thử

Auto-seed tắt mặc định. Chỉ bật `SEED_DB=true` để chủ động tạo dữ liệu mẫu/quyền;
`CLEAR_DB=true` cho phép xoá trước khi seed và chỉ dùng trên DB có thể bỏ đi.

Dữ liệu mẫu nằm trong **11 file JSON ở [`src/seed-db/data`](src/seed-db/data/README.md)**.
Sửa tài khoản, môn, nhóm, câu hỏi, đề và kết quả mẫu tại đó; hàm seed tự đọc lại và
kiểm tra cấu trúc/tham chiếu trước khi ghi hoặc xóa dữ liệu. Mật khẩu dùng biến
`DEFAULT_PASSWORD` và được hash; không khai mật khẩu trong JSON.

```powershell
pnpm run build
pnpm run seed:check
node scripts/seed-exam.cjs
node scripts/seed-demo.cjs
```

`seed:check` không cần DB. Build một lần khi đổi code; các lần sửa JSON nguồn sau
đó không cần build lại. Có thể đặt `SEED_DATA_DIR` để dùng một bộ JSON riêng. Sửa
JSON không tự cập nhật bản ghi đã có; các quy tắc bỏ qua dữ liệu cũ vẫn giữ nguyên.
Xem hướng dẫn trong thư mục data trước khi dùng tùy chọn clear.

```powershell
pnpm run lint
pnpm test --runInBand
pnpm run test:e2e --runInBand
```

E2e nghiệp vụ cần dữ liệu demo (`gv001`, `sv001`, nhóm, câu hỏi, đề mẫu), DB test
riêng và Storage test. Các ca này tạo dữ liệu tạm rồi tự dọn; lỗi DB/tài khoản/
fixture phải làm test thất bại. Các bộ `app`, `public-pages`, `setup-app` kiểm tra
trang công khai và harness mà không cần kết nối DB.

## Tài liệu

- [Sổ tay tiếp quản](docs/README.md) và [quy ước](CLAUDE.md).
- [Tiến độ, kiểm chứng lịch sử và kết quả mới](docs/03-tien-do.md).
- [Kiến trúc](docs/04-kien-truc-module.md), [ánh xạ PHP](docs/05-anh-xa-va-nguon-php.md).
- [API hiện tại và nhập câu hỏi Excel](docs_API/README.md).
- [Lưu trữ và dọn ảnh](docs/06-luu-tru-file-supabase.md).
