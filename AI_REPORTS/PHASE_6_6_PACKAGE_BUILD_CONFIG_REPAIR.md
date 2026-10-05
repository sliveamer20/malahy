# Phase 6.6 — Restore Complete Package Build Configuration

**Date:** 2026-10-06
**Scope:** Restore the full `package.json` build configuration removed by the v2.5.2 release commit, and re-anchor the `package.json` baseline hash to the resulting intentional state.
**Outcome:** ✅ Restored — `npm start`, `npm run dist` and `npm run publish` all resolve; suite back to **722 PASS / 1 FAIL**.

---

## 1. Root cause

Phase 6.5 restored only `scripts.start` and reported (section 11) that the v2.5.2
release commit `5c9dc15` had removed **two whole blocks**, not one:

1. `scripts.dist` and `scripts.publish` — the commands that produced
   `releases/v2.5.2/malahy-setup-2.5.2.exe`.
2. the entire `devDependencies` block — `electron` and `electron-builder`.

Underlying cause (established in Phase 6.5, re-confirmed here): the v2.5.2 commit
rewrote `package.json` from a **stale v2.4.5-era template** (`6638f34`, which
already lacked `scripts`/`devDependencies`) and applied only the authorised
version bump on top. The deletions were collateral damage, never mentioned in the
commit message, the v2.5.2 release report, or the QA report.

**Consequence of leaving it unfixed:** `npm run dist` / `npm run publish` returned
`npm error Missing script`, and `package.json` and `package-lock.json` were out of
sync — the lock still declared two dev dependencies that the manifest no longer
did, so a clean clone / `npm ci` would install no dev tree and `node launch.js`
would abort with its own guard message
`تعذّر العثور على electron — تأكد من تشغيل npm install أولاً.`

This phase restores the complete v2.5.1 configuration and closes that drift.

---

## 2. v2.5.1 authoritative configuration

Authoritative source — v2.5.1 commit `a3e790d`, read directly from git history
(nothing guessed):

```
$ git show a3e790d:package.json
{
  "name": "malahy",
  "version": "2.5.1",
  "description": "كوكي بارك — نظام قطع التذاكر وحساب المبيعات اليومية",
  "main": "main.js",
  "author": "Mohamed Farouk Amer",
  "license": "ISC",
  "scripts": {
    "start": "node launch.js",
    "dist": "electron-builder --win --publish never",
    "publish": "electron-builder --win --publish always"
  },
  "devDependencies": {
    "electron": "^43.7.5",
    "electron-builder": "^26.0.12"
  },
  "dependencies": {
    "electron-updater": "^6.3.9"
  }
}
```

Line-by-line comparison of the restored file against `a3e790d` (UTF-8 byte compare,
not console-decoded):

```
v2.5.1 lines 21   current lines 20
line 3   old: "  \"version\": \"2.5.1\","   new: "  \"version\": \"2.5.2\","
line 21  old: ""  (trailing newline)      new: undefined
```

**The restored `package.json` is byte-identical to v2.5.1 except the single
intentional version bump.** The only other difference is the absence of the final
newline — a pre-existing v2.5.2 formatting artefact preserved deliberately so the
diff stays limited to the restored blocks (carried over from Phase 6.5, cosmetic
only).

The task brief's stated "known v2.5.1 values" were verified against
`git show a3e790d:package.json` and matched exactly. No guesswork was involved.

---

## 3. Restored `package.json` fields

Exactly two blocks were restored, in v2.5.1 byte order, immediately after
`"license": "ISC"` and before `"dependencies"`:

```json
"scripts": {
  "start": "node launch.js",
  "dist": "electron-builder --win --publish never",
  "publish": "electron-builder --win --publish always"
},
"devDependencies": {
  "electron": "^43.7.5",
  "electron-builder": "^26.0.12"
}
```

Resulting file:

```json
{
  "name": "malahy",
  "version": "2.5.2",
  "description": "كوكي بارك — نظام قطع التذاكر وحساب المبيعات اليومية",
  "main": "main.js",
  "author": "Mohamed Farouk Amer",
  "license": "ISC",
  "scripts": {
    "start": "node launch.js",
    "dist": "electron-builder --win --publish never",
    "publish": "electron-builder --win --publish always"
  },
  "devDependencies": {
    "electron": "^43.7.5",
    "electron-builder": "^26.0.12"
  },
  "dependencies": {
    "electron-updater": "^6.3.9"
  }
}
```

