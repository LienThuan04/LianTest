# CLAUDE.md — Đọc file này ĐẦU TIÊN mỗi phiên

> File này được Claude Code / agent tự nạp vào ngữ cảnh mỗi phiên. Nó là "bộ nhớ"
> đi kèm repo — thay cho trí nhớ cá nhân của agent. **Đọc xong file này + `docs/`
> là bạn hiểu và tiếp tục được dự án mà không quên gì.**

## Dự án này là gì?

Port **hệ thi trắc nghiệm online `DHT_OneTest`** (viết bằng **PHP MVC thuần**) sang
**NestJS SSR** (server render HTML bằng EJS), tái dùng hạ tầng có sẵn của khung
NestJS (PostgreSQL + Prisma, JWT/Passport, guards, interceptors, bcrypt, email).
Giữ **nguyên nghiệp vụ + giao diện** của hệ thi cũ; chỉ đổi công nghệ.

- **Repo này = sản phẩm** (thư mục `NestJS/`, nhánh git `NestJS`).
- **Nguồn PHP hiện tại = `../PHP/`** (repo anh em, **KHÔNG nằm trong repo NestJS**).
  Trên máy cũ tên là `../DHT_OneTest/`; tên này vẫn xuất hiện trong comment lịch sử.
  Xem `docs/05`.
- Tài liệu đầy đủ ở **`docs/`** — đọc `docs/README.md` để biết thứ tự.

> **Mốc mới 2026-10-17:** đã xử lý các lỗi sau bàn giao: Prisma chọn đúng transport
> và xác nhận bằng truy vấn thật, seed mặc định an toàn, entrypoint production,
> e2e không pass giả, nhập câu hỏi Excel, escape preview và dọn ảnh hết tham chiếu.
> Hai file pnpm chỉ lưu local. Xem mục khắc phục 2026-10-17 ở `docs/03` để biết
> kết quả kiểm chứng mới; các mốc 118/118 bên dưới là lịch sử.

## LUẬT CỨNG (vi phạm = làm hỏng quy ước dự án)

1. **Dùng `pnpm`**, KHÔNG `npm`. Cài: `pnpm add <pkg>`; build: `pnpm run build`.
   Theo yêu cầu user 2026-10-17, **`pnpm-lock.yaml` và `pnpm-workspace.yaml` chỉ lưu
   local, không theo dõi Git**. Không tự thêm lại hai file này vào commit.
2. **CSDL = PostgreSQL** (KHÔNG MySQL). Thêm bảng bằng **migration Prisma mới**
   (`npx prisma migrate dev --name ...`), KHÔNG `db pull`. Sau migration:
   `npx prisma generate` rồi `pnpm run build`.
3. **Commit hạt mịn** (1 file/concern), message **tiếng Việt** conventional
   (`feat(exams): ...`). **TUYỆT ĐỐI KHÔNG** thêm `Co-Authored-By` / tên Claude vào
   commit. **Chỉ commit/push khi user yêu cầu.**
4. **Thêm mới (additive)** vào repo — KHÔNG dựng lại module demo nền đã gỡ
   (User/Role/Session…). Hệ thi là stack DUY NHẤT.
5. **Route AJAX** (jQuery `$.post/$.get`) phải `@SkipTransform()` (trả raw JSON/
   mảng/boolean đúng JS gốc). **Route ở path gốc** (vd `/test/...`) phải thêm vào
   `exclude` trong `src/config/app-setup.config.ts` (nếu không sẽ bị prefix `/api/v1`).
6. **Giữ URL cũ** mà JS gốc gọi (KHÔNG đổi sang REST lý tưởng). Bê JS/CSS/view gốc,
   sửa tối thiểu (`./x` → `/x`; trang path sâu thêm `<base href="/">`).
7. **Ảnh lưu Supabase Storage**, DB chỉ lưu **public URL** (KHÔNG blob). Xem `docs/06`.
8. **Bash & PowerShell DÙNG CHUNG cwd.** `cd` ở Bash sang `DHT_OneTest` sẽ khiến
   git chạy nhầm repo → luôn `cd .../NestJS` trước khi git/prisma.

