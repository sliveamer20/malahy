# PHASE 3B — AUTHENTICATION FOUNDATION
**Malahy (كوكي بارك) · v2.5.1 · Authentication foundation only**

> This phase implements **only the authentication foundation** in the Main process.
> No login UI, no permission enforcement at operations, no WhatsApp/recovery, no cashier
> management UI. The complete v2.5.1 functionality is **protected and untouched**.
> No build, no publish, and no commit was performed. The application version was not changed.

---

## 1. Summary

A dedicated Main-process authentication module (`users.js`) was added, backed by the **existing**
`database.js` storage engine under one **additive** key (`malahy_users_v1`). Passwords are hashed
with Node's built-in `crypto.scrypt` using a **per-password random salt**; no plaintext password is
ever stored. The existing v2.5.1 password (`malahy_pos_pass_v1`) is **migrated idempotently** into a
single Admin account on first initialization, and the existing renderer password flows continue to
work unchanged. Four typed auth IPC handlers (`auth:login`, `auth:changePass`, `auth:resetCashier`,
`auth:hasPerm`) are exposed through a new `malahyAuth` preload bridge, with all authentication
decisions made in the Main process. An in-memory session foundation (userId, role, username, active,
perms) was created — it holds no secrets.

**Design principle:** the renderer keeps working exactly as before. Nothing in `index.html` was
modified, and `malahyAuth` is not referenced by the renderer yet (deliberately — no login UI in 3B).

---

## 2. Files Modified

| File | Change | Lines |
|---|---|---|
| `main.js` | New `auth:*` IPC handler block + `users.initUsers()` call in `app.whenReady()` (wrapped in try/catch, non-blocking) | +24 |
| `preload.js` | New `malahyAuth` context-bridge exposing the 4 auth functions via `ipcRenderer.invoke` | +17 |

## 3. Files Created

| File | Purpose |
|---|---|
| `users.js` | Main-process authentication module (hashing, migration, login, changePass, resetCashier, hasPerm, session) |
| `tests/phase3b-auth.test.js` | Foundation test suite — 61 assertions covering all 14 required tests |
| `tests/phase3b-ipc.test.js` | End-to-end IPC bridge simulation — 15 assertions |
| `tests/protected-baseline.json` | SHA-256 baseline of protected files, captured **before** any edit, used by the regression test |

## 4. Files Intentionally Untouched

Per Phase 3A Section M, and verified byte-identical against a pre-phase SHA-256 baseline:

- `index.html` (all renderer logic: sales, tickets, returns, expenses, gifts, reports, games, employees/payroll, attendance, settings, `getPass`, `openPasswordModal`, `empAskPass`, `submitChangePass`, `updatePassBanner`, boot)
- `database.js` (the entire storage engine — the module uses it as-is via dependency injection)
- `activation.js` · `update-gate.js` (logic; `FLOOR_VERSION` unchanged at `2.5.1`)
- `launch.js` · `package.json` (version still `2.5.1`) · `electron-builder.yml` · `README.md`
- `assets/ticket/*` (ticket SVG/JS) · `assets/vendor/qrcode.js` (QR) · `assets/icons/*`
- `windows/splash.html` · `windows/update.html`
- All existing `K_*` data records

> Note: `README.md`, `index.html`, `package.json`, `update-gate.js` appear as modified in `git status`,
> but those working-tree changes **pre-date this phase** (they were already present at session start;
> the package.json change is the pre-existing `2.5.0`→`2.5.1` release bump). This phase's own diff is
> confined to `main.js` (+24) and `preload.js` (+17). This was confirmed by comparing `git status`
> at session start against the final state.

---

## 5. New Authentication Architecture

```
renderer (index.html)                      MAIN PROCESS
─────────────────────                      ───────────────────────────
window.malahyAuth.login(...)      ──IPC──►  auth:login      ──┐
window.malahyAuth.changePass(...) ──IPC──►  auth:changePass ──┤
window.malahyAuth.resetCashier(..)──IPC──►  auth:resetCashier──┼─► users.js
window.malahyAuth.hasPerm(...)    ──IPC──►  auth:hasPerm    ──┘      │
                                                                     │
                                     in-memory session (no secrets) ◄┘
                                     db.get/set (existing database.js)
                                     key: malahy_users_v1
```

**Key properties**
- `users.js` receives `db` by dependency injection (`require("./users")(db)`), so it is fully
  testable in plain Node without Electron and requires **no change to `database.js`**.
- All authentication decisions (password verification, admin authorization for cashier reset,
  permission queries) happen in the Main process. The renderer only receives yes/no results and a
  sanitized user object — **never** a hash, a salt, or a password.