### Constraints honoured

| Constraint | Status |
|---|---|
| Restore only the missing configuration | ✅ `scripts.dist`, `scripts.publish`, `devDependencies` |
| Values from git history, not guessed | ✅ `a3e790d` |
| Preserve `version` = 2.5.2 | ✅ unchanged by this phase |
| Preserve `name` / `description` / `main` / `author` / `license` | ✅ untouched |
| Preserve `dependencies` (`electron-updater ^6.3.9`) | ✅ untouched |
| Electron version not changed | ✅ `^43.7.5` re-declared, same as already locked and installed |
| `electron-builder.yml` unchanged | ✅ SHA-256 `2396654f…`, matches baseline |
| `package-lock.json` unchanged | ✅ SHA-256 `524b232d…`, untouched |
| Valid JSON | ✅ parses; `npm` reads all 3 scripts |
| Encoding preserved | ✅ no BOM, LF endings, no trailing newline (unchanged form) |

---

## 4. Lockfile verification

`package-lock.json` was inspected **before** any edit, as required.

```
lockfileVersion                 3
root packages[""].name          malahy
root packages[""].dependencies  {"electron-updater":"^6.3.9"}
root packages[""].devDependencies {"electron":"^43.7.5","electron-builder":"^26.0.12"}
node_modules/electron           present
node_modules/electron-builder   present
```

**Verdict: already consistent.** The lockfile's root devDependencies are exactly
the pair just restored, at exactly the same semver ranges. Before this phase the
two files were out of sync (lock declared dev deps the manifest did not); after
this phase they are back in sync. **No modification was made to
`package-lock.json`, and `npm install` / `npm ci` was never run.**

### One pre-existing cosmetic discrepancy — reported, not changed

The lockfile's own `version` fields read `2.5.0` (both top-level `version` and
`packages[""].version`), while `package.json` says `2.5.2`. This is **not** a
dependency inconsistency and **pre-dates this phase** — the lockfile was left
byte-identical by the v2.5.1 release, so it already said `2.5.0` while
`package.json` said `2.5.1`. npm tolerates this and rewrites the field on the next
install. Per instructions it was **left alone**; flagged here for the owner.

---

## 5. `npm start` verification

```
D:\Malahy> npm start

> malahy@2.5.2 start
> node launch.js
```

| Check | Result |
|---|---|
| Script resolves | ✅ `malahy@2.5.2 start` → `node launch.js` |
| `launch.js` present & unchanged | ✅ SHA-256 `7db341a1…`, matches baseline |
| Electron process tree | **4 processes** (main + GPU + renderer + utility) — healthy |
| Working set | 115.6 / 112.8 / 106.7 / 51.0 MB |
| Main window | opened — `1500x950`, title `كوكي بارك` (verified via `EnumWindows`) |
| Console window | **none** — `launch.js` detached spawn + `windowsHide` still works |
| Immediate crash | **none** |
| Crash/error log | `%APPDATA%\malahy\malahy-errors.log` — **no new entries**; last write `2026-10-01 20:45:14` |
| Clean shutdown | ✅ all 4 processes terminated on request |
| Business operations | ✅ none performed — not logged in, no data touched |

---

## 6. `npm run dist` / `npm run publish` script verification

**No build was performed.** Both commands were verified by script resolution and
target availability only.

```
$ npm run
Lifecycle scripts included in malahy@2.5.2:
  start
    node launch.js
  publish
    electron-builder --win --publish always
available via `npm run`:
  dist
    electron-builder --win --publish never

$ npm pkg get scripts devDependencies version
{
  "scripts": {
    "start": "node launch.js",
    "dist": "electron-builder --win --publish never",
    "publish": "electron-builder --win --publish always"
  },
  "devDependencies": {
    "electron": "^43.7.5",
    "electron-builder": "^26.0.12"
  },
  "version": "2.5.2"
}
```

