# Phase 2 — Verify Update Data Preservation vs Full Uninstall Cleanup

**Date:** 2026-10-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Version:** v2.5.3 (**unchanged** — no bump, no release build, no commit, no tag, no push)
**Authorisation:** Verification and narrowly scoped test improvements only.

**Outcome: ✅ 73/73 behavioural assertions PASS. Full regression 763 PASS / 0 FAIL. Production data byte-identical.**

---

## 1. The update path vs the uninstall path — established from source, not inferred

This was the primary question, and the instruction was explicit: *do not infer that data is preserved merely because no deletion code appears in the application.* The application code contains no deletion logic at all — deletion lives entirely in the NSIS uninstaller. So the distinction had to be proven at the NSIS level.

### 1.1 The single switch: `--updated`

`node_modules/app-builder-lib/templates/nssis/uninstaller.nsh:216-248`

```nsis
Var /GLOBAL isDeleteAppData
StrCpy $isDeleteAppData "0"

${GetParameters} $R0
${GetOptions} $R0 "--delete-app-data" $R1
${if} ${Errors}                          ; ← no --delete-app-data passed
  !ifdef DELETE_APP_DATA_ON_UNINSTALL    ; ← defined, because our config sets the flag
    ${ifNot} ${isUpdated}                ; ← THE GUARD
      StrCpy $isDeleteAppData "1"        ; ← only now does deletion arm
    ${endif}
${else}
  StrCpy $isDeleteAppData "1"
${endif}

${if} $isDeleteAppData == "1"
  RMDir /r "$APPDATA\${APP_FILENAME}"
  ...
```

`isUpdated` (`installer.nsi`):
```nsis
!macro _isUpdated _a _b _t _f
  ${StdUtils.TestParameter} $R9 "updated"
  StrCmp "$R9" "true" `${_t}` `${_f}`
```

### 1.2 Who passes `--updated`, and when

