import type { Prisma, PrismaClient } from '@prisma/client';
import type { IDemoCauHoi, IDemoDapAn, IDemoDoanVan } from './seed-data.types';

export const SEED_BATCH_SIZE = 100;
export const SEED_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** RETURNING order is unspecified; identical rows get distinct IDs in ascending order. */
function matchIds<Row>(
  inputs: Row[],
  created: Row[],
  signature: (row: Row) => string,
  idOf: (row: Row) => number | undefined,
): number[] {
  if (inputs.length !== created.length) {
    throw new Error('Seed batch không trả đủ ID đã tạo.');
  }
  const buckets = new Map<string, number[]>();
  for (const row of [...created].sort(
    (a, b) => Number(idOf(a)) - Number(idOf(b)),
  )) {
    const id = idOf(row);
    if (id == null || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Seed batch trả ID không hợp lệ.');
    }
    const key = signature(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(id);
  }
  return inputs.map((row) => {
    const id = buckets.get(signature(row))?.shift();
    if (id == null) throw new Error('Không ghép được ID với dữ liệu seed.');
    return id;
  });
}

function questionSignature(row: Prisma.CauHoiCreateManyInput): string {
  return JSON.stringify([
    row.noidung,
    row.dapan_dung ?? null,
    row.dokho,
    row.mamonhoc,
    row.machuong,
    row.nguoitao ?? null,
    row.trangthai ?? 1,
    row.loai ?? 'mcq',
    row.madv ?? null,
  ]);
}

function passageSignature(row: Prisma.DoanVanCreateManyInput): string {
  return JSON.stringify([
    row.noidung,
    row.tieude ?? null,
    row.mamonhoc ?? null,
    row.machuong ?? null,
    row.nguoitao ?? null,
    row.trangthai ?? 1,
  ]);
}

interface IQuestionRow {
  key: string;
  data: Prisma.CauHoiCreateManyInput;
  answers: IDemoDapAn[];
}

export async function seedQuestionBank(
  prisma: PrismaClient,
  questions: IDemoCauHoi[],
  passages: IDemoDoanVan[],
  chapterId: (subject: string, chapter: string) => number,
  log: (message: string) => void,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const total =
    questions.length + passages.reduce((n, p) => n + p.cauhoi.length, 0);
  log(`Câu hỏi: 0/${total} — bắt đầu ghi theo lô ${SEED_BATCH_SIZE}.`);

  async function writeQuestions(rows: IQuestionRow[]): Promise<void> {
    for (let offset = 0; offset < rows.length; offset += SEED_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + SEED_BATCH_SIZE);
      const committed = await prisma.$transaction(async (tx) => {
        const data = batch.map((row) => row.data);
        const created = await tx.cauHoi.createManyAndReturn({ data });
        const questionIds = matchIds(
          data,
          created,
          questionSignature,
          (row) => row.macauhoi,
        );
        const answers = batch.flatMap((row, index) =>
          row.answers.map((answer) => ({
            macauhoi: questionIds[index],
            noidungtl: answer.noidungtl,
            ladapan: answer.ladapan,
          })),
        );
        if (answers.length) await tx.cauTraLoi.createMany({ data: answers });
        return questionIds;
      }, SEED_TRANSACTION_OPTIONS);
      batch.forEach((row, index) => ids.set(row.key, committed[index]));
      log(`Câu hỏi: ${ids.size}/${total} — đã ghi xong lô.`);
    }
  }

  await writeQuestions(
    questions.map((q) => ({
      key: q.key,
      data: {
        noidung: q.noidung,
        dapan_dung:
          q.loai === 'mcq' && q.dapan
            ? (LETTERS[q.dapan.findIndex((a) => a.ladapan === 1)] ?? null)
            : null,
        dokho: q.dokho,
        mamonhoc: q.mamonhoc,
        machuong: chapterId(q.mamonhoc, q.chuong),
        nguoitao: q.nguoitao,
        trangthai: 1,
        loai: q.loai,
      },
      answers: q.dapan ?? [],
    })),
  );

  const passageIds = new Map<string, number>();
  if (passages.length) log(`Đoạn đọc hiểu: 0/${passages.length}.`);
  for (let offset = 0; offset < passages.length; offset += SEED_BATCH_SIZE) {
    const batch = passages.slice(offset, offset + SEED_BATCH_SIZE);
    const data: Prisma.DoanVanCreateManyInput[] = batch.map((p) => ({
      noidung: p.noidung,
      tieude: p.tieude,
      mamonhoc: p.mamonhoc,
      machuong: chapterId(p.mamonhoc, p.chuong),
      nguoitao: p.nguoitao,
      trangthai: 1,
    }));
    const committed = await prisma.$transaction(async (tx) => {
      const created = await tx.doanVan.createManyAndReturn({ data });
      return matchIds(data, created, passageSignature, (row) => row.madv);
    }, SEED_TRANSACTION_OPTIONS);
    batch.forEach((p, index) => passageIds.set(p.key, committed[index]));
    log(`Đoạn đọc hiểu: ${passageIds.size}/${passages.length}.`);
  }
  await writeQuestions(
    passages.flatMap((p) =>
      p.cauhoi.map((q) => ({
        key: q.key,
        data: {
          noidung: q.noidung,
          dapan_dung:
            LETTERS[q.dapan.findIndex((a) => a.ladapan === 1)] ?? null,
          dokho: p.dokho,
          mamonhoc: p.mamonhoc,
          machuong: chapterId(p.mamonhoc, p.chuong),
          nguoitao: p.nguoitao,
          trangthai: 1,
          loai: 'reading',
          madv: passageIds.get(p.key)!,
        },
        answers: q.dapan,
      })),
    ),
  );
  return ids;
}
