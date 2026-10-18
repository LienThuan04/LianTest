export interface IDemoNamHoc {
  tennamhoc: string;
  sohocky: number;
}

export interface IBaseSeedData {
  roles: { manhomquyen: number; tennhomquyen: string }[];
  resources: { chucnang: string; tenchucnang: string }[];
  permissions: { manhomquyen: number; chucnang: string; hanhdong: string }[];
  users: { id: string; email: string; hoten: string; manhomquyen: number }[];
}

export interface IDemoSeedData {
  academicYears: IDemoNamHoc[];
  subjects: IDemoMonHoc[];
  assignments: IDemoPhanCong[];
  groups: IDemoNhom[];
  questions: IDemoCauHoi[];
  readingPassages: IDemoDoanVan[];
  exams: IDemoDeThi[];
}

export interface ISeedDataset {
  base: IBaseSeedData;
  demo?: IDemoSeedData;
  /** One clock for date preflight and writes, even after clear/database work. */
  referenceTime?: number;
}

/** Môn học kèm danh sách tên chương (thứ tự khai báo = thứ tự tạo). */
export interface IDemoMonHoc {
  mamonhoc: string;
  tenmonhoc: string;
  sotinchi: number;
  sotietlythuyet: number;
  sotietthuchanh: number;
  chuong: string[];
}

/** Phân công giảng dạy — năm/kỳ trỏ theo NHÃN, seeder tra ra manamhoc/mahocky. */
export interface IDemoPhanCong {
  manguoidung: string;
  mamonhoc: string;
  tennamhoc: string;
  /** Thứ tự học kỳ trong năm (1..n) — khớp cột `hocky.sohocky`. */
  sohocky: number;
}

/** Nhóm học phần + danh sách sinh viên (ghi vào `chitietnhom`, `siso` tự tính). */
export interface IDemoNhom {
  key: string;
  tennhom: string;
  mamonhoc: string;
  giangvien: string;
  tennamhoc: string;
  sohocky: number;
  /** Mã mời cố định để tiện thử luồng "SV nhập mã tham gia nhóm". */
  mamoi: string;
  ghichu: string;
  sinhvien: string[];
}

/** Một đáp án của câu trắc nghiệm. ladapan = 1 nghĩa là đáp án đúng. */
export interface IDemoDapAn {
  noidungtl: string;
  ladapan: 0 | 1;
}

/** Câu hỏi trắc nghiệm hoặc tự luận. `chuong` là TÊN chương trong cùng môn. */
export interface IDemoCauHoi {
  key: string;
  mamonhoc: string;
  chuong: string;
  loai: 'mcq' | 'essay';
  /** 1 = dễ, 2 = trung bình, 3 = khó. */
  dokho: 1 | 2 | 3;
  noidung: string;
  nguoitao: string;
  /** Bắt buộc với mcq (4 đáp án, đúng 1 cái ladapan = 1); essay bỏ trống. */
  dapan?: IDemoDapAn[];
}

/** Đoạn văn đọc hiểu + các câu hỏi con (mỗi câu con là 1 bản ghi cauhoi loai='reading'). */
export interface IDemoDoanVan {
  key: string;
  mamonhoc: string;
  chuong: string;
  tieude: string;
  noidung: string;
  nguoitao: string;
  dokho: 1 | 2 | 3;
  cauhoi: { key: string; noidung: string; dapan: IDemoDapAn[] }[];
}

/** Số câu theo mức độ cho đề tự động (khớp cột mcq_de/mcq_tb/... của `dethi`). */
export interface IDemoSoCau {
  de: number;
  tb: number;
  kho: number;
}

/** Bài làm mẫu của 1 sinh viên trên đề đã kết thúc. */
export interface IDemoKetQua {
  manguoidung: string;
  /** Số câu trắc nghiệm/đọc hiểu làm đúng (tính từ câu đầu tiên của đề). */
  socaudung: number;
  /** Số phút đã dùng để làm bài. */
  thoigianlambai: number;
  solanchuyentab: number;
  /** Nội dung bài tự luận (nếu đề có câu tự luận). */
  baituluan?: string;
}

/** Đề thi mẫu. Mốc thời gian khai báo dạng "lệch bao nhiêu giờ so với lúc seed". */
export interface IDemoDeThi {
  key: string;
  tende: string;
  mamonhoc: string;
  nguoitao: string;
  /** 0 = thủ công (chọn câu tay), 1 = tự động (random theo độ khó). */
  loaide: 0 | 1;
  /** Thời gian làm bài (phút). */
  thoigianthi: number;
  batdauOffsetHours: number;
  ketthucOffsetHours: number;
  hienthibailam: 0 | 1;
  xemdiemthi: 0 | 1;
  xemdapan: 0 | 1;
  troncauhoi: 0 | 1;
  trondapan: 0 | 1;
  nopbaichuyentab: 0 | 1;
  diem_tracnghiem: number;
  diem_tuluan: number;
  diem_dochieu: number;
  /** Nhóm được giao đề (theo `key` của IDemoNhom). */
  nhom: string[];
  /** Tên chương phủ bởi đề — ghi vào `dethitudong` (đề tự động dùng để random). */
  chuong: string[];
  /** Đề THỦ CÔNG: danh sách `key` câu hỏi theo đúng thứ tự. */
  cauhoi?: string[];
  /** Đề TỰ ĐỘNG: số câu cần random theo loại/mức độ. */
  socau?: Partial<Record<'mcq' | 'essay' | 'reading', IDemoSoCau>>;
  /** Bài làm mẫu (chỉ dùng cho đề đã kết thúc). */
  ketqua?: IDemoKetQua[];
}