## Kiểm chứng khi làm xong (môi trường có thể KHÔNG có DB local)

- `pnpm run build` phải sạch.
- **`pnpm run lint` phải sạch** (script có sẵn `--fix`). Từ 2026-08-14 toàn dự án
  **0 lỗi/0 cảnh báo** — đừng để tích nợ lại. `eslint.config.mjs` có override tắt
  nhóm `no-unsafe-*` **chỉ cho `test/**`** (supertest khai `res.body: any`);
  trong `src/` rule vẫn bật đủ nên tránh `any`, dùng
  `plainText()`/`errorMessage()` ở `src/common/utils/text.util.ts`.
- Boot `node dist/src/main.js` → xem log `RouterExplorer` "Mapped ... route".
  DB có thể là remote (Prisma Postgres/Supabase) — nếu kết nối được thì seed chạy.

## Trạng thái hiện tại (tóm tắt — chi tiết ở `docs/03`)

Hạ tầng + Phase 1/2/3 **XONG**. Phase 4 (đề thi & làm bài, module lớn nhất) **XONG**:
slice 1–5 (danh sách/tạo-sửa/chọn câu/làm bài SV/chi tiết-kết quả + chấm tự luận);
export PDF/Excel đã làm ở Phase 7. **Phase 5
XONG:** quản lý nhóm học phần GV (`module.php`) + chi tiết nhóm/thành viên
(`class_detail.php`, path `/module`) + **phân công GV↔môn (`assignment.php`, path
`/assignment`)** + **phía SV (`client.php`, path `/client`, module `src/client/`)** —
xem `../docs/11` §4b slice 4. `assignment` MỞ KHOÁ dữ liệu thật (dropdown môn lọc qua
`phancong`). **Phase 6 slice 1 XONG (2026-07-24):** thông báo — module
`src/announcements/` (path `/teacher_announcement`) + chuông thông báo ở header
(`permission.js` + `header.ejs`), mở khoá tab thông báo offcanvas trước đây 404.
**Phase 6 slice 2 XONG (2026-07-26):** thống kê — module `src/statistic/` (path
`/statistic`) thay `statistic.php` + `ThongKeModel.php` (thống kê 1 đề + tổng hợp,
8 thẻ + biểu đồ `chart.js`). **Phase 6 slice 3 XONG (2026-07-27) → PHASE 6 HOÀN TẤT:**
dashboard email onboarding — `src/pages/pages.service.ts` + 3 route
`POST /dashboard/{checkEmail,checkEmailExist,updateEmail}` + modal `#modal-onboarding`
trong `dashboard.ejs` + `public/js/pages/dashboard.js`.
**Phase 7 slice 1 XONG (2026-07-29):** xuất/nhập Excel + in PDF — gói `exceljs`,
helper `src/common/utils/excel.util.ts`, service mới `src/exams/exams-export.service.ts`.
6 route: `module/exportExcelStudentS`, `test/exportExcel`, `test/getMarkOfAllTest`
(MỚI — PHP thiếu action), `test/exportPdf/:makq` (trang HTML tự `window.print()` thay
dompdf), `user/addExcel` + `user/addFileExcelGroup` (đọc `.xlsx`, thêm `.xls` từ
2026-08-14; file mẫu
`public/filemau/danhsachsv_mau.xlsx`). Chi tiết + danh sách "KHÁC PHP": `docs/03`.

**Phase 7 slice 2 XONG (2026-08-04):** seed dữ liệu mẫu nghiệp vụ —
`src/seed-db/seed/exam-demo.data.ts` (dữ liệu thuần) + `exam-demo.seeder.ts`
(`seedExamDemo`/`clearExamDemo`), nối vào `SeedDbService` qua biến **`SEED_DEMO_DATA`**
(mặc định `false`) + script `node scripts/seed-demo.cjs [--clear|--force|--clear-only]`.
Seed ra: 13 người dùng (mật khẩu `123456`), 4 môn + 14 chương, 9 phân công, 3 nhóm học
phần, 38 câu hỏi (mcq/essay/reading), 3 đề thi (1 đang mở thủ công, 1 đang mở tự động,
1 đã kết thúc kèm 4 bài làm mẫu). Đã chạy thật + smoke test HTTP các trang GV/SV.
Chi tiết: `docs/03`.

