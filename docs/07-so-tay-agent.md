# 07 — Phát triển và kiểm thử

[Chỉ mục tài liệu](README.md) · [Quy ước](02-quy-uoc-va-cach-lam.md) · [Trạng thái dự án](03-tien-do.md)

## Chuẩn bị môi trường

1. Đọc [README tiếng Việt](../README.vi.md), [CLAUDE.md](../CLAUDE.md) và tài liệu
   của module cần sửa. Chạy Git/Prisma từ gốc repo `NestJS/`.
2. Cài bằng `pnpm install`, tạo cấu hình theo `.env.example` và sinh Prisma client.
   Startup cần `DATABASE_URL`, khóa JWT, ba biến `SUPABASE_*` và cấu hình SMTP,
   bao gồm địa chỉ gửi/hỗ trợ. Không hiển thị hoặc commit giá trị bí mật.
3. Áp migration vào DB được chỉ định, build và khởi động. Chạy thông thường để
   `SEED_DB=false`, `CLEAR_DB=false`, `SEED_DEMO_DATA=false`.

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm run build
pnpm run start:dev
# Hoặc chạy bản build từ gốc repo:
pnpm run start:prod
```

`start:prod` dùng `dist/src/main.js`. Cần giữ `views/`, `public/` và
`src/email/templates/` ở đường dẫn ứng dụng sử dụng. Prisma chạy `SELECT 1` trước
khi app sẵn sàng; log route mapping chỉ xác nhận routing/DI.

## Thay đổi một tính năng

1. Xác định route, DTO, quyền, service, bảng dữ liệu, EJS và JavaScript liên quan.
   Ghi rõ request/response mà giao diện sử dụng.
2. Nếu cần thay schema, tạo migration mới bằng `pnpm exec prisma migrate dev --name <ten>`;
   sau đó sinh Prisma client và build.
3. Giữ controller mỏng; nghiệp vụ nằm trong service. Lấy danh tính từ JWT,
   kiểm tra quyền/ownership và tham số hoá truy vấn.
4. SSR dùng `@Render()`; AJAX dùng `@SkipTransform()`. Route ở path gốc cần cấu
   hình prefix exclusion và `VERSION_NEUTRAL` như [quy ước](02-quy-uoc-va-cach-lam.md).
5. Upload ảnh trước transaction, đọc/render URL, dọn ảnh thay thế theo
   [hướng dẫn Storage](06-luu-tru-file-supabase.md).
6. Kiểm tra phù hợp với phạm vi sửa, xem lại diff và cập nhật tài liệu/hợp đồng
   cùng [trạng thái kiểm chứng](03-tien-do.md).

## Kiểm tra không cần DB nghiệp vụ

```bash
pnpm run build
pnpm run lint
pnpm test --runInBand
pnpm run seed:check
node --test test/frontend/landing-demo.test.cjs test/frontend/signup.test.cjs
pnpm run test:e2e --runInBand --testPathPatterns 'app|public-pages|setup-app'
```

`seed:check` cần build trước, kiểm tra JSON và tham chiếu mà không kết nối DB.
Nhóm E2E công khai/harness thay thế Prisma nhưng vẫn cần các giá trị cấu hình
khởi tạo hợp lệ; dùng giá trị test cho dịch vụ không được gọi. Unit/build không
thay thế kiểm tra nghiệp vụ trên DB thật. Script lint có `--fix`, cần xem lại diff.

## E2E nghiệp vụ và dữ liệu mẫu

```bash
pnpm run test:e2e --runInBand
```

Dùng DB/Storage **test riêng** và đọc [hướng dẫn seed](../src/seed-db/data/README.md).
Các suite nghiệp vụ cần tài khoản mẫu như `gv001`, `sv001`, môn/chương/câu hỏi,
phân công, nhóm có sinh viên và đề được giao. Quyền thông báo/thống kê của giáo
viên phụ thuộc các dòng `chitietquyen` đã cấp.

Thiếu DB, tài khoản hoặc fixture phải báo lỗi rõ ràng; không `return` để cho test
pass. Chỉ dọn các bản ghi test tạo. Không dùng endpoint xoá nhóm/đề để dọn tuỳ tiện
vì có thể ảnh hưởng thông báo hoặc dữ liệu liên quan. Không bật clear trên DB cần giữ.

Dữ liệu seed nằm trong 11 JSON; `SEED_DATA_DIR` thay cả bộ dữ liệu, không ghép từng
file vào bộ mặc định. JSON sửa không tự cập nhật bản ghi đã có. Mật khẩu mẫu được
băm từ `DEFAULT_PASSWORD`; không thêm mật khẩu thuần vào JSON.

## Kiểm tra bằng trình duyệt

- Kiểm tra desktop/mobile, đăng nhập và truy cập trang theo quyền; xác nhận form,
  AJAX, phân trang, ảnh và thông báo lỗi. Theo dõi console, request lỗi và tràn ngang.
- Với luồng thi: kiểm tra bắt đầu, đếm giờ, chọn/nhập câu trả lời, lưu/khôi phục nháp,
  ảnh tự luận, nộp và xem/chấm kết quả bằng tài khoản Giáo viên/Sinh viên.
- Luồng nháp có ảnh và editor phụ thuộc CDN `idb`/CKEditor. Khi CDN không tải được,
  ghi rõ bước bị chặn; không suy ra toàn luồng đã đạt từ HTTP test hoặc ảnh chụp trang.
- Kiểm tra upload/dọn ảnh với Storage test và email/OTP với SMTP test nếu tính năng
  thay đổi. Phân biệt kết quả dùng fixture với kết quả trên môi trường triển khai.

## Lỗi cấu hình thường gặp

| Hiện tượng                          | Điểm cần kiểm tra                                                  |
| ----------------------------------- | ------------------------------------------------------------------ |
| AJAX 404 hoặc response bị bọc       | Prefix exclusion, `VERSION_NEUTRAL`, `@SkipTransform()`            |
| Phân trang sai URL ở trang path sâu | `<base href="/">` và URL mà helper sử dụng                         |
| Danh sách trống                     | Phân công, thành viên nhóm, giao đề, bộ lọc và quyền của tài khoản |
| Avatar có đường dẫn sai             | Dùng `avatarSrc()`/`window.avatarUrl()` cho cả URL và tên file     |
| Transaction timeout khi có ảnh      | Đưa upload mạng ra trước transaction                               |
| Startup thất bại                    | Đầy đủ cấu hình DB/JWT/Storage/SMTP và DB truy cập được            |
