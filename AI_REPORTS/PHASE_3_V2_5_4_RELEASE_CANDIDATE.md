# Phase 3 — Malahy v2.5.4 Release Candidate (Not Published)

**Date:** 2026-10-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Current published release:** v2.5.3 (unchanged)
**Target:** v2.5.4 — **local release candidate only**

**Outcome: ✅ Release candidate built and verified. 67/67 behavioural assertions PASS. Regression 763 PASS / 0 FAIL. Nothing committed, tagged, pushed, or published.**

---

## 1. Exact commands run

```powershell
# verification
node tests\phase1-printer-feedback.test.js
node tests\*.test.js                      # all 15 suites
node -e "…sha512/size vs latest.yml…"    # artifact integrity
node verify-artifacts.js                  # asar + splash + FLOOR_VERSION
node verify-blockmap.js                   # blockmap structure + coverage

# build (publishing DISABLED by the repo's own dist script)
npm run dist        # == electron-builder --win --publish never

# behavioural verification (elevated, disposable account)
powershell -File D:\Malahy_backup_20261011\phase3-verify-254.ps1
```

`npm run publish` was **never** executed. No `git` write command was executed.

---

## 2. Changed files

| File | Change | Lines |
|---|---|---|
| `package.json` | `"version": "2.5.3"` → `"2.5.4"` | 1 |
| `windows/splash.html` | splash version `2.5.3` → `2.5.4` | 1 |
| `tests/phase3b-auth.test.js` | version assertion → `2.5.4` | 1 |
| `tests/phase3c1-gate.test.js` | version assertion → `2.5.4` | 1 |
| `tests/phase3c2-baseline.test.js` | version assertion → `2.5.4` | 1 |
| `tests/phase1-printer-feedback.test.js` | `app.getVersion()` stub → `"2.5.4"` | 1 |
| `tests/protected-baseline.json` | re-anchored `package.json`, `windows\splash.html` | 2 |

Carried over from earlier approved phases (unchanged here): `main.js`, `index.html`,
`electron-builder.yml`, `README.md`.

**`package-lock.json` was deliberately NOT changed.** History evidence:

| Tag | `package.json` | `package-lock.json` root version |
|---|---|---|
| v2.5.0 | 2.5.0 | 2.5.0 |
| v2.5.1 | 2.5.1 | **2.5.0** |
| v2.5.2 | 2.5.2 | **2.5.0** |
| v2.5.3 | 2.5.3 | **2.5.0** |

The lockfile root version has been frozen at `2.5.0` for four releases. Following the repository's
established convention. `git diff --name-only HEAD -- package-lock.json` → empty.

### Baseline re-anchor justification

| File | Before | After | Reason |
|---|---|---|---|
| `package.json` | `a6befdc2…c1cc1` | `6954e7d8…2f59f3` | deliberate version bump (same action the v2.5.2 release commit recorded) |
| `windows\splash.html` | `bce507dc…f952d` | `b061c9d3…5e1e` | deliberate version bump in the splash |

The other **14 entries were left untouched**. No test was weakened to make anything pass; the three
version assertions were *updated to the new intended version*, which is the established pattern.

**Unchanged by design:** `update-gate.js` `FLOOR_VERSION` stays `2.5.1`. Publishing 2.5.4 already makes
it mandatory (the gate treats the latest published release as required); raising the floor would
additionally brick any machine that cannot reach GitHub. No justification for that here.

---

## 3. Build results

### 3.1 Command and outcome

```
> malahy@2.5.4 dist
> electron-builder --win --publish never
  • electron-builder  version=26.15.3
  • building  target=nsis file=dist\malahy-setup-2.5.4.exe archs=x64 oneClick=false perMachine=false
  • building block map  blockMapFile=dist\malahy-setup-2.5.4.exe.blockmap
```

### 3.2 Artifacts

| Artifact | Size | Built |
|---|---|---|
| `dist/malahy-setup-2.5.4.exe` | 105,922,258 B | 2026-10-11 21:24:34 |
| `dist/malahy-setup-2.5.4.exe.blockmap` | 111,291 B | 2026-10-11 21:24:39 |
| `dist/latest.yml` | 341 B | 2026-10-11 21:24:39 |

