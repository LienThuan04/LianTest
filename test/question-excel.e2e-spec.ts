import request from 'supertest';
import ExcelJS from 'exceljs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/prisma/prisma.service';
import { createTestApp, login, requireFixture } from './setup-app';

describe('Question Excel preview and confirmed import (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let teacher: string;
  let student: string;
  let subject: string;
  let chapter = 0;
  let workbook: Buffer;
  let preview: unknown[];
  const prefix = `[E2E-XLS-${Date.now()}]`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    teacher = await login(app, 'gv001');
    student = await login(app, 'sv001');
    const fixture = await prisma.cauHoi.findFirst({
      where: { nguoitao: 'gv001', loai: 'mcq', trangthai: 1 },
      select: { mamonhoc: true },
    });
    requireFixture(fixture, 'a teacher subject for question import');
    subject = fixture.mamonhoc;
    chapter = (
      await prisma.chuong.create({
        data: { mamonhoc: subject, tenchuong: prefix },
      })
    ).machuong;
  }, 60_000);

  afterAll(async () => {
    if (prisma && chapter) {
      const rows = await prisma.cauHoi.findMany({
        where: { machuong: chapter },
        select: { macauhoi: true },
      });
      await prisma.cauTraLoi.deleteMany({
        where: { macauhoi: { in: rows.map((row) => row.macauhoi) } },
      });
      await prisma.cauHoi.deleteMany({ where: { machuong: chapter } });
      await prisma.doanVan.deleteMany({ where: { machuong: chapter } });
      await prisma.chuong.delete({ where: { machuong: chapter } });
    }
    await app?.close();
  });

  it('downloads an actual workbook with MCQ, essay and reading examples', async () => {
    const response = await request(app.getHttpServer())
      .get('/question/excelTemplate')
      .set('Cookie', teacher)
      .expect(200);
    expect(response.body.status).toBe(true);
    const bytes = Buffer.from(
      String(response.body.file).split(',')[1],
      'base64',
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = book.worksheets[0];
    expect(sheet.getRow(1).getCell(2).text).toBe('type');
    expect(
      [2, 3, 4, 5].map((row) => sheet.getRow(row).getCell(2).text),
    ).toEqual(['mcq', 'essay', 'reading', 'reading']);
    for (const row of [2, 3, 4, 5]) {
      sheet.getRow(row).getCell(4).value =
        `${prefix} ${sheet.getRow(row).getCell(4).text}`;
    }
    workbook = Buffer.from(await book.xlsx.writeBuffer());
  });

  it('requires teacher create permission for both preview and template', async () => {
    await request(app.getHttpServer())
      .get('/question/excelTemplate')
      .expect(401);
    await request(app.getHttpServer())
      .get('/question/excelTemplate')
      .set('Cookie', student)
      .expect(403);
    await request(app.getHttpServer())
      .post('/question/addExcel')
      .set('Cookie', student)
      .attach('fileToUpload', workbook, 'questions.xlsx')
      .expect(403);
  });

  it('previews all rows without writing any questions', async () => {
    const response = await request(app.getHttpServer())
      .post('/question/addExcel')
      .set('Cookie', teacher)
      .attach('fileToUpload', workbook, 'questions.xlsx')
      .expect(201);
    preview = response.body;
    expect(preview).toHaveLength(3);
    expect(response.body.map((item: { type: string }) => item.type)).toEqual([
      'mcq',
      'essay',
      'reading',
    ]);
    expect(response.body[2].questions).toHaveLength(2);
    expect(await prisma.cauHoi.count({ where: { machuong: chapter } })).toBe(0);
  });

  it('rejects a missing file and malformed upload before persistence', async () => {
    await request(app.getHttpServer())
      .post('/question/addExcel')
      .set('Cookie', teacher)
      .expect(400);
    await request(app.getHttpServer())
      .post('/question/addExcel')
      .set('Cookie', teacher)
      .attach('fileToUpload', Buffer.from('invalid'), 'questions.xlsx')
      .expect(400);
    expect(await prisma.cauHoi.count({ where: { machuong: chapter } })).toBe(0);
  });

  it('confirms the preview through the existing importer with correct answers', async () => {
    requireFixture(preview?.length, 'a valid Excel preview');
    const response = await request(app.getHttpServer())
      .post('/question/addQuesFile')
      .set('Cookie', teacher)
      .type('form')
      .send({
        monhoc: subject,
        chuong: String(chapter),
        questions: JSON.stringify(preview),
      })
      .expect(201);
    expect(response.body).toMatchObject({ status: 'success', inserted: 4 });
    const rows = await prisma.cauHoi.findMany({
      where: { machuong: chapter },
      orderBy: { macauhoi: 'asc' },
    });
    expect(rows.map((row) => row.loai)).toEqual([
      'mcq',
      'essay',
      'reading',
      'reading',
    ]);
    const correct = await prisma.cauTraLoi.findMany({
      where: { macauhoi: { in: rows.map((row) => row.macauhoi) }, ladapan: 1 },
      orderBy: { macautl: 'asc' },
      select: { noidungtl: true },
    });
    expect(correct.map((answer) => answer.noidungtl)).toEqual([
      '4',
      'Xe buýt',
      '7 giờ',
    ]);
    expect(await prisma.doanVan.count({ where: { machuong: chapter } })).toBe(
      1,
    );
  });

  it('rejects an edited batch with an invalid answer without partially importing', async () => {
    const items = [
      { type: 'essay', level: 1, question: `${prefix} Must not be saved` },
      {
        type: 'mcq',
        level: 1,
        question: 'Invalid answer',
        option: ['A', 'B'],
        answer: 99,
      },
    ];
    await request(app.getHttpServer())
      .post('/question/addQuesFile')
      .set('Cookie', teacher)
      .type('form')
      .send({
        monhoc: subject,
        chuong: String(chapter),
        questions: JSON.stringify(items),
      })
      .expect(400);
    expect(await prisma.cauHoi.count({ where: { machuong: chapter } })).toBe(4);
  });
});
