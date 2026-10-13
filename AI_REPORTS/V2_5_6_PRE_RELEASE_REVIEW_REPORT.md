# Malahy v2.5.6 — Pre-Release Review Report

**Scope:** review the date-dependent failure in `tests/payroll-ui.test.js` (assertion `7g`), fix it as a test-only correction, validate the release, and verify the release artifacts. No publish, no push, no tag change.

**Date:** 2026-10-13
**Reviewer run environment:** Node.js on Windows (pwsh), repository `sliveamer20/malahy`, branch `main`.

---

## 1. Initial Git State and Tag Verification

| Item | Value found | Value in the Phase 2 report | Match |
|---|---|---|---|
| Branch | `main` | `main` | ✅ |
| HEAD | `0a548ad208deb595b97830126dd40dc12249acbb` — `release: v2.5.6 payroll disbursement reports (thermal, PDF and Excel exports)` | `9fa138105dd899d4afeb06c6eee167c9bc659de6` (same commit message) | ⚠️ SHA differs (see §1.1) |
| Working tree | clean before the test fix | clean after the release commit | ✅ |
| Tag `v2.5.6` | annotated tag object `734ddb2b...` → commit `0a548ad` (= HEAD) | "points at the commit above" | ✅ points at the release commit |
| `origin/main` | `0ef9cc2...` (`docs: record v2.5.5 release build and GitHub publication evidence`) | pre-release commit `0ef9cc2` | ✅ |
| Ahead of `origin/main` | 1 commit (`0a548ad`), **not pushed** | 1 commit, not pushed | ✅ |
| Stashes | none | none | ✅ |

No `git reset`, `git clean`, `git stash`, commit rewrite, or tag move was performed at any point. The working tree was clean at the start of the review; the only working-tree change made is the authorized test fix (§3).

### 1.1 Discrepancy found vs. the report — assessed as non-blocking

The report records the release commit as `9fa1381...`, but the actual release commit is `0a548ad...`. Both commits have the **same message** and the **same parent** (`0ef9cc2`), and `git diff 9fa1381 0a548ad` shows exactly **one changed file: `AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md`** (49 insertions, 17 deletions). Every source, test, config, and production file is identical between the two. The commit was re-created after the report was written (report text updated); the tag `v2.5.6` correctly points at the current release commit `0a548ad` = HEAD.

**Conclusion:** the release tree itself is intact and matches the report's description; only the recorded SHA and the report markdown are stale. Recorded here per instruction; not a blocker.

---

## 2. Root Cause of the `7g` Date-Dependent Failure

Assertion `7g` in `tests/payroll-ui.test.js` (section 7):

```js
const res = env.api.payCommit(
  [P.planPayout(env.api.empFind("E1"), { nowTs: Date.now(), dateTs: Date.now() })], {});
...
const ref2 = P.nextRef(env.api.pbLoad(), D(2026, 10, 13));
eq("7g a new day gets its own reference", ref2, "PAY-20261013-01");
```

The reference generator `nextRef(store, ts)` in `assets/payroll/payroll-core.js` (lines 675–684) builds `PAY-<YYYYMMDD>-<NN>` where `NN` is a **per-calendar-day** sequence counter persisted in the store under `_seq_<YYYYMMDD>`:

```js
function nextRef(store, ts) {
  var key = dayKeyOfTs(ts).replace(/-/g, '');
  store = store || {};
  var cur = store['_seq_' + key];
  var n = (cur === undefined || cur === null) ? 0 : Number(cur);
  ...
  n = Math.floor(n) + 1;
  store['_seq_' + key] = n;
  return 'PAY-' + key + '-' + (n < 10 ? ('0' + n) : ('' + n));
}
```

**The defect is in the test, not in production code.** The test mixed two incompatible time sources:

1. The batch was committed with `Date.now()` — the **real system clock**. On the run date (2026-10-13) `commitBatch` calls `nextRef` for day `20261013`, storing `_seq_20261013 = 1` and emitting `PAY-20261013-01`.
2. The "next day" call used a **hardcoded** `D(2026, 10, 13)` — the same calendar day.

So on 2026-10-13 (and only on that day) both calls land on the same day, `nextRef` correctly increments to `02`, and the expectation `PAY-20261013-01` fails:

```
FAIL  7g a new day gets its own reference :: got="PAY-20261013-02" want="PAY-20261013-01"
```

The expectation was valid only on days **other than** 2026-10-13 — i.e. it was a hardcoded expectation tied to one calendar day, exactly as the Phase 2 report diagnosed. `nextRef` itself behaves correctly (per-day sequencing is the intended design).