| Hash (hex) | Value |
|---|---|
| **SHA-256** | `09ec6bed0e07392dac679dcf52bd60285f55ac523e33646b0d7c40112394b8d9` |
| **SHA-512** | `c67a45258efb73958aab1a69d1d82aa137c94d7791c235a8268a83a54199c1a3834c5eadfc752937e683d5dab1a0816216ed0eb8d78a93c9a039bc63f40fad34` |

### 3.3 `latest.yml` — independently verified against the real installer bytes

```yaml
version: 2.5.4
files:
  - url: malahy-setup-2.5.4.exe
    sha512: xnpFJY77c5WKqxpp0dgqoTfJTXeRwjWoJoqDpUGZwaODTF6t/HUpN+aD1dqxoIFiFu0OuNeKk8mgObxj9A+tNA==
    size: 105922258
path: malahy-setup-2.5.4.exe
sha512: xnpFJY77c5WKqxpp0dgqoTfJTXeRwjWoJoqDpUGZwaODTF6t/HUpN+aD1dqxoIFiFu0OuNeKk8mgObxj9A+tNA==
releaseDate: '2026-10-11T18:24:39.546Z'
```

| Field | Result |
|---|---|
| version | `2.5.4` — **MATCH** |
| path | `malahy-setup-2.5.4.exe` — **MATCH** |
| size | 105,922,258 — **MATCH** (computed from file bytes) |
| sha512 | **MATCH** (recomputed from the installer, base64) |

### 3.4 Blockmap

