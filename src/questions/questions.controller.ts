import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { MULTER_LIMITS } from '@/common/config/upload.config';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { QuestionsService } from '@/questions/questions.service';
import {
  AddQuesFileDto,
  AnswersForMultipleDto,
  DeleteQuestionDto,
  PaginationBodyDto,
  QuestionBySubjectDto,
  QuestionCountDto,
  QuestionIdDto,
  UpdateQuestionJsonDto,
  WriteQuestionDto,
} from '@/questions/dto/question.dto';
import type {
  IPaginationArgs,
  IParsedItem,
} from '@/questions/interfaces/questions.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';
import {
  assertValidQuestionItems,
  createQuestionExcelTemplate,
  parseQuestionExcel,
} from './question-excel.parser';

/**
 * Ngân hàng câu hỏi (SSR + AJAX) — thay controller question.php của DHT_OneTest.
 * Route ở path gốc (VERSION_NEUTRAL, trong exclude của global prefix /api) để
 * khớp URL `/question/...` mà question.js gọi. AJAX dùng @SkipTransform để trả
 * nguyên shape JS gốc mong đợi (mảng / object / số / boolean).
 *
 * Đã port: trang SSR, danh sách chính (pagination/getTotalPages, JOIN phancong),
 * đọc/thêm/sửa/xoá, import từ file Word (.docx): parse (xulydoanvan/xulytracnghiem/
 * xulytuluan) + chuẩn hoá (updateQuestionJSON) + ghi lô (addQuesFile).
 * Excel (.xlsx/.xls) dùng cùng preview/chuẩn hoá/ghi lô với Word.
 */
