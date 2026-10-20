const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

test('compiled Nest application loads when require(ESM) is disabled', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--no-experimental-require-module',
      '-e',
      `
        require('reflect-metadata');
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('./dist/src/app.module.js');
        const { ConfigService } = require('@nestjs/config');
        const { PrismaService } = require('./dist/src/prisma/prisma.service.js');
        if (!NestFactory.create || !AppModule) throw new Error('Missing Nest exports');
        const dependencies = Reflect.getMetadata('design:paramtypes', PrismaService);
        if (dependencies?.[0] !== ConfigService) throw new Error('DI metadata was lost');
        console.log('Compiled dependency graph and decorator metadata loaded');
      `,
    ],
    { cwd: resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30_000 },
  );

  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /Compiled dependency graph and decorator metadata loaded/);
});
