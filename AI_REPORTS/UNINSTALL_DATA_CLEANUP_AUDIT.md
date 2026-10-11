# Malahy — Uninstall Data Cleanup Audit (Phase: read-only)

**Date:** 2026-10-11
**Current stable:** v2.5.3
**Project:** `D:\Malahy`
**Scope:** Read-only inspection. **No file was modified.** Implementation is blocked pending explicit approval.

---

## 0. Executive summary

| Question | Answer |
|---|---|
| Where does Malahy store its data? | One folder: `%APPDATA%\malahy\` (on this machine `C:\Users\slive\AppData\Roaming\malahy\`) |
| Does the current v2.5.3 uninstaller delete it? | **No.** It preserves it completely. |
| Why not? | `nsis.deleteAppDataOnUninstall` defaults to `false` and the project never sets it. |
| Safest supported fix? | Add one line — `deleteAppDataOnUninstall: true` — to the `nsis:` block of `electron-builder.yml`. Upstream electron-builder then deletes exactly `%APPDATA%\malahy` inside the real Windows uninstaller. |
| Does it touch auto-update? | No — the delete block is guarded by `${ifNot} ${isUpdated}`, so in-place upgrades never wipe data. |
| Functional code changes needed? | **Zero.** No change to `main.js`, `database.js`, `preload.js`, or any business logic. |
| Blocking risks? | None. Two documented caveats: irreversible data loss (by design) and the 202 MB updater cache is not covered. |

---

## 1. Exact data locations

### 1.1 How `userData` is resolved (and why it is `malahy`, not `كوكي بارك`)

`database.js` and `main.js` both use `app.getPath("userData")`. On Windows Electron resolves
`userData` as `%APPDATA%` + the **`package.json` `name` field**, not the `productName`.

```jsonc
// package.json
{ "name": "malahy", ... }          // ← this drives the folder name
```

`electron-builder.yml` sets `productName: كوكي بارك`, but that only drives installer/shortcut/registry
display names. Confirmed empirically on this machine:

| Thing | Resolved value | Where it comes from |
|---|---|---|
| Install directory | `%LOCALAPPDATA%\Programs\malahy\` | `APP_FILENAME` (Arabic `productFilename` fails electron-builder's `/^[-_+0-9a-zA-Z .]+$/` test, so it falls back to `sanitizedName`) |
| Electron `userData` | `%APPDATA%\malahy\` | `package.json` `name` |
| Display name / shortcuts / Add-Remove-Programs | `كوكي بارك` | `productName` |

> ⚠️ **Documentation defect found:** `README.md` lines 99–101 and several older AI reports state the data
> path is `%APPDATA%\كوكي بارك\...`. That folder has never existed. The real path is `%APPDATA%\malahy\...`.
> This is part of why the cleanup target looks "wrong" at first glance — it isn't.

### 1.2 Primary data location — Malahy-owned, contains all business records

```
%APPDATA%\malahy\            →  C:\Users\<user>\AppData\Roaming\malahy\
Total size on this machine: 8.83 MB
```

**Business + state files (all created by the app):**

| File | Size | Written by | Contents |
|---|---|---|---|
| `malahy-data.json` | 44,813 B | `database.js` `writeAll()` | **The entire application database** (single JSON) |
| `malahy-data.bak.json` | 44,813 B | `database.js` `writeAll()` (line 52, copies previous file on **every** write) | Rolling automatic backup |
| `malahy-data.json.corrupt-1785117167036/046/047/050/052.json` | 6,759 B each | `database.js` `readAll()` line 29 | Corruption snapshots taken when the DB fails to parse |
| `malahy-errors.log` | 4,907 B | `main.js` `appendLog()` | Application error log |
| `.updaterId` | 36 B | `electron-updater` | Updater install identity (not business data) |

**Everything inside `malahy-data.json` — verified by parsing the live file (keys and shapes only,
no values inspected):**

| Key | Type / count | Business domain |
|---|---|---|
| `malahy_pos_txlog_v1` | array (34) | **Sales tickets** |
| `malahy_pos_history_v1` | array (3) | Sales history |
| `malahy_daily_reg_v1` | array (5) | **Daily accounting / registers** |
| `malahy_pos_gameaudit_v1` | array (18) | **Expenses / returns audit trail** |
| `malahy_pos_games_v1` | array (8) | Games catalogue |
| `malahy_pos_gamesnaps_v1` | array (6) | Sales snapshots |
| `malahy_employees_v1` | array (4) | **Payroll / employees** |
| `malahy_gift_seq_v1` | number | **Gifts** counter |
| `malahy_review_log_v1` | array (5) | Review log |
| `malahy_pos_settings_v1` | object (13) | **Settings** (sales/expense/return/gift configuration) |
| `malahy_users_v1` | object (3) | **User accounts** — admin + cashiers (password hashes, permissions, recovery WhatsApp number) |
| `malahy_pos_pass_v1`, `malahy_pos_state_v1`, `malahy_pos_seq_v1` | string/object/number | POS internal state + sequence counters |
| `activated`, `activationVersion`, `malahy_activated` | bool/int/string | **Activation state** (`activation.js`, `STORAGE_KEY = "malahy_activated"`) |

**Chromium runtime folders (Electron internals, also inside `userData`):**
`Cache/`, `Code Cache/`, `GPUCache/`, `DawnGraphiteCache/`, `DawnWebGPUCache/`, `blob_storage/`,
`Network/`, `Session Storage/`, `Shared Dictionary/`, `Local Storage/leveldb/`, `SharedStorage`,
plus `Local State`, `Preferences`, `DIPS`, `DevToolsActivePort`.

> `Local Storage/leveldb` holds one renderer value: `localStorage['malahy_theme']` (`index.html`
> lines 2304–2336) — a legacy theme preference only. All real data is in `malahy-data.json`.

### 1.3 Secondary Malahy-owned location (not business data)

```
%LOCALAPPDATA%\malahy-updater\  →  C:\Users\slive\AppData\Local\malahy-updater\
Total size on this machine: 202.24 MB
```

Declared in the built app's `resources/app-update.yml`:
```yaml
updaterCacheDirName: malahy-updater
```
Contains `installer.exe` (105 MB), `current.blockmap`, and `pending\malahy-setup-2.5.2.exe` (105 MB).
This is the electron-updater download cache — **not** user records. It is **not** removed by the
uninstaller today, and `deleteAppDataOnUninstall` does not cover it.

### 1.4 Locations the uninstaller already handles

- Install directory: `%LOCALAPPDATA%\Programs\malahy\` (removed today)
- Desktop + Start Menu shortcuts: `كوكي بارك.lnk` (removed today)
- Registry: `HKCU\...\Uninstall\fa737c1a-e10c-5b8e-a567-437d787758ca`, install registry key (removed today)

### 1.5 Confirmed NOT Malahy-owned — must never be deleted

- **PDF / CSV exports.** `main.js` `export-pdf` / `export-csv` use `dialog.showSaveDialog`, so the user
  chooses the destination (Documents, Downloads, USB…). These are **the user's** files.
- **`%APPDATA%` itself** and every other application folder inside it.
- **`%LOCALAPPDATA%\electron-builder\Cache`** — shared build cache used by other electron-builder projects.
- Anything under `%LOCALAPPDATA%\Programs\` other than `malahy`.

### 1.6 Verified absent (checked, nothing found)

- No app registry keys (`HKCU\Software\malahy`, `HKCU\Software\com.malahy.fathallah`) — `false`.
- No `Run` / `RunOnce` autostart entries for Malahy.
- No scheduled tasks.
- No `Crashpad` / crash-dump directory.
- No `D:\Malahy\backup\` directory (referenced by `electron-builder.yml` `!backup/**` and `.gitignore`,
  but never created by the app).

---

## 2. What the current uninstaller removes and preserves

### 2.1 Source of truth

Uninstaller script template shipped with the pinned builder
(`node_modules/app-builder-lib/templates/nssis/uninstaller.nsh`, electron-builder **26.15.3**):

| Lines | Behaviour | Fires today? |
|---|---|---|
| 187 | `RMDir /r $INSTDIR` — removes the install directory | ✅ Yes |
| 190–207 | Removes desktop + Start Menu shortcuts | ✅ Yes |
| 250–254 | Deletes uninstall + install registry keys | ✅ Yes |
| **216–248** | **App-data deletion block** | ❌ **Never** |

### 2.2 The app-data block and its gate (lines 216–248)

```nsis
Var /GLOBAL isDeleteAppData
StrCpy $isDeleteAppData "0"

${GetParameters} $R0
${GetOptions} $R0 "--delete-app-data" $R1
${if} ${Errors}
  !ifdef DELETE_APP_DATA_ON_UNINSTALL      ; ← never defined in this project
    ${ifNot} ${isUpdated}                 ; ← protects in-place upgrades
      StrCpy $isDeleteAppData "1"
    ${endif}
${else}
  StrCpy $isDeleteAppData "1"             ; ← only if launched with --delete-app-data
${endif}

${if} $isDeleteAppData == "1"
  ...
  RMDir /r "$APPDATA\${APP_FILENAME}"          ; "malahy"
  RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"  ; "كوكي بارك"
  RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"      ; "malahy"  ← the real userData folder
${endif}
```

`DELETE_APP_DATA_ON_UNINSTALL` is defined **only** when `nsis.deleteAppDataOnUninstall` is truthy
(`app-builder-lib/out/targets/nsis/NsisTarget.js:462-464`), and that option **defaults to `false`**
(`app-builder-lib/out/targets/nsis/nsisOptions.d.ts:182-185` — `*one-click installer only.* Whether to
delete app data on uninstall. @default false`).

`electron-builder.yml` sets neither the option nor any custom NSIS script, and there is **no
`build/` directory** and **no `nsis.include`** in the project.

### 2.3 Conclusion

> **The shipped v2.5.3 uninstaller removes the program but keeps `%APPDATA%\malahy` in full** —
> database, backup, users, settings, activation, and error log all survive. A reinstall therefore
> restores the previous business records. This is the defect to fix.

### 2.4 How the three `RMDir` targets resolve (so the fix is provably precise)

| Define | Resolves to | Source |
|---|---|---|
| `APP_PACKAGE_NAME` | `malahy` | `appInfo.name` = `package.json` `name` (`NsisTarget.js:171`) |
| `APP_FILENAME` | `malahy` | `getWindowsInstallationDirName()` — `productFilename` is Arabic and fails `/^[-_+0-9a-zA-Z .]+$/`, so it falls back to `sanitizedName` (`targetUtil.js:40-42`). Confirmed: the install dir on disk is literally `...\Programs\malahy`. |
| `APP_PRODUCT_FILENAME` | `كوكي بارك` | Defined only when it differs from `APP_FILENAME` (`NsisTarget.js:495-497`) |

So enabling the flag produces `RMDir /r "%APPDATA%\malahy"` — **exactly** the live Electron `userData`
folder, confirmed by directory listing. It is keyed to the app's own package name, so it structurally
cannot target another application's folder.

### 2.5 Related behaviours already confirmed correct (must not regress)

- **Auto-update / in-place upgrade is already protected.** `uninstaller.nsh:224` guards with
  `${ifNot} ${isUpdated}`, so an upgrade runs the uninstaller with `/updated` and skips data deletion.
- **App-running check already exists.** `un.checkAppRunning` → `CHECK_APP_RUNNING`
  (`allowOnlyOneInstallerInstance.nsh:105-159`) finds the running process and terminates it
  (graceful, then forced) before the delete runs. This already satisfies "cleanup works even if the
  application is not running" — the uninstaller does not need the app to be running at all.
- **Silent uninstall** (`QuietUninstallString: "... /currentuser /S"`) executes the same section.

---

## 3. Safest supported way to delete Malahy-owned data during uninstall

### ✅ Recommended (and the only step required functionally)

Add one line to the existing `nsis:` block in `electron-builder.yml`:

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: كوكي بارك
  deleteAppDataOnUninstall: true   # ← ADD: remove %APPDATA%\malahy on uninstall
```

Why this is the safest supported option:

| Requirement | How the built-in flag satisfies it |
|---|---|
| Integrate with the **actual Windows uninstall process**, not startup | The code lives in `Section "un.Uninstall"` of the NSIS uninstaller — it runs during uninstall and nowhere else. |
| Remove **only** Malahy-owned data | Targets are derived from the app's own `name`/`productFilename`; `RMDir /r` removes the named subfolder only. `%APPDATA%` itself and all sibling folders are untouched. |
| Work when the app is **not running** | Pure NSIS; `CHECK_APP_RUNNING` already handles the running case. |
| Handle **missing files/dirs safely** | `RMDir /r` on a non-existent path is a silent no-op in NSIS. Two of the three `RMDir` calls are already no-ops today. |
| Don't delete shared parent dirs | Never touches `%APPDATA%` or `%LOCALAPPDATA%` themselves. |
| Don't touch business logic / printing / payroll / activation / auto-update | **Zero application code changes.** Update path stays protected by `${ifNot} ${isUpdated}`. |
| Supported / maintainable | First-party electron-builder option; no custom NSIS script, no helper exe, no IPC command. |

### ⚠️ Optional extra (requires separate approval — not required for the objective)

`deleteAppDataOnUninstall` does **not** cover `%LOCALAPPDATA%\malahy-updater` (202 MB). If that stale
cache should also go, the supported extension is electron-builder's `nsis.include`:

```yaml
nsis:
  include: build/installer.nsi   # ← ADD
```
```nsis
; build/installer.nsi
!macro customUnInstall
  ${If} $isDeleteAppData == "1"
    RMDir /r "$LOCALAPPDATA\malahy-updater"
  ${EndIf}
!macroend
```

This is **optional** and carries a slightly higher maintenance burden (a hand-written NSIS file that
must keep compiling against future electron-builder template changes). Recommended decision: **skip
it**, and report the leftover cache as a known, harmless limitation.

### ❌ Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| IPC "wipe everything" command in `main.js`, triggered at startup | Does **not** run during uninstall; requires the app to launch; violates "do not modify business logic". |
| A custom `un.customUnInit` / `un.customUnInstall` block doing hand-rolled `RMDir` | Same effect as the built-in flag but more code to maintain; the upstream flag is strictly safer. |
| Deleting only `malahy-data.json` while keeping the folder | Leaves tickets/records recoverable from `malahy-data.bak.json` and the `.corrupt-*` snapshots — would **not** meet "clean database, no previous records". Must delete the whole folder. |
| Setting `nsis.perMachine: true` or other unrelated option changes | No relation to data cleanup; would be scope creep. |

---

## 4. Risks and limitations

### Blocking
**None.** The built-in flag is a supported electron-builder feature in the pinned version (26.15.3).

### Must be accepted / documented

1. **Irreversible deletion of all local business records.** Uninstall deletes tickets, sales, expenses,
   returns, gifts, payroll, settings, user accounts **and** the automatic `.bak.json` backup plus the
   `.corrupt-*` snapshots. There is no export-on-uninstall step. This must be stated plainly in the
   README and the installer text so the business owner backs up before uninstalling.
2. **Activation state is destroyed.** `activated` / `malahy_activated` / `activationVersion` live in the
   DB, so a reinstall requires re-activation. This is the correct "clean install" behaviour, but the
   business owner should confirm it is intended.
3. **User accounts are destroyed.** A reinstall needs the admin account to be re-created from scratch
   (default bootstrap in `users.js`). Expected for a clean install.

### Known limitations

4. **`%LOCALAPPDATA%\malahy-updater` (202 MB) is not removed.** Harmless; it is a download cache, not
   user data. Left deliberately out of scope unless separately approved.
5. **`.updaterId` is deleted with `userData`.** After reinstall, electron-updater treats the machine as
   a fresh install and re-downloads the full installer instead of applying a differential download.
   Minor performance effect only; no functional impact.
6. **`.corrupt-*` snapshots are deleted too** (they live in `userData`). Correct — they contain old
   business records and must not survive a "clean" install.
7. **`RMDir /r "$APPDATA\كوكي بارك"` is part of upstream's fixed template** and is always emitted when
   the flag is on. That folder does not exist on disk today, so it is a harmless no-op. If some other
   product ever used the name `%APPDATA%\كوكي بارك`, it would be deleted. This behaviour cannot be
   disabled independently and is upstream's standard. Noted for the record.
8. **Coupling to `package.json` `name`.** The deletion target follows `name: malahy`. If the app is ever
   rebranded and `name` changes, the new uninstaller targets the new folder — and a pre-existing
   `%APPDATA%\malahy` folder becomes orphaned. Conversely this is exactly the safety property we want:
   the target is always the app's own namespace.

### Behaviours explicitly verified as unaffected

9. **Auto-update is not modified.** The `${ifNot} ${isUpdated}` guard is upstream's, untouched by this
   change. An in-place upgrade from v2.5.3 → next version keeps all data (this will also be the first
   half of the verification test).
10. **Per-machine installs.** `perMachine: false` today → `$installMode == "current"` → `$APPDATA` is the
    current user's. If `perMachine` is ever enabled, the template calls `SetShellVarContext current` in
    the `all` branch, so behaviour stays per-user. No change needed.
11. **Silent uninstall** (`/currentuser /S`) runs the same section and therefore also deletes data.

### Test-execution constraints

12. `%APPDATA%\malahy` is derived from `package.json name`, which **cannot be redirected** via
    electron-builder config or a CLI flag. A full uninstall/reinstall test therefore necessarily touches
    the real `%APPDATA%\malahy` folder. Production data must be backed up and restored around the test
    (see §5.3). Doing the destructive test under a **throwaway local Windows account** is the safest
    option and is recommended.

13. **Current machine state to be aware of:** the production install is v2.5.3 at
    `%LOCALAPPDATA%\Programs\malahy\`; its uninstaller is the *old* one, so uninstalling today would
    **preserve** data. To test the new behaviour, the newly built installer must first replace it.

---

## 5. Exact files that would need changes

### 5.1 Required

| # | File | Change | Risk |
|---|---|---|---|
| 1 | `D:\Malahy\electron-builder.yml` | Add `deleteAppDataOnUninstall: true` under the existing `nsis:` block (1 line). **This is the entire functional change.** | Very low |
| 2 | `D:\Malahy\README.md` | Correct lines 99–101: real path is `%APPDATA%\malahy\...`, not `%APPDATA%\كوكي بارك\...`. Add a prominent note that **uninstalling permanently deletes all local business records and backups**, and advise backing up `%APPDATA%\malahy\malahy-data.json` before uninstalling. | None |
| 3 | `D:\Malahy\AI_REPORTS\UNINSTALL_DATA_CLEANUP_AUDIT.md` | This report. | None |
| 4 | `D:\Malahy\AI_REPORTS\<NEXT>_UNINSTALL_DATA_CLEANUP.md` | Post-implementation report with real test results. | None |

### 5.2 Conditional — only with explicit approval

| # | File | Change | When |
|---|---|---|---|
| 5 | `package.json` | Version bump to the next release. | Only if a release is authorised |
| 6 | `releases\<version>\` + `latest.yml` | Publish artefacts. | **Not without explicit approval** — no GitHub release, no publish |
| 7 | `D:\Malahy\build\installer.nsi` (new) + `nsis.include` in `electron-builder.yml` | Also remove `%LOCALAPPDATA%\malahy-updater`. | Only if the 202 MB cache cleanup is wanted |

### 5.3 Explicitly NOT to be touched

`main.js`, `database.js`, `preload.js`, `users.js`, `permissions.js`, `perm-gate.js`, `accounts.js`,
`login.js`, `recovery.js`, `activation.js`, `update-gate.js`, `index.html`, `windows/**`, `assets/**`,
`launch.js`, `package-lock.json`.

This guarantees no change to business logic, sales calculations, ticket printing, reports, payroll,
permissions, activation validation, or auto-update behaviour.

---

## 6. Proposed verification plan (for after approval)

**Constraint:** production data must be preserved throughout. Disposable test data only.

**Isolation options, safest first:**

- **Option A (recommended):** run the destructive uninstall/reinstall test under a **throwaway local
  Windows account**. Its `%APPDATA%\malahy` starts empty, so no backup/restore dance is needed and the
  production profile is never touched.
- **Option B:** back up `%APPDATA%\malahy` to `D:\Malahy_backup_<date>\` (outside `%APPDATA%`, so the
  uninstaller cannot reach it), run the test, then restore. Record SHA-256 of `malahy-data.json`
  before and after to prove byte-identical restoration.

**Non-destructive checks (safe at any time):**

1. Build a **test-only** installer (`npm run dist -- --publish never`) — do **not** run `npm run publish`.
2. Confirm `deleteAppDataOnUninstall: true` is present in the effective config and that
   `DELETE_APP_DATA_ON_UNINSTALL` is emitted into the generated NSIS script.
3. Inspect the generated `installer.nsi` in the electron-builder temp dir for the `RMDir /r "$APPDATA\..."`
   lines.

**Behavioural test sequence (Option B shape, under an isolated profile):**

| Step | Action | Expected |
|---|---|---|
| T1 | Launch the freshly installed build | `%APPDATA%\malahy\malahy-data.json` absent or empty; **no tickets, no users, no activation** |
| T2 | Create disposable test tickets / an expense / a gift / an employee record | Records appear — proves the app still writes |
| T3 | Close the app completely | No Malahy process remains in Task Manager |
| T4 | Run the **uninstaller interactively** | Completes; install dir, shortcuts, registry gone |
| T5 | Inspect `%APPDATA%` | `malahy\` folder **gone**; every other AppData folder intact; `%APPDATA%` itself intact |
| T6 | Inspect `%LOCALAPPDATA%\Programs` | `malahy\` gone; Bionic / LocalSend / etc. intact |
| T7 | Inspect `%LOCALAPPDATA%\malahy-updater` | Still present (documented limitation) |
| T8 | **Reinstall** from the same installer | Launches to a **fresh, empty** database — no previous tickets or records |
| T9 | Verify `%LOCALAPPDATA%\electron-builder\Cache` | Untouched |
| T10 | Repeat T4 with `/currentuser /S` (silent path) | Same result as T4–T5 |
| T11 | Upgrade path: install new build **over** an existing profile with data | **Data survives** (proves `${ifNot} ${isUpdated}`; confirms auto-update behaviour unchanged) |
| T12 | (Option B) Restore the backup and verify SHA-256 match | Production data returned byte-identical |

**Deliverable:** a post-implementation report at
`AI_REPORTS/<NEXT>_UNINSTALL_DATA_CLEANUP.md` recording every step's actual observed output, including
any failures.

---

## 7. Approval gate

Per the phase instructions, **no implementation has been performed.** This document is the complete
read-only audit. Work stops here until the plan is reviewed and explicitly approved.

**Awaiting approval for:**
1. Adding `deleteAppDataOnUninstall: true` to `electron-builder.yml` (the one functional line).
2. README documentation update (path correction + data-loss warning).
3. The test-execution approach — **Option A (throwaway Windows account, recommended)** or **Option B
   (backup/restore)**.

**Not requested and not planned without further approval:** version bump, GitHub release, `npm run publish`,
and the optional `%LOCALAPPDATA%\malahy-updater` cleanup.
