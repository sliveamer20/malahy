# Malahy v2.6.0 — Uninstall Protection with the Admin Account Password

**Implementation report** · Malahy Amusement Park Management System · `sliveamer20/malahy`
Report language: Arabic / English (mixed, matching the repository's convention).

| | |
|---|---|
| Previous stable release | `v2.5.9` (`4f11fd2`, tag `v2.5.9`) |
| This release | **`v2.6.0`** |
| Release type | Feature / security — uninstall authorization |
| Branch / base | `main` · `4f11fd2` (clean working tree before this change) |
| New unit tests | `tests/v260-uninstall-auth.test.js` — **58 passed / 0 failed** |
| Packaged-app tests (Phase A) | **6 / 6 passed** (real packaged app, isolated data store) |
| Packaged-uninstaller tests (Phase B) | **5 / 5 passed** on the validation build **and** on the final `malahy-setup-2.6.0.exe` artifact |
| Production database | SHA256 `E5EF1E0DC7FA0DD6F38614EC0E823C587ED47ADC65B8E6F144B46E73DCF72891` — **verified unchanged after every single test run** |
| Final status | **PASS** |

---

## 1. Objective

Require the admin account password before the Windows uninstaller is allowed to remove
the program, so that uninstalling Malahy (كوكي بارك) from Windows Settings, Control
Panel, or by running the uninstaller directly is impossible without it. The protection
reuses the **existing** admin authentication — there is no second password, no hardcoded
secret, and no hash copied into the installer.

Hard requirements that shaped the design:

1. Reuse the existing admin account (scrypt hash in `%APPDATA%\malahy\malahy-data.json`,
   key `malahy_users_v1`); no new credential, no plaintext, no hash in the installer.
2. An Arabic dialog that works while the main app is closed.
3. Correct password → uninstall proceeds. Wrong/cancel → abort with **nothing** deleted.
   Missing or corrupt credentials → fail closed. No bypass or backdoor.
4. Do not weaken Electron security, do not expose credentials in logs/argv/env, and do
   not change payroll / attendance / ticket / expense / accounting behaviour.
5. **Auto-updates must not be blocked** (the new installer runs the old uninstaller with
   `/S --updated`).
6. Do not publish without validating the packaged Windows uninstaller end to end.

---

## 2. Authentication architecture (what was reused, nothing duplicated)

The app already has a full admin authentication system (`users.js`, Phase 3B/3C). The
uninstall protection adds **one read-only entry point** into it:

```js
// users.js — التحقق من كلمة سر حساب المسؤول (قراءة فقط، فشل مُغلق)
async function verifyAdminPassword(plain) {
  try {
    const doc = readDoc();
    if (!doc || !doc.admin || typeof doc.admin.passwordHash !== "string") return false;
    return await verifyPassword(String(plain == null ? "" : plain), doc.admin.passwordHash);
  } catch (e) {
    return false;   // أي فشل في قراءة المستودع → رفض
  }
}
```

Properties, all verified by reading the code and by unit tests:

| Property | How |
|---|---|
| Same authority as login | It calls the *same* `verifyPassword()` used by `login()` on the *same* stored `doc.admin.passwordHash`. There is exactly one admin password in the system. |
| Same KDF | `crypto.scrypt` with per-password salt (`scrypt:N:r:p:<salt hex>:<hash hex>`), compared with `crypto.timingSafeEqual` — constant-time, so the dialog cannot leak the hash by timing. |
| Read-only | It never calls `writeDoc`/`db.set`, never creates a session, never touches `K_PASS`, and never triggers old-password migration (that only happens in the normal `initUsers` boot path). |
| Fail closed | No store, no admin record, non-string hash, or any read exception → `false` → uninstall refused. There is no fallback path that allows deletion without a correct password. |
| No secrets in logs | Errors are boolean-only; `unauthLog` writes failure text only, never the password or hash (unit test §7 asserts this). |

---

## 3. Integration design (NSIS ↔ Electron)

### 3.1 The NSIS hook

`build/uninstall-auth.nsh` is injected into both the installer and the uninstaller
through electron-builder's `nsis.include` (`electron-builder.yml`), and the macro is
defined only for the uninstaller build:

```nsis
!ifdef BUILD_UNINSTALLER
!macro customUnInstall
  ${ifNot} ${isUpdated}            ; (1) auto-update path is exempt (see §5)
    ${ifnot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      MessageBox MB_OK|MB_ICONEXCLAMATION "تعذّر التحقق من إذن حذف البرنامج لأن ملفاته غير مكتملة..."
      Abort                        ; (2) fail closed: no app exe → no verification → no deletion
    ${endif}
    DetailPrint "جاري التحقق من إذن حذف البرنامج..."
    ClearErrors
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --uninstall-auth' $unauthExitCode
    ${if} ${errors}
    ${orIf} $unauthExitCode != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "تم رفض حذف البرنامج..."
      Abort                        ; (4) wrong password / cancel / launch failure → refuse
    ${endif}
  ${endIf}
!macroend
!endif
```

electron-builder inserts `customUnInstall` in the uninstall **Section**, immediately
**before** the file-deletion block (`RMDir /r $INSTDIR` …), so `Abort` fires before any
file, shortcut, or registry key is touched. `Abort` in the section cancels the whole
uninstall, which is exactly the required "refuse and change nothing" semantics.

### 3.2 The app side (`--uninstall-auth` mode, `main.js`)

`main.js` detects `--uninstall-auth` **once, before the single-instance lock**, and runs a
completely independent minimal mode:

- Creates **only** the small Arabic auth window (`windows/uninstall-auth.html`,
  `dir=rtl`, `lang=ar`, `input type="password"`). No main window, no splash, no
  update gate, no updater, and **no network access at all**.
- Never requests the single-instance lock — so the dialog works even if the main app is
  open at the same time.
- Reads the database only (via `users.verifyAdminPassword`); never writes.
- Never accepts the password from `argv` or environment — only from the UI input field
  over the preload bridge. The flag itself carries no secret.
- **The exit code is the sole authorization token** between the two processes:
  `app.exit(0)` on success (`exitUninstallAuth(true)`), `app.exit(1)` on cancel,
  window-close, or any failure.

The IPC surface in this mode is exactly two channels (`preload.js`,
`contextBridge.exposeInMainWorld("malahyUninstallAuth", …)`), under
`contextIsolation: true`, `nodeIntegration: false`, `devTools: false`:

| Direction | Channel | Payload |
|---|---|---|
| renderer → main | `uninstall-auth:verify` | `{ password }` — string only |
| main → renderer | reply | `{ ok: true }` on success, `{ ok: false, error }` on refusal — never the hash, never the password |
| renderer → main | `uninstall-auth:cancel` | none |

The dialog (`windows/uninstall-auth.html`) never sees the hash; paste is blocked; the
field is masked; `beforeunload` sends cancel; pressing Enter submits, Escape cancels.

### 3.3 What the user sees

Title `إلغاء تثبيت ملاهي كوكو بارك`, message
`أدخل الرقم السري لحساب المسؤول للسماح بحذف البرنامج.`,
masked input, buttons `تأكيد الحذف` / `إلغاء`, and on a wrong password the Arabic error
`الرقم السري غير صحيح. يُرجى المحاولة مرة أخرى.` (verified verbatim in the packaged
app via CDP in Phase A). The dialog renders while the uninstaller is blocked in
`ExecWait`, so it works with the main application closed.

---

## 4. Critical bug found during packaged validation (and fixed)

> **NSIS `Return` inside a `Section` terminates the entire section**, not just the macro.

The first implementation used `${if} ${isUpdated} Return` to skip the prompt on the
update path. That `Return` exited the uninstall section outright, so on the auto-update
path **nothing would have been deleted, no shortcuts or registry keys cleaned, exit
code 0** — i.e. auto-updates would have been silently broken in production.

It was caught only by behavioural end-to-end testing of the *packaged* uninstaller
(Phase B `updated` scenario: exit 0, files 79→79, registry still present). A diagnostic
build instrumenting `customUnInit`/`customUnInstall` proved the section *was* reached
with `INSTDIR` correct and `isUpdated=TRUE`, isolating the failure to the `Return`.

**Fix:** wrap the auth logic in `${ifNot} ${isUpdated} … ${endIf}` so the section
continues into electron-builder's own deletion block after the exemption. The file now
carries an explicit comment warning against `Return` here. All Phase B scenarios were
re-run against a rebuilt package and pass (§6).

This is exactly why the "validate the packaged uninstaller" requirement exists: the
fault is invisible in source review and in every unit test.

---

## 5. The auto-update exemption

electron-builder's update flow (`installUtil.nsh`, `handleUninstallResult`) copies the
old uninstaller to a temp dir and runs it as:

```
"<temp>\old-uninstaller.exe" /S /KEEP_APP_DATA /currentuser --updated _?=<installDir>
```

and the uninstaller exposes that as the `${isUpdated}` flag (a `StdUtils.TestParameter`
command-line test — the same mechanism electron-builder itself uses to preserve AppData
during updates). Two consequences that were verified empirically:

1. **The in-place self-copy drops `--updated`.** Running `Uninstall كوكي بارك.exe`
   directly from the install folder triggers NSIS's self-copy relaunch, and the flag does
   not survive. Therefore the update-path simulation must copy the uninstaller to a temp
   dir first, exactly like the real installer does. (This was the second confusion
   resolved during Phase B bring-up.)
2. With the fix, the exemption produces the required behaviour: the `updated` test passes
   with **no auth window at all** and the install directory fully removed.

`--updated` is therefore the deliberate, single, documented bypass of the prompt — see
the threat model in §7.

---

## 6. Validation methodology and results

### 6.1 Test isolation (production data safety)

Electron's `app.getPath("userData")` **cannot** be redirected with an `APPDATA`
environment variable or `--user-data-dir` (those only move Chromium caches), so a
stronger isolation was built:

1. Snapshot the production DB (`C:\Users\slive\AppData\Local\Temp\opencode\prod-db-snapshot`).
2. Rename the real `%APPDATA%\malahy` folder to a backup name.
3. Create a **directory junction** at `%APPDATA%\malahy` pointing at a synthetic store
   seeded with a known admin password (`malahy_users_v1`).
4. Run the test. `finally` always kills test processes, removes the junction (link only,
   never the target), and restores the real folder.
5. Assert the production DB SHA256 after **every** run:
   `E5EF1E0DC7FA0DD6F38614EC0E823C587ED47ADC65B8E6F144B46E73DCF72891` —

   **this hash never changed across the entire validation campaign** (checked after each
   of the 10+ packaged test runs). The production DB is unmodified.

Phase A UI driving used Chrome DevTools Protocol against the real packaged app's auth
window (Chromium content is not exposed to UIAutomation); Phase B used UIAutomation +
`SendKeys` to walk the NSIS pages.

### 6.2 Phase A — packaged app, auth mode (`--uninstall-auth`)

| # | Test | Result |
|---|---|---|
| A1 | correct admin password → exit code 0 | PASS (exit 0) |
| A2 | wrong password → app stays alive | PASS |
| A2b | wrong password → Arabic error message shown | PASS (`الرقم السري غير صحيح. يُرجى المحاولة مرة أخرى.`) |
| A3 | cancel button → non-zero exit | PASS (exit 1) |
| A4 | closing the window → non-zero exit | PASS (exit 1) |
| A5 | no input → app keeps waiting | PASS |

Window/title/RTL/language/input-type were probed exactly: `dir=rtl`, `lang=ar`,
`inputType=password`, buttons `تأكيد الحذف`/`إلغاء`.

### 6.3 Phase B — packaged NSIS uninstaller, end to end

Run against the validation build (v2.5.9 tree, identical code) **and repeated against the
final `malahy-setup-2.6.0.exe` release artifact**:

| Scenario | Action | Expected | Result (final artifact) |
|---|---|---|---|
| `wrong` | type wrong password, Enter | nothing deleted | `uninstall_blocked_intact` (79→79) **PASS** |
| `cancel` | Escape, dismiss refusal MessageBox | nothing deleted | `uninstall_blocked_intact` (79→79) **PASS** |
| `correct` | type real admin password, Enter | full uninstall | `uninstall_completed` (79→0) **PASS** |
| `missingexe` | app exe removed, run uninstaller | fail closed, nothing deleted | `uninstall_blocked_intact` (78→78, fail-closed MessageBox) **PASS** |
| `updated` | temp copy + `/S /KEEP_APP_DATA /currentuser --updated _?=…` | completes, **no prompt** | `updated_path_completed_no_prompt` (79→0) **PASS** |

Also verified in Phase B: after a refused uninstall the uninstaller's refusal
MessageBox appears (title `كوكي بارك Uninstall`), after a *confirmed* uninstall the
installation directory and both registry keys (`HKCU\Software\{app-guid}` and the
`Uninstall` entry) are removed, and after the simulated update the install directory is
fully cleared.

### 6.4 Unit tests

- `tests/v260-uninstall-auth.test.js` — new, **58/58 pass**. It shims `database.js` and
  asserts: `verifyAdminPassword` reuses `verifyPassword`/timingSafeEqual, fail-closed on
  missing/corrupt store, read-only behaviour, the exit-code contract of
  `exitUninstallAuth`, dialog markup (title/message/RTL/masked input/buttons), no
  embedded password/hash/secret in the uninstaller script, `nsis.include` wiring, and
  unchanged AppData-deletion configuration.
- `tests/v256-attendance-scroll.test.js` — its release guards were updated for this
  release: `D1` now expects version `2.6.0`, and the `D9` allow-list gained the v2.6.0
  files (`.gitignore`, `users.js`, `electron-builder.yml`, `windows/uninstall-auth.html`,
  `build/uninstall-auth.nsh`, `tests/v260-uninstall-auth.test.js`, this report).
- Full suite: no new regressions; the only failing files are the pre-existing ones
  (`payroll-ui` date tests, stale `phase3b/3c1/3c2` baseline guards) that fail
  identically on a pristine `v2.5.9` tree. `tests/v256-attendance-scroll.test.js` passes
  fully once the v2.6.0 files are committed (its `D9` guard reads the committed diff).
- No payroll, attendance, ticket, expense, or accounting code was touched
  (scope guard D2–D8 assert this on `index.html` and the payroll modules).

### 6.4 Artifact verification

`D:\Malahy\dist\malahy-setup-2.6.0.exe` (105,912,205 bytes, NSIS x64, built and signed by
the normal `npm run dist` flow) was installed into a disposable directory and all five
Phase B scenarios were executed against **that exact installer's uninstaller**, with the
results in §6.3.

---

## 7. Threat model and limitations (disclosed deliberately)

**What this feature is:** a gate on the *standard* uninstall entry points — Windows
Settings, Control Panel, and running the uninstaller. It stops accidental or
unauthorized removal of the program by someone who does not know the admin password.

**The exit code is the inter-process authorization token.** The uninstaller launches the
app and trusts its exit code. This is by design: no secret is (or can be) shared with the
installer, and the app is the only component that can read the credential store. The
boundary being protected is "can the uninstaller delete files", and the app is the sole
arbiter of that decision.

Known bypasses / limitations, Accepted after analysis:

| # | Bypass | Analysis |
|---|---|---|
| 1 | **`--updated` on the uninstaller command line** skips the prompt. | Required for auto-updates to function at all (electron-builder runs the old uninstaller this way, and uses the same flag to preserve AppData). A user able to invoke the uninstaller with arbitrary flags can bypass — but such a user can equally just delete the install folder (see 3). This is the single deliberate exemption. |
| 2 | A new **installer** (`malahy-setup-…exe`) is not gated. | Installing/repairing/updating never was gated; the gate protects *removal*. Running a new installer over the old version is an update, not an uninstall, and requires downloading an authentic signed package. |
| 3 | **Deleting the install directory directly** (local admin, or any user with write access to the install path). | No software uninstall gate can prevent this. The feature protects the uninstall UX, not the filesystem. |
| 4 | **Replacing or deleting the app exe** so the hook cannot run. | Fails **closed**: the uninstaller refuses with an explanatory MessageBox ("أعد تثبيت نفس النسخة لإصلاح الملفات الناقصة") and deletes nothing. It cannot be turned into a silent bypass — the files still have to be removed out-of-band (see 3). |
| 5 | Corrupting/deleting `%APPDATA%\malahy\malahy-data.json`. | Fails closed (no credentials → refuse). The data is gone in that case anyway; the uninstall simply will not proceed without it. |
| 6 | **No attempt counter / lockout in the uninstall dialog.** Each wrong password is answered with an Arabic error and the field is cleared for retry. | Each attempt is human-paced through a modal dialog (there is no programmatic path that accepts a password), and every attempt costs a full `scrypt` KDF computation, which makes bulk guessing through this dialog impractical. This matches the existing change-password flow's risk model. |
| 7 | The password is checked against the admin account only. | By requirement: there is exactly one admin account and one admin password in the system, and the uninstall gate uses the same authority as login (`verifyAdminPassword`). |

Explicitly **not** weakened: `contextIsolation` stays `true`, `nodeIntegration` `false`,
`devTools` `false`, CSP unchanged. No password or hash ever appears in `argv`,
environment, the NSIS script, installer logs (`DetailPrint` prints status text only), or
the app log (`unauthLog` emits failure text only — asserted by unit test).

`deleteAppDataOnUninstall: true` is **unchanged**: on a *confirmed* uninstall the app data
folder is removed exactly as before; on a refused uninstall nothing is touched.

---

## 8. Files changed in this release

| File | Change |
|---|---|
| `users.js` | new exported `verifyAdminPassword()` — read-only, fail-closed (§2) |
| `main.js` | new `--uninstall-auth` mode: `runUninstallAuthMode`, `exitUninstallAuth`, `UNAUTH_MODE` branch before the single-instance lock (§3.2) |
| `preload.js` | new `malahyUninstallAuth` context bridge (§3.2) |
| `windows/uninstall-auth.html` | new Arabic RTL auth dialog (§3.3) |
| `build/uninstall-auth.nsh` | new NSIS `customUnInstall` hook (§3.1, §4) |
| `electron-builder.yml` | `nsis.include: build/uninstall-auth.nsh` (one line) |
| `.gitignore` | `!build/uninstall-auth.nsh` exception so the hook is tracked |
| `tests/v260-uninstall-auth.test.js` | new, 58 tests |
| `tests/v256-attendance-scroll.test.js` | release guards updated for v2.6.0 (D1 version, D9 allow-list) |
| `package.json` | version `2.6.0` |
| `AI_REPORTS/UNINSTALL_ADMIN_PASSWORD_PROTECTION_REPORT.md` | this report |

---

## 9. Final status

**PASS.** The packaged v2.6.0 installer/uninstaller was validated end to end: every
uninstall-refusal path leaves the installation byte-for-byte intact, the correct admin
password allows the uninstall, a missing app exe fails closed without deletion, the
auto-update path completes with no password prompt, and the production database hash was
confirmed identical after every test run. All regression suites show no new failures.
