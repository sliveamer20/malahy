# Malahy v2.5.6 — Final Pre-Publish Report

**Scope:** correct the `D9` scope guard so the authorized test-only `7g` fix is accepted, re-run all validation, verify release artifacts, and prepare the final pre-publish assessment. No commit, no push, no publish, no tag change.

**Date:** 2026-10-13
**Repository:** `sliveamer20/malahy`, branch `main`.

---

## 1. Initial Git State and Tag Verification

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `0a548ad208deb595b97830126dd40dc12249acbb` — `release: v2.5.6 payroll disbursement reports (thermal, PDF and Excel exports)` |
| Tag `v2.5.6` | annotated tag object → commit `0a548ad` (**= HEAD**, unchanged) |
| `origin/main` | `0ef9cc2742a2eec0d29f1e6b5719e919c5e6dbf8` — unchanged, not pushed |
| Working tree before this task | ` M tests/payroll-ui.test.js` (the authorized `7g` fix), `?? AI_REPORTS/V2_5_6_PRE_RELEASE_REVIEW_REPORT.md` (prior review report) |
| Stashes | none |

State matches the reports exactly. No discrepancy found. Nothing was reset, cleaned, stashed, rewritten, or discarded.

## 2. Exact D9 Root Cause and Correction

### Root cause

`D9` in `tests/v256-attendance-scroll.test.js` builds its file list from two sources:

```js
files = execFileSync("git", ["diff", "--name-only", BASE, "HEAD"], ...)   // BASE = HEAD~1 (pre-release baseline)
files = files.concat(execFileSync("git", ["status", "--porcelain"], ...))  // includes untracked files
return files.every(function (f) { return allowed.indexOf(f) !== -1; });
```

It then requires **every** listed file to appear in an explicit 15-entry allowlist (the authorized v2.5.6 release files). The list did not contain `tests/payroll-ui.test.js`, so the authorized deterministic `7g` correction — an uncommitted working-tree change — failed the guard regardless of its correctness. Because the guard also reads `git status --porcelain`, untracked files are within its scope as well; the pre-release review report created by the previous task (`AI_REPORTS/V2_5_6_PRE_RELEASE_REVIEW_REPORT.md`) and this final report are seen by it too.

### Correction (smallest justified, no scope weakening)

Two additions to the same explicit per-file list, following the pattern already established in it:

```diff
            "tests/phase3b-auth.test.js", "tests/phase3c1-gate.test.js", "tests/phase3c2-baseline.test.js",
+           /* تصحيح معتمَد للاختبار فقط: إصلاح 7g التابع للتاريخ + سجل الانتكاس 7g2 */
+           "tests/payroll-ui.test.js",
+           /* تقارير مراجعة ما قبل النشر — على نفس نمط التقارير المصرّح بها أعلاه */
            "AI_REPORTS/V2_5_6_PHASE_1_REPORT.md",
            "AI_REPORTS/V2_5_6_PHASE_1_REVIEW_REPORT.md",
            "AI_REPORTS/V2_5_6_PHASE_1_1_ATTENDANCE_FINALIZATION_REPORT.md",
-           "AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md"];
+           "AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md",
+           "AI_REPORTS/V2_5_6_PRE_RELEASE_REVIEW_REPORT.md",
+           "AI_REPORTS/V2_5_6_FINAL_PRE_PUBLISH_REPORT.md"];
```

Why this is not a scope-control weakening:

- **No wildcards or directory-level relaxation.** The guard still rejects any file not named explicitly. `tests/*.js` as a group is *not* allowed; only one named test file was added.
- **The existing allowlist already contained 4 explicit `AI_REPORTS/*.md` entries** — the two review reports are added in exactly the same per-file form. They are release-process documentation, not source.
- **All production sources remain restricted:** `index.html`, `assets/**`, `main.js`, `preload.js`, `package.json` can still only appear via their pre-existing allowlist entries. `package.json` in particular is still pinned to the release set — an unauthorized version bump would still fail `D1` and `D9`.
- **The `D9` assertion itself is intact** — it is not excluded, skipped, or wrapped in a bypass. All behavioral assertions (sections A/B/B15/C) are untouched.

## 3. Files Changed and Reason