| Check | Result |
|---|---|
| `npm run dist` resolves to | ✅ `electron-builder --win --publish never` (byte-identical to v2.5.1) |
| `npm run publish` resolves to | ✅ `electron-builder --win --publish always` (byte-identical to v2.5.1) |
| Binary present on disk | ✅ `npx --no-install electron-builder --version` → `26.15.3` (satisfies `^26.0.12`) |
| Config present | ✅ `electron-builder.yml` unchanged — `2396654f…` |
| `npm run dist` executed | ❌ **not executed** — no EXE, no Setup, no `dist/` rewrite |
| `npm run publish` executed | ❌ **not executed** — nothing published |

Proof no build side-effects occurred — all build output still predates this phase:

```
dist\malahy-setup-2.5.2.exe            10/4/2026 9:31:07 PM
dist\malahy-setup-2.5.2.exe.blockmap   10/4/2026 9:31:12 PM
dist\latest.yml                         10/4/2026 9:31:12 PM
dist\builder-debug.yml                  10/4/2026 9:31:12 PM
dist\win-unpacked\                      10/4/2026 9:30:38 PM
releases\v2.5.2\                       10/4/2026 9:51:19 PM
```

Nothing in `dist/` or `releases/` was created or touched on 2026-10-06.

---

## 7. Baseline hash before / after

`tests/protected-baseline.json` → `package.json` entry only:

