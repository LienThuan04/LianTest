import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { AssignmentsService } from '@/assignments/assignments.service';
import {
  AddAssignmentDto,
  AssignmentPaginationBodyDto,
  CheckDuplicateForUpdateDto,
  DeleteAssignmentDto,
  GetHocKyDto,
  UpdateAssignmentDto,
} from '@/assignments/dto/assignment.dto';
import type { IAssignmentPaginationArgs } from '@/assignments/interfaces/assignment.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Phân công giảng dạy (assignment.php) — gắn GV với môn học theo năm/kỳ.
 * Route ở path gốc `/assignment/...` (VERSION_NEUTRAL, trong exclude global prefix).
 * AJAX dùng @SkipTransform để trả nguyên shape JS gốc mong đợi.
 *
 * RBAC: trang và đọc AJAX cần 'phancong'/'view'; ghi cần quyền hành động tương ứng.
 * Phân trang dùng chung 2 nhánh: mặc định = danh sách phân công; custom=monhoc =
 * danh sách môn cho modal chọn.
 */
@Controller({ path: 'assignment', version: VERSION_NEUTRAL })
@Permissions('phancong', 'view')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  private parseArgs(raw: string): IAssignmentPaginationArgs {
    try {
      return JSON.parse(raw) as IAssignmentPaginationArgs;
    } catch {
      return {};
    }
  }

  /** GET /assignment — trang phân công giảng dạy (thay Assignment::default). */
  @Permissions('phancong', 'view')
  @Get()
  @Render('pages/assignment')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Phân Công Giảng Dạy', Page: 'assignment', user };
  }

  /** GET /assignment/getGiangVien — danh sách giảng viên (dropdown). */
  @SkipTransform()
  @Get('getGiangVien')
  getGiangVien() {
    return this.assignments.getGiangVien();
  }

  /** GET /assignment/getMonHoc — tất cả môn học (dropdown modal sửa). */
  @SkipTransform()
  @Get('getMonHoc')
  getMonHoc() {
    return this.assignments.getMonHoc();
  }

  /** GET /assignment/getNamHoc — năm học (dropdown). */
  @SkipTransform()
  @Get('getNamHoc')
  getNamHoc() {
    return this.assignments.getNamHoc();
  }

  /** POST /assignment/getHocKy — học kỳ của 1 năm học. */
  @SkipTransform()
  @Post('getHocKy')
  getHocKy(@Body() dto: GetHocKyDto) {
    return this.assignments.getHocKy(dto.manamhoc);
  }

  /** POST /assignment/getTotalPages — tổng số trang (phân công hoặc môn học). */
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(@Body() dto: AssignmentPaginationBodyDto) {
    const args = this.parseArgs(dto.args);
    if (args.custom?.function === 'monhoc') {
      return this.assignments.countSubjectPages(args);
    }
    return this.assignments.countAssignmentPages(args);
  }

  /** POST /assignment/pagination — 1 trang dữ liệu (phân công hoặc môn học). */
  @SkipTransform()
  @Post('pagination')
  paginate(@Body() dto: AssignmentPaginationBodyDto) {
    const args = this.parseArgs(dto.args);
    if (args.custom?.function === 'monhoc') {
      return this.assignments.listSubjectsForModal(args);
    }
    return this.assignments.listAssignments(args);
  }

  /** POST /assignment/checkDuplicate — các môn bị trùng khi thêm. */
  @Permissions('phancong', 'create')
  @SkipTransform()
  @Post('checkDuplicate')
  checkDuplicate(@Body() dto: AddAssignmentDto) {
    return this.assignments.checkDuplicate(
      dto.magiangvien,
      dto.listSubject,
      dto.namhoc,
      dto.hocky,
    );
  }

  /** POST /assignment/addAssignment — phân công nhiều môn cho 1 GV. */
  @Permissions('phancong', 'create')
  @SkipTransform()
  @Post('addAssignment')
  addAssignment(@Body() dto: AddAssignmentDto) {
    return this.assignments.addAssignment(
      dto.magiangvien,
      dto.listSubject,
      dto.namhoc,
      dto.hocky,
    );
  }

  /** POST /assignment/checkDuplicateForUpdate — kiểm trùng 1 môn khi đổi GV. */
  @Permissions('phancong', 'update')
  @SkipTransform()
  @Post('checkDuplicateForUpdate')
  checkDuplicateForUpdate(@Body() dto: CheckDuplicateForUpdateDto) {
    return this.assignments.checkDuplicateForUpdate(
      dto.magiangvien,
      dto.old_mamonhoc,
      dto.namhoc,
      dto.hocky,
    );
  }

  /**
   * POST /assignment/update — đổi giảng viên của 1 phân công.
   * Chặn nếu GV mới đã được phân công môn này trong kỳ này (như PHP).
   */
  @Permissions('phancong', 'update')
  @SkipTransform()
  @Post('update')
  async update(@Body() dto: UpdateAssignmentDto) {
    const dup = await this.assignments.checkDuplicateForUpdate(
      dto.magiangvien,
      dto.old_mamonhoc,
      dto.old_namhoc,
      dto.old_hocky,
    );
    if (dup.duplicates.length > 0) {
      return {
        success: false,
        message: 'Giảng viên này đã được phân công môn này trong học kỳ này!',
      };
    }
    return this.assignments.update(
      dto.old_mamonhoc,
      dto.old_manguoidung,
      dto.old_namhoc,
      dto.old_hocky,
      dto.magiangvien,
    );
  }

  /** POST /assignment/delete — xoá mềm phân công. */
  @Permissions('phancong', 'delete')
  @SkipTransform()
  @Post('delete')
  async delete(@Body() dto: DeleteAssignmentDto) {
    const ok = await this.assignments.delete(
      dto.mamon,
      dto.id,
      dto.namhoc,
      dto.hocky,
    );
    return { success: ok };
  }
}
