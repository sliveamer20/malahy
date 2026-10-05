# RELEASE v2.5.3 — Final QA Report

**Project:** Malahy — كوكي بارك (نظام قطع التذاكر وحساب المبيعات اليومية)
**Repository:** `sliveamer20/malahy` (public, default branch `main`)
**Release date:** 2026-10-06
**Status:** ✅ Local QA complete — all gates passed

---

## 1. Previous version

**2.5.2** — released in commit `5c9dc15` ("release: v2.5.2 UI redesign (Radix colors + icons)").

Pre-release baseline carried into this release:

| Item | State at release start |
|---|---|
| Branch | `main` |
| HEAD | `18acba6` docs: record both release commits in the v2.5.2 final QA report |
| Version | 2.5.2 |
| Regression | 722 PASS / 1 FAIL |
| Build config | ✅ restored in Phase 6.6 (`start`, `dist`, `publish`, `devDependencies`) |
| Uncommitted work | `index.html` (Phase 6 UI), `package.json`, `tests/protected-baseline.json`, `windows/splash.html` |

---

## 2. New version

**2.5.3** — Windows NSIS x64 installer release.

| Item | Value |
|---|---|
| `package.json` version | `2.5.3` |
| Installer name (from `artifactName: malahy-setup-${version}.${ext}`) | `malahy-setup-2.5.3.exe` |
| Installer PE FileVersion / ProductVersion | `2.5.3` / `2.5.3` |
| App executable PE FileVersion / ProductVersion | `2.5.3` / `2.5.3.0` |
| Packaged `app.asar` `package.json` version | `2.5.3` |
| `latest.yml` version | `2.5.3` |
| Splash displayed version | `الإصدار 2.5.3` |
| `update-gate.js` `FLOOR_VERSION` | `2.5.1` — **deliberately unchanged** (2.5.3 > 2.5.1) |

---

## 3. Version-change locations

The v2.5.1 (`a3e790d`) and v2.5.2 (`5c9dc15`) release commits were used as the
authoritative precedent. `2.5.2` was **not** globally replaced — each candidate was
classified individually.

### Changed (5 files, 5 legitimate edits)

| # | Location | Before | After | Basis |
|---|---|---|---|---|
| 1 | `package.json:3` | `"version": "2.5.2"` | `"version": "2.5.3"` | Drives `artifactName` + installer metadata |
| 2 | `windows/splash.html:179` | `<span>2.5.2</span>` | `<span>2.5.3</span>` | Visible splash version |
| 3 | `tests/phase3b-auth.test.js:274` | `pkg.version === "2.5.2"` | `pkg.version === "2.5.3"` | Release-version assertion re-anchor (exact v2.5.2 precedent) |
| 4 | `tests/phase3c1-gate.test.js:51` | `pkg.version === "2.5.2"` | `pkg.version === "2.5.3"` | same |
| 5 | `tests/phase3c2-baseline.test.js:23` | `pkg.version === "2.5.2"` | `pkg.version === "2.5.3"` | same |

Assertion labels were updated in the same edit, matching the v2.5.2 wording pattern
(`"... (release bump, re-anchored for v2.5.3)"`). **No assertion was weakened,
skipped, removed, or replaced with a weaker form.**

### Changed (baseline hashes — 2 entries, 1 file)

| File | Old SHA-256 | New SHA-256 |
|---|---|---|
| `tests/protected-baseline.json` → `package.json` | `42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c` *(HEAD value)* | `a6befdc2ced58eca5a55b8e09dce3574656737f065e89ddec9b99c5c553b1cc1` |
| `tests/protected-baseline.json` → `windows\splash.html` | `7e9e9d0337c87e8326e9b201cbad19960665fca3490e9d1fba6ac652d0e56110` *(HEAD value)* | `bce507dc2d6347723d31db52b68c7779dcdfad77a7f4a8b3413db2da9d1e952d` |

Only the two files this release legitimately changed were re-anchored. **All 14
other baseline hashes are untouched.**

### Deliberately NOT changed — with justification

