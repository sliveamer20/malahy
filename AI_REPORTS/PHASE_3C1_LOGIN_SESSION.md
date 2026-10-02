# PHASE 3C-1 — LOGIN & SESSION
**Malahy (كوكي بارك) · v2.5.1 · Login screen, session initialization, logout only**

> This phase implements **only** the first part of Phase 3C: the login screen, login/session
> initialization, logout/session clearing, and gating the main POS UI until a valid user logs in.
> It builds on the **existing, verified Phase 3B authentication foundation** (`users.js`, `malahyAuth`,
> `auth:*` IPC) without recreating or replacing it.
>
> Permission enforcement, permission/cashier management UI, WhatsApp recovery, recovery codes,
> password-reset UI, and `db-set`/`db-delete` authorization are all **explicitly out of scope** and
> were **not** implemented. The existing v2.5.1 protected operations still use their current
> `getPass()` mechanism unchanged (that refactor is Phase 3C-2).
>
> **No build performed. No publish performed. No commit performed. Version remains 2.5.1.
> No production database was reset or modified.**

---

## 1. Phase Objective

After the existing **Activation Gate** and **Mandatory Update Gate** complete successfully, the
application must **not** immediately expose the POS interface. Instead:

1. Show a login screen (username + password + login button, Arabic RTL, app branding).
2. Authenticate through the existing `window.malahyAuth.login()` bridge (Main-process decision).
3. On success: establish the session, hide the login screen, reveal the existing POS — without
   reloading the application or changing its behavior.
4. On failure: stay on the login screen with a **generic** error, never revealing which credential
   was wrong and never exposing hashes/internal details.
5. Block accidental access to the POS UI before a successful login.
6. Force a `mustChangePass` user to change their password (via the existing `auth:changePass`)
   before entering the POS.
7. Provide a minimal logout that clears the Main-process session and returns to the login screen
   **without touching any data, settings, or business-day state.**

---

## 2. Files Modified

| File | Change | Nature |
|---|---|---|
| `main.js` | New `auth:logout` IPC handler (+6 lines incl. comment). Calls `users.logout()` which clears the in-memory Main-process session only. | Additive; reuses Phase 3B `users` singleton. |
| `preload.js` | New `logout: () => ipcRenderer.invoke("auth:logout")` method on the existing `window.malahyAuth` bridge (+2 lines). | Additive. |
| `index.html` | (a) Login-overlay CSS (~45 lines, reusing the activation-overlay card style). (b) `#loginOverlay` markup: logo, venue name, "تسجيل الدخول", username/password/login button, error area, and a hidden forced-password-change form. (c) `<script src="login.js" defer>` after `activation.js`. (d) A fail-closed inline fallback that keeps the POS covered if `login.js` fails to load. (e) One "تسجيل الخروج" button in the existing actions row wired to `malahyLogout()`. | **Purely additive** — verified 0 deletions of pre-existing content in this phase's diff. |

> The `git status` modifications of `README.md`, `package.json`, `update-gate.js` **pre-date this
> phase** (already present at Phase 3B session start; the `package.json` change is the pre-existing
> `2.5.0`→`2.5.1` release bump). They are byte-identical to the pre-3B SHA-256 baseline
> (`tests/protected-baseline.json`), i.e. **untouched by 3C-1**.

---

## 3. Files Created

| File | Purpose |
|---|---|
| `login.js` | Renderer login/session module (IIFE): shows the login screen after the activation gate, locks the POS (`inert` + `aria-hidden` + event blocking + focus trap), calls only `window.malahyAuth.*`, handles `mustChangePass` forced change, unlocks the POS on success, and re-locks on logout. Exposes `window.MalahyLogin` and `window.malahyLogout`. |
| `tests/phase3c1-session.test.js` | Main-process session behavior suite — **30 assertions**. |
| `tests/phase3c1-ipc.test.js` | End-to-end IPC bridge simulation incl. `auth:logout` — **19 assertions**. |
| `tests/phase3c1-dom.test.js` | Renderer flow simulation over a minimal DOM shim running the real `login.js` — **37 assertions**. |
| `tests/phase3c1-gate.test.js` | Boot-order, protected-file regression vs. the Phase 3B baseline, and source-level security checks — **48 assertions**. |
| `AI_REPORTS/PHASE_3C1_LOGIN_SESSION.md` | This report. |

