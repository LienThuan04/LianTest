# Vercel runtime: NestJS 12 and CommonJS

Verified on 21 October 2026. Repository: `LienThuan04/LianTest`, branch `NestJS`.

## Deployment evidence

The Vercel CLI was used for read-only inspection of team
`lien-hoa-thuans-projects`, project `lian-test`.

| Item | Verified value |
| --- | --- |
| Production deployment | `dpl_BbAoocyxkpEhHxZJaLCrGxZ3TKiP` |
| Source commit | `6eca7f9213a0ab075e1fdad19e4d1293ed8375c6` |
| Source branch | `NestJS` |
| Build state | `READY` |
| Function runtime | `nodejs24.x` |
| Production aliases | `lianharman-test.vercel.app`, `lian-test-six.vercel.app` |
| `NODE_OPTIONS` in source configuration | `--experimental-require-module` |
| `NODE_OPTIONS` in Project Settings | Absent at inspection time |
| `NODE_OPTIONS` in the deployment's environment list | Absent at inspection time |
| Live GET `/` on both production aliases | HTTP 500 at inspection time |

The build log identifies commit `6eca7f9`, uses TypeScript **6.0.3**, and ends
with `Build Completed in /vercel/output [27s]`. This deployment passed the
previous `TS5101` build failure. Build success does not establish runtime health.

The supplied `ERR_REQUIRE_ESM` logs are from 01:24–01:26 UTC+7, before commit
`6eca7f9` at 01:50 UTC+7. Fresh requests to that commit's production aliases
still returned HTTP 500. A CLI query for recent runtime errors returned no
records; the old stack trace must not be presented as a newly captured trace.

## Verified cause and module formats

`package.json` explicitly declares `"type": "commonjs"`. Both TypeScript
configs use `module: nodenext` / `moduleResolution: nodenext`, so the emitted
application is CommonJS. The actual `dist/src/main.js` contains:

```js
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module.js");
```

Installed and locked `@nestjs/core@12.2.0` declares `"type": "module"`. Its
entrypoint is ESM. Requiring it succeeds on upstream Node.js 24 when
`require(ESM)` is enabled and fails with the reported `ERR_REQUIRE_ESM` when
that feature is disabled. Vercel disables it by default.

The module formats remain CommonJS application → ESM NestJS 12. The runtime
setting enables Node's supported interoperability; it does not rewrite
application imports or suppress exceptions. NestJS 12 documents this approach
for CommonJS applications on Lambda runtimes.

Native ESM migration was considered. It would not remove this runtime
requirement for the current dependency graph: importing
`@nestjs/throttler@6.7.1` from an ESM entrypoint with `require(ESM)` disabled
also fails, because the throttler's CommonJS code requires `@nestjs/common`.
The dependency downgrade was abandoned when the user retained NestJS 12.

