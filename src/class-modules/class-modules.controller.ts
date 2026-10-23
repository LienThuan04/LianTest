import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { ClassModulesService } from '@/class-modules/class-modules.service';
import {
  AddByClassCodeDto,
  AddGroupDto,
  AddSvDto,
  AddSvGroupDto,
  CheckAccDto,
  CheckDuplicateDto,
  GetHocKyDto,
  GroupPaginationBodyDto,
  HideGroupDto,
  KickUserDto,
  ManhomDto,
  UpdateGroupDto,
} from '@/class-modules/dto/class-modules.dto';
import type { IGroupPaginationArgs } from '@/class-modules/interfaces/class-modules.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Nhóm học phần (module.php) — GV quản lý nhóm/lớp học phần + chi tiết thành viên.
 * Route ở path gốc `/module/...` (VERSION_NEUTRAL, trong exclude global prefix).
 * AJAX dùng @SkipTransform để trả nguyên shape JS gốc mong đợi.
 *
 * RBAC: đọc cần 'hocphan'/'view'; thêm/sửa/xoá cần hành động tương ứng.
 * Mọi AJAX quản lý một nhóm kiểm chủ nhóm hoặc admin đang hoạt động trong DB.
 */
@Controller({ path: 'module', version: VERSION_NEUTRAL })
@Permissions('hocphan', 'view')
export class ClassModulesController {
  constructor(private readonly classModules: ClassModulesService) {}

  private assertCanManage(req: Request, manhom: number): Promise<void> {
    const user = req.user as IExamJwtPayload;
    return this.classModules.assertCanManageGroup(manhom, user.id);
  }

  private parseArgs(raw: string): IGroupPaginationArgs {
    try {
      return JSON.parse(raw) as IGroupPaginationArgs;
    } catch {
      return {};
    }
  }

