# FINAL RELEASE REPORT — Malahy v2.5.2

**Status: RELEASED AND PUBLISHED** — 2026-10-04

The verified Phase 2 Radix UI redesign was promoted into production `main`, versioned
**v2.5.1 → v2.5.2**, built as a Windows NSIS installer, verified, committed, tagged and published
to GitHub with byte-identical artifacts. Zero business-logic, security, storage or printing
changes. All 100 % of previously completed functionality is preserved.

---

## 1. Final release status

| Item | Value |
|---|---|
| Release | **Malahy v2.5.2** |
| Previous version | v2.5.1 |
| Production path | `D:\Malahy` |
| Source branch (promoted from) | `experiment/ui-redesign-radix` @ `a3e790d` (worktree `D:\Malahy-redesign`) |
| Production branch | `main` |
| Git commit | **`5c9dc152dcc2d02f2ab77fa113bb13e3908f08fd`** |
| Git tag | **`v2.5.2`** (annotated → `5c9dc15`) |
| GitHub Release | **https://github.com/sliveamer20/malahy/releases/tag/v2.5.2** |
| Repository | `sliveamer20/malahy` (remote `origin`, unchanged) |
| Result | **SUCCESS — published and independently verified** |

---

## 2. Version determination

The project's convention (git history: `v2.0.0 … v2.5.1`, one commit + one annotated tag per
release) makes **v2.5.2** the correct next release: a visual-only change with no API, schema,
protocol or business-logic change, so a patch increment is correct.

Version surfaces updated / deliberately not updated:

