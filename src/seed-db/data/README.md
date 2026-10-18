# Dữ liệu seed LianTest

Sửa các file JSON trong thư mục này để thay dữ liệu mẫu. Không cần sửa TypeScript,
SQL hay logic nghiệp vụ. Tên website là **LianTest**, người tạo **LianHarman**.

## Các file

Mỗi file chứa **một mảng JSON**. Giữ đúng tên trường bên dưới; không thêm comment,
dấu phẩy cuối hoặc biểu thức như `24 * 7` vào JSON.

| File | Nội dung và trường chính |
|---|---|
| `roles.json` | Nhóm quyền: `manhomquyen`, `tennhomquyen` |
| `resources.json` | Chức năng: `chucnang`, `tenchucnang` |
| `permissions.json` | Quyền: `manhomquyen`, `chucnang`, `hanhdong` |
| `users.json` | Tài khoản: `id`, `email`, `hoten`, `manhomquyen` |
| `academic-years.json` | Năm học: `tennamhoc`, `sohocky` |
| `subjects.json` | Môn: `mamonhoc`, `tenmonhoc`, `sotinchi`, `sotietlythuyet`, `sotietthuchanh`, `chuong` |
| `assignments.json` | Phân công: `manguoidung`, `mamonhoc`, `tennamhoc`, `sohocky` |
| `groups.json` | Nhóm: `key`, `tennhom`, `mamonhoc`, `giangvien`, `tennamhoc`, `sohocky`, `mamoi`, `ghichu`, `sinhvien` |
| `questions.json` | Câu độc lập: `key`, `mamonhoc`, `chuong`, `loai`, `dokho`, `noidung`, `nguoitao`, `dapan` |
| `reading-passages.json` | Đọc hiểu: `key`, môn/chương/người tạo/độ khó, `tieude`, `noidung`, `cauhoi` |
| `exams.json` | Đề: `key`, `tende`, môn/người tạo, cấu hình, giờ tương đối, nhóm/chương/câu, kết quả mẫu |

Bốn file đầu là dữ liệu nền. Bảy file sau là dữ liệu nghiệp vụ tùy chọn, chỉ đọc
khi bật `SEED_DEMO_DATA=true`, chạy script demo hoặc kiểm tra toàn bộ dữ liệu.
Có thể để các mảng demo rỗng để bắt đầu một bộ dữ liệu nghiệp vụ mới.

## Ví dụ sửa tài khoản

Trong `users.json`, có thể đổi tên/email hoặc thêm một dòng tương tự:

```json
{
  "id": "gv-mo-rong",
  "email": "teacher@example.test",
  "hoten": "Giảng viên mới",
  "manhomquyen": 1
}
```

Đặt dòng trong mảng `[...]` của file. Mật khẩu được lấy từ `DEFAULT_PASSWORD`
trong môi trường và hash bằng bcrypt; không thêm `password` hoặc `matkhau` vào JSON.
`BCRYPT_SALT_ROUNDS` giữ cách cấu hình hiện tại. Không in mật khẩu vào log seed.

## Giữ quan hệ dữ liệu

- Giữ mã nhóm quyền **1 = giảng viên, 2 = sinh viên, 3 = quản trị viên**. Ứng dụng
  dùng các mã này để phân nhánh; có thể sửa tên hiển thị/quyền hoặc thêm nhóm mới.
- Giữ mã `chucnang` đang dùng trong ứng dụng; sửa `tenchucnang` để đổi tên hiển thị.
  Thêm một resource vào JSON không tự tạo thêm tính năng hay route.
- `id` tài khoản và email phải duy nhất; `manhomquyen` phải tồn tại trong roles.
  Quyền phải tham chiếu đúng role/resource; hành động là `create`, `delete`,
  `update`, `view` hoặc `join`.
- Khi đổi `id` tài khoản, sửa mọi tham chiếu tương ứng ở phân công, nhóm, câu hỏi,
  đoạn văn, đề và bài làm mẫu. Không phụ thuộc vào tên `gv001`/`sv001` trong hàm seed.
- Môn/chương/năm/học kỳ phải khớp giữa các file. `chuong` của môn là mảng tên;
  các nơi dùng chương tham chiếu đúng tên đó. Seeder tự tạo ID số trong DB.
- `key` nhóm/câu/đề là mã tham chiếu của JSON, không phải ID tự tăng. Khi đổi key,
  cập nhật nơi sử dụng. Mã câu đọc hiểu nằm trong cùng phạm vi key với câu độc lập.
