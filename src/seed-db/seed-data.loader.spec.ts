import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSeedData } from './seed-data.loader';

describe('Editable JSON seed data', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'liantest-seed-'));
    for (const file of readdirSync(join(__dirname, 'data')).filter((file) =>
      file.endsWith('.json'),
    )) {
      copyFileSync(join(__dirname, 'data', file), join(directory, file));
    }
  });
  afterEach(() => {
    if (!directory.startsWith(join(tmpdir(), 'liantest-seed-')))
      throw new Error('Unexpected test cleanup path');
    rmSync(directory, { recursive: true, force: true });
  });

  function edit(
    file: string,
    change: (rows: Record<string, unknown>[]) => void,
  ) {
    const rows = JSON.parse(
      readFileSync(join(directory, file), 'utf8'),
    ) as Record<string, unknown>[];
    change(rows);
    writeFileSync(join(directory, file), JSON.stringify(rows));
  }
  const load = () => loadSeedData({ directory, includeDemo: true });

  it('loads the complete existing dataset and relative exam times', () => {
    const data = load();
    expect(data.base.users).toHaveLength(13);
    expect(data.demo?.questions).toHaveLength(35);
    expect(data.demo?.readingPassages[0].cauhoi).toHaveLength(3);
    expect(data.demo?.exams[0].ketthucOffsetHours).toBe(168);
  });

  it('reads edits on the next invocation instead of caching imported constants', () => {
    load();
    edit('users.json', (rows) => {
      rows[0].hoten = 'Custom administrator';
      rows[0].email = 'admin@example.test';
    });
    const data = load();
    expect(data.base.users[0]).toMatchObject({
      hoten: 'Custom administrator',
      email: 'admin@example.test',
    });
  });

  it('accepts custom identifiers when every reference is updated consistently', () => {
    for (const file of readdirSync(directory)) {
      const contents = readFileSync(join(directory, file), 'utf8').replaceAll(
        '"gv001"',
        '"my-teacher"',
      );
      writeFileSync(join(directory, file), contents);
    }
    const data = load();
    expect(data.base.users.some((user) => user.id === 'my-teacher')).toBe(true);
    expect(data.demo?.groups[0].giangvien).toBe('my-teacher');
  });

  it('does not read optional demo files for a base-only seed', () => {
    writeFileSync(join(directory, 'groups.json'), '{not valid JSON');
    expect(loadSeedData({ directory }).demo).toBeUndefined();
  });

  it('reports malformed JSON by filename', () => {
    writeFileSync(join(directory, 'users.json'), '[{');
    expect(load).toThrow(/users\.json.*JSON/i);
  });

  it('protects application role codes used by authentication and student routes', () => {
    edit('roles.json', (rows) => {
      rows[1].manhomquyen = 99;
    });
    expect(load).toThrow(/roles\.json.*2/);
  });

  it.each([null, {}, 'users'])('rejects a non-array document: %p', (value) => {
    writeFileSync(join(directory, 'users.json'), JSON.stringify(value));
    expect(load).toThrow(/users\.json/);
  });

  it('rejects result minutes that overflow the stored seconds before seeding', () => {
    edit('exams.json', (rows) => {
      rows[2].thoigianthi = 35791395;
      (rows[2].ketqua as Record<string, unknown>[])[0].thoigianlambai =
        35791395;
    });
    expect(load).toThrow(/exams\.json\[2\]\.ketqua\[0\]\.thoigianlambai/);
  });

  it('rejects sample submissions after the exam closes', () => {
    edit('exams.json', (rows) => {
      rows[2].ketthucOffsetHours = Number(rows[2].batdauOffsetHours) + 0.01;
    });
    expect(load).toThrow(/exams\.json\[2\]\.ketqua\[0\]/);
  });

  it.each([
    [
      'integer outside database range',
      'subjects.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].sotinchi = 2147483648;
      },
      /subjects\.json\[0\]\.sotinchi/,
    ],
    [
      'score outside decimal storage range',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].diem_tracnghiem = 1000;
      },
      /exams\.json\[0\]\.diem_tracnghiem/,
    ],
    [
      'score with excess precision',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].diem_tracnghiem = 1.234;
      },
      /exams\.json\[0\]\.diem_tracnghiem/,
    ],
    [
      'invalid materialized date',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].ketthucOffsetHours = 1e300;
      },
      /exams\.json\[0\]\.ketthucOffsetHours/,
    ],
    [
      'dates collapsed by millisecond precision',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].batdauOffsetHours = 0;
        rows[0].ketthucOffsetHours = 1e-20;
      },
      /exams\.json\[0\]\.ketthucOffsetHours/,
    ],
    [
      'wrong user email',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].email = 'bad-email';
      },
      /users\.json\[0\]\.email/,
    ],
    [
      'missing user field',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        delete rows[0].hoten;
      },
      /users\.json\[0\]\.hoten/,
    ],
    [
      'misspelled field',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].eamil = 'typo@example.test';
      },
      /users\.json\[0\]\.eamil/,
    ],
    [
      'duplicate account ID',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        rows[1].id = rows[0].id;
      },
      /users\.json\[1\]\.id/,
    ],
    [
      'case-insensitive duplicate email',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        rows[1].email = String(rows[0].email).toUpperCase();
      },
      /users\.json\[1\]\.email/,
    ],
    [
      'unknown user role',
      'users.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].manhomquyen = 999;
      },
      /users\.json\[0\]\.manhomquyen/,
    ],
    [
      'unknown permission resource',
      'permissions.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].chucnang = 'missing';
      },
      /permissions\.json\[0\]\.chucnang/,
    ],
    [
      'unknown group subject',
      'groups.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].mamonhoc = 'missing';
      },
      /groups\.json\[0\]\.mamonhoc/,
    ],
    [
      'unknown group member',
      'groups.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].sinhvien = ['missing'];
      },
      /groups\.json\[0\]\.sinhvien/,
    ],
    [
      'unknown chapter',
      'questions.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].chuong = 'missing';
      },
      /questions\.json\[0\]\.chuong/,
    ],
    [
      'no correct answer',
      'questions.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].dapan = [
          { noidungtl: 'A', ladapan: 0 },
          { noidungtl: 'B', ladapan: 0 },
        ];
      },
      /questions\.json\[0\]\.dapan/,
    ],
    [
      'multiple correct answers',
      'questions.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].dapan = [
          { noidungtl: 'A', ladapan: 1 },
          { noidungtl: 'B', ladapan: 1 },
        ];
      },
      /questions\.json\[0\]\.dapan/,
    ],
    [
      'invalid exam flag',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].xemdapan = 2;
      },
      /exams\.json\[0\]\.xemdapan/,
    ],
    [
      'unknown question',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].cauhoi = ['missing'];
      },
      /exams\.json\[0\]\.cauhoi/,
    ],
    [
      'insufficient automatic questions',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[1].socau = { mcq: { de: 999, tb: 0, kho: 0 } };
      },
      /exams\.json\[1\]\.socau/,
    ],
    [
      'unsupported automatic reading',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[1].socau = { reading: { de: 1, tb: 0, kho: 0 } };
      },
      /exams\.json\[1\]\.socau/,
    ],
    [
      'reversed exam time',
      'exams.json',
      (rows: Record<string, unknown>[]) => {
        rows[0].ketthucOffsetHours = -2;
      },
      /exams\.json\[0\]\.ketthucOffsetHours/,
    ],
  ])('rejects %s before seeding', (_name, file, mutate, message) => {
    edit(file, mutate);
    expect(load).toThrow(message);
  });
});