### 2.1 Baseline confirmation (read-only)

The failure was reproduced on a **pristine pre-release baseline**: the pre-release parent `0ef9cc2` was extracted with `git archive 0ef9cc2 | tar -x` into a throwaway `%TEMP%\malahy-baseline-7g` directory (no checkout, no work-tree mutation, nothing reset or stashed).

```
node %TEMP%\malahy-baseline-7g\tests\payroll-ui.test.js
→ FAIL 7g a new day gets its own reference :: got="PAY-20261013-02" want="PAY-20261013-01"
→ 94 passed, 1 failed     (identical to the current committed tree)
```

Both the pristine baseline and the release commit produce the identical failure, confirming it is pre-existing and unrelated to Phase 1.1 or Phase 2.

---

## 3. The Exact Test-Only Fix

Only `tests/payroll-ui.test.js` was modified (11 insertions, 4 deletions). The production logic (`nextRef`, `commitBatch`, `planPayout`, and everything else) is **untouched**.

Fix strategy: **construct both dates relative to the same controlled reference date** — the batch date is pinned to a fixed day, and the "next day" is a fixed, strictly-later day, so no path depends on `Date.now()` and the result is identical on every calendar day.

```diff
-  const res = env.api.payCommit(
-      [P.planPayout(env.api.empFind("E1"), { nowTs: Date.now(), dateTs: Date.now() })], {});
+  /* تواريخ ثابتة (لا تعتمد على ساعة النظام) ⇒ المرجع قابل للتكرار في أي يوم */
+  const batchDay = D(2026, 10, 13);
+  const nextDay  = D(2026, 10, 14);
+  const res = env.api.payCommit(
+      [P.planPayout(env.api.empFind("E1"), { nowTs: batchDay, dateTs: batchDay })], {});
...
-  /* مرجع جديد في اليوم التالي لا يتكرر */
-  const ref2 = P.nextRef(env.api.pbLoad(), D(2026, 10, 13));
-  eq("7g a new day gets its own reference", ref2, "PAY-20261013-01");
+  /* مرجع جديد في اليوم التالي لا يتكرر — كلا التاريخين ثابت فوق ساعة النظام،
+     فينتج نفس النتيجة في أي يوم يُشغَّل فيه الاختبار */
+  const ref2 = P.nextRef(env.api.pbLoad(), nextDay);
+  eq("7g a new day gets its own reference", ref2,
+     "PAY-" + K(2026, 10, 14).replace(/-/g, "") + "-01");
+  /* سجل الانتكاس: دفعة اليوم الثابت تُعطي مرجعًا من نفس اليوم المُثبَّت — لا من
+     تاريخ اليوم الحقيقي (السبب الجذري للخطأ كان Date.now()) */
+  eq("7g2 batch reference is pinned to the fixed batch day", res.batch.ref,
+     "PAY-" + K(2026, 10, 13).replace(/-/g, "") + "-01");
```

Notes on the design:

- The batch day stays on `2026-10-13` (the same calendar day the live clock produced on the run date), so `planPayout`'s coverage window — `cutoff = endOfDayTs(dateTs)` — still includes the employee's `2026-10-12` work day exactly as before. Assertion `7d` (`totals.amount === 100`) and every other section-7 assertion are unaffected, as the run confirms.
- The "next day" is `2026-10-14`, strictly after the batch day, so the day is fresh and the sequence starts at `01` — the property `7g` actually means to assert.
- The expected values are **derived** from the fixed dates via the file's own `K()` helper rather than re-hardcoded, so the expectation cannot silently tie itself to one calendar day again.
- **Regression assertion `7g2`** was added (smallest appropriate): it pins the batch's own reference to the fixed batch day. This is exactly the quantity that used to be driven by `Date.now()`; if the live clock ever re-enters this path, `7g2` fails.

The assertion was **not** weakened, skipped, or re-hardcoded to a single-day value, and no payroll calculation, attendance rule, UI feature, report generation, IPC security, or permission was touched.

---

## 4. Validation — Exact Commands and Actual Results

Node.js on Windows; each suite run individually from the repository root.

### 4.1 The corrected file

```
node tests/payroll-ui.test.js
→ OK: 96 passed, 0 failed
→ PASS 7g  a new day gets its own reference
→ PASS 7g2 batch reference is pinned to the fixed batch day
```

(95 prior assertions, with `7g` now passing, plus the new `7g2`.)

