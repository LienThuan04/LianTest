import type {
  IBaseSeedData,
  IDemoDapAn,
  IDemoSeedData,
} from './seed/seed-data.types';
import { seedDataError } from './seed-data.validation';
import { seedExamTimes } from './seed-exam-times';

function unique<T>(
  rows: T[],
  key: (row: T) => string | number,
  file: string,
  field: string,
): void {
  const seen = new Set<string | number>();
  rows.forEach((row, index) => {
    const value = key(row);
    if (seen.has(value))
      seedDataError(`${file}[${index}].${field}`, `duplicate value ${value}`);
    seen.add(value);
  });
}
function reference<T>(
  map: Map<string | number, T>,
  key: string | number,
  path: string,
): T {
  const found = map.get(key);
  if (found === undefined) seedDataError(path, `unknown reference ${key}`);
  return found;
}
function indexBy<T>(
  rows: T[],
  key: (row: T) => string | number,
): Map<string | number, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

export function validateBaseRelations(base: IBaseSeedData): void {
  unique(base.roles, (row) => row.manhomquyen, 'roles.json', 'manhomquyen');
  unique(base.resources, (row) => row.chucnang, 'resources.json', 'chucnang');
  unique(base.users, (row) => row.id, 'users.json', 'id');
  unique(base.users, (row) => row.email.toLowerCase(), 'users.json', 'email');
  unique(
    base.permissions,
    (row) => JSON.stringify([row.manhomquyen, row.chucnang, row.hanhdong]),
    'permissions.json',
    'hanhdong',
  );
  const roles = indexBy(base.roles, (row) => row.manhomquyen);
  // These identifiers are part of existing authentication/navigation behavior.
  for (const id of [1, 2, 3]) {
    if (!roles.has(id))
      seedDataError(
        'roles.json',
        `required application role ${id} is missing (1=teacher, 2=student, 3=admin)`,
      );
  }
  const resources = indexBy(base.resources, (row) => row.chucnang);
  base.users.forEach((user, i) =>
    reference(roles, user.manhomquyen, `users.json[${i}].manhomquyen`),
  );
  base.permissions.forEach((permission, i) => {
    reference(
      roles,
      permission.manhomquyen,
      `permissions.json[${i}].manhomquyen`,
    );
    reference(
      resources,
      permission.chucnang,
      `permissions.json[${i}].chucnang`,
    );
  });
}

function validateAnswers(
  answers: IDemoDapAn[] | undefined,
  path: string,
): void {
  if (
    !answers ||
    answers.length < 2 ||
    answers.length > 6 ||
    answers.filter((answer) => answer.ladapan === 1).length !== 1
  ) {
    seedDataError(path, 'expected 2–6 answers with exactly one correct answer');
  }
}

