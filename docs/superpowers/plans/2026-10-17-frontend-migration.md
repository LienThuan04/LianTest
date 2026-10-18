# Frontend Design Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate toàn bộ32page template sang DESIGN.md và bổ sung public product experience có demo độc lập, bảo toàn nghiệp vụ.

**Architecture:** Giữ NestJS SSR/EJS và jQuery/Bootstrap/Dashmix. Chuẩn hóa tokens, shared primitives và shell trước; migrate presentation trong EJS lẫn HTML sinh từ JS theo từng feature. Landing SSR dùng native JS nhỏ cho role tabs/demo, không phụ thuộc exam app.

**Tech Stack:** NestJS11, EJS5, JavaScript/JSDoc, CSS custom properties, Bootstrap/Dashmix, plugins hiện có, Jest/Supertest; browser QA khi kết nối được.

**Spec:** [frontend-migration-design.md](../specs/2026-10-17-frontend-migration-design.md), [DESIGN.md](../../../DESIGN.md), [audit/inventory](../../13-frontend-ui-audit.md).

**Status 2026-10-18:** User đã duyệt và triển khai M1–M6 có trong working tree.
M7 đã có browser/source QA và các bản sửa; M8 có kiểm chứng code/HTTP nhưng chưa
chứng nhận toàn bộ luồng thi trên browser do CDN bị chặn. Website đổi tên thành
**LianTest**, tác giả vẫn **LianHarman**. Chi tiết kết quả và các việc còn lại ở
[execution ledger](../../14-frontend-migration-verification.md); checklist bên
dưới là yêu cầu gốc, không thay cho kết quả thực chạy trong ledger.

## Global Constraints

- `design.md` là source of truth về VISUAL DESIGN; file thực tế là `DESIGN.md`.
- Existing source code là source of truth về PRODUCT BEHAVIOR và FEATURES.
- Giữ nguyên business behavior, API contract, authentication, authorization và validation.
- Không backend/database/DTO/auth/state/query architecture rewrite; không upgrade framework/dependencies hàng loạt.
- Toàn bộ user-facing pages phải được inventory và migrate, không chỉ landing.
- Copy tiếng Việt; không fake feature/statistics/testimonials/partners/awards.
- Demo không gọi Exam API, không tạo Attempt, không ghi database, không cần token.
- Không `any`; file mới kebab-case; không giant component/template.
- Không tự commit/push/merge/rebase; bảo toàn user changes và local-only pnpm files.
- Kiểm tra sau mỗi nhóm, không để tất cả verification dồn cuối.

## Review Focus

1. Tài khoản có ít quyền: navigation/actions mới phải tiếp tục bị prune đúng theo RBAC, không duplicate permission.js.
2. Thi đang dở, refresh, câu tự luận có ảnh: không mất draft, selected state, editor/file hooks hoặc submit ordering.
3. Tên dài/mobile/zoom và dropdown/modal đang mở: không clipping, document overflow hoặc header che câu hỏi.
4. Đề hỗn hợp chưa chấm essay, kết quả bị ẩn: không vô tình hiển thị điểm/đáp án khác điều kiện cũ.
5. Visitor/no-JS và demo qua lại/làm lại: nội dung landing vẫn đọc được; demo không phát request/ghi state thật.

## File responsibilities và interfaces chung

