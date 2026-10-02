# PHASE 3C-2 — PERMISSION ENFORCEMENT
**Malahy (كوكي بارك) · v2.5.1 · Permission registry, renderer gate, Main-process DB protection**

> This phase implements **only** permission enforcement on top of the verified
> Phase 3B/3C-1 foundation. No login/session recreation, no password recovery,
> no WhatsApp, no cashier management UI, no permission management UI.
> The existing v2.5.1 protected operations keep their behavior — only their
> authorization decision source changes from a shared password to the
> centralized permission system.
>
> **No build performed. No publish performed. No commit performed. Version remains 2.5.1.
> No production database was reset or modified.**

---

## 1. Objective

Implement and enforce the permission system:

1. Centralized extensible permission registry (single source of truth).
2. Admin full access — implicit, never depends on a stored permission array.
3. Cashier configurable permission set with safe defaults.
4. Per-permission enable/disable support (each permission independent).
5. Renderer permission gate (`requirePerm`) replacing the password decision at
   every protected call site.
6. Main-process authorization for sensitive database keys (`db-set`, `db-delete`,
   `db-clear`).
7. Idempotent migration of existing cashier accounts to default permissions.

---

## 2. Permission Registry

**File:** `permissions.js` — loaded by both Main (`require`) and renderer (`<script>` → `window.MalahyPerms`).

### Registered permission IDs (16 total)

| ID | Arabic label | Cashier default |
|---|---|---|
| `sales` | بيع التذاكر | ALLOW |
| `ticketPrint` | طباعة التذاكر | ALLOW |
| `returns` | خصم/مرتجع التذاكر | ALLOW |
| `expenseAdd` | إضافة مصروف | ALLOW |
| `expenseDelete` | حذف مصروف | ALLOW |
| `giftAdd` | إضافة هدية | ALLOW |
| `giftDelete` | حذف هدية | ALLOW |
| `reports` | عرض التقارير | ALLOW |
| `reportPrint` | طباعة التقارير | ALLOW |
| `reportExport` | تصدير التقارير | DENY |
| `gameManage` | إدارة الألعاب | DENY |
| `employeeManage` | إدارة الموظفين | DENY |
| `payroll` | صرف الرواتب | DENY |
| `dayReset` | إعادة تعيين اليوم | DENY |
| `historyDelete` | حذف السجل | DENY |
| `settings` | الإعدادات | DENY |

### Rules

- `expenseDelete` and `giftDelete` are **fully independent** of `expenseAdd` / `giftAdd`.
- Unknown/unregistered permission IDs → **default-deny** for cashiers.
- Admin → **always allowed**, including any future ID added to the registry.
- The registry is the single source; `users.js` re-exports `PERMS` from it — no duplication.

---

## 3. Admin Behavior

- Exactly one admin account per installation (enforced by Phase 3B `initUsers`).
- Admin has **every known permission automatically** via `allPermsMap()` — built dynamically from `PERMS`, so any newly-added ID is immediately granted.
- Admin record stores **no `permissions` field** — full access is implicit, not data-dependent.
- Admin cannot accidentally lose access when a new permission is added.
- Admin session is the sole authority for `setCashierPermissions` and `resetCashier`.

---

## 4. Cashier Default Permissions

On creation (`createCashier` without an explicit `permissions` argument) or on migration (`initUsers` finding a cashier with no valid `permissions` object), the cashier receives `defaultCashierPerms()` — a deep copy of `DEFAULT_CASHIER_PERMS` from `permissions.js`.

- Existing customized permission sets are **never overwritten** by migration.
- Migration is idempotent: running `initUsers` multiple times produces byte-identical output after the first pass.

---

## 5. Permission Mapping (Operation → Permission ID → Entry Point → Main-side protection)