**During an update**, the new installer removes the old one — `include/installUtil.nsh:202-207`
(comment is upstream's own):

```nsis
  ${if} ${isDeleteAppData}
    StrCpy $0 "$0 --delete-app-data"
  ${else}
    # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed
    StrCpy $0 "$0 --updated"
  ${endif}
```
followed by `installUtil.nsh:224`:
```nsis
ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
```

**When the user uninstalls from Windows**, the uninstaller is launched from the registry
`UninstallString` / `QuietUninstallString`:
```
"...\Uninstall كوكي بارك.exe" /currentuser
```
— **no `--updated`**, so `${isUpdated}` is false, `$isDeleteAppData` becomes `"1"`, and the data is deleted.

### 1.3 The application's own update call chain (traced end to end)

| Step | Source | Result |
|---|---|---|
| 1 | `main.js` — `autoUpdater.quitAndInstall()` (update gate, line 503; in-app update, line 449) | `BaseUpdater.quitAndInstall(isSilent=false, isForceRunAfter=false)` |
| 2 | `BaseUpdater.js:13-27` | `install(false, this.autoRunAppAfterInstall)` |
| 3 | `NsisUpdater.doInstall()` — `NsisUpdater.js:101-131` | builds `args` |
| 4 | `NsisUpdater.js:107-122` | `["--updated"]` + `"/S"` if silent + `"--force-run"` if requested + `/D=<dir>` + `--package-file=…` |

Two concrete variants Malahy can produce:

| Variant | Args | `--updated`? |
|---|---|---|
| Gate / in-app (`quitAndInstall()`) | `--updated --force-run /D=<dir> --package-file=…` | **yes** |
| On-quit (`BaseUpdater.js:88` → `install(true,false)`) | `--updated /S /D=<dir> --package-file=…` | **yes** |

**Conclusion: every update path carries `--updated`; the user-initiated uninstall path does not.**
That single flag is the entire difference. Proven from source, then confirmed behaviourally in §3.

### 1.4 Confirmed configuration

| Item | Value | Source |
|---|---|---|
| `nsis.deleteAppDataOnUninstall` | `true` | `electron-builder.yml:46` |
| Build emits `DELETE_APP_DATA_ON_UNINSTALL` | yes (both makensis passes) | Phase-1 build log |
| `APP_PACKAGE_NAME` | `malahy` | `NsisTarget.js:171` |
| `APP_FILENAME` | `malahy` | `targetUtil.js:40-42` |
| Resolved `userData` | `%APPDATA%\malahy\` | `database.js:12`, verified on disk |
| `package.json` version | `2.5.3` | unchanged |
| `FLOOR_VERSION` | `2.5.1` | `update-gate.js:14`, unchanged |

---

## 2. Test environment and isolation

| Aspect | Detail |
|---|---|
| Isolation method | Disposable local Windows account **`malahyqa3`**, created and deleted for this phase |
| Why an account and not a folder | `%APPDATA%\malahy` is fixed by `package.json` `name` and is not redirectable by any electron-builder setting or CLI flag; an account gives a genuinely empty `%APPDATA%` |
| Installer used | `dist\malahy-setup-2.5.3.exe` — the **local test artifact** from the previous phase. **Published release installers under `releases\` were deliberately NOT used** (production artifacts). |
| Production install | Never uninstalled, never launched, never modified by the test |
| Production data | Never opened or written; verified by SHA-256 before and after (§6) |
| Canary | `%APPDATA%\malahyqa3\OTHERAPP_CANARY\keepme.txt` — stands in for an unrelated application |
| Script | `D:\Malahy_backup_20261011\phase2-update-vs-uninstall.ps1` (run elevated; one UAC approval) |
| Raw log | `D:\Malahy_backup_20261011\phase2-test-log.txt` |
| Cleanup | Both `malahyqa2` and `malahyqa3` accounts **and** profiles deleted; verified absent |

### Synthetic data seeded (BOM-free, JSON)

| Record | Key | Value |
|---|---|---|
| Marker | `QA_MARKER` | `QA-UPDATE-PRESERVE-ONLY` |
| Unique fake ticket | `malahy_pos_txlog_v1[0]` | `no: QA-UPD-TICKET-0001`, `total: 99.99` |
| Fake daily register | `malahy_daily_reg_v1[0]` | `day: 2026-01-01`, `tag: QA-UPD-REGISTER` |
| Fake employee / payroll | `malahy_employees_v1[0]` | `name: QA-UPD-EMPLOYEE`, `salary: 4200` |
| Fake settings value | `malahy_pos_settings_v1.vendor` | `QA-UPD-SETTING` |
| Fake user | `malahy_users_v1.admin.id` | `QA-UPD-USER` |

---

## 3. Results

### 3.1 Part A — Normal update (data must survive)

| # | Step | Assertions | Result |
|---|---|---|---|
| A0 | Clean slate (fresh profile) | 1 | ✅ |
| A1 | Install into the isolated profile | 3 | ✅ |
| A2 | Seed synthetic records (verified BOM-free: `first3=0x7B0D0A`) | 6 | ✅ |
| A3 | **Launch the app** on the seeded profile | 7 | ✅ |
| A4 | **REAL UPDATE:** `installer.exe --updated /S /D=<dir>` — exact electron-updater command line | 10 | ✅ |
| A4b | **Launch the app on the updated install** | 7 | ✅ |
| A5 | **Mechanism:** run the installed uninstaller with `--updated` | 9 | ✅ |
| A6 | Plain re-install over a removed install | 7 | ✅ |

Key evidence, verbatim from the log:

```
[21:06:12] running: ...\malahy-setup-2.5.3.exe --updated /S /D=C:\Users\malahyqa3\AppData\Local\Programs\malahy
[21:06:25] installer exit=0
[21:06:29] RESULT A4 update exit code 0                PASS
[21:06:29] RESULT A4 app still installed               PASS
[21:06:29] RESULT A4 uninstaller present               PASS
[21:06:33] RESULT A4 afterUpdate : marker               PASS
[21:06:33] RESULT A4 afterUpdate : ticket               PASS
[21:06:33] RESULT A4 afterUpdate : dailyRegister        PASS
[21:06:33] RESULT A4 afterUpdate : employee             PASS
[21:06:33] RESULT A4 afterUpdate : settings             PASS
[21:07:44] launched, 4 process(es) alive after 70s      ← app runs on the UPDATED install
[21:07:48] RESULT A4b afterUpdateRun : ticket            PASS   ← seeded ticket still available
```

**A5 is the decisive isolation of the mechanism.** It runs the installed uninstaller *directly*
with `--updated` — exactly what `uninstallOldVersion` does during an update — and confirms the
install directory is removed while **every seeded record survives**:
```
[21:07:56] RESULT A5 install dir removed                    PASS
[21:07:56] RESULT A5 afterUpdatedUninstall : marker         PASS
[21:07:56] RESULT A5 afterUpdatedUninstall : ticket         PASS
[21:07:56] RESULT A5 canary intact                          PASS
```

`A6` additionally shows a plain re-install also passes `--updated` (because `installUtil.nsh:202`
only adds `--delete-app-data` when that flag was supplied, which a normal user install never is).

### 3.2 Part B — Full uninstall (data must be deleted)

| # | Step | Assertions | Result |
|---|---|---|---|
| B1 | Re-seed so there is definitely data to destroy | 6 | ✅ |
| B2 | Run the **real Windows uninstall command** (the installed `Uninstall كوكي بارك.exe /currentuser /S`) | 6 | ✅ |

```
[21:08:10] using: C:\Users\malahyqa3\AppData\Local\Programs\malahy\Uninstall كوكي بارك.exe /currentuser /S
[21:08:16] exit=0
[21:08:20] RESULT B2 %APPDATA%\malahy REMOVED        PASS   ← userData deleted
[21:08:20] RESULT B2 unrelated canary intact         PASS   ← other app untouched
[21:08:20] RESULT B2 %APPDATA% parent intact         PASS   ← shared parent untouched
[21:08:20] RESULT B2 install dir removed             PASS
[21:08:20] RESULT B2 other profile folders kept      PASS
```

### 3.3 Part C — Reinstall after full uninstall

| # | Step | Assertions | Result |
|---|---|---|---|
| C1 | Reinstall the same test package | 2 | ✅ |
| C2 | Launch the app so it creates its database | 2 | ✅ |
| C3 | Fresh DB must contain none of the seeded records | 8 | ✅ |

```
[21:09:45] launched, 4 process(es) alive after 75s
[21:09:49] RESULT C3 marker absent            PASS
[21:09:49] RESULT C3 ticket absent            PASS
[21:09:49] RESULT C3 dailyRegister absent     PASS
[21:09:49] RESULT C3 employee absent          PASS
[21:09:49] RESULT C3 settings absent          PASS
[21:09:49] RESULT C3 user absent              PASS
[21:09:49] RESULT C3 ticket log key absent    PASS   ← no malahy_pos_txlog_v1 at all
[21:09:49] fresh DB keys: malahy_users_v1,malahy_pos_games_v1,malahy_pos_pass_v1
```

### 3.4 Total

> **73 assertions — 73 PASS, 0 FAIL**

---

## 4. Genuinely executed vs NOT TESTED

### 4.1 Genuinely executed

| Requirement | Status |
|---|---|
| A1–A6 (install, seed, launch, real update, post-update launch, `--updated` uninstaller, re-install) | ✅ executed |
| B1–B2 (seed, real Windows uninstall command) | ✅ executed |
| C1–C3 (reinstall, launch, fresh-DB verification) | ✅ executed |
| The exact electron-updater command line (`--updated /S /D=<dir>`) | ✅ executed |
| The `--updated` uninstaller mechanism in isolation | ✅ executed |
| Interactive (non-`/S`) uninstaller | ⚠️ see below |

### 4.2 NOT TESTED

| Scenario | Why |
|---|---|
| **Interactive / non-silent update** (`--updated --force-run` **without** `/S`, which is the variant Malahy's update gate actually uses) | The assisted installer shows a wizard that cannot be clicked unattended. The `--force-run` variant **was** executed in an earlier run and preserved all seeded data; it then hung for 7.5 min because `Start-Process -Wait` waits on the force-run child, so it was replaced by the `/S` variant plus an explicit post-update launch (A4b). `--updated` — the only flag that gates deletion — is identical in both. |
| **Update from the published v2.5.3 (which lacks the flag) to a flag-carrying build** | Would require installing a **published release artifact**, which this phase forbids ("Do not use a production installer"). Analysed statically instead: in that direction the uninstaller that runs is the *old* one, which lacks `DELETE_APP_DATA_ON_UNINSTALL` entirely, so it cannot delete data regardless. The stricter case — an install that *has* the flag being updated — is exactly what A4/A5/A6 test. |
| **Differential (blockmap) download update** | Requires a real GitHub release and the auto-download pipeline. Not exercised. The installer's behaviour once launched is identical; only the transport differs. |
| **Real physical printer behaviour** | Out of scope for this phase. |
| **Multi-user (`perMachine`) update** | `perMachine: false`; not applicable to the shipped configuration. |

---

## 5. Printer regression and baseline integrity

### 5.1 Printer suite

```
tests/phase1-printer-feedback.test.js    PASS=40  FAIL=0
```

No regression from the Phase 1 fix.

### 5.2 Full regression suite

| | Before Phase 2 | After Phase 2 |
|---|---|---|
| PASS | 756 | **763** |
| FAIL | 7 | **0** |

Per-file: `phase3b-auth` 61, `phase3c1-gate` 48, `phase3c2-baseline` 63 (previously 60/45/60 with
failures); all others unchanged. No new failures.

### 5.3 Baseline hash re-anchor — justification and evidence

**The 7 failures were investigated, not blindly re-anchored.** Three separate tests read
`tests/protected-baseline.json`.

**Finding 1 — which files were stale.** Captured before any edit:
```
FAIL  protected file unchanged: README.md
FAIL  protected file unchanged: electron-builder.yml
FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html, README.md, electron-builder.yml
```
→ `README.md` and `electron-builder.yml` (approved uninstall-cleanup phase), and `index.html`
(changed in Phase 3C *and* Phase 1). **Not one of them was caused by unexpected drift.**

**Finding 2 — the drift is fully accounted for.** Working tree vs `git HEAD` (the v2.5.3 release):

| File | vs HEAD | Diff content |
|---|---|---|
| `index.html` | MODIFIED | exactly 4 lines — the Phase 1 `no-printer-selected` branch |
| `main.js` | MODIFIED | exactly the Phase 1 printer fix |
| `electron-builder.yml` | MODIFIED | exactly +7 lines — the `deleteAppDataOnUninstall` block |
| `README.md` | MODIFIED | exactly the feature bullet, path correction, data-loss warning |
| `database.js`, `activation.js`, `update-gate.js`, `package.json`, `launch.js`, `preload.js`, all `assets/**`, all `windows/**` | **identical to HEAD** | — |

**Finding 3 — Phase 1 changes did not leak into protected files.** The `README.md` and
`electron-builder.yml` diffs contain no printer-related content.

**Re-anchor applied — 3 entries only:**

| File | Before | After |
|---|---|---|
| `index.html` | `854cff97…c5a2` | `3bdc0ea5…414f1` |
| `README.md` | `4c9aa5ee…1772` | `908309d5…53b5d` |
| `electron-builder.yml` | `2396654f…1db` | `f4927bbe…3430` |

`git diff --stat tests/protected-baseline.json` → **4 insertions, 4 deletions** (3 hash lines plus a
trailing newline). The other **13 entries were left untouched**.

**Judgement call, stated plainly:** anchoring `index.html` to a working tree that includes my own
uncommitted Phase 1 change is a decision, not a mechanical fix. I did it because (a) `index.html`
is declared "intended to change" by `phase3c1-gate.test.js` and `phase3c2-baseline.test.js`, so its
stale entry had already been neutralised in two of three consumers since Phase 3C; (b) `phase3b-auth`
had no such exemption, so its guard was silently disabled for several phases; (c) the diff evidence
above shows the current content is exactly HEAD plus one reviewed 4-line change. Anchoring restores
a guard that will now catch any *future* unintended drift. **If you prefer `index.html` to remain
un-anchored, reverting that one line is safe — the other two entries are independently justified.**

**No production logic was changed to make tests pass.** The only non-report change in this phase is
this baseline file.

---

## 6. Production integrity

| Check | Value |
|---|---|
| `%APPDATA%\malahy` before Phase 2 | 72 files / 9,264,937 bytes / `183C0FE4FF97FA9B7B84A72A749DDC1936B2CBD29F2C699F24AB811CD55DC5D4` |
| `%APPDATA%\malahy` after Phase 2 | **72 files / 9,264,937 bytes / `183C0FE4FF97FA9B7B84A72A749DDC1936B2CBD29F2C699F24AB811CD55DC5D4` |
| Production install dir | present, untouched |
| Production app uninstalled? | **No** |
| `releases\v2.5.3\*` | untouched (2026-10-06 timestamps, original sizes) |
| Test accounts / profiles | both removed and verified absent |

---

## 7. Activation anomalies

### 7.1 Observed in this phase: **none**

The fresh database after reinstall contains exactly:
```
malahy_users_v1, malahy_pos_games_v1, malahy_pos_pass_v1
```
with `malahy_activated = ''`, `activated = ''`, `activationVersion = ''` — i.e. **no activation
state at all**, which is the correct clean-install result.

### 7.2 The Phase 1 anomaly did NOT reproduce

In the earlier uninstall phase the fresh DB contained `malahy_activated: "1"`. Here it is absent
entirely. I investigated then (the only writer is `activation.js:40`, `markActivated()`, reachable
only from `doValidate()` on Enter/click; `decodeKey()` returns a non-empty `"01229413272"`; the
packaged `app.asar` matches source; the run was unattended) and could not determine the trigger.

**This phase does not resolve it — it only establishes that it is not deterministic.** No
activation logic was inspected, changed, or tested here, as instructed.

---

## 8. Test-harness defects found (in my script, not in Malahy)

Three bugs produced false results and were corrected. Worth recording so they are not mistaken for
application defects:

1. **BOM in seeded data → false "data lost" (5 failures).** PowerShell 5.1's
   `Set-Content -Encoding UTF8` prepends a BOM. `database.js` does a bare `JSON.parse`, which throws;
   `readAll()` then creates a `.corrupt-*.json` snapshot and returns `{}`, and the app overwrites the
   seed. Confirmed by replicating `readAll()` in Node:
   ```
   --- WITHOUT BOM (how the app itself writes) --- result: {"QA_MARKER":"QA-UPDATE-PRESERVE-ONLY",...}
   --- WITH BOM (PS 5.1 Set-Content) ---           JSON.parse THREW → result: {}
                                                  database.js created corruption snapshot: true
   ```
   **Not a production risk:** the app writes via `fs.writeFileSync(..., "utf8")`, which emits no BOM.
   Worth noting only as a robustness observation — a BOM'd `malahy-data.json` would silently reset
   business data to empty.

2. **Stale locked profile → 14 cascaded failures.** A previously aborted run left
   `C:\Users\malahyqa2` undeletable; installers then exited `0` while writing nothing, so every
   downstream assertion was meaningless. Fixed with a fresh account plus ownership-takeover cleanup
   and an abort guard that stops the run if the install directory is missing.

3. **PowerShell 5.1 incompatibilities.** `catch (_)` (PS7-only), `[math]::Round(x/1MB,1)` parsing,
   and a no-BOM script file whose UTF-8 em-dash (`E2 80 94`) decodes in CP1252 as `â€”` — the trailing
   `”` (U+201D) is treated by PowerShell as a **string terminator**, corrupting the line. Fixed by
   writing the script ASCII-only with a UTF-8 BOM. A `trap` block then masked the real error, so it
   was replaced with a `Step`-level handler that logs the message and line number.

---

## 9. Remaining limitations and risks

1. **The interactive update variant was not executed unattended** (`--updated` **without** `/S`).
   See §4.2. The `--updated` gate is identical; the earlier `--force-run` run preserved all data.
2. **The no-flag → flag upgrade direction is argued statically, not executed**, because it requires a
   published production installer. The argument is short and strong: the uninstaller that runs is
   the old one, which lacks `DELETE_APP_DATA_ON_UNINSTALL` and therefore cannot delete anything.
3. **Differential download updates were not exercised** (no real release).
4. **"Seeded ticket is still available" is verified at the data layer**, not by navigating the UI.
   The ticket remained in `malahy_pos_txlog_v1` across a real launch and a real update; confirming
   it renders in the ticket list would need UI automation.
5. **`index.html` baseline re-anchor is a judgement call** — see §5.3.
6. **The activation anomaly from Phase 1 remains unexplained** and is shown to be non-deterministic.
7. **`%LOCALAPPDATA%\malahy-updater` (202 MB) is still not removed on uninstall.** Carried forward
   from the previous phase; a download cache, not user data.
8. **The fix is still not in any shipped build.** `package.json` is `2.5.3`; the installed app is the
   published v2.5.3, whose uninstaller still **preserves** data.

---

## 10. Stopping point

Verification complete. **No version bump, no release build, no commit, no tag, no push, no publish.**
Production user data verified byte-identical (SHA-256 unchanged). Production installer never run or
uninstalled. Test accounts and profiles removed.

Awaiting review before any release preparation.