- MCQ và câu đọc hiểu dùng mảng `dapan`, mỗi phần tử có `noidungtl` và `ladapan`
  bằng `0` hoặc `1`; cần 2–6 lựa chọn và đúng một lựa chọn đúng. `essay` không có
  mảng đáp án lựa chọn. `dokho` là `1`, `2` hoặc `3`.
- `loaide: 0` là đề thủ công với mảng `cauhoi` chứa key câu hỏi. `loaide: 1` là đề
  tự động với `socau`, ví dụ `{"mcq":{"de":2,"tb":2,"kho":1}}`; dữ liệu phải có
  đủ câu theo môn/chương/loại/độ khó. Seed tự động hiện hỗ trợ `mcq` và `essay`.
- Cờ cấu hình đề là số `0`/`1`. `thoigianthi` và thời gian bài làm mẫu tính bằng
  **phút**. `batdauOffsetHours`/`ketthucOffsetHours` tính bằng **giờ** so với lúc seed;
  ví dụ `-1` và `168` mở đề từ một giờ trước đến bảy ngày sau. Giờ kết thúc phải
  sau giờ bắt đầu và không trùng nhau khi làm tròn xuống mili giây. Ngày sinh ra
  phải nằm trong năm 0001–9999. Điểm từ `0` đến `999.99`, tối đa hai chữ số thập
  phân theo cột `Decimal(5,2)`; các số nguyên lưu DB không vượt `2147483647`.
- Bài làm mẫu trong `ketqua` tham chiếu một thành viên của nhóm được giao đề.
  `socaudung` không vượt số câu chấm tự động; thời gian làm không vượt thời lượng đề
  hay giờ đóng đề. Số phút bài làm tối đa `35791394` để số giây lưu DB không tràn.

Lỗi có dạng `Seed data: questions.json[0].dapan: ...`, chỉ rõ file/dòng dữ liệu
(index bắt đầu từ 0) và trường cần sửa. Bộ nạp kiểm tra trước khi ghi hoặc thực
hiện clear-and-seed. Script demo cũng kiểm tra tài khoản tham chiếu có trong DB
trước khi xóa để seed lại.

## Kiểm tra và chạy

Từ thư mục `NestJS`, build một lần sau khi cập nhật code:

```powershell
pnpm run build
pnpm run seed:check
```

`seed:check` chỉ đọc/kiểm tra JSON, không cần kết nối DB. Để chỉ kiểm tra dữ liệu
nền: `node scripts/check-seed-data.cjs --base-only`.

Sau đó chọn cách seed như trước:

```powershell
node scripts/seed-exam.cjs
node scripts/seed-demo.cjs
```

Hoặc bật `SEED_DB=true` khi khởi động; thêm `SEED_DEMO_DATA=true` nếu cần dữ liệu
nghiệp vụ. Mặc định vẫn tắt seed/clear để việc sửa JSON không tự tác động dữ liệu
đang sử dụng.

**JSON được đọc lại mỗi lần seed/check.** Khi repo có `src/seed-db/data`, file nguồn
này được ưu tiên nên sửa dữ liệu không cần build lại. Build cũng copy JSON vào
`dist/src/seed-db/data` để bản triển khai chỉ có `dist` vẫn hoạt động.

Muốn giữ bộ dữ liệu riêng, sao chép **toàn bộ** thư mục JSON rồi cấu hình:

```powershell
$env:SEED_DATA_DIR = 'D:\MyData\liantest-seed'
pnpm run seed:check
node scripts/seed-exam.cjs
node scripts/seed-demo.cjs
```

Đường dẫn tương đối tính từ thư mục chạy lệnh. Thư mục tùy chỉnh thay thế nguyên
bộ dữ liệu; không âm thầm trộn file bị thiếu với bộ mặc định. Các file JSON không
được phục vụ từ `/public`.

## Dữ liệu đã có trong DB

Sửa JSON ảnh hưởng **lần seed tiếp theo**, không tự đồng bộ hay đổi tài khoản,
quyền, câu hỏi và kết quả đã có. Startup bỏ qua bảng nền đã có bản ghi; script
nền bỏ qua khóa trùng; demo bỏ qua khi đã có dữ liệu nghiệp vụ. Vì vậy sửa email
JSON sẽ không ghi đè email của tài khoản đã tồn tại.

Các tùy chọn cũ `CLEAR_DB=true`, `--clear`, `--clear-only`, `--force` vẫn giữ nguyên
ý nghĩa. `--clear`/`--clear-only` xóa dữ liệu nghiệp vụ, không chỉ các dòng của
bộ JSON hiện tại. Chỉ dùng trên DB thử nghiệm có thể xóa; không cần bật các tùy
chọn này chỉ để kiểm tra file JSON.