| File | Change | Reason |
|---|---|---|
| `tests/payroll-ui.test.js` | +11/−4 (from the prior review, preserved) | Deterministic `7g` fix: both dates pinned (`batchDay = D(2026,10,13)`, `nextDay = D(2026,10,14)`), expected value derived via `K()`, plus new regression assertion `7g2`. |
| `tests/v256-attendance-scroll.test.js` | +6/−1 | Explicit allowlist correction described in §2. |
| `AI_REPORTS/V2_5_6_FINAL_PRE_PUBLISH_REPORT.md` | new (untracked) | This report. |

`git diff --stat HEAD` → `tests/payroll-ui.test.js | 15 ++++----` and `tests/v256-attendance-scroll.test.js | 7 +++++-` — **only the two test files**. No production file changed (see §6).

## 4. Focused Validation — Commands and Actual Results

```
node tests/payroll-ui.test.js
→ OK: 96 passed, 0 failed
→ PASS 7g  a new day gets its own reference
→ PASS 7g2 batch reference is pinned to the fixed batch day

node tests/v256-attendance-scroll.test.js
→ 218 passed, 0 failed
→ PASS D9 only the phase files are touched (2 sources + 1 test + 3 reports)

node tests/v256-payroll-exports.test.js
→ 146 passed, 0 failed
```

