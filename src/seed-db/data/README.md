# Dữ liệu seed LianTest

[README chính](../../../README.md) · [README tiếng Việt](../../../README.vi.md)

Sửa các file JSON trong thư mục này để thay dữ liệu mẫu. Không cần sửa TypeScript,
SQL hay logic nghiệp vụ. Tên website là **LianTest**, người tạo **LianHarman**.

## Bộ dữ liệu kiểm thử mở rộng

Bộ mặc định giữ nguyên các dòng/key cũ và bổ sung dữ liệu mẫu mở rộng. Các dòng mới
trong nhóm/câu/đoạn/đề có key bắt đầu `seed6-`; nội dung là tình huống mô phỏng
để thử chức năng, phân trang, tìm kiếm và quan hệ giữa các màn hình.

| Dữ liệu | Số lượng |
|---|---:|
| Quản trị viên / giảng viên / sinh viên | 1 / 32 / 1.000 |
| Năm học / học kỳ | 4 / 12 |
| Môn học / chương | 16 / 62 |
| Phân công giảng dạy | 391 |
| Nhóm / lượt thành viên | 131 / 6.370 |
| Câu trắc nghiệm / tự luận / đọc hiểu | 1.892 / 747 / 747 |
| Đoạn văn đọc hiểu | 187 |
| Đề thủ công / tự động | 130 / 65 |
| Đề đang mở / đã đóng / chưa mở | 82 / 65 / 48 |
| Bài làm đã nộp mẫu | 2.052 |

Nhóm mới có các cỡ 0, 1, 10, 32, 40, 64, 100 và 150 sinh viên. Có thành viên
thuộc nhiều nhóm cùng môn để kiểm tra trùng lượt thống kê/thông báo. Câu có 2–6
lựa chọn, đủ ba độ khó; đề có riêng từng loại hoặc kết hợp nhiều loại, bật/tắt
trộn câu, trộn đáp án, quyền xem bài/điểm/đáp án và tự nộp khi chuyển tab. Kết quả
có điểm 0, 10, điểm lẻ; đề trắc nghiệm đã chấm và đề có tự luận chờ giáo viên chấm.

Tài khoản để bắt đầu kiểm thử:

- `admin`, `gv001`, `gv002`, `sv001`–`sv010` vẫn giữ dữ liệu cũ.
- Giảng viên có tới `gv032`; sinh viên có tới `sv1000`. Email các tài khoản
  thêm mới dùng miền `example.test`; không phải địa chỉ liên hệ thật.
- `sv001` có thêm nhóm/đề của Lập trình Web. `sv981`–`sv1000` chưa thuộc nhóm
  nào, tiện thử luồng tham gia và từ chối đề chưa được giao.
- Mã mời `S60107` là nhóm Lập trình Web mới có 100 sinh viên; `S60108` có 150.
  Mật khẩu vẫn lấy từ `DEFAULT_PASSWORD`, không khai báo trong JSON.

Các key đề mới có dạng `seed6-<mã môn viết thường>-examNN`, ví dụ
`seed6-ltw001-exam03`. Đây là key dữ liệu; ID số trên URL được sinh khi seed.

| Đuôi key | Tình huống |
|---|---|
| `exam01`, `exam11` | Đang mở, trắc nghiệm 10 hoặc 30 câu |
| `exam02` | Đang mở, 6 trắc nghiệm + 4 đọc hiểu + 2 tự luận |
| `exam03` | Đang mở, tự động toàn môn, không lọc chương, bật tự nộp khi rời tab |
| `exam04` | Đang mở, tự động theo một chương |
| `exam05`, `exam06` | Chưa mở, đọc hiểu hoặc tự động có tự luận |
| `exam07` | Đã đóng, trắc nghiệm và điểm mẫu từ 0 đến 10 |
| `exam08`, `exam09` | Đã đóng, bài hỗn hợp hoặc chỉ tự luận, chờ chấm |
| `exam10` | Đã đóng, điểm tự động và mẫu vi phạm chuyển tab |
| `exam12` | Chưa mở, giao hai nhóm có thành viên trùng nhau |

Đọc và kiểm JSON theo lệnh ở dưới. Bộ lớn được ghi khi seed vào **DB thử nghiệm
trống đã xác định**; sửa JSON không tự thêm dữ liệu vào DB đang có. Startup và
script vẫn giữ quy tắc bỏ qua dữ liệu có sẵn. Seeder hash riêng từng tài khoản,
nên thời gian chạy bộ lớn phụ thuộc `BCRYPT_SALT_ROUNDS` và máy thực thi.

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

### Seed bộ lớn và lỗi kết nối giữa chừng

Ngân hàng câu hỏi/đáp án và kết quả/bài tự luận được ghi theo lô tối đa 100.
Mỗi lô có transaction riêng (chờ tối đa 10 giây để bắt đầu, thời gian transaction
tối đa 30 giây). Log báo tiến độ sau khi lô đã commit, ví dụ:

```text
Câu hỏi: 0/3386 — bắt đầu ghi theo lô 100.
Câu hỏi: 100/3386 — đã ghi xong lô.
...
Câu hỏi: 3386/3386 — đã ghi xong lô.
Bài làm seed6-ltw001-exam07: 32/32 — đã ghi xong lô.
Đề thi: 195/195, bài làm mẫu đã ghi: 2052.
```

Nếu lỗi như `Connection terminated unexpectedly`, seed vẫn dừng và báo lỗi;
không tự retry một commit chưa xác định. Lô đang lỗi được rollback nếu chưa
commit, nhưng **các lô trước đó và dữ liệu của các bước trước có thể đã tồn tại**.
Không có cơ chế tự resume toàn bộ seed. Chỉ kết luận xong khi có log
`Database seeding completed successfully` hoặc thông báo script seed thành công.

Với **DB thử nghiệm có thể xóa** đang chứa lần seed dở, dừng tiến trình watch,
build mã mới và seed lại nghiệp vụ từ đầu:

```powershell
pnpm run build
node scripts/seed-demo.cjs --clear
```

`--clear` xóa toàn bộ dữ liệu nghiệp vụ, giữ bảng tài khoản/quyền. Các tài khoản
trong JSON phải có sẵn; nếu thiếu thì chạy `node scripts/seed-exam.cjs` trước.
Không dùng `--force` để tiếp tục seed dở vì nó bỏ qua kiểm tra dữ liệu cũ và có
thể lỗi khóa trùng hoặc nhân dữ liệu. Khi chuyển về chạy ứng dụng bình thường,
giữ `CLEAR_DB=false`, `SEED_DB=false`, `SEED_DEMO_DATA=false` để không tự xóa/seed
lại khi tiến trình watch khởi động lại. Không chạy các lệnh xóa trên DB cần giữ.

### Quy tắc giữ dữ liệu cũ

Sửa JSON ảnh hưởng **lần seed tiếp theo**, không tự đồng bộ hay đổi tài khoản,
quyền, câu hỏi và kết quả đã có. Startup bỏ qua bảng nền đã có bản ghi; script
nền bỏ qua khóa trùng; demo bỏ qua khi đã có dữ liệu nghiệp vụ. Vì vậy sửa email
JSON sẽ không ghi đè email của tài khoản đã tồn tại.

Các tùy chọn cũ `CLEAR_DB=true`, `--clear`, `--clear-only`, `--force` vẫn giữ nguyên
ý nghĩa. `--clear`/`--clear-only` xóa dữ liệu nghiệp vụ, không chỉ các dòng của
bộ JSON hiện tại. Chỉ dùng trên DB thử nghiệm có thể xóa; không cần bật các tùy
chọn này chỉ để kiểm tra file JSON.
