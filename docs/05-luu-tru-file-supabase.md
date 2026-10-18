# 05 — Lưu ảnh bằng Supabase Storage

[Chỉ mục tài liệu](README.md) · [Biến môi trường](../README.vi.md#biến-môi-trường)

## Cấu hình

Ứng dụng dùng **public bucket** và lưu URL ảnh trong PostgreSQL. Khóa service role
chỉ dùng phía server; không đưa vào JavaScript trình duyệt hoặc commit.

| Biến                       | Ý nghĩa                                            |
| -------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`             | URL dự án Supabase                                 |
| `SUPABASE_KEY`             | Khóa server dùng để upload/xoá object              |
| `SUPABASE_NAME_BUCKET`     | Tên bucket public đã tạo                           |
| `LIMIT_UPLOAD_FILE_SIZEMB` | Giới hạn một file upload tính bằng MB, mặc định 50 |

`StorageModule` là global module. `SupabaseStorageService` tại
`src/storage/supabase-storage.service.ts` cung cấp `uploadImage()`, `uploadBase64()`,
`getPublicUrl()`, `ownedObjectPath()` và `remove()`. Service nhận diện MIME từ
magic bytes PNG/GIF/WebP, mặc định JPEG, và dùng tên UUID. Giới hạn Multer nằm trong
`src/common/config/upload.config.ts`.

## Luồng upload và ghi dữ liệu

Upload cần I/O mạng nên thực hiện **trước `$transaction`**, lấy URL rồi ghi DB.
Không giữ transaction DB trong lúc chờ Storage.

| Nội dung                | Xử lý                                                                                | Thư mục bucket |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------- |
| Ảnh câu hỏi/đáp án      | `QuestionsService` upload file multipart; giữ URL hiện có nếu client yêu cầu giữ ảnh | `questions/`   |
| Ảnh câu trả lời tự luận | `ExamsService` đọc base64, upload trước transaction rồi lưu URL                      | `essays/`      |
| Avatar                  | `AccountService` upload, ghi URL vào `nguoidung.avatar`, sau đó xét dọn ảnh thay thế | `avatars/`     |

Các cột `hinhanh` trong `cauhoi`, `cautraloi`, `hinhanh_traloi_tuluan` là chuỗi URL.
Trình duyệt dùng trực tiếp URL trong `<img src="...">`. Chi tiết kết quả tự luận
có thể trả danh sách URL hoặc ghép các URL bằng `||` theo hợp đồng endpoint;
không thêm tiền tố base64 khi render URL.

## Avatar

`nguoidung.avatar` chấp nhận URL public hoặc tên file trong `public/media/avatars/`
(ví dụ dữ liệu seed). Render qua `avatarSrc()` ở server
(`src/common/utils/avatar.util.ts`) hoặc `window.avatarUrl()` ở client
(`public/js/avatar-url.js`). Helper client được nạp qua `views/partials/head.ejs`.
Không tự ghép tiền tố thư mục vào giá trị có thể đã là URL.

## Dọn ảnh thay thế

`src/storage/image-cleanup.ts` chỉ xử lý sau khi DB ghi thành công:

- URL phải thuộc đúng origin và đường dẫn public của bucket cấu hình.
  Bỏ qua URL bên ngoài, tên file local hoặc đường dẫn không hợp lệ.
- Gom URL trùng theo object path; kiểm tra tham chiếu ở câu hỏi, đáp án, ảnh tự
  luận và người dùng, kể cả bản ghi ẩn hoặc đã xoá mềm. Ảnh còn tham chiếu được giữ lại.
- Nộp lại một mục tự luận thay bộ ảnh của chính mục đó trong transaction;
  chỉ xét xoá các ảnh thay thế hết tham chiếu sau commit.
- Lỗi kiểm tra tham chiếu hoặc xoá Storage chỉ ghi cảnh báo, không làm thao tác
  đã ghi DB báo thất bại. Cơ chế này không quét hàng loạt object mồ côi hoặc tự
  dọn ảnh mới upload khi transaction DB rollback.

Ứng dụng hiện giả định bucket public. Chuyển bucket thành private cần thay cơ chế
lưu path/phát signed URL đồng bộ với backend và giao diện; chỉ đổi quyền bucket
sẽ làm URL ảnh hiện tại không truy cập được.