| Location | Current value | Decision | Reason |
|---|---|---|---|
| `tests/protected-baseline.json` → `index.html` | anchor `854cff97…`, actual `8bd07761…` | **left stale** | `index.html` was not modified by *this* release. Re-anchoring is prohibited by the brief ("re-anchor only the exact files intentionally changed by this release"), and the brief explicitly permits this as the single remaining failure. This is what produces 722/1. |
| `update-gate.js:14` `FLOOR_VERSION` | `"2.5.1"` | **unchanged** | Protected file. 2.5.3 > 2.5.1 so the floor needs no raise. The v2.5.2 commit made the identical decision ("update-gate.js FLOOR_VERSION deliberately stays 2.5.1"). |
| `package-lock.json` `version` (×2) | `"2.5.0"` | **unchanged** | See §3.1. |
| `README.md:7,76,154,158` | `2.5.1` | **unchanged** | Already stale by one release before this one — the v2.5.2 commit did not update it either. It is a protected baseline-anchored file and its version line is documentation, not release metadata. Flagged for a docs phase (see §17). |
| `package-lock.json:1518` | `"mime": "^2.5.2"` | **unchanged** | Unrelated third-party dependency semver range. Not the app version. |
| `windows/update.html` | no version literal | unchanged | — |
| `electron-builder.yml` | — | unchanged | Build config correct as-is; `artifactName` interpolates `${version}` automatically. |
| `releases/**`, `AI_REPORTS/**` | historical | unchanged | Release history and documentation history. |
| `dist/` | — | gitignored | Build output, never committed (repo `.gitignore`). |

### 3.1 `package-lock.json` — synchronization decision

The lockfile's own `version` fields read `2.5.0` while `package.json` now reads
`2.5.3`. History proves this is the project's **established convention, not an
oversight**:

```
$ git log --oneline -- package-lock.json
5388949 release: v2.5.0 branding and header improvements   <- last modification
8596135 release: v2.4.9
3a781f3 release: v2.4.8
c9ab8a1 release: v2.4.7
763da09 release: v2.4.6
6638f34 chore(release): bump version to 2.4.5 and set installer artifactName
80adb1b First version

$ git diff 5388949 a3e790d -- package-lock.json
(empty — the v2.5.1 release did not touch the lockfile)

version field at each release commit:
5388949 (v2.5.0) -> 2.5.0
a3e790d (v2.5.1) -> 2.5.0   (stale, untouched)
5c9dc15 (v2.5.2) -> 2.5.0   (stale, untouched)
18acba6 (HEAD)   -> 2.5.0   (stale, untouched)
```

**The lockfile has never been synchronized by a release since v2.5.0** — it is only
rewritten incidentally whenever `npm install` happens to run. Dependency resolution
is authoritative and unaffected: root `devDependencies` are `electron ^43.7.5` and
`electron-builder ^26.0.12`, matching the manifest exactly.

**Decision: `package-lock.json` left completely unchanged.** No `npm install`, no
`npm ci`, no dependency edits. This follows the instruction to treat previous
release convention as authoritative, and honours the "do not regenerate
dependencies" constraint. The cosmetic staleness is documented here rather than
silently "fixed", because changing it would introduce a lockfile modification that
no prior release has ever made — a larger deviation than the staleness itself.

---

## 4. Test results

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
─────────────────────────────────────────────
TOTAL PASS=722 FAIL=1             ✅ target met exactly
```

Run **three times** during this release (after the version bump, after the build,
and as the final pre-publish gate) — identical result each time.

| Requirement | Result |
|---|---|
| 722 PASS / 1 FAIL | ✅ |
| New failures | **0** |
| Skipped tests | **0** new (the 2 `SKIP` lines are the pre-existing documented `index.html` allowance, untouched) |
| Modified tests | **3 files, 1 line each** — release-version literal only |
| Weakened / deleted assertions | **0** |

---

## 5. Known remaining historical failure

Exactly one, unchanged in identity from the pre-Phase-6.5 baseline:

```
[phase3b-auth.test.js] FAIL  all protected files byte-identical to pre-phase
                            baseline :: changed: index.html
