# Thiết kế migration frontend và public product experience

**Ngày:** 2026-10-17. **Trạng thái:** đã được user duyệt và triển khai; kết quả
kiểm chứng/bàn giao tại `docs/14-frontend-migration-verification.md`.
User cập nhật ngày 2026-10-18: sản phẩm tên **LianTest**, người tạo **LianHarman**.

## Mục tiêu và nguồn chuẩn

Migrate đủ32 page template và shared UI của LianTest theo
[DESIGN.md](../../../DESIGN.md), đồng thời thay presentation landing public bằng
một hành trình giới thiệu sản phẩm có demo minh họa. Giữ stack NestJS SSR/EJS,
toàn bộ business behavior, API, RBAC, auth và state architecture.

[Audit/inventory](../../13-frontend-ui-audit.md) ghi nguồn thật, coverage và các
contract phải bảo toàn. Các yêu cầu của master task người dùng là phạm vi sản phẩm;
tài liệu này cụ thể hóa chúng cho repo EJS, không áp quy tắc Next.js vào stack khác.

## Hai cách thực hiện đã cân nhắc

1. **Đề xuất: foundation chung + migration markup theo nhóm.** Map token vào
   Bootstrap/Dashmix, chuẩn hóa shared primitives/shell trước, rồi xử lý style và
   HTML sinh từ JS ở từng feature. Cần nhiều checkpoint nhưng giải quyết cả
   consistency, responsive và semantics, giữ handler/API hiện tại.
2. **Chỉnh từng template độc lập theo spec.** Dễ review từng màn hình trước mắt,
   nhưng lặp lại form/table/dialog styles và dễ tạo sai khác khi shared token
   thay đổi. Không phù hợp mục tiêu toàn app dùng cùng design language.

Foundation chung không đồng nghĩa chỉ phủ CSS lên UI cũ. Các inline style,
mobile rules global và presentation strings được audit phải được migrate cùng.

## Diễn giải DESIGN.md

Giữ nguyên file gốc. Dùng các giá trị canonical sau:

| Hạng mục | Quyết định |
|---|---|
| Interactive accent | `--color-iris-bolt:#4255ff`; filled primary, links, active/focus |
| Text | `--color-ink-charcoal:#282e3e`, deep-indigo `#2e3856`, muted `#586380` |
| Disabled/placeholder | `#939bb4`; không dùng cho label hoặc thông tin cần contrast |
| Surfaces | Canvas `#f6f7fb`, white `#ffffff`, lilac `#edefff` |
| Border | `#d9dde8`, chỉ hairline/divider; không làm fill |
| Feature illustration | `#dbdfff` bên ngoài panel trắng; không thêm palette UI thứ hai |
| Font | Inter là substitute đã có; fallback system cho glyph thiếu, kiểm tra tiếng Việt |
| Type | 12/18,14/20,16/24,20/28,24/32,32/41,44/55px; body400, nhấn600,700 ít dùng |
| Spacing | Base8; inline8, form/card16–24, section80; mobile giảm section theo hierarchy |
| Rail | Max1200px; gutter16 mobile/24 tablet-desktop; content co giãn trong app sidebar |
| Radius | Input/utility4, content8, primary/secondary CTA200, feature illustration24px |
| Shadow | Chỉ shadow-sm/md/subtle trong spec; không stacking/heavy hover lift |
| Theme | Light xuyên suốt; không thêm dark mode spec không định nghĩa |

Theo các phần Filled Pill Button, ví dụ và Do/Don't, accent là primary CTA dù
một dòng color-role nói ngược lại. `#282e3` trong prose được hiểu là typo của
`#282e3e`. Line-height có đơn vị px hoặc ratio, không dùng unitless18/24.

Spec không mô tả đầy đủ table, state, dialog hoặc mobile. Áp cùng token/spacing
vào Bootstrap components hiện có; không tự tạo một ngôn ngữ visual khác.

## Ranh giới kiến trúc và file

### Foundation và shared primitives

- `public/css/design-tokens.css`: canonical tokens + semantic aliases Bootstrap
  cần thiết, gồm cả RGB và component vars nơi Bootstrap dùng giá trị riêng.
- `public/css/ui-components.css`: type, button variants, input/control, card,
  alert/status, tabs, table, pagination, modal/offcanvas/dropdown, focus/loading.
  Public và app dùng chung primitives, không có bộ marketing button thứ hai.
- `public/css/app-shell.css`: sidebar/header/container/page title/actions/footer
  và responsive app. Không sửa vendor Dashmix compiled assets.
