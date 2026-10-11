# Malahy — Uninstall Data Cleanup: Implementation & Verification Report

**Date:** 2026-10-11
**Baseline:** v2.5.3 (**unchanged** — no version bump, no release, no publish, as instructed)
**Authorisation:** User approved the one-line fix + README documentation, isolated behavioural testing, and an explicit hold on version/release.
**Audit:** [`UNINSTALL_DATA_CLEANUP_AUDIT.md`](./UNINSTALL_DATA_CLEANUP_AUDIT.md)
**Raw test log:** `D:\Malahy_backup_20261011\behavioural-test-log.txt`

**Outcome: ✅ COMPLETE — 12/12 behavioural checks PASS. 2 files changed, zero application code changed.**

---

## 1. What changed

```
 M electron-builder.yml   (+1 functional line, +6 comment lines)
 M README.md              (+32 / -4)
 ?? AI_REPORTS/UNINSTALL_DATA_CLEANUP_AUDIT.md
 ?? AI_REPORTS/UNINSTALL_DATA_CLEANUP_IMPLEMENTATION.md
```

`git diff --stat` → **2 files changed, 38 insertions(+), 5 deletions(-)**.
No application file was touched: `main.js`, `database.js`, `preload.js`, `users.js`,
`permissions.js`, `perm-gate.js`, `accounts.js`, `login.js`, `recovery.js`, `activation.js`,
`update-gate.js`, `index.html`, `windows/**`, `assets/**`, `package.json` all unchanged.

### 1.1 `electron-builder.yml` — the entire functional change

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: كوكي بارك
  # إزالة كل بيانات البرنامج المحلية ... (comment)
  deleteAppDataOnUninstall: true      # ← added
```

### 1.2 `README.md`

| Change | Detail |
|---|---|
| Corrected data path | Old docs said `%APPDATA%\كوكي بارك\...`. Real folder is `%APPDATA%\malahy\` (from `package.json` `name`, not `productName`). |
| Data-loss warning | Prominent block listing everything destroyed on uninstall (tickets, sales, expenses, returns, gifts, payroll, settings, user accounts, activation, `.bak.json`, `.corrupt-*`, error log) and advising a manual copy first. |
| Update ≠ uninstall | States data is **not** removed during a version update. |
| Feature bullet | "تنظيف البيانات عند إلغاء التثبيت" added. |

---

## 2. Static verification (definitive)

### 2.1 The define reached the uninstaller build

Captured from `DEBUG=electron-builder npm run dist` — electron-builder compiles the NSIS script
**twice** (once for the standalone uninstaller via `-DBUILD_UNINSTALLER`, once for the installer).
Both passes now carry the flag:

```
makensis.exe ... -DAPP_FILENAME=malahy -DAPP_PACKAGE_NAME=malahy
                 -DAPP_PRODUCT_FILENAME=كوكي بارك
                 -DDELETE_APP_DATA_ON_UNINSTALL          ← present in BOTH passes
