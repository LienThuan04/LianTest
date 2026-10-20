# Deploying LianTest

[Project README](README.md) · [Vietnamese README](README.vi.md) · [Documentation index](docs/README.md)

This guide covers production deployment to **Vercel**, **Render**, **Railway**,
and a conventional Node.js server. LianTest serves its EJS pages and API from
one NestJS application; deploy the whole application as a backend service.

Run every command from the directory containing `package.json`. In the
current Git repository this is the repository root, even if the directory on
your computer is named `NestJS`.

## 1. Runtime and dependency versions

- Use **Node.js 24.x**; the local verification environment uses **24.19.0**.
- Use **pnpm 11.22.0** for pnpm commands below. If pnpm is unavailable, replace
  `pnpm` with `npx --yes pnpm@11.22.0`.
- The committed `package-lock.json` also supports the clean npm verification
  workflow in section 3.
- Keep TypeScript on the declared **6.x** range. TypeScript 7.0 does not expose
  the compiler API required by the Nest CLI.
- Keep Prisma CLI, `@prisma/client`, and `@prisma/adapter-pg` on compatible
  versions. This configuration uses the **7.10.1** release line.
- The test scripts enable Node's VM modules for Jest to load NestJS 12's ESM
  dependencies. Use Node 24.9 or newer when running the tests.