@Controller({ path: 'question', version: VERSION_NEUTRAL })
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  private parseArgs(raw: string): IPaginationArgs {
    try {
      return JSON.parse(raw) as IPaginationArgs;
    } catch {
      return {};
    }
  }

  /** Parse JSON `questions` từ FormData; lỗi cú pháp → 400. */
  private parseItems(raw: string): IParsedItem[] {
    let items: unknown;
    try {
      items = JSON.parse(raw) as unknown;
    } catch {
      throw new BadRequestException('Dữ liệu câu hỏi không hợp lệ');
    }
    assertValidQuestionItems(items);
    return items;
  }

  /** Lấy buffer file .docx đã upload (field `fileToUpload`); thiếu → 400. */
  private requireDocx(file: Express.Multer.File | undefined): Buffer {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    return file.buffer;
  }

  /** GET /question — trang ngân hàng câu hỏi (thay Question::default). */
  @Permissions('cauhoi', 'view')
  @Get()
  @Render('pages/question')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Câu hỏi', Page: 'question', user };
  }

  /** POST /question/getTotalPages — tổng số trang danh sách (pagination.js). */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(@Body() dto: PaginationBodyDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.questions.countQuestionPages(user.id, this.parseArgs(dto.args));
  }

  /** POST /question/pagination — 1 trang danh sách câu hỏi (pagination.js). */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('pagination')
  paginate(@Body() dto: PaginationBodyDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.questions.listQuestions(user.id, this.parseArgs(dto.args));
  }

  /** POST /question/getQuestionBySubject — danh sách câu hỏi theo môn. */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getQuestionBySubject')
  getQuestionBySubject(@Body() dto: QuestionBySubjectDto) {
    return this.questions.getQuestionBySubject(
      dto.mamonhoc,
      dto.machuong,
      dto.dokho,
      dto.content,
      dto.page,
    );
  }

  /** POST /question/getTotalPageQuestionBySubject — tổng số trang theo môn. */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getTotalPageQuestionBySubject')
  getTotalPageQuestionBySubject(@Body() dto: QuestionBySubjectDto) {
    return this.questions.getTotalPageQuestionBySubject(
      dto.mamonhoc,
      dto.machuong,
      dto.dokho,
      dto.content,
    );
  }

  /** POST /question/getQuestionById — chi tiết câu hỏi để mở modal sửa. */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getQuestionById')
  getQuestionById(@Body() dto: QuestionIdDto) {
    return this.questions.getQuestionById(dto.id);
  }

  /** POST /question/getAnswerById — đáp án của câu hỏi (mcq/essay/reading). */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getAnswerById')
  getAnswerById(@Body() dto: QuestionIdDto) {
    return this.questions.getAnswerById(dto.id);
  }

  /** POST /question/getAnswersForMultipleQuestions — đáp án nhiều câu (chọn câu cho đề). */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getAnswersForMultipleQuestions')
  getAnswersForMultipleQuestions(@Body() dto: AnswersForMultipleDto) {
    return this.questions.getAnswersForMultipleQuestions(dto.questions);
  }

  /** POST /question/delete — xoá mềm câu hỏi. */
  @Permissions('cauhoi', 'delete')
  @SkipTransform()
  @Post('delete')
  delete(@Body() dto: DeleteQuestionDto) {
    return this.questions.delete(dto.macauhoi);
  }

  /**
   * POST /question/getsoluongcauhoi — đếm số câu theo loại/mức độ (trang tạo đề).
   * Trả {success, data:{[loai]:{de,tb,kho}}} đúng shape action_test.js.
   */
  @Permissions('cauhoi', 'view')
  @SkipTransform()
  @Post('getsoluongcauhoi')
  async getsoluongcauhoi(@Body() dto: QuestionCountDto) {
    const data = await this.questions.getQuestionCounts(
      dto.chuong,
      dto.monhoc,
      dto.loaicauhoi,
    );
    return { success: true, data };
  }

  /** POST /question/addQues — thêm câu hỏi (multipart: text + ảnh). */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @UseInterceptors(AnyFilesInterceptor({ limits: MULTER_LIMITS }))
  @Post('addQues')
  addQues(
    @Body() dto: WriteQuestionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const user = req.user as IExamJwtPayload;
    return this.questions.addQuestion(dto, files ?? [], user.id);
  }

  /** POST /question/editQuesion — sửa câu hỏi (multipart: text + ảnh). */
  @Permissions('cauhoi', 'update')
  @SkipTransform()
  @UseInterceptors(AnyFilesInterceptor({ limits: MULTER_LIMITS }))
  @Post('editQuesion')
  editQuesion(
    @Body() dto: WriteQuestionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const user = req.user as IExamJwtPayload;
    return this.questions.editQuestion(dto, files ?? [], user.id);
  }

  /** POST /question/xulydoanvan — parse .docx đọc hiểu → mảng preview. */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @UseInterceptors(FileInterceptor('fileToUpload', { limits: MULTER_LIMITS }))
  @Post('xulydoanvan')
  parseReading(@UploadedFile() file: Express.Multer.File) {
    return this.questions.parseReadingFile(this.requireDocx(file));
  }

  /** POST /question/xulytracnghiem — parse .docx trắc nghiệm → mảng preview. */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @UseInterceptors(FileInterceptor('fileToUpload', { limits: MULTER_LIMITS }))
  @Post('xulytracnghiem')
  parseMcq(@UploadedFile() file: Express.Multer.File) {
    return this.questions.parseMcqFile(this.requireDocx(file));
  }

  /** POST /question/xulytuluan — parse .docx tự luận → mảng preview. */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @UseInterceptors(FileInterceptor('fileToUpload', { limits: MULTER_LIMITS }))
  @Post('xulytuluan')
  parseEssay(@UploadedFile() file: Express.Multer.File) {
    return this.questions.parseEssayFile(this.requireDocx(file));
  }

  /** Excel only prepares a preview; addQuesFile performs the confirmed import. */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @UseInterceptors(FileInterceptor('fileToUpload', { limits: MULTER_LIMITS }))
  @Post('addExcel')
  async parseExcel(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel .xlsx hoặc .xls');
    }
    const items = await parseQuestionExcel(file.buffer, file.originalname);
    return this.questions.normalizeQuestions(items);
  }

  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @Get('excelTemplate')
  excelTemplate() {
    return createQuestionExcelTemplate();
  }

  /** POST /question/updateQuestionJSON — chuẩn hoá mảng preview (tự lưu). */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @Post('updateQuestionJSON')
  updateQuestionJSON(@Body() dto: UpdateQuestionJsonDto) {
    const items = this.parseItems(dto.questions);
    return {
      status: 'success' as const,
      questions: this.questions.normalizeQuestions(items),
    };
  }

  /** POST /question/addQuesFile — ghi cả lô câu hỏi (đã preview) vào DB. */
  @Permissions('cauhoi', 'create')
  @SkipTransform()
  @Post('addQuesFile')
  addQuesFile(@Body() dto: AddQuesFileDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    const items = this.parseItems(dto.questions);
    return this.questions.addQuestionsFromFile(
      dto.monhoc,
      dto.chuong,
      items,
      user.id,
    );
  }
}
