# 03 — Tiến độ (LIVING DOC — cập nhật mỗi phiên)

> Cập nhật gần nhất: **2026-10-18** (seed JSON; frontend, LianTest và media). Đây là "sổ tay tiến độ" — mỗi phiên làm xong
> nhớ sửa file này (đánh dấu đã làm gì, còn gì) để phiên/agent sau không mất mạch.

## Checkpoint seed JSON 2026-10-18

Theo yêu cầu user, toàn bộ dữ liệu mẫu đã chuyển vào **11 file JSON tại
`src/seed-db/data`**; bỏ hai file mảng hardcode `exam-sample.ts` và
`exam-demo.data.ts`. Hướng dẫn trường dữ liệu, ví dụ chỉnh tài khoản, quan hệ giữa
các file và cách chạy ở [README của data](../src/seed-db/data/README.md).

- Loader đọc lại JSON mỗi lần chạy; kiểm tra kiểu, trường, mã trùng, tham chiếu,
  đáp án, số câu tự động, giới hạn Int32/Decimal và ngày giờ **trước ghi/clear**.
  Một mốc giờ được dùng chung từ preflight đến ghi đề/bài làm. Mã môn/chương chứa
  dấu `#` không còn có thể trùng khóa tra cứu.
- `seedExamBase` dùng chung cho startup và CLI; demo nhận cùng bộ dữ liệu đã kiểm
  tra. Mật khẩu lấy từ môi trường, hash bcrypt, không nằm trong JSON/log. Demo
  chặn tài khoản tham chiếu thiếu trong DB trước khi ghi hoặc `--clear` rồi seed.
- `pnpm run seed:check` kiểm tra JSON không cần DB, sau lần build đầu. Bản build
  copy JSON vào `dist/src/seed-db/data`; khi có source thì ưu tiên dữ liệu nguồn.
  `SEED_DATA_DIR` chọn một bộ JSON riêng, không trộn file thiếu với bộ mặc định.
- Seed vẫn tắt mặc định; quy tắc bỏ qua bản ghi/bảng đã có và các cờ clear cũ giữ
  nguyên. Chỉnh JSON không tự đồng bộ DB đang dùng. Không đổi Prisma schema hay API.

Kiểm chứng cuối sau sửa review: **120/120 unit (9 bộ)**, **144/144 E2E (12 bộ,
0 skipped)**; build, ESLint, TypeScript `--noEmit` và `git diff --check` sạch.
E2E chạy trên fixture PostgreSQL/PGlite và Storage cục bộ riêng, áp đủ 22 migration;
hai CLI seed thật thành công, 13 email tạo mới là `@liantest.vn`. Test bao gồm
JSON lỗi trước clear/kết nối DB, sửa JSON có hiệu lực, custom ID, hash mật khẩu,
và triển khai chỉ có bản build. Đối chiếu sâu cả 11 bộ JSON với snapshot trước
refactor: dữ liệu giữ nguyên hoàn toàn. Review đã xử lý hết các phát hiện.

Lệnh chuẩn: `pnpm run build`, `pnpm run seed:check`, `pnpm test --runInBand`,
`pnpm run test:e2e --runInBand` (cần DB/Storage test riêng cho E2E nghiệp vụ).
Máy phiên này thiếu executable pnpm nên gọi trực tiếp các CLI Node đã cài;
không cài thêm dependency. Log/fixture cục bộ ở `../.codegraph/`, không đưa vào repo.
User đã yêu cầu commit/push toàn bộ phần hoàn thành lên nhánh `NestJS` ngày
2026-10-18. Kiểm chứng trước commit được chạy lại: 120 unit, 144 E2E và 2 frontend
behavior đều pass; build/lint/typecheck sạch. Terminal không có mạng GitHub nên
dùng connector GitHub để xuất bản commit và đồng bộ Git object về local, giữ
lịch sử nối tiếp mốc `b46b09d2`. Không seed/clear DB đang dùng của user. Các giới
hạn frontend đã ghi trong docs/14 vẫn giữ nguyên.

## Checkpoint frontend 2026-10-18

Đã tiếp tục phiên bị hết lượt hôm trước: M1–M6 có triển khai đầy đủ trong working
tree; bổ sung QA trình duyệt và sửa các regression tìm thấy khi review. Website
đổi tên thành **LianTest**, người tạo vẫn là **LianHarman**. Bộ media mới thống
nhất indigo/giấy thi/dấu tích; xóa 17 asset cũ không dùng và giữ ảnh người dùng.

Đọc [14 — kiểm chứng và bàn giao frontend](./14-frontend-migration-verification.md)
để xem trạng thái kiểm tra thực tế, các phần chưa xác nhận do CDN và công việc
lưu trữ còn lại. [15 — audit media](./15-media-audit.md) ghi file xóa/giữ và nhận
diện mới. Việc đưa thay đổi lên remote được user yêu cầu sau phần kiểm chứng;
xem checkpoint seed JSON ở trên. Các mốc bên dưới là lịch sử port backend.

Kiểm chứng cuối trên fixture mới: **139/139 E2E (11 bộ, 0 skipped)**, **82/82
unit**, **2/2 frontend behavior**; build, lint, typecheck và diff whitespace sạch.
Đã sửa lỗi signin `localhost:8080` xếp dọc trên desktop và kiểm tra 6 viewport.
13 email seed đổi sang `@liantest.vn`, không ghi đè email tài khoản đã seed trước.

## Bảng phase

| Phase | Nội dung | Trạng thái |
|-------|----------|-----------|
| Hạ tầng | Gỡ demo, dời JwtStrategy → `exam-auth`, guards/interceptors tái dùng | ✅ XONG |
| 1 | Auth/RBAC: `exam-auth`, `pages` (landing/dashboard), `account` | ✅ XONG |
| 2 | `roles` (NhomQuyen), `users` (NguoiDung), `academic-years` (NamHoc+HocKy), `subjects` (MonHoc+Chuong), `view-subject` (môn được phân công) | ✅ XONG (`view_subject` trả nợ 2026-08-13) |
| 3 | `questions`: ngân hàng câu hỏi mcq/essay/reading + đáp án + đoạn văn + ảnh + import Word (mammoth) + trang SSR/listing | ✅ XONG (Excel hoãn — nút gốc `disabled`) |
| 4 | `exams`: đề thi & làm bài & chấm (LỚN NHẤT) | ✅ XONG (export PDF/Excel đã làm ở Phase 7) |
| 5 | Nhóm/lớp & phân công (model `Nhom`/`ChiTietNhom`/`PhanCong` ĐÃ có) | ✅ XONG (`/module`, `/assignment`, `/client`) |
| 6 | Thông báo/thống kê/dashboard (model `ThongBao` ĐÃ có) | ✅ XONG (`/teacher_announcement`, `/statistic`, dashboard email onboarding) |
| 7 | Hoàn thiện (export thật, seed mẫu, trang lỗi, e2e) | ✅ XONG — slice 1 (xuất/nhập Excel + in PDF) + slice 2 (seed dữ liệu mẫu) + slice 3 (trang lỗi 404/403/500 + e2e) |

> Model `PhanCong`, `Nhom`, `ChiTietNhom`, `ThongBao`… đã **kéo lên trước** vào
> schema vì Phase 4 cần (giao đề/kiểm tra SV/sinh thông báo). UI của chúng là Phase 5/6.

## Phase 4 (`src/exams/`, path `/test`) — chi tiết slice

Schema: migration `add_dethi_ketqua` (DeThi, ChiTietDeThi, DeThiTuDong, GiaoDeThi,
KetQua, ChiTietKetQua, TraLoiTuLuan, HinhAnhTraLoiTuLuan, ChamTuLuan) +
`add_nhom_thongbao_for_phase4`.

| Slice | Nội dung | Route chính | ✔ |
|-------|----------|-------------|---|
| 1 | Danh sách đề GV | `GET /test`; `POST /test/{pagination,getTotalPages,getDetail,delete}`; `get_subjects`, `get_groups` | ✅ |
| 2 | Tạo/sửa đề | `GET /test/{add,update/:made}`; `POST /test/{addTest,updateTest}`; `POST /question/getsoluongcauhoi`; module `class-modules` `POST /module/loadData` | ✅ |
| 3 | Chọn câu hỏi (đề thủ công) | `GET /test/select/:made`; `POST /test/{getQuestionOfTestManual,addDetail}`; `POST /question/getAnswersForMultipleQuestions`; nhánh pagination `custom.function=getQuestionsForTest` | ✅ |
| 4 | Luồng làm bài SV | `GET /test/{start,taketest}/:made`; `POST /test/{getQuestion,startTest,getTimeTest,getTimeEndTest,chuyentab,submit,getResultDetail}` | ✅ |
| 5 | Chi tiết/kết quả đề GV + chấm tự luận | `GET /test/detail/:made`; `POST /test/{getStatictical,getListEssaySubmissionsAction,getEssayDetailAction,saveEssayScoreAction}`; nhánh pagination `model=KetQuaModel`; stub `exportPdf`/`exportExcel` | ✅ (2026-07-22) |

### Ghi chú quan trọng theo slice
- **Slice 5** (mới nhất): `test_detail.ejs` 3 tab (Bảng điểm / Chấm tự luận / Thống kê).
  Bảng điểm dùng `pagination.js` với `args.model='KetQuaModel'` → `listExamResults`
  (4 filter present/interrupted/absent/all, UNION present+absent, sort whitelist,
  `hoten` sort theo từ cuối). Thống kê dùng `chart.js` (bê từ DHT). Chấm tự luận:
  `getEssaySubmissions`/`getEssayDetail`/`saveEssayScore` (thay `luuDiemTuLuan`; dùng
  deleteMany+createMany thay `ON DUPLICATE KEY` vì `cham_tuluan` không có unique).
- **Đề tự động** (loaide=1): random câu theo chương (`dethitudong`) khi tạo/sửa.
- **Chấm khi nộp**: mcq/đọc hiểu tự động (điểm_loại/tổng_câu_loại × số đúng); tự luận
  chờ GV chấm tay. Chỉ chấm khi `diemthi IS NULL`. Bọc `$transaction`.

### Phase 4 CÒN LẠI
- ~~**exportPdf** / **exportExcel**~~ — ĐÃ làm ở **Phase 7 slice 1** (xem mục Phase 7).
- ~~`test_schedule.php`~~ — ĐÃ làm ở Phase 5 (`GET /client/test`, module `src/client/`).
- `getExamineeByGroup` — chưa dùng ở `test_detail.js` (bỏ qua tới khi có nơi gọi).

## Phase 5 (nhóm/lớp & phân công) — XONG

| Module | Path | Nội dung | ✔ |
|--------|------|----------|---|
| `class-modules` | `/module` | Quản lý nhóm học phần GV (`module.php`) + chi tiết nhóm/thành viên (`class_detail.php`) | ✅ |
| `assignments` | `/assignment` | Phân công GV↔môn (`assignment.php`) — **MỞ KHOÁ dữ liệu thật** cho dropdown môn ở trang câu hỏi/tạo đề | ✅ |
| `client` | `/client` | Phía SV: nhóm học phần (`client_group.php`) + lịch thi (`test_schedule.php`) | ✅ |

Chi tiết từng slice: `../../docs/11-tien-do-hien-tai.md` §4b.
CÒN LẠI: ~~export Excel danh sách SV + import SV bằng Excel~~ — ĐÃ làm ở **Phase 7
slice 1**; còn `view_subject.php` (SV xem môn) nếu cần.

## Phase 6 slice 1 — Thông báo (`src/announcements/`, path `/teacher_announcement`) — XONG (2026-07-24)

Thay `teacher_announcement.php` + `AnnouncementModel.php`. Đủ 13 method của PHP gốc
+ 2 route phân trang.

| Nhóm | Route |
|------|-------|
| SSR | `GET /teacher_announcement`, `/add`, `/update/:matb` |
| CRUD | `POST /teacher_announcement/{sendAnnouncement,updateAnnounce,deleteAnnounce,getDetail}` |
| Đọc | `POST /teacher_announcement/{getAnnounce,getListAnnounce,getNotifications,markAsRead,getUnreadCount}` |
| Phân trang | `POST /teacher_announcement/{pagination,getTotalPages}` (`pagination.js`, `model=AnnouncementModel`) |