- `public/css/custom.css`: chỉ giữ rule còn được dùng; chuyển rule exam về scope
  exam, bỏ style legacy sau kiểm tra usage và thay thế tương ứng.
- `views/partials/head.ejs`: load tokens/shared styles nhất quán; page stylesheet
  phải có thứ tự rõ sau plugin CSS. Public mode có thể bỏ app JS/vendor assets
  không dùng, trong khi signin vẫn cần jQuery như hiện tại.
- Các partial UI nhỏ chỉ được tách khi có reuse thực: page heading, pagination
  và empty state. Không chuyển mọi label/input thành abstraction mới.

### App shell và feature pages

Giữ Dashmix sidebar mechanics, overlay, scroll, dropdown và Bootstrap plugins.
Header trắng khoảng56px, compact; sidebar trắng với active lilac/accent, labels
đọc được, không ảnh logo bên thứ ba. Retain mọi RBAC/menu/account/notification hook.
Thay theme-picker/dark controls bằng presentation light thống nhất, không tạo
theme state/setting mới. Menu mobile phải có accessible name và đóng bằng phím.

Mỗi page có title/action/filter/content hierarchy thống nhất. Tables ưu tiên
stack/card hoặc wrap ở nơi đọc được; bảng cần so sánh nhiều cột dùng scroll trong
container có nhãn, không làm toàn document overflow. Không biến tất cả bảng thành
card nếu làm mất quan hệ dữ liệu hoặc sort/action hooks.

Dashboard thay stock marketing imagery bằng workspace mô tả tác vụ thật và
quick links có permission đúng. Không tạo số liệu cá nhân từ dữ liệu giả hoặc
thêm API dashboard. Email onboarding và handler của nó vẫn hoạt động; chỉ gỡ
Slick-init/CDN nếu carousel presentation được thay và đã xác minh không còn usage.

Feature template giữ field names, IDs, selectors, first `.content[data-id]`,
event delegation và DOM relationships mà handler đọc. Có thể thêm class/wrapper
vừa đủ. Khi cần sửa generated markup, chỉ sửa presentation strings/semantics;
không thay query, mutation, validation hoặc điều kiện availability.

### Authentication

Năm trang dùng chung type, white panel, brand, controls và spacing trong
`public/css/auth.css`; forms và flow giữ nguyên. Reuse shared head/brand/footer
thay standalone Poppins styles. Labels thật, autocomplete/inputmode phù hợp,
errors/live statuses rõ, password visibility nếu có vẫn giữ behavior hiện tại.
Signup dialogs dùng Bootstrap dialog đã có hoặc semantic dialog nhỏ có focus
management, giữ IDs/validation/terms content và success redirect.

Không thay controller, JWT, cookie, OTP ticket, routes hoặc logout. Public view
không load `permission.js`; protected app vẫn dựa server guards.

### Exam experience

`public/css/exam.css` scope toàn bộ rule thi để không ảnh hưởng admin grid.
Desktop: question panel và navigation có hierarchy rõ. Mobile: timer/submit và
question status vẫn tiếp cận được; navigation thu gọn/stack nhưng không biến mất.
Header không che câu hỏi khi tên dài hoặc zoom. Dùng minmax/wrap và ảnh/editor
co theo container. Không animation trên câu/answer khi đang làm bài.

Selected/answered/unanswered/current/correct/wrong/pending có text/icon/border
phân biệt; giữ state classes và đáp án semantics. Timer/submit confirmation,
auto-submit, fullscreen/single-question mode, draft/image restoration và payload
không đổi. Chấm essay giữ điểm/range/handlers, chỉ cải thiện layout/readability.

Trang in giữ A4, thứ tự câu, dấu đúng/sai và `window.print()`; screen-only mobile
styles không được thay print stylesheet làm hỏng xuất kết quả.

## Landing: một hành trình sản phẩm bằng tiếng Việt

Root đã public nên giữ `PagesController.landing` và `isLoggedIn` hiện tại. Người
đã login vẫn xem `/`; CTA header “Vào ứng dụng” dẫn `/dashboard`, visitor “Đăng
nhập” dẫn `/auth/signin`. Không gọi auth API chỉ để vẽ header.

