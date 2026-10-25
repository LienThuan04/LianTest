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
import { ClientService } from '@/client/client.service';
import {
  ClientHideDto,
  ClientManhomDto,
  ClientPaginationBodyDto,
  JoinGroupDto,
  LoadDataGroupsDto,
} from '@/client/dto/client.dto';
import type { IClientScheduleArgs } from '@/client/interfaces/client.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Phía sinh viên (client.php) — nhóm học phần SV tham gia + lịch kiểm tra.
 * Route ở path gốc `/client/...` (VERSION_NEUTRAL, trong exclude global prefix).
 * AJAX dùng @SkipTransform để trả nguyên shape client_group.js / test_schedule.js
 * mong đợi (mảng / object / số / boolean).
 *
 * RBAC: trang nhóm + tham gia/ẩn/thoát cần 'tghocphan'/'join'; trang lịch thi
 * cần 'tgthi'/'join'. Đọc danh sách nhóm / bạn cùng nhóm chỉ cần đăng nhập
 * (như checkAuthentication trong client.php).
 */
@Controller({ path: 'client', version: VERSION_NEUTRAL })
export class ClientController {
  constructor(private readonly client: ClientService) {}

  private parseArgs(raw: string | undefined): IClientScheduleArgs {
    try {
      return JSON.parse(raw ?? '{}') as IClientScheduleArgs;
    } catch {
      return {};
    }
  }

  /** GET /client/group — trang nhóm học phần của SV (thay Client::group). */
  @Permissions('tghocphan', 'join')
  @Get('group')
  @Render('pages/client_group')
  group(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Nhóm', Page: 'client_group', user };
  }

  /** GET /client/test — trang lịch kiểm tra của SV (thay Client::test). */
  @Permissions('tgthi', 'join')
  @Get('test')
  @Render('pages/test_schedule')
  testSchedule(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return {
      Title: 'Lịch kiểm tra',
      Page: 'test_schedule',
      user_id: user.id,
      user,
    };
  }

  /** POST /client/joinGroup — tham gia nhóm bằng mã mời (0 | 1 | chi tiết nhóm). */
  @Permissions('tghocphan', 'join')
  @SkipTransform()
  @Post('joinGroup')
  joinGroup(@Req() req: Request, @Body() dto: JoinGroupDto) {
    const user = req.user as IExamJwtPayload;
    return this.client.joinGroup(dto.mamoi, user.id);
  }

  /** POST /client/loadDataGroups — nhóm SV đang tham gia theo trạng thái (mảng). */
  @SkipTransform()
  @Post('loadDataGroups')
  loadDataGroups(@Req() req: Request, @Body() dto: LoadDataGroupsDto) {
    const user = req.user as IExamJwtPayload;
    return this.client.getAllGroupUser(user.id, dto.hienthi);
  }

  /** POST /client/getFriendList — bạn cùng nhóm, trừ chính mình (mảng). */
  @SkipTransform()
  @Post('getFriendList')
  getFriendList(@Req() req: Request, @Body() dto: ClientManhomDto) {
    const user = req.user as IExamJwtPayload;
    return this.client.getFriendList(dto.manhom, user.id);
  }

  /** POST /client/hide — SV ẩn/hiện nhóm của mình (boolean). */
  @Permissions('tghocphan', 'join')
  @SkipTransform()
  @Post('hide')
  hide(@Req() req: Request, @Body() dto: ClientHideDto) {
    const user = req.user as IExamJwtPayload;
    return this.client.svHide(dto.manhom, user.id, dto.giatri);
  }

  /** POST /client/delete — SV thoát nhóm (boolean). */
  @Permissions('tghocphan', 'join')
  @SkipTransform()
  @Post('delete')
  delete(@Req() req: Request, @Body() dto: ClientManhomDto) {
    const user = req.user as IExamJwtPayload;
    return this.client.svDelete(dto.manhom, user.id);
  }

  // ── Lịch kiểm tra (test_schedule) — phân trang model=DeThiModel ──────────────

  /** POST /client/getTotalPages — tổng số trang lịch thi. */
  @Permissions('tgthi', 'join')
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(@Body() dto: ClientPaginationBodyDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.client.countUserTestSchedulePages({
      ...this.parseArgs(dto.args),
      manguoidung: user.id,
    });
  }

  /** POST /client/pagination — 1 trang lịch thi (mảng). */
  @Permissions('tgthi', 'join')
  @SkipTransform()
  @Post('pagination')
  pagination(@Body() dto: ClientPaginationBodyDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.client.listUserTestSchedule({
      ...this.parseArgs(dto.args),
      manguoidung: user.id,
    });
  }
}
