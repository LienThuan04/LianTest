import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * DTO cho các route AJAX trang Đề thi (gửi qua $_POST trong test.js / action_test.js).
 * Form gửi x-www-form-urlencoded nên số tới dạng chuỗi — ép kiểu khi cần.
 */

/** Ép giá trị form (1 phần tử → chuỗi, nhiều → mảng) về mảng số nguyên. */
const toIntArray = ({ value }: { value: unknown }): number[] => {
  if (value == null || value === '') return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n));
};

/** Ép giá trị form về mảng chuỗi (bỏ rỗng). */
const toStringArray = ({ value }: { value: unknown }): string[] => {
  if (value == null || value === '') return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => String(v).trim()).filter((s) => s !== '');
};

/**
 * Nhận map `cau[<macauhoi>]=<điểm>` dù body-parser trả về object HAY mảng.
 *
 * PHP giữ nguyên khoá số (`$_POST['cau'][33]`), còn body-parser (qs) coi khoá số
 * nhỏ là **chỉ số mảng** rồi NÉN mảng lại → mất macauhoi. Transform này chỉ để
 * request không bị ValidationPipe chặn (400 "cau must be an object"); giá trị
 * dùng thật được đọc lại từ body thô bằng `parseScoreMapFromRawBody`.
 */
const toScoreMap = ({ value }: { value: unknown }): unknown => {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v != null),
    );
  }
  return value;
};

/**
 * Đọc map `cau[<macauhoi>]=<điểm>` TRỰC TIẾP từ body thô (`req.rawBody`).
 *
 * Cần thiết vì body-parser dùng `qs` với `arrayLimit = max(100, số tham số)`:
 * `cau[33]=2.5` biến thành mảng nén `['2.5']` → macauhoi 33 biến mất (đề mới
 * seed thường có macauhoi < 100 nên lỗi xảy ra ngay, làm điểm từng câu không
 * được lưu). Trả `null` khi không đọc được cặp nào (vd body gửi dạng JSON) để
 * caller quay về dùng `dto.cau`.
 */
export const parseScoreMapFromRawBody = (
  raw?: Buffer,
): Record<string, string> | null => {
  if (!raw?.length) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw.toString('utf8'))) {
    const m = /^cau\[(\d+)\]$/.exec(key);
    if (m) out[m[1]] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
};

/** $_POST['args'] (JSON phân trang) của pagination()/getTotalPages(). */
export class ExamPaginationBodyDto {
  @IsString()
  args!: string;
}

/** $_POST['made'] của delete(). */
export class DeleteExamDto {
  @Type(() => Number)
  @IsInt()
  made!: number;
}

/** $_POST['made'] của getDetail(). */
export class ExamIdDto {
  @Type(() => Number)
  @IsInt()
  made!: number;
}

/**
 * Body của addTest() (tạo đề) — action_test.js gửi urlencoded. Số & cờ tới dạng
 * chuỗi, mảng tới qua `chuong[]`/`manhom[]`/`loaicauhoi[]`. `socau` là chuỗi JSON
 * `{ [loai]: {de,tb,kho} }`. Validate/parse chi tiết nằm ở service (như PHP).
 */
export class CreateTestDto {
  @IsOptional()
  @IsString()
  mamonhoc?: string = '';

  @IsOptional()
  @IsString()
  tende?: string = '';

  @IsOptional()
  @IsString()
  thoigianthi?: string;

  @IsOptional()
  @IsString()
  thoigianbatdau?: string;

  @IsOptional()
  @IsString()
  thoigianketthuc?: string;

  /** JSON `{ [loai]: {de,tb,kho} }`. */
  @IsOptional()
  @IsString()
  socau?: string;

  @IsOptional()
  @IsString()
  diem_tracnghiem?: string;

  @IsOptional()
  @IsString()
  diem_tuluan?: string;

  @IsOptional()
  @IsString()
  diem_dochieu?: string;

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  chuong: number[] = [];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  manhom: number[] = [];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  loaicauhoi: string[] = [];

  @IsOptional()
  @IsString()
  loaide?: string;

  @IsOptional()
  @IsString()
  xemdiem?: string;

  @IsOptional()
  @IsString()
  xemdapan?: string;

