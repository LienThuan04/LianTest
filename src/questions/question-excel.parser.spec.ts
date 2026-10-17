import * as XLSX from 'xlsx';
import type { Request } from 'express';
import { QuestionsController } from './questions.controller';
import type { QuestionsService } from './questions.service';
import {
  assertValidQuestionItems,
  createQuestionExcelTemplate,
  parseQuestionExcel,
} from './question-excel.parser';

const headers = [
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

function workbook(
  rows: unknown[][],
  format: 'xlsx' | 'biff8' = 'xlsx',
): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(rows),
    'Questions',
  );
  return XLSX.write(book, { type: 'buffer', bookType: format }) as Buffer;
}

describe('question Excel preview', () => {
  it.each(['xlsx', 'biff8'] as const)(
    'reads %s while preserving source ids, row order, multiline content and answer positions',
    async (format) => {
      const result = await parseQuestionExcel(
        workbook(
          [
            headers,
            ['007', 'essay', 3, 'Explain <b>x</b>\nThen y.'],
            ['q-12', 'mcq', 2, '2 + 2?', '3', '4', '', '', 'B'],
            [
              'r-2',
              'reading',
              1,
              'First?',
              'Yes',
              'No',
              '',
              '',
              'A',
              'p-9',
              'Title',
              'Line 1\nLine 2',
            ],
            ['r-1', 'reading', 1, 'Second?', 'Left', 'Right', '', '', 2, 'p-9'],
          ],
          format,
        ),
        format === 'xlsx' ? 'questions.xlsx' : 'questions.xls',
      );

      expect(result).toEqual([
        {
          id: '007',
          type: 'essay',
          level: 3,
          question: 'Explain <b>x</b>\nThen y.',
        },
        {
          id: 'q-12',
          type: 'mcq',
          level: 2,
          question: '2 + 2?',
          option: ['3', '4'],
          answer: 2,
        },
        {
          id: 'p-9',
          type: 'reading',
          level: 1,
          title: 'Title',
          passage: 'Line 1\nLine 2',
          questions: [
            {
              id: 'r-2',
              type: 'reading',
              level: 1,
              question: 'First?',
              option: ['Yes', 'No'],
              answer: 1,
            },
            {
              id: 'r-1',
              type: 'reading',
              level: 1,
              question: 'Second?',
              option: ['Left', 'Right'],
              answer: 2,
            },
          ],
        },
      ]);
    },
  );

  it('ignores entirely blank rows without dropping the following question', async () => {
    await expect(
      parseQuestionExcel(
        workbook([headers, [], ['e-1', 'essay', 1, 'Last question']]),
        'questions.xlsx',
      ),
    ).resolves.toEqual([
      { id: 'e-1', type: 'essay', level: 1, question: 'Last question' },
    ]);
  });

  it.each([
    [
      'missing question',
      ['q1', 'mcq', 1, '', 'A', 'B', '', '', 'A'],
      /Dòng 2.*question/,
    ],
    [
      'missing answer',
      ['q1', 'mcq', 1, 'Question', 'A', 'B'],
      /Dòng 2.*answer/,
    ],
    [
      'answer outside options',
      ['q1', 'mcq', 1, 'Question', 'A', 'B', '', '', 'D'],
      /Dòng 2.*answer/,
    ],
    [
      'gap in options',
      ['q1', 'mcq', 1, 'Question', 'A', '', 'C', '', 'C'],
      /Dòng 2.*phương án/,
    ],
    ['invalid level', ['q1', 'essay', 4, 'Question'], /Dòng 2.*level/],
    ['unknown type', ['q1', 'unknown', 1, 'Question'], /Dòng 2.*type/],
    [
      'missing passage',
      ['q1', 'reading', 1, 'Question', 'A', 'B', '', '', 1, 'p1'],
      /Dòng 2.*passage/,
    ],
  ])('rejects %s with a row-specific error', async (_name, row, error) => {
    await expect(
      parseQuestionExcel(
        workbook([headers, row as unknown[]]),
        'questions.xlsx',
      ),
    ).rejects.toThrow(error);
  });

  it('rejects a later malformed row instead of returning the valid earlier row', async () => {
    await expect(
      parseQuestionExcel(
        workbook([
          headers,
          ['e1', 'essay', 1, 'Valid'],
          ['q1', 'mcq', 1, 'Invalid', 'A', 'B'],
        ]),
        'questions.xlsx',
      ),
    ).rejects.toThrow(/Dòng 3.*answer/);
  });

  it('rejects duplicate source ids instead of merging questions', async () => {
    await expect(
      parseQuestionExcel(
        workbook([
          headers,
          ['same', 'essay', 1, 'First'],
          ['same', 'essay', 1, 'Second'],
        ]),
        'questions.xlsx',
      ),
    ).rejects.toThrow(/Dòng 3.*id/);
  });

  it('rejects noncontiguous reading groups so file order cannot change silently', async () => {
    await expect(
      parseQuestionExcel(
        workbook([
          headers,
          [
            'r1',
            'reading',
            1,
            'First?',
            'A',
            'B',
            '',
            '',
            'A',
            'p1',
            'Title',
            'Passage',
          ],
          ['e1', 'essay', 1, 'Middle'],
          ['r2', 'reading', 1, 'Last?', 'A', 'B', '', '', 'B', 'p1'],
        ]),
        'questions.xlsx',
      ),
    ).rejects.toThrow(/Dòng 4.*liên tiếp/);
  });

  it('rejects conflicting reading metadata instead of overwriting content', async () => {
    await expect(
      parseQuestionExcel(
        workbook([
          headers,
          [
            'r1',
            'reading',
            1,
            'First?',
            'A',
            'B',
            '',
            '',
            'A',
            'p1',
            'Title',
            'Passage',
          ],
          [
            'r2',
            'reading',
            1,
            'Last?',
            'A',
            'B',
            '',
            '',
            'B',
            'p1',
            '',
            'Different',
          ],
        ]),
        'questions.xlsx',
      ),
    ).rejects.toThrow(/Dòng 3.*passage/);
  });

  it('rejects missing headers and empty workbooks clearly', async () => {
    await expect(
      parseQuestionExcel(workbook([['question'], ['Text']]), 'questions.xlsx'),
    ).rejects.toThrow(/cột.*type/);
    await expect(
      parseQuestionExcel(workbook([headers]), 'questions.xlsx'),
    ).rejects.toThrow(/không có câu hỏi/);
  });

  it.each([
    ['questions.csv', Buffer.from('type,level,question\nessay,1,Text')],
    ['questions.xlsx', Buffer.from('not an Excel workbook')],
    ['questions.xls', workbook([headers, ['e1', 'essay', 1, 'Text']])],
  ])('rejects unsupported or mislabeled uploads (%s)', async (name, buffer) => {
    await expect(parseQuestionExcel(buffer, name)).rejects.toThrow(
      /\.xlsx|\.xls|Excel/,
    );
  });

  it('provides a downloadable template that roundtrips all three question types', async () => {
    const template = await createQuestionExcelTemplate();
    const buffer = Buffer.from(template.file.split(',')[1], 'base64');
    const parsed = await parseQuestionExcel(buffer, template.filename);
    expect(parsed.map((item) => item.type)).toEqual([
      'mcq',
      'essay',
      'reading',
    ]);
    expect(parsed[2]).toMatchObject({
      questions: [{ answer: 2 }, { answer: 1 }],
    });
  });
});

