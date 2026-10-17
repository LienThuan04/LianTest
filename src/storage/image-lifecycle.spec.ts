import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { ExamsService } from '../exams/exams.service';
import { AccountService } from '../account/account.service';
import type { IWriteQuestionInput } from '../questions/interfaces/questions.types';
import { SupabaseStorageService } from './supabase-storage.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const image = (name: string) =>
  `https://project.supabase.co/storage/v1/object/public/images/${name}.png`;

interface Question {
  macauhoi: number;
  madv: number | null;
  hinhanh: string | null;
  loai: string;
  trangthai: number;
}
interface Answer {
  macauhoi: number;
  hinhanh: string | null;
}
interface State {
  questions: Question[];
  answers: Answer[];
  essayImages: string[];
  avatars: string[];
}

/** Transaction callbacks work against a draft that is published only on commit. */
function questionDatabase(initial: Partial<State> = {}) {
  let state: State = {
    questions: [
      {
        macauhoi: 1,
        madv: null,
        hinhanh: image('old'),
        loai: 'mcq',
        trangthai: 1,
      },
    ],
    answers: [],
    essayImages: [],
    avatars: [],
    ...initial,
  };
  let inTransaction = false;
  let failCommit = false;
  const delegates = (data: State) => ({
    cauHoi: {
      findUnique: jest.fn(({ where }: { where: { macauhoi: number } }) =>
        Promise.resolve(
          data.questions.find((q) => q.macauhoi === where.macauhoi) ?? null,
        ),
      ),
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { madv?: number; macauhoi?: number; trangthai?: number };
        }) =>
          Promise.resolve(
            data.questions.filter(
              (q) =>
                (where.madv === undefined || q.madv === where.madv) &&
                (where.macauhoi === undefined ||
                  q.macauhoi === where.macauhoi) &&
                (where.trangthai === undefined ||
                  q.trangthai === where.trangthai),
            ),
          ),
      ),
      update: jest.fn(
        ({
          where,
          data: update,
        }: {
          where: { macauhoi: number };
          data: Partial<Question>;
        }) => {
          const row = data.questions.find(
            (q) => q.macauhoi === where.macauhoi,
          )!;
          return Promise.resolve(Object.assign(row, update));
        },
      ),
      create: jest.fn(
        ({ data: row }: { data: Omit<Question, 'macauhoi' | 'trangthai'> }) => {
          const created = {
            ...row,
            macauhoi: data.questions.length + 10,
            trangthai: 1,
          };
          data.questions.push(created);
          return Promise.resolve(created);
        },
      ),
    },
    cauTraLoi: {
      findMany: jest.fn(
        ({ where }: { where: { macauhoi: number | { in: number[] } } }) =>
          Promise.resolve(
            data.answers.filter((a) =>
              typeof where.macauhoi === 'number'
                ? a.macauhoi === where.macauhoi
                : where.macauhoi.in.includes(a.macauhoi),
            ),
          ),
      ),
      deleteMany: jest.fn(({ where }: { where: { macauhoi: number } }) => {
        data.answers = data.answers.filter(
          (a) => a.macauhoi !== where.macauhoi,
        );
        return Promise.resolve({ count: 1 });
      }),
      create: jest.fn(({ data: row }: { data: Answer }) => {
        data.answers.push(row);
        return Promise.resolve(row);
      }),
    },
    doanVan: { update: jest.fn(() => Promise.resolve({})) },
  });
  const queryRaw = jest.fn(() =>
    Promise.resolve(
      [
        ...state.questions.map((q) => q.hinhanh),
        ...state.answers.map((a) => a.hinhanh),
        ...state.essayImages,
        ...state.avatars,
      ]
        .filter((url) => url !== null)
        .map((url) => ({ url })),
    ),
  );
  const prisma = {
    cauHoi: {
      findUnique: jest.fn(({ where }: { where: { macauhoi: number } }) =>
        Promise.resolve(
          state.questions.find((q) => q.macauhoi === where.macauhoi) ?? null,
        ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { macauhoi: number };
          data: Partial<Question>;
        }) => {
          const row = state.questions.find(
            (q) => q.macauhoi === where.macauhoi,
          )!;
          return Promise.resolve(Object.assign(row, data));
        },
      ),
    },
    $queryRaw: queryRaw,
    $transaction: jest.fn(
      async (
        callback: (tx: ReturnType<typeof delegates>) => Promise<unknown>,
      ) => {
        inTransaction = true;
        const draft = structuredClone(state);
        try {
          const result = await callback(delegates(draft));
          if (failCommit) throw new Error('commit rejected');
          state = draft;
          return result;
        } finally {
          inTransaction = false;
        }
      },
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    queryRaw,
    state: () => state,
    inTransaction: () => inTransaction,
    failCommit: () => {
      failCommit = true;
    },
  };
}