| Section | Nội dung và visual |
|---|---|
| Public header | LianHarman, anchor Tính năng/Vai trò/Trải nghiệm/FAQ, CTA; mobile navigation đơn giản |
| Hero | Eyebrow “Hệ thống thi trực tuyến”; headline “Từ ngân hàng câu hỏi đến bài thi và kết quả.”; copy nêu giảng viên, SV, quản trị; login và scroll CTA |
| Product preview | Các panel nhỏ: cấu hình đề/ngân hàng câu hỏi/làm bài/kết quả; dữ liệu ghi rõ minh họa |
| Core value | Tổ chức nội dung, giao bài đúng nhóm, theo dõi bài làm; copy cụ thể, không fake stats |
| Feature stories | Alternating two-column: chuẩn bị câu hỏi/đề; tổ chức nhóm; làm bài/chấm/xem kết quả; mỗi chuyện có UI và lợi ích |
| Role benefits | Tabs Sinh viên/Giảng viên/Quản trị viên; mô tả đúng capability và phụ thuộc quyền cấp |
| How it works | Chuẩn bị câu hỏi → tạo/giao đề → làm bài → xem/chấm kết quả |
| Interactive exam | Demo3câu MCQ local; question/progress/previous-next/selected-answer/submit/result/retry |
| Additional capabilities | Word/Excel, thông báo, thống kê, xuất Excel/in kết quả; không quảng bá AI/realtime |
| FAQ | Tài khoản, người dùng, câu hỏi/nhập file, chấm essay, xem kết quả theo thiết lập, phạm vi demo |
| Final CTA | Đăng nhập để dùng hệ thống; không hứa signup tự cấp quyền GV/Admin |
| Footer | Brand, nhóm anchor/tài khoản có thật, copyright; không link chính sách/social giả |

Hero text có thể polish trong implementation nhưng không thêm cam kết vượt
feature matrix. Preview là composition nhẹ của UI thật, không embed authenticated
page, không fetch hoặc lấy dữ liệu riêng tư. Không sao chép branding, layout1:1,
font, color hoặc text của Krepling; chỉ học cách chia chương và dẫn CTA.

### Demo isolation

- Demo dùng JS module nhỏ có JSDoc types và `// @ts-check`, static questions,
  local in-memory state; tách data/score và DOM rendering khi cần test.
- Không import `de_thi.js`, không gọi `/test/*`, `/account/*` hoặc endpoint auth.
- Không tạo attempt, token, storage key thật, localStorage/IndexedDB hay DB write.
- Native radio/fieldset/legend; giữ lựa chọn khi lùi/tiến; tiến độ câu đã trả lời;
  submit có điểm3câu và lời giải, làm lại reset state; CTA signin sau kết quả.
- Dòng “Trải nghiệm minh họa — kết quả không được lưu vào hệ thống” hiển thị rõ.
- FAQ dùng `<details>`; role switch có keyboard/aria đúng; không carousel library
  mới, scroll hijack hoặc animation gây cản đọc/thao tác.

## Responsive, accessibility và performance

Kiểm tra375/430/768/1024/1440/1600px, tên/email/câu hỏi dài, bảng rỗng/nhiều hàng,
modal/editor/Select2 mở, focus và zoom. Landmark/heading/label/button semantics,
keyboard cho dialog/dropdown/tabs/sort và focus restoration phải hoạt động.
State không dựa màu đơn độc; contrast kiểm bằng giá trị thật, không suy đoán từ hex.
Reduced-motion bỏ reveal/hover movement/bell shake/Slick autoplay nếu còn dùng.

Landing render HTML phía server; JS chỉ role/demo/mobile nav nếu cần, nội dung
chính vẫn đọc được khi JS lỗi. Không load CKEditor/Chart.js/permission trên root.
Font `swap`, reserve preview/image dimensions, native lazy-loading cho ảnh dưới
fold nếu có. Không hard-code production domain hoặc tạo OG image chưa tồn tại.
Title/description/OG text đúng sản phẩm, h1 duy nhất; public indexable.

## Verification và acceptance

Mỗi milestone có checkpoint trong [plan](../plans/2026-10-17-frontend-migration.md).
Không chuyển tiếp khi có regression quan trọng. Reuse tests hiện có, bổ sung
chỉ cho interaction mới và các rủi ro thật; không snapshot mọi class CSS.

UI migration chỉ hoàn thành sau khi inventory đủ32page được đối soát, functional
regression chạy trên fixture test tách biệt, lint/typecheck/tests/build đạt và
browser screenshots/keyboard/responsive được review. Môi trường thiếu browser
hoặc fixture phải ghi limitation cụ thể, không ghi PASS thay kiểm chứng.

Không commit/push tự động. Dependencies dự kiến không thay; mọi thay đổi thật
ngoài kế hoạch phải có lý do và được ghi trong final report.