| Surface | Value | Action |
|---|---|---|
| `package.json` `version` | **2.5.2** | ✅ **updated** (authoritative — drives electron-builder artifact name, installer metadata and the asar's `package.json`) |
| `package-lock.json` | unchanged | ⬜ not needed — the lockfile pins no root-version field for this project layout (byte-identical, verified) |
| `electron-builder.yml` | unchanged | ⬜ uses `${version}` from `package.json`; no hardcoded version |
| Installer file name | `malahy-setup-2.5.2.exe` | ✅ derived automatically |
| `latest.yml` `version:` | `2.5.2` | ✅ emitted by the build |
| App binary `ProductVersion` | `2.5.2` / `2.5.2.0` | ✅ verified in `dist\win-unpacked\كوكي بارك.exe` |
| Installer `FileVersion` / `ProductVersion` | `2.5.2` | ✅ verified in `dist\malahy-setup-2.5.2.exe` |
| `app.asar` `package.json` `version` | `2.5.2` | ✅ verified after extraction |
| Runtime self-report | `Update for version 2.5.2 is not available (latest version: 2.5.1, downgrade is disallowed).` | ✅ verified by launching the built app |
| `update-gate.js` `FLOOR_VERSION` | **2.5.1** | ⬜ **deliberately unchanged** — protected update-system file; `2.5.2 > 2.5.1` so the mandatory-update gate is satisfied. Its 3 guarding assertions still pass untouched. |

**No version mismatch exists anywhere.**

---

## 3. Phase 2C promotion

`main` turned out to be exactly **one docs-only commit** ahead of the experiment base
(`1d32a21` adds only `AI_REPORTS/FINAL_RELEASE_V2.5.1.md`), so promotion was a clean
file-level operation with **zero merge conflict risk**.

Promotion method: an **allowlisted, hash-verified copy** — never a blanket directory copy —
followed by a deny-list proof. 30 files promoted:

| Action | Count | Files |
|---|---|---|
| **Replaced** | **1** | `index.html` → `cd27407005cc15ac…` (byte-identical to the verified Phase 2C end state) |
| **Added** | **29** | `assets/vendor/radix-colors.css` (1) · `assets/icons/radix/` (18: `LICENSE`, `README.md`, 15 `*.svg`, `sprite.svg`) · `AI_REPORTS/UI_REDESIGN_PHASE_2*.md` (10) |

Explicitly **not** promoted: `windows/splash.html`, `windows/update.html` (protected — see §6),
`node_modules`, temp/QA artifacts, `.git` worktree pointer, `opencode.json`, `dist/`, `releases/`,
`qa-ticket-renders/`, `AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md`.

---

## 4. Exact promoted UI changes

### 4.1 The whole verified Phase 2 series (`index.html`)

| Phase | Content |
|---|---|
| 2a | Radix Colors foundation — `<link>` to the vendored `assets/vendor/radix-colors.css` + full token remap onto the Radix scales, dark **and** light |
| 2b-1 | Radix icon system for the 12 Action Bar buttons (inline `<svg class="rix">`, 2 with `rix-flip`) |
| 2b-2 | Radix glyphs for the Report/Review modal buttons (`currentColor` mask pseudo-elements) |
| 2b-3 | `lock-closed` icon in the password-reminder banner |
| 2b-7 | `plus` icon on both static "إضافة" buttons |
| 2b-6 | 15 official Radix Icons vendored under `assets/icons/radix/` (MIT, provenance documented) |
| **2b-8** | read-only audit proving `minus` and `chat-bubble` SAFE |
| **2C** | **`minus` in the Expenses panel tile** + **`chat-bubble` in the employee expense hint** |

### 4.2 Phase 2C — the two approved icons

`index.html:1774` — Expenses panel category tile:
```diff
-        <div class="tag">➖</div>
+        <div class="tag"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="M12.25 7C12.5261 7 12.75 7.22386 12.75 7.5C12.75 7.77614 12.5261 8 12.25 8H2.75C2.47386 8 2.25 7.77614 2.25 7.5C2.25 7.22386 2.47386 7 2.75 7H12.25Z" fill="currentColor"/></svg></div>
```

`index.html:1788` — employee expense hint:
```diff
-      <div class="exp-emp-hint" id="expEmpHint">💬 لو اخترت موظفًا، …
+      <div class="exp-emp-hint" id="expEmpHint"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="M12.7559 2.0127…H2.5Z" fill="currentColor"/></svg>لو اخترت موظفًا، …
```

`index.html:1096–1097` — the only new CSS, both single-element scoped:
```css
.panel.exp .tag>.rix{width:15px;height:15px;}
.exp-emp-hint>.rix{display:inline-block;vertical-align:middle;width:12px;height:12px;margin-inline-end:4px;}
```

### 4.3 Release-version edits (the only non-UI changes, explicitly authorised)

5 single-line edits, all required to make a `v2.5.2` release possible:

```diff
 package.json                     -  "version": "2.5.1"        +  "version": "2.5.2"
 tests/phase3b-auth.test.js       -  pkg.version === "2.5.1"   +  pkg.version === "2.5.2"   (+ label)
 tests/phase3c1-gate.test.js      -  pkg.version === "2.5.1"   +  pkg.version === "2.5.2"   (+ label)
 tests/phase3c2-baseline.test.js  -  pkg.version === "2.5.1"   +  pkg.version === "2.5.2"   (+ label)
 tests/protected-baseline.json    -  "d1f2551f…"               +  "42fbdb44…"               (package.json hash)
```

**Why this was necessary and safe.** The regression suite hard-pins the literal string `2.5.1`
in three "no version bump" guards and pins `package.json` byte-identity in two more. Measured in a
throwaway copy outside the repository, bumping the version alone turned **722 PASS / 1 FAIL into
714 PASS / 9 FAIL** — 7–8 genuinely new failures. This release therefore re-anchored exactly those
five lines, following the project's own documented precedent (the v2.5.1 release re-anchored
`tests/protected-baseline.json` for its `electron-builder.yml` packaging fix, see
`AI_REPORTS/FINAL_RELEASE_V2.5.1.md` §1).

**Guardrails honoured:** no assertion was weakened, removed, skipped or made conditional; the
comparisons remain strict equality; the `update-gate.js` `FLOOR_VERSION` assertions were
deliberately left untouched and still pass; the `windows/*` hashes in `protected-baseline.json`
were **not** touched. The guardian is still a byte-identity check — only the legitimate release
value changed.

---

## 5. Protected systems verification

Verified twice: against the pre-promotion `HEAD` blob (via `git cat-file`, byte-exact) and again
after the version bump.