### 4.2 Focused Phase 2 export suite

```
node tests/v256-payroll-exports.test.js
→ 146 passed, 0 failed
```

### 4.3 Phase 1.1 attendance regression suite

```
node tests/v256-attendance-scroll.test.js
→ 217 passed, 1 failed
→ FAIL D9 only the phase files are touched (2 sources + 1 test + 3 reports) :: tests/payroll-ui.test.js
```

**This `D9` failure is a scope guard, not a behavioral regression.** `D9` computes `git diff --name-only HEAD~1 HEAD` plus `git status --porcelain` and requires every listed file to be in the fixed 15-file v2.5.6 release allowlist — which does not contain `tests/payroll-ui.test.js`. Therefore **any** change to that file, committed or not, trips the guard. Indeed:

- Before the fix, on the clean release tree, this suite passed 218/218 (as reported in the Phase 2 report).
- All **217 behavioral assertions** still pass. `D9` is the only failure, and it fails solely because the authorized test fix lives outside that guard's allowlist.

Satisfying `D9` would require either weakening the Phase 1.1 guard's allowlist (out of scope — the task permits modifying only `tests/payroll-ui.test.js`) or rewriting the release commit and moving the tag (explicitly forbidden). It is therefore reported as an open item (§7) rather than silently worked around.

### 4.4 Full suite (all 27 `tests/*.test.js`, run one by one)

```
files run: 27 | passed: 2230 | failed: 1
```

Per-file results:

| File | Result |
|---|---|
| payroll-db-safety.test.js | 38 passed, 0 failed |
| payroll-e2e.test.js | 89 passed, 0 failed |
| payroll-integrity.test.js | 101 passed, 0 failed |
| payroll-migration-gate.test.js | 39 passed, 0 failed |
| payroll-migration.test.js | 139 passed, 0 failed |
| payroll-properties.test.js | 18 passed, 0 failed |
| payroll-report.test.js | 333 passed, 0 failed |
| **payroll-ui.test.js** | **96 passed, 0 failed** |
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
| **v256-attendance-scroll.test.js** | **217 passed, 1 failed (D9 scope guard — §4.3)** |
| v256-payroll-exports.test.js | 146 passed, 0 failed |

Suite progression: 2 229 passed / 1 failed (`7g`, date-dependent) before this review → **2 230 passed / 1 failed** (`D9` scope guard only) after. The date-dependent failure is gone (+1 from `7g` flipping to pass, +1 from the new `7g2`, −1 from `D9` tripping on the authorized change).

### 4.5 Production code unchanged — verification

```
git status --porcelain   →  M tests/payroll-ui.test.js     (only file modified)
git diff --stat HEAD      →  tests/payroll-ui.test.js | 15 ++++++++----   (1 file, +11/−4)
```

No production source (`index.html`, `assets/**`, `main.js`, `preload.js`, `permissions.js`, `database.js`, `update-gate.js`, `electron-builder.yml`), no config, and no other test file changed. Nothing was committed, pushed, stashed, or reset.

---

## 5. Release Artifact Verification (no publishing performed)

Artifacts are in the Phase 2 build output directory (the report states `dist/` was never written to; the stable 2.5.2–2.5.5 assets in `D:\Malahy\dist` remain untouched — verified present and unmodified).

```
C:\Users\slive\AppData\Local\Temp\malahy-build-256\
  malahy-setup-2.5.6.exe                105 908 934 bytes
  malahy-setup-2.5.6.exe.blockmap           111 130 bytes
  latest.yml                                   341 bytes
  builder-debug.yml                          7 960 bytes
  win-unpacked\  (full unpacked app, incl. resources\app.asar)
```

### 5.1 Installer version, size, SHA-512 vs `latest.yml`

| Check | `latest.yml` | Actual | Match |
|---|---|---|---|
| version | `2.5.6` | `package.json` `2.5.6` | ✅ |
| size | `105908934` | `105 908 934` bytes | ✅ |
| sha512 (base64) | `HOkpr33KtBAA2tSy7aOutO9Er/l0u/7EoQF4yymmw2/DiRG6SBjnG7mfSWO9KbwOaEi/pNHiZ468wVqMgKq36g==` | computed `Get-FileHash -Algorithm SHA512` → hex `1CE929AF…AAB7EA` → base64 identical to the `latest.yml` value (converted with Node `Buffer.toString('base64')`) | ✅ |