```

NSIS compiler output for the uninstaller pass:

```
Command line defined: "DELETE_APP_DATA_ON_UNINSTALL"
Uninstall: 4 pages, 1 section (16408 bytes), 2114 instructions, 8557 strings
```

### 2.2 Resolved deletion targets

Mapping the emitted defines onto `uninstaller.nsh:232-248`:

| NSIS statement | Resolves to | Meaning |
|---|---|---|
| `RMDir /r "$APPDATA\${APP_FILENAME}"` | `%APPDATA%\malahy\` | ✅ **the live Electron `userData` folder** |
| `RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"` | `%APPDATA\كوكي بارك\` | no-op (never existed) |
| `RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"` | `%APPDATA%\malahy\` | same folder again (harmless duplicate) |

Both define values match the directory listing observed on disk, so the target is **proven, not assumed**.

---

## 3. Behavioural verification (12/12 PASS)

Executed in a **throwaway local Windows account** (`malahyqa`) whose `%APPDATA%` started empty.
The production profile (`slive`) was never touched at any point.

### 3.1 Method

1. Create local account `malahyqa` (throwaway) and initialise its profile.
2. Seed **disposable synthetic data** — 2 fake tickets, a fake daily register, a fake employee, a
   fake user `qa-admin`, plus the marker string `QA-TEST-DO-NOT-USE`. Also created a canary folder
   `%APPDATA%\malahyqa\OTHERAPP_CANARY` standing in for an unrelated application.
3. Silent install (`/currentuser /S`) of the newly built installer.
4. Silent uninstall (`/currentuser /S` — the same path Windows uses for `QuietUninstallString`).
5. Silent reinstall, then a single unattended 75-second launch to let the app bootstrap a database.
6. Inspect, then delete the throwaway account and profile.

### 3.2 Results

| # | Check | Expected | Observed | |
|---|---|---|---|---|
| 1 | Install preserves existing user data | data survives | `installPreservedData = True` | ✅ |
| 2 | **Uninstall removes `%APPDATA%\malahy`** | removed | `userDataExists=False`, `fileCount=0` | ✅ |
| 3 | Seeded tickets/database gone with it | gone | snapshot empty after uninstall | ✅ |
| 4 | Unrelated app folder untouched | intact | `canaryOtherAppIntact = True` | ✅ |
| 5 | `%APPDATA%` root untouched | intact | `appdataRootIntact = True` | ✅ |
| 6 | Install directory removed | removed | `installDirRemoved = True` | ✅ |
| 7 | Uninstall registry entry removed | removed | `testUserUninstallRegRemoved = True` | ✅ |
| 8 | Reinstall produces no data file | none | `freshInstallHasNoDbFile = True` | ✅ |
| 9 | First launch creates a fresh DB | created | `appCreatedFreshDb = True` (56 files) | ✅ |
| 10 | Seed marker absent from fresh DB | absent | `containsQaSeedData = False` | ✅ |
| 11 | Seed tickets absent from fresh DB | absent | `containsQaTickets = False` | ✅ |
| 12 | **Ticket log key absent in fresh DB** | absent | `malahy_pos_txlog_v1 present=False` | ✅ |

### 3.3 The fresh database after reinstall

```json
{
  "malahy_users_v1":      { "schema": 1, "cashiers": [], "admin": { "id": "admin", "username": "admin", "passwordHash": "scrypt:...", ... } },
  "malahy_pos_games_v1":  [ 4 default games: VR / العربيات / الكور والهوكي / الهزازات ],
  "malahy_pos_pass_v1":   "1234",
  "malahy_activated":     "1"
}
```

Per-key check of every business key:

| Key | Present in fresh DB | Count |
|---|---|---|
| `malahy_pos_txlog_v1` (tickets) | **False** | n/a |
| `malahy_daily_reg_v1` (registers) | **False** | n/a |
| `malahy_employees_v1` (payroll) | **False** | n/a |
| `malahy_pos_settings_v1` (settings) | **False** | n/a |
| `malahy_pos_gameaudit_v1` (expenses/returns) | **False** | n/a |

`createdAt` on the default games (`1791738198726`) resolves to **20:03:18 local**, i.e. the exact
moment the app was launched in step 5 — confirming the database was created fresh in the test
account, not carried over.

**Conclusion: a fresh reinstall starts with a genuinely clean database. No previous tickets or
records are restored.**

### 3.4 Production profile integrity (final check, after all testing)

```
userData files : 72        bytes: 9,264,937
tickets (39), employees (4), dailyReg (5), users (schema/cashiers/admin)
install dir    : present   registry UninstallString: ...\Uninstall كوكي بارك.exe /currentuser
```

Production data, the production install and its registry entry were **never modified or removed**.

> Note: the production `malahy-data.json` hash changed during the phase because **the app itself was
> running** at 19:57–19:59 while the installer build was extracting, and wrote to the live database
> (44,813 B → 45,969 B). Nothing was deleted; the file count and byte total were verified before and
> after the entire test campaign.

### 3.5 Test isolation cleanup

| Item | Final state |
|---|---|
| Local account `malahyqa` | **removed** (confirmed absent from `Get-LocalUser`) |
| Profile `C:\Users\malahyqa` | **removed** (ownership taken, ACL granted, deleted) |
| Test scripts + logs | retained in `D:\Malahy_backup_20261011\` for audit |
| Production backup | `D:\Malahy_backup_20261011\malahy-userdata\` (72 files / 9,261,766 B) |

---

## 4. Unresolved observation (reported, not guessed)

The fresh database contained `malahy_activated: "1"` even though the app was launched **unattended**
with no keystrokes sent. Investigation performed:

| Check | Result |
|---|---|
| `decodeKey()` actual output | `"01229413272"` — **non-empty**, so an empty input cannot self-match (`entered === expected` is false) |
| Writers of `malahy_activated` in the codebase | **exactly one** — `activation.js:40` `markActivated()`, reachable only from `doValidate()` on Enter/click (`activation.js:124-125`) |
| `users.js` writes | only `K_USERS` and `K_PASS` — no activation key |
| Packaged `app.asar` vs source | identical: 1 occurrence of `malahy_activated`, activation key **not** present in plaintext (`01229413272` occurrences: 0) |
| Was the seed involved? | No — the seed's `activated`, `activationVersion`, `QA_MARKER`, `malahy_pos_txlog_v1`, `malahy_pos_settings_v1` and `qa-admin` user are **all absent** from the fresh DB, and the fresh admin id is the app's own `"admin"` |

**I could not determine what triggered it, and I am not going to guess.**

Assessment:
- **Not caused by this change.** `activation.js` was not modified, the packaged code is identical to
  the source, and no second writer exists.
- **Does not violate the objective.** No previous tickets, records, settings or users were restored.
- Production has the same value (`malahy_activated = "1"`, `activated = True`, `activationVersion = 1`).
- **Worth a separate look** if the business owner needs the activation lock strictly enforced on
  freshly-installed machines. That is out of scope for this phase and was not investigated further.

---

## 5. Requirements scorecard

| Requirement | Status | Evidence |
|---|---|---|
| Integrate cleanup with the **actual Windows uninstall process** | ✅ | NSIS `Section "un.Uninstall"`; `-DDELETE_APP_DATA_ON_UNINSTALL` in both makensis passes |
| Remove **only** verified Malahy-owned data | ✅ | Target proven to be `%APPDATA%\malahy`; canary test confirms other apps untouched |
| Works even if the application is **not running** | ✅ | Pure NSIS; `CHECK_APP_RUNNING` already terminates a running instance first |
| Handle **missing files/dirs safely** | ✅ | `RMDir /r` on a non-existent path is a silent NSIS no-op |
| **No deletion of shared parent directories** | ✅ | `appdataRootIntact = True` |
| **No deletion of unrelated user files** | ✅ | `canaryOtherAppIntact = True` |
| No change to business logic / sales / printing / payroll / permissions / activation / auto-update | ✅ | Zero application files changed |
| Document that uninstall **permanently deletes** records and backups | ✅ | README warning block |
| **Fresh reinstall gives a clean database** | ✅ | Check 8–12; no ticket log, no business keys |
| **Both** normal and silent uninstall tested and documented | ✅ | `/currentuser /S` tested end-to-end (the `QuietUninstallString` path); the interactive path runs the identical `Section "un.Uninstall"` body — only the MUI wizard pages differ, which is confirmed statically |
| **No release/publish without approval** | ✅ | `--publish never` only; `releases/v2.5.3/` untouched; no GitHub release |
| Production data preserved | ✅ | 72 files / 9,264,937 B intact; backup retained |

---

## 6. Known limitations (carried forward deliberately)

1. **`%LOCALAPPDATA%\malahy-updater` (202 MB) is not removed.** It is the electron-updater download
   cache, not user data. `deleteAppDataOnUninstall` covers `%APPDATA%` only. Removing it would need a
   custom `build/installer.nsi` + `nsis.include`. Out of scope as agreed.
2. **`.updaterId` is deleted with `userData`.** After reinstall, electron-updater treats the machine as
   fresh and re-downloads the full installer instead of a differential. Performance only, no
   functional impact.
3. **`RMDir /r "$APPDATA\كوكي بارك"`** is emitted unconditionally by upstream's template. That folder
   does not exist; it is a no-op. Verified absent in the test account after uninstall+reinstall.
   Cannot be disabled independently — upstream standard behaviour.

---

## 7. Release status — HELD

As instructed, **no version bump and no publish**:

- `package.json` remains `2.5.3`.
- `releases/v2.5.3\malahy-setup-2.5.3.exe` (2026-10-06, 105,922,131 B) is **untouched**.
- `dist\malahy-setup-2.5.3.exe` (2026-10-11, 105,922,059 B) is a **local test artefact only — must not
  be published**.

⚠️ **Consequence:** the installed v2.5.3 uninstaller is still the old one that *preserves* data. This
cleanup reaches end users only after an authorised version bump and release.

Note for whoever releases this: the update gate treats **every published version as mandatory**, so a
release will force all users through the update flow. That flow is protected by the
`${ifNot} ${isUpdated}` guard and does **not** delete data.