- The module exposes **no** clear/wipe/reset primitive, and no unrestricted database access.
- Every handler is wrapped in try/catch and logs failures via the existing `appendLog`; an auth
  error can never crash the app or block boot.

---

## 6. Database Key / Schema

**New additive key:** `malahy_users_v1`

```jsonc
{
  "schema": 1,
  "admin": {
    "id": "admin",                  // ثابت — دائمًا أدمن واحد بالضبط
    "username": "admin",
    "passwordHash": "scrypt:N:r:p:<salt-hex>:<hash-hex>",
    "recoveryWhatsapp": "",         // للحصول على الترميز في مرحلة لاحقة (فارغ الآن)
    "recoveryState": null           // للحصول على الترميز في مرحلة لاحقة
  },
  "cashiers": [
    {
      "id": "usr_<uuid>",
      "username": "<name>",
      "passwordHash": "scrypt:N:r:p:<salt-hex>:<hash-hex>",
      "permissions": { "sales": true, "ticketPrint": true },  // default-deny if absent
      "mustChangePass": true|false,
      "active": true|false
    }
  ]
}
```

- The key is read through the existing `db.get(key, default)` path, so a missing key is handled
  gracefully — **zero-risk to existing data** (same additive pattern proven by `malahy_employees_v1`).
- The module writes **only** to `malahy_users_v1` (plus the documented `K_PASS` sync below).
- `recoveryWhatsapp` / `recoveryState` are present as **empty placeholders only** — recovery and
  WhatsApp are explicitly out of scope for 3B. No WhatsApp tokens or external credentials exist
  anywhere in this implementation.

---

## 7. Migration Behavior

`initUsers()` runs once at boot inside `app.whenReady()`, wrapped in try/catch:

1. **Already migrated?** If `malahy_users_v1` contains an admin record with a valid `scrypt:` hash,
   it returns immediately and writes **nothing** → **idempotent**.
