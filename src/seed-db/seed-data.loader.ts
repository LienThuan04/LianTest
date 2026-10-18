import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  IBaseSeedData,
  IDemoSeedData,
  ISeedDataset,
} from './seed/seed-data.types';
import { seedDataError, seedFileRules } from './seed-data.validation';
import {
  validateBaseRelations,
  validateDemoRelations,
} from './seed-relations.validation';

export interface ISeedDataOptions {
  directory?: string;
  includeDemo?: boolean;
}

export function seedDataDirectory(directory?: string): string {
  const explicit = directory ?? process.env.SEED_DATA_DIR;
  if (explicit) return resolve(explicit);
  const source = resolve(__dirname, '../../../src/seed-db/data');
  return existsSync(source) ? source : join(__dirname, 'data');
}

function readRows<T>(directory: string, file: string): T {
  const location = join(directory, file);
  let contents: string;
  try {
    contents = readFileSync(location, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    seedDataError(location, 'cannot read JSON file');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    seedDataError(location, 'invalid JSON syntax');
  }
  seedFileRules[file](value, file);
  // Every JSON document is checked above before it crosses the typed boundary.
  return value as T;
}

/** Reads current files on each invocation; importing the module does not load data. */
export function loadSeedData(options: ISeedDataOptions = {}): ISeedDataset {
  const directory = seedDataDirectory(options.directory);
  const base: IBaseSeedData = {
    roles: readRows(directory, 'roles.json'),
    resources: readRows(directory, 'resources.json'),
    permissions: readRows(directory, 'permissions.json'),
    users: readRows(directory, 'users.json'),
  };
  validateBaseRelations(base);
  if (!options.includeDemo) return { base };
  const demo: IDemoSeedData = {
    academicYears: readRows(directory, 'academic-years.json'),
    subjects: readRows(directory, 'subjects.json'),
    assignments: readRows(directory, 'assignments.json'),
    groups: readRows(directory, 'groups.json'),
    questions: readRows(directory, 'questions.json'),
    readingPassages: readRows(directory, 'reading-passages.json'),
    exams: readRows(directory, 'exams.json'),
  };
  const referenceTime = Date.now();
  validateDemoRelations(demo, base, referenceTime);
  return { base, demo, referenceTime };
}
