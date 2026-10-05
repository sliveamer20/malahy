# Phase 6.5 — Restore Original `npm start` Launch Command

**Date:** 2026-10-05
**Scope:** Restore the original `npm start` development launch command for Malahy.
**Outcome:** ✅ Restored — `npm start` launches the Malahy Electron application again.

---

## 1. Original `npm start` command

```json
"scripts": {
  "start": "node launch.js"
}
```

**Exact original value of `scripts.start`: `node launch.js`**

Note: the original was **never** `electron .` or `npx electron .`. It has been
`node launch.js` since commit `c9ab8a1` (v2.4.7, "console-free launcher"). The
console-free wrapper `launch.js` resolves the Electron binary via
`require("electron")` and spawns it **detached** with `stdio: "ignore"` and
`windowsHide: true`, so no cmd/conhost window stays open behind the app
(`launch.js:11-32`).

---

## 2. Where it was found in git history

The command was recovered from history, not guessed. `package.json` exists in 9
commits; each revision was inspected:

| Commit | Release | `scripts.start` | `scripts` block | `devDependencies` |
|---|---|---|---|---|
| `80adb1b` | First version (2.0.0) | `electron .` | present | present |
| `6638f34` | 2.4.5 | **absent** | **absent** | **absent** |
| `763da09` | 2.4.6 | `electron .` | present | present |
| `c9ab8a1` | 2.4.7 | `node launch.js` | present | present |
| `3a781f3` | 2.4.8 | `node launch.js` | present | present |
| `8596135` | 2.4.9 | `node launch.js` | present | present |
| `5388949` | 2.5.0 | `node launch.js` | present | present |
| **`a3e790d`** | **v2.5.1** | **`node launch.js`** | **present** | **present** |
| `5c9dc15` | v2.5.2 | **absent** | **absent** | **absent** |

**Authoritative source for the restoration — v2.5.1 (`a3e790d`):**

```
$ git show a3e790d:package.json
  "scripts": {
    "start": "node launch.js",
    "dist": "electron-builder --win --publish never",
    "publish": "electron-builder --win --publish always"
  },
  "devDependencies": {
    "electron": "^43.7.5",
    "electron-builder": "^26.0.12"
  },
```

`README.md:67` independently documents `npm start` as the official development
launch command, and `launch.js:3` describes `npm start` as its raison d'être.

---

## 3. Why it disappeared

The `scripts` block was deleted in the **v2.5.2 release commit `5c9dc15`**
("release: v2.5.2 UI redesign (Radix colors + icons)"). That commit's message
states the *only* authorised non-UI edit was the version bump
`2.5.1 → 2.5.2`. The diff proves more was removed:

```diff
--- a/package.json
+++ b/package.json
@@ -1,20 +1,11 @@
   "name": "malahy",
-  "version": "2.5.1",
+  "version": "2.5.2",
   ...
   "license": "ISC",
-  "scripts": {
-    "start": "node launch.js",
-    "dist": "electron-builder --win --publish never",
-    "publish": "electron-builder --win --publish always"
-  },
-  "devDependencies": {
-    "electron": "^43.7.5",
-    "electron-builder": "^26.0.12"
-  },
   "dependencies": {
     "electron-updater": "^6.3.9"
   }
-}
+}
\ No newline at end of file
```

**Root cause:** the v2.5.2 release rewrote `package.json` from a stale v2.4.5-era
template (commit `6638f34` was already missing `scripts`/`devDependencies`) and
applied only the version bump on top. The loss was **collateral damage, not a
deliberate design decision** — it was not mentioned anywhere in the commit
message, the v2.5.2 release report, or the QA report. The release commit even
lists `launch.js` as a *protected, byte-identical* file, which is only
meaningful while `scripts.start` still points at it.

**Confirmation this was an unintended regression:** `npm start` was **verified
working before this change** in the Phase 2C report
(`UI_REDESIGN_PHASE_2C_RADIX_UI_BATCH.md:477`), which describes `npm start` as
the existing launch method — while that report was written, `scripts.start` was
still present.

---

## 4. Exact restoration

**Only `package.json` → `scripts.start` was restored. Nothing else was touched.**

Inserted immediately after `"license": "ISC",` and before `"dependencies"`,
reproducing the v2.5.1 command verbatim:

```json
{
  "name": "malahy",
  "version": "2.5.2",
  "description": "كوكي بارك — نظام قطع التذاكر وحساب المبيعات اليومية",
  "main": "main.js",
  "author": "Mohamed Farouk Amer",
  "license": "ISC",
  "scripts": {
    "start": "node launch.js"
  },
  "dependencies": {
    "electron-updater": "^6.3.9"
  }
}
```