**Phase 7 slice 3 XONG (2026-08-05) → TẤT CẢ 7 PHASE HOÀN TẤT:** trang lỗi + e2e.
`AllExceptionsFilter` phân nhánh **trình duyệt → HTML / AJAX-API → JSON (shape cũ)**:
401 xoá cookie + redirect `/auth/signin` (thay `AuthCore::checkAuthentication`),
403 → `views/pages/error/page_403.ejs`, 404 → `page_404.ejs` (2 trang bê từ PHP),
còn lại → `page_500.ejs` (MỚI, PHP không có; chi tiết lỗi chỉ hiện khi
`MODE=development`). Log 4xx = WARN gọn, 5xx = ERROR kèm stack. e2e viết lại:
`test/setup-app.ts` (dựng app y `main.ts`, **ép `SEED_DB=false`** để test không đụng
dữ liệu) + `test/error-pages.e2e-spec.ts` — `pnpm run test:e2e` → **10/10 pass**
(cần `DATABASE_URL` sống). Chi tiết: `docs/03`.

**Kiểm chứng 2026-08-07:** đã chạy thật 4 route export trên dữ liệu mẫu (đăng nhập
`gv001`): `module/exportExcelStudentS`, `test/exportExcel`, `test/getMarkOfAllTest`,
`test/exportPdf/:makq` — **đều đúng**, file .xlsx mở lại được, `exportPdf` với `makq`
lạ trả 404. Bảng chi tiết ở `docs/03`.

**Kiểm chứng 2026-08-08:** (1) **nhập SV từ .xlsx** — `user/addExcel` +
`user/addFileExcelGroup` chạy thật qua HTTP, **17/17 ca đúng** (file mẫu, thiếu file,
đuôi `.xls`, dòng hỏng bị bỏ, tạo tài khoản + `chitietnhom` + cập `siso`, lần 2 báo
"đã có trong nhóm", email trùng bắt `P2002`, chỉ cần auth, chưa đăng nhập → 401);
dữ liệu test đã xoá sạch. (2) **e2e luồng nghiệp vụ** — file MỚI
`test/exam-flow.e2e-spec.ts` (18 ca): GV tạo đề thủ công → chọn câu → giao nhóm → SV
vào thi/nộp bài (đúng hết = 10 điểm) → GV xem bảng điểm/thống kê; test chỉ TẠO một đề
riêng và `afterAll` xoá đúng phần đã tạo (KHÔNG dùng `/test/delete` để dọn — route đó
xoá cả thông báo của nhóm). Tổng e2e **28/28 pass**, CSDL trở về nguyên trạng.
⚠️ Chạy 1 bộ: `npx jest --config ./test/jest-e2e.json --testPathPatterns exam-flow`
(cờ `--testPathPattern` cũ đã bị Jest đổi tên). Chi tiết: `docs/03`.

**Kiểm chứng 2026-08-10:** e2e mở rộng — file MỚI `test/exam-auto-essay.e2e-spec.ts`
(19 ca): GV tạo đề **tự động** (`loaide=1`) có câu tự luận → SV làm/nộp → GV **chấm tự
luận** → SV xem lại ở `/client/*` (nhóm học phần + lịch kiểm tra). Tổng e2e
**47/47 pass**, CSDL trở về nguyên trạng. **Tìm & sửa 1 lỗi thật:** điểm **từng câu**
tự luận không được lưu — `test_detail.js` gửi `cau[<macauhoi>]` nhưng `body-parser`
(qs, `arrayLimit = max(100, số tham số)`) biến khoá số nhỏ thành mảng rồi **nén** →
mất macauhoi (400 hoặc `cham_tuluan` rỗng). Sửa: app tạo với **`{ rawBody: true }`**
(`main.ts` + `test/setup-app.ts`) và `saveEssayScoreAction` đọc map điểm thẳng từ body
thô qua `parseScoreMapFromRawBody()` (`src/exams/dto/exam.dto.ts`). Chi tiết: `docs/03`.