function essayDatabase(
  initial: { traloi_id: number; hinhanh: string }[],
  shared: string[] = [],
) {
  let images = structuredClone(initial);
  let inTransaction = false;
  let failCommit = false;
  const txFor = (draft: typeof images) => ({
    chiTietKetQua: { upsert: jest.fn(() => Promise.resolve({})) },
    deThi: {
      findUnique: jest.fn(() =>
        Promise.resolve({ diem_tracnghiem: 10, diem_dochieu: 0 }),
      ),
    },
    traLoiTuLuan: {
      findFirst: jest.fn(() => Promise.resolve({ id: 11 })),
      update: jest.fn(() => Promise.resolve({ id: 11 })),
    },
    hinhAnhTraLoiTuLuan: {
      findMany: jest.fn(({ where }: { where: { traloi_id: number } }) =>
        Promise.resolve(
          draft.filter((row) => row.traloi_id === where.traloi_id),
        ),
      ),
      deleteMany: jest.fn(({ where }: { where: { traloi_id: number } }) => {
        for (let index = draft.length - 1; index >= 0; index--) {
          if (draft[index].traloi_id === where.traloi_id)
            draft.splice(index, 1);
        }
        return Promise.resolve({ count: 1 });
      }),
      create: jest.fn(
        ({ data }: { data: { traloi_id: number; hinhanh: string } }) => {
          draft.push(data);
          return Promise.resolve(data);
        },
      ),
    },
    ketQua: { update: jest.fn(() => Promise.resolve({})) },
    $queryRaw: jest.fn(() => Promise.resolve([{ cnt: 1 }])),
  });
  const findResult = jest.fn(() =>
    Promise.resolve<{ makq: number; thoigianvaothi: Date } | null>({
      makq: 4,
      thoigianvaothi: new Date(),
    }),
  );
  const transaction = jest.fn(
    async (callback: (tx: ReturnType<typeof txFor>) => Promise<unknown>) => {
      inTransaction = true;
      const draft = structuredClone(images);
      try {
        const result = await callback(txFor(draft));
        if (failCommit) throw new Error('commit rejected');
        images = draft;
        return result;
      } finally {
        inTransaction = false;
      }
    },
  );
  const prisma = {
    ketQua: { findFirst: findResult },
    $transaction: transaction,
    $queryRaw: jest.fn(() =>
      Promise.resolve(
        [...images.map((row) => row.hinhanh), ...shared].map((url) => ({
          url,
        })),
      ),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    images: () => images,
    inTransaction: () => inTransaction,
    failCommit: () => {
      failCommit = true;
    },
    findResult,
    transaction,
  };
}

describe('post-commit image lifecycle', () => {
  const remove = jest.fn<Promise<{ error: null }>, [string[]]>();
  let storage: SupabaseStorageService;

  beforeEach(() => {
    remove.mockReset().mockResolvedValue({ error: null });
    jest.mocked(createClient).mockReturnValue({
      storage: { from: () => ({ remove }) },
    } as unknown as ReturnType<typeof createClient>);
    storage = new SupabaseStorageService(
      new ConfigService({
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_KEY: 'test-key',
        SUPABASE_NAME_BUCKET: 'images',
      }),
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const edit = (
    input: Partial<IWriteQuestionInput> = {},
  ): IWriteQuestionInput => ({
    id: '1',
    mamon: 'MH',
    machuong: '1',
    dokho: '1',
    loai: 'mcq',
    noidung: 'Updated',
    cautraloi: '[{"content":"Answer","check":1}]',
    ...input,
  });

  it('removes replaced question and duplicate answer images only after commit', async () => {
    const db = questionDatabase({
      answers: [
        { macauhoi: 1, hinhanh: image('answer') },
        { macauhoi: 1, hinhanh: image('answer') },
      ],
    });
    remove.mockImplementation(() => {
      expect(db.inTransaction()).toBe(false);
      expect(db.state().questions[0].hinhanh).toBeNull();
      return Promise.resolve({ error: null });
    });
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({ delete_question_image: '1' }),
      [],
      'teacher',
    );
    expect(result.status).toBe('success');
    expect(remove.mock.calls.map(([paths]) => paths[0]).sort()).toEqual([
      'answer.png',
      'old.png',
    ]);
    const snapshotSql = JSON.stringify(db.queryRaw.mock.calls);
    for (const table of [
      'cauhoi',
      'cautraloi',
      'hinhanh_traloi_tuluan',
      'nguoidung',
    ]) {
      expect(snapshotSql).toContain(table);
    }
    expect(snapshotSql).not.toContain('trangthai');
  });

  it.each(['question', 'answer', 'essay', 'avatar'])(
    'retains shared images referenced by a remaining %s',
    async (source) => {
      const shared = image('old');
      const db = questionDatabase({
        ...(source === 'question'
          ? {
              questions: [
                {
                  macauhoi: 1,
                  madv: null,
                  hinhanh: shared,
                  loai: 'mcq',
                  trangthai: 1,
                },
                {
                  macauhoi: 2,
                  madv: null,
                  hinhanh: shared,
                  loai: 'mcq',
                  trangthai: 0,
                },
              ],
            }
          : {}),
        answers: [
          { macauhoi: 1, hinhanh: shared },
          ...(source === 'answer'
            ? [{ macauhoi: 2, hinhanh: `${shared}?download=1` }]
            : []),
        ],
        essayImages: source === 'essay' ? [shared] : [],
        avatars: source === 'avatar' ? [shared] : [],
      });
      const result = await new QuestionsService(
        db.prisma,
        storage,
      ).editQuestion(edit({ delete_question_image: '1' }), [], 'teacher');
      expect(result.status).toBe('success');
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('retains images reused by newly written answers and unchanged main images', async () => {
    const db = questionDatabase({
      answers: [{ macauhoi: 1, hinhanh: image('answer') }],
    });
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({
        cautraloi: JSON.stringify([
          { content: 'Answer', image: image('answer') },
        ]),
      }),
      [],
      'teacher',
    );
    expect(result.status).toBe('success');
    expect(remove).not.toHaveBeenCalled();
    expect(db.state().questions[0].hinhanh).toBe(image('old'));
  });

  it('preserves all prior images when the DB transaction fails to commit', async () => {
    const db = questionDatabase({
      answers: [{ macauhoi: 1, hinhanh: image('answer') }],
    });
    db.failCommit();
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({ delete_question_image: '1' }),
      [],
      'teacher',
    );
    expect(result.status).toBe('error');
    expect(remove).not.toHaveBeenCalled();
    expect(db.state().questions[0].hinhanh).toBe(image('old'));
  });

  it('reports a successful edit when storage cleanup rejects', async () => {
    const db = questionDatabase();
    remove.mockRejectedValue(new Error('network unavailable'));
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({ delete_question_image: '1' }),
      [],
      'teacher',
    );
    expect(result.status).toBe('success');
    expect(remove).toHaveBeenCalledWith(['old.png']);
  });

  it('preserves objects and successful edit result when reference lookup fails', async () => {
    const db = questionDatabase();
    db.queryRaw.mockRejectedValue(new Error('reference snapshot unavailable'));
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({ delete_question_image: '1' }),
      [],
      'teacher',
    );
    expect(result.status).toBe('success');
    expect(remove).not.toHaveBeenCalled();
  });

  it('ignores foreign answer image URLs after removing their DB rows', async () => {
    const db = questionDatabase({
      answers: [
        {
          macauhoi: 1,
          hinhanh:
            'https://foreign.example/storage/v1/object/public/images/answer.png',
        },
      ],
    });
    expect(
      (
        await new QuestionsService(db.prisma, storage).editQuestion(
          edit(),
          [],
          'teacher',
        )
      ).status,
    ).toBe('success');
    expect(remove).not.toHaveBeenCalled();
  });

  it('retains images when deleting a question softly', async () => {
    const db = questionDatabase();
    expect(await new QuestionsService(db.prisma, storage).delete(1)).toBe(true);
    expect(db.state().questions[0].trangthai).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('cleans removed reading answer images while retaining soft-deleted subquestion images', async () => {
    const db = questionDatabase({
      questions: [
        {
          macauhoi: 1,
          madv: 7,
          hinhanh: image('old'),
          loai: 'reading',
          trangthai: 1,
        },
        {
          macauhoi: 2,
          madv: 7,
          hinhanh: image('sub'),
          loai: 'reading',
          trangthai: 1,
        },
      ],
      answers: [{ macauhoi: 2, hinhanh: image('answer') }],
    });
    const result = await new QuestionsService(db.prisma, storage).editQuestion(
      edit({
        loai: 'reading',
        delete_question_image: '1',
        doanvan_noidung: 'Passage',
        cautraloi:
          '[{"content":"Subquestion","options":[{"content":"Answer"}]}]',
      }),
      [],
      'teacher',
    );
    expect(result.status).toBe('success');
    expect(
      db.state().questions.find((q) => q.macauhoi === 1)?.hinhanh,
    ).toBeNull();
    expect(db.state().questions.find((q) => q.macauhoi === 2)?.trangthai).toBe(
      0,
    );
    expect(remove.mock.calls.map(([paths]) => paths[0]).sort()).toEqual([
      'answer.png',
      'old.png',
    ]);
  });

  const essayBody = (withImage = true): Record<string, unknown> => ({
    essay_0_exists: '1',
    essay_0_macauhoi: '1',
    essay_0_noidung: 'New answer',
    essay_0_thutu: '1',
    ...(withImage ? { essay_0_image_0: 'data:image/png;base64,bmV3' } : {}),
  });

  it('replaces submitted essay attachments and removes duplicate old objects after commit', async () => {
    const db = essayDatabase([
      { traloi_id: 11, hinhanh: image('old-essay') },
      { traloi_id: 11, hinhanh: image('old-essay') },
      { traloi_id: 22, hinhanh: image('other-answer') },
    ]);
    jest.spyOn(storage, 'uploadBase64').mockResolvedValue(image('new-essay'));
    remove.mockImplementation(() => {
      expect(db.inTransaction()).toBe(false);
      expect(db.images()).not.toContainEqual({
        traloi_id: 11,
        hinhanh: image('old-essay'),
      });
      return Promise.resolve({ error: null });
    });
    expect(
      await new ExamsService(db.prisma, storage).submit(
        1,
        'student',
        essayBody(),
      ),
    ).toEqual({ success: true, makq: 4 });
    expect(db.images()).toEqual([
      { traloi_id: 22, hinhanh: image('other-answer') },
      { traloi_id: 11, hinhanh: image('new-essay') },
    ]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(['old-essay.png']);
  });

  it('removes essay attachments when the submitted replacement has no images', async () => {
    const db = essayDatabase([{ traloi_id: 11, hinhanh: image('old-essay') }]);
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(false),
        )
      ).success,
    ).toBe(true);
    expect(db.images()).toEqual([]);
    expect(remove).toHaveBeenCalledWith(['old-essay.png']);
  });

  it('retains an obsolete essay object still used by a different completed answer', async () => {
    const db = essayDatabase([
      { traloi_id: 11, hinhanh: image('old-essay') },
      { traloi_id: 22, hinhanh: image('old-essay') },
    ]);
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(false),
        )
      ).success,
    ).toBe(true);
    expect(db.images()).toEqual([
      { traloi_id: 22, hinhanh: image('old-essay') },
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('retains an essay object reused in the replacement', async () => {
    const db = essayDatabase([{ traloi_id: 11, hinhanh: image('same') }]);
    jest.spyOn(storage, 'uploadBase64').mockResolvedValue(image('same'));
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(),
        )
      ).success,
    ).toBe(true);
    expect(db.images()).toEqual([{ traloi_id: 11, hinhanh: image('same') }]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('retains prior essay objects if submission fails to commit', async () => {
    const initial = [{ traloi_id: 11, hinhanh: image('old-essay') }];
    const db = essayDatabase(initial);
    db.failCommit();
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(false),
        )
      ).success,
    ).toBe(false);
    expect(db.images()).toEqual(initial);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports committed submission success when essay storage cleanup rejects', async () => {
    const db = essayDatabase([{ traloi_id: 11, hinhanh: image('old-essay') }]);
    remove.mockRejectedValue(new Error('storage unavailable'));
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(false),
        )
      ).success,
    ).toBe(true);
    expect(remove).toHaveBeenCalledWith(['old-essay.png']);
  });

  it('preserves completed submissions without uploading or deleting attachments', async () => {
    const initial = [{ traloi_id: 11, hinhanh: image('completed-essay') }];
    const db = essayDatabase(initial);
    db.findResult.mockResolvedValue(null);
    const upload = jest.spyOn(storage, 'uploadBase64');
    expect(
      (
        await new ExamsService(db.prisma, storage).submit(
          1,
          'student',
          essayBody(),
        )
      ).success,
    ).toBe(false);
    expect(db.images()).toEqual(initial);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('retains a replaced avatar that another record still references', async () => {
    let avatar = image('shared');
    const prisma = {
      nguoiDung: {
        findUnique: jest.fn(() => Promise.resolve({ avatar })),
        update: jest.fn(({ data }: { data: { avatar: string } }) => {
          avatar = data.avatar;
          return Promise.resolve({ avatar });
        }),
      },
      $queryRaw: jest.fn(() =>
        Promise.resolve([{ url: image('shared') }, { url: avatar }]),
      ),
    } as unknown as PrismaService;
    jest.spyOn(storage, 'uploadImage').mockResolvedValue(image('new-avatar'));
    const file = {
      originalname: 'avatar.png',
      buffer: Buffer.from('new'),
    } as Express.Multer.File;
    expect(
      await new AccountService(
        prisma,
        new ConfigService(),
        storage,
      ).uploadAvatar('student', file),
    ).toBe(true);
    expect(avatar).toBe(image('new-avatar'));
    expect(remove).not.toHaveBeenCalled();
  });
});
