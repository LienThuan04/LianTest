'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Prisma } = require('@prisma/client');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const root = path.resolve(__dirname, '../..');
class Logger {
  error() {}
  warn() {}
}
const common = { Logger };
const cleanup = loadTypeScript(
  path.join(root, 'src/storage/image-cleanup.ts'),
  {
    '@nestjs/common': common,
    '@prisma/client': { Prisma },
  },
);
const { AccountService } = loadTypeScript(
  path.join(root, 'src/account/account.service.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/config': {},
    path: require('node:path'),
    '@/prisma/prisma.service': {},
    '@/storage/supabase-storage.service': {},
    '@/storage/image-cleanup': cleanup,
    '@/lib/bcrypt/bcrypt': {},
    '@/common/utils/avatar.util': {},
  },
);
const oldUrl = 'https://fixture.invalid/images/old.png';
const newUrl = 'https://fixture.invalid/images/new.png';
function fixture(options = {}) {
  let avatar = oldUrl;
  const objects = new Set([oldUrl]);
  const prisma = {
    nguoiDung: {
      findUnique: async () => {
        if (options.failRead) throw new Error('Fixture read failed');
        return { avatar };
      },
      update: async ({ data }) => {
        if (options.failWrite) throw new Error('Fixture write failed');
        avatar = data.avatar;
      },
    },
    $queryRaw: async () => {
      if (options.failCleanup) throw new Error('Fixture cleanup failed');
      return [avatar, ...(options.shared ? [newUrl] : [])].map((url) => ({
        url,
      }));
    },
  };
  const storage = {
    uploadImage: async () => {
      objects.add(newUrl);
      return newUrl;
    },
    ownedObjectPath: (url) =>
      url?.startsWith('https://fixture.invalid/images/')
        ? new URL(url).pathname
        : null,
    remove: async (url) => {
      objects.delete(url);
    },
  };
  return {
    service: new AccountService(prisma, {}, storage),
    objects,
    get avatar() {
      return avatar;
    },
  };
}
const file = {
  originalname: 'avatar.png',
  buffer: Buffer.from('fixture-image'),
};
for (const failure of ['failRead', 'failWrite']) {
  test(`avatar ${failure} cleans newly uploaded image and retains saved avatar`, async () => {
    const f = fixture({ [failure]: true });
    assert.equal(await f.service.uploadAvatar('student', file), false);
    assert.deepEqual([...f.objects], [oldUrl]);
    assert.equal(f.avatar, oldUrl);
  });
}
test('avatar failure retains uploaded object referenced by another user', async () => {
  const f = fixture({ failWrite: true, shared: true });
  assert.equal(await f.service.uploadAvatar('student', file), false);
  assert.deepEqual([...f.objects].sort(), [oldUrl, newUrl].sort());
});
test('avatar success preserves the new image and removes the old image', async () => {
  const f = fixture();
  assert.equal(await f.service.uploadAvatar('student', file), true);
  assert.equal(f.avatar, newUrl);
  assert.deepEqual([...f.objects], [newUrl]);
});
test('avatar cleanup failure does not change a successful save result', async () => {
  const f = fixture({ failCleanup: true });
  assert.equal(await f.service.uploadAvatar('student', file), true);
  assert.equal(f.avatar, newUrl);
  assert.ok(f.objects.has(newUrl));
});