**Kiểm chứng 2026-08-11:** e2e Phase 6 — file MỚI `test/announcement-statistic.e2e-spec.ts`
(22 ca) phủ **thông báo** (`/teacher_announcement/*`: gửi/sửa/xoá, phân trang + tìm kiếm
+ lọc, danh sách gộp nhóm, chuông SV `getNotifications`/`getUnreadCount`/`markAsRead`,
chặn GV khác sửa-xoá, SV gửi trộm → 403) và **thống kê** (`/statistic/*`: trang tổng
hợp/chi tiết, `getStatictical`/`getAggregatedStatistical` đối chiếu số liệu **tính lại
độc lập** bằng Prisma, `getFilters`/`getGroupsBySubject`, đề của GV khác → 404/`{error}`,
SV → 403). Giữ nguyên 2 quirk PHP đã port: "Tất cả nhóm" **đếm trùng** theo số nhóm SV
tham gia, và `thong_ke_diem` **bỏ sót điểm đúng 10**. ⚠️ Vì dump gốc chỉ seed quyền
`thongbao`/`thongke` cho **nhóm quyền 3 (Admin)** mà dữ liệu lại của `gv001` (nhóm 1),
test **cấp tạm** các dòng `chitietquyen` còn thiếu cho nhóm 1 rồi **xoá lại đúng những
dòng đã thêm** ở `afterAll`. Tổng e2e **69/69 pass**, CSDL trở về nguyên trạng.
Chi tiết: `docs/03`.

**Kiểm chứng 2026-08-11 (2):** e2e Phase 7 slice 1 — file MỚI `test/excel-pdf.e2e-spec.ts`
(17 ca) phủ **xuất Excel** (`module/exportExcelStudentS`, `test/exportExcel` cả 2 nhánh
lọc nhóm / "tất cả nhóm", `test/getMarkOfAllTest`), **in PDF** (`test/exportPdf/:makq`)
và **nhập SV từ .xlsx** (`user/addExcel` + `user/addFileExcelGroup`). File `.xlsx` trả về
được **đọc ngược lại bằng exceljs** để kiểm nội dung từng ô, không chỉ kiểm `status=true`.
Các ca nhập SV ghi vào một **nhóm học phần tạm** do test tạo rồi xoá, không đụng nhóm mẫu.
Tổng e2e **86/86 pass** (6 bộ) → toàn bộ nghiệp vụ đã có e2e. Chi tiết: `docs/03`.

**Trả nợ Phase 2 XONG (2026-08-13):** "Môn học của tôi" — module MỚI
`src/view-subject/` (path `/view_subject`) thay `view_subject.php` +
`XemMonHocModel.php`: GV xem môn được **phân công** cho mình (lọc năm học/học kỳ +
tìm kiếm) và quản lý **chương** của môn đó (dùng lại `SubjectsService`). 9 route
(`GET /view_subject`; `POST pagination|getTotalPages|getNamHoc|getHocKy|getAllChapter|
addChapter|updateChapter|chapterDelete`) + view `views/pages/view_subject.ejs` + JS
`public/js/pages/view_subject.js`; navbar đổi `/subject` thành "Tạo môn học" và thêm
"Môn học của tôi". KHÁC PHP: nút tìm kiếm nay hoạt động (đọc thêm `filter.input`);
`ORDER BY pc.mamonhoc` (Postgres đòi cột ORDER BY nằm trong select list của SELECT
DISTINCT); bỏ nút "Thêm môn học" chết; chương gate `chuong.*` (KHÔNG dùng `monhoc` vì
nhóm quyền Giáo Viên không có quyền đó). e2e MỚI `test/view-subject.e2e-spec.ts`
(14 ca) → tổng **100/100 pass** (7 bộ), CSDL y nguyên. Chi tiết: `docs/03`.