| Operation | Permission ID | Renderer entry point | Main-side key protection |
|---|---|---|---|
| Sell ticket | `sales` | `addTicket` :2497, `addBatch` :2599 | — (non-sensitive `K_STATE`) |
| Print ticket | `ticketPrint` | `printTicket` :3991, `reprintGift` :4081 | — |
| Return/deduct ticket | `returns` | `deductBatch` :2544, `deductOne` :2577 | — (non-sensitive `K_STATE`) |
| Add expense | `expenseAdd` | `_addItem('exp')` :2680 | — (non-sensitive `K_STATE`) |
| Delete expense | `expenseDelete` | `deleteItem('exp',…)` :2688 | — (non-sensitive `K_STATE`) |
| Add gift | `giftAdd` | `_addItem('gift')` :2677 | — (non-sensitive `K_STATE`) |
| Delete gift | `giftDelete` | `deleteItem('gift',…)` :2688 | — (non-sensitive `K_STATE`) |
| View reports | `reports` | `openReports` :3214 | — |
| Print report | `reportPrint` | `printReviewLog` :3365, `printTodayReport` :4186, `printDayReportObj` :4211 | — |
| Export report | `reportExport` | `exportReportPDF` :3550, `exportReportExcel` :3561 | — |
| Manage games | `gameManage` | `openGameMgmt` :5799, `gmForm` :5915, `gmToggle` :6004/6008, `gmDelete` :6022, restore :5902 | `K_GAMES` write/delete |
| Manage employees | `employeeManage` | `openEmployees` :4805, `empDelete` :5320, `empStartNewWeek` :5332, edit :4873, money-section delete :5008, `openDailyReg` :5633, `drSetAmount` :5580 | `K_EMP` write/delete |
| Pay payroll | `payroll` | `empPayOne` :5289, `empPayAll` :5306 | `K_EMP` write (shared with employeeManage) |
| Reset business day | `dayReset` | `requestRestart` :2712 | `K_HIST` write (archive step) |
| Delete history | `historyDelete` | `deleteHistDay` :2882, `clearAllHistory` :2900 | `K_HIST` write/delete |
| Access settings | `settings` | `openSettings` :4301, `openChangePass` :2759, theme toggles :1586/:1587 | `K_SETTINGS` write, `K_PASS` write |

---

## 6. Files Modified

| File | Change | Nature |
|---|---|---|
| `main.js` | Added `PERMLIB` + `users` imports at top; gated `db-set`/`db-delete`/`db-clear` behind `authorizeDbOp`; moved `users` singleton declaration before IPC block; added `auth:setCashierPerms` handler | Additive security boundary |
| `preload.js` | Added `setCashierPerms` method to existing `malahyAuth` bridge | Additive |
| `users.js` | Imported `PERMLIB` from `permissions.js`; replaced inline `PERMS`/`allPerms`/`sanitizePerms` with delegations to `PERMLIB`; rewrote `initUsers` to migrate cashier permissions idempotently; updated `createCashier` to apply defaults; added `setCashierPermissions` + `getCashierPermissions` | Refactor + additive |
| `login.js` | `unlock()` calls `MalahyPerm.setSession(_session)`; `doLogout()` calls `MalahyPerm.clearSession()` before re-locking | Additive wiring |
| `index.html` | (a) `<script src="permissions.js">` + `<script src="perm-gate.js">` after `login.js`. (b) Fail-closed fallback for `MalahyPerm` if `perm-gate.js` doesn't load. (c) `data-perm` attributes on admin-only buttons. (d) All ~20 `openPasswordModal`/`empAskPass` call sites swapped to `MalahyPerm.requirePerm`/`hasPerm`/`deny`. (e) Silent guards on unprotected-but-administrative functions (`openReports`, `openSettings`, `openGameMgmt`, `openEmployees`, `openDailyReg`, `printTodayReport`, `printDayReportObj`, `exportReportPDF`, `exportReportExcel`, `printReviewLog`, `reprintGift`, `addTicket`, `addBatch`, `openChangePass`, `drSetAmount`, `gmShowArchivedBuild` restore). | Decision-source swap only |

---

## 7. Files Created

| File | Purpose |
|---|---|
| `permissions.js` | Centralized permission registry (Main + renderer shared) |
| `perm-gate.js` | Renderer permission gate (`requirePerm`, `hasPerm`, `deny`, `setSession`, `clearSession`, `applyVisibility`) |
| `tests/phase3c2-perms.test.js` | Registry, defaults, admin behavior, migration — 39 assertions |
| `tests/phase3c2-gate.test.js` | Renderer gate simulation over DOM shim — 44 assertions |
| `tests/phase3c2-ipc.test.js` | Main-process DB protection + IPC simulation — 49 assertions |
| `tests/phase3c2-baseline.test.js` | Source-level regression + gate/baseline checks — 63 assertions |
| `AI_REPORTS/PHASE_3C2_PERMISSION_ENFORCEMENT.md` | This report |

**Total new assertions: 195, all passing.**

---

## 8. Files Intentionally Untouched

Verified against `tests/protected-baseline.json` SHA-256 capture (pre-Phase-3B):

