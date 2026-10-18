# 02 — Quy ước phát triển

[Chỉ mục tài liệu](README.md) · [Hướng dẫn agent](../CLAUDE.md)

## Nền tảng

| Thành phần        | Quy ước                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Quản lý gói       | **pnpm**; `pnpm-lock.yaml` và `pnpm-workspace.yaml` chỉ lưu local theo quy ước repo        |
| CSDL              | **PostgreSQL/Prisma**; tạo migration mới khi sửa schema, không `db pull`                   |
| Giao diện         | **EJS SSR** trong `views/`, CSS/JS/plugin trong `public/`; theo [DESIGN.md](../DESIGN.md)  |
| Xác thực và quyền | JWT/Passport tại `exam-auth/`, RBAC qua `chitietquyen` và `PermissionsGuard`               |
| File ảnh          | **Supabase Storage public bucket**, DB lưu URL; xem [Storage](06-luu-tru-file-supabase.md) |

## Hợp đồng HTTP và dữ liệu

1. Giữ URL, tên field và shape response mà JavaScript giao diện đang gọi.
   Khi cần thay đổi, sửa đồng bộ controller/DTO, client và tài liệu API.
2. AJAX dùng `@SkipTransform()` để trả raw object/mảng/boolean. SSR dùng
   `@Render()`; `TransformInterceptor` tự bỏ qua response được render.
3. Route ở path gốc như `/test/...` dùng `VERSION_NEUTRAL` và khai báo loại khỏi
   prefix `/api/v1` trong `src/config/app-setup.config.ts`.
4. Giữ cách resolve URL nhất quán. Trang có path sâu cần `<base href="/">`
   nếu sử dụng helper phân trang gọi URL tương đối từ gốc.
5. Danh tính và quyền sở hữu lấy từ JWT (`req.user`); kiểm tra tài nguyên thuộc
   người dùng hiện tại trước khi cho đọc/sửa/xoá. `@Public()` dành cho route khách.
   Nhóm seed: 1=Giáo viên, 2=Sinh viên, 3=Admin; đăng ký công khai luôn tạo Sinh viên.
6. CRUD dùng Prisma client. Raw SQL phải tham số hoá với `Prisma.sql`;
   `COUNT(*)::int` tránh BigInt trong JSON. Thời gian tuyệt đối trả ISO khi cần
   so sánh hoặc đếm ngược trên client.
7. Upload ảnh trước transaction. Chỉ dọn ảnh thay thế sau khi DB ghi thành công
   và không còn tham chiếu; render avatar qua helper chuẩn.

## Cấu trúc module

```text
src/<module>/
├── <module>.module.ts        đăng ký provider/controller
├── <module>.controller.ts    HTTP, quyền, DTO, render/response
├── <module>.service.ts       nghiệp vụ và Prisma
├── dto/                     class-validator và chuyển kiểu đầu vào
└── interfaces/              kiểu dữ liệu trả về
```

Đăng ký module trong `src/app.module.ts`. Dùng `@Permissions('<chucnang>', '<hanhdong>')`
theo dữ liệu `chitietquyen`; không thay phân quyền động bằng việc chỉ ẩn nút trên UI.
Dùng kiểu dữ liệu cụ thể, helper `plainText()`/`errorMessage()` khi xử lý dữ liệu chưa rõ kiểu.

## Lệnh và cấu hình

Chạy các lệnh từ gốc repo `NestJS/`:

```bash
pnpm install
pnpm exec prisma migrate dev --name <ten>
pnpm exec prisma generate
pnpm run build
pnpm run lint
pnpm test --runInBand
pnpm run start:prod
```

Khi triển khai, áp các migration có sẵn bằng `pnpm exec prisma migrate deploy`.
`start:prod` chạy `node dist/src/main.js`; cần giữ `views/`, `public/` và template
email tại đường dẫn tương ứng từ gốc repo. Prisma chọn transport theo URL DB và
chạy `SELECT 1` trước khi ứng dụng sẵn sàng.

Khởi động thông thường: `SEED_DB=false`, `CLEAR_DB=false`, `SEED_DEMO_DATA=false`.
Chỉ seed/clear trên DB được chỉ định cho dữ liệu mẫu hoặc kiểm thử. Chỉnh dữ liệu
ở `src/seed-db/data/*.json`; sau build chạy `pnpm run seed:check` để kiểm tra không
cần DB. JSON không tự đồng bộ các bản ghi đã tồn tại; xem [hướng dẫn seed](../src/seed-db/data/README.md).

## Git và tài liệu

- Commit theo từng nội dung, message conventional bằng tiếng Việt, ví dụ
  `feat(exams): bổ sung bộ lọc đề thi`; không thêm `Co-Authored-By`.
- Chỉ commit/push khi người dùng yêu cầu. Nhánh làm việc hiện tại là `NestJS`.
- Kiểm tra diff để không đưa `.env`, dữ liệu test hoặc thay đổi vendor ngoài ý muốn vào commit.
- Cập nhật tài liệu cùng thay đổi hợp đồng; ghi kiểm chứng thực tế và phần còn
  thiếu vào [trạng thái dự án](03-tien-do.md).