| Protected file | Status |
|---|---|
| `main.js`, `preload.js`, `database.js`, `users.js`, `login.js`, `recovery.js`, `permissions.js`, `perm-gate.js`, `activation.js`, `update-gate.js`, `accounts.js`, `launch.js` | ✅ **byte-identical** (12/12) |
| `package-lock.json`, `electron-builder.yml`, `.gitignore`, `README.md` | ✅ **byte-identical** |
| `assets/ticket/ticket-template.js`, `assets/ticket/ticket-template.svg` | ✅ **byte-identical** |
| `assets/report/daily-report.js`, `assets/vendor/qrcode.js` | ✅ **byte-identical** |
| `assets/icons/icon.ico`, `assets/icons/logo.png`, `assets/images/logo.png` | ✅ **byte-identical** |
| `windows/splash.html`, `windows/update.html` | ✅ **byte-identical** (deliberately not promoted — §6) |
| `package.json` | ⚠️ changed **only** `"version": "2.5.1" → "2.5.2"` (authorised release bump) |
| `tests/**` | ⚠️ 4 files changed, **1 line each**: 3 version assertions + 1 baseline hash (authorised re-anchor). All 11 other test files byte-identical. No test logic altered. |

### JavaScript integrity — **0 bytes changed**

All **12** `<script>` blocks in `index.html` hash-identical to the pre-promotion `HEAD`:

| # | Type | Bytes | SHA-256 (12) |
|---|---|---|---|
| 0–2 | external (`qrcode.js`, `ticket-template.js`, `daily-report.js`) | 0 | `e3b0c44298fc` |
| 3 | inline, head | 155 | `560f55d2acc9` |
| 4–9 | external (`activation.js`, `login.js`, `permissions.js`, `perm-gate.js`, `accounts.js`, `recovery.js`) | 0 | `e3b0c44298fc` |
| 10 | inline | 3 586 | `60ce5f69b911` |
| **11** | **inline application script** | **244 309** | **`3068e7b8cbfa`** |

The only stylesheet that changed is inline `<style>` #0 (102 433 → 111 694 B). `<style>` blocks
#1–#8 are byte-identical.

### Attribute integrity

| Attribute set | Before | After | Result |
|---|---|---|---|
| `id` | 57 | 57 | ✅ multiset identical (added `[]`, removed `[]`) |
| `onclick` | 18 | 18 | ✅ multiset identical |
| `data-perm` | 10 | 10 | ✅ multiset identical |
| other `data-*` | 11 | 11 | ✅ multiset identical |
| external `<script src>` | 9 | 9 | ✅ identical |
| inline `.rix` glyphs | 0 | 17 | ✅ expected (the icon system) |
| `.rix-flip` glyphs | 0 | 2 | ✅ expected (`exit`, `bar-chart`) |

### Static-markup emoji census

`v2.5.1` static markup held **18** emoji types; `v2.5.2` holds **5**. **13 removed, 0 added.**
The 5 survivors are all deliberate: `⬇️` (update bar — protected *and* rewritten from JS),
`🎁` (gifts tile — no Radix `gift` glyph exists), `💵`/`💳` (payment icons — protected), `💬`
(activation WhatsApp — blocked).

### Business systems

Sales · ticket calculations · ticket layout · QR · printer discovery/selection · A4/58 mm/80 mm
printing · daily accounts · Returns Log · Gifts · **Expenses** · employee advances · payroll ·
shift/business-day · authentication · permissions · admin recovery · activation · update gate ·
database · storage · IPC — **all untouched and all still covered by the passing regression
suite.**

---

## 6. `windows/splash.html` and `windows/update.html` — deliberate non-promotion

Phase 2a also remapped the `:root` token blocks of these two windows onto the Radix scales
(CSS values only; no JS, no structure). They were **not promoted**, because Step 3 of the
promotion order lists them as protected and the stop conditions forbid modifying protected files.
This was raised with the maintainer before proceeding and the decision was confirmed.

**Measured impact — cosmetic only, and now proven:**
- The main application window uses the Radix palette (`--bg` = `#111927` dark, `#f4faff` light).
- The splash window still reports `--bg: #0a1628` (the v2.5.1 navy) — verified in the launched
  build. These windows are self-contained; they load correctly either way and share no CSS with
  `index.html`.
- Their in-file comment "must match index.html `:root` exactly" is now a known, accepted deviation.

**Nothing is lost.** Both remapped variants are preserved at
`releases/v2.5.2/deferred-phase2a-radix-tokens/` (gitignored, non-production):
- `splash.html.radix-remap` — `8bc85e73779448e8…` (5 649 B)
- `update.html.radix-remap` — `d6be3dbddedf5e18…` (12 743 B)

Applying them later is a two-file copy; the rationale is documented in
`AI_REPORTS/UI_REDESIGN_PHASE_2A_RADIX_COLORS.md` (now in `main`).

---

## 7. Visual QA in production

