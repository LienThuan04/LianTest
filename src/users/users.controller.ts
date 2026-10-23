import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  UploadedFile,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { MULTER_LIMITS } from '@/common/config/upload.config';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { UsersService } from '@/users/users.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import {
  AddFileExcelDto,
  AddFileExcelGroupDto,
  CheckUserDto,
  PaginationBodyDto,
  SetStatusDto,
  UserIdDto,
} from '@/users/dto/user-query.dto';
import type {
  IImportUserRow,
  IPaginationArgs,
} from '@/users/interfaces/users.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Quản lý người dùng (SSR + AJAX) — thay user.php. Route ở path gốc
 * (VERSION_NEUTRAL, trong exclude của global prefix). AJAX dùng @SkipTransform
 * trả nguyên shape JS gốc mong đợi ({status,message} / {success} / mảng).
 */
@Controller({ path: 'user', version: VERSION_NEUTRAL })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private parseArgs(raw: string): IPaginationArgs {
    try {
      return JSON.parse(raw) as IPaginationArgs;
    } catch {
      return {};
    }
  }

  /** GET /user — trang quản lý người dùng (thay User::default). */
  @Permissions('nguoidung', 'view')
  @Get()
  @Render('pages/user')
  async page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    const roles = await this.usersService.getAllRoles();
    return { Title: 'Quản lý người dùng', Page: 'user', user, roles };
  }

  /** POST /user/getTotalPages — tổng số trang (pagination.js). */
  @Permissions('nguoidung', 'view')
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(@Body() dto: PaginationBodyDto) {
    return this.usersService.getTotalPages(this.parseArgs(dto.args));
  }

  /** POST /user/pagination — 1 trang dữ liệu (pagination.js). */
  @Permissions('nguoidung', 'view')
  @SkipTransform()
  @Post('pagination')
  paginate(@Body() dto: PaginationBodyDto) {
    return this.usersService.paginate(this.parseArgs(dto.args));
  }

  /** POST /user/checkUser — kiểm tra trùng id/email (thay checkUser). */
  @Permissions('nguoidung', 'view')
  @SkipTransform()
  @Post('checkUser')
  checkUser(@Body() dto: CheckUserDto) {
    return this.usersService.checkUser(dto.mssv, dto.email);
  }

  /** POST /user/getDetail — chi tiết người dùng (thay getDetail). */
  @Permissions('nguoidung', 'view')
  @SkipTransform()
  @Post('getDetail')
  getDetail(@Body() dto: UserIdDto) {
    return this.usersService.getDetail(dto.id);
  }

  /** POST /user/add — thêm người dùng (thay add). */
  @Permissions('nguoidung', 'create')
  @SkipTransform()
  @Post('add')
  add(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /** POST /user/update — cập nhật người dùng (thay update). */
  @Permissions('nguoidung', 'update')
  @SkipTransform()
  @Post('update')
  update(@Req() req: Request, @Body() dto: UpdateUserDto) {
    const user = req.user as IExamJwtPayload;
    return this.usersService.update(dto, user.id);
  }

  /** POST /user/deleteData — xoá mềm người dùng (thay deleteData). */
  @Permissions('nguoidung', 'delete')
  @SkipTransform()
  @Post('deleteData')
  deleteData(@Req() req: Request, @Body() dto: UserIdDto) {
    const user = req.user as IExamJwtPayload;
    return this.usersService.delete(dto.id, user.id);
  }

  /** POST /user/setStatus — khoá/mở khoá (thay setStatus). */
  @Permissions('nguoidung', 'update')
  @SkipTransform()
  @Post('setStatus')
  async setStatus(@Req() req: Request, @Body() dto: SetStatusDto) {
    const user = req.user as IExamJwtPayload;
    const ok = await this.usersService.setStatus(dto.id, dto.status, user.id);
    return { success: ok };
  }

  /**
   * POST /user/addExcel — đọc file danh sách SV (.xlsx/.xls) và trả JSON xem trước.
   * Gọi từ tab "Nhập từ file" của trang chi tiết nhóm (class_detail.js).
   * Chỉ cần đăng nhập như user.php gốc (GV không có quyền `nguoidung` vẫn dùng
   * được nút này ở nhóm của mình); route KHÔNG ghi gì vào CSDL.
   */
  @SkipTransform()
  @Post('addExcel')
  @UseInterceptors(FileInterceptor('fileToUpload', { limits: MULTER_LIMITS }))
  addExcel(@UploadedFile() file: Express.Multer.File) {
    return this.usersService.parseStudentExcel(file);
  }

  /**
   * POST /user/addFileExcel — tạo tài khoản hàng loạt từ danh sách đã đọc
   * (tab "Nhập từ file" của trang Người dùng, `user.js`). KHÁC `addFileExcelGroup`:
   * chỉ tạo tài khoản, không gắn vào nhóm nào.
   *
   * Gate `nguoidung`/`create` (route này TẠO người dùng ở trang quản trị) — chặt
   * hơn PHP vốn chỉ `checkAuthentication`.
   */
  @Permissions('nguoidung', 'create')
  @SkipTransform()
  @Post('addFileExcel')
  addFileExcel(@Req() req: Request, @Body() dto: AddFileExcelDto) {
    const user = req.user as IExamJwtPayload;
    let list: IImportUserRow[] = [];
    try {
      const parsed: unknown = JSON.parse(dto.listuser);
      if (Array.isArray(parsed)) list = parsed as IImportUserRow[];
    } catch {
      return { status: 'error', message: 'Danh sách người dùng không hợp lệ' };
    }
    return this.usersService.addUsersFromFile(list, dto.password, user.id);
  }

  /**
   * POST /user/addFileExcelGroup — tạo tài khoản SV từ danh sách đã đọc rồi thêm
   * vào nhóm. Đòi quyền sửa học phần và chủ nhóm hoặc quản trị viên; không dùng
   * nhóm quyền/trạng thái do client gửi để cấp đặc quyền cho tài khoản mới.
   */
  @Permissions('hocphan', 'update')
  @SkipTransform()
  @Post('addFileExcelGroup')
  addFileExcelGroup(@Req() req: Request, @Body() dto: AddFileExcelGroupDto) {
    const user = req.user as IExamJwtPayload;
    let list: IImportUserRow[] = [];
    try {
      const parsed: unknown = JSON.parse(dto.listuser);
      if (Array.isArray(parsed)) list = parsed as IImportUserRow[];
    } catch {
      return { status: 'error', message: 'Danh sách sinh viên không hợp lệ' };
    }
    return this.usersService.addStudentsFromFile(
      list,
      dto.password,
      dto.group,
      user.id,
    );
  }
}
