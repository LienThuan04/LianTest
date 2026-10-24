import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Render,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { StatisticService } from '@/statistic/statistic.service';
import {
  StatAggregatedDto,
  StatDetailDto,
  StatFiltersDto,
  StatGroupsBySubjectDto,
} from '@/statistic/dto/statistic.dto';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Thống kê (statistic.php) — GV xem thống kê điểm theo đề hoặc tổng hợp.
 * Route ở path gốc `/statistic/...` (VERSION_NEUTRAL, trong exclude global prefix).
 * AJAX @SkipTransform để trả nguyên shape JS gốc mong đợi.
 * RBAC: tất cả cần quyền 'thongke'/'view' (như PHP checkPermission).
 */
@Controller({ path: 'statistic', version: VERSION_NEUTRAL })
@Permissions('thongke', 'view')
export class StatisticController {
  constructor(private readonly statistic: StatisticService) {}

  /**
   * GET /statistic — trang thống kê. Không có `made` hợp lệ → chế độ tổng hợp
   * (bộ lọc học kỳ/năm/môn/nhóm); có `made` → thống kê chi tiết 1 đề.
   */
  @Get()
  @Render('pages/statistic')
  async page(
    @Req() req: Request,
    @Query('made') made?: string,
    @Query('mahocky') mahocky?: string,
    @Query('namhoc') namhoc?: string,
  ) {
    const user = req.user as IExamJwtPayload;
    const madeNum = made != null && made !== '' ? Number(made) : NaN;

    // Chế độ tổng hợp (không có mã đề hợp lệ).
    if (!Number.isInteger(madeNum)) {
      const requestedSemester = mahocky ? Number(mahocky) : NaN;
      const requestedYear = namhoc ? Number(namhoc) : NaN;
      const [semesters, academicYears] = await Promise.all([
        this.statistic.getSemesters(user.id),
        this.statistic.getAcademicYears(user.id),
      ]);
      const availableYears = academicYears.filter((year) =>
        semesters.some((semester) => semester.namhoc === year.namhoc),
      );
      const selectedYear =
        (
          availableYears.find((year) => year.namhoc === requestedYear) ??
          availableYears[0]
        )?.namhoc ?? null;
      const availableSemesters = semesters.filter(
        (semester) => semester.namhoc === selectedYear,
      );
      const selectedSemester =
        (
          availableSemesters.find(
            (semester) => semester.mahocky === requestedSemester,
          ) ?? availableSemesters[0]
        )?.mahocky ?? null;
      const [subjects, groups] =
        selectedYear !== null && selectedSemester !== null
          ? await Promise.all([
              this.statistic.getSubjectsByCreator(
                user.id,
                selectedSemester,
                selectedYear,
              ),
              this.statistic.getGroupsByCreator(
                user.id,
                selectedSemester,
                selectedYear,
              ),
            ])
          : [[], []];
      return {
        Title: 'Thống kê tổng hợp',
        Page: 'statistic',
        ShowAggregate: true,
        Semesters: semesters,
        AcademicYears: academicYears,
        Subjects: subjects,
        Groups: groups,
        SelectedYear: selectedYear,
        SelectedSemester: selectedSemester,
        Test: null,
        Nhom: [],
        user,
      };
    }

    // Chi tiết 1 đề: service áp phạm vi admin/chủ sở hữu từ vai trò trong DB.
    const test = await this.statistic.getTestInfo(madeNum, user.id);
    if (!test) {
      throw new NotFoundException(
        'Đề thi không tồn tại hoặc bạn không có quyền truy cập',
      );
    }
    const nhom = await this.statistic.getNhomByTest(madeNum);
    return {
      Title: 'Thống kê điểm thi - ' + (test.tende ?? ''),
      Page: 'statistic',
      ShowAggregate: false,
      Semesters: [],
      AcademicYears: [],
      Subjects: [],
      Groups: [],
      Test: test,
      Nhom: nhom,
      user,
    };
  }

  // ── AJAX ────────────────────────────────────────────────────────────────────

  /** POST /statistic/getStatictical — thống kê điểm 1 đề (thẻ + biểu đồ). */
  @SkipTransform()
  @Post('getStatictical')
  async getStatictical(@Req() req: Request, @Body() dto: StatDetailDto) {
    const user = req.user as IExamJwtPayload;
    // Dùng cùng phạm vi actor với trang SSR và các bộ lọc tổng hợp.
    const test = await this.statistic.getTestInfo(dto.made, user.id);
    if (!test) {
      return { error: 'Đề thi không tồn tại hoặc bạn không có quyền truy cập' };
    }
    return this.statistic.getStatisticalData(dto.made, dto.manhom);
  }

  /** POST /statistic/getAggregatedStatistical — thống kê tổng hợp. */
  @SkipTransform()
  @Post('getAggregatedStatistical')
  getAggregatedStatistical(
    @Req() req: Request,
    @Body() dto: StatAggregatedDto,
  ) {
    const user = req.user as IExamJwtPayload;
    return this.statistic.getAggregatedStatisticalData(
      user.id,
      dto.mahocky,
      dto.namhoc,
      dto.mamonhoc,
      dto.manhom,
    );
  }

  /** POST /statistic/getFilters — nạp môn học + nhóm khi chọn học kỳ/năm học. */
  @SkipTransform()
  @Post('getFilters')
  async getFilters(@Req() req: Request, @Body() dto: StatFiltersDto) {
    const user = req.user as IExamJwtPayload;
    const [subjects, groups] = await Promise.all([
      this.statistic.getSubjectsByCreator(user.id, dto.mahocky, dto.namhoc),
      this.statistic.getGroupsByCreator(user.id, dto.mahocky, dto.namhoc),
    ]);
    return { subjects, groups };
  }

  /** POST /statistic/getGroupsBySubject — nhóm học phần theo môn (mảng). */
  @SkipTransform()
  @Post('getGroupsBySubject')
  getGroupsBySubject(@Req() req: Request, @Body() dto: StatGroupsBySubjectDto) {
    const user = req.user as IExamJwtPayload;
    return this.statistic.getGroupsByCreator(
      user.id,
      dto.mahocky,
      dto.namhoc,
      dto.mamonhoc,
    );
  }
}