- `database.js` (storage engine — unchanged)
- `activation.js` (activation gate — unchanged)
- `update-gate.js` (`FLOOR_VERSION` still `2.5.1`)
- `package.json` (version still `2.5.1`)
- `launch.js` · `electron-builder.yml` · `README.md`
- `assets/ticket/ticket-template.svg` · `assets/ticket/ticket-template.js`
- `assets/vendor/qrcode.js`
- `assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`
- `windows/splash.html` · `windows/update.html`
- All existing `K_*` data records

`index.html` is the only baseline file changed — this is the intended Phase 3C-2 modification (permission gate wiring). Its delta is purely the decision-source swap plus additive script tags and `data-perm` attributes; no business logic, calculation, ticket rendering, printer, shift, sales, payroll, report-data, branding, activation, or update code was altered.

---

## 9. Renderer Authorization Design

**Central gate:** `perm-gate.js` exposes `window.MalahyPerm` with:

- `hasPerm(permId)` — silent check (admin → true; cashier → explicit grant only; unknown → false; no session → false).
- `requirePerm(permId, opts)` — authorized → opens a confirm modal (no password field) → calls `opts.onOk(reason)`; denied → shows `"ليس لديك صلاحية لتنفيذ هذه العملية"` toast, never calls `onOk`.
- `setSession(user)` / `clearSession()` — fed exclusively by `login.js` (sanitized payload from `auth:login`); holds no secrets.
- `applyVisibility()` — hides `[data-perm]` elements the current session lacks (UX layer; enforcement is at the operation).
- `secondary:true` option uses `.ovl2` pattern (keeps parent modal open) matching the existing `empAskPass` UX for employees/games screens.

**Fail-closed fallback in `index.html`:** if `perm-gate.js` fails to load, an inline stub defines `window.MalahyPerm` that denies everything except admin-role sessions, ensuring no operation runs ungated.

**No separate permission logic at any button** — every protected call site delegates to the central gate.

---

## 10. Main-Process Authorization Design

**Authority chain:**

```
renderer (index.html)
  └─ MalahyPerm.hasPerm / requirePerm   ← UX layer (not the only protection)
       └─ window.malahyDB.set/delete     ← IPC sendSync
            └─ main.js db-set/db-delete  ← FINAL AUTHORITY
                 └─ PERMLIB.authorizeDbOp(op, key, users.getSession(), exists)
                      └─ users.js currentSession  ← Main-process in-memory session
                           └─ database.js         ← storage engine (unchanged)
```

- `authorizeDbOp` returns `true` for non-sensitive keys (preserving all existing v2.5.1 flows).
- `malahy_users_v1` is **never writable via renderer IPC** — even for admin (written only internally by `users.js`).
- Sensitive keys require a matching permission in the active Main-process session.
- Boot-seed exception: first creation of an absent sensitive key (`exists=false`, op=`write`) is allowed without a session, so initial game/settings seeding works before any login. Modification of an existing key always requires authorization.
- `db-clear` requires an admin session.
- Denied attempts are logged via `appendLog` for auditing.

---

## 11. Database Protection Changes

| Key | Write permission | Delete permission | Notes |
|---|---|---|---|
| `malahy_pos_pass_v1` | `settings` | `settings` | Legacy password — kept writable by admin for transition |
| `malahy_pos_history_v1` | `dayReset` OR `historyDelete` | `historyDelete` | Archive writes need `dayReset`; deletions need `historyDelete` |
| `malahy_employees_v1` | `employeeManage` OR `payroll` | `employeeManage` | Payroll payment writes share the employee key |
| `malahy_pos_games_v1` | `gameManage` | `gameManage` | |
| `malahy_pos_settings_v1` | `settings` | `settings` | |
| `malahy_users_v1` | **NEVER via IPC** | **NEVER via IPC** | Written only by `users.js` internally |

Non-sensitive keys (`malahy_pos_state_v1`, `malahy_pos_seq_v1`, `malahy_gift_seq_v1`, `malahy_pos_txlog_v1`, `malahy_review_log_v1`, `malahy_daily_reg_v1`, `malahy_pos_gameaudit_v1`, `malahy_pos_gamesnaps_v1`, `malahy_activated`) are completely unaffected — all existing sales, printing, logging, and attendance flows work exactly as in v2.5.1.

---

## 12. Migration Behavior

`initUsers()` (called once at boot inside `app.whenReady()`, wrapped in try/catch):