### Constraints honoured

| Constraint | Status |
|---|---|
| Restore the exact original command | ✅ `node launch.js`, byte-identical to `a3e790d` |
| Do not invent a new command | ✅ taken from git history |
| Do not replace with `npx electron .` | ✅ not used |
| Do not change dependencies | ✅ `dependencies` untouched |
| Do not change Electron version | ✅ no version fields touched |
| Do not change package version | ✅ still `2.5.2` |
| Do not change build configuration | ✅ `electron-builder.yml` untouched |
| Do not change `main.js` | ✅ untouched |
| Do not change `preload.js` | ✅ untouched |
| File encoding preserved | ✅ no BOM, LF endings, still no trailing newline |

---

## 5. Launch result

```
D:\Malahy> npm start

> malahy@2.5.2 start
> node launch.js
```

`npm start` now resolves and executes. Previously:

```
npm error Missing script: "start"
```

---

## 6. Electron runtime result

| Check | Result |
|---|---|
| npm exit code | `0` |
| Electron process tree | **4 processes** (main + GPU + renderer + utility) — healthy |
| Working set | 106.5 / 113.7 / 50.8 / 113.6 MB |
| Main window | opened — `1500x950`, title `كوكي بارك` (verified via `EnumWindows`) |
| Console window | none — `launch.js` detached + `windowsHide` works as designed |
| Immediate crash | **none** |
| Crash/error log | `%APPDATA%\malahy\malahy-errors.log` — **no new entries** dated 2026-10-05; last entry is 2026-10-01 |
| Still alive after launch | yes, 4 processes sustained |

No business operations were performed — the app was **not** logged into and no
data was touched.

---

## 7. Splash result

`windows/splash.html` is intact, contains **no JavaScript**, and its version
line reads:

```html
179:  <div class="version">الإصدار <span>2.5.2</span></div>
```

(the working-tree change `2.5.0 → 2.5.2` is a pre-existing Phase 6 edit, not part
of this phase).

**Rendering verified.** `windows/splash.html` was rendered in an isolated
Electron probe placed outside the repository (since removed). It displays the
logo, `كوكي بارك`, `نظام إدارة الألعاب والمبيعات`, the progress bar,
`جارى التحميل...`, and **`الإصدار 2.5.2`** — confirmed visually.

**Observation on-screen lifetime during `npm start`.** High-rate screen
sampling (down to ~60 ms intervals, plus a 25 ms `EnumWindows` poll over 14 s)
recorded the splash window being mapped with its solid `backgroundColor`
`#181126` (measured signature `821600` = exactly `#181126` over a full 520x320
centre crop) immediately before the login window replaced it — i.e. the splash
**does** appear, but only for roughly 100–200 ms on this machine.

Cause (pre-existing, **not** introduced by this phase): `main.js:61-74` closes
the splash 2000 ms after the main window's `ready-to-show`, and the splash
window is not composited on screen until close to that moment. `main.js` is a
protected, baseline-anchored file and was **not** modified. Flagged for a future
phase; **no action taken here**.

---

## 8. Phase 6 UI files present

| Item | Status |
|---|---|
| `assets/icons/lucide/` | ✅ 11 files (`clock`, `image`, `palette`, `printer`, `receipt`, `refresh-cw`, … + LICENSE, README) |
| `assets/icons/radix/` | ✅ 18 files |
| `assets/vendor/radix-colors.css` | ✅ referenced 2× from `index.html` |
| `assets/icons/radix/` refs in `index.html` | ✅ 2 |
| `assets/icons/lucide/` refs in `index.html` | ✅ 2 |
| `activation.js` refs in `index.html` | ✅ 3 (gate order intact) |

Login screen confirmed rendering with the Phase 6 styling: Radix navy gradient
card, cyan focus ring, `admin` prefill, masked password, `تسجيل الدخول` button,
`نسيت كلمة المرور؟` recovery link, footer `كوكي بارك — نظام التذاكر اليومية`.

---

## 9. Regression result

Method: the repository's own convention — `node tests/<suite>.test.js`, 14
suites, plain Node, **no framework and no dependency added**. The full suite was
run **before** the change (to establish the baseline empirically) and again
**after**.

### Before the change — baseline confirmed

