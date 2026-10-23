import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  IAcademicYearOption,
  IGroupOption,
  ISemesterOption,
  IStatisticData,
  ISubjectOption,
  ITestInfo,
} from '@/statistic/interfaces/statistic.types';

/**
 * Nghiệp vụ Thống kê — thay ThongKeModel.php (statistic.php).
 * Hai chế độ: (1) thống kê điểm 1 đề (getStatisticalData) và (2) thống kê tổng
 * hợp theo học kỳ/năm học/môn/nhóm (getAggregatedStatisticalData).
 *
 * Mỗi kết quả chỉ được đếm một lần dù SV thuộc nhiều nhóm được giao cùng đề.
 * Khoảng điểm cuối bao gồm điểm 10; thống kê tổng hợp đếm các lượt thi theo đề.
 */
@Injectable()
export class StatisticService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mảng 10 khoảng điểm rỗng. */
  private emptyBins(): number[] {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  private emptyData(): IStatisticData {
    return {
      da_nop_bai: 0,
      chua_nop_bai: 0,
      khong_thi: 0,
      diem_trung_binh: 0,
      diem_cao_nhat: 0,
      thong_ke_diem: this.emptyBins(),
    };
  }

  /** round($x, 1) của PHP. */
  private round1(x: number): number {
    return Math.round(x * 10) / 10;
  }

  /**
   * Phân bố điểm: [0,1), ... [8,9), [9,10], giữ mảng 10 cột cho giao diện.
   */
  private binScore(bins: number[], diemthi: number): void {
    const v = Math.max(0, Math.min(diemthi, 10));
    bins[Math.min(Math.floor(v), 9)]++;
  }

  // ── Dropdown lọc (thống kê tổng hợp) ────────────────────────────────────────

  /** Danh sách học kỳ có đề của GV. Thay ThongKeModel::getSemesters. */
  async getSemesters(nguoitao: string): Promise<ISemesterOption[]> {
    if (!nguoitao) return [];
    return this.prisma.$queryRaw<ISemesterOption[]>(Prisma.sql`
      SELECT DISTINCT n.hocky AS mahocky, hk.tenhocky
      FROM nhom n
      JOIN hocky hk ON n.hocky = hk.mahocky
      JOIN giaodethi g ON n.manhom = g.manhom
      JOIN dethi d ON g.made = d.made
      WHERE d.nguoitao = ${nguoitao} AND n.trangthai = 1 AND d.trangthai = 1
      ORDER BY hk.tenhocky
    `);
  }

  /** Danh sách năm học có đề của GV. Thay ThongKeModel::getAcademicYears. */
  async getAcademicYears(nguoitao: string): Promise<IAcademicYearOption[]> {
    if (!nguoitao) return [];
    return this.prisma.$queryRaw<IAcademicYearOption[]>(Prisma.sql`
      SELECT DISTINCT n.namhoc, nh.tennamhoc
      FROM nhom n
      JOIN namhoc nh ON n.namhoc = nh.manamhoc
      JOIN giaodethi g ON n.manhom = g.manhom
      JOIN dethi d ON g.made = d.made
      WHERE d.nguoitao = ${nguoitao} AND n.trangthai = 1 AND d.trangthai = 1
      ORDER BY nh.tennamhoc DESC
    `);
  }

  /** Môn học của GV theo học kỳ/năm học. Thay ThongKeModel::getSubjectsByCreator. */
  async getSubjectsByCreator(
    nguoitao: string,
    mahocky: number,
    namhoc: number,
  ): Promise<ISubjectOption[]> {
    if (!nguoitao || !mahocky || !namhoc) return [];
    return this.prisma.$queryRaw<ISubjectOption[]>(Prisma.sql`
      SELECT DISTINCT m.mamonhoc, m.tenmonhoc
      FROM monhoc m
      JOIN dethi d ON m.mamonhoc = d.monthi
      JOIN giaodethi g ON d.made = g.made
      JOIN nhom n ON g.manhom = n.manhom
      WHERE d.nguoitao = ${nguoitao} AND d.trangthai = 1
        AND n.hocky = ${mahocky} AND n.namhoc = ${namhoc} AND n.trangthai = 1
    `);
  }

  /**
   * Nhóm học phần của GV theo học kỳ/năm học (lọc thêm môn nếu có).
   * Thay ThongKeModel::getGroupsByCreator.
   */
  async getGroupsByCreator(
    nguoitao: string,
    mahocky: number,
    namhoc: number,
    mamonhoc?: string,
  ): Promise<IGroupOption[]> {
    if (!nguoitao || !mahocky || !namhoc) return [];
    const monCond = mamonhoc
      ? Prisma.sql`AND n.mamonhoc = ${mamonhoc}`
      : Prisma.empty;
    return this.prisma.$queryRaw<IGroupOption[]>(Prisma.sql`
      SELECT DISTINCT n.manhom, n.tennhom
      FROM nhom n
      JOIN giaodethi g ON n.manhom = g.manhom
      JOIN dethi d ON g.made = d.made
      WHERE d.nguoitao = ${nguoitao} AND n.trangthai = 1 AND d.trangthai = 1
        AND n.hocky = ${mahocky} AND n.namhoc = ${namhoc} ${monCond}
    `);
  }

  // ── Thông tin đề (thống kê chi tiết) ────────────────────────────────────────

  /** Thông tin 1 đề (kiểm quyền sở hữu qua nguoitao). Thay ThongKeModel::getTestInfo. */
  async getTestInfo(made: number, nguoitao: string): Promise<ITestInfo | null> {
    if (!made || !nguoitao) return null;
    const rows = await this.prisma.$queryRaw<ITestInfo[]>(Prisma.sql`
      SELECT d.made, d.tende, d.thoigiantao, m.mamonhoc, m.tenmonhoc
      FROM dethi d
      JOIN monhoc m ON d.monthi = m.mamonhoc
      WHERE d.made = ${made} AND d.nguoitao = ${nguoitao} AND d.trangthai = 1
    `);
    return rows[0] ?? null;
  }

  /** Nhóm được giao đề (dropdown lọc thống kê chi tiết). Thay getNhomByTest. */
  async getNhomByTest(made: number): Promise<IGroupOption[]> {
    if (!made) return [];
    return this.prisma.$queryRaw<IGroupOption[]>(Prisma.sql`
      SELECT n.manhom, n.tennhom
      FROM nhom n
      JOIN giaodethi g ON n.manhom = g.manhom
      WHERE g.made = ${made} AND n.trangthai = 1
    `);
  }

  // ── Dữ liệu thống kê ────────────────────────────────────────────────────────

  /**
   * Thống kê điểm 1 đề (lọc theo nhóm; manhom=0 = tất cả).
   * Thay ThongKeModel::getStatisticalData.
   */
  async getStatisticalData(made: number, manhom = 0): Promise<IStatisticData> {
    const data = this.emptyData();
    if (!made) return data;

    const nhomCond =
      manhom === 0 ? Prisma.empty : Prisma.sql`AND cn.manhom = ${manhom}`;
    const resultGroupCond = manhom === 0 ? Prisma.empty : Prisma.sql`
      AND EXISTS (
        SELECT 1 FROM chitietnhom cn
        JOIN giaodethi gd ON gd.manhom = cn.manhom AND gd.made = kq.made
        WHERE cn.manguoidung = kq.manguoidung AND cn.manhom = ${manhom}
      )
    `;

    // Các số liệu dùng chung phép JOIN (đã nộp / chưa nộp / TB / cao nhất / phân bố).
    const rows = await this.prisma.$queryRaw<
      { makq: number; diemthi: number | null; thoigianvaothi: Date | null }[]
    >(Prisma.sql`
      SELECT kq.makq, kq.diemthi, kq.thoigianvaothi
      FROM ketqua kq
      WHERE kq.made = ${made} ${resultGroupCond}
    `);

    let tong = 0;
    let dem = 0;
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.makq)) continue;
      seen.add(row.makq);
      if (row.diemthi !== null) {
        const score = Math.max(0, Math.min(row.diemthi, 10));
        data.da_nop_bai++;
        tong += score;
        dem++;
        data.diem_cao_nhat = Math.max(
          data.diem_cao_nhat,
          score,
        );
        this.binScore(data.thong_ke_diem, score);
      } else if (row.thoigianvaothi !== null) {
        data.chua_nop_bai++;
      }
    }
    if (dem > 0) data.diem_trung_binh = this.round1(tong / dem);

    // Số thí sinh không thi: thành viên nhóm được giao đề nhưng chưa có kết quả.
    const khongThi = await this.prisma.$queryRaw<
      { total: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(DISTINCT cn.manguoidung)::bigint AS total
      FROM chitietnhom cn
      JOIN giaodethi gd ON cn.manhom = gd.manhom
      LEFT JOIN ketqua kq ON cn.manguoidung = kq.manguoidung AND kq.made = ${made}
      WHERE gd.made = ${made} AND kq.makq IS NULL ${nhomCond}
    `);
    data.khong_thi = Number(khongThi[0]?.total ?? 0);

    return data;
  }

  /**
   * Thống kê tổng hợp theo học kỳ/năm học (lọc thêm môn/nhóm).
   * Thay ThongKeModel::getAggregatedStatisticalData.
   */
  async getAggregatedStatisticalData(
    nguoitao: string,
    mahocky: number,
    namhoc: number,
    mamonhoc?: string,
    manhom?: number,
  ): Promise<IStatisticData> {
    const data = this.emptyData();
    if (!nguoitao || !mahocky || !namhoc) return data;

    const monCond = mamonhoc
      ? Prisma.sql`AND d.monthi = ${mamonhoc}`
      : Prisma.empty;
    const nhomCond =
      manhom && manhom !== 0
        ? Prisma.sql`AND cn.manhom = ${manhom}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      { makq: number; diemthi: number | null; thoigianvaothi: Date | null }[]
    >(Prisma.sql`
      SELECT DISTINCT kq.makq, kq.diemthi, kq.thoigianvaothi
      FROM ketqua kq
      JOIN giaodethi gd ON kq.made = gd.made
      JOIN chitietnhom cn ON gd.manhom = cn.manhom AND kq.manguoidung = cn.manguoidung
      JOIN dethi d ON kq.made = d.made
      JOIN nhom n ON gd.manhom = n.manhom
      WHERE d.nguoitao = ${nguoitao} AND d.trangthai = 1 AND n.trangthai = 1
        AND n.hocky = ${mahocky} AND n.namhoc = ${namhoc} ${monCond} ${nhomCond}
    `);

    const scores: number[] = [];
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.makq)) continue;
      seen.add(row.makq);
      if (row.diemthi !== null) {
        data.da_nop_bai++;
        scores.push(Math.max(0, Math.min(row.diemthi, 10)));
      } else if (row.thoigianvaothi !== null) {
        data.chua_nop_bai++;
      }
    }

    // Mỗi cặp sinh viên/đề chưa có kết quả là một lượt không thi.
    const khongThi = await this.prisma.$queryRaw<
      { total: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(DISTINCT (cn.manguoidung, d.made))::bigint AS total
      FROM chitietnhom cn
      JOIN giaodethi gd ON cn.manhom = gd.manhom
      JOIN dethi d ON gd.made = d.made
      JOIN nhom n ON cn.manhom = n.manhom
      LEFT JOIN ketqua kq ON cn.manguoidung = kq.manguoidung AND kq.made = d.made
      WHERE d.nguoitao = ${nguoitao} AND d.trangthai = 1 AND n.trangthai = 1
        AND n.hocky = ${mahocky} AND n.namhoc = ${namhoc} AND kq.makq IS NULL
        ${monCond} ${nhomCond}
    `);
    data.khong_thi = Number(khongThi[0]?.total ?? 0);

    if (scores.length > 0) {
      data.diem_trung_binh = this.round1(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      );
      data.diem_cao_nhat = Math.max(...scores);
      for (const s of scores) this.binScore(data.thong_ke_diem, s);
    }

    return data;
  }
}
