/**
 * Kiểu dữ liệu cho module Thống kê (statistic.php + ThongKeModel.php) — Phase 6.
 */

/** Thẻ + biểu đồ thống kê điểm — chung cho thống kê 1 đề và thống kê tổng hợp. */
export interface IStatisticData {
  da_nop_bai: number;
  chua_nop_bai: number;
  khong_thi: number;
  diem_trung_binh: number;
  diem_cao_nhat: number;
  /** 10 khoảng điểm 0-1 .. 9-10. */
  thong_ke_diem: number[];
}

/** Học kỳ có đề của GV (dropdown lọc tổng hợp). */
export interface ISemesterOption {
  mahocky: number;
  tenhocky: string;
  namhoc: number;
}

/** Năm học có đề của GV (dropdown lọc tổng hợp). */
export interface IAcademicYearOption {
  namhoc: number;
  tennamhoc: string;
}

/** Môn học của GV theo học kỳ/năm học. */
export interface ISubjectOption {
  mamonhoc: string;
  tenmonhoc: string;
}

/** Nhóm học phần của GV theo học kỳ/năm học (+ môn học nếu lọc). */
export interface IGroupOption {
  manhom: number;
  tennhom: string;
}

/** Thông tin đề (trang thống kê chi tiết theo mã đề). */
export interface ITestInfo {
  made: number;
  tende: string | null;
  thoigiantao: Date;
  mamonhoc: string;
  tenmonhoc: string;
}