Real Chromium 154 renders of the promoted `D:\Malahy\index.html`, dark + light × RTL + LTR,
0 page exceptions.

| Check | dark | light | RTL | LTR | Required |
|---|---|---|---|---|---|
| `.panel.exp .tag` box | **36 × 36** | **36 × 36** | ✅ | ✅ | 36 × 36 ✅ |
| tile glyph | 15 × 15, inset 10.5 px = dead-centre | same | ✅ | ✅ | — |
| tile glyph `fill` | `rgb(229,72,77)` = `--red-9` | `rgb(220,62,66)` = `--red-10` | ✅ | ✅ | theme-adaptive ✅ |
| `.tag` `textContent` | `""` (emoji fully removed) | same | ✅ | ✅ | — |
| `#expEmpHint` | **1 line**, `518 × 17.59`, `scrollHeight == clientHeight == 18` | same | ✅ | ✅ | readable, aligned ✅ |
| hint glyph | 12 × 12, `inline-block`, `vertical-align: middle` | same | ✅ | ✅ | — |
| hint gap | `margin-left: 4px`, `margin-right: 0` | same | ✅ | `margin-left: 0`, `margin-right: 4px` | logical ✅ |
| Radix tokens live | `--bg rgb(17,25,39)`, ink `rgb(237,238,240)` | `--bg rgb(244,250,255)`, ink `rgb(28,32,36)` | ✅ | ✅ | 2a promoted ✅ |
| `.panel.exp` / `.panel-head` | `552 × 292.59` / `518 × 55` | same | ✅ | ✅ | unchanged ✅ |
| `.add-btn` ×2 | `146.52 × 50`, glyph 15 × 15, text `"إضافة"` | same | ✅ | ✅ | unchanged ✅ |
| `#passBanner` / glyph | `1120 × 65` / `15 × 15` | same | ✅ | ✅ | unchanged ✅ |
| Action Bar | 12 buttons, 4 visible (no session), all `onclick`/`data-perm` intact | same | ✅ | ✅ | unchanged ✅ |
| ticket cards | 4 rendered | same | ✅ | ✅ | ticket UI intact ✅ |
| `#updateIc` / `.panel.gift .tag` / summary 💵 | `⬇️` / `🎁` / `↳ منها كاش 💵` | same | ✅ | ✅ | protected, untouched ✅ |
| horizontal overflow | none (`scrollWidth 1600 == innerWidth`) | none | ✅ | ✅ | ✅ |

---

## 8. Regression results

Method: the repository's own convention, `node tests/<suite>.test.js` per suite, **14 suites**.
No `npm test` script exists; no test framework or dependency was added. Run three times:
before promotion, after promotion, after the version bump.

| Suite | before | after promotion | after v2.5.2 |
|---|---|---|---|
| `phase3b-auth.test.js` | 60 / 1 | 60 / 1 | 60 / 1 |
| `phase3b-ipc.test.js` | 15 / 0 | 15 / 0 | 15 / 0 |
| `phase3c1-dom.test.js` | 37 / 0 | 37 / 0 | 37 / 0 |
| `phase3c1-gate.test.js` | 48 / 0 | 48 / 0 | 48 / 0 |
| `phase3c1-ipc.test.js` | 19 / 0 | 19 / 0 | 19 / 0 |
| `phase3c1-session.test.js` | 30 / 0 | 30 / 0 | 30 / 0 |
| `phase3c2-baseline.test.js` | 63 / 0 | 63 / 0 | 63 / 0 |
| `phase3c2-gate.test.js` | 44 / 0 | 44 / 0 | 44 / 0 |
| `phase3c2-ipc.test.js` | 49 / 0 | 49 / 0 | 49 / 0 |
| `phase3c2-perms.test.js` | 39 / 0 | 39 / 0 | 39 / 0 |
| `phase3c3-accounts.test.js` | 92 / 0 | 92 / 0 | 92 / 0 |
| `phase3c3-ui.test.js` | 76 / 0 | 76 / 0 | 76 / 0 |
| `phase3c4-recovery.test.js` | 79 / 0 | 79 / 0 | 79 / 0 |
| `phase4-daily-report.test.js` | 71 / 0 | 71 / 0 | 71 / 0 |
| **TOTAL** | **722 / 1** | **722 / 1** | **722 / 1** |

