const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { dirname, join, relative, resolve } = require('node:path');
const ts = require('typescript');
const vercelConfig = require('../../vercel.json');
const { env: runtimeEnv = {} } = vercelConfig;

test('the configured Vercel build loads entrypoint dependencies without an alias loader', () => {
  const root = resolve(__dirname, '../..');
  const scratchDir = join(root, '.tmp');
  mkdirSync(scratchDir, { recursive: true });
  const outputDir = mkdtempSync(join(scratchDir, 'vercel-runtime-'));

  try {
    const configPath = join(root, 'tsconfig.build.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    assert.equal(parsed.errors.length, 0);
    const entrypointDependencies = [];

    // With outputDirectory, Vercel traces Nest CLI's emitted JS. Its default
    // compiles the TS source again, without Nest CLI's alias transformer.
    for (const fileName of parsed.fileNames) {
      if (fileName.endsWith('.d.ts')) continue;
      const outputText = vercelConfig.outputDirectory
        ? readFileSync(
            join(
              root,
              vercelConfig.outputDirectory,
              relative(root, fileName),
            ).replace(/\.ts$/, '.js'),
            'utf8',
          )
        : ts.transpileModule(readFileSync(fileName, 'utf8'), {
            fileName,
            compilerOptions: parsed.options,
          }).outputText;
      const outputPath = join(outputDir, relative(root, fileName)).replace(
        /\.ts$/,
        '.js',
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, outputText);

      if (resolve(fileName) === join(root, 'src/main.ts')) {
        const source = ts.createSourceFile(
          outputPath,
          outputText,
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'require' &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            entrypointDependencies.push(node.arguments[0].text);
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }
    assert.ok(
      entrypointDependencies.length > 0,
      'No entrypoint dependencies were compiled',
    );

    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      require('reflect-metadata');
      const { createRequire } = require('node:module');
      const load = createRequire(${JSON.stringify(join(outputDir, 'src/main.js'))});
      for (const dependency of ${JSON.stringify(entrypointDependencies)}) load(dependency);
      const { ConfigService } = load('@nestjs/config');
      const { PrismaService } = load('./prisma/prisma.service.js');
      if (Reflect.getMetadata('design:paramtypes', PrismaService)?.[0] !== ConfigService) {
        throw new Error('DI metadata was lost');
      }
      console.log('Vercel entrypoint dependencies and decorator metadata loaded');
    `,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          NODE_OPTIONS: `--no-experimental-require-module ${runtimeEnv.NODE_OPTIONS || ''}`,
        },
      },
    );

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.match(
      result.stdout,
      /Vercel entrypoint dependencies and decorator metadata loaded/,
    );
  } finally {
    assert.equal(dirname(outputDir), scratchDir);
    rmSync(outputDir, { recursive: true, force: true });
  }
});
