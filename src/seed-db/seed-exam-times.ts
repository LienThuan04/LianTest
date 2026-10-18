import type { IDemoDeThi } from './seed/seed-data.types';
import { seedDataError } from './seed-data.validation';

/** Materialize and validate the exact timestamps used by the demo writer. */
export function seedExamTimes(
  exam: IDemoDeThi,
  path = `exams.json (${exam.key})`,
  now = Date.now(),
) {
  function date(milliseconds: number, field: string): Date {
    const value = new Date(milliseconds);
    // Keep timestamps inside the common Prisma/PostgreSQL ISO year range.
    if (
      !Number.isFinite(value.getTime()) ||
      value.getUTCFullYear() < 1 ||
      value.getUTCFullYear() > 9999
    )
      seedDataError(field, 'expected a valid timestamp in years 0001–9999');
    return value;
  }
  const start = date(
    now + exam.batdauOffsetHours * 3600 * 1000,
    `${path}.batdauOffsetHours`,
  );
  const end = date(
    now + exam.ketthucOffsetHours * 3600 * 1000,
    `${path}.ketthucOffsetHours`,
  );
  if (end.getTime() <= start.getTime())
    seedDataError(
      `${path}.ketthucOffsetHours`,
      'must be later than the start at millisecond precision',
    );
  const results = (exam.ketqua ?? []).map((result, i) => {
    const field = `${path}.ketqua[${i}].thoigianlambai`;
    const finish = date(
      start.getTime() + result.thoigianlambai * 60 * 1000,
      field,
    );
    if (finish.getTime() > end.getTime())
      seedDataError(field, 'sample submission is after the exam closes');
    return finish;
  });
  return { start, end, results };
}