1. Reads the existing `malahy_users_v1` document (or starts fresh).
2. For each cashier with no valid `permissions` object (missing, null, array, or non-object): assigns `defaultCashierPerms()` and marks `changed=true`.
3. If admin record is missing or has no valid scrypt hash: migrates from `K_PASS` (or uses `DEFAULT_PASS`). Preserves any existing `recoveryWhatsapp` value.
4. Writes only if `changed=true` → **idempotent**: repeated calls produce byte-identical output.
5. Existing customized cashier permission sets are **never overwritten**.
6. Admin record never gets a `permissions` field — full access is implicit.

---

## 13. Password Transition Status

- The legacy `getPass()` function and `K_PASS` key remain intact and functional.
- `openPasswordModal` and `empAskPass` definitions remain in `index.html` (unused by any call site after this phase, but not deleted — backward-compatibility safety net).
- `submitChangePass` still reads/writes `K_PASS` (gated by `settings` permission in the renderer; Main-side `db-set` for `K_PASS` also requires `settings`).
- `updatePassBanner` still works unchanged.
- The Phase 3B `K_PASS` sync in `users.changePass` (admin password mirrored to `K_PASS`) remains active.
- **Obsolete after this phase:** all `openPasswordModal(...)` and `empAskPass(...)` call sites that previously checked the shared password — they now delegate to `MalahyPerm.requirePerm`. The functions themselves are dead code but intentionally preserved for rollback safety. Removal belongs to a later cleanup phase.

---

## 14. Test List → Results

### Phase 3C-2 suites (new)

| # | Required test | Suite | Result |
|---|---|---|---|
| 1 | Admin can perform every registered permission | perms | PASS |
| 2 | Cashier default permissions are correct | perms, gate | PASS |
| 3 | Cashier can sell tickets | gate | PASS |
| 4 | Cashier can print tickets | gate | PASS |
| 5 | Cashier can perform returns | gate | PASS |
| 6 | Cashier can add expense | gate | PASS |
| 7 | Cashier can delete expense | gate | PASS |
| 8 | Cashier can add gift | gate | PASS |
| 9 | Cashier can delete gift | gate | PASS |
| 10 | Cashier can view reports | gate | PASS |
| 11 | Cashier can print reports | gate | PASS |
| 12 | Cashier cannot export reports by default | gate | PASS |
| 13 | Cashier cannot manage games by default | gate | PASS |
| 14 | Cashier cannot manage employees by default | gate | PASS |
| 15 | Cashier cannot access payroll by default | gate | PASS |
| 16 | Cashier cannot reset the business day | gate | PASS |
| 17 | Cashier cannot delete history | gate | PASS |
| 18 | Cashier cannot access protected settings | gate | PASS |
| 19 | Disabling expenseDelete blocks expense deletion | perms, gate | PASS |
| 20 | Disabling giftDelete blocks gift deletion | perms, gate | PASS |
| 21 | Re-enabling a permission restores access | perms, gate | PASS |
| 22 | Unknown permission denies Cashier | perms, gate | PASS |
| 23 | Admin remains authorized even when no permission array exists | perms | PASS |
| 24 | Sensitive K_* writes rejected without Main-side authorization | ipc | PASS |
| 25 | Sensitive K_* deletes rejected without Main-side authorization | ipc | PASS |
| 26 | Existing login still works | ipc | PASS |
| 27 | Logout still works | ipc | PASS |
| 28 | Activation Gate unchanged | baseline | PASS |
| 29 | Mandatory Update Gate unchanged | baseline | PASS |
| 30 | Ticket/QR/printer behavior unchanged | baseline | PASS |

### Exact results (final run)

```
tests/phase3c2-perms.test.js      39 passed, 0 failed   (exit 0)
tests/phase3c2-gate.test.js       44 passed, 0 failed   (exit 0)
tests/phase3c2-ipc.test.js        49 passed, 0 failed   (exit 0)
tests/phase3c2-baseline.test.js   63 passed, 0 failed   (exit 0)
                                  ─────────────────────
                                  195 passed, 0 failed
```

### Regression results

```
tests/phase3b-auth.test.js        60 passed, 1 failed   (expected: index.html baseline delta)
tests/phase3b-ipc.test.js         15 passed, 0 failed
tests/phase3c1-session.test.js    30 passed, 0 failed
tests/phase3c1-ipc.test.js        19 passed, 0 failed
tests/phase3c1-dom.test.js        37 passed, 0 failed
tests/phase3c1-gate.test.js       48 passed, 0 failed
```