describe('question preview validation before persistence', () => {
  it.each([
    [],
    null,
    [null],
    [{ type: 'other', level: 1 }],
    [
      {
        type: 'mcq',
        level: 1,
        question: 'Text',
        option: ['A', 'B'],
        answer: 3,
      },
    ],
    [{ type: 'mcq', level: 1, question: 'Text', option: ['A', ''], answer: 1 }],
    [{ type: 'essay', level: 1, question: '   ' }],
    [
      {
        type: 'reading',
        level: 1,
        title: 'Title',
        passage: 'Text',
        questions: [],
      },
    ],
    [{ type: 'reading', level: 1, passage: 'Text', questions: [null] }],
  ])('rejects invalid preview data %j', (items) => {
    expect(() => assertValidQuestionItems(items)).toThrow(/câu hỏi|Mục/);
  });

  it('accepts complete previews and preserves source metadata', () => {
    const items = [
      {
        id: '007',
        type: 'mcq',
        level: 2,
        question: 'Text',
        option: ['A', 'B'],
        answer: 2,
      },
      { type: 'essay', level: 3, question: 'Essay' },
      {
        type: 'reading',
        level: 1,
        title: '',
        passage: 'Passage',
        questions: [
          {
            type: 'reading',
            level: 1,
            question: 'Subquestion',
            option: ['A', 'B'],
            answer: 1,
          },
        ],
      },
    ];
    expect(() => assertValidQuestionItems(items)).not.toThrow();
    expect(items[0].id).toBe('007');
  });
});

describe('question import controller', () => {
  it('rejects the entire malformed batch before any persistence takes place', () => {
    const inserted: unknown[] = [];
    const service = {
      addQuestionsFromFile(
        _subject: string,
        _chapter: string,
        items: unknown[],
      ) {
        inserted.push(...items);
        return { status: 'success', inserted: items.length };
      },
    } as unknown as QuestionsService;
    const controller = new QuestionsController(service);
    const request = { user: { id: 'gv001' } } as unknown as Request;
    expect(() =>
      controller.addQuesFile(
        {
          monhoc: 'MH01',
          chuong: '1',
          questions: JSON.stringify([
            { type: 'essay', level: 1, question: 'Valid first row' },
            {
              type: 'mcq',
              level: 1,
              question: 'Unanswered',
              option: ['A', 'B'],
              answer: 0,
            },
          ]),
        },
        request,
      ),
    ).toThrow(/Mục 2.*answer/);
    expect(inserted).toEqual([]);
  });
});