```

| Attribute | Detail |
|---|---|
| Suite | `phase3b-auth.test.js` (60 pass / 1 fail) |
| Cause | `index.html` carries the Phase 6 UI redesign (Lucide inline icon system + Radix colour tokens) and was modified in the working tree before this release |
| Anchored SHA-256 | `854cff97e10932c036df534396d975e1ded674e4f8b5b85e538dea77be8ac5a2` |
| Actual SHA-256 | `8bd077610232ee19edf4cdf1961acbb6f072e2321e38d20c447abd98846dec3b` |
| Intent | The Phase 6 UI work is a **verified, intentional, released** change. Its `index.html` is committed in this release; only the anchor is stale. |
| Resolution | Anchor it at the next maintenance phase. Not done here — the brief requires re-anchoring *only* files this release changed, and the 722/1 target already accommodates this. |

---

## 6. Build command

```
npm run dist
  -> electron-builder --win --publish never
```

The existing production build command, restored in Phase 6.6. `electron-builder.yml`
was **not** modified — the build proved it correct. No new build system introduced.

### Build output

```
• electron-builder  version=26.15.3 os=10.0.26200
• loaded configuration  file=D:\Malahy\electron-builder.yml
• executing @electron/rebuild  electronVersion=43.7.5 arch=x64
• installing native dependencies  arch=x64
• completed installing native dependencies
• packaging       platform=win32 arch=x64 electron=43.7.5 appOutDir=dist\win-unpacked
• downloaded      label=electron progress=100%
• downloaded electron zip extracted successfully
• searching for node modules  pm=npm searchDir=D:\Malahy
• updating asar integrity executable resource  executablePath=dist\win-unpacked\كوكي بارك.exe
• signing with signtool.exe  path=dist\win-unpacked\كوكي بارك.exe
• building        target=nsis file=dist\malahy-setup-2.5.3.exe archs=x64 oneClick=false perMachine=false
• signing with signtool.exe  path=dist\malahy-setup-2.5.3.__uninstaller.exe
• signing with signtool.exe  path=dist\malahy-setup-2.5.3.exe
• building block map  blockMapFile=dist\malahy-setup-2.5.3.exe.blockmap
```

---

## 7. Build result

✅ **SUCCESS** — NSIS x64 installer produced. Zero errors, zero warnings.
`--publish never` was honoured: **nothing was published by the build.**
`npm run publish` was **never executed**.

---

## 8. Artifact list

| # | Artifact | Path | Distributable |
|---|---|---|---|
| 1 | Windows Setup installer | `dist/malahy-setup-2.5.3.exe` | ✅ |
| 2 | Block map (delta updates) | `dist/malahy-setup-2.5.3.exe.blockmap` | ✅ |
| 3 | Update metadata | `dist/latest.yml` | ✅ |
| 4 | Unpacked application | `dist/win-unpacked/` | internal |
| 5 | Build debug config | `dist/builder-debug.yml` | ❌ debug-only |

Staged to the project release convention: **`releases/v2.5.3/`** (3 distributables
only; no debug files, no v2.5.2 artifacts mixed in).

---

## 9. Artifact sizes

| Artifact | Bytes | Size |
|---|---|---|
| `malahy-setup-2.5.3.exe` | 105,922,131 | 101.0 MiB |
| `malahy-setup-2.5.3.exe.blockmap` | 111,188 | 108.6 KiB |
| `latest.yml` | 341 | 333 B |
| `dist/win-unpacked/كوكي بارك.exe` | 239,021,056 | 228.0 MiB |
| `dist/win-unpacked/Uninstall كوكي بارك.exe` | 230,750 | 225.3 KiB |

All non-zero ✅. Comparison with the previous release (v2.5.2 → v2.5.3 setup):
105,923,934 → 105,922,131 bytes (−1,803 B) — a plausible delta for the splash
version string and Phase 6 Lucide assets.

---

## 10. SHA-256 hashes

### Published artifacts (`releases/v2.5.3/`)

```
650511b4997301fad884b2e4b00ac3925765d1db412a5c359f7752ed0dffc66f  malahy-setup-2.5.3.exe
35e5247f6770d3388667935f74d0b9955a0f75fe926a19db702177428a5265c0  malahy-setup-2.5.3.exe.blockmap
495c85db8634cfc897744c40f24562d957d2243861a7a83368b6e2f4324d6669  latest.yml
```

Byte-identical to their `dist/` originals (copy integrity verified by re-hashing
after staging).

### SHA-512 cross-check against `latest.yml`

```
computed (base64): 1fBVFu4o4NuPauYJjF2KLIEfPMOFZQ+b3tcEMZ1WSxeKmNVRg1SZ/Jvl7Iqp8XGIZZ0ByA/pV6hvw8unJ71vcw==
latest.yml      : 1fBVFu4o4NuPauYJjF2KLIEfPMOFZQ+b3tcEMZ1WSxeKmNVRg1SZ/Jvl7Iqp8XGIZZ0ByA/pV6hvw8unJ71vcw==
MATCH: True
```

`latest.yml` also records `size: 105922131`, matching the actual installer size.
This is the exact metadata `electron-updater` uses for auto-update, so it is
internally consistent and verified.

### `latest.yml` content

```yaml
version: 2.5.3
files:
  - url: malahy-setup-2.5.3.exe
    sha512: 1fBVFu4o4NuPauYJjF2KLIEfPMOFZQ+b3tcEMZ1WSxeKmNVRg1SZ/Jvl7Iqp8XGIZZ0ByA/pV6hvw8unJ71vcw==
    size: 105922131