  /** GET /module — trang quản lý nhóm học phần (thay Module::default). */
  @Permissions('hocphan', 'view')
  @Get()
  @Render('pages/module')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Quản lý nhóm học phần', Page: 'module', user };
  }

  /**
   * GET /module/detail/:manhom — trang chi tiết nhóm (danh sách SV). Thay Module::detail.
   * Kiểm nhóm đang hoạt động + chủ nhóm hoặc admin trong DB (403/404).
   */
  @Permissions('hocphan', 'view')
  @Get('detail/:manhom')
  @Render('pages/class_detail')
  async detail(
    @Param('manhom', ParseIntPipe) manhom: number,
    @Req() req: Request,
  ) {
    const user = req.user as IExamJwtPayload;
    await this.assertCanManage(req, manhom);
    const detail = await this.classModules.getDetailGroup(manhom);
    if (!detail) throw new NotFoundException('Không tìm thấy nhóm.');
    return { Title: 'Quản lý nhóm', Page: 'module', Detail: detail, user };
  }

  /** POST /module/loadData — nhóm GV đang dạy (dropdown chọn nhóm khi tạo đề). */
  @SkipTransform()
  @Post('loadData')
  loadData(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.classModules.getBySubject(user.id);
  }

  /** POST /module/getNamHoc — năm học GV được phân công (dropdown modal). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getNamHoc')
  async getNamHoc(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    const data = await this.classModules.getNamHoc(user.id);
    return { success: true, data };
  }

  /** POST /module/getHocKy — học kỳ của 1 năm học GV được phân công. */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getHocKy')
  async getHocKy(@Req() req: Request, @Body() dto: GetHocKyDto) {
    const user = req.user as IExamJwtPayload;
    const data = await this.classModules.getHocKy(user.id, dto.namhoc);
    return { success: true, data };
  }

  /** POST /module/checkDuplicate — kiểm tra nhóm trùng trước khi lưu. */
  @Permissions('hocphan', 'create')
  @SkipTransform()
  @Post('checkDuplicate')
  async checkDuplicate(@Req() req: Request, @Body() dto: CheckDuplicateDto) {
    const user = req.user as IExamJwtPayload;
    if (dto.manhom != null) await this.assertCanManage(req, dto.manhom);
    return this.classModules.checkDuplicateAjax(
      dto.tennhom,
      dto.monhoc,
      dto.namhoc,
      dto.hocky,
      user.id,
      dto.manhom,
    );
  }

  /** POST /module/add — thêm nhóm mới (giảng viên = user đăng nhập). */
  @Permissions('hocphan', 'create')
  @SkipTransform()
  @Post('add')
  add(@Req() req: Request, @Body() dto: AddGroupDto) {
    const user = req.user as IExamJwtPayload;
    return this.classModules.create(
      dto.tennhom,
      dto.ghichu ?? '',
      dto.namhoc,
      dto.hocky,
      user.id,
      dto.monhoc,
    );
  }

  /** POST /module/update — cập nhật thông tin nhóm. */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('update')
  async update(@Body() dto: UpdateGroupDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.update(
      dto.manhom,
      dto.tennhom,
      dto.ghichu ?? '',
      dto.namhoc,
      dto.hocky,
      dto.monhoc,
    );
  }

  /** POST /module/delete — xoá nhóm (chặn nếu còn thành viên/thông báo/đề giao). */
  @Permissions('hocphan', 'delete')
  @SkipTransform()
  @Post('delete')
  async delete(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.delete(dto.manhom);
  }

  /** POST /module/hide — ẩn/hiện nhóm. */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('hide')
  async hide(@Body() dto: HideGroupDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.hide(dto.manhom, dto.giatri);
  }

  /** POST /module/getDetail — chi tiết nhóm để đổ vào form sửa. */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getDetail')
  async getDetail(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    const data = await this.classModules.getById(dto.manhom);
    return { success: true, data };
  }

  // ── Chi tiết nhóm — danh sách SV & thao tác thành viên ──────────────────────

  /** POST /module/getTotalPages (model=NhomModel) — tổng số trang danh sách SV. */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getTotalPages')
  async getTotalPages(@Body() dto: GroupPaginationBodyDto, @Req() req: Request) {
    const args = this.parseArgs(dto.args);
    await this.assertCanManage(req, Number(args?.manhom) || 0);
    return this.classModules.countGroupStudentPages(args);
  }

  /** POST /module/pagination (model=NhomModel) — 1 trang danh sách SV (mảng). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('pagination')
  async paginate(@Body() dto: GroupPaginationBodyDto, @Req() req: Request) {
    const args = this.parseArgs(dto.args);
    await this.assertCanManage(req, Number(args?.manhom) || 0);
    return this.classModules.listGroupStudents(args);
  }

  /** POST /module/getSvList — danh sách bạn học chung nhóm (mảng thô). */
  @SkipTransform()
  @Post('getSvList')
  async getSvList(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.getSvList(dto.manhom);
  }

  /** POST /module/getInvitedCode — mã mời hiện tại (chuỗi thô). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getInvitedCode')
  async getInvitedCode(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.getInvitedCode(dto.manhom);
  }

  /** POST /module/updateInvitedCode — sinh mã mời mới (boolean). */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('updateInvitedCode')
  async updateInvitedCode(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.updateInvitedCode(dto.manhom);
  }

  /** POST /module/checkAcc — kiểm tài khoản SV trước khi thêm ("0"/"-1"/"1"). */
  @SkipTransform()
  @Post('checkAcc')
  async checkAcc(@Body() dto: CheckAccDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.checkAcc(dto.mssv, dto.manhom);
  }

  /** POST /module/addSvGroup — thêm SV có sẵn vào nhóm (boolean). */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('addSvGroup')
  async addSvGroup(@Body() dto: AddSvGroupDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.addSvGroup(dto.manhom, dto.mssv);
  }

  /** POST /module/addSV — tạo tài khoản SV rồi thêm vào nhóm (boolean). */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('addSV')
  async addSV(@Body() dto: AddSvDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.addSV(
      dto.manhom,
      dto.mssv,
      dto.hoten,
      dto.password,
    );
  }

  /** POST /module/addStudentsByClassCode — thêm hàng loạt SV theo tiền tố mã lớp. */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('addStudentsByClassCode')
  async addStudentsByClassCode(@Body() dto: AddByClassCodeDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.addStudentsByClassCode(dto.malop, dto.manhom);
  }

  /** POST /module/kickUser — xoá SV khỏi nhóm. */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('kickUser')
  async kickUser(@Body() dto: KickUserDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    const ok = await this.classModules.kickUser(dto.manhom, dto.manguoidung);
    return {
      success: ok,
      message: ok
        ? 'Xóa sinh viên khỏi nhóm thành công!'
        : 'Không thể xóa sinh viên khỏi nhóm.',
    };
  }

  /** POST /module/getGroupSize — sỉ số nhóm (số thô). */
  @SkipTransform()
  @Post('getGroupSize')
  async getGroupSize(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.getGroupSize(dto.manhom);
  }

  /**
   * POST /module/exportExcelStudentS — xuất danh sách SV của nhóm ra Excel.
   * Thay PHPExcel bằng exceljs; trả `{status,file,filename}` với `file` là
   * data-URI base64 đúng như bản PHP (JS gốc tạo thẻ <a download> rồi click).
   */
  @SkipTransform()
  @Post('exportExcelStudentS')
  async exportExcelStudentS(@Body() dto: ManhomDto, @Req() req: Request) {
    await this.assertCanManage(req, dto.manhom);
    return this.classModules.exportStudentsExcel(dto.manhom);
  }
}
