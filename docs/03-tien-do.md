# 03 — Trạng thái dự án

[Chỉ mục tài liệu](README.md) · [README tiếng Việt](../README.vi.md)

Cập nhật: **24/10/2026**. Đây là bản ghi trạng thái hiện tại; kết quả kiểm tra bên
dưới chỉ áp dụng cho phạm vi và môi trường được mô tả.

## Cập nhật chức năng ngày 24/10/2026

- Mở rộng dữ liệu mẫu lên 1.033 tài khoản, 16 môn, 62 chương, 131 nhóm, 3.386 câu hỏi,
  195 đề và 2.052 bài làm; ghi theo lô nhỏ có transaction và log tiến độ.
- Sửa chọn câu tự động khi không lọc chương; khôi phục ảnh nháp theo mã câu hỏi,
  tự nộp khi chuyển tab và cho phép thử lại sau lỗi gửi bài.
- Căn lại bảng lịch thi sinh viên, nút thao tác và ô tìm kiếm; các lệnh trong trang
  dùng nút phù hợp để tránh điều hướng hoặc gửi biểu mẫu ngoài ý muốn.
- Đọc chương dùng đúng quyền chương, giữ kiểm tra phân công môn học.
- Thống kê quản trị viên dùng phạm vi toàn hệ thống theo vai trò hiện tại trong DB;
  các vai trò khác vẫn chỉ xem đề của mình. Tự chọn cặp kỳ/năm có dữ liệu, đồng bộ
  bộ lọc phụ thuộc và bỏ phản hồi cũ khi đổi lựa chọn.

## Chức năng hiện có

Ứng dụng có xác thực/khôi phục mật khẩu, người dùng/RBAC, năm học/môn/chương,
phân công và nhóm học phần, ngân hàng câu hỏi, tạo/giao đề, làm/nộp bài, chấm điểm,
thông báo, thống kê, nhập/xuất Excel và trang in PDF. Chi tiết module/route ở
[kiến trúc](04-kien-truc-module.md) và [tài liệu API](../docs_API/README.md).

Dữ liệu mẫu được đọc từ 11 file JSON ở `src/seed-db/data/`. Startup và CLI dùng
chung loader/validation; seed mặc định tắt. `seed:check` chạy không cần DB sau build.
Sửa JSON không tự cập nhật bản ghi đã tồn tại trong DB.

## Cập nhật ngày 21/10/2026

- Bảng `/question` chia độ rộng theo dữ liệu, giữ ID/độ khó/nút thao tác trên
  một dòng và đồng bộ ẩn/hiện tiêu đề với dữ liệu cột theo kích thước màn hình.
- `.env.example` đã bỏ các biến không còn được code hoặc script sử dụng,
  gồm cấu hình Google OAuth cũ, refresh token, OTP, reset mật khẩu và Redis.
- Hai API `POST /api/v1/email/test-email` và
  `POST /api/v1/email/send-register-otp` yêu cầu đăng nhập qua JWT guard.

Kiểm chứng đợt này: build, ESLint, **120/120 unit test** và **2/2 frontend test**
đạt; template EJS và JavaScript trang câu hỏi hợp lệ. Bố cục bảng đã được kiểm
tra bằng HTML/CSS của ứng dụng và dữ liệu mẫu trong Chrome, gồm nội dung dài,
ID nhiều chữ số và các khung nhìn từ 500px đến 1422px. Chưa chạy lại E2E với
DB/Storage/SMTP thực hoặc kiểm tra phiên đăng nhập trên trang `/question`.

### Tương thích dependency và hướng dẫn triển khai

- Dự án đang dùng NestJS 12; TypeScript được giữ ở `6.0.3` để Nest CLI còn
  sử dụng được compiler API, Prisma CLI đồng bộ `7.10.1` với client/adapter.
- Khai báo `rootDir` rõ ràng, chuyển alias sang đường dẫn tương đối và bỏ
  `baseUrl` đã deprecated trong TypeScript 6.