See the [Nest CLI compatibility issue](https://github.com/nestjs/nest-cli/issues/3479)
and [Jest ESM documentation](https://jestjs.io/docs/ecmascript-modules).

By repository convention, `pnpm-lock.yaml` and `pnpm-workspace.yaml` stay
local and are ignored by Git. The explicit pnpm install commands in this guide
therefore use `--no-frozen-lockfile`. For reproducible npm installs, use the
committed `package-lock.json` with `npm ci`. Vercel uses its framework defaults
as described in section 4. Review build-script approval prompts when installing
locally.

### Prepare build-script approvals for pnpm installs

pnpm 11 rejects an install when a dependency's build script has no approval
decision. Since the root `pnpm-workspace.yaml` is ignored by this repository,
hosted pnpm installs need a reviewed policy that they can copy into place.

The repository includes the reviewed decisions in
[deploy/pnpm-build-policy.yaml](deploy/pnpm-build-policy.yaml).
The policy for the current dependency set is:

```yaml
allowBuilds:
  '@compodoc/compodoc': true
  '@nestjs/core': true
  '@parcel/watcher': true
  '@prisma/engines': true
  '@scarf/scarf': true
  bcrypt: true
  esbuild: true
  prisma: true
  unrs-resolver: true
  workerd: true
```

The Linux install commands below copy this policy to the local
`pnpm-workspace.yaml` before installing.
Review new package requests after dependency updates; do not replace the
policy with an automatic approval of every dependency. See
[pnpm 11 build defaults](https://pnpm.io/blog/releases/11.0).

For a fresh local checkout, copy the reviewed policy before installation too:
use `cp deploy/pnpm-build-policy.yaml pnpm-workspace.yaml` in a POSIX shell, or
`Copy-Item deploy/pnpm-build-policy.yaml pnpm-workspace.yaml` in PowerShell.
On an existing local installation, review and retain its existing decisions.

## 2. Configure production services and environment variables

Prepare an externally reachable PostgreSQL database, a public Storage bucket,
and SMTP credentials. Set variables through the hosting platform's secret or
environment-variable settings, using [.env.example](.env.example) as the list
of application settings. Replace its placeholder values.

| Configuration | Variables | Requirement |
| --- | --- | --- |
| Database | `DATABASE_URL` | A working PostgreSQL or Prisma Accelerate runtime URL; the application checks its connection during startup. |
| Authentication | `JWT_ACCESS_TOKEN_SECRET`, `JWT_ACCESS_EXPIRE`, `ACCESS_TOKEN_COOKIE` | A production signing secret, token lifetime, and cookie name. |
| Storage | `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_NAME_BUCKET` | A public bucket and server credentials with the required upload/delete permissions. |
| SMTP | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_AUTH_USER`, `EMAIL_AUTH_PASS`, `EMAIL_FROM`, `SUPPORT_EMAIL` | All six values are required by the email service at startup. The current transport uses STARTTLS-style configuration, such as port 587. |
| Application | `APP_NAME`, `NAME_ROLE_ADMIN`, `VERSION`, `GLOBAL_PREFIX` | Preserve settings consistent with your database roles and API clients. |
| CORS | `LIST_ORIGIN_CORS` | Comma-separated allowed browser origins, such as your HTTPS application domain. |
| Uploads | `LIMIT_UPLOAD_FILE_SIZEMB` | A per-file application limit; the host may enforce a smaller total request limit. |

Use these production flags:

```dotenv
NODE_ENV=production
MODE=production
SEED_DB=false
CLEAR_DB=false
SEED_DEMO_DATA=false
EXPORT_SWAGGER_API_JSON=false
```

`MODE=production` disables the development Swagger setup, including its local
JSON file writes. Keep seed/clear flags disabled during normal deployments.
Initialize production accounts deliberately using the
[seed guide](src/seed-db/data/README.md), with reviewed data and passwords.

Keep `SUPABASE_KEY` and database/SMTP/JWT credentials on the server. On managed
hosts, use their runtime `PORT` instead of copying the local `PORT=8080` value.
The current bootstrap reads `PORT`; `HOST` is used only in startup log messages.

## 3. Generate the client, build, and prepare the database

Run the following checks before release:

```sh
npm ci
npx prisma generate
npm run build
npm run lint
npm test -- --runInBand
npm run test:runtime
node --test test/frontend/*.test.cjs
```

Keep development dependencies available during the build. The explicit pnpm
install commands use `--prod=false` for this purpose.
`npm run lint` includes automatic fixes, so review its changes before release.
The committed build script runs `prisma generate && nest build`, so building
also generates Prisma Client. Client generation does not apply database changes.

Apply committed migrations to the intended production database as a separate
release step, using credentials configured for that target:

```sh
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
```

For this step, `DATABASE_URL` must be a connection supported by Prisma Migrate,
typically a direct PostgreSQL connection. A runtime Accelerate URL and a
migration connection can be supplied separately to their respective jobs.
The current `prisma.config.ts` reads `DATABASE_URL`; it does not read `DIRECT_URL`.
Do not run migrations or seed operations on every HTTP request or cold start.

Prisma Client must be generated on each deployment because dependency caches
can otherwise retain an outdated client. See
[Prisma's Vercel deployment guide](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel).

## 4. Deploy to Vercel

Vercel supports NestJS directly. This repository selects the emitted
`dist/src/main.js` entrypoint so Nest CLI can prepare its source aliases.
See [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs).

### Project settings

Import the GitHub repository, select the release branch, and configure:

| Setting | Value for this repository |
| --- | --- |
| Framework Preset | `NestJS` |
| Root Directory | `./` when the backend is at the repository root |
| Build Command | Default (no override) |
| Output Directory | `dist` (set in `vercel.json`) |
| Install Command | Default (no override) |

Leave the Build Command and Install Command override toggles disabled.
Keep Output Directory at `dist`, as declared in `vercel.json`.
The committed `package.json` build script generates Prisma Client before
compiling NestJS; no separate Prisma build-command override is needed.

Use `NestJS` as the Production Branch unless you intentionally release from
another branch, and select Node.js `24.x`. Configure production environment
variables before deploying. Preview deployments need their own variables and
database target.

### Vercel configuration

The repository's [vercel.json](vercel.json) explicitly selects the NestJS preset:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nestjs",
  "outputDirectory": "dist",
  "env": {
    "NODE_OPTIONS": "--experimental-require-module"
  }
}
```

Do not add the previous `functions["src/main.ts"]` configuration. Vercel CLI
64.5.0 rejects that pattern with `unused_function`, even with the NestJS preset
selected. With `outputDirectory: "dist"`, the native builder detects
`dist/src/main.js` after `nest build`; it does not require
moving the application into an `api/` directory. See the
[framework setting](https://vercel.com/docs/project-configuration/vercel-json#framework).

Keep the `@/*` alias in the TypeScript source and `tsconfig.json`. Nest CLI
rewrites alias imports in its emitted JavaScript. Without `outputDirectory`,
Vercel selects `src/main.ts` and compiles the source again without Nest CLI's
alias transformer, leaving `require("@/app.module")` in the function. Pointing
Vercel at `dist` makes it package the JavaScript that Nest CLI already prepared.

### Required runtime setting for NestJS 12

The application deliberately uses CommonJS (`"type": "commonjs"`), while
NestJS 12 packages are ESM. Node.js 24 supports this combination through
`require(ESM)`, but Vercel disables that feature by default.

In **Project Settings → Environment Variables**, create a **Config** variable:

| Key | Value | Environments |
| --- | --- | --- |
| `NODE_OPTIONS` | `--experimental-require-module` | Production and Preview |

If `NODE_OPTIONS` already contains other flags, append this flag to its current
value. Save the variable and create a new deployment; an existing deployment
does not receive environment-variable changes retroactively.

The `env` entry in `vercel.json` expresses the same requirement, but it is not
proof that a Git deployment received the variable. Production deployment
`6eca7f9` included the entry in its build configuration while its actual
deployment environment did not contain `NODE_OPTIONS`. Verify the Project
Settings variable and the new deployment's environment before relying on it.

See [Vercel's require(ESM) setting](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#experimental-nodejs-require-of-es-module)
and the [NestJS 12 migration guide](https://docs.nestjs.com/migration-guide).
The [runtime investigation report](docs/vercel-runtime-interop.md) records the
verified commit, the failure mechanism, and local HTTP/auth checks.

The application reads page templates, email templates, and static files
relative to the project working directory. Verify those resources using the
smoke checks in section 8 after the deployment builds successfully.

A local packaging check with CLI 64.5.0 on Windows and `outputDirectory: "dist"`
included all 46 page templates and three email templates. Seed JSON files were
not traced. Keep startup seeding disabled and verify the hosted resources
before relying on email or startup seeding.

Apply migrations separately, deploy, and complete the smoke checks below.
For a linked Vercel CLI project, the equivalent production build/deploy flow is:

```sh
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Check the selected team and project during linking. These commands require a
Vercel CLI installation and account access. See the
[CLI build reference](https://vercel.com/docs/cli/build).

### Upload limit

Vercel Functions limit request bodies to **4.5 MB total**, including multipart
overhead. Setting `LIMIT_UPLOAD_FILE_SIZEMB=50` does not raise that limit.
The current application sends uploads through NestJS, so larger image,
Word/Excel, or essay uploads require a different upload flow, such as direct
Storage uploads followed by a request containing the stored file reference.
See [Vercel Functions limits](https://vercel.com/docs/functions/limitations#request-body-size).

## 5. Deploy to Render

Create a **Node Web Service** connected to the repository and the intended
branch. Use the repository root as the service root and set `NODE_VERSION`
to a supported Node 24 release, such as the tested `24.19.0`.

Use this **Build Command**:

```sh
cp deploy/pnpm-build-policy.yaml pnpm-workspace.yaml && npx --yes pnpm@11.22.0 install --no-frozen-lockfile --prod=false && npx --yes pnpm@11.22.0 run build
```

Use this **Start Command**:

```sh
node dist/src/main.js
```

Add the production variables from section 2. Let Render supply `PORT`. Run
migrations in an available pre-deploy step or a separate controlled release
job. Set the public health-check path to `/`, then deploy and verify the page,
authentication, Storage, and SMTP flows.

References: [Render Node web services](https://render.com/docs/deploy-node-express-app),
[Node version selection](https://render.com/docs/node-version).

## 6. Deploy to Railway

Create a service from the GitHub repository using **Railpack**, select the
release branch, and use the repository root as the service root.

- Set `RAILPACK_NODE_VERSION=24` to select the Node 24 runtime.
- Set `RAILPACK_INSTALL_CMD` to
  `cp deploy/pnpm-build-policy.yaml pnpm-workspace.yaml && npx --yes pnpm@11.22.0 install --no-frozen-lockfile --prod=false`.
- Set the custom build command to
  `npx --yes pnpm@11.22.0 run build`.
- Set the start command to `node dist/src/main.js`.
- Add the production environment variables, connect an accessible PostgreSQL
  database, and run migrations as a separate release/pre-deploy step.
- Let Railway provide `PORT`, generate a public domain, and run the smoke checks.

Keep `views/`, `public/`, and `src/email/templates/` in the final service image;
do not publish an image containing only `dist/`.

References: [Railway NestJS guide](https://docs.railway.com/guides/nest),
[build configuration](https://docs.railway.com/builds/build-configuration),
[Railpack Node configuration](https://railpack.com/languages/node).

## 7. Other Node hosts, containers, or a VPS

Use the install/generate/build commands from section 3 and start with:

```sh
pnpm run start:prod
```

This executes `node dist/src/main.js`. Keep the process working directory at
the repository/application root, not inside `dist/`.

The runtime filesystem must contain:

```text
application-root/
  package.json
  node_modules/             # Production dependencies and generated Prisma Client
  dist/
    src/main.js
  views/
  public/
  src/email/templates/
```

Keep `src/seed-db/data/` too if you deliberately enable startup seeding. In a
container build, generate Prisma Client for the target operating system and
keep pnpm's dependency links and `.pnpm` directory intact when copying modules.

For a VPS, run Node under a service manager with the application root as its
working directory, inject environment variables through the service, and put
an HTTPS reverse proxy in front of the listening port. Set `PORT` explicitly
when the host does not provide one. A persistent local upload directory is
not required: the application's images are stored in Storage.

## 8. Verify the deployed application

1. Confirm startup logs report a successful database connection and disabled
   startup seeding.
2. Open `/` and `/auth/signin`; verify HTML and `/public/` CSS/JS assets load.
3. Sign in with an account in the deployed database and open `/question`.
4. Test an allowed image upload, Word/Excel import, and the exam submission flow
   using a dedicated verification account and data.
5. Test OTP email delivery and ensure email templates are available.
6. Check runtime logs for failed queries, missing files, and request-size errors.

The public `/` route can be used for a basic HTTP health check. The repository
does not currently provide a dedicated `/health` endpoint.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Nest CLI reports a missing TypeScript compiler API | Keep TypeScript on 6.x and reinstall dependencies; do not run an unconditional `update --latest` during deployment. |
| `ERR_REQUIRE_ESM` when loading `@nestjs/core` | Set `NODE_OPTIONS=--experimental-require-module` in Vercel Project Settings for the intended environment, then redeploy. Node.js 24 and `type: commonjs` alone are insufficient on Vercel. |
| pnpm rejects unapproved dependency build scripts | Copy the reviewed `deploy/pnpm-build-policy.yaml` policy to `pnpm-workspace.yaml` before installation, as described in section 1. |
| TypeScript reports `TS5101` for `baseUrl` | The retained alias configuration uses `ignoreDeprecations: "6.0"` with TypeScript 6. Keep the committed tsconfig files; migrate away from `baseUrl` before upgrading to TypeScript 7. |
| `defineConfig`, `PrismaClient`, or Prisma model types are missing | Align Prisma CLI/client versions, run `prisma generate`, then build again. |
| Jest says an ESM module cannot be loaded | Use the repository test scripts, which enable VM modules, on Node 24.9+. |
| Build succeeds but startup fails | Check `DATABASE_URL`, network access, JWT, Storage, and all SMTP variables, including `SUPPORT_EMAIL`. |
| Vercel reports `unused_function` for `src/main.ts` | Use the committed `vercel.json` with `framework: "nestjs"`; remove the old `functions` block and deploy the updated commit. |
| `Failed to lookup view` or missing email templates | Check runtime files in the deployed bundle and the process working directory. |
| Vercel returns `FUNCTION_PAYLOAD_TOO_LARGE` | Reduce the total request size below the provider limit or change the upload flow. |
| No open port is detected | Start `dist/src/main.js` and allow the provider to supply `PORT`. |
| Database tables do not exist | Apply committed migrations against the intended database before serving traffic. |

This guide documents deployment configuration. A successful local build or unit
test run does not establish that a particular hosted database, SMTP account,
Storage bucket, or production deployment is working; verify those using the
deployed URL and the checks above.