> **Note on the quoted baseline.** The promotion brief cited `713 PASS / 10 FAIL`. That is the
> **experimental worktree's** baseline. Production `main`'s real baseline is `722 PASS / 1 FAIL`
> — identical to the v2.5.1 release report — because in `main` `windows/splash.html` and
> `windows/update.html` are unmodified and `dist/` + `opencode.json` exist. **`722 / 1` is the
> correct comparison basis, and it held exactly.**

### Before/after comparison

```
post-promotion (2.5.1) : 722 PASS / 1 FAIL
post-bump      (2.5.2) : 722 PASS / 1 FAIL      DELTA 0 / 0
all 14 per-suite stdout SHA-256 : IDENTICAL (before vs after promotion)
new failures  : 0
resolved      : 0
```

### The single failure — documented historical, unchanged

```
phase3b-auth.test.js :: all protected files byte-identical to pre-phase baseline :: changed: index.html
```

`phase3b-auth.test.js` compares `index.html` against the frozen pre-Phase-3B snapshot. `index.html`
is the one file the security phases and now the UI redesign intentionally change; the current
integrity guardians deliberately skip it (`intended = { "index.html": true }` in
`phase3c1-gate.test.js` and `phase3c2-baseline.test.js`). `phase3b-auth` merely *reports* it. Same
single assertion, same message, exactly as in v2.5.1. No test was weakened to hide it.

---

## 9. Build result

Existing build system used unchanged: `npm run dist` → `electron-builder --win --publish never`,
driven by the existing `electron-builder.yml`.

| Item | Value |
|---|---|
| electron-builder | 26.15.3 |
| Electron | 43.7.5, x64, NSIS |
| Configuration | `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`, desktop + Start Menu shortcuts, `shortcutName: كوكي بارك` — **identical to v2.5.1** |
| App id | `com.malahy.fathallah` (unchanged) |
| Icon | `assets/icons/icon.ico` (unchanged) |
| Packaging | `asar: true` |
| Publish during build | **none** (`--publish never`; GitHub publishing done separately in §12) |
| Build duration | 60.6 s |
| Outcome | ✅ **SUCCESS**, no warnings of consequence |
| Stale output | `dist/` cleared first — v2.5.1's artifacts were already archived in `releases/v2.5.1/`, so no release was lost |

### `app.asar` contents (verified)

Includes all 18 `assets/icons/radix/*` files, `assets/vendor/radix-colors.css`, `index.html`,
`windows/splash.html`, `windows/update.html`, the ticket/report/vendor assets, all app modules and
the production `electron-updater` dependency tree.

Excludes — verified absent: `node_modules` dev deps, `AI_REPORTS/**`, `tests/**`,
`qa-ticket-renders/**`, `opencode.json`, `releases/**`, `dist/**`, `.git`.

The packaged `index.html` is **byte-identical** to the promoted repository file
(`cd27407005cc15ac…`) and the packaged `package.json` reports **2.5.2**.

---

## 10. Installer + artifact QA

| Artifact | Path | Size | SHA-256 |
|---|---|---|---|
| **Windows Setup installer** (= the Windows EXE for Electron) | `D:\Malahy\releases\v2.5.2\malahy-setup-2.5.2.exe` | 105 923 934 B | `e61b923172924013cb03cbd62243e288325632c9a5c56a4989a6e35010321ac9` |
| Block map (differential auto-update) | `D:\Malahy\releases\v2.5.2\malahy-setup-2.5.2.exe.blockmap` | 111 290 B | `4555cea9e5780df67ea8030364196affc04149850e8b64e021be7bf10993727e` |
| Update manifest | `D:\Malahy\releases\v2.5.2\latest.yml` | 341 B | `9344abc7f64864611b58b6640ad83fd9b3d8509b81ebb5713892e16e570331d5` |
| Unpacked app binary | `D:\Malahy\dist\win-unpacked\كوكي بارك.exe` | 239 021 056 B | `35c06d9fc8724a040a8eee63c5a78c1a7673ffea9141ae7eb243929c29299cd0` |
| App package | `D:\Malahy\dist\win-unpacked\resources\app.asar` | 5 373 852 B | `9ec3d95ea8b720c7572953a7c42b0c3848883ffedcea36edd5e90e6d2335e21b` |

Also present in `dist/`: `latest.yml` (identical hash), `malahy-setup-2.5.2.exe` (identical hash),
`builder-debug.yml`, `win-unpacked/`. The three release files exist in exactly two places
(`dist/` = build output, `releases/v2.5.2/` = the project archive convention) — no unnecessary
duplicates were created, and `releases/v2.5.2/` matches the layout of v2.5.0/v2.5.1 exactly.