2. **First run:** reads the legacy `K_PASS = malahy_pos_pass_v1`.
   - If it exists and is non-empty → that exact password is hashed into the Admin account, so
     **the existing password keeps working**. `K_PASS` itself is **not modified or deleted**.
   - If absent → the Admin account gets `DEFAULT_PASS = "1234"`, preserving the current
     default-password behavior (and the renderer's `#passBanner` nudge).
3. **Exactly one admin:** the `admin` object is always overwritten wholesale with a single record;
   it is impossible to create a second admin, and repeated `initUsers()` calls never duplicate.
4. **Restart safety:** re-initialization is a no-op once the scrypt hash exists — verified to leave
   the stored document **byte-identical** (test 6).

**Transition compatibility:** when the Admin changes their password via `auth:changePass`, the new
password is also written to `K_PASS`. This keeps the **untouched** v2.5.1 renderer (which still reads
`getPass()` / `K_PASS` for its existing password modals) in agreement with the new auth store, so no
behavior changes during the transition. This is the only legacy write, it is Admin-only, and it will
be removed once the login UI lands in a later phase.

---

## 8. IPC Handlers

| Channel | Signature | Returns | Security |
|---|---|---|---|
| `auth:login` | `{ username, password }` | `{ ok, user:{id,username,role,active,mustChangePass,perms} }` or `{ ok:false, error }` | scrypt-verify against stored hash; sets in-memory session; **never** returns a hash |
| `auth:changePass` | `{ userId, oldPass, newPass }` | `{ ok }` or `{ ok:false, error }` | requires the **current** password; enforces `MIN_PASS_LEN=4`; clears `mustChangePass` |
| `auth:resetCashier` | `{ cashierId, newPass }` | `{ ok }` or `{ ok:false, error }` | **admin session required** (Main-side decision); sets `mustChangePass=true` |
| `auth:hasPerm` | `{ permId, userId? }` | `boolean` | admin ⇒ always true; cashiers ⇒ explicit grant only; **unknown perm ids default-deny**; cross-user queries require admin |

Errors are caught and logged; handlers return `{ ok:false, error:"auth-failed" }` (or `false` for
`hasPerm`) rather than throwing. The bridge is exposed as `window.malahyAuth` with exactly these four
methods — there is **no** alternative unrestricted database path for auth.

---

## 9. Password Hashing Method

- **Algorithm:** Node built-in `crypto.scrypt` (no external dependencies, no bcrypt/native modules).
- **Parameters:** `N=16384, r=8, p=1`, key length 32 bytes, salt length 16 bytes, `maxmem` 64 MB.
- **Salt:** `crypto.randomBytes(16)` — **fresh and unique per password** (verified: two hashes of the
  same password differ).
- **Stored representation:** `scrypt:N:r:p:<saltHex>:<hashHex>` — a self-contained string carrying
  everything needed for verification (algorithm, cost factors, salt, hash) **without the plaintext**.
- **Verification:** re-derives the key with the stored salt and compares with
  `crypto.timingSafeEqual` (constant-time, no early exit). Malformed or tampered hash strings are
  rejected safely.
- **Rules implemented:** admin can change own password (authenticated); admin cannot be deleted (no
  delete API exists); cashier has a separate password; cashier cannot self-reset a forgotten password
  (needs the current one); `mustChangePass` supported for forced changes.

---

## 10. Session Foundation

In-memory, Main-process only, created on successful login:

```jsonc
{ "userId": "admin", "role": "admin", "username": "admin",
  "active": true, "perms": { /* all true for admin */ }, "loggedInAt": 1696118400000 }
```

Minimum fields only — userId, role, username, active, perms. **No password, hash, or secret of any
kind is stored in the session** (verified by assertion). `logout()` clears it; a failed login never
creates one. No login screen was implemented (out of scope for 3B) and the renderer does not yet
reference the session.

**Permission registry** (`PERMS`, defined but not yet enforced at call sites):
`sales, ticketPrint, returns, expenseAdd, expenseDelete, giftAdd, giftDelete, reports,
reportExport, reportPrint, gameManage, employeeManage, payroll, dayReset, historyDelete, settings`.
Admin has all implicitly; unknown/future ids default-deny for cashiers.

---

## 11. Tests Performed

Two suites, **76 assertions, all passing**. Tests run in plain Node against an **in-memory** store
shim, so **no production database is ever opened, read, reset, or written**.

**`tests/phase3b-auth.test.js` — 61 assertions**, mapped to the 14 required tests:

| # | Required test | Result |
|---|---|---|
| 1 | Fresh authentication initialization | PASS (5 assertions) |
| 2 | Existing v2.5.1 password migration | PASS (3) |
| 3 | Existing custom password remains valid | PASS |
| 4 | Default password behavior remains compatible | PASS |
| 5 | Admin account created exactly once | PASS (3) |
| 6 | Restart does not duplicate/overwrite Admin | PASS (3, byte-identical doc) |
| 7 | Password hashing produces non-plaintext storage | PASS (3: format, no plaintext, random salt) |
| 8 | Correct password verifies | PASS |
| 9 | Incorrect password fails | PASS (5, incl. malformed-hash rejection) |
| 10 | Password change works | PASS (7, incl. wrong-old rejection, weak-password rejection) |
| 11 | Existing application data remains intact | PASS (2 — all `K_*` records byte-identical) |
| 12 | No production database reset/wiped | PASS (3 — writes hit only the additive key; no wipe primitive exists) |
| 13 | No ticket/printer/QR behavior changes | PASS (static regression vs. pre-phase SHA-256 baseline) |
| 14 | No activation/update behavior changes | PASS (`FLOOR_VERSION` still `2.5.1`, gate wiring intact) |

Plus session-foundation (4) and cashier-foundation (13) assertions: separate cashier password,
default-deny permissions, admin-only reset, `mustChangePass` set on reset and cleared on change,
cashier cannot self-reset without the old password.

**`tests/phase3b-ipc.test.js` — 15 assertions:** full renderer→preload→Main bridge simulation using
the exact handler registration from `main.js` and the exact bridge surface from `preload.js`,
verifying the login/changePass/resetCashier/hasPerm contract end-to-end, that the returned user
payload contains **no** hash, and that `resetCashier` is denied without an authenticated admin session.

**How to run:**
```
node tests/phase3b-auth.test.js
node tests/phase3b-ipc.test.js
```

### Test results (final run)

```
SUITE 1: 61 passed, 0 failed   (exit 0)
SUITE 2: 15 passed, 0 failed   (exit 0)
ALL GREEN
```

Three assertions initially failed and were corrected — both were **test-harness bugs, not module bugs**:
(i) a `JSON.stringify` whitespace assumption in the "exactly one admin" check, (ii) the session is a
Main-process singleton, so two sections needed explicit `logout()` for state isolation. The module
itself was not modified to satisfy any test.

---

## 12. Security Checks

- ✅ No plaintext password is stored anywhere (`malahy_users_v1` contains only `scrypt:` strings).
- ✅ No hardcoded, shared, or default cashier passwords (cashier accounts are created with their own
  password; none exist by default).
- ✅ No password hashes in renderer JavaScript — hashes live only in the Main process and are never
  sent over IPC.
- ✅ No recovery secrets, WhatsApp tokens, or external credentials in the code or storage
  (`recoveryWhatsapp`/`recoveryState` are empty placeholders).
- ✅ Authentication decisions (login, admin authorization, permission queries) are made in the Main
  process; the renderer receives only booleans and a sanitized user object.
- ✅ Constant-time hash comparison (`crypto.timingSafeEqual`); malformed hashes rejected safely.
- ✅ All auth IPC handlers are wrapped in try/catch — no unhandled exceptions can leak state or crash.
- ✅ No new server, backend, or network dependency introduced (Node built-in `crypto` only).
- ✅ No secrets in source code.

---

## 13. Regression Checks

- ✅ `package.json` version still `2.5.1`.
- ✅ `update-gate.js` `FLOOR_VERSION` unchanged (`2.5.1`).
- ✅ 16 protected files byte-identical to the pre-phase SHA-256 baseline (`index.html`, `database.js`,
  `activation.js`, `update-gate.js`, `package.json`, `README.md`, `launch.js`, `electron-builder.yml`,
  `assets/ticket/*`, `assets/vendor/qrcode.js`, `assets/icons/*`, `windows/*`).
- ✅ `main.js` printer IPC (`get-printers`, `print-ticket`) and update-gate wiring intact.
- ✅ Renderer password logic untouched (`getPass`, `openPasswordModal`, `empAskPass`).
- ✅ Renderer does not yet reference `malahyAuth` (no login UI — by design for 3B).
- ✅ No build performed (`dist/`, `releases/` contain no files modified in this session).
- ✅ No publish performed (no `latest.yml`/`app-update.yml` changes; no tag).
- ✅ No commit performed (`git log` head still `5388949 release: v2.5.0`).
- ✅ No production database touched (`%APPDATA%\كوكي بارك\malahy-data.json` does not exist on this
  machine; no repo-local `malahy-data*.json` created).
- ✅ Existing `K_*` records verified byte-identical after init and after password change.

---

## 14. Remaining Risks

1. **Auth is not yet enforced anywhere.** The foundation exists but nothing in `index.html` calls it;
   the v2.5.1 renderer still gates operations on `getPass()`. Enforcement (Phase 3C) is the next step.
2. **`db-set`/`db-delete` remain unauthenticated**, as in v2.5.1 (Phase 3A Section D). Gating them
   requires an authenticated session to exist first, so it belongs in Phase 3C — not 3B.
3. **Transition `K_PASS` sync:** admin password changes are mirrored to the legacy `K_PASS` key so the
   untouched v2.5.1 renderer stays consistent. This keeps a plaintext copy in the legacy key (exactly
   as v2.5.1 already does) and should be removed once the login UI replaces the renderer's password
   modals.
4. **No brute-force lockout or rate limiting** on `auth:login` yet — recommended before enforcement.
5. **No recovery path yet** — a forgotten admin password still requires the legacy `K_PASS` mechanism;
   recovery (WhatsApp / local recovery key) is deferred per the 3A brief.
6. **`createCashier` has no IPC handler yet** — it is an internal foundation function used by the tests
   and reserved for the future cashier-management UI.

---

## 15. Exact Next Recommended Phase

**Phase 3C — Login screen + sensitive-IPC authorization.** In order:

1. Login screen on boot (after the activation/update gate) that calls `auth:login` and holds the
   returned session; hide rather than disable disallowed UI per Phase 3A Section G.
2. Renderer gate function `requirePerm(permId, {onOk, …})` wrapping the existing `openPasswordModal` /
   `empAskPass` bodies, swapping the ~20 call sites listed in 3A Section L (behavior identical — only
   the decision source changes to the session/permissions).
3. Authorize `db-set` / `db-delete` for the sensitive keys (`K_PASS`, `K_HIST`, `K_EMP`, `K_GAMES`,
   `K_SETTINGS`, `K_USERS`) behind the Main-side session/permission check, leaving all other writes
   untouched.
4. Settings additions: Admin account card (username, password, recovery WhatsApp) + cashier
   management card (add / list / reset password / toggle permissions), wired to the existing handlers
   plus a new `auth:createCashier` handler.
5. Cashier `mustChangePass` enforcement at login (forced change screen).
6. Then: bump `package.json` version + `update-gate.js` `FLOOR_VERSION` together for the release.

---

## Final Safety Check

- ✅ `git diff` verified — only `main.js` (+24) and `preload.js` (+17) modified by this phase.
- ✅ No unrelated files changed (16 protected files byte-identical to baseline).
- ✅ `package.json` version still `2.5.1`.
- ✅ `update-gate.js` `FLOOR_VERSION` unchanged (`2.5.1`).
- ✅ No build performed.
- ✅ No publish performed.
- ✅ No commit performed.
- ✅ No production database reset or modified.

**Phase 3B complete. Phase 3C not started.**