Sources: [NestJS migration guide](https://docs.nestjs.com/migration-guide),
[Vercel Node.js runtime setting](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#experimental-nodejs-require-of-es-module).

## Aliases and build compatibility

The user restored `baseUrl: "./"` and `@/*: ["src/*"]`. Compiler comparisons
confirmed that this configuration and the alternative relative-path mapping
resolve `@/app.module` to the same source file and both emit
`require("@nestjs/core")`. Aliases do not select the module format.

`ignoreDeprecations: "6.0"` permits retaining `baseUrl` on TypeScript 6.
This addresses `TS5101` only. TypeScript 7 will require removing the deprecated
option. The actual compiled alias imports use relative `.js` paths, and the
runtime regression test loads the complete compiled module graph without an
alias loader.

Prisma remains at 7.10.1, using the existing `PrismaClient` and `PrismaPg`
adapter. No Prisma schema, migrations, controller contracts, or business
logic were changed. The CommonJS format preserves the existing `__dirname`
seed-loader behavior. Decorator metadata remains enabled and was checked
against `PrismaService` constructor injection metadata.

## Verification

Local Node.js: **24.19.0**. The production API confirms the **24.x** runtime
family, but does not expose its exact patch version; the CLI banner reports
the local CLI process version, not the production process version.

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed against the npm lockfile |
| `npx prisma generate` | Passed, client 7.10.1 |
| `npm run build` | Passed, emitted CommonJS entrypoint inspected |
| ESLint without automatic fixes | Passed |
| Unit tests | 9 suites, 120 tests passed |
| Frontend tests | 2 passed |
| `npm run test:runtime` | Passed: compiled dependency graph and DI metadata load with the configured runtime flag |
| HTTP smoke test | Passed against the actual compiled `dist/src/main.js` |

The runtime regression test failed with the original `ERR_REQUIRE_ESM` before
the interoperability setting was applied. The local test models Vercel's
disabled default followed by the explicitly enabled runtime setting. Passing
this test does not prove that Vercel received the environment variable.

The HTTP smoke run used an isolated in-memory PostgreSQL/PGlite instance with
the 22 existing committed migrations, the real `PrismaPg` adapter, bcrypt
passwords, and JWT cookies. It verified:

- NestJS startup and a successful database readiness query.
- HTTP 200 for `/`, `/auth/signin`, `/auth/signup`, `/auth/recover`, and static CSS.
- HTTP 401 for an unauthenticated JSON request to `/dashboard`.
- The existing redirect to `/auth/signin` for unauthenticated HTML navigation.
- Rejection of an incorrect password, successful login, and a session cookie.
- HTTP 200 for authenticated `/dashboard` and `/question`.
- HTTP 401 for an invalid JWT cookie.

The reusable smoke command is `npm run test:smoke`. It requires
`RUNTIME_SMOKE_DATABASE_URL`, `RUNTIME_SMOKE_USER`, and
`RUNTIME_SMOKE_PASSWORD` for a dedicated test database/account. It never seeds
or migrates that database. The temporary fixture used for this investigation
stays under ignored `.tmp/` and does not touch the production database.

## Follow-up: unresolved source aliases at 02:07

The supplied 02:07 logs identify `Cannot find module '@/app.module'` in
`/var/task/src/main.js`. Read-only inspection resolves the production alias to
deployment `dpl_7TVd6pvsedejCYQCydXkrC79fTtr`, still from commit `6eca7f9`.

The native Vercel builder selects `src/main.ts` by default and compiles it
independently of Nest CLI. This compiler preserves TypeScript `paths` aliases;
it does not use Nest CLI's alias transformer. The earlier local module and
HTTP checks exercised `dist`, so they did not catch this second compilation.

The fix is `outputDirectory: "dist"` in `vercel.json`. The builder then selects
`dist/src/main.js`, whose imports Nest CLI has already rewritten. Source imports
using `@/`, `baseUrl`, and the `paths` mapping remain unchanged. No alias package,
runtime loader, dependency downgrade, or bootstrap change is required.

The installed Vercel CLI 64.5.0 builder was invoked locally: default settings
select `src/main.ts`, and the fixed settings select `dist/src/main.js`.
`test/runtime/vercel-module-loading.test.cjs` reproduces the exact alias error
with default settings and loads the configured output's entrypoint dependencies
and constructor metadata with the fix. Run it after `npm run build` using
`npm run test:runtime`.

The complete local native-builder check also passed: handler
`dist/src/main.js`, runtime `nodejs24.x`, 6,576 bundled files, all 46 page
templates, and three email templates. Seed JSON files were not traced;
keep startup seeding disabled. Build, ESLint, 120 unit tests, two runtime tests,
two frontend tests, and the isolated PostgreSQL/PGlite HTTP/auth smoke check
passed with the original source aliases. Production has not been redeployed.

Source: [Vercel builder entrypoint selection](https://github.com/vercel/vercel/blob/main/packages/build-utils/src/generate-node-builder-functions.ts).

## Required user deployment step

1. Open **Vercel → lian-test → Settings → Environment Variables**.
2. Add `NODE_OPTIONS` as a **Config** variable with value
   `--experimental-require-module`, scoped to **Production** and **Preview**.
   If it already exists, append the flag to its existing options.
3. Deploy a new commit containing `outputDirectory: "dist"` in `vercel.json`.
   Redeploying unchanged commit `6eca7f9` retains the alias failure. Keep Build
   Command at Default and confirm Output Directory is `dist`.
   Environment changes do not update an existing deployment.
4. Confirm the new deployment has `NODE_OPTIONS` in its environment and is
   using `nodejs24.x`.
5. Open `/` and `/auth/signin`, then verify login and authenticated pages.
   Inspect the new deployment's runtime logs if any request still returns 500.

The user initially chose to update the environment and deploy themselves;
the investigation did not modify remote environment settings or deploy.
After local verification, the user authorized committing and pushing the fix
on branch `NestJS` with release tag `v1.0.5-261021`. Hosted runtime recovery
still requires verification against the resulting deployment.

Remaining limits: production recovery is pending that user action; the exact
production Node.js patch version is unverified. SMTP delivery and Storage
operations were not tested against real services. The latest local Vercel
packaging check included email templates but omitted seed JSON; verify the
hosted resources before relying on email or startup seeding.