  @IsOptional()
  @IsString()
  xembailam?: string;

  @IsOptional()
  @IsString()
  daocauhoi?: string;

  @IsOptional()
  @IsString()
  daodapan?: string;

  @IsOptional()
  @IsString()
  tudongnop?: string;
}

/** Body của updateTest() — như CreateTestDto kèm `made`. */
export class UpdateTestDto extends CreateTestDto {
  @Type(() => Number)
  @IsInt()
  made!: number;
}

/**
 * Một câu hỏi trong danh sách chọn cho đề thủ công — gửi qua `cauhoi[i][...]`
 * (urlencoded) trong select_question.js. macauhoi/thutu tới dạng chuỗi.
 */
export class ChiTietDeThiItemDto {
  @Type(() => Number)
  @IsInt()
  macauhoi!: number;

  @Type(() => Number)
  @IsInt()
  thutu!: number;
}

/** $_POST['made'] cho getQuestion/startTest/chuyentab (de_thi.js, vaothi.js). */
export class TestMadeDto {
  @Type(() => Number)
  @IsInt()
  made!: number;
}

/** $_POST['dethi'] cho getTimeTest/getTimeEndTest (de_thi.js). */
export class TestTimeDto {
  @Type(() => Number)
  @IsInt()
  dethi!: number;
}

/** $_POST['makq'] cho getResultDetail (vaothi.js). */
export class ResultDetailDto {
  @Type(() => Number)
  @IsInt()
  makq!: number;

  /** Legacy teacher clients send this too; authorization derives made from makq. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  made?: number;
}

/** $_POST[made,manhom] cho getStatictical (test_detail.js — tab Thống kê). */
export class StaticticalDto {
  @Type(() => Number)
  @IsInt()
  made!: number;

  @Type(() => Number)
  @IsInt()
  manhom!: number;
}

/**
 * $_POST[made,manhom,ds[]] cho exportExcel (test_detail.js #export_excel).
 * `manhom` = nhóm đang lọc (0 = tất cả); `ds` = danh sách mã nhóm được giao đề,
 * chỉ dùng khi manhom = 0. jQuery bỏ hẳn key khi mảng rỗng → cho phép vắng.
 */
export class ExportExcelDto {
  @Type(() => Number)
  @IsInt()
  made!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  manhom?: number;

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  ds?: number[];
}

/** $_POST['manhom'] cho getMarkOfAllTest (class_detail.js #exportScores). */
export class MarkOfAllTestDto {
  @Type(() => Number)
  @IsInt()
  manhom!: number;
}

/** $_POST cho getTestsGroupWithUserResult — chỉ mã nhóm (SV lấy từ JWT). */
export class GroupTestsDto {
  @Type(() => Number)
  @IsInt()
  manhom!: number;
}

/**
 * $_POST/$_REQUEST cho getListEssaySubmissionsAction. JS gửi made + q (từ khoá)
 * + status ('all'|'graded'|'ungraded'). `search` là alias cũ của q (PHP nhận cả 2).
 */
export class ListEssaySubmissionsDto {
  @Type(() => Number)
  @IsInt()
  made!: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

/** $_POST['makq'] cho getEssayDetailAction (mở form chấm). */
export class EssayDetailDto {
  @Type(() => Number)
  @IsInt()
  makq!: number;
}

/**
 * Body của saveEssayScoreAction — makq + diem (tổng) + cau (object macauhoi→điểm).
 * urlencoded nên diem/cau tới dạng chuỗi; ép số trong controller/service.
 */
export class SaveEssayScoreDto {
  @Type(() => Number)
  @IsInt()
  makq!: number;

  @IsOptional()
  @IsString()
  diem?: string;

  @IsOptional()
  @Transform(toScoreMap)
  @IsObject()
  cau?: Record<string, string>;
}

/**
 * Body của addDetail() (lưu câu hỏi cho đề thủ công) — thay
 * ChiTietDeThiModel::createMultiple. `action` được JS gửi kèm nhưng không dùng.
 */
export class AddDetailDto {
  @Type(() => Number)
  @IsInt()
  made!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChiTietDeThiItemDto)
  cauhoi!: ChiTietDeThiItemDto[];

  @IsOptional()
  @IsString()
  action?: string;
}