Checks: no zero-byte files ✅ · version metadata correct in both binaries ✅ · filenames follow the
`artifactName` template ✅ · `latest.yml` `version: 2.5.2` with matching sha512/size ✅ · no debug or
dev artifact published (only the 3 release files are attached) ✅ · no experimental-worktree file in
the package ✅.

### Launch test — performed in isolation

A **live v2.5.1 installation exists on this machine** (`%LOCALAPPDATA%\Programs\malahy`, registry
`DisplayVersion 2.5.1`, `%APPDATA%\malahy` holding the real POS database — 72 files). A true
"clean installation test" would first have to uninstall it, **destroying the working install and
risking the user's live sales database**. That is a destructive action and was therefore **not**
performed.

Instead the built payload was launched directly with a throwaway `--user-data-dir`:

| Verification | Result |
|---|---|
| Application launches | ✅ booted, opened a window |
| Reads from the package | ✅ loaded `app.asar/windows/splash.html` |
| Runtime version self-report | ✅ `Update for version 2.5.2 is not available (latest version: 2.5.1, downgrade is disallowed).` |
| Update gate functional | ✅ correct no-downgrade behaviour |
| Activation gate functional | ✅ held a fresh unactivated profile at the splash — correct security behaviour; activation was **not** bypassed or faked |
| Application closes normally | ✅ exited cleanly on request; 0 orphaned processes |
| **Live POS database** | ✅ **untouched** — 72 files before and after, newest mtime unchanged, `malahy-data.json` hash unchanged |
| **Live v2.5.1 install** | ✅ **untouched** — binary still `2.5.1.0`, registry still `2.5.1` |

Not verified (and honestly not claimed): the packaged app's `index.html` window could not be
reached inside Electron because that requires a valid activation record. It is covered instead by
(a) the asar's `index.html` being byte-identical to the promoted file and (b) §7's real-browser
verification of that exact file.

---

## 11. Git commit and tag

```
5c9dc15  release: v2.5.2 UI redesign (Radix colors + icons)   <-- tag v2.5.2 points HERE
1d32a21  docs: final release report for v2.5.1
a3e790d  release: Malahy v2.5.1
```

`5c9dc15` is the release commit and carries the annotated tag. This report was then committed as a
separate docs commit — the same two-step pattern the project used for v2.5.1 (`1d32a21`, one commit
after the `v2.5.1` tag):

```
0598d4d  docs: final release report for v2.5.2                 <-- current main HEAD
5c9dc15  release: v2.5.2 UI redesign (Radix colors + icons)   <-- tagged
```

35 files changed, 5 964 insertions, 109 deletions. Staged by explicit path — **no** `git add .`.
Excluded from the commit: `qa-ticket-renders/` (11 QA PNGs), `opencode.json` (gitignored),
`AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md` (pre-existing untracked file, unrelated to this release),
`dist/`, `releases/` (gitignored).

```
$ git tag -a v2.5.2 -m "Malahy v2.5.2 - Radix UI redesign (colors + icon system), no business logic changes"
$ git show --no-patch v2.5.2
tag v2.5.2
Tagger: sliveamer20 <sliveamer20@gmail.com>
commit: 5c9dc152dcc2d02f2ab77fa113bb13e3908f08fd
subject: release: v2.5.2 UI redesign (Radix colors + icons)
```

Remote state:
```
5c9dc152dcc2d02f2ab77fa113bb13e3908f08fd  refs/heads/main
0808b456f2d19f63bffb5da2369515cf5c0237fd  refs/tags/v2.5.2
5c9dc152dcc2d02f2ab77fa113bb13e3908f08fd  refs/tags/v2.5.2^{}
```

---

## 12. GitHub Release

| Item | Value |
|---|---|
| URL | **https://github.com/sliveamer20/malahy/releases/tag/v2.5.2** |
| State | published, `draft=false`, `prerelease=false` |
| Published at | 2026-10-04T18:46:26Z |
| Attached | `malahy-setup-2.5.2.exe` (105 923 934 B) · `malahy-setup-2.5.2.exe.blockmap` (111 290 B) · `latest.yml` (341 B) |

Independently verified by **downloading every asset back from GitHub** and re-hashing:

| Asset | Size matches API | SHA-256 matches local build |
|---|---|---|
| `malahy-setup-2.5.2.exe` | ✅ | ✅ `e61b923172924013cb03cbd62243e288…` |
| `malahy-setup-2.5.2.exe.blockmap` | ✅ | ✅ `4555cea9e5780df67ea8030364196af…` |
| `latest.yml` | ✅ | ✅ `9344abc7f64864611b58b6640ad83fd…` |

**The published installer is byte-identical to the locally built and tested artifact.**

The installer is attached as both the "Windows EXE" and the "Setup" because in Electron the single
NSIS executable *is* the installer — exactly as in v2.4.1 … v2.5.1. No redundant 239 MB unpacked
binary was published, consistent with every previous release.

Release notes claim only what was measured: the UI changes, the explicit "no business logic
change" statement, the 722/1 verification result, the byte-identical protected files, the
activation/update behaviour, and the splash/update palette note in §6.

---

## 13. Cleanup status

Pre-cleanup safety gate — all five conditions checked **before** removing anything:

| # | Condition | Result |
|---|---|---|
| 1 | `D:\Malahy` is the final production project | ✅ `main` @ `5c9dc15`, clean working tree except 12 pre-existing untracked files |
| 2 | All required Phase 2C changes present in main | ✅ both icons + both scoped rules at `index.html:1774 / 1788 / 1096 / 1097` |
| 3 | Release artifacts exist | ✅ `releases/v2.5.2/` (3 files) + `dist/` |
| 4 | GitHub tag and release exist | ✅ tag `v2.5.2` on origin; release published with 3 verified assets |
| 5 | **No unique required source file exists only in the experimental worktree** | ✅ verified by a full file-by-file comparison: the **only** experiment-only content is the `.git` worktree pointer (49 B). The sole intentional non-promotion is the Phase 2a token remap of the two protected window files, whose remapped variants are preserved at `releases/v2.5.2/deferred-phase2a-radix-tokens/`. |

Result: `D:\Malahy-redesign` removed and the local branch `experiment/ui-redesign-radix` deleted.

---

## 14. Warnings / remaining issues

1. **Splash + update windows keep the v2.5.1 navy palette.** By design (protected files). Purely
   cosmetic, affects only the brief splash and the rarely-seen update window. Both remapped
   variants are preserved for a future one-file-each change — see §6.
2. **One pre-existing regression failure remains** (`index.html` vs. the frozen pre-Phase-3B
   snapshot). Long-documented, unchanged from v2.5.1, and deliberately not "fixed" by weakening a
   test.
3. **Three test assertions and one baseline hash were re-anchored** from `2.5.1` to `2.5.2`.
   Explicitly authorised, minimal (1 line each), comparisons still strict. Future releases must
   repeat this step while those guards exist.
4. **The live v2.5.1 installation on this machine was intentionally left in place.** Installing
   v2.5.2 over it was not attempted, to avoid disrupting a working install and its POS database.
   The user should run `malahy-setup-2.5.2.exe` when ready; installing over v2.5.1 preserves data.
5. **The packaged app's `index.html` window was not reached inside Electron** because that needs a
   valid activation record, which was not faked. Covered by byte-identity of the asar copy plus
   real-browser QA of that exact file.

---

## 15. Appendix — how to verify this release yourself

```powershell
# tag + commit
git -C D:\Malahy show --no-patch v2.5.2
git -C D:\Malahy ls-remote origin refs/heads/main refs/tags/v2.5.2

# artifacts
Get-FileHash D:\Malahy\releases\v2.5.2\malahy-setup-2.5.2.exe -Algorithm SHA256
# expect e61b923172924013cb03cbd62243e288325632c9a5c56a4989a6e35010321ac9

# the two promoted icons + their scoped CSS
Select-String -Path D:\Malahy\index.html -Pattern 'class="tag"><svg class="rix"','expEmpHint"><svg','\.panel\.exp \.tag>\.rix','\.exp-emp-hint>\.rix'

# zero JavaScript change vs v2.5.1 (compare the application script block)
git -C D:\Malahy show v2.5.1:index.html > $env:TEMP\v251.html

# regression suite
Get-ChildItem D:\Malahy\tests\*.test.js | ForEach-Object { node $_.FullName }
# expect 722 PASS / 1 FAIL per run
```

**Phase 3 complete — released, published and verified. No further development phase started.**