| File | Trách nhiệm / interface |
|---|---|
| `public/css/design-tokens.css` | Canonical `--color-*`, `--text-*`, `--spacing-*`, radius/shadow/surface và semantic/Bootstrap aliases |
| `public/css/ui-components.css` | Shared type, buttons, forms, panels, tables, tabs, dialogs, dropdown, pagination, loading/error/empty/focus |
| `public/css/app-shell.css` | App sidebar/header/main/footer và responsive shell |
| `public/css/auth.css` | Auth composition chỉ dùng token/primitives chung |
| `public/css/exam.css` | Exam scoped layout, timer/nav/answer states, results/grading responsive |
| `public/css/landing.css` | Public composition, illustration/reveal/role/demo layout, dùng foundation chung |
| `views/partials/head.ejs` | Meta/style order theo UI mode; mặc định bảo toàn app/head scripts |
| `views/partials/{navbar,header,footer,script,auth-scripts,statistic_cards}.ejs` | Giữ interfaces include hiện tại, upgrade presentation phù hợp từng trách nhiệm |
| `views/partials/ui/*.ejs` | Chỉ các presentation fragments có reuse đã xác minh, bảo toàn IDs/data hooks |
| `views/partials/landing/*.ejs` | Public header/hero/preview/stories/roles/demo/FAQ/footer, mỗi phần bounded |
| `public/js/landing/exam-demo-data.mjs` | `DemoQuestion[]` với `id:string`, `prompt:string`, `options:ReadonlyArray<string>`, `correctIndex:number`, `explanation:string`; `calculateDemoResult(answers: ReadonlyArray<number|null>): { correct: number; total: number }`, không I/O |
| `public/js/landing/exam-demo.mjs` | DOM/events và local state; selectors `data-demo-*`, không reuse app IDs/storage |
| `public/js/landing/role-tabs.mjs` | Native keyboard tabs, selectors `data-role-tab`/`data-role-panel`, không AJAX |
| `test/frontend/landing-demo.test.cjs` | Node built-in test cho tính điểm/reset/navigation model nếu model được tách; không cần dependency mới |
| `docs/14-frontend-migration-verification.md` | Checkpoint, page coverage, commands, screenshots, functional results, limits |

Các module JS mới dùng `// @ts-check` và JSDoc types vì repo không có frontend
bundler. Không tạo build pipeline/framework mới chỉ để dùng TypeScript trên landing.

Demo dùng 3 câu HTTP minh họa: Not Found (options 200/201/404/500, đúng index2),
Created (200/201/403/500, đúng index1), Unauthorized (401/200/301/404, đúng index0).
Score chỉ xét 3 câu này; thiếu hoặc index ngoài phạm vi tính là chưa đúng; tổng
luôn là3. Đây là dữ liệu public minh họa, không lấy từ ngân hàng câu hỏi thật.

## Checkpoint commands