- View `teacher_announcement.ejs` + `add_announce.ejs` (dùng chung cho tạo/sửa theo
  `Action`; có `<base href="/">` vì path sâu). JS `announcement.js`/`update_announce.js`
  bê nguyên, chỉ đổi `./x` → `/x`.
- **Chuông thông báo trên header**: bổ sung phần notification vào `public/js/permission.js`
  + dropdown trong `views/partials/header.ejs` (chỉ hiện với SV — `manhomquyen === 2`).
- **Mở khoá** tab "Thông báo" ở offcanvas `class_detail`/`client_group` (trước đây 404).
- Thông báo tự động khi tạo đề (`is_auto = 1`) **KHÔNG** hiện ở danh sách quản lý của
  GV, chỉ hiện ở chuông/offcanvas nhóm.
- **KHÁC PHP:** bọc `$transaction` khi tạo/sửa (PHP không bọc → có thể để lại thông báo
  "cụt"); kiểm **người tạo == user** trước khi sửa/xoá (PHP không kiểm); `nguoitao` lấy
  từ JWT chứ không tin `args.id`.
- **QUIRK giữ nguyên:** `getAnnounce` chỉ trả thông báo khi nhóm ĐÃ có thành viên;
  `updateAnnounce` không dọn `trangthaithongbao` của nhóm bị bỏ; `getAll` gán mã học kỳ
  vào khoá `tenhocky`.
- ⚠️ **Quyền:** `thongbao`(view/create/delete/update) chỉ seed cho **nhóm quyền 3
  (admin)** — đúng y dump gốc `tracnghiemonline.sql`, GV (nhóm 1) KHÔNG có. Muốn GV
  dùng trang này phải cấp quyền qua UI nhóm quyền hoặc sửa `data/permissions.json`
  của module seed-db (trước đây là `exam-sample.ts`; xem checkpoint JSON ở đầu file).

## Phase 6 slice 2 — Thống kê (`src/statistic/`, path `/statistic`) — XONG (2026-07-26)

Thay `statistic.php` + `ThongKeModel.php`. Trang GV xem thống kê điểm theo **1 đề**
hoặc **tổng hợp** theo học kỳ/năm học/môn/nhóm (8 thẻ + biểu đồ cột `chart.js`).

| Nhóm | Route |
|------|-------|
| SSR | `GET /statistic` (query `made` → chi tiết 1 đề; không có → tổng hợp; `mahocky`/`namhoc` để nạp sẵn dropdown) |
| Thống kê 1 đề | `POST /statistic/getStatictical` |
| Thống kê tổng hợp | `POST /statistic/getAggregatedStatistical` |
| Bộ lọc | `POST /statistic/{getFilters,getGroupsBySubject}` |

- View `statistic.ejs` (2 nhánh `ShowAggregate`) + partial `statistic_cards.ejs` (8 thẻ
  dùng chung). JS `statistic.js` bê nguyên, đổi `./statistic/` → `/statistic/`.
  Plugin: `sweetalert2` + `chart.js` (local, bê từ DHT). Nạp `permission.js`.
- Navbar mục "Thống kê" đổi từ `#` → `/statistic` (active theo `page`).
- **KHÁC PHP:** (1) gộp 13 truy vấn của `getStatisticalData` thành 2 (fetch các dòng
  cùng phép JOIN rồi tính trên JS) — cùng kết quả; (2) thêm `#chitietdethi[data-id]`
  vào nhánh chi tiết vì view PHP gốc thiếu hook mà `statistic.js` cần (không có →
  `getStatictical` không bao giờ chạy, trang chi tiết chết); (3) `nguoitao` lấy từ JWT.
- **QUIRK giữ nguyên:** `getStatisticalData` JOIN `chitietnhom` chỉ theo `manguoidung`
  → SV thuộc nhiều nhóm bị đếm nhiều lần khi lọc "Tất cả nhóm"; phân khoảng điểm dùng
  `LEAST(diemthi,10) >= i AND < i+1` nên điểm đúng 10 KHÔNG rơi vào khoảng nào (không
  lên biểu đồ).
- ⚠️ **Quyền:** `thongke`(view…) chỉ seed cho **nhóm quyền 3 (admin)** — đúng dump gốc,
  GV (nhóm 1) KHÔNG vào được (giống trang thông báo).
- PHỤ THUỘC DỮ LIỆU: cần `dethi`/`giaodethi`/`nhom`/`ketqua` mới có số liệu; thiếu →
  dropdown rỗng, thẻ = 0 (đúng hành vi PHP).

### Phase 6 slice 3 — Dashboard email onboarding ✅ XONG (2026-07-27)
Port nốt 3 route AJAX của `dashboard.php` + modal nhắc nhập email → **Phase 6 HOÀN TẤT**.

- **`src/pages/pages.service.ts` (MỚI)** thay 3 method email của `NguoiDungModel`:
  `getEmail` (trả CHUỖI, rỗng = chưa có email), `checkEmailExist` (boolean),
  `updateEmail` (boolean).
- **`src/pages/pages.controller.ts`**: thêm `POST /dashboard/checkEmail`,
  `/dashboard/checkEmailExist`, `/dashboard/updateEmail` — `@SkipTransform()`, KHÔNG
  gate quyền riêng (như PHP chỉ `checkAuthentication`) vì user chỉ đọc/sửa email của
  CHÍNH mình; `id` lấy từ **JWT**, không tin body. DTO `DashboardEmailDto` (`@IsEmail`
  + trim). 3 route đã thêm vào `exclude` global prefix.
- **View `views/pages/dashboard.ejs`**: thêm modal `#modal-onboarding` (bê từ
  `dashboard.php`) + nạp `bootstrap-notify` và `/public/js/pages/dashboard.js`.
  Ảnh nền `public/media/photos/photo23.jpg` KHÔNG tồn tại (cả ở bản PHP) → thay bằng
  `/public/media/various/bg_dashboard.jpg` sẵn có.
- **`public/js/pages/dashboard.js`**: bê nguyên, chỉ đổi `./dashboard/` → `/dashboard/`.
- ⚠️ **KHÁC PHP (quan trọng):** Postgres bắt `nguoidung.email` NOT NULL + UNIQUE nên GV
  thêm SV bằng MSSV sẽ sinh email placeholder `<mssv>@sinhvien.local`
  (`class-modules.service.ts`) — email không bao giờ rỗng → modal sẽ không bao giờ hiện.
  `getEmail` vì thế coi hậu tố `@sinhvien.local` là **chưa có email** (trả `''`) để giữ
  đúng ý đồ onboarding.