> The single Phase 3B "failure" is **expected and correct**: `phase3b-auth.test.js` compares `index.html` against the pre-Phase-3B baseline, and `index.html` is the one file Phases 3C-1 and 3C-2 intentionally change. Every other baseline file matches. The Phase 3C-2 baseline suite independently confirms all 16 protected files (excluding `index.html`) are byte-identical.

How to run:
```
node tests/phase3c2-perms.test.js
node tests/phase3c2-gate.test.js
node tests/phase3c2-ipc.test.js
node tests/phase3c2-baseline.test.js
node tests/phase3b-auth.test.js
node tests/phase3b-ipc.test.js
node tests/phase3c1-session.test.js
node tests/phase3c1-ipc.test.js
node tests/phase3c1-dom.test.js
node tests/phase3c1-gate.test.js
```

All suites run in plain Node against an in-memory store and a minimal DOM shim — no Electron, no production database, no build required.

---

## 15. Security Checks

- ✅ No password hashes sent to renderer (unchanged from Phase 3B).
- ✅ No permission decision trusts a renderer-provided role — the gate reads only the sanitized session fed by `login.js` (which comes from `auth:login` in Main).
- ✅ Main process owns the authoritative session; `authorizeDbOp` checks it directly.
- ✅ Cashier cannot gain Admin permissions by modifying renderer state — `setCashierPermissions` requires an admin Main-session; `malahy_users_v1` is never writable via IPC.
- ✅ Unknown permission IDs deny cashiers (registry-based check in both `permissions.js` and `perm-gate.js`).
- ✅ Admin automatically receives new permissions (`allPermsMap()` built dynamically from `PERMS`).
- ✅ Sensitive database keys cannot be modified by an unauthorized renderer request.
- ✅ Existing login/logout behavior remains unchanged (verified by regression suites).
- ✅ Denied operations show only `"ليس لديك صلاحية لتنفيذ هذه العملية"` — no technical details, no hashes, no session internals, no DB keys, no IPC details.

---

## 16. Remaining Limitations

1. **No cashier management UI** — `setCashierPermissions` / `getCashierPermissions` exist as secure APIs but have no frontend yet (Phase 3C-3+).
2. **No permission management UI** — same as above.
3. **Legacy password functions preserved but dead** — `openPasswordModal`, `empAskPass`, `getPass`, `submitChangePass`, `updatePassBanner` remain in `index.html` for rollback safety; removal belongs to a later cleanup phase.
4. **Transition `K_PASS` sync** (Phase 3B) remains active — admin password changes are mirrored to `K_PASS`. Should be removed once the legacy renderer password paths are fully retired.
5. **No brute-force lockout or rate limiting** on `auth:login` (carried over from Phase 3B).
6. **No recovery path** — forgotten admin password still relies on the legacy mechanism; WhatsApp recovery deferred.
7. **Boot-seed exception** allows first-write of a sensitive key without a session — necessary for initial game/settings seeding before login. Mitigated by the fact that this only applies when the key is entirely absent (fresh install).

---

## 17. Recommended Next Phase

**Phase 3C-3 — Cashier & permission management UI.** In order:

1. Settings additions: Admin account card (username, password change via `auth:changePass`) + Cashier management card (add/list/reset-password/toggle-permissions), wired to existing handlers plus `auth:createCashier` IPC handler.
2. Permission toggle UI using `auth:setCashierPerms` / `auth:getCashierPerms`.
3. Remove the legacy `openPasswordModal` / `empAskPass` / `getPass` / `submitChangePass` / `updatePassBanner` dead code and the `K_PASS` sync.
4. Then: bump `package.json` version + `update-gate.js` `FLOOR_VERSION` together for the release.

---

## Final Safety Check

- ✅ `git diff` verified — Phase 3C-2 changes: `main.js` (+~50 lines: imports, db gating, setCashierPerms handler), `preload.js` (+3 lines: setCashierPerms bridge), `users.js` (refactored to use PERMLIB + migration + new APIs), `login.js` (+4 lines: setSession/clearSession wiring), `index.html` (decision-source swap + script tags + data-perm + fallback).
- ✅ New files: `permissions.js`, `perm-gate.js`, 4 test suites, this report.
- ✅ 16 protected baseline files byte-identical (all except the intentionally-changed `index.html`).
- ✅ `package.json` version still `2.5.1`.
- ✅ `update-gate.js` `FLOOR_VERSION` unchanged (`2.5.1`).
- ✅ No build performed.
- ✅ No publish performed.
- ✅ No commit performed.
- ✅ No production database reset or modified.

**Phase 3C-2 complete. STOP — awaiting explicit approval before Phase 3C-3.**