| Property | Value |
|---|---|
| Format version | `2` |
| Schema | `{ name, offset, checksums, sizes }` — **identical keys** to the published v2.5.3 blockmap |
| Files / blocks | 1 / 5042 (v2.5.3 had 5039) |
| `offset` | `0` |
| `sizes` total | 105,922,258 — **MATCH** installer length |
| Coverage | gapless: cumulative `sizes` end exactly at the installer length |
| Max block | 32,768 B (electron's variable differential chunking) |

**Honest limitation:** I verified blockmap **structure, schema and byte coverage**, but **not** the
per-block checksums. Each checksum is a 24-char base64 value (18 bytes) produced by app-builder's
internal hashing, which I did not reverse-engineer. A definitive check requires an actual
differential download, which needs a real GitHub release — out of scope here.

### 3.5 Packaged application contents

| Check | Result |
|---|---|
| `app.asar` size | 5,406,007 B |
| asar contains `no-printer-selected` | **true** (Phase 1 fix shipped) |
| asar contains the Arabic no-printer message | **true** |
| splash shows `2.5.4` | **true** |
| `update-gate.js` still contains `FLOOR_VERSION = "2.5.1"` | **true** (unchanged, as intended) |
| installer PE `ProductVersion` / `ProductName` | `2.5.4.0` / `كوكي بارك` |
| packaged app exe PE `ProductVersion` | `2.5.4.0` |
| `resources/app-update.yml` | `owner: sliveamer20, repo: malahy, provider: github, updaterCacheDirName: malahy-updater` |

### 3.6 Signature

| Item | Value |
|---|---|
| `Get-AuthenticodeSignature` status | **`NotSigned`** |

The build log shows electron-builder *attempting* `signing with signtool.exe` for
`app.exe`, `elevate.exe`, `__uninstaller.exe` and the installer, followed by
`no signing info identified, signing is skipped (signHook=false cscInfo=null)`.
This is the **same situation as every previous release** (no certificate is configured in this
repo), so it is not a regression — but the v2.5.4 artifacts are **not code-signed**.

---

## 4. Regression totals

| Suite | PASS | FAIL |
|---|---|---|
| `phase1-printer-feedback.test.js` | 40 | 0 |
| `phase3b-auth.test.js` | 61 | 0 |
| `phase3b-ipc.test.js` | 15 | 0 |
| `phase3c1-dom.test.js` | 37 | 0 |
| `phase3c1-gate.test.js` | 48 | 0 |
| `phase3c1-ipc.test.js` | 19 | 0 |
| `phase3c1-session.test.js` | 30 | 0 |
| `phase3c2-baseline.test.js` | 63 | 0 |
| `phase3c2-gate.test.js` | 44 | 0 |
| `phase3c2-ipc.test.js` | 49 | 0 |
| `phase3c2-perms.test.js` | 39 | 0 |
| `phase3c3-accounts.test.js` | 92 | 0 |
| `phase3c3-ui.test.js` | 76 | 0 |
| `phase3c4-recovery.test.js` | 79 | 0 |
| `phase4-daily-report.test.js` | 71 | 0 |
| **TOTAL** | **763** | **0** |

All protected-file checks pass. The 7 previously-known baseline failures remain resolved (Phase 2).
No production logic was changed to make a test pass.

---

## 5. Install / update / uninstall evidence

Isolation: disposable local Windows account **`malahyqa4`**, created and deleted for this phase.
The production account, its install and its data were never modified.
Raw log: `D:\Malahy_backup_20261011\phase3-test-log.txt`.

Synthetic data seeded: marker `QA-V254-RELEASE-CANDIDATE`, ticket `QA254-TICKET-0001`, daily
register `QA254-REGISTER`, employee `QA254-EMPLOYEE`, settings `QA254-SETTING`, user `QA254-USER`.

| Part | Step | Assertions | Result |
|---|---|---|---|
| **A — clean install of v2.5.4** | install, version check, first launch, fresh-DB check | 9 | ✅ |
| **B — real update v2.5.3 → v2.5.4** | install 2.5.3, seed, launch, update, launch again | 35 | ✅ |
| **C — full uninstall** | seed, real Windows uninstall command | 12 | ✅ |
| **D — reinstall after full uninstall** | reinstall, launch, clean-DB check | 11 | ✅ |
| | | **67** | **67 PASS / 0 FAIL** |

### 5.1 The version transitions (from PE `ProductVersion`)

```
[21:38:28]  PE ProductVersion = '2.5.4.0'   installed app PE ProductVersion = 2.5.4   ← clean install
[21:40:01]  PE ProductVersion = '2.5.3.0'   installed version = 2.5.3              ← upgrade starting point
[21:41:34]  PE ProductVersion = '2.5.4.0'   installed version now = 2.5.4           ← THE UPDATE WORKED
```

### 5.2 The update preserved all business data

```
[21:41:34] running: ...\malahy-setup-2.5.4.exe --updated /S /D=C:\Users\malahyqa4\AppData\Local\Programs\malahy
[21:41:34] installer exit=0
[21:41:34] RESULT B4 update exit 0                PASS
[21:41:34] RESULT B4 app still installed          PASS
[21:41:34] RESULT B4 version is now 2.5.4         PASS
[21:41:38] RESULT B4 afterUpdate : dbFile         PASS
[21:41:38] RESULT B4 afterUpdate : marker         PASS
[21:41:38] RESULT B4 afterUpdate : ticket         PASS
[21:41:38] RESULT B4 afterUpdate : dailyRegister  PASS
[21:41:38] RESULT B4 afterUpdate : employee       PASS
[21:41:38] RESULT B4 afterUpdate : settings       PASS
[21:42:53] launched 'كوكي بارك.exe', 4 process(es) alive after 70s
[21:43:13] RESULT B5 v2.5.4 launched after update PASS
[21:43:13] RESULT B5 afterUpdateRun : ticket      PASS   ← seeded ticket still available
```

This uses the **exact electron-updater command line** (`--updated /S /D=<dir>`, per
`NsisUpdater.js:101-131`) and the **real upgrade path every existing v2.5.3 user will take**.
It closes the gap recorded as NOT TESTED in Phase 2 §4.2.

### 5.3 Full uninstall removed only Malahy-owned data

```
[21:47:xx] using: ...\Uninstall كوكي بارك.exe /currentuser /S
             RESULT C2 %APPDATA%\malahy REMOVED       PASS   ← userData deleted
             RESULT C2 unrelated canary intact        PASS   ← other app untouched
             RESULT C2 %APPDATA% parent intact        PASS   ← shared parent untouched
             RESULT C2 install dir removed            PASS
             RESULT C2 production install untouched   PASS   ← production never touched
```

### 5.4 Reinstall started clean

```
             RESULT D2 marker absent         PASS
             RESULT D2 ticket absent         PASS
             RESULT D2 dailyRegister absent  PASS
             RESULT D2 employee absent       PASS
             RESULT D2 settings absent       PASS
             RESULT D2 ticket log key absent PASS
             fresh DB keys: malahy_users_v1, malahy_pos_games_v1, malahy_pos_pass_v1
```

### 5.5 Production integrity — final

| Check | Value |
|---|---|
| `%APPDATA%\malahy\malahy-data.json` SHA-256 | `183C0FE4FF97FA9B7B84A72A749DDC1936B2CBD29F2C699F24AB811CD55DC5D4` — **identical to phase start** |
| userData | 72 files / 9,264,937 B — unchanged |
| Production install | present, version **2.5.3.0**, untouched |
| Production app launched/uninstalled | **No** |
| `releases/v2.5.3/malahy-setup-2.5.3.exe` SHA-256 | `650511B4997301FAD884B2E4B00AC3925765D1DB412A5C359F7752ED0DFFC66F` — unchanged |
| Test account `malahyqa4` + profile | removed and verified absent |

---

## 6. Unresolved limitations and risks

1. **Artifacts are not code-signed** (`NotSigned`) — same as all previous releases; no certificate is
   configured in this repository. Users will see the usual SmartScreen/"unknown publisher" prompt.
2. **Blockmap per-block checksums were not independently verified** (§3.4). A real differential
   download is the only definitive check and requires publishing.
3. **The interactive (non-`/S`) update variant was not executed unattended** — the assisted installer
   wizard needs clicks. `--updated`, the only flag that gates data deletion, is identical in both.
4. **"Ticket still available" is verified at the data layer** (the record remains in
   `malahy_pos_txlog_v1` across a real launch and a real update), not by navigating the UI.
5. **A fresh install reports no activation state** (`malahy_activated=''`, `activated=''`) — correct
   clean-install behaviour, but users will need to re-activate after a full uninstall. Documented in
   README.
6. **`%LOCALAPPDATA%\malahy-updater` (202 MB) is still not removed on uninstall** — carried forward;
   a download cache, not user data.
7. **The Phase 1 activation anomaly** (`malahy_activated: "1"` on a fresh DB) did **not** reproduce in
   either Phase 2 or Phase 3. It remains unexplained and non-deterministic.
8. **Publishing 2.5.4 is a mandatory update for every user** (the gate treats the latest published
   release as required). Machines that cannot reach GitHub will be blocked at the update screen
   unless `FLOOR_VERSION` (currently 2.5.1) is raised — which was deliberately **not** done.
9. **Version consistency is only asserted in tests, not enforced at runtime** — e.g. `splash.html`
   carries a hard-coded version that must be bumped by hand each release.

---

## 7. Stopping point — awaiting approval

**Done:** version bumped to 2.5.4, tests updated and re-anchored, full regression green, local
installer + blockmap + `latest.yml` built with publishing disabled, and the candidate verified
through clean install → real v2.5.3→v2.5.4 update → full uninstall → clean reinstall in an isolated
disposable account.

**Not done (deliberately):** no commit, no tag, no push, no GitHub release, no `npm run publish`,
no upload. HEAD is still `6df7f6c`, tags still 19.

**Before publishing, decide:**
1. Publish v2.5.4 as-is? It becomes a **mandatory update** for every user (see limitation 8).
2. Code-signing — accept `NotSigned` as in all prior releases, or configure a certificate?
3. The blocked-updates risk: accept, or raise `FLOOR_VERSION` (needs separate justification)?

Release-candidate artifacts are in `dist/`. They are **not** in `releases/` — that directory is
untouched and still holds the published v2.5.3.
