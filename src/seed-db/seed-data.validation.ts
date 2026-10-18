/** Runtime validation at the editable JSON boundary; no database access. */
export type SeedRule = (value: unknown, path: string) => void;
export function seedDataError(path: string, message: string): never {
  throw new Error(`Seed data: ${path}: ${message}`);
}

const text: SeedRule = (value, path) => {
  if (typeof value !== 'string' || !value.trim())
    seedDataError(path, 'expected non-empty text');
};
const identifier: SeedRule = (value, path) => {
  text(value, path);
  if (typeof value === 'string' && value !== value.trim())
    seedDataError(path, 'remove surrounding whitespace');
};
const finite: SeedRule = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    seedDataError(path, 'expected a finite number');
};
function integer(min = 0, max = 2147483647): SeedRule {
  return (value, path) => {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    )
      seedDataError(path, `expected an integer from ${min} to ${max}`);
  };
}
const nonnegative: SeedRule = (value, path) => {
  finite(value, path);
  if (typeof value === 'number' && value < 0)
    seedDataError(path, 'expected a number >= 0');
};
const score: SeedRule = (value, path) => {
  nonnegative(value, path);
  if (
    typeof value === 'number' &&
    (value > 999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8)
  )
    seedDataError(
      path,
      'expected a score from 0 to 999.99 with at most 2 decimal places',
    );
};
function choice(...values: (string | number)[]): SeedRule {
  return (value, path) => {
    if (!values.includes(value as string | number))
      seedDataError(path, `expected one of ${values.join(', ')}`);
  };
}
function optional(rule: SeedRule): SeedRule {
  return (value, path) => {
    if (value !== undefined) rule(value, path);
  };
}
function array(rule: SeedRule): SeedRule {
  return (value, path) => {
    if (!Array.isArray(value)) seedDataError(path, 'expected an array');
    value.forEach((item: unknown, index) => rule(item, `${path}[${index}]`));
  };
}
function object(shape: Record<string, SeedRule>): SeedRule {
  return (value, path) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      seedDataError(path, 'expected an object');
    const row = value as Record<string, unknown>;
    for (const key of Object.keys(row))
      if (!Object.hasOwn(shape, key))
        seedDataError(`${path}.${key}`, 'unknown field');
    for (const [key, rule] of Object.entries(shape))
      rule(row[key], `${path}.${key}`);
  };
}

const email: SeedRule = (value, path) => {
  text(value, path);
  if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    seedDataError(path, 'expected an email address');
};
const bit = choice(0, 1);
const difficulty = choice(1, 2, 3);
const answers = array(object({ noidungtl: text, ladapan: bit }));
const counts = object({ de: integer(), tb: integer(), kho: integer() });
const result = object({
  manguoidung: identifier,
  socaudung: integer(),
  thoigianlambai: integer(0, Math.floor(2147483647 / 60)),
  solanchuyentab: integer(),
  baituluan: optional(text),
});

export const seedFileRules: Record<string, SeedRule> = {
  'roles.json': array(object({ manhomquyen: integer(1), tennhomquyen: text })),
  'resources.json': array(object({ chucnang: identifier, tenchucnang: text })),
  'permissions.json': array(
    object({
      manhomquyen: integer(1),
      chucnang: identifier,
      hanhdong: choice('create', 'delete', 'update', 'view', 'join'),
    }),
  ),
  'users.json': array(
    object({ id: identifier, email, hoten: text, manhomquyen: integer(1) }),
  ),
  'academic-years.json': array(
    object({ tennamhoc: identifier, sohocky: integer(1) }),
  ),
  'subjects.json': array(
    object({
      mamonhoc: identifier,
      tenmonhoc: text,
      sotinchi: integer(),
      sotietlythuyet: integer(),
      sotietthuchanh: integer(),
      chuong: array(identifier),
    }),
  ),
  'assignments.json': array(
    object({
      manguoidung: identifier,
      mamonhoc: identifier,
      tennamhoc: identifier,
      sohocky: integer(1),
    }),
  ),
  'groups.json': array(
    object({
      key: identifier,
      tennhom: text,
      mamonhoc: identifier,
      giangvien: identifier,
      tennamhoc: identifier,
      sohocky: integer(1),
      mamoi: identifier,
      ghichu: (value, path) => {
        if (typeof value !== 'string') seedDataError(path, 'expected text');
      },
      sinhvien: array(identifier),
    }),
  ),
  'questions.json': array(
    object({
      key: identifier,
      mamonhoc: identifier,
      chuong: identifier,
      loai: choice('mcq', 'essay'),
      dokho: difficulty,
      noidung: text,
      nguoitao: identifier,
      dapan: optional(answers),
    }),
  ),
  'reading-passages.json': array(
    object({
      key: identifier,
      mamonhoc: identifier,
      chuong: identifier,
      tieude: text,
      noidung: text,
      nguoitao: identifier,
      dokho: difficulty,
      cauhoi: array(object({ key: identifier, noidung: text, dapan: answers })),
    }),
  ),
  'exams.json': array(
    object({
      key: identifier,
      tende: text,
      mamonhoc: identifier,
      nguoitao: identifier,
      loaide: bit,
      thoigianthi: integer(1),
      batdauOffsetHours: finite,
      ketthucOffsetHours: finite,
      hienthibailam: bit,
      xemdiemthi: bit,
      xemdapan: bit,
      troncauhoi: bit,
      trondapan: bit,
      nopbaichuyentab: bit,
      diem_tracnghiem: score,
      diem_tuluan: score,
      diem_dochieu: score,
      nhom: array(identifier),
      chuong: array(identifier),
      cauhoi: optional(array(identifier)),
      socau: optional(
        object({
          mcq: optional(counts),
          essay: optional(counts),
          reading: optional(counts),
        }),
      ),
      ketqua: optional(array(result)),
    }),
  ),
};
