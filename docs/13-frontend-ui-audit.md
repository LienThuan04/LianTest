# Frontend audit — 2026-10-17

**Trạng thái:** bản audit/baseline lịch sử trước migration. Đã triển khai sau khi
user duyệt; xem [14 — checkpoint và kiểm chứng](./14-frontend-migration-verification.md)
và [15 — media LianTest](./15-media-audit.md) cho trạng thái hiện tại.

Tài liệu này phục vụ yêu cầu full frontend design migration + public product experience.
Nguồn visual là [DESIGN.md](../DESIGN.md), đã đọc toàn bộ, kể cả Quick Start/Tailwind.
Nguồn nghiệp vụ là controller, EJS và JavaScript hiện tại. Không dùng tài liệu tiến độ
thay cho việc kiểm tra source. [Krepling](https://www.krepling.com/) chỉ tham khảo cách
dẫn từ giá trị sản phẩm, các chương tính năng, FAQ đến CTA.

## 1. Phạm vi và trạng thái Git

- Repo ứng dụng: `NestJS/`, branch `NestJS`; HEAD lúc audit `b46b09d2`.
- Trước audit, tracked working tree sạch; `DESIGN.md` là file người dùng cung cấp,
  đang untracked. Không sửa hoặc thay thế file này.
- Audit không thay backend, database, API, auth, nghiệp vụ hoặc UI.
- Không commit/push/merge/rebase. Hai file pnpm vẫn local-only và ignored.
- Các nhận định responsive/accessibility dưới đây là kết quả kiểm tra source;
  chưa thay thế kiểm tra browser/screenshot ở milestone triển khai.

## 2. Stack và kiến trúc thực tế

| Nội dung | Kết quả từ source |
|---|---|
| Framework | NestJS 11; package khai `^11.0.1`, bản installed `11.1.19` |
| Rendering | Express + EJS `5.0.2`, server-rendered HTML |
| Router | Nest controllers `VERSION_NEUTRAL`, không có Next App Router/Pages Router |
| Frontend | Bootstrap/Dashmix assets vendored + jQuery `3.6.1` |
| Styling | `public/css/dashmix.css`, `custom.css`, CSS inline từng EJS, style sinh từ JS |
| Theme | Bootstrap primary cũ `#0665d0`; sidebar teal; nhiều theme riêng theo page |
| Shared UI | 7 partial: head, navbar, header, footer, script, auth-scripts, statistic_cards; không có React component library |
| State/data | jQuery AJAX, state theo page; không có React Query/Redux; không có API client trung tâm |
| Rich editor | CKEditor 4 local cho câu hỏi; CKEditor 5 CDN cho tự luận khi thi |
| Plugins | Select2 4.0.13, Flatpickr 4.6.13, SweetAlert2 local 11.6.15, Chart.js 3.9.1, jquery-validation, bootstrap-notify |
| Animation | Bootstrap/Dashmix transitions; dashboard Slick CDN; landing fade/hover; CSS bubbles/moveUpDown; chuông rung |
| Fonts | Inter đã được chọn trong Dashmix; có file Latin local và font-face CDN gồm Vietnamese. Auth riêng còn dùng Poppins |
| Config không tồn tại | Không Next config, Tailwind config hoặc React runtime để migrate |
| Công cụ | Node `v24.19.0`; có `corepack.cmd`, shell hiện chưa tìm thấy `pnpm` |

Có **32 template page**, với **22 khối `<style>`**, **77 thuộc tính `style=`**,
**42 thẻ form**, **19 thẻ table** trong source page EJS. Các số này chưa tính
partial và HTML sinh động bởi JavaScript; không tương đương số component độc lập.

## 3. Routing, auth và quyền cần giữ

- `/` đã là route public, render `pages/landing`; không phải tạo mới route hoặc
  gỡ guard của dashboard để có landing.
- `/auth/signin`, `/auth/signup`, `/auth/recover`, `/auth/otp`,
  `/auth/changepass` thuộc flow hiện tại. OTP/reset còn kiểm tra recovery ticket.
- `/dashboard`, `/account` cần đăng nhập. Những trang nghiệp vụ có thêm
  `@Permissions(resource, action)` và các kiểm tra sở hữu/phân công hiện tại.
- JWT qua cookie httpOnly `ACCESS_TOKEN_COOKIE || access_token` hoặc Bearer;
  logout là `POST /auth/logout`. Recovery ticket là cookie riêng. Không đổi các
  thiết lập, hạn sử dụng, endpoint hay redirect này.
- Không thấy refresh-token flow trong auth hệ thi hiện tại; không bổ sung hoặc
  sửa kiến trúc auth do tên dependency/comment cũ gợi ý.
- Role thật: giảng viên, sinh viên, quản trị viên; quyền thực tế dựa bảng RBAC,
  không suy ra mọi người cùng role được dùng tất cả menu.
- `isLoggedIn` ở landing hiện chỉ kiểm tra sự hiện diện cookie. Chỉ dùng để đổi
  CTA thành “Vào ứng dụng”; việc xác thực vẫn ở guard của `/dashboard`. Cookie
  hết hạn/không hợp lệ không được xem là bằng chứng đăng nhập thành công.
- HTML GET chưa đăng nhập chuyển signin; HTML lỗi render trang lỗi. XHR/API vẫn
  trả JSON. Không thay cơ chế phân nhánh này.
- URL SSR/AJAX gốc được exclude khỏi `/api/v1` trong
  `src/config/app-setup.config.ts`. Giữ cả spelling endpoint cũ.

## 4. UI inventory đầy đủ

`UPDATE`: giữ cấu trúc/logic chính, chuẩn hóa visual và semantics.
`REBUILD UI`: thay bố cục/presentation, giữ handler, dữ liệu và nghiệp vụ.
`KEEP`: phần đã phù hợp hoặc contract cần giữ; không có nghĩa toàn trang đã đạt design.
Tên template bên dưới tương đối với `views/pages/`.

| # | Area / route | Template | Hiện trạng / compliance | Phân loại và hành động |
|---|---|---|---|---|
| 1 | Public `/` | `landing.ejs` | Thấp: cyan gradient, tên DHTONTEST trộn LianHarman, stock team images, link `#`, chưa demo/FAQ/storytelling | REBUILD UI; 12 section theo spec, giữ public và CTA auth |
| 2 | `/auth/signin` | `auth/signin.ejs` | Thấp: theme inline riêng, label chưa liên kết field | REBUILD UI; form/login/pending/error giữ nguyên |
| 3 | `/auth/signup` | `auth/signup.ejs` | Thấp: standalone Poppins, custom dialogs, form và validation riêng | REBUILD UI; giữ registration, terms/error và redirect |
| 4 | `/auth/recover` | `auth/recover.ejs` | Thấp: Poppins, placeholder thay label | REBUILD UI; giữ gửi OTP, notify/validation |
| 5 | `/auth/otp` | `auth/otp.ejs` | Thấp: theme riêng, countdown/input semantics cần chuẩn | REBUILD UI; giữ verify/resend 60s và ticket |
| 6 | `/auth/changepass` | `auth/changepass.ejs` | Thấp: theme riêng, labels/focus chưa đồng nhất | REBUILD UI; giữ reset password và trường `comfirm` |
| 7 | `/dashboard` | `dashboard.ejs` | Thấp: rail 960px, stock carousel 400px, onboarding ảnh nền | REBUILD UI; workspace/product composition, giữ onboarding email |
| 8 | `/account` | `account_setting.ejs` | Partial: Bootstrap forms/tabs nhưng stock banner, avatar overlap | UPDATE + thay visual hero; giữ profile/password/upload |
| 9 | `/user` | `user.ejs` | Partial: table/modal/search/Excel có sẵn; header tối, actions nhiều màu | UPDATE; table, toolbar, import, form/modal |
| 10 | `/roles` | `roles.ejs` | Partial: permission matrix và member modal; matrix rộng thiếu wrapper | UPDATE; giữ checkbox mapping và quyền join |
| 11 | `/namhoc` | `namhoc.ejs` | Thấp: gradient teal/indigo, focus xanh, shadow nặng | UPDATE; năm/học kỳ/status, pagination riêng |
| 12 | `/subject` | `subject.ejs` | Thấp: theme indigo riêng, cards16px, warning actions | UPDATE; môn/chương, search, CRUD/collapse |
| 13 | `/view_subject` | `view_subject.ejs` | Thấp: gradient/green/hover lift, modal12px | UPDATE; môn được phân công, filters/chương; không thêm tạo môn |
| 14 | `/assignment` | `assignment.ejs` | Thấp: theme olive, 2 pagination scopes, Select2 | UPDATE; phân công, bảng môn chọn, create/edit |
| 15 | `/module` | `module.ejs` | Partial: form/modal chuẩn cũ; bảng nhóm thực tế sinh từ `module.js` | UPDATE cả EJS và HTML sinh động; giữ ẩn/hiện/xóa |
| 16 | `/module/detail/:manhom` | `class_detail.ejs` | Partial: toolbar cứng, table thiếu wrapper, modal4tabs | UPDATE; roster, sort, export, nhập SV/invitation/offcanvas |
| 17 | `/client/group` | `client_group.ejs` | Thấp: disable responsive overflow, table7cột, join CTA xanh | UPDATE; join/hide/leave/restore và tab đề/thông báo/bạn học |
| 18 | `/client/test` | `test_schedule.ejs` | Thấp: min-width1000px cả mobile, mobile labels thiếu data-label | REBUILD UI bảng responsive; giữ filters/scores/start/review |
| 19 | `/test` | `test.ejs` | Partial: bảng9cột do JS sinh, nowrap và badge/action nhiều màu | UPDATE; list/search/filter/CRUD, scroll có phạm vi |
| 20 | `/test/add`, `/test/update/:made` | `add_update_test.ejs` | Thấp: theme blue/green, nested forms, cấu hình nhiều nhánh | UPDATE; không đổi type/count/mark/config/validation |
| 21 | `/test/select/:made` | `select_question.ejs` | Thấp: counters nhiều màu, title đỏ, sizing override | UPDATE; bank/selected list/preview/mobile toggle/save |
| 22 | `/test/start/:made` | `vao_thi.ejs` | Partial: nhiều trạng thái availability/result, metadata hẹp | UPDATE; giữ tất cả EJS business condition và result visibility |
| 23 | `/test/taketest/:made` | `de_thi.ejs` | Thấp: col8/4 cố định, header/margin mobile, state cam/xanh/đỏ | UPDATE ưu tiên usability; question nav/timer/answer/editor/submit |
| 24 | `/test/detail/:made` | `test_detail.ejs` | Partial: bảng điểm/grading/chart tốt về chức năng; toolbar/state lệch | UPDATE; tabs, filters, essay panel, results/export |
| 25 | `/test/exportPdf/:makq` | `export_pdf.ejs` | Partial: print A4 riêng đúng nghiệp vụ; màn nhỏ label130px | KEEP cấu trúc/print behavior; UPDATE visual và screen-only responsive |
| 26 | `/teacher_announcement` | `teacher_announcement.ejs` | Thấp: teal/green gradients trong EJS lẫn JS | UPDATE; filters/table/empty/actions |
| 27 | `/teacher_announcement/add`, `/teacher_announcement/update/:matb` | `add_announce.ejs` | Thấp: gradient, select300px không wrap | UPDATE; message/group picker và create/edit branches |
| 28 | `/statistic`, `/statistic?made=...` | `statistic.ejs` | Thấp: 8 metric cards bão hòa, chart màu cũ | UPDATE cả aggregate/detail; không bịa nội dung tab placeholder |
| 29 | HTML error403 (filter render) | `error/page_403.ejs` | Partial: đúng HTTP/wording nhưng visual theme cũ | UPDATE; giữ recovery links/status |
| 30 | HTML error404 (filter render) | `error/page_404.ejs` | Partial: đúng error flow, visual cũ | UPDATE; giữ “không được tìm thấy” |
| 31 | HTML error500/generic (filter render) | `error/page_500.ejs` | Partial: generic status/dev detail đúng, visual cũ | UPDATE; không lộ chi tiết production |
| 32 | `/question` | `question.ejs` | Thấp: modal XL, vùng700px, theme/import gradient, nhiều HTML do JS sinh | UPDATE; filters/editor/MCQ/essay/reading/images/Word/Excel preview/import |

Đối soát đủ32 template thực tế; create/edit dùng chung một template được ghi
trong cùng hàng. Error pages do exception filter render, không phải route public
độc lập. Bảng không tính partial như một page.

## 5. Shared UI inventory và reuse

| Primitive/area | Hiện tại | Phân loại / cách migrate |
|---|---|---|
| `partials/head.ejs` | Meta chung, Dashmix/custom CSS, jQuery/avatar helper | UPDATE load order/tokens/meta; giữ scripts mà signin đang dùng |
| `navbar.ejs` | Inline teal, external logo, dark toggle, RBAC menu | REBUILD presentation; giữ nav groups/permission/layout hooks |
| `header.ejs` | Theme picker, slogan dài, account/logout, notification dropdown25rem | REBUILD presentation; light56px, wrap/clamp; giữ account/bell/logout |
| `footer.ejs` | Footer app + load permission.js | UPDATE; load permission đúng1lần, không đưa vào public |
| `script.ejs` | Dashmix runtime | KEEP mechanics; chỉnh appearance qua stylesheet riêng |
| `auth-scripts.ejs` | jQuery/Dashmix/validation/notify/recover.js | KEEP thứ tự và recovery handlers |
| `statistic_cards.ejs` | 8 cards tô màu trạng thái | UPDATE white cards, text/icons và metric IDs giữ nguyên |
| Font Inter | Đã có, là substitute hợp lệ | KEEP family; thống nhất weights400/600/700, xác minh dấu tiếng Việt |
| Button/link | Bootstrap variants, nhiều per-page overrides | UPDATE một bộ variants; primary pill, secondary outline, utility4px |
| Input/textarea/select/date/file | Bootstrap + Select2/Flatpickr/CKEditor | UPDATE tokens/labels/help/error/focus/disabled; giữ plugin và field contract |
| Checkbox/radio/switch/answer | Bootstrap + custom .btn-answer/state classes | UPDATE appearance, giữ selected/correct/wrong/pending phân biệt bằng chữ/icon |
| Card/panel/metrics | .block/.card + inline gradients/shadows | MERGE visual về white8px; feature illustrations24px chỉ nơi phù hợp |
| Modal/sheet/dropdown/tabs | Bootstrap, signup custom dialogs, offcanvas | UPDATE shared appearance, focus/keyboard/labels; giữ `data-bs-*`/IDs |
| Tables/sort/actions | EJS + JS strings; nhiều nowrap/overflow overrides | UPDATE responsive, headers/rows, accessible sort/actions; giữ data semantics |
| Search/filter | form và dropdown lặp lại | UPDATE spacing/pill search; không thay filter/data-fetch architecture |
| Pagination | `Pagination` class + năm học pagination riêng | KEEP logic/scopes; UPDATE presentation và keyboard labels |
| Loading/pending | spinner/button/icon riêng lẻ | UPDATE busy/live states; không thay request sequencing |
| Empty/error/toast | text strings, notify, Swal, lỗi có nơi chỉ console | UPDATE presentation và local readable feedback; không thay endpoint/validation |
| Tooltip | title và Dashmix/Bootstrap hooks | UPDATE accessible name trên icon action; không cài tooltip library mới |
| Legacy styles | custom.css mobile global, page styles, gradient helpers | REMOVE/MERGE sau xác minh usage; chuyển rule theo area, không xóa behavior |

## 6. Khoảng cách với DESIGN.md

| Foundation | Source of truth | Gap hiện tại / hướng áp dụng |
|---|---|---|
| Palette | iris `#4255ff`, charcoal `#282e3e`, muted `#586380` | Primary cũ/teal/olive/cyan/green chưa thống nhất; map semantic vars và component states |
| Surface | canvas `#f6f7fb`, white, lilac `#edefff` | Có gradient/photo/heavy tinted cards; thay bằng hierarchy2level |
| Type | Inter được phép; 12/14/16/20/24/32/44; body400/title600 | Auth Poppins, bold headings quá nhiều, scale riêng |
| Space/layout | rail1200, base8, card24, section80 | Dashboard960; nhiều fixed width/spacing per-page |
| Shape | card8/control4/primarypill200/feature24 | Radius6/10/12/16/20/rounded4 trộn lẫn |
| Shadow | 0 4px16px10%, button0 2px4px10% | Nhiều shadow-lg, hover lift và shadow20–24px |
| Nav | White56px, compact, single accent | Teal sidebar, dài dòng, theme switcher và dark toggle |
| States | Spec không cho bộ error/success riêng | Cần chữ/icon/border rõ; không chỉ xóa màu rồi làm mất status |
| Responsive | Spec chủ yếu mô tả desktop | Derive stacking/wrapping từ rail và hierarchy; kiểm tra6breakpoints |
| Accessibility | Spec chưa chi tiết forms/dialog/state | Bổ sung semantic labels/focus/keyboard/reduced-motion theo yêu cầu user |
| Light/dark | Chỉ định light | Gỡ UI chọn theme cũ như phần visual migration; không viết dark theme mới |

Các chỗ cần chuẩn hóa cách đọc spec, không tự sửa file gốc:

1. Dòng Iris Bolt nói không dùng primary CTA nhưng phần component, ví dụ, Do/Don't
   đều yêu cầu filled primary `#4255ff`. Đề xuất theo hướng dẫn component lặp lại.
2. `#282e3` xuất hiện trong prose là mã không hợp lệ; dùng `#282e3e` trong bảng token.
3. Leading `18/20/24/...` phải có đơn vị px hoặc ratio, không copy thành unitless18.
4. `radius-buttons:4px` dành utility; primary filled tuân quy tắc pill200px cụ thể.
5. Không có thiết kế dark hoặc bản màu success/error; không tự thêm saturated palette.

## 7. Feature truth matrix để viết landing

| Capability | Trạng thái từ source | Evidence | Cách giới thiệu hợp lệ |
|---|---|---|---|
| Đăng nhập/đăng ký SV/OTP reset | IMPLEMENTED | `src/exam-auth`, auth views, `recover.js` | Truy cập qua tài khoản; không quảng bá social login |
| Profile/password/avatar | IMPLEMENTED | `src/account`, account setting | Cập nhật tài khoản cá nhân |
| User/role/RBAC | IMPLEMENTED | `src/users`, `src/roles`, guards/permission.js | Quản trị tài khoản và phân quyền |
| Môn/chương/năm/học kỳ/phân công | IMPLEMENTED | subjects/view-subject/academic-years/assignments | Tổ chức nội dung và lớp theo học kỳ |
| Ngân hàng MCQ/tự luận/đọc hiểu | IMPLEMENTED | questions controller/service/views/JS | Nhiều loại câu hỏi, nội dung/ảnh theo hỗ trợ hiện có |
| Nhập Word/Excel, mẫu file | IMPLEMENTED | question upload/Excel parser + question UI | Giảm thao tác nhập; không nói hỗ trợ mọi định dạng |
| Tạo đề thủ công/tự động | IMPLEMENTED | exams + action_test/select_question | Chọn câu hoặc cấu hình theo ngân hàng câu hỏi |
| Nhóm học phần/invitation/roster | IMPLEMENTED | class-modules + client | Giao đề cho nhóm; SV tham gia bằng mã |
| Làm bài/timer/MCQ/essay/images | IMPLEMENTED | de_thi.js, exams submit | Làm bài trực tuyến, theo dõi câu và thời gian |
| Local draft/cache | IMPLEMENTED có phạm vi | localStorage + IndexedDB trong de_thi.js | Không cam kết offline hoặc không mất dữ liệu mọi tình huống |
| MCQ scoring và chấm essay | IMPLEMENTED | exams grading + test_detail.js | Trắc nghiệm tính điểm; tự luận do giảng viên chấm; không hứa mọi kết quả tức thì |
| Kết quả/review/export | IMPLEMENTED | vao_thi/test_detail, export service/PDF view | Xem theo thiết lập đề/quyền; Excel và trang in lưu PDF |
| Thông báo | IMPLEMENTED | announcements + permission.js | Thông báo theo nhóm; không quảng bá realtime socket |
| Thống kê | IMPLEMENTED | statistic service/Chart.js | Tổng hợp/chi tiết điểm trong phạm vi hiện tại |
| Tab-switch tracking | IMPLEMENTED có phạm vi | de_thi.js + `/test/chuyentab` | Không gọi là proctoring hay bảo đảm chống gian lận |
| Landing demo/public narrative | PLANNED trong task này | Chưa có implementation | Ghi rõ demo minh họa, không lưu kết quả thật |
| AI grading/proctoring/realtime/mobile app | UNKNOWN / không có bằng chứng triển khai | Không thấy trong luồng đã audit | Không đưa vào marketing |
| Tab chấm điểm ở statistic | IN PROGRESS ở presentation | Nội dung placeholder trong statistic.ejs | Không quảng bá placeholder thành capability mới |

Không sử dụng số demo seed làm số trường/tài khoản/bài thi đang dùng sản phẩm.
Không tạo testimonials, khách hàng, awards hoặc trust logos.

## 8. DOM/behavior contracts khi triển khai

- Giữ IDs `page-container/page-header/sidebar/main-container`, Dashmix layout
  toggles, nav grouping và mọi `data-role`/`data-action`.
- `permission.js` chỉ load một lần trên app shell. Giữ `[data-role].show`,
  `.col-action`, `.col-header-action`; public không gọi `/account/getRole`.
- Không chèn `.content` mới trước `.content[data-id]` mà page JS đang đọc đầu tiên.
- Pagination giữ `.pagination-container`, `.list-page`, anchors
  `.first-page/.prev-page/.next-page/.last-page`, `data-page` và scope riêng.
- Giữ `<base href="/">` trên deep route, field IDs/names, data attributes và
  selectors của CKEditor/Select2/Flatpickr. Không đổi request payload.
- Chapter form giữ spelling `showChapper`; password reset giữ `comfirm`.
- Signin giữ `loginForm/loginBtn/loginError`, `.btn-text`, fields `id/password`.
  Signup giữ action `/auth/addUser`, gender1/0, validation và success redirect.
- Recovery giữ `recoverForm`, `reminder-credential`, `formOpt/txtOpt`,
  `btnOtpVerify/btnResendOtp`, `changepass/passwordNew/comfirm/btnChange` và countdown.
- Exam giữ `dethicontent[data-id][data-user]`, `list-question`, `.answer`, timer,
  `mode-full/mode-one`, `btn-nop-bai`, answer/editor/image IDs và rendering order.
- Không đổi localStorage keys `dethi_${made}_user_${userId}`,
  `cautraloi_${made}_user_${userId}`, `isTabSwitched_${made}`; IndexedDB
  `exam-images-db-v3`, `images` store và index.
- Giữ start/result EJS branches theo lịch thi, trạng thái, `xemdiemthi`,
  `hienthibailam` và chấm essay. Giữ multipart submit và auto-submit/cleanup.
- Detail giữ `chitietdethi`, tab bảng điểm/chấm tự luận/thống kê, sort data,
  essay score fields `data-macauhoi`, chart/metric IDs, export/result dialogs.
- Giữ notification selectors/count, avatar helper semantics, logout form POST,
  print A4/media/`window.print()` và development-only error detail.

## 9. Responsive/accessibility hotspots có evidence

- `custom.css` dưới768px thay mọi `.row`, `.col-6`, `.col-8` toàn app do rule của
  exam. Cần scope theo exam, không sửa forms/admin bằng CSS global tương tự.
- `test_schedule.ejs` buộc `min-width:1000px`; mobile card labels dùng `data-label`
  nhưng row builder trong `test_schedule.js` chưa cung cấp thuộc tính này.
- `client_group.ejs` tắt table overflow; `module.js` và `class_detail.ejs` có bảng
  không có wrapper. Permission matrix trong roles cũng cần xử lý width.
- `de_thi.ejs` giữ col8/4 ở mọi viewport; header mobile đổi chiều nhưng content
  margin-top5rem không đổi. Sticky navigation, answer padding và rich images cần QA.
- Question editor có vùng700px; announcement select300px; notification dropdown25rem.
- Add/update exam có nested form: phải xem DOM browser trước khi sửa markup,
  giữ validation và submit ownership theo hành vi đang hoạt động.
- Assignment có duplicate `search-input` trong hai form; JS đang dùng scope.
  Không đổi selector scope như refactor ngoài mục tiêu.
- Signin labels thiếu `for`; nhiều auth fields chỉ placeholder; OTP thiếu numeric
  hint; custom signup dialogs thiếu focus trap/Escape/restore.
- Detail selected essay student có nền xanh nhạt nhưng ép children trắng; cần
  sửa contrast. Sort headers click-only cần keyboard và `aria-sort` đồng bộ.
- State/loading/errors cần readable text, focus-visible và live status vừa đủ.
  Chart cần text equivalent; không dựa độc nhất vào màu để hiểu điểm/trạng thái.
- Bell/landing/Slick animations chưa bảo đảm reduced motion.

## 10. Baseline kiểm chứng đã chạy trong audit

Shell không tìm thấy `pnpm`; không install hoặc thay dependencies. Chạy binary
đã installed bằng Node, tương đương công cụ trong scripts hiện tại:

| Command thực tế | Kết quả 2026-10-17 |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | Exit0 |
| `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"` | Exit0; không dùng `--fix` trong audit |
| `node node_modules/@nestjs/cli/bin/nest.js build` | Exit0 |
| `node node_modules/jest/bin/jest.js --runInBand` | 7 suites,82 tests passed |
| `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --testPathPatterns 'app.e2e\|public-pages\|setup-app.e2e'` | 3 suites,18 tests passed |

Không chạy lại full DB e2e trong audit frontend. Kết quả136 e2e của lần khắc phục
backend trước là lịch sử, không dùng thay QA sau migration. Chưa kiểm tra browser,
screenshots, keyboard, responsive hoặc Core Web Vitals cho UI mới vì chưa triển khai.

## 11. Kế hoạch tiếp theo

Thiết kế đề xuất: [frontend migration design](superpowers/specs/2026-10-17-frontend-migration-design.md).
Kế hoạch M1–M8: [implementation plan](superpowers/plans/2026-10-17-frontend-migration.md).

Không coi hoàn thành task tổng thể khi chỉ landing đạt yêu cầu. Mọi page và shared
component trong inventory phải có kết quả migration và verification sau triển khai.