**Rà soát toàn bộ + bù 4 mảng thiếu (2026-08-13):** đối chiếu action PHP ↔ route
NestJS ↔ URL mà JS gốc gọi → phát hiện & làm nốt: (1) `POST /test/getTestGroup`
(tab "Đề kiểm tra" ở offcanvas nhóm học phần, `class_detail.js` gọi mà chưa có
route); (2) `POST /user/addFileExcel` + nối dây `user.js` (nhập **người dùng** hàng
loạt ở trang Người dùng — trước còn stub); (3) **trang cá nhân `/account`**
(`account_setting.ejs` + đổi mật khẩu/hồ sơ/ảnh đại diện, header hết `href="#"`);
(4) **đăng ký + quên mật khẩu bằng OTP** (`/auth/{signup,recover,otp,changepass}` +
`addUser/sendOptAuth/resendOtpAuth/checkOpt/changePassword`, 4 view + `recover.js`).
⚠️ 3 điểm KHÁC PHP quan trọng: đăng ký KHÔNG dùng lại `/user/add` (route đó nhận
`role` → ai cũng tự tạo được Admin), luồng quên mật khẩu bắt buộc qua OTP (vé JWT
10 phút trong cookie `recover_ticket`, cờ `verified`; PHP chỉ cần session email),
và sửa lỗi `changePassword` của PHP (update theo `id` trong khi truyền email).
Ảnh đại diện lúc đó còn ghi ra `public/media/avatars/` (**đã chuyển sang Supabase
2026-08-14** — xem mục dưới). Bổ sung nốt **`POST /test/getExamineeByGroup`**
(bài làm của 1 đề lọc theo nhóm, kèm email/hoten/avatar — PHP có action nhưng không
JS nào gọi). e2e MỚI `test/auth-account.e2e-spec.ts` (14 ca, **mock `EmailService`**
nên không gửi mail thật) → tổng **114/114 pass** (8 bộ).
Chi tiết + danh sách action PHP cố ý KHÔNG port: `docs/03`.

**Thương hiệu (2026-08-13):** mọi chỗ người dùng nhìn thấy đã đổi **"DHT OnTest" →
"LianHarman"** (13 file: navbar/header/footer/head, landing, dashboard, export_pdf,
5 trang auth, `pages.controller.ts`). Logo 2 tông màu tách thành `Lian` + `Harman`.
Email dùng `APP_NAME` (đã là LianHarman). **Giữ nguyên** chuỗi `DHT_OneTest` trong
comment (đường dẫn mã nguồn PHP gốc) và ràng buộc email đăng ký `@dht.edu.vn`
(quy tắc nghiệp vụ, không phải thương hiệu).

**Trả nốt 2 nợ lẻ (2026-08-14):** (A) **nhập SV/người dùng đọc được cả `.xls` cũ
(BIFF)** — gói `xlsx` (SheetJS, cài từ CDN chính chủ), 2 hàm đọc chung ở
`src/common/utils/excel.util.ts` (`readXlsxSheetRows`/`readXlsSheetRows`),
`UsersService.parseStudentExcel` chỉ rẽ nhánh theo đuôi, 2 view mở lại
`accept=".xlsx,.xls"`. (B) **ảnh đại diện lên Supabase Storage** (thư mục `avatars/`,
cột `avatar` lưu URL, dọn ảnh cũ) — cột này nay có **2 dạng giá trị** (URL mới / TÊN
FILE cũ) nên mọi chỗ render phải dùng helper `avatarSrc()` (server,
`src/common/utils/avatar.util.ts`) hoặc `window.avatarUrl()` (client,
`public/js/avatar-url.js`, nạp ở `partials/head.ejs`) — 12 chỗ đã sửa. e2e
**118/118 pass** (8 bộ). Chi tiết: `docs/03` + `docs/06`.

→ **Việc kế tiếp:** KHÔNG còn hạng mục port nào treo. Ý tưởng tuỳ chọn: nhập câu hỏi
từ Excel ở trang Câu hỏi (nút gốc vẫn `disabled`), migrate ảnh đại diện cũ trong
`public/media/avatars/` lên bucket nếu muốn bỏ hẳn thư mục đó.

✅ **Lỗi DB ETIMEDOUT đã fix** (commit `32e94f23`): `src/prisma/prisma.service.ts`
dùng `datasourceUrl` cho URL Accelerate `prisma+postgres://`, chỉ dùng adapter `pg`
cho `postgres://` trực tiếp. App boot tới `Nest application successfully started`.

**Sau mỗi phiên: cập nhật `docs/03-tien-do.md`** để phiên/agent sau không mất mạch.