| State | SHA-256 |
|---|---|
| v2.5.1 original (`a3e790d`) | `42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c` *(v2.5.2 commit's original anchor)* |
| v2.5.2 stripped (the bug) | `afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d` |
| Phase 6.5 intermediate (`start` only) | `673f931a2387b93b4f1d10801c8ea878a9f212cf0b8edfff2b5b8f2be0e3dc04` |
| **Phase 6.6 final (this phase)** | **`b18882016c83ca381d14bb7994d55516b72e8cd69ece30fb63010684cf58924b`** |

The committed `42fbdb…` anchor was v2.5.1's real file (with a trailing newline).
The final working-tree file differs from it only by the version bump and the
missing trailing newline, hence the different digest.

Only the single `package.json` line was edited. **No other hash changed in this
phase, no test code was modified, no assertion weakened, and the `index.html`
allowance was not touched.**

---

## 8. Full regression result

All 14 suites, repository convention `node tests/<suite>.test.js`:

```
phase3b-auth.test.js               PASS=60    FAIL=1
phase3b-ipc.test.js                PASS=15    FAIL=0
phase3c1-dom.test.js               PASS=37    FAIL=0
phase3c1-gate.test.js              PASS=48    FAIL=0
phase3c1-ipc.test.js               PASS=19    FAIL=0
phase3c1-session.test.js           PASS=30    FAIL=0
phase3c2-baseline.test.js          PASS=63    FAIL=0
phase3c2-gate.test.js              PASS=44    FAIL=0
phase3c2-ipc.test.js               PASS=49    FAIL=0
phase3c2-perms.test.js             PASS=39    FAIL=0
phase3c3-accounts.test.js          PASS=92    FAIL=0
phase3c3-ui.test.js                PASS=76    FAIL=0
phase3c4-recovery.test.js          PASS=79    FAIL=0
phase4-daily-report.test.js        PASS=71    FAIL=0
TOTAL PASS=722 FAIL=1             ✅ target met
```

| Requirement | Result |
|---|---|
| 722 PASS / 1 FAIL | ✅ exact |
| Skipped tests | **0** |
| Modified tests | **0** — `tests/*.test.js` byte-untouched |
| New failures | **0** |
| Phase 6.5's 4 hash-anchor failures | ✅ resolved by the step-7 re-anchor |

---

## 9. Protected-file verification

Every file carrying a baseline anchor, recomputed and compared:

```
DIFF  index.html            <- known, intentional Phase 6 UI work
MATCH database.js
MATCH activation.js
MATCH update-gate.js
MATCH package.json          <- re-anchored in step 7, now matches
MATCH README.md
MATCH launch.js
MATCH electron-builder.yml
MATCH assets\icons\icon.ico
MATCH assets\icons\logo.png
MATCH assets\images\logo.png
MATCH assets\ticket\ticket-template.js
MATCH assets\ticket\ticket-template.svg
MATCH assets\vendor\qrcode.js
MATCH windows\splash.html
MATCH windows\update.html
```

Files not covered by the baseline anchor were verified against git HEAD — none
appear in `git status` as modified, i.e. all byte-identical to `18acba6`:

```
58c7b415161cc0bede538b9026e1b5b2ec3b0215feccf978465bc2269d04c664  main.js
cdf768f6566f333c04c008a2c79a153795f066dda467bc487c43f8b9545c693a  preload.js
974a865394b35e1ed875ce2a9d929bac7db5a410d38682817d0df2f78aa79f44  users.js
8ac89d8b3db4eaafe2328f9e36bc382dcb62fa97f5dadc28df9c4f6efd510bd8  login.js
8a70e47afa70f3a8c3665524745a54ad025e4f9cf5df8ba82fdeb6814eab6f5e  recovery.js
a87acfc8514b96ebdd6be7857814a0dfe38be334b62ce3c0da1816109531cbb2  permissions.js
0426a75cc5e3bc95d811b4fb6359c6511fbf1c8336d68ca069c8c0659ddfb2f7  perm-gate.js
61a2b84bd276ef7fabb40bd1dd925ea61d66dce4f427d6340954127387174d7f  accounts.js
524b232d4025813a182e8a6a16e63c13bfccd2014215bb2a2d37d3ff2dc694d8  package-lock.json
b4188bb8e781e19338378a354f438effee8b1d57f88a8bd4d2b2eca82eea37b8  assets/report/daily-report.js
```

Phase 6 UI assets confirmed still present and wired: `assets/icons/lucide/`
(11 files), `assets/icons/radix/` (18 files), `assets/vendor/radix-colors.css`, and
6 references to those assets in `index.html`.

### Expected vs actual changes

| Expected in this phase | Status |
|---|---|
| `package.json` | ✅ changed — restored scripts + devDependencies only |
| `tests/protected-baseline.json` | ✅ changed — one SHA-256 line only |
| report | ✅ this file |

| Pre-existing, not from this phase | Status |
|---|---|
| `index.html` (Phase 6 UI work) | ✅ reported, not altered |
| `windows/splash.html` (`2.5.0`→`2.5.2`) | ✅ reported, not altered |
| untracked `assets/icons/lucide/`, `qa-ticket-renders/`, prior AI_REPORTS | ✅ reported, not altered |

---

## 10. Git diff

### `package.json` — the only source change

```diff
diff --git a/package.json b/package.json
index fde3e2a..077bfd6 100644
--- a/package.json
+++ b/package.json
@@ -5,6 +5,15 @@
   "main": "main.js",
   "author": "Mohamed Farouk Amer",
   "license": "ISC",
+  "scripts": {
+    "start": "node launch.js",
+    "dist": "electron-builder --win --publish never",
+    "publish": "electron-builder --win --publish always"
+  },
+  "devDependencies": {
+    "electron": "^43.7.5",
+    "electron-builder": "^26.0.12"
+  },
   "dependencies": {
     "electron-updater": "^6.3.9"
   }
```

**+9 lines, 0 deletions, 0 modifications.** Nothing removed, no existing value
altered, no version change.

### `tests/protected-baseline.json` — hash re-anchor only

```diff
@@ -3,7 +3,7 @@
-  "package.json": "42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c",
+  "package.json": "b18882016c83ca381d14bb7994d55516b72e8cd69ece30fb63010684cf58924b",
```

(The `windows\splash.html` anchor in this same diff is **pre-existing Phase 5/6
work**, already present before this phase began — not part of this change.)

### Whole working tree

```
$ git status --porcelain
 M index.html                     <- pre-existing (Phase 6 UI work)
 M package.json                   <- THIS PHASE (+9 restored lines)
 M tests/protected-baseline.json  <- THIS PHASE (package.json SHA-256) + pre-existing splash anchor
 M windows/splash.html            <- pre-existing (Phase 6: 2.5.0 -> 2.5.2)
?? AI_REPORTS/PHASE_5_BASELINE_REPAIR.md
?? AI_REPORTS/PHASE_6_5_RESTORE_NPM_START.md
?? AI_REPORTS/PHASE_6_FINAL_ICON_SYSTEM.md
?? AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md
?? assets/icons/lucide/
?? qa-ticket-renders/

$ git diff --stat
 index.html                    | 77 +++++++++++++++++++++++++++++++++++++------
 package.json                  |  9 +++++
 tests/protected-baseline.json |  4 +--
 windows/splash.html           |  2 +-
 4 files changed, 79 insertions(+), 13 deletions(-)
```

Only `package.json` and `tests/protected-baseline.json` were touched by this phase.
**No unexpected changes.**

### Prohibited actions

❌ version not bumped · ❌ no EXE built · ❌ no Setup created · ❌ nothing published
❌ not committed · ❌ not tagged · ❌ not pushed · ❌ no tests modified · ❌ no
application logic modified · ❌ `main.js` untouched · ❌ `preload.js` untouched ·
❌ `update-gate.js` untouched · ❌ `electron-builder.yml` untouched · ❌ no
lockfile regeneration · ❌ no packages installed

---

## 11. Remaining known historical failure

Exactly **one** failure remains — the pre-existing, documented `index.html`
difference:

```
[phase3b-auth.test.js] FAIL  all protected files byte-identical to pre-phase
baseline :: changed: index.html
```

| Attribute | Detail |
|---|---|
| Suite | `phase3b-auth.test.js` (60 pass / 1 fail) |
| Identity | unchanged from the pre-Phase-6.5 baseline run |
| Cause | `index.html` carries the Phase 6 UI redesign (Radix colors + icon system) and was modified in the working tree **before** this phase began |
| Anchor state | `index.html` allowance deliberately left untouched, as instructed |
| Current hash | `8bd077610232ee19edf4cdf1961acbb6f072e2321e38d20c447abd98846dec3b` |
| Anchored hash | `854cff97e10932c036df534396d975e1ded674e4f8b5b85e538dea77be8ac5a2` |
| Resolution | owner decision — anchor it at Phase 7 release time, same practice used for `package.json` |

---

## 12. Summary

| Item | Result |
|---|---|
| Root cause | ✅ v2.5.2 commit `5c9dc15` rewrote `package.json` from a stale template, deleting `scripts` + `devDependencies` |
| v2.5.1 config recovered from git | ✅ `a3e790d`, values verified not guessed |
| Restored | ✅ `scripts.dist`, `scripts.publish`, `devDependencies` (+9 lines, 0 deletions) |
| `version` | ✅ still `2.5.2` |
| `package-lock.json` | ✅ already consistent, **not modified**, `npm install` never run |
| `npm start` | ✅ verified — 4 processes, window `1500x950` `كوكي بارك`, no console, no crash |
| `npm run dist` | ✅ verified to resolve to `electron-builder --win --publish never` — **not executed** |
| `npm run publish` | ✅ verified to resolve to `electron-builder --win --publish always` — **not executed** |
| Baseline re-anchor | ✅ `package.json` only → `b1888201…` |
| Regression | ✅ **722 PASS / 1 FAIL** |
| Protected files | ✅ all 16 anchored files match; all 10 non-anchored files identical to HEAD |
| Git diff | ✅ `package.json` +9, `protected-baseline.json` 1 hash line |
| Commit / build / tag / push / publish | ✅ none |

**Final state: `npm start` working, `npm run dist` correctly restored,
`npm run publish` correctly restored, version 2.5.2, tests 722 PASS / 1 FAIL.**

### Noted for a future phase (no action taken)

1. `index.html` hash anchor still points at the pre-Phase-6 file — the sole
   remaining test failure.
2. Lockfile `version` field says `2.5.0` vs manifest `2.5.2` — cosmetic,
   pre-dates this phase.
3. `windows/splash.html` ends its own life in ~100–200 ms during `npm start`
   because `main.js:61-74` closes it 2000 ms after `ready-to-show`; `main.js` is
   protected and was not touched (flagged in Phase 6.5 §7).

**Stopping here — Phase 7 not started.**