```
phase3b-auth.test.js               PASS=60   FAIL=1
phase3b-ipc.test.js                PASS=15   FAIL=0
phase3c1-dom.test.js               PASS=37   FAIL=0
phase3c1-gate.test.js              PASS=48   FAIL=0
phase3c1-ipc.test.js               PASS=19   FAIL=0
phase3c1-session.test.js           PASS=30   FAIL=0
phase3c2-baseline.test.js          PASS=63   FAIL=0
phase3c2-gate.test.js              PASS=44   FAIL=0
phase3c2-ipc.test.js               PASS=49   FAIL=0
phase3c2-perms.test.js             PASS=39   FAIL=0
phase3c3-accounts.test.js          PASS=92   FAIL=0
phase3c3-ui.test.js                PASS=76   FAIL=0
phase3c4-recovery.test.js          PASS=79   FAIL=0
phase4-daily-report.test.js        PASS=71   FAIL=0
TOTAL PASS=722 FAIL=1              ✅ expected baseline reproduced exactly
```

### After the change

```
TOTAL PASS=718 FAIL=5
```

### The 4 new failures — one single root cause, fully explained

```
phase3c1-gate.test.js    FAIL  protected file unchanged: package.json
phase3c1-gate.test.js    FAIL  all protected baseline files intact (except the intended index.html)
phase3c2-baseline.test.js FAIL  protected file unchanged: package.json
phase3c2-baseline.test.js FAIL  all protected baseline files intact (except the intended index.html)
```

`tests/protected-baseline.json` pins a SHA-256 for `package.json`. The v2.5.2
release commit **re-anchored that hash to the stripped file**:

```
anchored (v2.5.2, stripped) : afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d
after restoration           : 673f931a2387b93b4f1d10801c8ea878a9f212cf0b8edfff2b5b8f2be0e3dc04
```

Any edit to `package.json` — including the *correct* restoration of a deleted
script — necessarily invalidates a byte-hash anchor on that file. The 2
assertions fail once each in 2 suites = 4 failures, plus 2 mirror assertions for
the aggregate check.

**This is an unavoidable, mechanical consequence of the restoration — not a
defect in the restored script and not a functional regression.** No application
behaviour is affected: `main.js`, `preload.js`, `database.js`, `users.js`,
`login.js`, `recovery.js`, `permissions.js`, `perm-gate.js`, `activation.js`,
`update-gate.js`, `accounts.js`, `launch.js` and every other protected file are
untouched and still hash-identical.

The 5th failure is the **pre-existing, documented** historical failure, unchanged
in identity:

```
FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html, package.json
```

