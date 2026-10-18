# LianTest frontend migration — execution and verification

Started 2026-10-17 after user approved the design and M1–M8 plan.

## Execution ledger

- Implementation ruling: work in the approved existing `NestJS` checkout, preserving DESIGN.md and audit documents. No commits, branches, pushes or dependency installation during implementation. The user subsequently requested committing and pushing the completed changes on 2026-10-18; this authorizes publication to the existing `NestJS` branch.
- Ruling: visual-only CSS/markup changes use render/browser verification and existing regression tests rather than tests that mirror CSS. New demo state/scoring receives behavior tests before implementation.
- Historical 2026-10-17: Browser connection returned `No browser is available`; browser checks were pending at that point. The later headless checks and remaining limits are recorded below.
- Historical 2026-10-17: M1 was in progress when this ledger was first written. Baseline before edits: typecheck/lint/build exit0,82 unit and18 public/routing tests passed.

## Final verification

## Checkpoint 2026-10-18 Asia/Ho_Chi_Minh

- Recovered the previous session after its usage limit. M1–M6 implementation is present in the working tree, rather than only M1 as the old ledger said.
- User steering: website/product name is **LianTest**; creator is **LianHarman**. EJS, metadata, navigation, auth, landing, print heading and README updated. Root controller change is a display title only.
- New steering: audit `public/media`, remove proven unused assets, and replace active interface assets with a single LianTest identity following the approved indigo/light/paper visual specification. Preserve user-uploaded avatars referenced by database filenames.
- New steering: all 13 sample account email addresses now use `@liantest.vn`; IDs, role relationships and passwords are preserved. They have since moved from `exam-sample.ts` into `src/seed-db/data/users.json` (2026-10-18). This changes the seed source, not existing accounts in the user's database. Default `createMany({ skipDuplicates: true })` does not overwrite existing emails; never clear/reseed a user's database simply to apply branding.
- Final code checks: lint/typecheck/build, 82 unit tests, 139 E2E tests (11 suites, 0 skipped), and 2 frontend behavior tests pass. The combined E2E run includes the branding case. Also verified landing JSDoc, changed JS syntax and `git diff --check`.
- Browser plugin discovery returned no connected browser. A separate headless Chrome profile works; `.codegraph/browser-qa/` contains local scripts, screenshots and JSON evidence. No personal browser profile is used.
- Initial main browser pass: 28 route visits at 375/430/768/1024/1440/1600px (168 measurements). After media updates, 26 routes/156 measurements pass with 0 overflow; that rerun was stopped at the external-CDN-dependent exam tab, so it is not an unconditional full browser pass. Additional pass: 9 route/template cases at the same widths (54 measurements) pass. The latter covers permitted announcement/statistic screens, real print output, OTP/reset and all 3 error templates. OTP/reset/error previews use rendered EJS fixtures, not a fabricated recovery ticket. The user's port-8080 signin report received a separate 6-width assertion/screenshot pass after its fix.
- Fixed review/browser findings: duplicate signup submit handler (test demonstrated 2 POSTs before / 1 after), malformed logout closing tag, corrupted navigation label, selected-answer and current-question contrast, white modal close controls, unreadable metric labels, ineffective 1200px rail, hidden Select2 controls expanding the document, mobile group-picker/print overflow and missing Dashmix page-container on auth/exam pages. Moved a pre-existing unload cleanup into the image-cache closure. No AJAX contract, scoring, timer, auth or permission changes.
- Verified browser interactions: login for admin/GV/SV via signin, account dropdown/logout, signup terms focus/Escape, local demo back/restore/score/retry with no network request, keyboard role tabs, no-JS landing content, print-to-PDF. Initial responsive findings were corrected and rechecked.
- Independent source review: no remaining Critical/Important findings after fixes; final mobile gutter specificity note also corrected.

### Outstanding at this checkpoint

1. Media audit/replacement finished: 17 old files removed; 9 remain, including one user image retained for legacy database references. New LianTest vector/raster assets loaded successfully; no broken static media paths. Details in `15-media-audit.md`.
2. Final result ledger, README, CLAUDE.md, plan/spec status and main progress index updated.
3. Full live exam/browser essay-image-draft/submit verification is not certified: the restricted network blocks the existing external `idb`/CKEditor CDN dependencies (`idb is not defined`). HTTP/SQL exam flows pass on the isolated fixture. Keep this limitation separate from visual/source review; do not claim M8 unconditional completion.
4. Earlier removal of two contributor names/IDs covers active NestJS/PHP source and the PHP SQL sample. A follow-up inspection found them inside the archived `PHP/FileBaoCao/DA4_DT5.docx`; archival Word/PDF cleanup is still outstanding. The document runtime/render dependencies are not exposed here. Do not claim a whole-workspace privacy scrub has finished.

### Signin regression reported by user on port 8080

Reproduced at `http://localhost:8080/auth/signin`: at 1440px, vendor `#page-container`
forced `display:flex; flex-direction:column; width:100%` over `.auth-layout`. The
form shrank to about 376px and started at y638, underneath the introduction. This
was introduced when restoring the Dashmix page-container runtime hook. Fixed by
scoping each auth layout/base/breakpoint rule to `#page-container.auth-layout`.
The runtime hook is preserved.

Verified directly on port 8080 at 375/430/768/1024/1440/1600px. Desktop/tablet use
two grid columns; mobile stacks the form; no document overflow or broken image.
At 1440px the form is 480px wide at y211 beside the introduction. Screenshots,
before/after measurements and the assertion runner are in
`../../.codegraph/browser-qa/auth-layout-report.json` and `signin-8080-*.png`.

### Environment and scope

All business tests use an ephemeral in-memory PGlite PostgreSQL socket with 22 migrations and demo fixtures, plus a local Storage HTTP stub. Preview and DB tests run sequentially to avoid PGlite's single-backend connection limit. Verification did not write production database/storage or install packages. Commits/pushes were deferred until the user's later explicit request. `DESIGN.md` and local-only pnpm files are preserved.

### Final reproducible evidence

| Check | Command / evidence | Result |
|---|---|---|
| Build | `node node_modules/@nestjs/cli/bin/nest.js build` | exit 0 |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| Lint, read-only | `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"` | exit 0 |
| Unit | `node node_modules/jest/bin/jest.js --runInBand` | 82/82, 7 suites |
| Frontend behavior | `node --test test/frontend/landing-demo.test.cjs test/frontend/signup.test.cjs` | 2/2 |
| Complete E2E on fresh fixture | From workspace root: `node .codegraph/verify-final.cjs` | 139/139, 11 suites, 0 skipped |
| Seed email rows | Same harness rebuilds fixture from current seed, queries all 13 accounts | all `id@liantest.vn` |
| Static media references | Source scan against the 9 retained media files | 0 missing |
| Signin on actual URL | `node .codegraph/browser-qa/auth-layout.cjs`, from workspace root | 6 widths, no overlap/overflow/broken images |
| Diff whitespace | `git diff --check` inside NestJS | exit 0 |

Shell has no `pnpm` executable, so the installed local binaries above were used;
no package-manager/dependency or lockfile changes. Final raw E2E JSON/logs and
fixture runner live under `../../.codegraph/final-*` and `verify-final.cjs`.
The runner uses only local fixture URLs and closes its fixture at the end.
