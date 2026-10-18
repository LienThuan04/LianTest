# 04 — Kiến trúc & module

[Chỉ mục tài liệu](README.md) · [README tiếng Việt](../README.vi.md)

## Cây `src/`

```
src/
├── main.ts, app.module.ts, app.controller.ts     bootstrap + đăng ký module
├── config/            app-setup (global prefix + EXCLUDE), cors, swagger
├── core/              env-config (ConfigModule global), throttler-config
├── common/            interceptors (transform/logging), filters, decorators
│   ├── decorators/      @Permissions, @SkipTransform, @Public
│   └── config/          upload.config.ts (MULTER_LIMITS = LIMIT_UPLOAD_FILE_SIZEMB)
├── lib/               bcrypt, passport (jwt-auth.guard, permissions.guard)
├── prisma/            PrismaModule (@Global) + PrismaService
├── storage/           StorageModule (@Global) + SupabaseStorageService   ← lưu file
├── email/             EmailService (Nodemailer + EJS templates)
├── seed-db/           JSON data/ + loader/validation + hàm seed nền/nghiệp vụ
│
├── exam-auth/         Auth JWT/Passport hệ thi (JwtStrategy, guard, IExamJwtPayload)
├── roles/             NhomQuyen + ChiTietQuyen (RBAC)                    path /roles
├── users/             NguoiDung (CRUD admin)
├── account/           Hồ sơ cá nhân
├── pages/             Landing / dashboard (SSR)
├── academic-years/    NamHoc + HocKy                                     path /namhoc
├── subjects/          MonHoc + Chuong                                    path /subject
├── questions/         Ngân hàng câu hỏi (mcq/essay/reading + ảnh + import) path /question
├── class-modules/     Nhóm học phần GV + thành viên + Excel              path /module
├── assignments/       Phân công giảng viên ↔ môn                         path /assignment
├── client/            Nhóm học phần SV và lịch thi                       path /client
├── announcements/     Quản lý thông báo và chuông thông báo              path /teacher_announcement
├── statistic/         Thống kê theo đề/tổng hợp                          path /statistic
├── view-subject/      Môn học được phân công và chương                   path /view_subject
└── exams/             Đề thi & làm bài & chấm + export                    path /test
```

## Thành phần hạ tầng

- **RBAC**: bảng `chitietquyen` → `@Permissions('<chucnang>','<hanhdong>')` +
  `PermissionsGuard` (global). JWT payload `IExamJwtPayload` có `id`, `manhomquyen`.
- **Response**: `TransformInterceptor` bọc `{statusCode,message,data}` cho API;
  AJAX dùng `@SkipTransform()` để trả raw; SSR `@Render()` tự bỏ qua bước bọc response.
- **Global prefix** `/api/v1` (config/app-setup) — route hệ thi ở path gốc phải nằm
  trong `exclude`. `VERSION_NEUTRAL` cho controller path gốc.
- **Static**: `public/` phục vụ trực tiếp (theme + plugin + JS trang). View EJS ở
  `views/pages/` + `views/partials/` (head/navbar/header/footer/script).
- **Config**: `ConfigModule` global (đọc `.env`), inject `ConfigService`.
- **Storage**: `SupabaseStorageService` (@Global) — xem [06](./06-luu-tru-file-supabase.md).

## Route inventory `exams` (path `/test`) — module lớn nhất

SSR (`@Render`): `GET /test`, `/test/add`, `/test/update/:made`, `/test/select/:made`,
`/test/detail/:made`, `/test/start/:made`, `/test/taketest/:made`.

AJAX (`@SkipTransform`, POST trừ khi ghi rõ):

- Danh sách/chung: `pagination`, `getTotalPages` (phân nhánh theo `args.model` /
  `args.custom.function`), `get_subjects` (GET), `get_groups` (GET), `getDetail`, `delete`.
- Tạo/sửa: `addTest`, `updateTest`.
- Chọn câu: `getQuestionOfTestManual`, `addDetail`.
- Làm bài SV: `getQuestion`, `startTest`, `getTimeTest`, `getTimeEndTest`, `chuyentab`,
  `submit` (multipart), `getResultDetail`.
- Chi tiết/kết quả GV: `getStatictical`, `getListEssaySubmissionsAction`,
  `getEssayDetailAction`, `saveEssayScoreAction`; `exportPdf/:makq` (GET, trang in),
  `exportExcel`, `getMarkOfAllTest`, `getTestGroup`, `getExamineeByGroup`.

> **Pagination.js dùng chung**: gửi `args` JSON (controller, model, made, manhom,
> filter, custom, input/content, page, limit). Server phân nhánh trong
> `getTotalPages`/`pagination`:
>
> - `args.model==='KetQuaModel'` → bảng điểm thí sinh.
> - `args.custom.function==='getQuestionsForTest'` → câu hỏi để chọn.
> - mặc định → danh sách đề GV.

## Schema Prisma (bảng chính hệ thi)

`nguoidung`, `nhomquyen`, `chitietquyen`, `namhoc`, `hocky`, `monhoc`, `chuong`,
`cauhoi`, `cautraloi`, `doan_van`, `phancong`, `dethi`, `chitietdethi`, `dethitudong`,
`giaodethi`, `ketqua`, `chitietketqua`, `traloi_tuluan`, `hinhanh_traloi_tuluan`,
`cham_tuluan`, `nhom`, `chitietnhom`, `thongbao`, `chitietthongbao`, `trangthaithongbao`.
Cột `hinhanh` (cauhoi/cautraloi/hinhanh_traloi_tuluan) = **String (URL Supabase)**.

Ảnh thay thế được dọn sau khi transaction ghi thành công. `storage/image-cleanup.ts`
giữ mọi ảnh vẫn được tham chiếu trong câu hỏi/đáp án/bài tự luận/avatar, bao gồm
bản ghi ẩn hoặc đã soft-delete. Lỗi dọn Storage không làm đảo ngược kết quả ghi DB.

`questions/question-excel.parser.ts` đọc `.xlsx`/`.xls` thành preview dùng chung
với Word. `POST /question/addExcel` chỉ parse; `POST /question/addQuesFile` kiểm
toàn bộ preview trước khi lưu. `GET /question/excelTemplate` tải mẫu Excel.

Xem [quy ước phát triển](02-quy-uoc-va-cach-lam.md) và [tài liệu API](../docs_API/README.md).
