'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { stripTypeScriptTypes } = require('node:module');
const { parseSync } = require('@babel/core');

/**
 * Execute current TypeScript source for isolated Node unit tests when the Nest/
 * TypeScript toolchain cannot load. Only decorators and module syntax are
 * removed; Node transforms TypeScript, including constructor parameter fields.
 * Source method bodies are never extracted, copied, or replaced.
 *
 * Every runtime import must be supplied explicitly under its source specifier.
 * Default: decorators are ignored. `{ decorators: true }` optionally applies
 * ordinary class/method decorators in legacy order for metadata unit tests;
 * parameter decorators remain ignored. This is NOT Nest DI or HTTP validation.
 */
function loadTypeScript(filePath, imports = {}, options = {}) {
  const filename = path.resolve(filePath);
  const source = fs.readFileSync(filename, 'utf8');
  const ast = parseSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
      tokens: true,
    },
  });
  const changes = [];
  const exported = [];
  const decoratorApplications = [];

  function keepDecoratorApplications(declaration) {
    if (!options.decorators || declaration.type !== 'ClassDeclaration') return;
    const name = declaration.id?.name;
    if (!name) throw new Error('Decorated anonymous classes are unsupported');
    for (const member of declaration.body.body) {
      if (!member.decorators?.length) continue;
      if (!['ClassMethod', 'ClassPrivateMethod'].includes(member.type)
          || member.computed || member.key.type === 'PrivateName') {
        throw new Error('Only ordinary method decorators are supported');
      }
      const key = JSON.stringify(member.key.name ?? member.key.value);
      const target = member.static ? name : `${name}.prototype`;
      const decorators = member.decorators.map((entry) =>
        source.slice(entry.expression.start, entry.expression.end),
      );
      decoratorApplications.push(`{
        const target = ${target};
        let descriptor = Object.getOwnPropertyDescriptor(target, ${key});
        for (const decorate of [${decorators.join(',')}].reverse()) {
          descriptor = decorate(target, ${key}, descriptor) ?? descriptor;
        }
        Object.defineProperty(target, ${key}, descriptor);
      }`);
    }
    const decorators = (declaration.decorators ?? []).map((entry) =>
      source.slice(entry.expression.start, entry.expression.end),
    );
    if (decorators.length) {
      decoratorApplications.push(`for (const decorate of [${decorators.join(',')}].reverse()) {
        ${name} = decorate(${name}) ?? ${name};
      }`);
    }
  }

  function change(start, end, replacement = '') {
    changes.push({ start, end, replacement });
  }

  function removeDecorators(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Decorator') {
      change(node.start, node.end);
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(removeDecorators);
      else if (value && typeof value === 'object') removeDecorators(value);
    }
  }

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      const bindings = node.specifiers.filter(
        (specifier) => specifier.importKind !== 'type',
      );
      if (node.importKind === 'type' || !bindings.length) {
        if (!node.specifiers.length && node.importKind !== 'type') {
          if (!Object.hasOwn(imports, node.source.value)) {
            throw new Error(`Unmapped source import: ${node.source.value}`);
          }
        }
        change(node.start, node.end);
        continue;
      }
      const specifier = node.source.value;
      if (!Object.hasOwn(imports, specifier)) {
        throw new Error(`Unmapped source import: ${specifier}`);
      }
      const dependency = `module.sourceTestImports[${JSON.stringify(specifier)}]`;
      change(
        node.start,
        node.end,
        bindings.map((binding) => {
          if (binding.type === 'ImportNamespaceSpecifier') {
            return `const ${binding.local.name} = ${dependency};`;
          }
          const imported = binding.type === 'ImportDefaultSpecifier'
            ? 'default'
            : binding.imported.name ?? binding.imported.value;
          return `const ${binding.local.name} = ${dependency}[${JSON.stringify(imported)}];`;
        }).join('\n'),
      );
      continue;
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        throw new Error(`Source re-exports are unsupported: ${filename}`);
      }
      if (node.declaration) {
        keepDecoratorApplications(node.declaration);
        const keyword = ast.tokens.find((token) =>
          token.start >= node.start && token.type.label === 'export',
        );
        change(keyword.start, keyword.end);
        const declaration = node.declaration;
        if (declaration.type === 'VariableDeclaration') {
          for (const entry of declaration.declarations) {
            if (entry.id.type !== 'Identifier') {
              throw new Error('Destructured source exports are unsupported');
            }
            exported.push([entry.id.name, entry.id.name]);
          }
        } else if (!['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(declaration.type)) {
          exported.push([declaration.id.name, declaration.id.name]);
        }
      } else {
        change(node.start, node.end);
        if (node.exportKind !== 'type') {
          for (const entry of node.specifiers) {
            if (entry.exportKind !== 'type') {
              exported.push([entry.exported.name ?? entry.exported.value, entry.local.name]);
            }
          }
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      keepDecoratorApplications(node.declaration);
      const keyword = ast.tokens.find((token) =>
        token.start >= node.start && token.type.label === 'export',
      );
      const defaultKeyword = ast.tokens.find((token) =>
        token.start >= keyword.end && token.type.label === 'default',
      );
      if (node.declaration.id) {
        change(keyword.start, defaultKeyword.end);
        exported.push(['default', node.declaration.id.name]);
      } else {
        change(keyword.start, defaultKeyword.end, 'const __sourceTestDefault =');
        exported.push(['default', '__sourceTestDefault']);
      }
    } else keepDecoratorApplications(node);
    removeDecorators(node);
  }

  // Decorators can precede `export`; do not apply a nested edit twice.
  const ordered = changes.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlapping = [];
  for (const entry of ordered) {
    const previous = nonOverlapping.at(-1);
    if (previous && entry.start < previous.end) {
      if (entry.end <= previous.end) continue;
      throw new Error('Overlapping source-loader syntax edits');
    }
    nonOverlapping.push(entry);
  }
  let transformed = source;
  for (const entry of nonOverlapping.reverse()) {
    transformed = transformed.slice(0, entry.start)
      + entry.replacement
      + transformed.slice(entry.end);
  }
  transformed = stripTypeScriptTypes(transformed, {
    mode: 'transform',
    sourceUrl: filename,
  });
  transformed += '\n' + decoratorApplications.join('\n');
  transformed += '\n' + exported.map(([name, local]) =>
    `module.exports[${JSON.stringify(name)}] = ${local};`,
  ).join('\n');

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.sourceTestImports = imports;
  loaded._compile(transformed, filename);
  return loaded.exports;
}

module.exports = { loadTypeScript };
