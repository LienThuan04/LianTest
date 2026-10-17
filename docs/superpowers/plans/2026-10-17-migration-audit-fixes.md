# Migration audit fixes implementation plan

> **For agentic workers:** Use superpowers:dispatching-parallel-agents for independent domains; the primary worker integrates and verifies. Steps use checkboxes for tracking.

**Goal:** Resolve the 2026-10-17 audit findings and stop tracking the two local pnpm files, including the remote NestJS branch.

**Architecture:** Retain NestJS SSR, existing pagination, question preview/import and Prisma models. Fix existing paths and defaults, fail clearly when integration prerequisites are missing, and remove replaced storage objects only after database writes succeed.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, EJS/jQuery, ExcelJS/SheetJS, Supabase Storage, Jest.

**Spec:** `docs/03-tien-do.md`, section “Rà soát hiện trạng khi tiếp quản (2026-10-17)”, and the user's request to fix all findings and untrack `pnpm-lock.yaml`/`pnpm-workspace.yaml` locally and remotely.

## Global constraints

- Work in the existing checkout; preserve unrelated `DESIGN.md` and existing user changes.
- Keep local pnpm files; ignore them and remove only Git tracking. No history rewrite or force push.
- Use installed tools directly when pnpm is unavailable; do not change package manager or install extra packages.
- Never expose credentials or clear/seed a remote database during verification.
- Keep original routes and JSON contracts except for removing a redundant broken frontend request.

## Review focus

- Database or fixtures missing: integration tests must not count early returns as successful assertions.
- Failed database updates: referenced files must not be removed.
- Foreign URLs or bucket paths: storage cleanup must not delete unrelated objects.
- Malformed Excel or unanswered rows: preview must return a clear error without partial writes.
- Production startup: target must exist in a fresh build and destructive seeding must require explicit opt-in.

## Tasks

- [ ] 1. Fix Prisma transport selection, truthful connection verification, safe seed defaults/local flags, and production entrypoint. Add meaningful tests for protocol handling and explicit seed-clear opt-in; reproduce failures before fixes. Verify unit tests, build and read-only connectivity.
- [ ] 2. Fix questions page's redundant missing endpoint and enable Excel question preview/import through the existing flow. Add parser/flow tests for valid and malformed input. Own question controller, parser/helper, public page JS and page template; do not edit questions.service.ts without coordination.
- [ ] 3. Make integration login/fixture errors fail explicitly, remove false-pass guards and distinguish offline public page checks from DB integration tests. Own existing test/*.e2e-spec.ts and setup-app.ts. Verify targeted harness tests and report the real full-suite result.
- [ ] 4. Clean up replaced question/essay image objects after successful DB writes, with strict URL ownership and reference checks. Own storage service and questions/exams services; coordinate with task 2. Add meaningful tests with a local HTTP fake or dependency boundary for external storage.
- [ ] 5. Refresh stale overview/architecture/PHP mapping/API docs and record actual verification results. Keep the original handoff history identifiable.
- [ ] 6. Verify build, lint, unit tests, JS syntax and the complete e2e command. Run a focused review. Remove pnpm file tracking, commit the reviewed changes and push without force; verify remote branch/file state. If sandbox or network denies an operation, report the exact outstanding action and preserve local files.

## Verification commands

- `node node_modules/@nestjs/cli/bin/nest.js build`
- `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"`
- `node node_modules/jest/bin/jest.js --runInBand`
- `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand`
- `node --check public/js/pages/question.js`
- `git diff --check`, `git ls-files -- pnpm-lock.yaml pnpm-workspace.yaml`, remote branch verification.