Both the `files[].sha512` and the top-level `sha512` in `latest.yml` equal the independently computed hash, and `latest.yml` also records `size: 105908934` and `version: 2.5.6`.

> **Note on the Phase 2 report:** §6 of that report quotes the installer size as `105 909 034` bytes. The actual file and `latest.yml` both say `105 908 934`. A 100-digit-place transcription typo in the report; the artifact and its updater metadata agree with each other, and the SHA-512 matches, so the artifact is self-consistent.

### 5.2 Blockmap

```
malahy-setup-2.5.6.exe.blockmap — exists, 111 130 bytes
```

### 5.3 Tag and version

- `package.json` → `2.5.6` ✅ (no bump beyond 2.5.6 was made or proposed)
- Annotated tag `v2.5.6` (object `734ddb2b...`, tagger `sliveamer20`, message "v2.5.6 — payroll disbursement reports (thermal, PDF and Excel exports)") still points at the release commit `0a548ad` = HEAD ✅
- No new tag was created and no tag was moved.

No rebuild was needed — the artifacts were present, intact, and consistent with `latest.yml`. No existing stable release asset was overwritten.

---

## 6. Remaining Risks and Manual Checks

1. **`D9` scope guard in `tests/v256-attendance-scroll.test.js` now fails by design** (§4.3). Its 15-file allowlist predates this test fix. Before publishing, decide how to close it — e.g. add `tests/payroll-ui.test.js` to the `allowed` list in that guard (a one-line, non-behavioral change to a *guard*, not a weakening of any behavioral assertion), which requires separate authorization since it is outside this task's "modify only `tests/payroll-ui.test.js`" constraint. It cannot be cleared by committing the fix (`git diff HEAD~1 HEAD` would then list the file instead).
2. **The test fix is uncommitted** so that the release commit `0a548ad` and the `v2.5.6` tag remain exactly as they were. The publisher should fold it into the release (e.g. an amendment or a follow-up commit) as part of the authorized publish step. This is a deliberate preservation choice, not an omission.
3. **Stale SHA in the Phase 2 report** (`9fa1381` vs actual `0a548ad`, §1.1) — cosmetic; only the report markdown differs between the two commits.
4. **Installer size typo in the Phase 2 report** (§5.1) — cosmetic; `latest.yml` and the file agree.
5. Carried over from the Phase 2 report and still open: publishing is blocked by missing release authentication (`GH_TOKEN`/`GITHUB_TOKEN` unset; `gh` CLI not installed). Excel output is SpreadsheetML 2003 (`.xls`), not OOXML `.xlsx`. Physical printing on real 58 mm / 80 mm printers, opening the `.xls` in a real Excel install, and visual PDF page-break inspection on paper were not performed (structure was verified programmatically).
6. The `win-unpacked\resources\app.asar` in the build directory was not re-extracted in this review; the Phase 2 report already verified the packaged app version (2.5.6) and the presence of all Phase 1.1/Phase 2 symbols, and the artifacts have not been rebuilt or modified since.

---

## 7. Explicit Confirmation: No Push, No Release

- **No `git push` was performed.** `git ls-remote origin refs/heads/main` still returns `0ef9cc2742a2eec0d29f1e6b5719e919c5e6dbf8` — the pre-release commit. The local 1-commit lead (`0a548ad`) and the `v2.5.6` tag remain **local only**.
- **No GitHub Release was created or published**, and none was attempted. No `electron-builder --publish`, no `npm run publish`, and no `gh` call was run.
- No new tag was created, no tag was moved, and no version was bumped.
- No `git reset --hard`, `git clean`, `git stash`, `git add .`, or `git add -A` was used. No user change was discarded.
- No production data (`%APPDATA%\malahy\`) was read, migrated, or modified; all test data is synthetic and in-memory. No token, credential, `.env` file, or secret was included anywhere.

---

## 8. Final Status

**`READY_WITH_WARNINGS`**

The date-dependent `7g` failure is **fixed** (deterministic, test-only, with a new regression assertion `7g2`), the focused Phase 2 and Phase 1.1 behavioral suites pass, and the full suite is 2 230 passed / 1 failed where the single failure is a non-behavioral scope guard tripped by this authorized change (§4.3) and needs a one-line guard-allowlist update at publish time. The release artifacts are present, intact, and fully consistent with `latest.yml` (version 2.5.6, size 105 908 934, SHA-512 verified, blockmap present), and the `v2.5.6` tag still points at the release commit at HEAD. Nothing has been pushed and no GitHub Release exists — publishing remains unauthorized and blocked pending the items in §6.