**Total new assertions: 134, all passing.**

---

## 4. Files Intentionally Untouched

Verified byte-identical against `tests/protected-baseline.json` (pre-Phase-3B SHA-256 capture):

- `database.js` (entire storage engine — the auth module uses it as-is via dependency injection)
- `activation.js` (entire activation gate — `malahy_activated`, `setBgLock`, focus trap all intact)
- `update-gate.js` (logic; `FLOOR_VERSION` unchanged at `2.5.1`)
- `users.js` (the Phase 3B foundation — **not recreated, not replaced**; architecture unchanged)
- `launch.js` · `electron-builder.yml` · `README.md` · `package.json` (version still `2.5.1`)
- `assets/ticket/ticket-template.svg` · `assets/ticket/ticket-template.js` (ticket design)
- `assets/vendor/qrcode.js` (QR)
- `assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`
- `windows/splash.html` · `windows/update.html`
- All existing `K_*` data records (sales, history, expenses, gifts, returns, games, employees,
  payroll, settings, branding, printer/QR/shift configuration)

`index.html` is the **only** baseline file changed, and only by **additive** login-screen content —
this is the intended 3C-1 change and is the single expected delta in the Phase 3B baseline check.

---

## 5. Exact Login Flow

```
Activation Gate (activation.js — unchanged, renderer)
        │  markActivated() → #actOverlay.hide, setBgLock(false)
        ▼
Mandatory Update Gate (main.js → update-gate.js — unchanged, Main process)
        │  app.whenReady(): users.initUsers() → runUpdateGate()
        │  proceed → createMainWindow() ; else → locked update window
        ▼
Authentication Login (login.js — NEW)
        │  #actOverlay loses "show" (MutationObserver) or is already hidden
        │  → activateLogin(): setBgLock(true) + #loginOverlay.show + focus trap
        ▼
window.malahyAuth.login({username, password})  ──IPC──►  auth:login (users.js)
        │
        ├─ ok:true, user.mustChangePass !== true  → unlock() → POS
        └─ ok:true, user.mustChangePass === true  → forced-change form
                                                    └─ auth:changePass ok → unlock() → POS
        └─ ok:false → generic error, password field cleared, still locked (no session)
```

Key properties:
- The login screen appears **only after** the activation overlay hides and **only after** the update
  gate has already allowed the main window to be created (the gate runs before `createMainWindow()`
  in `app.whenReady()`).
- While the activation overlay is still up, the login screen is **not** shown, and the activation
  overlay stays fully interactive (the login lock deliberately skips `#actOverlay`).
- **No page reload** on login: `unlock()` only removes the overlay and the `inert` attributes. The
  existing renderer state, DOM, and in-memory data are preserved exactly.
- Enter key in any login/change field submits the visible form.

---

## 6. Session Behavior

- The session lives **only** in the Main process (`users.js` `currentSession`) and holds **no
  secrets** (userId, role, username, active, perms, loggedInAt).
- The renderer holds only the **sanitized** user object returned by `auth:login`
  (`{id, username, role, active, mustChangePass, perms}`) in a private module variable inside
  `login.js` — never a password, hash, or salt (verified by assertion).
- A **failed login never creates a session**; a successful one always does.
- `auth:hasPerm` returns `false` when there is no session.

---

## 7. Logout Behavior

- A "🚪 تسجيل الخروج" button was added to the **existing actions row** (next to "تغيير كلمة السر")
  — the most consistent, least intrusive location in the current UI; no unrelated restructuring.
