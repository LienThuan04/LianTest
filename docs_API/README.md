# API hệ thi LianHarman — NestJS SSR

Tài liệu này mô tả hệ thi hiện tại. Khung BaseAuth cũ đã được gỡ; tài liệu cũ được
lưu ở [legacy-baseauth.md](legacy-baseauth.md) để tham khảo lịch sử, không dùng làm
hợp đồng API của sản phẩm hiện tại.

## Địa chỉ và định dạng phản hồi

- Các trang và AJAX nghiệp vụ ở path gốc (`/auth`, `/question`, `/test`…), không có
  tiền tố `/api/v1`. Cấu hình trong `src/config/app-setup.config.ts`.
- Trang dùng EJS, trả HTML. AJAX có `@SkipTransform()` trả object/mảng/boolean gốc;
  không tự giả định mọi phản hồi đều có lớp `data`.
- API hạ tầng còn lại dùng prefix/version cấu hình. `/swagger` chỉ mở khi
  `MODE=development`; kiểm tra controller hiện tại trước khi tích hợp.

## Xác thực và quyền

`POST /auth/login` nhận `{ id, password }` và cấp JWT trong cookie httpOnly
`access_token` (hoặc tên `ACCESS_TOKEN_COOKIE`). `GET /auth/signin` là trang đăng nhập;
`POST /auth/logout` xoá cookie rồi chuyển về trang đăng nhập.

JWT của hệ thi chứa mã tài khoản và nhóm quyền. `PermissionsGuard` kiểm tra quyền
động trong `chitietquyen`; nhóm seed mặc định: 1=Giáo viên, 2=Sinh viên, 3=Admin.
Quyền thông báo/thống kê mặc định của giáo viên phụ thuộc dữ liệu quyền đã cấp.
Không có endpoint Google OAuth, refresh token hay session theo thiết bị của BaseAuth cũ.

Đăng ký công khai dùng `POST /auth/addUser`, nhận `masinhvien`, `hoten`, `email`,
`password`, `confirm_password` và thông tin hồ sơ tuỳ chọn; luôn tạo nhóm Sinh viên.
Khôi phục mật khẩu dùng `/auth/sendOptAuth` → `/auth/checkOpt` → `/auth/changePassword`.
Cookie `recover_ticket` có thời hạn 10 phút; chỉ vé đã xác minh OTP được đổi mật khẩu.

## Nhóm route chính

| Path | Nội dung | Controller |
|------|----------|------------|
| `/`, `/dashboard` | Landing, tổng quan và onboarding email | `pages` |
| `/account` | Hồ sơ, mật khẩu, avatar, bản đồ quyền | `account` |
| `/roles`, `/user` | Nhóm quyền và người dùng; nhập danh sách `.xlsx`/`.xls` | `roles`, `users` |
| `/namhoc`, `/subject`, `/view_subject` | Năm học, môn/chương và môn được phân công | `academic-years`, `subjects`, `view-subject` |
| `/question` | Câu hỏi, phân trang, nhập Word/Excel | `questions` |
| `/assignment`, `/module`, `/client` | Phân công, nhóm GV/SV và lịch thi | `assignments`, `class-modules`, `client` |
| `/test` | Tạo/giao đề, làm bài/nộp, kết quả, chấm tự luận, export | `exams` |
| `/teacher_announcement`, `/statistic` | Thông báo, chuông và thống kê | `announcements`, `statistic` |

Tên route giữ theo PHP/JS gốc (ví dụ `getStatictical`, `editQuesion`). Không tự đổi
sang cách viết REST khi gọi từ giao diện đang có. DTO và controller trong `src/`
là nguồn chính xác cho từng request.

## Nhập câu hỏi Excel

1. `GET /question/excelTemplate`: cần quyền `cauhoi.create`; trả
   `{status, file, filename}`, trong đó `file` là data URI workbook `.xlsx`.
2. `POST /question/addExcel`: multipart field `fileToUpload`, nhận `.xlsx`/`.xls`;
   trả mảng preview cùng shape Word. Chưa ghi DB ở bước này.
3. `POST /question/updateQuestionJSON`: nhận chuỗi JSON `questions` để kiểm tra/
   chuẩn hoá preview; không lưu câu hỏi vào DB.
4. `POST /question/addQuesFile`: form `{monhoc, chuong, questions}`; kiểm tra cả lô
   trước khi lưu và trả `{status, inserted, errors}`.

Sheet đầu dùng dòng tiêu đề: `id, type, level, question, A, B, C, D, answer,
reading_id, title, passage`. `type` là `mcq`, `essay`, `reading`; `level` là 1–3.
Trắc nghiệm/đọc hiểu cần ít nhất hai phương án liên tiếp và đáp án A–D hoặc 1–4.
Đọc hiểu gom các dòng cùng `reading_id` liên tiếp; dòng đầu có đoạn văn, các dòng
sau cùng mức độ. `id` nguồn chỉ để đối chiếu preview; DB tự tạo mã mới.

## Excel, PDF và ảnh

Excel danh sách SV/bảng điểm trả data URI `.xlsx`. `/test/exportPdf/:makq` trả
trang HTML mở hộp thoại in; người dùng chọn lưu PDF trên trình duyệt.
Ảnh câu hỏi/đáp án/tự luận/avatar mới lưu trên Supabase Storage, DB chỉ lưu URL.
Ảnh thay thế chỉ dọn sau khi ghi DB thành công và không còn tham chiếu.

## Kiểm chứng

`pnpm run build`, `pnpm run lint`, `pnpm test`, `pnpm run test:e2e --runInBand`.
E2e nghiệp vụ cần DB/Storage test và dữ liệu mẫu; thiếu điều kiện tiên quyết phải
báo lỗi. Các kết quả lịch sử và kiểm chứng mới nằm trong
[sổ tiến độ](../docs/03-tien-do.md).