export function validateDemoRelations(
  demo: IDemoSeedData,
  base: IBaseSeedData,
  referenceTime = Date.now(),
): void {
  unique(
    demo.academicYears,
    (row) => row.tennamhoc,
    'academic-years.json',
    'tennamhoc',
  );
  unique(demo.subjects, (row) => row.mamonhoc, 'subjects.json', 'mamonhoc');
  unique(demo.groups, (row) => row.key, 'groups.json', 'key');
  unique(demo.groups, (row) => row.mamoi, 'groups.json', 'mamoi');
  unique(demo.questions, (row) => row.key, 'questions.json', 'key');
  unique(
    demo.readingPassages,
    (row) => row.key,
    'reading-passages.json',
    'key',
  );
  unique(demo.exams, (row) => row.key, 'exams.json', 'key');
  unique(
    demo.assignments,
    (row) =>
      JSON.stringify([
        row.manguoidung,
        row.mamonhoc,
        row.tennamhoc,
        row.sohocky,
      ]),
    'assignments.json',
    'manguoidung',
  );
  const users = indexBy(base.users, (row) => row.id);
  const years = indexBy(demo.academicYears, (row) => row.tennamhoc);
  const subjects = indexBy(demo.subjects, (row) => row.mamonhoc);
  const groups = indexBy(demo.groups, (row) => row.key);
  demo.subjects.forEach((subject, i) =>
    unique(
      subject.chuong,
      (value) => value,
      `subjects.json[${i}].chuong`,
      'value',
    ),
  );
  function semester(year: string, number: number, path: string) {
    const value = reference(years, year, `${path}.tennamhoc`);
    if (number > value.sohocky)
      seedDataError(
        `${path}.sohocky`,
        `year ${year} only has ${value.sohocky} semesters`,
      );
  }
  function chapter(subject: string, name: string, path: string) {
    const value = reference(subjects, subject, `${path}.mamonhoc`);
    if (!value.chuong.includes(name))
      seedDataError(`${path}.chuong`, `unknown chapter ${name} in ${subject}`);
  }
  demo.assignments.forEach((row, i) => {
    const path = `assignments.json[${i}]`;
    reference(users, row.manguoidung, `${path}.manguoidung`);
    reference(subjects, row.mamonhoc, `${path}.mamonhoc`);
    semester(row.tennamhoc, row.sohocky, path);
  });
  demo.groups.forEach((row, i) => {
    const path = `groups.json[${i}]`;
    reference(subjects, row.mamonhoc, `${path}.mamonhoc`);
    reference(users, row.giangvien, `${path}.giangvien`);
    semester(row.tennamhoc, row.sohocky, path);
    unique(row.sinhvien, (value) => value, `${path}.sinhvien`, 'value');
    row.sinhvien.forEach((id, n) =>
      reference(users, id, `${path}.sinhvien[${n}]`),
    );
  });
  type Question = {
    mamonhoc: string;
    chuong: string;
    loai: string;
    dokho: number;
  };
  const questions = new Map<string | number, Question>();
  function addQuestion(key: string, value: Question, path: string) {
    if (questions.has(key))
      seedDataError(`${path}.key`, `duplicate question key ${key}`);
    questions.set(key, value);
  }
  demo.questions.forEach((row, i) => {
    const path = `questions.json[${i}]`;
    chapter(row.mamonhoc, row.chuong, path);
    reference(users, row.nguoitao, `${path}.nguoitao`);
    if (row.loai === 'mcq') validateAnswers(row.dapan, `${path}.dapan`);
    else if (row.dapan?.length)
      seedDataError(
        `${path}.dapan`,
        'essay questions do not have choice answers',
      );
    addQuestion(row.key, row, path);
  });
  demo.readingPassages.forEach((row, i) => {
    const path = `reading-passages.json[${i}]`;
    chapter(row.mamonhoc, row.chuong, path);
    reference(users, row.nguoitao, `${path}.nguoitao`);
    if (!row.cauhoi.length)
      seedDataError(`${path}.cauhoi`, 'expected at least one reading question');
    row.cauhoi.forEach((q, n) => {
      const childPath = `${path}.cauhoi[${n}]`;
      validateAnswers(q.dapan, `${childPath}.dapan`);
      addQuestion(q.key, { ...row, loai: 'reading' }, childPath);
    });
  });
  demo.exams.forEach((exam, i) => {
    const path = `exams.json[${i}]`;
    seedExamTimes(exam, path, referenceTime);
    reference(subjects, exam.mamonhoc, `${path}.mamonhoc`);
    reference(users, exam.nguoitao, `${path}.nguoitao`);
    if (exam.ketthucOffsetHours <= exam.batdauOffsetHours)
      seedDataError(
        `${path}.ketthucOffsetHours`,
        'must be later than the start',
      );
    unique(exam.nhom, (value) => value, `${path}.nhom`, 'value');
    unique(exam.chuong, (value) => value, `${path}.chuong`, 'value');
    const members = new Set<string>();
    exam.nhom.forEach((key, n) => {
      const group = reference(groups, key, `${path}.nhom[${n}]`);
      if (group.mamonhoc !== exam.mamonhoc)
        seedDataError(
          `${path}.nhom[${n}]`,
          'group belongs to a different subject',
        );
      group.sinhvien.forEach((id) => members.add(id));
    });
    exam.chuong.forEach((name) => chapter(exam.mamonhoc, name, path));
    let automaticallyGraded = 0;
    if (exam.loaide === 0) {
      if (!exam.cauhoi?.length)
        seedDataError(`${path}.cauhoi`, 'manual exams need question keys');
      if (exam.socau)
        seedDataError(
          `${path}.socau`,
          'only automatic exams use question counts',
        );
      unique(exam.cauhoi, (value) => value, `${path}.cauhoi`, 'value');
      exam.cauhoi.forEach((key, n) => {
        const q = reference(questions, key, `${path}.cauhoi[${n}]`);
        if (q.mamonhoc !== exam.mamonhoc)
          seedDataError(
            `${path}.cauhoi[${n}]`,
            'question belongs to a different subject',
          );
        if (q.loai !== 'essay') automaticallyGraded++;
      });
    } else {
      if (exam.cauhoi?.length)
        seedDataError(
          `${path}.cauhoi`,
          'automatic exams use socau instead of question keys',
        );
      if (!exam.socau || exam.socau.reading)
        seedDataError(
          `${path}.socau`,
          'automatic seeding supports mcq/essay counts, not reading',
        );
      let total = 0;
      for (const kind of ['mcq', 'essay'] as const) {
        const counts = exam.socau[kind];
        if (!counts) continue;
        for (const [level, difficulty] of [
          ['de', 1],
          ['tb', 2],
          ['kho', 3],
        ] as const) {
          const available = [...questions.values()].filter(
            (q) =>
              q.loai === kind &&
              q.dokho === difficulty &&
              q.mamonhoc === exam.mamonhoc &&
              (!exam.chuong.length || exam.chuong.includes(q.chuong)),
          ).length;
          if (counts[level] > available)
            seedDataError(
              `${path}.socau.${kind}.${level}`,
              `requested ${counts[level]} questions, only ${available} eligible`,
            );
          total += counts[level];
          if (kind === 'mcq') automaticallyGraded += counts[level];
        }
      }
      if (!total)
        seedDataError(
          `${path}.socau`,
          'expected at least one automatic question',
        );
    }
    unique(
      exam.ketqua ?? [],
      (row) => row.manguoidung,
      `${path}.ketqua`,
      'manguoidung',
    );
    exam.ketqua?.forEach((result, n) => {
      const resultPath = `${path}.ketqua[${n}]`;
      reference(users, result.manguoidung, `${resultPath}.manguoidung`);
      if (!members.has(result.manguoidung))
        seedDataError(
          `${resultPath}.manguoidung`,
          'student is not in an assigned group',
        );
      if (result.socaudung > automaticallyGraded)
        seedDataError(
          `${resultPath}.socaudung`,
          'exceeds the number of automatically graded questions',
        );
      if (result.thoigianlambai > exam.thoigianthi)
        seedDataError(`${resultPath}.thoigianlambai`, 'exceeds exam duration');
    });
  });
}