- `malahyLogout()` → `MalahyLogin.logout()`:
  1. Re-locks the POS and shows the login screen **immediately** (fail-closed, before the IPC round-trip).
  2. Invokes `window.malahyAuth.logout()` → `auth:logout` → `users.logout()` → clears the
     Main-process in-memory session.
- Logout **does not** delete database data, reset settings, reset the business day, or affect
  sales/history/reports/printers in any way (verified: `K_PASS` and all `K_*` records byte-identical
  after a full login/logout cycle).
- After logout the POS is inaccessible until another successful login (re-locked + covered).

---

## 8. mustChangePass Behavior

- On successful login where the sanitized user has `mustChangePass === true`, the login overlay
  switches to a **forced-password-change state**: a clear message ("يجب تغيير كلمة المرور قبل
  استخدام البرنامج"), fields for the current password / new password / confirmation, and the POS
  stays covered and `inert`.
- The change goes through the **existing `auth:changePass`** foundation (requires the current
  password; enforces `MIN_PASS_LEN = 4` Main-side). The renderer also validates confirmation-match
  and minimum length for UX, but the **decision is Main-side**.
- A rejected change keeps the user on the change form with the POS still locked. A successful change
  clears `mustChangePass` and unlocks the POS.
- **Admin** behavior is compatible with the Phase 3B design: the migrated admin account is created
  with no `mustChangePass` flag (Phase 3B `initUsers`), so admin logs straight in; the same forced
  path would apply if the flag were ever set on the admin record.

---

## 9. Activation / Update Gate Compatibility

- The startup sequence is unchanged: `app.whenReady()` → `createSplash()` → `users.initUsers()` →
  `runUpdateGate()` → `createMainWindow()` (or the locked update window). Verified by byte-position
  assertion inside the `app.whenReady` block.
- Login is **after** both gates: the update gate runs before the main window (and therefore before
  any renderer/login code) exists; the login screen waits for the activation overlay to hide.
- Neither gate is weakened or bypassed. The activation overlay's own lock/focus-trap is untouched,
  and the login lock explicitly leaves `#actOverlay` interactive so activation can never break.
- `FLOOR_VERSION` remains `2.5.1`; the gate's `closable: false` locked window is unchanged.

---

## 10. Database Compatibility

- **No migration beyond what already exists.** `users.initUsers()` (Phase 3B, idempotent) still runs
  at boot; the only storage key written by auth is the additive `malahy_users_v1`.
- Existing v2.5.1 installation data is fully preserved. Verified: after a complete
  login → forced-change → logout cycle, every pre-seeded `K_*` record
  (`malahy_pos_state_v1`, `malahy_pos_history_v1`, `malahy_pos_settings_v1`, `malahy_pos_games_v1`,
  `malahy_employees_v1`, `malahy_pos_seq_v1`, `malahy_pos_pass_v1`) is **byte-identical**, and no new
  top-level keys appear beyond `malahy_users_v1`.
- The legacy Admin migration from `K_PASS` continues to work exactly as in Phase 3B (and `K_PASS` is
  not modified by login or logout).
- No production database was opened, read, reset, or written by any test — all suites run against an
  in-memory store shim.

---

## 11. Security Checks

- ✅ The session remains **Main-process controlled**; every authentication decision
  (login accept/reject, password change) happens in `users.js` via the `auth:*` IPC handlers.
- ✅ The renderer **never** stores a password, `passwordHash`, salt, or any secret. `login.js` keeps
  only the sanitized `auth:login` payload, and never references `scrypt`, `passwordHash`, `salt`,
  `malahy_users_v1`, `malahyDB`, `loadJSON`, or `saveJSON` (verified by source assertions).
- ✅ All renderer auth access is via `window.malahyAuth` only — there is no alternative raw-DB path.
- ✅ Failed logins return a **single generic message** identical for "user-not-found",
  "wrong-password", and inactive accounts — no username-enumeration or hash/detail leakage; the
  internal error codes never reach the UI.
- ✅ The POS is unreachable before login: full-screen overlay + `inert`/`aria-hidden` on every other
  body element + capture-phase event blocking + Tab focus trap. A packaging failure that prevents
  `login.js` from loading still leaves the app covered (inline fail-closed fallback), mirroring the
  existing activation-gate safety pattern.
- ✅ The password field is always cleared after a failed attempt and after unlock; credentials are
  never left resident in the DOM.
- ✅ No new server, backend, network dependency, or third-party credential introduced.

---

## 12. Test List (18 required) → Mapping & Results

| # | Required test | Suite | Result |
|---|---|---|---|
| 1 | App startup reaches Activation/Update flow first | gate | PASS |
| 2 | Login screen appears after gates | dom | PASS |
| 3 | POS inaccessible before login | dom | PASS |
| 4 | Correct Admin credentials → login succeeds | session, ipc, dom | PASS |
| 5 | Correct Cashier credentials → login succeeds | session, dom | PASS |
| 6 | Wrong password → rejected | session, ipc, dom | PASS |
| 7 | Unknown username → rejected | session, ipc, dom | PASS |
| 8 | Failed login does not create a session | session, ipc, dom | PASS |
| 9 | Successful login creates the expected sanitized session | session, ipc, dom | PASS |
| 10 | Password/hash never returned to renderer | session, ipc | PASS |
| 11 | `mustChangePass` cashier cannot enter POS before changing | dom | PASS |
| 12 | Successful forced password change allows POS entry | session, ipc, dom | PASS |
| 13 | Logout clears session | session, ipc, dom | PASS |
| 14 | After logout, POS inaccessible until login again | dom | PASS |
| 15 | Existing database records unchanged | session, gate | PASS |
| 16 | Existing Activation Gate unchanged | gate (baseline + source) | PASS |
| 17 | Existing Mandatory Update Gate unchanged | gate (baseline + `FLOOR_VERSION`) | PASS |
| 18 | Ticket/QR/printer files untouched | gate (SHA-256 baseline) | PASS |

### 13. Exact Test Results (final run)

```
tests/phase3c1-session.test.js   30 passed, 0 failed   (exit 0)
tests/phase3c1-ipc.test.js       19 passed, 0 failed   (exit 0)
tests/phase3c1-dom.test.js       37 passed, 0 failed   (exit 0)
tests/phase3c1-gate.test.js      48 passed, 0 failed   (exit 0)
                                 ───────────────────────
                                 134 passed, 0 failed

Phase 3B regression:
tests/phase3b-auth.test.js       60 passed, 1 failed
tests/phase3b-ipc.test.js        15 passed, 0 failed
```

> The single Phase 3B "failure" is **expected and correct**: `phase3b-auth.test.js` compares
> `index.html` against the pre-Phase-3B baseline, and `index.html` is the one file Phase 3C-1
> intentionally changes (the login screen). Every other baseline file matches, and the Phase 3C-1
> gate suite re-performs the same baseline check while documenting `index.html` as the intentional
> delta. The Phase 3B test and baseline were left **untouched** as protected artifacts.

How to run:
```
node tests/phase3c1-session.test.js
node tests/phase3c1-ipc.test.js
node tests/phase3c1-dom.test.js
node tests/phase3c1-gate.test.js
```

All suites run in plain Node against an **in-memory** store and a minimal DOM shim — no Electron,
no production database, no build required.

---

## 14. Regression Checks

- ✅ `package.json` version still `2.5.1`.
- ✅ `update-gate.js` `FLOOR_VERSION` unchanged (`2.5.1`).
- ✅ 16 protected files byte-identical to the Phase 3B baseline (all except the intentionally-changed
  `index.html`).
- ✅ `index.html` 3C-1 diff is **purely additive** (0 pre-existing lines deleted; verified against the
  pre-3B baseline geometry). The other lines showing in `git status` are pre-existing working-tree
  changes documented in the Phase 3B report, not introduced here.
- ✅ `main.js` printer IPC (`get-printers`, `print-ticket`) and update-gate wiring intact.
- ✅ Renderer password logic untouched (`getPass`, `openPasswordModal`, `empAskPass`,
  `submitChangePass`, `updatePassBanner`) — legacy v2.5.1 protected operations behave exactly as
  before (Phase 3C-2 will swap their decision source).
- ✅ Activation gate (`activation.js`) byte-identical and still the sole activation authority.
- ✅ Ticket SVG/CSS/JS, QR vendor lib, shift logic, and printer configuration untouched.
- ✅ No build performed. No publish performed. No commit performed.
- ✅ No production database reset or modified.

---

## 15. Remaining Limitations

1. **Permissions are not enforced yet.** The session exists but no operation checks it; the existing
   `getPass()` mechanism still gates protected operations. This is by design for 3C-1 (Phase 3C-2).
2. **`db-set`/`db-delete` remain unauthenticated**, as in v2.5.1 (Phase 3A Section D). The login
   session now exists, so this work can proceed in Phase 3C-2.
3. **No cashier management UI** — cashier accounts can only be created via `users.createCashier`
   (internal/test API); there is no `auth:createCashier` IPC handler yet (Phase 3C-2/3).
4. **No brute-force lockout or rate limiting** on `auth:login` (carried over from Phase 3B).
5. **No recovery path** — a forgotten password still relies on the legacy mechanism; WhatsApp recovery
   and recovery codes are explicitly deferred.
6. **Transition `K_PASS` sync** (Phase 3B) remains in place so the untouched v2.5.1 renderer password
   modals stay consistent; it should be removed once Phase 3C-2 replaces the renderer's password
   decision source.
7. **Login screen branding** uses the existing `brandName()`/`brandLogo()` at activation time; a
   settings change to branding requires a re-login (or re-show of the login screen) to re-render on
   the login card. This is a minor cosmetic limitation only.

---

## 16. Recommended Next Phase

**Phase 3C-2 — Permission enforcement at operations.** In order:

1. Add a renderer gate `requirePerm(permId, { onOk, title, message })` wrapping the existing
   `openPasswordModal` / `empAskPass` bodies, and swap the ~20 call sites listed in Phase 3A
   Section L — behavior identical, only the decision source changes to the session/permissions.
2. Hide (not just disable) admin-only UI for cashiers per Phase 3A Section G.
3. Authorize `db-set` / `db-delete` for the sensitive keys (`K_PASS`, `K_HIST`, `K_EMP`, `K_GAMES`,
   `K_SETTINGS`, `K_USERS`) behind the Main-side session/permission check, leaving all other writes
   untouched.
4. Settings additions: Admin account card + cashier management card (add / list / reset password /
   toggle permissions), wired to the existing handlers plus a new `auth:createCashier`.
5. Then: bump `package.json` `version` and `update-gate.js` `FLOOR_VERSION` together for the release.

---

## Final Safety Check

- ✅ `git diff` verified — Phase 3C-1 changes are additive-only: `main.js` (+6 for `auth:logout`),
  `preload.js` (+2 for the bridge method), `index.html` (login overlay + CSS + script + fallback +
  logout button), plus the new `login.js` and test/report files.
- ✅ No unrelated files changed (16 protected files byte-identical to the Phase 3B baseline).
- ✅ `package.json` version still `2.5.1`.
- ✅ `update-gate.js` `FLOOR_VERSION` unchanged (`2.5.1`).
- ✅ No build performed.
- ✅ No publish performed.
- ✅ No commit performed.
- ✅ No production database reset or modified.

**Phase 3C-1 complete. STOP — awaiting explicit approval before Phase 3C-2.**
