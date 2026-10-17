import { BadRequestException } from '@nestjs/common';
import {
  createWorkbook,
  readXlsSheetRows,
  readXlsxSheetRows,
  setColumnWidths,
  workbookToDataUri,
  writeHeaderRow,
} from '@/common/utils/excel.util';
import type { IExcelDownload } from '@/common/utils/excel.util';
import type {
  IParsedItem,
  IParsedReading,
  ISubQuestion,
} from './interfaces/questions.types';

const HEADERS = [
  'id',
  'type',
  'level',
  'question',
  'A',
  'B',
  'C',
  'D',
  'answer',
  'reading_id',
  'title',
  'passage',
];

function fail(location: string, message: string): never {
  throw new BadRequestException(`${location}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateQuestion(value: unknown, location: string): void {
  if (!isRecord(value) || !hasText(value.question)) {
    fail(location, 'Thiếu nội dung câu hỏi (question)');
  }
  if (![1, 2, 3].includes(value.level as number)) {
    fail(location, 'level phải là 1, 2 hoặc 3');
  }
  if (value.type === 'essay') return;
  if (
    !Array.isArray(value.option) ||
    value.option.length < 2 ||
    !value.option.every(hasText)
  ) {
    fail(
      location,
      'Câu hỏi phải có ít nhất hai phương án liên tiếp, không để trống',
    );
  }
  if (
    !Number.isInteger(value.answer) ||
    (value.answer as number) < 1 ||
    (value.answer as number) > value.option.length
  ) {
    fail(location, 'answer phải chỉ tới một phương án có nội dung');
  }
}

/** Validate the whole batch before the existing importer can write any rows. */
export function assertValidQuestionItems(
  items: unknown,
): asserts items is IParsedItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    fail('Dữ liệu câu hỏi', 'không có câu hỏi');
  }
  items.forEach((value: unknown, index: number) => {
    const location = `Mục ${index + 1}`;
    if (
      !isRecord(value) ||
      !['mcq', 'essay', 'reading'].includes(String(value.type))
    ) {
      fail(location, 'Loại câu hỏi không hợp lệ');
    }
    if (value.type !== 'reading') {
      validateQuestion(value, location);
      return;
    }
    if (![1, 2, 3].includes(value.level as number) || !hasText(value.passage)) {
      fail(location, 'Thiếu đoạn văn (passage) hoặc level không hợp lệ');
    }
    if (value.title != null && typeof value.title !== 'string') {
      fail(location, 'Tiêu đề đoạn văn không hợp lệ');
    }
    if (!Array.isArray(value.questions) || value.questions.length === 0) {
      fail(location, 'Đoạn văn phải có câu hỏi con');
    }
    value.questions.forEach((sub: unknown, subIndex: number) => {
      if (!isRecord(sub) || sub.type !== 'reading') {
        fail(
          `${location}, câu ${subIndex + 1}`,
          'Loại câu hỏi con không hợp lệ',
        );
      }
      validateQuestion(sub, `${location}, câu ${subIndex + 1}`);
    });
  });
}

/** Each Excel reading row is one subquestion; consecutive rows share reading_id. */
export async function parseQuestionExcel(
  buffer: Buffer,
  filename: string,
): Promise<IParsedItem[]> {
  const extension = /\.(xlsx|xls)$/i.exec(filename)?.[1].toLowerCase();
  const isZip = buffer
    .subarray(0, 4)
    .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const isBiff = buffer
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if ((extension !== 'xlsx' || !isZip) && (extension !== 'xls' || !isBiff)) {
    fail('File Excel', 'Chỉ chấp nhận đúng định dạng .xlsx hoặc .xls');
  }

  let rows: string[][] | null;
  try {
    rows =
      extension === 'xlsx'
        ? await readXlsxSheetRows(buffer)
        : readXlsSheetRows(buffer);
  } catch {
    fail(
      'File Excel',
      'Không đọc được file Excel. Hãy dùng file mẫu và lưu lại workbook',
    );
  }
  if (!rows?.length) fail('File Excel', 'không có câu hỏi');
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  for (const required of ['type', 'level', 'question']) {
    if (!header.includes(required))
      fail('File Excel', `Thiếu cột ${required} ở dòng 1`);
  }
  if (
    header.some((cell, index) => cell !== '' && header.indexOf(cell) !== index)
  ) {
    fail('File Excel', 'Tên cột ở dòng 1 không được trùng nhau');
  }

  const result: IParsedItem[] = [];
  const sourceIds = new Set<string>();
  const readingGroups = new Map<string, IParsedReading>();
  let currentReadingId = '';
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every((cell) => cell.trim() === '')) continue;
    const get = (name: string) => (row[header.indexOf(name)] ?? '').trim();
    const location = `Dòng ${index + 1}`;
    const id = get('id');
    if (id && sourceIds.has(id)) fail(location, `id bị trùng: ${id}`);
    if (id) sourceIds.add(id);
    const type = get('type').toLowerCase();
    if (!['mcq', 'essay', 'reading'].includes(type)) {
      fail(location, 'type phải là mcq, essay hoặc reading');
    }
    const level = Number(get('level'));
    const question = get('question');
    const metadata = id ? { id } : {};
    if (type === 'essay') {
      const item = { ...metadata, type: 'essay' as const, level, question };
      validateQuestion(item, location);
      result.push(item);
      currentReadingId = '';
      continue;
    }
    const options = ['a', 'b', 'c', 'd'].map(get);
    while (options.length && options[options.length - 1] === '') options.pop();
    const answerText = get('answer').toUpperCase();
    const answer = /^[A-D]$/.test(answerText)
      ? answerText.charCodeAt(0) - 64
      : /^[1-4]$/.test(answerText)
        ? Number(answerText)
        : 0;
    const item = {
      ...metadata,
      type: type as 'mcq' | 'reading',
      level,
      question,
      option: options,
      answer,
    };
    validateQuestion(item, location);
    if (type === 'mcq') {
      result.push({ ...item, type: 'mcq' });
      currentReadingId = '';
      continue;
    }

    const readingId = get('reading_id');
    if (!readingId) fail(location, 'Thiếu reading_id cho câu hỏi đọc hiểu');
    let group = readingGroups.get(readingId);
    if (group) {
      if (currentReadingId !== readingId)
        fail(location, 'Các dòng cùng reading_id phải liên tiếp');
      for (const field of ['title', 'passage'] as const) {
        if (get(field) && get(field) !== group[field]) {
          fail(
            location,
            `${field} không khớp với dòng đầu của reading_id ${readingId}`,
          );
        }
      }
      if (level !== group.level)
        fail(location, 'level phải giống nhau trong cùng reading_id');
    } else {
      const passage = get('passage');
      if (!passage) fail(location, 'Thiếu passage ở dòng đầu của reading_id');
      const newGroup = {
        id: readingId,
        type: 'reading' as const,
        level,
        title: get('title'),
        passage,
        questions: [] as ISubQuestion[],
      };
      group = newGroup;
      readingGroups.set(readingId, group);
      result.push(newGroup);
    }
    group.questions.push({ ...item, type: 'reading' });
    currentReadingId = readingId;
  }
  assertValidQuestionItems(result);
  return result;
}

/** A real workbook example for each supported type, consumed by the same parser. */
export function createQuestionExcelTemplate(): Promise<IExcelDownload> {
  const { workbook, sheet } = createWorkbook('Questions');
  writeHeaderRow(sheet, 1, HEADERS, { fill: '1F4E78' });
  sheet.addRows([
    ['q-1', 'mcq', 1, '2 + 2 = ?', '3', '4', '5', '6', 'B'],
    ['e-1', 'essay', 3, 'Giải thích cách giải bài toán trên.'],
    [
      'r-1',
      'reading',
      2,
      'Lan đến trường bằng gì?',
      'Xe máy',
      'Xe buýt',
      '',
      '',
      'B',
      'p-1',
      'Một ngày đi học',
      'Lan đến trường bằng xe buýt.\nTiết học bắt đầu lúc 7 giờ.',
    ],
    [
      'r-2',
      'reading',
      2,
      'Tiết học bắt đầu lúc mấy giờ?',
      '7 giờ',
      '8 giờ',
      '',
      '',
      'A',
      'p-1',
    ],
  ]);
  setColumnWidths(sheet, [14, 12, 10, 50, 22, 22, 22, 22, 12, 16, 30, 65]);
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbookToDataUri(workbook, 'cauhoi_mau.xlsx');
}