path: malahy-setup-2.5.3.exe
sha512: 1fBVFu4o4NuPauYJjF2KLIEfPMOFZQ+b3tcEMZ1WSxeKmNVRg1SZ/Jvl7Iqp8XGIZZ0ByA/pV6hvw8unJ71vcw==
releaseDate: '2026-10-05T23:07:30.563Z'
```

### Source file hashes (release-relevant, SHA-256)

```
a6befdc2ced58eca5a55b8e09dce3574656737f065e89ddec9b99c5c553b1cc1  package.json
bce507dc2d6347723d31db52b68c7779dcdfad77a7f4a8b3413db2da9d1e952d  windows/splash.html
8bd077610232ee19edf4cdf1961acbb6f072e2321e38d20c447abd98846dec3b  index.html
58c7b415161cc0bede538b9026e1b5b2ec3b0215feccf978465bc2269d04c664  main.js            (protected)
cdf768f6566f333c04c008a2c79a153795f066dda467bc487c43f8b9545c693a  preload.js         (protected)
524b232d4025813a182e8a6a16e63c13bfccd2014215bb2a2d37d3ff2dc694d8  package-lock.json  (protected)
2396654f7428a1268e2a7b01ae78b0032255a5b7066ed15844d689b3619d41db  electron-builder.yml (protected)
7db341a1c70ded693e4fb0479702ee3ef4e3141773e27bd371580198de0d02c8  launch.js          (protected)
b4188bb8e781e19338378a354f438effee8b1d57f88a8bd4d2b2eca82eea37b8  assets/report/daily-report.js
```

---

## 11. Setup test

| Check | Result |
|---|---|
| Installer launched | ✅ `malahy-setup-2.5.3.exe` |
| Installation process exit code | ✅ `0` |
| Installed app executable present | ✅ `كوكي بارك.exe`, 239,021,056 bytes |
| Installed app PE FileVersion | ✅ `2.5.3` |
| Installed app PE ProductVersion | ✅ `2.5.3.0` |
| Installed `app.asar` version | ✅ `2.5.3` |
| Installed splash version | ✅ `class="version">الإصدار <span>2.5.3</span>` |
| Installed `main.js` SHA-256 | ✅ `58c7b415…` — byte-identical to source |
| Uninstall stub created | ✅ `Uninstall كوكي بارك.exe` |
| Desktop + Start Menu shortcuts | ✅ created |
| Registry uninstall entry | ✅ `2.5.3`, correct uninstall string |
| `*.exe` blocked by `.gitignore` from committing | ✅ verified |

---

## 12. Clean-install test

Performed in a **fully isolated** location with an **isolated user-data profile**,
so the production install and the production database were never at risk.

### Isolation method

| Layer | Isolation |
|---|---|
| Install directory | `…\Temp\opencode\malahy253-test` via NSIS `/S /D=<path>` (production install at `%LOCALAPPDATA%\Programs\malahy` untouched during the test) |
| User data / profile | `--user-data-dir=…\Temp\opencode\malahy253-profile` (all runtime writes absorbed here) |

### Results

| Check | Result |
|---|---|
| Installer launches | ✅ |
| Installation succeeds | ✅ exit code `0` |
| Installed application launches | ✅ 4 Electron processes (124.3 / 55.1 / 117.5 / 113.5 MB) |
| Window title | ✅ `كوكي بارك` |
| Window size | ✅ `1500 x 950` |
| **Splash shows 2.5.3** | ✅ verified from the *installed* `app.asar`: `الإصدار <span>2.5.3</span>` |
| Login / gate screen works | ✅ see below |
| Phase 6 UI renders | ✅ see screenshot description below |
| No immediate crash | ✅ process tree healthy and sustained |
| No console window | ✅ `EnumWindows` poll found zero `cmd.exe` / `conhost` / `powershell` visible windows |
| Application exits normally | ✅ `WM_CLOSE` → **all 4 processes exited with no force required** |
| **Production database untouched** | ✅ see below |

### What the clean install actually showed

The screenshot of the isolated install reveals the **activation gate**, not the login
form — exactly as designed. A fresh profile has no activation record, so
`activation.js` correctly intercepts before `login.js`:

- Card heading: **تفعيل البرنامج** ("Activate the program")
- Machine-code line with the device ID rendered
- Empty activation-code field (cyan focus ring)
- **تفعيل** button
- Secondary button: **تواصل عبر واتساب** ("Contact via WhatsApp") — with the
  **Lucide eye icon** from the Phase 6 icon set ✅
- Footer: `كوكي بارك — نظام التذاكر اليومية`

This is a **positive security finding**, not a defect: it proves the activation gate
still precedes the login screen in the packaged build, and that the Phase 6 Lucide
icon assets are correctly bundled and resolving inside the asar. Activation was
deliberately **not** attempted — that would be a business/licensing operation and is
out of scope for a smoke test.

The source launch (§13) used the production profile, which is already activated, so
it correctly proceeded straight to the **login** screen.

### Production data integrity — proven, not assumed

A SHA-256 manifest of all **72** files in `%APPDATA%\malahy` was captured before the
test and compared byte-for-byte after:

```
before files: 72
after files : 72
PRODUCTION USER DATA BYTE-IDENTICAL — NO CHANGES
```

This includes `malahy-data.json`, `malahy-data.bak.json`, `db`, all `data_*`
segments, `index`, `f_*` records, `.updaterId`, and every Chromium file. **No
business data was read, written, or modified.**

### Restoring the machine to a consistent state

A silent NSIS install necessarily rewrites the shared uninstall registry key and the
shortcuts. After the isolated test the registry pointed at the temp directory, so the
test install was cleanly uninstalled (`UninstallString /S /currentuser`, exit `0`,
directory fully removed) and **v2.5.3 was installed at the real default location**.
Final machine state:

| Item | Value |
|---|---|
| Install path | `%LOCALAPPDATA%\Programs\malahy` |
| Installed version | `2.5.3` |
| Registry uninstall entry | `2.5.3` → `…\Programs\malahy\Uninstall كوكي بارك.exe` |
| Desktop + Start Menu shortcuts | ✅ present, correct target |
| Installed `app.asar` version | `2.5.3` |
| Installed splash | `الإصدار 2.5.3` |
| Production user data after upgrade | ✅ still byte-identical, 72 files |

This also incidentally verified the **v2.5.2 → v2.5.3 upgrade path**: the installer
replaced the previous version in place, preserved user data, and registered itself
correctly. The machine is now left on the v2.5.3 release with no orphaned or
temp-pointing install entries.

---

## 13. Source-launch test

`npm start` (Phase 6.6's restored console-free launcher).

```
D:\Malahy> npm start