- Chi tiết nhỏ: `updateEmail` bắt `P2002`/`P2025` → trả `false` (JS báo "Cập nhật email
  không thành công") thay vì ném 500 khi email trùng do race với `checkEmailExist`.
  Slider trang dashboard được gắn sẵn class `js-slider-enabled` để helper `jq-slick`
  (dashboard.js gọi sau `checkEmail`) không init slick lần hai.
- Build sạch; boot map đủ 3 route `POST /dashboard/*`.

## Phase 7 slice 1 — Xuất/nhập Excel + in PDF — XONG (2026-07-29)

Gỡ hết stub export/import. Gói mới: **`exceljs`** (`pnpm add exceljs`). Helper dùng
chung: **`src/common/utils/excel.util.ts`** (`createWorkbook`, `setColumnWidths`,
`writeHeaderRow`, `centerCells`, `applyThinBorders`, `workbookToDataUri`, `cellText`).

| Route | Thay gì của PHP | Nơi cài đặt |
|-------|-----------------|-------------|
| `POST /module/exportExcelStudentS` | `Module::exportExcelStudentS` (PHPExcel) | `class-modules.service.ts` → `exportStudentsExcel` |
| `POST /test/exportExcel` | `Test::exportExcel` + `getTestAll`/`getTestScoreGroup` | `exams-export.service.ts` → `exportExamScores` |
| `POST /test/getMarkOfAllTest` | **route MỚI** (PHP chỉ có model, thiếu action) | `exams-export.service.ts` → `exportMarkOfAllTest` |
| `GET /test/exportPdf/:makq` | `Test::exportPdf` (dompdf) | controller + view `views/pages/export_pdf.ejs` |
| `POST /user/addExcel` | `User::addExcel` (PHPExcel) | `users.service.ts` → `parseStudentExcel` |
| `POST /user/addFileExcelGroup` | `User::addFileExcelGroup` + `NguoiDungModel::addFileGroup` | `users.service.ts` → `addStudentsFromFile` |

Service mới **`src/exams/exams-export.service.ts`** (tách khỏi `exams.service.ts`
đã ~2000 dòng), đăng ký trong `ExamsModule`. 3 route mới thêm vào `exclude` global
prefix: `test/getMarkOfAllTest`, `user/addExcel`, `user/addFileExcelGroup`.

**Shape trả về giữ y PHP:** `{status:true, file:"data:<mime>;base64,...", filename}`
— JS gốc tạo thẻ `<a download>` rồi click, KHÔNG đổi được.

### KHÁC PHP (đã ghi chú trong code)
- **PDF không render ở server.** Thay dompdf bằng **trang HTML tự gọi `window.print()`**
  (view `export_pdf.ejs` bê nguyên CSS của dompdf + `@page`/`@media print`) → người
  dùng chọn "Lưu dạng PDF". Tránh phải cài Chromium/puppeteer trên server.
  `test_detail.js` vốn đã `window.open` nên không phải sửa JS.
- **`getMarkOfAllTest`**: dựng ma trận SV × đề bằng **1 truy vấn** + ghép theo cặp
  `(manguoidung, made)`. PHP lặp `getMarkOfOneTest` cho từng đề rồi ghép theo **chỉ số
  mảng** → lệch dòng khi một SV thiếu bản ghi ở đề nào đó.
- **`getTenLopDisplay`** tra theo `manhom` (`WHERE manhom IN (...)`). PHP tra
  `tennhom IN (...)` trong khi `ds` mà `test_detail.js` gửi lên là mảng **mã nhóm**
  → luôn không khớp, tiêu đề luôn rơi về "Tất cả các lớp".
- **Nhập SV đọc `.xlsx` + `.xls`** — exceljs chỉ đọc OOXML nên `.xls` cũ (BIFF) đi qua
  SheetJS (bổ sung 2026-08-14; trước đó chỉ nhận `.xlsx`).
  `class_detail.ejs` dùng `accept=".xlsx,.xls"` + file mẫu **`public/filemau/danhsachsv_mau.xlsx`** (sinh bằng
  exceljs, đúng bố cục: dữ liệu từ **dòng 3**, cột **B**=MSSV, **C**=họ đệm,
  **D**=tên, **H**=email — y như PHP đọc `j=1,2,3,7` 0-based).
- **`addFileGroup`**: băm mật khẩu **1 lần cho cả lô** + cập nhật sỉ số **1 lần ở cuối**
  (PHP băm/cập nhật mỗi vòng lặp). Email trùng bắt bằng `P2002` của Prisma.
- MIME data-URI của danh sách SV dùng đúng `...spreadsheetml.sheet` (PHP ghi file
  Excel2007 nhưng gắn nhầm MIME `application/vnd.ms-excel`).

### Quyền
`test/exportExcel`, `test/getMarkOfAllTest`, `test/exportPdf/:makq` gate
`@Permissions('dethi','view')`. `user/addExcel` + `user/addFileExcelGroup` **chỉ cần
đăng nhập** (đúng `user.php` gốc — GV không có quyền `nguoidung` vẫn nhập SV vào nhóm
của mình được). `module/exportExcelStudentS` giữ nguyên mức cũ.

### Kiểm chứng
Build sạch; boot map đủ 6 route. Bộ đọc Excel đã chạy thử với chính file mẫu
(3 dòng → 3 bản ghi đúng) + 2 ca lỗi (`.xls`, thiếu file). **Đã kiểm chứng trên DB
thật qua HTTP:** 4 route xuất — 2026-08-07; 2 route nhập SV — 2026-08-08 (xem 2 mục
"Kiểm chứng" ở cuối tài liệu).

## Phase 7 slice 2 — Seed dữ liệu mẫu nghiệp vụ — XONG (2026-08-04)

Trước đây `seed-db` chỉ seed RBAC + 3 người dùng → hầu hết trang rỗng. Nay có **dữ
liệu mẫu chạy được cả luồng**: năm học → môn học/chương → phân công → nhóm học phần +
thành viên → ngân hàng câu hỏi (mcq/essay/reading) → đề thi (thủ công / tự động / đã
kết thúc kèm bài làm mẫu) → thông báo tự động.

| File | Vai trò |
|------|---------|
| `src/seed-db/data/*.json` | **Dữ liệu thuần** (thay `exam-demo.data.ts` từ 2026-10-18). Khóa tự tăng tham chiếu nhau qua `key`/nhãn. |
| `src/seed-db/seed/exam-demo.seeder.ts` | `seedExamDemo()` / `clearExamDemo()` — hàm thuần nhận `PrismaClient`, dùng được cả trong Nest lẫn script. |
| `src/seed-db/seed-db.service.ts` | Nối dây: `SEED_DEMO_DATA=true` → seed lúc app khởi động. |
| `scripts/seed-demo.cjs` | Chạy một lần ngoài app (`--clear`, `--force`, `--clear-only`). |
| `scripts/prisma-client.cjs` | `createPrisma()` dùng chung cho 2 script seed. |

### Biến môi trường
`SEED_DEMO_DATA=false` (mặc định TẮT, đã thêm vào `.env`/`.env.example`). Chỉ có tác
dụng khi `SEED_DB=true`. Nếu `CLEAR_DB=true` **và** `SEED_DEMO_DATA=true` thì dữ liệu
nghiệp vụ được xoá **trước** `clear()` — vì `clear()` xoá `nguoidung`, giữ lại nhóm/đề/
bài làm sẽ thành bản ghi mồ côi (FK dạng scalar nên DB không chặn). `SEED_DEMO_DATA=false`
thì KHÔNG đụng tới dữ liệu nghiệp vụ (tránh lỡ tay xoá dữ liệu thật).

### Dữ liệu có gì
- **13 người dùng** (`data/users.json`: `admin`, `gv001`/`gv002`, `sv001`→`sv010`;
  mật khẩu mặc định `123456`). Có thể đổi ID trong JSON nếu cập nhật mọi tham chiếu.
- 2 năm học × 3 học kỳ, **4 môn** (LTW001, CSDL01, MMT001, CTDL01) + **14 chương**,
  **9 phân công**, **3 nhóm học phần** (mã mời `ltw0001`/`csdl001`/`mmt0001`, 18 thành viên).
- **38 câu hỏi**: 32 mcq + 3 essay + 1 đoạn văn đọc hiểu (3 câu con).
- **3 đề thi**: *Thi cuối kỳ LTW* (thủ công, 10 câu, **đang mở** → vào thi ngay được),
  *Kiểm tra tự động CSDL* (tự động, 5 câu, đang mở), *Kiểm tra giữa kỳ LTW* (đã kết thúc,
  4 mcq + 1 tự luận, **4 bài làm mẫu** của sv001–sv004 → xem bảng điểm/thống kê/chấm tự luận).

### KHÁC code nghiệp vụ (đã ghi chú trong seeder)
- **Không bọc `$transaction`** cả lô (Accelerate giới hạn thời gian giao dịch tương tác);
  seed là thao tác một lần, muốn làm lại thì `clearExamDemo` rồi seed lại.
- Đề **tự động** chọn câu `ORDER BY macauhoi` chứ không `ORDER BY RANDOM()` như
  `addQuestionsToAutoTest` → mỗi lần seed ra cùng một đề, dễ đối chiếu.
- Chấm bài mẫu bám đúng `ExamsService.submit` (điểm = điểm_loại/tổng_câu_loại × số câu
  đúng, làm tròn 2 số; `diemthi` chưa gồm điểm tự luận; đề có tự luận → `trangthai_tuluan`
  = `Chưa chấm` để thử trang chấm tay).
- Từ refactor JSON 2026-10-18, thiếu người dùng được tham chiếu → **chặn trước ghi/clear**;
  trước đó chỉ cảnh báo trong log (FK scalar).

### Kiểm chứng (đã chạy với DB thật)
- `node scripts/seed-demo.cjs` và boot với `SEED_DEMO_DATA=true` đều seed đủ:
  4 môn / 14 chương / 38 câu hỏi / 3 nhóm / 3 đề / 4 bài làm.
- Smoke test HTTP sau khi seed (đăng nhập `gv001` & `sv001`, mật khẩu `123456`):
  `GET /test`, `/question`, `/module`, `/test/detail/:made`, `/test/select/:made`,
  `/test/update/:made`, `/module/detail/:manhom` → **200**;
  `/client/group`, `/client/test`, `/test/start/:made`, `/test/taketest/:made`,
  `/dashboard` (SV) → **200**. `POST /test/pagination`, `/question/pagination`,
  `/client/loadDataGroups` trả đúng dữ liệu.
- ⚠️ `gv001` (nhóm quyền 1) vẫn **403** ở `/assignment`, `/statistic`, `/subject`,
  `/namhoc` — đúng dump gốc (các quyền đó chỉ seed cho nhóm 3 admin). Dùng `admin`.
- ⚠️ Khoá tự tăng nên `made`/`manhom` **đổi sau mỗi lần seed lại** — đừng hardcode id
  trong khi test.

## Phase 7 slice 3 — Trang lỗi 404/403/500 + e2e — XONG (2026-08-05)

Trước đây MỌI lỗi đều trả JSON `{statusCode,message,code,...}` — người dùng mở nhầm
URL hay thiếu quyền thì thấy một cục JSON thay vì trang lỗi như bản PHP. Nay
`AllExceptionsFilter` phân nhánh: **điều hướng bằng trình duyệt → HTML, AJAX/API → JSON**
(không đổi shape cũ nên JS gốc không phải sửa gì).

| File | Thay đổi |
|------|----------|
| `views/pages/error/page_404.ejs` | Bê nguyên `mvc/views/pages/error/page_404.php` (đổi `href="./"` → `/`). |
| `views/pages/error/page_403.ejs` | Bê nguyên `page_403.php` (đổi `href="./dashboard"` → `/dashboard`). |
| `views/pages/error/page_500.ejs` | **MỚI** — PHP không có; cùng bố cục "hero" cho mọi lỗi còn lại. |
| `src/common/filters/all-exceptions.filter.ts` | Thêm nhánh render HTML + chuyển hướng 401; log 4xx = WARN gọn, 5xx = ERROR kèm stack. |

### Khi nào trả HTML? (`wantsHtmlPage`)
Phải thoả **cả 4**: method `GET` + **không** phải XHR (`X-Requested-With` jQuery tự
gắn) + header `Accept` có `text/html` + path **không** nằm dưới `/api`. Nhờ vậy mọi
route AJAX của JS gốc (đều là `POST`, hoặc `GET` qua jQuery) vẫn nhận JSON như cũ.

| Mã | Hành vi |
|----|---------|
| **401** | Xoá cookie `access_token` rồi `redirect('/auth/signin')` — thay `AuthCore::checkAuthentication` (PHP cũng xoá cookie + `header("Location: login_path")`). |
| **403** | Render `pages/error/page_403` (đúng chỗ PHP gọi `view("single_layout", page_403)`). |
| **404** | Render `pages/error/page_404` — cả URL không tồn tại lẫn `NotFoundException` do controller ném (vd đề thi không có). |
| còn lại | Render `pages/error/page_500` kèm mã thật (400, 429…). Chi tiết kỹ thuật **chỉ hiện khi `MODE=development`**. |

- Nếu **render trang lỗi cũng lỗi** → gửi text thuần `"<mã> - <message>"`, KHÔNG ném
  tiếp (tránh lặp vô hạn). Có kiểm `response.headersSent` trước khi ghi.
- Filter nay inject `ConfigService` (đọc `GLOBAL_PREFIX`, `ACCESS_TOKEN_COOKIE`, `MODE`).
- Trang lỗi dùng layout kiểu `single_layout.php` (chỉ `head` + nội dung + `script`,
  KHÔNG navbar/sidebar) nên render được cả khi chưa đăng nhập.

### e2e (`pnpm run test:e2e`)
Bộ e2e scaffold cũ đã hỏng (kỳ vọng `"Hello World!"`, thiếu alias `@/`) → viết lại:

| File | Vai trò |
|------|---------|
| `test/setup-app.ts` | `createTestApp()` dựng app **y như `src/main.ts`** (global prefix + exclude, ValidationPipe, cookie-parser, EJS + `views/`) và `login()` trả cookie phiên. |
| `test/error-pages.e2e-spec.ts` | **MỚI** — 10 ca: 404 HTML, 401 → redirect + xoá cookie, trang công khai vẫn 200, AJAX vẫn JSON, `/api/*` vẫn JSON, và (khi đăng nhập `gv001`) 403 HTML, 404 đề không tồn tại, lỗi 400 ra trang lỗi chung, `/test` vẫn 200. |
| `test/app.e2e-spec.ts` | Sửa: `GET /` là landing SSR, không phải `"Hello World!"`. |
| `test/jest-e2e.json` | Thêm `moduleNameMapper` cho alias `@/` + `testTimeout` 30s. |

- ⚠️ e2e chạy trên **CSDL thật** (`AppModule` cần Prisma kết nối mới init được).
  `createTestApp()` **ép `SEED_DB=false`/`CLEAR_DB=false`/`SEED_DEMO_DATA=false`**
  (đặt vào `process.env` TRƯỚC khi compile module — `@nestjs/config` không ghi đè biến
  đã có) nên test **không bao giờ** xoá/ghi đè dữ liệu.
- Nhóm test cần đăng nhập tự **bỏ qua kèm cảnh báo** nếu `gv001` chưa có trong DB.
- Kết quả: **10/10 pass**, `pnpm run build` sạch.
- Bổ sung 2026-08-08: `test/exam-flow.e2e-spec.ts` (18 ca, luồng nghiệp vụ) → tổng
  **28/28 pass**. Xem mục "e2e luồng nghiệp vụ" ở cuối tài liệu.

## Lưu file ảnh — Supabase Storage (2026-07-22)

Ảnh KHÔNG còn lưu blob trong DB; lưu ở **Supabase Storage** (bucket public), DB chỉ
lưu **public URL**. Chi tiết: [06-luu-tru-file-supabase.md](./06-luu-tru-file-supabase.md).
Migration `20260722030000_hinhanh_to_supabase_url` đã deploy.

## Phụ thuộc dữ liệu (đọc trước khi test!)

Nhiều trang lọc qua `phancong`/`giaodethi`/`chitietnhom` → **RỖNG nếu thiếu dữ liệu**
(đúng hành vi PHP gốc):
- Listing + dropdown môn của **câu hỏi** lọc qua `phancong` (GV).
- Danh sách **đề thi**, dropdown nhóm khi tạo đề, bảng điểm test_detail cần
  `giaodethi`/`nhom`/`ketqua`.
- ~~Seed mới seed QUYỀN, chưa có monhoc/cauhoi/phancong/nhom/dethi~~ → **ĐÃ CÓ** dữ
  liệu mẫu (Phase 7 slice 2): bật `SEED_DEMO_DATA=true` hoặc chạy
  `node scripts/seed-demo.cjs` (cần `pnpm run build` trước).
- Quyền đã seed: `dethi`(view/create/delete/update), `tgthi`(join), `cauhoi`(CRUD),
  `namhoc`/`monhoc`… (nhomquyen 1/2/3).

## ✅ Kiểm chứng export Excel / in PDF trên dữ liệu mẫu (2026-08-07)

Chạy server dev + đăng nhập `gv001/123456`, gọi thật 4 route của Phase 7 slice 1 trên
dữ liệu mẫu (nhóm `manhom=4` "Lập trình Web - Nhóm 01", đề `made=6` "Kiểm tra giữa kỳ"
có 4 bài làm, `makq=5` của sv001). **Cả 4 route CHẠY ĐÚNG**, file .xlsx mở lại được
bằng `exceljs`:

| Route | Kết quả |
| --- | --- |
| `POST /module/exportExcelStudentS` `{manhom:4}` | `Danh sách sinh viên.xlsx` (7.0 KB), 6 cột × 7 dòng — đủ 6 SV, cột "Giới tính" ra `Null` (đúng chủ ý, xem chú thích trong `class-modules.service.ts`) |
| `POST /test/exportExcel` `{made:6,manhom:4,ds:[]}` | `Ket_qua_de_6_nhom_4.xlsx` (7.5 KB), sheet `De_6_N4`, 10 cột × 8 dòng — 4 SV có điểm (8/6/4/8) + 2 SV "Chưa làm", cột thời gian/số câu đúng/lần chuyển tab đúng |
| `POST /test/getMarkOfAllTest` `{manhom:4}` | `Bang_diem_nhom_4.xlsx` (7.2 KB), ma trận SV × 2 đề của nhóm — cột "Thi cuối kỳ" rỗng (chưa ai làm), cột "Kiểm tra giữa kỳ" có điểm |
| `GET /test/exportPdf/5` | HTTP 200, HTML 12.8 KB, `<title>` = `Chi_tiet_ket_qua_sv001_MD5` (tên file gợi ý khi in), có `window.print()`, render đủ 5 câu (4 mcq + 1 tự luận). `makq` không tồn tại → **404** |

Ghi chú: POST trả **HTTP 201** (mặc định Nest) thay vì 200 như PHP — JS gốc chỉ đọc
`data.status` nên không ảnh hưởng.

## ✅ Kiểm chứng nhập SV từ .xlsx trên HTTP thật (2026-08-08)

Chạy server dev (`SEED_DB=false`) rồi gọi thật `POST /user/addExcel` +
`POST /user/addFileExcelGroup` bằng script một lần (không commit, để ở scratchpad).
Dữ liệu test (`sv9001`–`sv9003`, nhóm `manhom=4`) đã **xoá sạch ở cuối** và `siso`
khôi phục về 6. **17/17 ca ĐÚNG:**

| Ca | Kết quả |
| --- | --- |
| `addExcel` với **file mẫu chính thức** `public/filemau/danhsachsv_mau.xlsx` | 3 dòng, đúng MSSV/họ tên ghép từ cột C+D/email |
| `addExcel` thiếu file | `{status:'error', message:'Chưa chọn file để tải lên'}` |
| `addExcel` đuôi `.xls` | (lúc đó) báo lỗi gợi ý "Lưu thành .xlsx" — **từ 2026-08-14 đọc được `.xls`**, ca này đổi thành đuôi `.csv` |
| `addExcel` file 5 dòng (1 thiếu MSSV, 1 email sai) | trả đúng **3** dòng hợp lệ, `nhomquyen=2`, `trangthai=1` |
| `addFileExcelGroup` lần 1 | `success` — tạo 3 tài khoản (mật khẩu đã băm bcrypt) + 3 `chitietnhom` (`hienthi=1`); `siso` 6 → 9 = số thành viên thực tế |
| `addFileExcelGroup` lần 2 (cùng danh sách) | `success` + "Sinh viên đã có trong nhóm: …", KHÔNG nhân bản bản ghi |
| MSSV mới nhưng **email trùng** | `error` "Email … đã tồn tại cho MSSV sv9009" (bắt `P2002`), KHÔNG 500 và KHÔNG tạo bản ghi mồ côi |
| `listuser` không phải JSON | `{status:'error', message:'Danh sách sinh viên không hợp lệ'}` |
| Đăng nhập bằng **SV** | vẫn gọi được (2 route chỉ cần auth — đúng `user.php` gốc) |
| Chưa đăng nhập | **401** |

Ghi chú: POST trả **HTTP 201** (mặc định Nest) như các route AJAX khác.

## ✅ e2e luồng nghiệp vụ (2026-08-08)

`test/exam-flow.e2e-spec.ts` (**MỚI**, 18 ca) phủ trọn vòng đời một đề thi, đi qua
HTTP y như trình duyệt: **GV tạo đề thủ công → chọn câu hỏi → giao nhóm → SV vào thi
→ nộp bài → GV xem bảng điểm/thống kê**.

| Bước | Route | Kiểm gì |
|------|-------|---------|
| Tạo đề | `POST /test/addTest` | trả `made`; `giaodethi` có nhóm; sinh `thongbao` `is_auto=1` |
| Chọn câu | `GET /test/select/:made`, `POST /test/getTotalPages`+`/test/pagination` (`custom.function=getQuestionsForTest`) | trang render 200; chỉ trả câu **đúng môn** + đúng loại (lọc qua `phancong` của GV) |
| Lưu câu | `POST /test/addDetail`, `POST /test/getQuestionOfTestManual` | 3 dòng `chitietdethi`, đọc lại khớp |
| SV vào thi | `GET /test/start/:made`, `POST /test/startTest` | trang có tên đề; tạo `ketqua` (`diemthi` NULL) + **pre-insert đúng 3** `chitietketqua` |
| SV làm bài | `POST /test/getQuestion`, `GET /test/taketest/:made`, `POST /test/chuyentab` | đủ 3 câu và **không lộ `ladapan`**; trang làm bài render (không redirect); `solanchuyentab` +1, cờ tự nộp = 0 |
| Nộp bài | `POST /test/submit` (multipart) | đúng hết → **10 điểm**, `socaudung=3`, `trangthai='Đã nộp'`, `trangthai_tuluan='Đã chấm'` (đề không có tự luận); **nộp lại lần 2 bị từ chối** |
| Xem lại | `POST /test/getResultDetail` | 3 câu |
| GV xem kết quả | `GET /test/detail/:made`, `POST /test/pagination` (`model=KetQuaModel`), `POST /test/getStatictical` | bảng điểm có SV với điểm 10; thống kê `da_nop_bai=1`, `diem_cao_nhat=10`, khoảng điểm cuối = 1 |
| Ràng buộc | `POST /test/delete` | **không xoá được** đề đã có người thi |

**An toàn dữ liệu:** bộ test chỉ **TẠO** một đề riêng (tên gắn dấu thời gian
`[E2E] Đề kiểm thử <ts>`), không sửa dữ liệu sẵn có, và `afterAll` xoá đúng những gì
đã tạo (thông báo → `ketqua` → `dethi`; phần còn lại theo FK cascade). **KHÔNG** dùng
`POST /test/delete` để dọn vì route đó xoá TOÀN BỘ thông báo của nhóm (quirk bê từ
PHP) → sẽ đụng dữ liệu mẫu. Dò dữ liệu tiên quyết (nhóm của `gv001` có SV + môn có ≥3
câu mcq), lấy đáp án đúng làm "đáp án chuẩn" và dọn dẹp đều qua `PrismaService` lấy từ
`app.get(...)`; mọi **bước nghiệp vụ** vẫn đi qua HTTP. Thiếu dữ liệu mẫu → **bỏ qua
kèm cảnh báo** thay vì đỏ oan.

Kết quả: `npx jest --config ./test/jest-e2e.json` → **28/28 pass** (3 bộ: app, trang
lỗi, luồng nghiệp vụ); đã đối chiếu CSDL sau khi chạy — số bản ghi trở về y như trước
(3 đề / 4 kết quả / 13 người dùng / 3 nhóm).

⚠️ `pnpm run test:e2e -- --testPathPattern X` KHÔNG còn dùng được (Jest mới đổi tên
thành `--testPathPatterns`, và chỉ nhận ở dòng lệnh) → chạy 1 bộ bằng
`npx jest --config ./test/jest-e2e.json --testPathPatterns exam-flow`.

## ✅ e2e đề tự động + chấm tự luận + trang SV (2026-08-10)

`test/exam-auto-essay.e2e-spec.ts` (**MỚI**, 19 ca) nối tiếp `exam-flow`: **GV tạo đề
TỰ ĐỘNG (`loaide=1`) có câu tự luận → SV làm & nộp → GV chấm tự luận → SV xem lại ở
`/client/*`**.

| Bước | Route | Kiểm gì |
|------|-------|---------|
| Tạo đề tự động | `POST /test/addTest` (`loaide=1`) | hệ thống **tự bốc câu** vào `chitietdethi` đúng số/đúng loại/đúng mức độ, `thutu` đã đánh số; `dethitudong` lưu đủ chương; KHÔNG cần `/test/addDetail` |
| Ràng buộc | `POST /test/addTest` đòi 9999 câu | `success=false`, thông báo "Không đủ câu hỏi…", `$transaction` rollback → **không để lại đề rác** |
| SV làm bài | `POST /test/startTest`, `POST /test/getQuestion` | pre-insert đủ `chitietketqua`; câu **tự luận không có lựa chọn**, câu đọc hiểu kèm `context`, không lộ `ladapan` |
| Nộp bài | `POST /test/submit` (multipart, kèm `essay_0_*`) | chấm tự động phần mcq/đọc hiểu; `traloi_tuluan` được lưu; `chitietketqua.dapanchon` của câu tự luận = NULL; **`trangthai_tuluan='Chưa chấm'`** (khác đề chỉ mcq) |
| GV chấm | `POST /test/getListEssaySubmissionsAction` | thấy bài; lọc `status=ungraded/graded` + tìm theo mã SV đúng |
| GV mở bài | `POST /test/getEssayDetailAction` | đúng nội dung bài làm, `da_cham=0`, `diem_cham=null` |
| Ràng buộc | `POST /test/saveEssayScoreAction` quá `diem_tuluan` của đề | bị từ chối ("vượt quá"), **không ghi** `ketqua` lẫn `cham_tuluan` |
| GV lưu điểm | `POST /test/saveEssayScoreAction` | `ketqua.diem_tuluan` + `trangthai_tuluan='Đã chấm'`; `cham_tuluan` 1 dòng/câu; **chấm lại ghi đè**, không nhân đôi |
| SV xem lại | `POST /test/getResultDetail` | thấy bài tự luận kèm `diem_cham_tuluan` |
| Trang SV | `GET /client/group`, `GET /client/test`, `POST /client/{loadDataGroups,getFriendList,joinGroup,hide}` | render 200; danh sách nhóm/bạn cùng nhóm (trừ chính mình); mã mời sai → `0`, đã ở trong nhóm → `1` (không nhân bản `chitietnhom`); ẩn/hiện nhóm có **khôi phục nguyên trạng**, giá trị ngoài 0/1 bị từ chối |
| Lịch kiểm tra | `POST /client/getTotalPages` + `/client/pagination` (`custom.function=getUserTestSchedule`) | đề vừa nộp nằm ở nhóm "đã thi" (`filter=3`, `dathi=1`, lộ điểm vì `xemdiem=1`, `trangthai_tuluan='Đã chấm'`) và **không còn** ở nhóm "đang mở, chưa thi" (`filter=0`) |
| Offcanvas nhóm | `POST /test/getTestsGroupWithUserResult` | có đề vừa thi kèm điểm |

**🐞 LỖI TÌM ĐƯỢC & ĐÃ SỬA — chấm điểm TỪNG CÂU không được lưu.** `test_detail.js` gửi
`cau[<macauhoi>]=<điểm>` (jQuery serialize object). PHP giữ nguyên khoá số, còn Node
thì `body-parser` gọi `qs` với `arrayLimit = max(100, số tham số)` → khoá số **nhỏ hơn
100** bị coi là chỉ số mảng rồi **nén mảng** lại: `cau[33]=2.5` → `['2.5']`, mất luôn
macauhoi. Hậu quả: request hoặc 400 (`cau must be an object`), hoặc lưu được tổng điểm
nhưng bảng `cham_tuluan` **rỗng** — xảy ra với mọi CSDL mới seed (macauhoi < 100).
Cách sửa (3 chỗ):
- `src/main.ts` + `test/setup-app.ts`: tạo app với **`{ rawBody: true }`** để giữ body thô.
- `src/exams/dto/exam.dto.ts`: thêm `parseScoreMapFromRawBody()` — đọc thẳng cặp
  `cau[<macauhoi>]` từ `req.rawBody` bằng `URLSearchParams`; và `@Transform` cho field
  `cau` nhận cả mảng lẫn object để ValidationPipe không chặn 400.
- `src/exams/exams.controller.ts`: `saveEssayScore` ưu tiên map đọc từ body thô, chỉ
  quay về `dto.cau` khi không đọc được cặp nào (vd client gửi JSON).

**An toàn dữ liệu:** chỉ tạo 1 đề `[E2E] Đề tự động <ts>`; ca ẩn/hiện nhóm khôi phục
ngay trong `finally`; `afterAll` xoá `thongbao → traloi_tuluan/cham_tuluan → ketqua →
dethi` (phần còn lại theo cascade), KHÔNG dùng `/test/delete`. Thiếu dữ liệu mẫu →
bỏ qua kèm cảnh báo.

Kết quả: `npx jest --config ./test/jest-e2e.json` → **47/47 pass** (4 bộ: app, trang
lỗi, luồng nghiệp vụ, đề tự động + chấm tự luận); `pnpm run build` sạch; đối chiếu CSDL
sau khi chạy trở về y như trước (3 đề / 4 kết quả / 0 `cham_tuluan` / 13 người dùng /
3 nhóm / 18 `chitietnhom` đều `hienthi=1`).

## ✅ e2e thông báo + thống kê (2026-08-11)

`test/announcement-statistic.e2e-spec.ts` (**MỚI**, 22 ca) phủ nốt Phase 6:
**`/teacher_announcement/*`** và **`/statistic/*`**.

⚠️ **Quyền:** dump gốc chỉ seed `thongbao`/`thongke` cho **nhóm quyền 3 (Admin)**, trong
khi dữ liệu nghiệp vụ (nhóm/đề/kết quả) lại thuộc GV `gv001` (nhóm quyền 1) → admin
không có gì để xem, còn GV thì 403. Bộ test **cấp tạm** 5 dòng `chitietquyen` cho nhóm
quyền 1 ở `beforeAll` và **xoá lại đúng những dòng đã thêm** ở `afterAll` (dòng có sẵn
không đụng tới). `PermissionsGuard` truy vấn CSDL mỗi request nên không cần dựng lại app.

| Nhóm ca | Route | Kiểm gì |
|---------|-------|---------|
| Trang SSR | `GET /teacher_announcement`, `/add`, `/update/:matb` | render 200; `update/:matb` của **người khác → 403** (khác PHP: PHP không kiểm người tạo), mã lạ → 404 |
| Gửi thông báo | `POST /sendAnnouncement` | trả `matb`; `thongbao.is_auto=0` + `nguoitao` từ JWT; `chitietthongbao` đủ nhóm; **mỗi SV của các nhóm nhận có đúng 1 dòng `trangthaithongbao` = 'chưa xem'**; chuỗi `YYYY/M/D H:m:s` của JS gốc parse đúng |
| Nhóm không tồn tại | `POST /sendAnnouncement` `manhom=[999999]` | tạo thông báo nhưng **không sinh dòng `chitietthongbao`/`trangthaithongbao` mồ côi** (khác PHP dựa FK) |
| Chi tiết | `POST /getDetail` | nội dung + `tenmonhoc` + đúng mảng mã nhóm đang nhận |
| Phân trang | `POST /pagination`, `/getTotalPages` (`model=AnnouncementModel`) | có thông báo vừa gửi, `nhom` là chuỗi `STRING_AGG` tên nhóm; **thông báo tự sinh khi tạo đề (`is_auto=1`) bị loại**; ô tìm kiếm khớp/không khớp; lọc năm+kỳ (chỉ áp dụng khi có CẢ hai) và lọc môn; không khớp → `totalPages=0` |
| Danh sách gộp | `POST /getListAnnounce` | `nhom` là **mảng** tên nhóm; giữ **quirk `tenhocky` chứa MÃ học kỳ** chứ không phải tên |
| Theo nhóm | `POST /getAnnounce` | thấy thông báo kèm `avatar`; nhóm lạ → `[]` |
| Chuông SV | `POST /getNotifications`, `/getUnreadCount`, `/markAsRead` | SV thấy thông báo; số chưa xem > 0 → sau `markAsRead` = 0; **khôi phục lại đúng các dòng 'chưa xem' cũ trong `finally`** |
| Phân quyền | SV gọi `/sendAnnouncement`; GV khác gọi `/updateAnnounce`, `/deleteAnnounce` | đều **403**, dữ liệu còn nguyên |
| Sửa | `POST /updateAnnounce` | đổi nội dung + thay danh sách nhóm nhận; giữ **quirk: `trangthaithongbao` của nhóm bị bỏ KHÔNG bị dọn** (số dòng không đổi) |
| Xoá | `POST /deleteAnnounce` | `thongbao` mất, `chitietthongbao` + `trangthaithongbao` sạch theo **cascade** |
| Trang thống kê | `GET /statistic`, `?made=` | tổng hợp + chi tiết render 200; `made` lạ → 404; **đề của GV khác → 404** |
| Thống kê 1 đề | `POST /getStatictical` | `da_nop_bai`/`chua_nop_bai`/`khong_thi`/`diem_cao_nhat`/`diem_trung_binh`/`thong_ke_diem` khớp số **tính lại độc lập** bằng Prisma (không tái dùng SQL của service), cả khi lọc 1 nhóm |
| Quirk giữ nguyên | như trên | (1) "Tất cả nhóm" **đếm trùng** theo số nhóm SV tham gia (`da_nop_bai` ≥ số bài thật); (2) `thong_ke_diem` có 10 khoảng và **bỏ sót điểm đúng 10** → tổng cột = số bài có điểm < 10 |
| Bảo mật | `POST /getStatictical` bằng tài khoản GV khác | trả `{error}`, **không lộ** số liệu |
| Bộ lọc | `POST /getFilters`, `/getGroupsBySubject` | nạp đúng môn + nhóm theo học kỳ/năm học; học kỳ không có đề → mảng rỗng (không lỗi) |
| Tổng hợp | `POST /getAggregatedStatistical` | khớp số tính độc lập (kể cả `khong_thi` đếm **DISTINCT người**); lọc theo môn/nhóm cho kết quả hẹp hơn |
| Phân quyền | SV vào `/statistic` + `/statistic/getStatictical` | **403** |

**An toàn dữ liệu:** thông báo test gắn dấu `[E2E-TB] <ts>` trong nội dung, `afterAll`
xoá theo dấu này (phần phụ thuộc theo cascade) và trả `chitietquyen` về nguyên trạng;
ca `markAsRead` khôi phục ngay trong `finally`; các ca thống kê **chỉ đọc**.

Kết quả: `npx jest --config ./test/jest-e2e.json` → **69/69 pass** (5 bộ);
`pnpm run build` sạch; đối chiếu CSDL sau khi chạy trở về y như trước (3 đề / 4 kết quả
/ 3 thông báo / 19 `trangthaithongbao` đều 'chưa xem' / 13 người dùng / 3 nhóm /
18 `chitietnhom` `hienthi=1` / `chitietquyen` `thongbao`+`thongke` chỉ còn nhóm quyền 3).

## ✅ e2e xuất Excel / in PDF / nhập SV từ .xlsx (2026-08-11)

`test/excel-pdf.e2e-spec.ts` (**MỚI**, 17 ca) đưa phần Phase 7 slice 1 — trước đây mới
kiểm bằng script tay (2026-08-07 + 2026-08-08) — vào e2e. Điểm khác các bộ trước: file
`.xlsx` trả về được **đọc ngược lại bằng exceljs** (round-trip), không chỉ kiểm
`status=true`.

| Nhóm ca | Route | Kiểm gì |
|---------|-------|---------|
| Danh sách SV | `POST /module/exportExcelStudentS` | `{status,file,filename}` đúng shape + MIME `spreadsheetml.sheet`; đọc lại file: header 6 cột, **đủ đúng MSSV của nhóm**, cột "Giới tính" = `Null` (đúng chủ ý); nhóm chưa có SV → chỉ dòng header |
| Bảng điểm 1 đề | `POST /test/exportExcel` (lọc 1 nhóm) | tiêu đề gộp có tên lớp + mã đề; header 10 cột; **mọi SV của nhóm đều có dòng**; SV đã thi → `ĐIỂM TỔNG` = trắc nghiệm + tự luận + đọc hiểu và có thời gian vào thi; SV chưa thi → `Chưa làm` |
| Bảng điểm 1 đề | `POST /test/exportExcel` (`manhom=0`, `ds=[mã nhóm]`) | nhánh `getTestAll` đủ SV; tiêu đề hiện **TÊN LỚP thật** — KHÁC PHP (PHP tra `tennhom IN (<mã nhóm>)` nên luôn ra "Tất cả các lớp"); `ds=[]` → "Không có dữ liệu" |
| Ma trận điểm | `POST /test/getMarkOfAllTest` | header từ cột 3 = tên các đề giao cho nhóm (đúng thứ tự `made`); **từng ô khớp cặp (SV, đề)**, SV chưa thi → ô rỗng (PHP ghép theo chỉ số mảng nên lệch dòng); nhóm rỗng → "Không có dữ liệu" |
| Phiếu in | `GET /test/exportPdf/:makq` | trả **HTML** (không phải `application/pdf`) có `window.print()`, `<title>=Chi_tiet_ket_qua_<mssv>_MD<makq>`, điểm `toFixed(2)`, **số thứ tự "Câu N" liên tục** đủ số câu và không dư; `makq` lạ → 404; SV (không có `dethi.view`) → 403 cả `exportPdf` lẫn `exportExcel` |
| Đọc file SV | `POST /user/addExcel` | đọc được **file mẫu** `public/filemau/danhsachsv_mau.xlsx` (mọi dòng có `mssv`/`email`, `nhomquyen=2`); file tự dựng: **bỏ qua dòng thiếu MSSV và email sai định dạng**, ghép `họ đệm + tên` thành `fullname` |
| Lỗi đọc file | `POST /user/addExcel` | thiếu file → "Chưa chọn file"; đuôi `.xls` → hướng dẫn lưu thành `.xlsx`; file rác → `status:error` (**không 500**); chưa đăng nhập → 401 |
| Ghi vào nhóm | `POST /user/addFileExcelGroup` | tạo tài khoản (mật khẩu **băm bcrypt**, `manhomquyen=2`), `chitietnhom` `hienthi=1`, **`siso` = số thành viên**, tài khoản mới đăng nhập được; chạy lại → "đã có trong nhóm", **không nhân bản**; email trùng → bắt **P2002**, không tạo bản ghi mồ côi; `listuser` hỏng/rỗng → lỗi có kiểm soát |

**An toàn dữ liệu:** các ca XUẤT chỉ đọc; các ca NHẬP ghi vào một **nhóm học phần tạm**
do test tạo (`[E2E-XL] …`) chứ không đụng nhóm mẫu — `afterAll` xoá nhóm tạm
(`chitietnhom` cascade) rồi xoá các tài khoản có tiền tố `E2EXL…`.

Kết quả: `npx jest --config ./test/jest-e2e.json` → **86/86 pass** (6 bộ);
`pnpm run build` sạch; CSDL sau khi chạy y nguyên (13 người dùng / 3 nhóm với
`siso` 6-7-5 đúng số thành viên / 18 `chitietnhom`), không sót bản ghi `E2E*`.

## ✅ Trả nợ Phase 2 — "Môn học của tôi" (`view_subject`) — XONG (2026-08-13)

Module **MỚI** `src/view-subject/` (path `/view_subject`) thay `view_subject.php` +
`XemMonHocModel.php`. Trang cho **giảng viên** xem các môn được **phân công** cho
chính mình (bảng `phancong`), lọc theo năm học/học kỳ + tìm kiếm, kèm quản lý
**chương** của môn đó.

| Route | Nội dung |
|-------|----------|
| `GET /view_subject` | Trang SSR (`views/pages/view_subject.ejs`), quyền `xem_monhoc.view` |
| `POST /view_subject/{pagination,getTotalPages}` | Phân trang `pagination.js` (controller=`view_subject`, model=`XemMonHocModel`), quyền `hocphan.view` |
| `POST /view_subject/{getNamHoc,getHocKy}` | Dropdown lọc năm học / học kỳ có phân công, trả `{success,data}` |
| `POST /view_subject/{getAllChapter,addChapter,updateChapter,chapterDelete}` | Quản lý chương — **dùng lại `SubjectsService`** (cùng bảng `chuong`), gate `chuong.*` |

**KHÁC PHP (có chủ ý):**
1. **Tìm kiếm hoạt động được:** nút kính lúp của `view_subject.js` đặt từ khoá vào
   `filter.input`, nhưng `getQuery` gốc chỉ đọc `$input` cấp trên → bản PHP bấm nút
   **không có tác dụng**. Service đọc cả `args.input`/`args.content`/`filter.input`.
2. `ORDER BY` dùng `pc.mamonhoc` thay `mh.mamonhoc`: Postgres bắt cột trong `ORDER BY`
   phải nằm trong select list của `SELECT DISTINCT` (MySQL dễ dãi hơn). Hai cột bằng
   nhau theo điều kiện JOIN nên thứ tự không đổi.
3. Bỏ nút **"Thêm môn học"** ở view gốc — nó mở `#modal-add-subject` vốn KHÔNG tồn tại
   trong trang và `view_subject.js` cũng không xử lý (nút chết). Thêm/sửa môn nằm ở
   `/subject` của Admin.
4. Quản lý chương gate theo `chuong.*` (PHP chỉ `checkAuthentication`). **KHÔNG** gate
   bằng `monhoc` như module `subjects` vì nhóm quyền **Giáo Viên (1) không có quyền
   `monhoc`** — chỉ Admin (3) mới có → sẽ 403 oan.
5. `userId` lấy từ **JWT**, không tin `args.id` phía client.
6. Không port `getQuery`/`getDetail`/`search`/`getSubjectAssignment` của controller PHP:
   `view_subject.js` không gọi, và `/subject/*` đã có tương đương.

Navbar: mục `/subject` đổi nhãn thành **"Tạo môn học"** (như bản PHP) và thêm mục
**"Môn học của tôi"** → `/view_subject`.

**e2e MỚI** `test/view-subject.e2e-spec.ts` (14 ca): trang SSR đủ hook; dropdown
năm/kỳ (DISTINCT + học kỳ đúng năm); phân trang chỉ trả môn của chính GV và **đối
chiếu số dòng tính lại độc lập bằng Prisma**; cắt trang đúng; lọc năm+kỳ; tìm kiếm cả
2 nhánh + không phân biệt hoa thường; phân công **xoá mềm không hiện** (test tự tạo
dòng `trangthai=0` rồi xoá); chương thêm→đổi tên→xoá mềm (dọn **xoá cứng** ở
`afterAll` để CSDL về nguyên trạng); SV → 403 (trang HTML + AJAX JSON), chưa đăng
nhập → 401. Tổng e2e **100/100 pass** (7 bộ), `pnpm run build` sạch, CSDL sau khi
chạy y nguyên (14 chương / 9 phân công / 13 người dùng, không dòng `trangthai=0` sót).

## ✅ Rà soát toàn bộ so với bản PHP → bù 4 mảng còn thiếu (2026-08-13)

Đối chiếu 3 danh sách: **action PHP** (18 controller) ↔ **route NestJS** ↔ **URL mà
JS gốc thực sự gọi**. Kết quả: 4 mảng thiếu thật, đã làm hết.

| # | Thiếu | Đã bù |
|---|-------|-------|
| 1 | `POST /test/getTestGroup` — `class_detail.js` gọi nhưng route chưa có → tab "Đề kiểm tra" ở offcanvas nhóm học phần luôn trống | `ExamsService.getTestGroup` (thay `DeThiModel::getListTestGroup`), thời gian định dạng sẵn `H:i d/m/Y` y PHP; gate `dethi.view` |
| 2 | `POST /user/addFileExcel` — nhập **người dùng** hàng loạt ở trang Người dùng (khác `addFileExcelGroup` = nhập SV vào nhóm); `user.js` còn stub "đang phát triển" | `UsersService.addUsersFromFile` + route gate `nguoidung.create` + nối dây `user.js` (đọc `{status,data}` của `addExcel`), `accept=".xlsx"` |
| 3 | Trang cá nhân `/account` (`account.php` + `account_setting.php`) — chỉ mới có `getRole`; menu "Tài khoản" ở header trỏ `href="#"` | `GET /account` + `POST /account/{changePassword,changeProfile,uploadFile}`, view `account_setting.ejs`, JS `account_setting.js`, header trỏ `/account` |
| 4 | Đăng ký + quên mật khẩu (OTP email) — 4 trang + 6 route; link "Tạo tài khoản"/"Quên mật khẩu?" ở `signin.ejs` trỏ `href="#"` | `GET /auth/{signup,recover,otp,changepass}` + `POST /auth/{addUser,sendOptAuth,resendOtpAuth,checkOpt,changePassword}`, 4 view + `recover.js` + partial `auth-scripts.ejs` |

**KHÁC PHP (có chủ ý, phần lớn là vá lỗi/lỗ hổng của bản gốc):**
1. **Đăng ký KHÔNG dùng lại `/user/add`.** `signup.php` gốc submit sang route quản
   trị `user/add` — route đó nhận `role` từ client nên **ai cũng tự tạo được tài
   khoản Admin**. Nay có route riêng `/auth/addUser`, ép `manhomquyen = 2`.
   (`Auth::addUser` gốc thì đọc `$_POST['id']/hoten` trong khi `signup.js` gửi
   `fullname` → luồng đó không bao giờ chạy được.)
2. **Đổi mật khẩu quên phải qua OTP.** PHP chỉ cần có `$_SESSION['checkMail']` nên
   gọi `sendOptAuth` rồi `changePassword` là đổi được mật khẩu người khác **không
   cần mã**. Nay trạng thái 3 bước nằm trong **JWT 10 phút ở cookie httpOnly**
   (`recover_ticket`) và bước cuối đòi vé đã `verified` (chỉ bật sau khi nhập đúng OTP).
3. **Sửa lỗi thật:** `Auth::changePassword` gọi `NguoiDungModel::changePassword($email,…)`
   nhưng model lại `WHERE id = ?` → 0 dòng đổi, luôn báo "Đổi mật khẩu thất bại".
   Bản NestJS cập nhật đúng theo email + xoá OTP đã dùng.
4. **Giới tính ở trang đăng ký:** `signup.php` để `0 = Nam` trong khi toàn hệ thống
   (`user.js`, `account_setting`) hiểu `1 = Nam` → tài khoản tự đăng ký hiện sai
   giới tính. Nay theo quy ước chung.
5. **Ảnh đại diện** khi đó còn ghi ra `public/media/avatars/` (cột `avatar` lưu TÊN
   FILE) — **đã chuyển sang Supabase Storage 2026-08-14**, xem mục "Trả nốt 2 nợ lẻ".
   Chỉ nhận `.jpg/.jpeg/.png`; tên file KHÔNG lấy theo tên người dùng gửi lên (tránh
   `../`).
6. OTP sinh bằng `crypto.randomInt` (thay `rand()`), gửi qua `EmailService`
   (nodemailer + template EJS) có sẵn của dự án.
7. `account_setting.js`/`recover.js` tự đăng ký validator `emailWithDot` (bản gốc
   dùng rule này nhưng chỉ định nghĩa trong `user.js` → 2 trang kia ném lỗi);
   `recover.js` bỏ `JSON.parse` thừa và URL hardcode `/Quanlythitracnghiem/...`.

**BỔ SUNG `POST /test/getExamineeByGroup`** (2026-08-13): bài làm của 1 đề lọc theo
1 nhóm học phần, kèm `email/hoten/avatar` — thay `KetQuaModel::getExamineeByGroup`.
PHP có action + model nhưng **không JS nào gọi**; port cho đủ bề mặt API. Giữ nguyên
truy vấn gốc: chỉ SV **đã có bản ghi `ketqua`** (chưa thi thì không xuất hiện) và
KHÔNG lọc `chitietnhom.hienthi`. Gate `dethi.view`, body `{made, manhom}` (dùng lại
`StaticticalDto`).

**KHÔNG port (chết sẵn trong PHP, đã kiểm 0 nơi gọi):** `setting.php`,
`user_online.php`, `auth/{getUser,checkEmail}`, `account/{checkAllow,check}`,
`assignment/{getAssignment,deleteAll,getAssignmentByUser}`,
`test/{getDethi,tookTheExam,check,getGroupsTakeTests}`,
`user/getData`, `namhoc/getQuery`, `question/addExcel` (nút gốc `disabled`).

**e2e MỚI** `test/auth-account.e2e-spec.ts` (14 ca) phủ cả 4 mảng + `getExamineeByGroup`
(đối chiếu độc lập bằng Prisma: đúng số SV vừa có `ketqua` vừa thuộc nhóm, có kèm
email/hoten/avatar; nhóm không khớp → rỗng; SV → 403): đề của nhóm
(định dạng giờ + thứ tự + nhóm rỗng + SV 403); nhập user Excel (tạo tài khoản băm
bcrypt, chạy lại báo "đã có", danh sách hỏng, SV 403); đăng ký (ép nhóm quyền 2,
trùng mã/email, lệch mật khẩu, mật khẩu ngắn → 400); khôi phục mật khẩu (chặn mọi
lối tắt khi chưa có vé/chưa xác minh, OTP sai/đúng, đổi xong mật khẩu cũ hết hiệu
lực + OTP bị xoá); trang cá nhân (render, đổi mật khẩu, đổi hồ sơ + email trùng,
upload ảnh .png/.txt/không file). **`EmailService.sendRegisterOtp` bị mock** nên
không gửi mail thật; OTP đọc từ cột `nguoidung.otp`.
Tổng e2e **114/114 pass** (8 bộ), build sạch, CSDL sau khi chạy y nguyên
(13 người dùng, 0 bản ghi `E2E*`, 0 OTP treo, thư mục avatar sạch).

## ✅ Đổi thương hiệu "DHT OnTest" → "LianHarman" (2026-08-13)

Toàn bộ chỗ **người dùng nhìn thấy** đã đổi (13 file): `views/partials/{navbar,header,
footer,head}.ejs` (logo sidebar, thanh tiêu đề, footer bản quyền, `<title>` + meta
description/author), `views/pages/{landing,dashboard,export_pdf}.ejs` (kể cả dòng
`© … All rights reserved` ở landing và tiêu đề phiếu in PDF), 5 trang `views/pages/auth/*`
và `src/pages/pages.controller.ts` (Title trang chủ).

- Logo **2 tông màu** giữ nguyên bố cục, chỉ tách chữ khác: `DHT` + `OnTest` →
  **`Lian` + `Harman`** (signup: `<h1>Lian<span>Harman</span></h1>`; otp/changepass:
  span nền đen `Lian` + span xanh `Harman`; recover: `text-dark` `Lian` + `text-primary`
  `Harman`).
- **Email** (OTP đăng ký/khôi phục) lấy tên từ biến môi trường `APP_NAME` — vốn đã là
  `LianHarman` nên tiêu đề + footer "© … All rights reserved" trong mail đã đúng, không
  cần sửa template.
- **KHÔNG đụng tới:** chuỗi `DHT_OneTest` trong **comment** (đó là đường dẫn thư mục mã
  nguồn PHP gốc, cần giữ để tra cứu khi port tiếp), và ràng buộc email đăng ký
  `@dht.edu.vn` ở `views/pages/auth/signup.ejs` (là **quy tắc nghiệp vụ** — chỉ nhận
  email trường — không phải thương hiệu; muốn đổi domain thì sửa `emailPattern` ở đó).
- Kiểm chứng: render thật 7 trang (`/`, `/auth/{signin,signup,recover}`, `/dashboard`,
  `/test`, `/account`) → **0 lần** xuất hiện "DHT OnTest/OnTest DHT", brand mới hiện
  đúng chỗ. e2e vẫn **114/114 pass**.

## ✅ Trả nốt 2 nợ lẻ: đọc `.xls` cũ + avatar lên Supabase (2026-08-14)

### A. Nhập SV/người dùng đọc được cả `.xls` (BIFF) lẫn `.xlsx`

- Gói mới **`xlsx` (SheetJS) 0.20.3**, cài từ **CDN chính chủ**
  (`pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — KHÔNG dùng gói
  `xlsx` trên npm registry (kẹt ở 0.18.5, còn lỗ hổng đã vá ở bản sau). Vì thế
  `package.json` ghi dependency dạng URL tarball; máy mới cài cần vào được CDN đó.
- `src/common/utils/excel.util.ts` thêm 2 hàm trả về **cùng một ma trận chuỗi**
  (`rows[i][j]`, đã đệm tối thiểu 8 cột):
  `readXlsxSheetRows` (exceljs) và `readXlsSheetRows` (SheetJS, `raw:false` để MSSV
  dài không ra dạng số mũ, `defval:''`+`blankrows:true` để không lệch dòng/cột).
- `UsersService.parseStudentExcel` chỉ còn **rẽ nhánh theo đuôi file** rồi lọc dữ liệu
  dùng chung: dữ liệu từ **dòng 3**, cột **B/C/D/H** (index 1/2/3/7). Đuôi khác
  `.xlsx`/`.xls` → `Chỉ hỗ trợ file Excel (.xlsx, .xls)`. File rác (cả 2 đuôi) vẫn rơi
  vào nhánh lỗi có kiểm soát, KHÔNG 500.
- `views/pages/user.ejs` + `views/pages/class_detail.ejs` mở lại `accept=".xlsx,.xls"`
  (bỏ dòng hướng dẫn "hãy lưu thành .xlsx"). File mẫu vẫn là `.xlsx`.
- e2e: `excel-pdf` +2 ca (đọc `.xls` cho kết quả **giống hệt** `.xlsx`; nhập trọn luồng
  `addExcel` → `addFileExcelGroup` từ `.xls`), `auth-account` +1 ca (nhập **người dùng**
  từ `.xls`). Ca cũ "đuôi `.xls` → lỗi" đổi thành **đuôi `.csv` → lỗi**.

### B. Ảnh đại diện lưu trên Supabase Storage

- `AccountService.uploadAvatar` nay `SupabaseStorageService.uploadImage(buffer,'avatars')`
  → cột `avatar` lưu **URL đầy đủ**; ảnh cũ của chính user đó được `storage.remove()`
  dọn kèm (tên file cũ không phải URL bucket thì hàm bỏ qua). Vẫn chỉ nhận
  `.jpg/.jpeg/.png`. Hết ghi ra đĩa → chạy được trên hạ tầng **ephemeral**.
- **Tương thích ngược** là bắt buộc vì seed/dữ liệu PHP cũ lưu TÊN FILE
  (`ANHSV.png`, `avatar2.jpg`) trong `public/media/avatars/`. Hai helper cùng quy tắc
  `http(s)://… → dùng nguyên, còn lại → ghép '/public/media/avatars/'`:
  - server: `src/common/utils/avatar.util.ts` (`avatarSrc`, `DEFAULT_AVATAR`) —
    `AccountService.getProfile` trả thêm trường **`avatarUrl`** cho view;
  - client: **`public/js/avatar-url.js`** (`window.avatarUrl(avatar, fallback)`), nạp ở
    `views/partials/head.ejs` ngay sau jQuery nên MỌI trang SSR đều có.
- 12 chỗ render đã sửa: `header.ejs` (1, inline vì `user` lấy từ JWT),
  `account_setting.ejs` (2 → dùng `profile.avatarUrl`), `class_detail.js` (3),
  `client_group.js` (2), `test_detail.js` (2), `user.js` (1), `permission.js` (1).
  ⚠️ Thêm chỗ render avatar mới thì PHẢI đi qua helper, không ghép tay đường dẫn.
- e2e `auth-account`: ca upload nay đối chiếu `avatar` khớp URL bucket + trang
  `/account` in đúng `src` đó, thêm ca "avatar dạng tên file cũ vẫn ra
  `/public/media/avatars/ANHSV.png`"; `afterAll` **xoá ảnh test khỏi bucket**.
- Ảnh cũ trong `public/media/avatars/` GIỮ NGUYÊN (seed vẫn trỏ tới), không cần
  migrate; chỉ ảnh tải lên từ nay mới nằm trên Supabase.

Kiểm chứng: `pnpm run build` sạch, **e2e 118/118 pass (8 bộ)**, CSDL y nguyên
(13 người dùng / 3 nhóm / 18 `chitietnhom`, không còn bản ghi `E2E*`, không còn
`avatar` dạng URL sau khi test dọn).

## ✅ Dọn sạch lint toàn dự án (2026-08-14)

Trước phiên này `pnpm run lint` báo **1152 vấn đề** (nợ cũ tích từ đầu dự án). Nay
**`npx eslint "{src,apps,libs,test}/**/*.ts"` → 0 lỗi, 0 cảnh báo**, `npx tsc --noEmit`
và `pnpm run build` cũng sạch.

- **763 lỗi `prettier/prettier`** đã tự sửa bằng `pnpm run lint` (script có sẵn `--fix`)
  — thuần định dạng, ~58 file `src/`.
- **Sửa tay phần còn lại trong `src/` (60 lỗi)**, đáng chú ý:
  - `@types/bcrypt` **CHƯA được cài** → cả `src/lib/bcrypt/bcrypt.ts` là "error typed
    value" (TS không biết kiểu `bcrypt`). Đã `pnpm add -D @types/bcrypt`.
  - `EmailService.transporter` khai báo `nodemailer.Transporter` (generic mặc định
    `any`) → đổi sang `ReturnType<typeof nodemailer.createTransport>` để `info.messageId`
    có kiểu. Tương tự `SupabaseStorageService.client` → `ReturnType<typeof createClient>`.
  - `AllExceptionsFilter`: bỏ `as any` cho `exception.getResponse()` (đặt kiểu
    `{message?: string|string[]; errors?: unknown}`), `details: any` → `unknown`,
    `renderErrorPage(statusCode: HttpStatus)` để hết `no-unsafe-enum-comparison`.
  - `TransformInterceptor`: `map((data: unknown): IApiResponse<T> => ...)`.
  - `JwtAuthGuard.handleRequest` khai báo generic `<TUser = IExamJwtPayload>` đúng
    hợp đồng `IAuthGuard` (trước trả `any`).
  - File MỚI **`src/common/utils/text.util.ts`**: `plainText(unknown)` (object →
    chuỗi rỗng thay vì `'[object Object]'`) + `errorMessage(unknown)` cho `catch`.
    Dùng lại ở `excel.util`, `exams.service` (4 chỗ `String(...)`), `seed-db.service`
    (bỏ `catch (error: any)`).
  - Regex xoá ký tự zero-width viết bằng **escape** `/[\u200B-\u200D]/g` (trước là ký
    tự thật trong mã nguồn → `no-irregular-whitespace`).
  - Gỡ import chết: `HttpAdapterHost` (main), `PrismaPg` (prisma.service — code dùng
    `accelerateUrl`, adapter chỉ còn trong comment), `ApiProperty`, `ISoCauLevels`.
- **`eslint.config.mjs` thêm 1 override cho `test/**/*.ts`**: tắt nhóm
  `@typescript-eslint/no-unsafe-*`. Lý do: supertest khai báo `Response.body` là `any`
  nên mọi `expect(res.body.x)` đều dính rule (301 lỗi) — ép kiểu từng chỗ chỉ tạo tiếng
  ồn chứ không làm code chạy thật an toàn hơn. **`src/` vẫn bật đủ rule.**

⚠️ Sau đợt này e2e vẫn **118/118 pass**, CSDL y nguyên. Khi thêm code mới nhớ chạy
`pnpm run lint` (có `--fix`) trước khi commit để không tích nợ lại.

## ✅ Navbar lọc theo quyền + `permission.js` nạp cho MỌI trang (2026-08-16)

Rà soát lại toàn bộ dự án lần nữa (18 controller PHP ↔ route NestJS ↔ URL mà JS gốc
gọi ↔ 24 view) → **chỉ còn đúng 1 mảng thiếu thật: navbar không lọc theo quyền.**

**Bản PHP:** menu dựng động bằng `build_navbar()` (`mvc/views/inc/config.php`) —
mảng `$GLOBALS['navbar']` khai `role` cho từng mục, lọc theo `$_SESSION['user_role']`
(+ `is_admin` cho nhóm mục admin), và **chỉ in `nav-main-heading` khi nhóm còn ≥1 mục**.

**Bản NestJS trước đây:** `views/partials/navbar.ejs` hard-code 13 mục cho mọi người
→ SV thấy "Người dùng"/"Nhóm quyền"/"Năm học"…, bấm vào ra trang 403.
(Backend vẫn an toàn — `PermissionsGuard` chặn đúng; đây là lỗi giao diện.)

**Đã sửa (cách nhẹ nhất, không thêm code server):**

1. `views/partials/navbar.ejs` — mỗi `<li class="nav-main-item">` nay mang
   `data-role`/`data-action` **đúng bằng `@Permissions(...)` gác route GET của trang
   đó**, nên menu hiện ⟺ người dùng thật sự vào được:

   | Mục | data-role | data-action |
   |-----|-----------|-------------|
   | Người dùng | `nguoidung` | `view` |
   | Nhóm quyền | `nhomquyen` | `view` |
   | Năm học | `namhoc` | `view` |
   | Tạo môn học | `monhoc` | `view` |
   | Môn học của tôi | `xem_monhoc` | `view` |
   | Câu hỏi | `cauhoi` | `view` |
   | Phân công | `phancong` | `view` |
   | Nhóm học phần (GV) | `hocphan` | `view` |
   | Đề thi | `dethi` | `view` |
   | Nhóm học phần (SV) | `tghocphan` | **`join`** |
   | Lịch kiểm tra | `tgthi` | **`join`** |
   | Thông báo | `thongbao` | `view` |
   | Thống kê | `thongke` | `view` |

   "Tổng quan" KHÔNG gắn `data-role` (mọi người đều vào được, y PHP).

2. `public/js/permission.js` — thêm bước gỡ `nav-main-heading` khi mọi mục dưới nó đã
   bị xoá (`nextUntil('.nav-main-heading', '.nav-main-item').length === 0`), thay chỗ
   PHP kiểm `count($nav['navbarItem']) > 0`.

3. ⚠️ **`permission.js` chuyển vào `views/partials/footer.ejs`** — trước đó chỉ 15/21
   trang tự nạp nó, 6 trang (`dashboard`, `client_group`, `test_schedule`,
   `test_detail`, `select_question`, `vao_thi`) thì KHÔNG. Vì `custom.css` có
   `[data-role] { opacity: 0 }` (chỉ `.show` do permission.js gắn mới hiện), navbar ở
   6 trang đó sẽ **trắng vĩnh viễn** nếu không sửa. `partials/footer.ejs` được include
   đúng bởi 21 trang main-layout (landing/export_pdf/auth/trang lỗi không có) nên là
   chỗ tương đương `main_layout.php` của PHP. **Đã gỡ 15 thẻ `<script>` lẻ** — nạp 2
   lần là `SyntaxError: Identifier 'role' has already been declared`, chết cả hai.
   Tiện thể **chuông thông báo SV cũng hết hỏng** ở dashboard/lịch kiểm tra/nhóm học
   phần (trước đó 3 trang này không nạp permission.js nên chuông không chạy).

**KHÁC PHP (có chủ ý):** PHP còn chặn thêm bằng `is_admin` (`manhomquyen == 3`) cho
`nguoidung`/`phancong`/`nhomquyen`, nhưng chính `user.php` gốc lại gác bằng
`checkPermission("nguoidung","view")` — tức GV (nhóm 1, seed CÓ quyền `nguoidung`)
vẫn vào `/user` được, chỉ là navbar giấu link. Bản NestJS bỏ tầng `is_admin` để menu
khớp đúng cái `PermissionsGuard` cho phép. Muốn giấu lại thì bỏ quyền `nguoidung` của
nhóm 1 trong `/roles` (chuẩn hơn là hard-code theo nhóm).

**Kiểm chứng (server thật, `node dist/src/main.js`, dữ liệu seed):** đăng nhập
`admin`/`gv001`/`sv001` → đọc `/account/getRole` + HTML `/dashboard`, chạy lại đúng
logic permission.js:

| | admin | gv001 | sv001 |
|---|---|---|---|
| Số mục còn lại | 10 | 5 | 3 |
| Heading bị gỡ | Sinh viên | Sinh viên, Khác | Quản lý, Khác |

20 lượt tải trang (10 admin + 6 GV + 4 SV) đều **HTTP 200 và nạp `permission.js` đúng
1 lần**. `pnpm run build` + `pnpm run lint` sạch.

## Rà soát hiện trạng khi tiếp quản (2026-10-17)

Đối chiếu `CLAUDE.md`, toàn bộ bộ tài liệu `docs/`, nguồn PHP hiện nằm ở
`../PHP/`, code NestJS và SQLite `.codegraph/codegraph.db` tại thư mục cha.
Mốc bàn giao code gần nhất trong git là `70b1d741` ngày 2026-08-16 (navbar theo quyền).

**Phạm vi port:** cả 7 phase có code triển khai và module đăng ký trong `AppModule`.
Graph ghi nhận 188 route NestJS; schema hiện có 26 model, thư mục migrations có
22 migration. Không dùng tổng số file graph làm tỷ lệ hoàn thành vì graph chứa
nhiều thư viện frontend. Graph được index ngày 2026-10-17; đối chiếu hash 222 file
nguồn/test NestJS và PHP MVC có 221 file khớp, riêng `src/prisma/prisma.service.ts`
đã khác bản được index nên phải đọc trực tiếp. Không kết luận production đã sẵn sàng.

**Kiểm chứng mới trong môi trường Codex hiện tại:**

| Kiểm tra | Kết quả |
|----------|---------|
| `node node_modules/@nestjs/cli/bin/nest.js build` (nội dung script build) | PASS, exit 0; entrypoint sinh ra là `dist/src/main.js` |
| `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"` (không `--fix`) | FAIL: 6 lỗi `prettier/prettier`, đều ở `src/prisma/prisma.service.ts` |
| Jest chọn riêng ca không cần đăng nhập trong `app` + `error-pages` | 2 bộ PASS; 6 ca PASS, 4 ca không được chọn |
| Truy vấn PostgreSQL chỉ đọc | Bị môi trường hiện tại chặn với `EACCES`; chưa xác minh được dữ liệu/migration đang áp trên DB |
| `GET /question/getQuestion` trên app khởi tạo từ bản build mới | HTTP 404 |

Không chạy lại toàn bộ 118 ca nghiệp vụ vì chúng cần DB và có tạo/sửa/xoá dữ liệu
kiểm thử. Con số **118/118** ở các mục trước là kết quả bàn giao lịch sử, không phải
kết quả xác nhận lại hôm nay. Khi chạy riêng `error-pages`, Jest vẫn báo 9 pass dù
đăng nhập `/auth/login` trả 500: `login()` trả `null` cho mọi HTTP >=400, rồi 4 ca
`if (!cookie) return` kết thúc mà không assert. Vì vậy cần kiểm tra điều kiện dữ
liệu/đăng nhập khi đọc kết quả e2e, không chỉ nhìn số ca pass. Lượt chạy chọn riêng
6 ca ở bảng trên không phụ thuộc cơ chế bỏ qua này.

**Các điểm còn lại đã xác nhận:**

- `public/js/pages/question.js:1418` vẫn gọi `/question/getQuestion` và hàm được
  gọi lúc khởi tạo ở dòng 2059, trong khi controller không có route tương ứng.
  Lời gọi này cũng có trong PHP cũ; đây là phần legacy cần xử lý, chưa thể nói
  mọi URL frontend đều đã khớp backend. Các route phân trang câu hỏi hiện có riêng.
- `package.json` khai `start:prod = node dist/main`, nhưng build mới không sinh
  `dist/main.js`; đường dẫn hiện có là `dist/src/main.js`.
- Cấu hình local tại lúc rà soát bật `SEED_DB=true` và `CLEAR_DB=true`.
  `SeedDbService.onModuleInit()` có nhánh xoá dữ liệu trước khi seed; cần rà lại
  trước khi chạy với dữ liệu cần giữ. Mọi lượt dựng app trong phiên này đều ép
  `SEED_DB`, `CLEAR_DB`, `SEED_DEMO_DATA` thành `false`, không gọi seed/migration.
- `docs/01`, `docs/04`, `docs/05` còn một số trạng thái hoãn/stub cũ và đường dẫn
  `../DHT_OneTest/`; `docs_API/README.md` vẫn mô tả khung BaseAuth trước khi gỡ.
  Dùng code hiện tại và các mốc mới ở tài liệu này để xác định tiến độ.
- Nhập câu hỏi từ Excel vẫn disabled theo PHP gốc; Word đã có triển khai.
  Dọn ảnh câu hỏi/bài tự luận cũ trên bucket vẫn là TODO trong `docs/06`.
  Xuất PDF hiện là trang HTML gọi `window.print()`, không phải file PDF do server sinh.

Lượt rà soát ban đầu chỉ cập nhật tài liệu, giữ các thay đổi đang có và không
commit/push. Sau đó user yêu cầu sửa toàn bộ và bỏ theo dõi hai file pnpm ở local
lẫn remote; kết quả triển khai ở mục dưới.

## Khắc phục sau rà soát theo yêu cầu user (2026-10-17)

- **Prisma:** kiểm tra URL, chọn `PrismaPg` cho PostgreSQL trực tiếp và
  `accelerateUrl` cho Prisma; không ép tắt kiểm chứng TLS. Startup chạy `SELECT 1`
  trước khi báo thành công, kết nối có timeout. Helper của script seed dùng cùng
  nguyên tắc, không ép SSL cho DB local. Các URL sai bị từ chối sớm.
- **Seed:** chỉ chuỗi chính xác `CLEAR_DB=true` cho phép xoá trước khi seed.
  `.env.example` và `.env` local đã tắt `SEED_DB`/`CLEAR_DB`; không seed/clear remote.
- **Production:** `start:prod` đã trỏ đúng `dist/src/main.js`.
- **Trang câu hỏi:** bỏ lời gọi legacy `/question/getQuestion`, giữ phân trang đang
  hoạt động. Thêm `POST /question/addExcel` (preview) và `GET /question/excelTemplate`,
  đều gate `cauhoi.create`, raw JSON, exclude prefix. Nhận `.xlsx`/`.xls`, hỗ trợ
  mcq/essay/reading, nhóm đọc hiểu liên tiếp, giữ id nguồn để đối chiếu preview.
  Kiểm tra toàn bộ preview trước khi lưu qua `addQuesFile`, không ghi dở lô sai.
  UI dùng chung pipeline Word, dọn preview cũ khi đổi file và huỷ request cũ.
- **HTML preview:** helper `public/js/question-html.js` escape cả hai loại dấu nháy
  cùng `&<>`, ngăn dữ liệu có dấu nháy làm gãy thuộc tính input/chèn event handler.
- **Ảnh:** dọn ảnh câu hỏi/đáp án/tự luận/avatar thay thế sau commit, đúng origin và
  bucket; giữ ảnh còn được tham chiếu (kể cả soft-delete hoặc câu tự luận đã nộp).
  Thay ảnh tự luận không nối thêm bộ ảnh cũ. Lỗi cleanup không làm báo lưu thất bại.
- **E2e:** login lỗi/thiếu cookie/thiếu fixture báo lỗi rõ ràng; tài khoản SV cho
  kiểm tra quyền là bắt buộc. Tách public-pages dùng provider DB rỗng dành riêng
  cho test; không giả lập kết quả nghiệp vụ. Sửa ca mật khẩu cũ để kiểm HTTP 401
  trực tiếp thay vì đòi helper trả null.
- **Tài liệu:** cập nhật overview/kiến trúc/map/Storage/playbook/README; API hiện tại
  ở `docs_API/README.md`, bản BaseAuth cũ chuyển sang `legacy-baseauth.md`.
- **Git:** theo yêu cầu user, giữ `pnpm-lock.yaml` và `pnpm-workspace.yaml` trên đĩa,
  ignore và bỏ theo dõi. Workspace file vốn chưa được track, lockfile được untrack;
  không xoá lịch sử Git. Không đưa `DESIGN.md` ngoài phạm vi vào thay đổi này.

Đã đồng bộ 6 commit triển khai lên nhánh `NestJS`, mốc code/tài liệu
`2fedbc91884bb718eed83685ecbcec6dff06339c`. Kiểm tra trực tiếp ref và tree GitHub:
hai file pnpm đều không nằm trong nhánh, trong khi bản local vẫn tồn tại và được
ignore. Terminal không có mạng GitHub nên dùng connector để ghi commit rồi đồng
bộ chính xác các Git object về local; không force push, không sửa lịch sử cũ.

**Kiểm chứng sau sửa:**

| Kiểm tra | Kết quả |
|----------|---------|
| Build NestJS | PASS |
| TypeScript `--noEmit` | PASS |
| ESLint toàn bộ src/test, không tự sửa ở lượt cuối | 0 lỗi / 0 cảnh báo |
| Unit Jest | 82/82 PASS, 7 bộ |
| E2e toàn bộ với fixture đầy đủ | 136/136 PASS, 11 bộ, 0 skipped |
| JS syntax và `git diff --check` | PASS |
| Script seed: truy vấn chỉ đọc trên DB tạm | PASS (`SELECT 1`) |
| Review độc lập | Hai lỗi Important được sửa và kiểm tra lại; không còn blocker |

E2e chạy với PostgreSQL PGlite 0.4.1 trong bộ nhớ, áp đủ **22 migration**, seed ra
13 người dùng / 38 câu hỏi / 3 đề / 3 nhóm; socket pool giới hạn 1 kết nối theo
giới hạn backend của PGlite. Storage dùng HTTP server local thay cho dịch vụ thật,
email OTP mock như bộ test gốc. Các file verifier/log nằm trong `.codegraph/` local,
không thêm dependency vào sản phẩm. Không thay `.env` sang DB tạm và không ghi DB
hay bucket remote. Kết quả này xác nhận code/HTTP/SQL/Excel trên fixture tạm,
chưa xác nhận kết nối DB/Storage thật từ môi trường mạng hiện tại (`EACCES`).
Trình duyệt tự động không khả dụng; kiểm UI dựa trên HTML/JS, HTTP e2e và review
encoder với HTML parser, chưa chạy thao tác thủ công trên trình duyệt thật.

## Việc kế tiếp (gợi ý)

**Cả 7 phase đã XONG.** Việc còn lại là kiểm chứng & nợ lẻ:

1. ~~Test **export Excel / in PDF** với dữ liệu mẫu~~ — **XONG 2026-08-07**.
   ~~Kiểm `user/addExcel` + `user/addFileExcelGroup`~~ — **XONG 2026-08-08**.
2. ~~Mở rộng e2e sang luồng nghiệp vụ~~ — **XONG 2026-08-08**
   (`test/exam-flow.e2e-spec.ts`); ~~đề **tự động**, **chấm tự luận**, luồng
   `/client/*`~~ — **XONG 2026-08-10** (`test/exam-auto-essay.e2e-spec.ts`);
   ~~thông báo (`/teacher_announcement/*`) + thống kê (`/statistic/*`)~~ —
   **XONG 2026-08-11** (`test/announcement-statistic.e2e-spec.ts`);
   ~~nhập/xuất Excel + in PDF~~ — **XONG 2026-08-11** (`test/excel-pdf.e2e-spec.ts`).
   → Toàn bộ nghiệp vụ đã có e2e (**118 ca / 8 bộ** sau 2026-08-14).
3. ~~`view_subject.php`~~ — **XONG 2026-08-13** (module `src/view-subject/`, kèm e2e).
   ~~4 mảng thiếu phát hiện khi rà soát toàn bộ (đề của nhóm, nhập user Excel, trang
   cá nhân, đăng ký + quên mật khẩu)~~ — **XONG 2026-08-13** (xem mục rà soát ở trên).
4. ~~`getExamineeByGroup`~~ — **XONG 2026-08-13** (`POST /test/getExamineeByGroup`).

### Nợ lẻ — ĐÃ TRẢ HẾT (2026-08-14)

~~A. Đọc file `.xls` cũ (BIFF) khi nhập SV/người dùng~~ và
~~B. Chuyển ảnh đại diện sang Supabase Storage~~ — **XONG 2026-08-14**, chi tiết ở mục
"Trả nốt 2 nợ lẻ" phía trên.

**Không còn hạng mục port nào đang treo.** Nhập câu hỏi Excel và dọn ảnh thay thế
đã được làm ngày 2026-10-17. Bước vận hành tiếp theo là kiểm tra DB/Storage thật
trong môi trường có quyền mạng. Migrate avatar local cũ lên bucket là lựa chọn
riêng nếu muốn bỏ thư mục ảnh cũ; hiện vẫn tương thích cả tên file và URL.