- Sửa import Swagger sang API công khai, cập nhật kiểu kết quả SMTP của
  Nodemailer 10 và bật VM modules trong các script Jest cho dependency ESM.
- Thêm [hướng dẫn production bằng tiếng Anh](../README.deploy.md) cho Vercel,
  Render, Railway và máy chủ Node.js, gồm biến môi trường, migration, tài nguyên
  runtime và cấu hình duyệt build script pnpm cho CI.
- Thêm `vercel.json` chọn preset NestJS và policy pnpm được duyệt ở
  `deploy/pnpm-build-policy.yaml` để hosted build có thể cài dependency.

Kiểm chứng sau khi chỉnh tương thích: build đạt; chế độ build/watch báo **0 lỗi**;
ESLint đạt; **120/120 unit test** và **2/2 frontend test** đạt. Chưa thực hiện
deployment lên nhà cung cấp hoặc chạy lại E2E với dịch vụ thật trong đợt này.

Sửa cấu hình Vercel: bỏ `functions["src/main.ts"]`, khai báo `framework: "nestjs"`.
Đã tái hiện `unused_function` bằng bộ nhận diện của CLI **64.5.0**, kể cả khi
chọn preset NestJS; cấu hình mới qua bước nhận diện và chọn `@vercel/nestjs`.
README đã đổi Build Command, Output Directory và Install Command về **Default**;
script build chạy `prisma generate && nest build` và đã kiểm tra đạt.

Builder NestJS đi kèm CLI 64.5.0 đã biên dịch và đóng gói được ứng dụng trên
Windows với dependency có sẵn. Bundle thử có đủ 46 file `views/`, chưa có
`src/email/templates/` và `src/seed-db/data/`; cần kiểm tra các tài nguyên này
trên môi trường triển khai. Chưa xác nhận runtime hoặc deployment production.

## Kiểm chứng đã ghi nhận

### Điều tra runtime Vercel ngày 21/10/2026

- Log mới lúc 02:07 báo `Cannot find module '@/app.module'`: Vercel chọn
  `src/main.ts` và biên dịch lại source mà không có bộ chuyển alias của Nest CLI.
- Giữ nguyên import `@/` và cấu hình TypeScript; thêm `outputDirectory: "dist"`
  vào `vercel.json` để Vercel đóng gói `dist/src/main.js` sau `nest build`.
- Regression test tái hiện đúng lỗi alias với cấu hình cũ và nạp được dependency
  của entrypoint cùng metadata DI với cấu hình mới. Native builder đóng gói thành
  công: 6.576 file, đủ 46 view và 3 email template; chưa có JSON seed. Build,
  ESLint, 120 unit test, 2 runtime test, 2 frontend test và smoke HTTP/auth với
  PostgreSQL/PGlite riêng đều đạt. Chưa redeploy production.

- Production đã build đúng commit `6eca7f9`, dùng runtime `nodejs24.x` và đã hết
  `TS5101`. `dist/src/main.js` vẫn là CommonJS, NestJS 12 là ESM.
- `NODE_OPTIONS=--experimental-require-module` có trong cấu hình nguồn nhưng
  chưa có trong Project Settings hoặc danh sách môi trường deployment lúc kiểm tra.
- Giữ alias `baseUrl` theo thay đổi của người dùng, kèm `ignoreDeprecations: "6.0"`.
- Chuỗi npm ci/generate/build, ESLint, 120 unit test, 2 frontend test và regression
  test module đều đạt. Smoke HTTP trên bản compile với PostgreSQL/PGlite riêng đã
  kiểm tra trang public, EJS/static, đăng nhập JWT và trang cần xác thực.
- Hai domain production vẫn trả 500 lúc kiểm tra. Người dùng chọn tự cập nhật
  biến môi trường và redeploy; agent chưa thay đổi môi trường hoặc triển khai.

Chi tiết commit, kiểm thử, giới hạn và các bước thao tác ở
[báo cáo runtime Vercel](vercel-runtime-interop.md).

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

Quy trình và lệnh kiểm tra nằm trong [hướng dẫn phát triển và kiểm thử](06-so-tay-agent.md).