Ưu tiên scripts repo qua pnpm khi executable có sẵn. Audit cho thấy shell chưa có
`pnpm`; dùng binary đã installed dưới đây nếu vẫn vậy, không tự install global:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"
node node_modules/@nestjs/cli/bin/nest.js build
node node_modules/jest/bin/jest.js --runInBand
node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --testPathPatterns 'app.e2e|public-pages|setup-app.e2e'
```

JS presentation file mới/sửa phải qua `node --check <file>`. Nếu thêm JSDoc module,
kiểm tra riêng bằng installed TypeScript với `--allowJs --checkJs --noEmit`, đúng
module/DOM libs và chỉ tập module mới, không mở rộng scope sang toàn bộ legacy JS.

Build Nest không chứng minh EJS/browser JS đúng; mỗi checkpoint cần SSR render
và interaction/browser checks thích hợp. Lint repo hiện chỉ cover TypeScript.

## M1 — Foundation và shared primitives

**Files:** tạo `design-tokens.css`, `ui-components.css`; sửa `custom.css`,
`views/partials/head.ejs`; tạo UI fragments chỉ khi cần reuse thật.

**Consumes:** DESIGN.md và token decisions trong spec.
**Produces:** palette/type/spacing/surface/components chung cho cả app/auth/public.

- [ ] Kiểm tra lại `git diff` trước sửa; không ghi đè DESIGN.md hoặc thay đổi khác.
- [ ] Khai canonical tokens theo đúng giá trị spec; map Bootstrap RGB/component vars.
- [ ] Chuẩn hóa button/input/select/editor wrappers/card/badge/alert/table/modal/tabs/dropdown/pagination/skeleton/state/focus.
- [ ] Giữ semantics disabled/required/error; phân biệt state bằng text/icon/border với một accent.
- [ ] Sắp thứ tự CSS rõ: vendor/plugin → foundation/components → area; chuyển inline rules xung đột ở nhóm sau.
- [ ] Loại mobile grid rules global khỏi custom.css và đưa về exam scope khi có replacement; giữ permission hidden/show và utilities còn dùng.
- [ ] Verify typecheck + public SSR tests + CSS render trên form/table/modal đại diện; không chuyển M2 nếu contrast/controls hỏng.

## M2 — Application shell và navigation

**Files:** `navbar.ejs`, `header.ejs`, `footer.ejs`, `script.ejs`, `app-shell.css`;
page shell classes khi cần; chỉ presentation nhỏ trong `permission.js` nếu cần.

**Consumes:** shared tokens/components M1.
**Produces:** cùng light shell trên mọi authenticated page, giữ Dashmix và RBAC hooks.

- [ ] Thay sidebar teal/logo bên thứ ba, header slogan/theme controls và footer appearance bằng design thống nhất.
- [ ] Giữ `page-container/page-header/sidebar/main-container`, nav groups, layout toggles, `logoutForm`, account/avatar/bell hooks.
- [ ] Thêm labels/focus/skip-link; mobile nav/notification menu giới hạn theo viewport, desktop main rail1200.
- [ ] Verify visitor vào protected route vẫn redirect signin; so role menus/actions với permission map, không phát sinh duplicate permission load.
- [ ] Browser smoke ở375/768/1440: mở/đóng sidebar/dropdown, keyboard, logout form; ghi evidence.
- [ ] Typecheck, JS syntax khi có sửa, public routing tests.

## M3 — Authentication UI

**Files:** đủ5`views/pages/auth/*.ejs`, `auth.css`, `auth-scripts.ejs`;
`recover.js` chỉ khi cần presentation/accessible status, không sửa requests/validation.

**Consumes:** M1 primitives; auth DOM contracts trong audit.
**Produces:** auth screens đồng nhất, giữ login/signup/OTP/reset/logout flow.

- [ ] Reuse shared typography/brand/panel/layout, loại Poppins/gradient inline.
- [ ] Giữ IDs/names/actions, gender values, countdown, pending/error và success redirects.
- [ ] Thêm for/id/label/autocomplete/inputmode/helper/live status; dialog focus/Escape/restore phù hợp.
- [ ] Verify `public-pages` + `auth-account` trên fixture test; login→dashboard→logout, đăng ký và toàn recovery ticket flow.
- [ ] Browser keyboard/form pending/error/dialog ở375/768/1440; không coi HTTP200 là interaction pass.
- [ ] Typecheck/lint/JS syntax, dừng nếu auth regression.

## M4 — Main features theo nhóm, verify sau từng nhóm

**Files:** các EJS/JS dưới đây; `statistic_cards.ejs`; dùng shared components,
không tạo một CSS theme cho từng page.

**Consumes:** shell/primitives M1–M2; giữ source handlers/queries.
**Produces:** toàn bộ authenticated UI ngoài exam experience M5 đã migrate.

### M4a — Dashboard và tài khoản

- [ ] `dashboard.ejs`/`dashboard.js`: product/workspace composition, quick links có RBAC; giữ onboarding modal/email endpoints, không fake metrics. Chỉ gỡ Slick usage khi thay presentation và kiểm tra usage hoàn tất.
- [ ] `account_setting.ejs`/`.js`: bỏ stock banner, profile/password forms/tabs/avatar responsive; giữ avatar helper và dynamic header update.
- [ ] Verify onboarding thiếu/có email, profile/avatar/password success/error, permission links; auth-account regression + typecheck/lint.

### M4b — Quản trị và học vụ

- [ ] Migrate `user`, `roles`, `namhoc`, `subject`, `view_subject`, `assignment` cả EJS và `public/js/pages/<name>.js` presentation.
- [ ] Giữ user manual/Excel tabs, role matrix/join switches/member status, semester modal, chapter CRUD/spelling/cell relationships.
- [ ] Assignment giữ2pagination/search scopes; không vô tình dùng selector ID unscoped.
- [ ] Verify create/edit/search/filter/pagination/empty/error/permission và import preview theo flow thực; typecheck/lint + unit tests, các e2e liên quan hiện có.
- [ ] Mobile QA role matrix/Select2/modal/table; dùng scoped scroll nếu phải giữ so sánh nhiều cột.

### M4c — Nhóm học phần và lịch thi

- [ ] Migrate `module`, `class_detail`, `client_group`, `test_schedule` cả EJS/JS generated table/card/offcanvas.
- [ ] Sửa responsive schedule có row labels thật; bỏ min-width1000px vô điều kiện, không đổi dữ liệu/filters/start/review links.
- [ ] Giữ join/hide/leave/restore/invitation/import/export/sort/member counts, first `.content[data-id]`.
- [ ] Verify SV join→xem nhóm/lịch→start/review và GV roster/invitation/Excel; exam-flow/excel-pdf cases phù hợp, typecheck/lint.
- [ ] Browser375/430/768/1440 với table có dữ liệu, rỗng, tab/offcanvas/dropdown mở.

### M4d — Câu hỏi, cấu hình đề, thông báo và thống kê

- [ ] Migrate `question`, `test`, `add_update_test`, `select_question`, `teacher_announcement`, `add_announce`, `statistic` và JS tương ứng.
- [ ] Giữ CKEditor/file/image/reading subquestions; Word/Excel preview và escaping của `question-html.js`.
- [ ] Kiểm tra browser DOM nested forms trước thay; giữ mọi conditional config/count/marks và selector ancestor của question counters.
- [ ] Migrate generated markup trong `module.js/test.js/question.js/announcement.js/select_question.js/statistic.js` khi thuộc nhóm, không đổi AJAX payloads.
- [ ] Thống kê dùng chart token cùng visual; giữ labels/numerical semantics, không bịa bảng của placeholder tab.
- [ ] Verify create/edit/filter/import/save/export/announcement recipients/aggregate-detail; question-excel, view-subject, announcement-statistic, exam setup cases; typecheck/lint/JS syntax.
- [ ] Kiểm tra loading/error/empty/pending trong từng nhóm, không chỉ dữ liệu mẫu thành công.

## M5 — Thi, kết quả, chấm tự luận, print

**Files:** `vao_thi.ejs`, `de_thi.ejs`, `test_detail.ejs`, `export_pdf.ejs`,
`vaothi.js`, `de_thi.js`, `test_detail.js` presentation; `exam.css`.

**Consumes:** shared primitives; audit exam contracts/local persistence.
**Produces:** exam UI đồng nhất và dùng được trên mobile, không đổi attempt/grading.

- [ ] Giữ start/result branches, các field/data/base href, timer/countdown/nav/submit IDs, ordering, storage keys/editor/image lifecycle.
- [ ] Responsive header/timer/question panel/navigation; trạng thái câu phân biệt, không animation cản thi.
- [ ] Migrate bảng điểm/grading/selected student contrast/filters/sort keyboard và metric cards/chart, giữ điểm/validation.
- [ ] Print: screen-only responsive, kiểm tra A4 preview, page breaks, images/answers/scores/window.print().
- [ ] Browser: SV chọn→next/previous→refresh restore→submit→result; mixed essay/image; GV xem→chấm→SV review; expired/closed/hidden-score branches.
- [ ] Run exam-flow, exam-auto-essay, excel-pdf trên DB/storage test biệt lập; typecheck/lint/unit/build. Không sửa server nghiệp vụ để làm test đẹp.

## M6 — Public landing hoàn chỉnh

**Files:** `landing.ejs`, `partials/landing/*.ejs`, `landing.css`,
`public/js/landing/*.mjs`, public metadata/head mode; tests public/demo.

**Consumes:** shared tokens/components + implemented feature matrix; `isLoggedIn` hiện tại.
**Produces:** đủ12section trong spec, public cho visitor, isolated demo3câu.

- [ ] Viết copy Việt theo feature thật; loại guarantee offline, fake trust và placeholder footer links.
- [ ] Dựng hero/preview/core value/stories/role benefits/how it works/demo/additional/FAQ/final CTA/footer thành partials bounded.
- [ ] Metadata title/description/OG text/h1/landmarks; CTA `/auth/signin` hoặc header `/dashboard` theo boolean hiện có, không auth API mới.
- [ ] Trước implement score model, viết `landing-demo.test.cjs`: `[2,1,0] → {correct:3,total:3}`, `[2,0,3] → {correct:1,total:3}`, `[null,null,null] → {correct:0,total:3}`, `[-1,99,4] → {correct:0,total:3}`, `[] → {correct:0,total:3}`; chạy fail vì module chưa có rồi implement typed static data + calculateDemoResult.
- [ ] Demo radio/progress/back-next/submit/result/retry giữ state local, prefix `data-demo-*`; không app IDs, storage hoặc network.
- [ ] Role tabs native keyboard, FAQ details, anchors/reduced motion; không cài animation/icon/carousel lib mới.
- [ ] Browser test quay lại câu cũ vẫn chọn, kết quả đúng, retry reset; giám sát network không có `/test/*`/authenticated call hoặc attempt write.
- [ ] Update public render tests bỏ brand cũ DHTONTEST khi cần, thêm CTA/section/demo isolation regression phù hợp; không giữ brand cũ chỉ để pass test.
- [ ] Verify no-JS content, logged-out/logged-in/stale cookie CTA routing, mobile nav,375/768/1440; typecheck/JSDoc check/module syntax/public tests/demo tests/build.

## M7 — Responsive/accessibility/polish toàn inventory

**Files:** tất cả presentation đã migrate; không mở scope sang backend.

**Consumes:** M1–M6 complete, docs coverage checklist.
**Produces:** evidence từng area và các fix sau visual review.

- [ ] Kiểm tra đủ32templates ở widths375/430/768/1024/1440/1600; ghi representative screenshots desktop/tablet/mobile và trạng thái UI quan trọng.
- [ ] Kiểm tra long text/rich images/table labels/filters/dialogs/offcanvas/editor; document không overflow ngoài scroll container có chủ đích.
- [ ] Keyboard: nav→filter→table action→dialog→close/focus restore; auth và demo đầy đủ; focus-visible/labels/contrast/live-state.
- [ ] Reduced-motion bỏ movement/autoplay/reveals; zoom và viewport thấp không che timer/submit.
- [ ] Review asset requests/client JS/layout shifts; landing không tải plugin nội bộ không dùng; không claim CWV score nếu chưa đo.
- [ ] Đối soát inventory: UPDATE/REBUILD đã migrate, KEEP có evidence; chỉ remove legacy style/component sau usage search và replacement.
- [ ] Rerun checks của area bị sửa do QA; không lặp full suite khi không có thay đổi/rủi ro mới.

## M8 — Final QA và bàn giao

**Files:** `docs/14-frontend-migration-verification.md`, audit status/coverage và
README nếu cần ghi cách kiểm tra frontend mới.

- [ ] Check tracked diff không đổi backend/API/auth/DTO/business rules; review generated JS không thay requests/validation/storage.
- [ ] Run lint/typecheck/unit/public tests, demo tests, complete existing DB e2e trên fixture riêng, production build; lưu commands/results thật.
- [ ] Chạy app build và browser regression các flow: auth, SV, GV, Admin; đây là điều kiện riêng với API tests.
- [ ] Mời review độc lập về design compliance, hooks/API preservation, responsive/accessibility khi thực hiện workflow cho phép delegation.
- [ ] Final report: migration/design system/pages/landing/demo/architecture/auth/files/deps/commands/functional flows/remaining issues.
- [ ] Không đánh dấu complete nếu migration tạo blocker hoặc thiếu core verification; nêu rõ environment limits và những check chưa chạy.
- [ ] Không commit/push/merge/rebase; để user review working tree.

## Baseline đã có trước implementation

2026-10-17: typecheck, ESLint read-only và Nest build exit0;82unit tests và18public
e2e tests passed. M1–M8 chưa được tick. Các kết quả này chỉ chứng minh trạng thái
trước migration, không phải chứng nhận giao diện mới.
