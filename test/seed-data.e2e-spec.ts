import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('Seed JSON CLI and packaged data (no database)', () => {
  let directory: string;
  let dataDirectory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'liantest-seed-cli-'));
    dataDirectory = join(directory, 'data');
    cpSync(resolve('src/seed-db/data'), dataDirectory, { recursive: true });
  });
  afterEach(() => {
    if (!resolve(directory).startsWith(join(tmpdir(), 'liantest-seed-cli-')))
      throw new Error('Unexpected test cleanup path');
    rmSync(directory, { recursive: true, force: true });
  });
  function run(script: string, args: string[] = []) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        SEED_DATA_DIR: dataDirectory,
        DATABASE_URL: 'invalid://no-database',
      },
      timeout: 15000,
      windowsHide: true,
    });
  }
  it('checks an editable dataset with an unusable DATABASE_URL', () => {
    const result = run('scripts/check-seed-data.cjs');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('users: 13');
    expect(result.stdout).toContain('exams: 3');
  });
  it.each([
    ['scripts/check-seed-data.cjs', []],
    ['scripts/seed-exam.cjs', []],
    ['scripts/seed-demo.cjs', ['--clear']],
  ])('%s rejects invalid JSON before trying the database', (script, args) => {
    writeFileSync(join(dataDirectory, 'users.json'), '[{');
    const result = run(script, args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/users\.json.*JSON/);
    expect(result.stderr).not.toContain('invalid://no-database');
  });
  it('loads copied build assets in a deployment that has no source tree', () => {
    const deployed = join(directory, 'package/dist/src/seed-db');
    mkdirSync(deployed, { recursive: true });
    for (const file of [
      'seed-data.loader.js',
      'seed-data.validation.js',
      'seed-relations.validation.js',
      'seed-exam-times.js',
    ]) {
      copyFileSync(resolve('dist/src/seed-db', file), join(deployed, file));
    }
    cpSync(resolve('dist/src/seed-db/data'), join(deployed, 'data'), {
      recursive: true,
    });
    const usersPath = join(deployed, 'data/users.json');
    const users = JSON.parse(readFileSync(usersPath, 'utf8')) as {
      hoten: string;
    }[];
    users[0].hoten = 'Packaged JSON user';
    writeFileSync(usersPath, JSON.stringify(users));
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const loader = require(${JSON.stringify(join(deployed, 'seed-data.loader.js'))}); console.log(loader.loadSeedData({ includeDemo: true }).base.users[0].hoten);`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, SEED_DATA_DIR: '' },
        windowsHide: true,
        timeout: 10000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Packaged JSON user');
  });
});