- The corrected `7g` and the new `7g2` pass.
- `D9` passes with the explicit allowlist update (verified again *after* this report file was created, so the untracked report is within the guard's view: **218 passed, 0 failed**).
- Attendance, absence finalization, and scroll assertions (Phase 1.1 sections A/B/B15/C) all pass and were not modified.
- Payroll report and export tests pass (146/0).

## 5. Full Test Suite

Convention: each `tests/*.test.js` run individually with `node`.

```
files executed: 27
total: 2231 passed, 0 failed
remaining failures: none
```

| File | Result |
|---|---|
| payroll-db-safety.test.js | 38 passed, 0 failed |
| payroll-e2e.test.js | 89 passed, 0 failed |
| payroll-integrity.test.js | 101 passed, 0 failed |
| payroll-migration-gate.test.js | 39 passed, 0 failed |
| payroll-migration.test.js | 139 passed, 0 failed |
| payroll-properties.test.js | 18 passed, 0 failed |
| payroll-report.test.js | 333 passed, 0 failed |
| payroll-ui.test.js | 96 passed, 0 failed |
| payroll.test.js | 222 passed, 0 failed |
| phase1-printer-feedback.test.js | 40 passed, 0 failed |
| phase3b-auth.test.js | 62 passed, 0 failed |
| phase3b-ipc.test.js | 15 passed, 0 failed |
| phase3c1-dom.test.js | 37 passed, 0 failed |
| phase3c1-gate.test.js | 49 passed, 0 failed |
| phase3c1-ipc.test.js | 19 passed, 0 failed |
| phase3c1-session.test.js | 30 passed, 0 failed |
| phase3c2-baseline.test.js | 65 passed, 0 failed |
| phase3c2-gate.test.js | 44 passed, 0 failed |
| phase3c2-ipc.test.js | 49 passed, 0 failed |
| phase3c2-perms.test.js | 39 passed, 0 failed |
| phase3c3-accounts.test.js | 92 passed, 0 failed |
| phase3c3-ui.test.js | 76 passed, 0 failed |
| phase3c4-recovery.test.js | 79 passed, 0 failed |
| phase4-daily-report.test.js | 71 passed, 0 failed |
| update-data-preservation.test.js | 25 passed, 0 failed |
| v256-attendance-scroll.test.js | 218 passed, 0 failed |
| v256-payroll-exports.test.js | 146 passed, 0 failed |

Suite progression: 2 229 / 1 failed (date-dependent `7g`) → 2 230 / 1 failed (`D9` guard only, previous review) → **2 231 / 0 failed** (this review). The previously failing `D9` was demonstrably introduced by the authorized `7g` correction in the prior review and is now resolved by the allowlist correction — no assertion was weakened or skipped to achieve this.

## 6. Production Code Unchanged — Confirmation

```
git diff --stat HEAD
 tests/payroll-ui.test.js             | 15 +++++++++++----
 tests/v256-attendance-scroll.test.js |  7 ++++++-
 2 files changed, 17 insertions(+), 5 deletions(-)
```

Only the two test files differ from the release commit. `index.html`, `assets/payroll/payroll-core.js`, `assets/report/payroll-report.js`, `main.js`, `preload.js`, `package.json`, `permissions.js`, `database.js`, `update-gate.js`, and `electron-builder.yml` are byte-identical to `HEAD`. No payroll calculation, attendance rule, permission, UI function, export logic, or Electron IPC was touched.

## 7. Release Artifact Verification

Artifacts located in the previously reported build output (not rebuilt — they are present and consistent):

```
C:\Users\sliveamer\AppData\Local\Temp\malahy-build-256\
```

| Check | `latest.yml` | Actual | Match |
|---|---|---|---|
| `malahy-setup-2.5.6.exe` exists | — | yes | ✅ |
| `.blockmap` exists | — | yes, 111 130 bytes | ✅ |
| version | `2.5.6` | `package.json` `2.5.6` | ✅ |
| size | `105908934` | 105 908 934 bytes | ✅ |
| sha512 (base64) | `HOkpr33KtBAA2tSy7aOutO9Er/l0u/7EoQF4yymmw2/DiRG6SBjnG7mfSWO9KbwOaEi/pNHiZ468wVqMgKq36g==` | computed `Get-FileHash -Algorithm SHA512` → hex `1CE929AF…AAB7EA` → base64 identical (converted with Node) | ✅ |

Both the `files[].sha512` entry and the top-level `sha512` in `latest.yml` equal the independently computed hash. The known expected value supplied with this task matches the computed value exactly — **no mismatch**.

Stable release assets in `D:\Malahy\dist\` are untouched (`malahy-setup-2.5.2/2.5.3/2.5.4/2.5.5.exe` with their blockmaps, timestamps predating this work). No rebuild was needed.

## 8. Commit and Tag Integrity

- `v2.5.6` still points at `0a548ad208deb595b97830126dd40dc12249acbb` — the same release commit, unchanged.
- No commit was created or amended; no tag was created, deleted, or moved.
- The two test-file corrections remain **uncommitted local changes** available for review, per requirement.

## 9. No Push, No Release

- `git ls-remote origin refs/heads/main` → `0ef9cc2…` — the remote is unchanged; **nothing was pushed**.
- No GitHub Release was created or attempted. `npm run publish` and `electron-builder --publish` were **not** run.
- No `git reset --hard`, `git clean`, `git stash`, `git add .`, or `git add -A` was used.
- No production data was accessed, migrated, or modified; all test data is synthetic and in-memory. No token or credential was exposed or requested.

## 10. Remaining Manual Checks and Risks

1. **Publishing is still blocked by release authentication** (carried over from the Phase 2 report): `GH_TOKEN`/`GITHUB_TOKEN` are unset and `gh` CLI is not installed, so the GitHub Release with the installer, blockmap, and `latest.yml` cannot be created yet.
2. **The two test corrections are uncommitted.** Before or as part of publishing they should be committed (and the release amended or a follow-up commit made, per the publisher's decision). The `v2.5.6` tag points at the release commit which does not yet contain them; the tests currently pass on the working tree.
3. **Hardware/manual checks not performed** (documented, not claimed): physical printing on real 58 mm and 80 mm thermal printers (CSS widths verified programmatically only); opening the generated `.xls` in a real Excel/LibreOffice installation (XML well-formedness, typed cells, sheet names, and round-trip verified by tests); visual PDF page-break inspection on paper; visual inspection of long Arabic names at 58 mm width.
4. **Excel format is SpreadsheetML 2003 (`.xls`)**, not OOXML `.xlsx` — a deliberate dependency-free choice; a third-party tool expecting OOXML would not read it.
5. `origin/main` remains 1 commit behind local `main`; a `git push origin main --tags` is required at publish time.

## 11. Final Status

**`READY_TO_PUBLISH`**

The `D9` scope guard passes with an explicit, per-file allowlist correction (no wildcard, no assertion weakened), `7g`/`7g2` pass deterministically, the Phase 1.1 attendance and Phase 2 export suites pass, and the **full suite is 27 files, 2 231 passed, 0 failed — no unexplained failures**. The release artifacts verify successfully (version 2.5.6, size 105 908 934, SHA-512 matching `latest.yml`, blockmap present). Manual hardware checks listed in §10 have **not** been performed and are disclosed here. Nothing has been pushed and no GitHub Release exists — publishing awaits explicit authorization and the missing release credentials.