(`index.html` was already modified in the working tree by the Phase 6 UI work
before this phase began; `package.json` is this phase's intended change.)

### Per instruction, nothing was done about it

- ❌ tests **not** modified
- ❌ `tests/protected-baseline.json` **not** modified
- ❌ **no** re-anchoring performed
- ❌ no assertion weakened, skipped or removed

> **Decision required from the owner.** Restoring `npm start` and keeping the
> `package.json` hash anchor simultaneously satisfiable are mutually exclusive.
> Re-anchoring `package.json` to `673f931a…` would return the suite to
> **722 PASS / 1 FAIL** and is the same practice the v2.5.1 and v2.5.2 releases
> already used for this file. It was deliberately **not** done here because this
> phase forbids re-anchoring. Awaiting explicit instruction.

---

## 10. Git diff

### `package.json` — the only change made in this phase

```diff
diff --git a/package.json b/package.json
index fde3e2a..f9056ee 100644
--- a/package.json
+++ b/package.json
@@ -5,6 +5,6 @@
   "main": "main.js",
   "author": "Mohamed Farouk Amer",
   "license": "ISC",
+  "scripts": {
+    "start": "node launch.js"
+  },
   "dependencies": {
     "electron-updater": "^6.3.9"
   }
```

**+3 lines, 0 deletions. Nothing removed, nothing else altered.**

### Whole working tree

```
$ git status --porcelain
 M index.html                     <- pre-existing (Phase 6 UI work)
 M package.json                   <- THIS PHASE (scripts.start restored)
 M tests/protected-baseline.json  <- pre-existing (Phase 5 baseline re-anchor)
 M windows/splash.html            <- pre-existing (Phase 6: 2.5.0 -> 2.5.2)
?? AI_REPORTS/PHASE_5_BASELINE_REPAIR.md
?? AI_REPORTS/PHASE_6_FINAL_ICON_SYSTEM.md
?? AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md
?? assets/icons/lucide/
?? qa-ticket-renders/

$ git diff --stat
 index.html                    | 77 +++++++++++++++++++++++++++++++++++++------
 package.json                  |  3 ++
 tests/protected-baseline.json |  4 +--
 windows/splash.html           |  2 +-
 4 files changed, 73 insertions(+), 13 deletions(-)
```

`git status` was captured **before** this phase began and showed
`index.html`, `tests/protected-baseline.json` and `windows/splash.html` already
modified with `package.json` **clean**. Only `package.json` was touched here, so
the three pre-existing modifications are unrelated Phase 5/6 work and are
**reported, not altered**.

### Prohibited actions

❌ not committed · ❌ not built · ❌ not tagged · ❌ not pushed · ❌ no release

---

## 11. Other `package.json` discrepancies (reported, NOT changed)

The v2.5.2 commit deleted **two whole blocks**, not just `scripts.start`. Per
instruction, only `scripts.start` was restored. These remain outstanding and
**require the owner's decision**:

### 11.1 `scripts.dist` and `scripts.publish` are still missing

```
npm run dist     -> npm error Missing script: "dist"
npm run publish  -> npm error Missing script: "publish"
```

Original v2.5.1 values:

```json
"dist": "electron-builder --win --publish never",
"publish": "electron-builder --win --publish always"
```

These are the commands that produced
`releases/v2.5.2/malahy-setup-2.5.2.exe`. They are currently unreachable.
`UI_REDESIGN_PHASE_2B8_RADIX_ICON_AUDIT.md:674` records `npm run dist` /
`npm run publish` as existing commands.

### 11.2 `devDependencies` is still missing

```json
"devDependencies": {
  "electron": "^43.7.5",
  "electron-builder": "^26.0.12"
}
```

**Impact today: none.** `node_modules/electron` and
`node_modules/electron-builder` are present on disk (installed under an earlier
`package.json`), so `require("electron")` in `launch.js:16` resolves and
`npm start` works — verified.

**Impact on a clean clone / `npm ci`: real.** `package-lock.json` was left
**byte-identical** by the v2.5.2 release and still declares `electron` and
`electron-builder` as dev dependencies, while `package.json` no longer declares
them — the two files are now **out of sync**. `npm ci` would not install the dev
tree, and `node launch.js` would then fail with its own guard message:
`تعذّر العثور على electron — تأكد من تشغيل npm install أولاً.`

Restoring `devDependencies` would **not** change the Electron version — it would
re-declare the exact `^43.7.5` already locked in `package-lock.json` and
installed on disk. It was left untouched because this phase forbids changing
dependencies.

### 11.3 Trailing-newline / formatting

The v2.5.2 commit dropped the trailing newline (`\ No newline at end of file`).
The restoration preserves the current no-trailing-newline form to keep the diff
to exactly the 3 added lines. Cosmetic only.

### 9.4 Verified intact

- ✅ `version` still `2.5.2`
- ✅ `main` still `main.js`
- ✅ `dependencies` unchanged (`electron-updater ^6.3.9`)
- ✅ `electron-builder.yml` unchanged — SHA-256 `2396654f…`, matches baseline
- ✅ `package-lock.json` unchanged
- ✅ `main.js`, `preload.js`, `database.js` unchanged — all baseline hashes match
- ✅ `update-gate.js` `FLOOR_VERSION` still `2.5.1`
- ✅ `launch.js` unchanged — SHA-256 `7db341a1…`, matches baseline

---

## 12. Summary

| Item | Result |
|---|---|
| Original command identified from git | ✅ `node launch.js` (v2.5.1, `a3e790d`) |
| Cause of disappearance | ✅ v2.5.2 commit `5c9dc15` overwrote `package.json` from a stale template |
| Restoration | ✅ `scripts.start` only, exact original command |
| `npm start` launches app | ✅ verified |
| Electron runtime | ✅ 4 processes, window `1500x950` `كوكي بارك`, no crash, no new log entries |
| Splash | ✅ renders, displays **2.5.2** |
| Phase 6 UI files | ✅ present (lucide 11, radix 18, radix-colors wired) |
| Regression | ⚠️ **718 PASS / 5 FAIL** — 4 from the `package.json` hash anchor (re-anchoring forbidden), 1 pre-existing |
| Tests / baseline file | ✅ untouched, nothing re-anchored |
| git diff | ✅ `package.json` +3 lines only |
| Commit / build / tag / push | ✅ none |

**`npm start` is restored and fully functional.**

**Two items await the owner's decision:**
1. Re-anchor `package.json` in `protected-baseline.json` to `673f931a…` to
   return the suite to 722 PASS / 1 FAIL (forbidden in this phase).
2. Restore `scripts.dist`, `scripts.publish` and `devDependencies`, which the
   same v2.5.2 commit also removed (out of scope for this phase).

**Stopping here — Phase 7 not started.**