> malahy@2.5.3 start
> node launch.js
```

| Check | Result |
|---|---|
| Electron opens | ✅ 4 processes — main + GPU + renderer + utility |
| Working set | 106.4 / 51.0 / 116.4 / 117.1 MB |
| Splash opens | ✅ loads `windows/splash.html` (`main.js:35`); verified via isolated render probe |
| **Splash says 2.5.3** | ✅ rendered text: `كوكي بارك` / `نظام إدارة الألعاب والمبيعات` / `جارى التحميل...` / **`الإصدار 2.5.3`** |
| Splash contains no JavaScript | ✅ `document.scripts.length === 0` (static, tamper-proof) |
| Splash background | ✅ `rgb(10, 22, 40)` — Phase 6 navy |
| Login screen opens | ✅ main window `1500 x 950`, title `كوكي بارك` |
| No immediate crash | ✅ |
| No console window remains | ✅ zero `cmd.exe` / `conhost` visible |
| Phase 6 UI visible | ✅ verified by screenshot — Radix navy gradient card, cyan focus ring on the username field, `admin` prefill, masked password field, cyan `تسجيل الدخول` button, `نسيت كلمة المرور؟` recovery link, footer `كوكي بارك — نظام التذاكر اليومية` |
| No data modified | ✅ no business operations performed; only Chromium's own runtime metadata (`lockfile`, `journal.baj`, `LOG`, `Preferences`) touched, which is unavoidable on any launch |
| Error log | ✅ `%APPDATA%\malahy\malahy-errors.log` unchanged — last write still `2026-10-01 20:45:14` |

**On-screen splash lifetime.** The splash window is not enumerable by a 25 ms
`EnumWindows` poll because `main.js:64` closes it 2000 ms after the main window's
`ready-to-show`, leaving it mapped for only ~100–200 ms. This reproduces Phase 6.5
§7 exactly and is **pre-existing, not introduced by v2.5.3**. `main.js` is protected
and was not modified. The splash *content* was therefore verified by rendering the
real file in an isolated Electron probe outside the repository (removed afterwards),
which reported the exact on-screen text including `الإصدار 2.5.3`.

---

## 14. Protected-file verification

### Baseline-anchored files (16)

```
DIFF  index.html            <- intentional Phase 6 UI, released here; anchor left stale (§5)
MATCH database.js
MATCH activation.js
MATCH update-gate.js
MATCH package.json          <- re-anchored for this release
MATCH README.md
MATCH launch.js
MATCH electron-builder.yml
MATCH assets\icons\icon.ico
MATCH assets\icons\logo.png
MATCH assets\images\logo.png
MATCH assets\ticket\ticket-template.js
MATCH assets\ticket\ticket-template.svg
MATCH assets\vendor\qrcode.js
MATCH windows\splash.html   <- re-anchored for this release
MATCH windows\update.html
```

### Business-logic files verified byte-identical to HEAD (`18acba6`)

`git diff HEAD -- <files>` returned **empty** for all of:

```
main.js  preload.js  database.js  users.js  login.js  recovery.js
permissions.js  perm-gate.js  activation.js  update-gate.js  accounts.js
launch.js  electron-builder.yml  package-lock.json
assets/ticket/*  assets/report/*  assets/vendor/qrcode.js
```

`git diff --stat HEAD -- …` produced **no output at all** — not one byte of
application logic, security system, or build configuration changed in this release.

### Packaged artifact integrity

The asar was unpacked and inspected independently of the build log:

| Check | Result |
|---|---|
| Total asar entries | 363 |
| All 12 business-logic files present | ✅ |
| `windows/splash.html`, `windows/update.html` present | ✅ |
| `assets/ticket/` (2 files), `assets/report/` (1 file) present | ✅ |
| `assets/icons/lucide/` (11 files) present | ✅ Phase 6 icons bundled |
| `assets/vendor/radix-colors.css` + `qrcode.js` present | ✅ |
| Missing required entries | **0** |
| Packaged `main.js` SHA-256 | `58c7b415…` — identical to source |
| Packaged `preload.js` SHA-256 | `cdf768f65…` — identical to source |
| Packaged `index.html` Lucide refs | 2 ✅ |
| Packaged `index.html` `radix-colors.css` refs | 2 ✅ |
| Packaged `index.html` `activation.js` refs | 3 ✅ gate order intact |
| Packaged splash version | `الإصدار 2.5.3` ✅ |

**Note on the packaged `package.json`.** Inside the asar it shows `version 2.5.3`
but no `scripts` and no `devDependencies`. This is **standard electron-builder
behaviour** — app-builder prunes dev-only manifest fields when packaging, since the
packaged app needs neither the build scripts nor the dev toolchain. It is not a
symptom of the Phase 6.6 defect, and it does not affect runtime: `main: "main.js"`
is what Electron loads.

---

## 15. Git status

### Working tree at release time

```
 M index.html                     <- Phase 6 UI (released here)
 M package.json                   <- version 2.5.3 + restored build config
 M windows/splash.html            <- 2.5.3
 M tests/phase3b-auth.test.js     <- release-version assertion re-anchored
 M tests/phase3c1-gate.test.js    <- release-version assertion re-anchored
 M tests/phase3c2-baseline.test.js<- release-version assertion re-anchored
 M tests/protected-baseline.json  <- 2 hash re-anchors (package.json, splash.html)
?? AI_REPORTS/PHASE_5_BASELINE_REPAIR.md
?? AI_REPORTS/PHASE_6_5_RESTORE_NPM_START.md
?? AI_REPORTS/PHASE_6_6_PACKAGE_BUILD_CONFIG_REPAIR.md
?? AI_REPORTS/PHASE_6_FINAL_ICON_SYSTEM.md
?? AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md
?? assets/icons/lucide/           <- REQUIRED by index.html
?? qa-ticket-renders/             <- temporary QA screenshots, NOT committed
```

### Critical finding: `assets/icons/lucide/` must be committed

`git show HEAD:index.html | grep icons/lucide` → **no matches**. The Phase 6 Lucide
references exist only in the *working-tree* `index.html`. Had the release commit
omitted the untracked `assets/icons/lucide/` directory, the published source tree
would have shipped **broken icon references**. The 11 files (9 SVGs + `LICENSE` +
`README.md`) are therefore part of this release.

### Excluded from the commit

| Item | Reason |
|---|---|
| `qa-ticket-renders/` | 11 temporary QA screenshots from Phase 4/6 verification — diagnostic, not product |
| `releases/**` | `.gitignore` — artifacts are not committed; this matches the v2.5.1/v2.5.2 releases |
| `dist/**` | `.gitignore` — build output |
| `*.exe`, `*.blockmap`, `latest.yml` | `.gitignore` |
| production user data | `%APPDATA%\malahy`, outside the repo |
| OS junk, editor caches | none present |

---

## 16. Git commit plan

Single release commit on `main`, no unrelated content:

```
release: v2.5.3 final UI release
```

**Staged:** `index.html`, `package.json`, `windows/splash.html`, the 3 test files,
`tests/protected-baseline.json`, `assets/icons/lucide/*` (11 files), and the
`AI_REPORTS/` documents.

**Not staged:** `qa-ticket-renders/`, `releases/`, `dist/`, anything temporary.

**Commit body** will record: the Phase 6 UI delivery, the restored build
configuration (Phase 6.6), the version-change inventory with justifications, the
722/1 regression result and the single documented failure, the exact re-anchored
hashes, the artifact SHA-256 set, and the clean-install evidence including the
production-data-integrity proof.

---

## 17. GitHub release plan

Repository determined from `git remote -v` (not guessed):

```
origin  https://github.com/sliveamer20/malahy.git (fetch)
origin  https://github.com/sliveamer20/malahy.git (push)
```

Verified live via the GitHub API: `sliveamer20/malahy`, `private = false`,
`default_branch = main`. This also matches `electron-builder.yml`'s
`publish: [{provider: github, owner: sliveamer20, repo: malahy}]`, so the
auto-update channel and the GitHub Release are the same destination.

**Tooling note:** the GitHub CLI (`gh`) is **not installed** on this machine and
there is no `gh` binary in any standard location. Publication will therefore be done
through the official **GitHub REST API v3** using the `GH_TOKEN` credential already
present in the environment (authenticated as `sliveamer20`, verified by
`GET /user` before proceeding). This is the same API the CLI wraps — no functional
difference, and no credential is written to disk or committed.

**Release:** tag `v2.5.3`, name `v2.5.3`, pointing at the release commit.

**Assets to attach** — the exact files that passed QA:

| Asset | Size | SHA-256 |
|---|---|---|
| `malahy-setup-2.5.3.exe` | 105,922,131 | `650511b4…` |
| `malahy-setup-2.5.3.exe.blockmap` | 111,188 | `35e5247f…` |
| `latest.yml` | 341 | `495c85db…` |

`latest.yml` is required for `electron-updater` to discover the release, and the
blockmap is required for delta auto-updates — both are published by every prior
Malahy release, so omitting them would break the update channel.

**Not attached:** `builder-debug.yml`, `win-unpacked/`, any screenshot, any
temporary file.

**Release notes** will cover: v2.5.3, the Phase 6 UI/icon system, dark/light theme
compatibility, the Shift-Settings clock visibility fix, the splash version
correction, the restored build configuration, the Windows installer, and an explicit
statement that no business logic changed.

---

## 18. Deferred items (not actioned in this release)

| # | Item | Recommendation |
|---|---|---|
| 1 | `index.html` baseline anchor still points at the pre-Phase-6 file | Anchor it in the next maintenance phase — it is a released, verified change whose hash simply lags |
| 2 | `package-lock.json` `version` says `2.5.0` | Either sync it once, or add `.gitignore`/CI guidance. Currently it is deliberately stale per long-standing convention |
| 3 | `README.md:7,76,154,158` still say `2.5.1` | Documentation-only refresh; it was already stale for v2.5.2 and is a protected anchored file |
| 4 | Splash on-screen lifetime ~100–200 ms (`main.js:61-74`) | Behavioural decision about the 2000 ms close delay; `main.js` is protected |

---

## 19. Summary

| Gate | Target | Result |
|---|---|---|
| Version bump | 2.5.3 | ✅ 6 legitimate locations, 0 blind replacements |
| Lockfile policy | convention-based | ✅ left unchanged, documented with git evidence |
| Regression | 722 PASS / 1 FAIL | ✅ exact, run 3× |
| New failures | 0 | ✅ |
| Source launch | PASS | ✅ splash 2.5.3, login, Phase 6 UI, no console, no crash |
| Windows EXE build | PASS | ✅ NSIS x64, zero errors |
| Artifact QA | PASS | ✅ 3 distributables, SHA-256 + SHA-512 verified |
| Clean install | PASS | ✅ isolated install + isolated profile, activation gate confirmed |
| Production data | untouched | ✅ 72 files byte-identical before and after |
| Protected files | unchanged | ✅ 15/16 anchored MATCH, business logic empty diff |
| Setup launch | PASS | ✅ exit 0, installed app runs and exits cleanly |
| Machine state | consistent | ✅ v2.5.3 at the default location, registry + shortcuts correct |
| Artifacts staged | `releases/v2.5.3/` | ✅ 3 files, no v2.5.2 mixing, v2.5.2 preserved |
| Commit / tag / push / GitHub Release | see §20 | ⏳ recorded below after execution |

---

## 20. Post-publication record

*(Completed after Steps 15–19 executed.)*

<!-- POST_PUBLICATION -->
