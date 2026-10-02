# PHASE 3A — SECURITY & AUTHORIZATION AUDIT REPORT
**Malahy (كوكي بارك) · v2.5.1 · READ-ONLY analysis**

> **IMPORTANT — READ-ONLY AUDIT**
> This audit was **analysis-only**. During the audit **no application files were modified**,
> nothing was built or published, nothing was committed, and the application version was not changed.
> The current v2.5.1 design and all existing functionality are considered **protected** and remain untouched.
>
> This document is an **archive copy** of the completed audit findings. It contains no new findings
> beyond what was observed by inspecting the actual project files, and it does not alter any
> conclusion of the audit.

---

## A. Current Authentication System

**There is no authentication system.** There is no login, no session, no users, no roles. The app boots
straight into the POS screen (after the one-time activation gate).

- **Activation** (`activation.js`) is a *license* check, not authentication: a single hardcoded code
  (XOR + base64 obfuscated, `activation.js:10-26`) verified locally against the key `malahy_activated`.
  It runs once and is unrelated to the operating password.
- **Everything else uses one shared global password** (see Section B).
- `main.js` and `preload.js` contain **zero** authentication or authorization logic.

---

## B. Current Password System

| Aspect | Finding |
|---|---|
| **How many passwords** | **Exactly ONE** — global, shared by every person and every operation |
| **Created** | `getPass()` — `index.html:2128`; lazily on first read |
| **Default** | `DEFAULT_PASS = '1234'` — `index.html:1872` |
| **Stored** | Key `K_PASS = 'malahy_pos_pass_v1'` inside `malahy-data.json` (`index.html:1865`) |
| **Hashing** | **NONE.** Stored as a plaintext string. No crypto anywhere (verified: no crypto/sha/bcrypt usage; the only `atob` in the codebase is the activation obfuscation) |
| **Verification** | Renderer-side plaintext compare: `val!==getPass()` in `openPasswordModal` (`index.html:2658`) and `empAskPass` (`index.html:4599`) |
| **Changed** | `openChangePass()` / `submitChangePass()` (`index.html:2627` / `:2643`) — requires the old password, then `saveJSON(K_PASS,nP)` |
| **Forgotten** | **NO recovery path exists.** Only a nudge banner `updatePassBanner()` (`index.html:2799`) shown *while* the password is still `1234`. A forgotten custom password requires manually editing the JSON data file. |
| **Used by** | The two prompts below feed every protected operation in the app |

**Two UI entry points, both checking the same single secret:**

1. `openPasswordModal({title,message,confirmText,danger,onOk,onCancel,reasonLabel,...})` — `index.html:2654`
   — replaces the main overlay (`#overlay`).
2. `empAskPass({title,message,confirmText,danger,onOk})` — `index.html:4593` — a secondary overlay (`.ovl2`)
   that keeps the parent window (Employees / Game Management) open.

---

## C. Current Deletion Protection

**Every protection is UI-only / renderer-only.** No check exists in `main.js`, `preload.js`, or any IPC
handler. All checks compare against the single `getPass()` value.

| Operation | Function | Prompt | Mechanism |
|---|---|---|---|
| Delete expense / gift | `deleteItem(which,id)` `index.html:2556` | `openPasswordModal` | `state.expenses/gifts.filter()` → `persist()`; also `removeEmployeeAdvance()` |
| Add expense (incl. employee advance) | `_addItem('exp')` `index.html:2492` | `openPasswordModal` | password required to *create* |
| Ticket return / deduction | `deductBatch` `:2411`, `deductOne` `:2447` | `openPasswordModal` | decrement counts + `logReview()` |
| Reset day (archive + wipe) | `requestRestart` / `doRestart` `:2580` / `:2589` | `openPasswordModal` | archives to `K_HIST`, clears `K_STATE` |
| Delete one archived day | `deleteHistDay(id)` `:2747` | `openPasswordModal` | `saveJSON(K_HIST, filtered)` |
| Delete ALL history | `clearAllHistory()` `:2763` | `openPasswordModal` | `saveJSON(K_HIST, [])` |
| Delete game (archive) | `gmDelete(id)` `:5861` | `empAskPass` | `g.archived=true` + `saveGames()` |
| Disable game | `gmToggle(id,false)` `:5839` | `empAskPass` | `g.active=false` |
| Delete employee | `empDelete(id)` `:5170` | `empAskPass` | remove from `K_EMP` (permanent) |
| Edit employee | `empDash` edit button `:4727` | `empAskPass` | gates `empGo('form')` |
| Delete bonus / penalty / advance / deduction | `empMoneySection` `:4860` | `empAskPass` | filter + `empSave()` (blocked if week `paid`) |
| Pay salary (one-way financial) | `empPayOne` `:5136`, `empPayAll` `:5154` | `empAskPass` | sets `w.paid=true` |
| Start new week | `empStartNewWeek()` `:5182` | `empAskPass` | `ensureWeeks()` |

**UNPROTECTED operations (no password, by design or omission):**
- Sales: `addTicket` `:2371`, `addBatch` `:2472`
- **Gift add** — explicitly no password (`index.html:2546-2548`)
- Game **add/edit** (`gmForm` `:5758`) and **restore** (`gmShowArchivedBuild` `:5746`)
- **Settings** (`openSettings` `:4156`) — printer, shift times, brand, QR all editable by anyone
- All report viewing / export / printing; all ticket & gift printing; gift reprint (`reprintGift` `:3939`)
- Attendance in/out (`drRecordIn` / `drRecordOut` `:5403` / `:5414`); daily deduction/bonus (`drSetAmount` `:5429` — only blocked if the week is paid)

**Returns log (`K_REVIEW`) is append-only** — there is no UI to delete review records; deletion affects
only filtered views.

---

## D. Current IPC / Main Security Boundaries

`preload.js` exposes 7 bridges: `malahyDB`, `malahyLog`, `malahyApp`, `malahyExport`, `malahyPrint`,
`malahyShell`, `malahyGate`.

**Strengths:** `contextIsolation:true`, `nodeIntegration:false`, `devTools:false`, F12 / Ctrl+Shift+I
blocked (`main.js:554-559`), `open-external` URL whitelisted to `https?|whatsapp` (`main.js:121`),
single-instance lock, mandatory update gate.

**Critical gap:** `db-set` / `db-delete` / `db-clear` (`main.js:83-91`) are **completely unauthenticated** —
any renderer code can read/write/delete *any* key with no authorization. Because **100% of the business
logic lives in the renderer** (`index.html`), every password check is bypassable by anyone able to execute
JavaScript in the page.

**Safe to protect at the Main/IPC layer:** `db-set` / `db-delete` for sensitive keys (`K_PASS`, `K_HIST`,
`K_EMP`, `K_GAMES`, `K_SETTINGS`, plus future user/permission keys), together with a new authenticated
command surface (login, password operations, permission queries).

---

## E. Current Database / Settings Architecture

**Storage:** a single JSON file `%APPDATA%\كوكي بارك\malahy-data.json` (+ automatic `.bak.json` backup +
corrupt-file recovery) managed by `database.js`. It is a flat key→JSON-value store; the renderer reaches
it through `loadJSON` / `saveJSON` (`index.html:1916` / `:1923`) → `window.malahyDB` → IPC `db-get` / `db-set`.

**Existing keys** (`index.html:1747-1871`, `:5371`): `malahy_pos_state_v1`, `malahy_pos_pass_v1`,
`malahy_pos_history_v1`, `malahy_pos_settings_v1`, `malahy_pos_seq_v1`, `malahy_gift_seq_v1`,
`malahy_pos_games_v1`, `malahy_pos_gameaudit_v1`, `malahy_pos_gamesnaps_v1`, `malahy_pos_txlog_v1`,
`malahy_employees_v1`, `malahy_review_log_v1`, `malahy_daily_reg_v1`, `malahy_activated`.

**Verdict — the existing architecture CAN safely support the new model with NO new storage system:**
- `loadJSON(key, fallback)` defaults missing keys gracefully → **additive keys are zero-risk**.
- `malahy_employees_v1` already proves an **array of per-user records with stable `id`s**
  (`empLoad` / `empSave` `:4453` / `:4454`) — the exact pattern needed for Cashiers.
- The `settings()` object (`:1966`) already merges new fields with defaults (`brandName`, shift times,
  QR, …) and is a proven, safe extension point.
- **Recommended locations:** a new key, e.g. `malahy_users_v1` =
  `{ admin:{username, passHash, recoveryWhatsapp, recoveryState}, cashiers:[{id, username, passHash, permissions, mustChangePass}] }`
  — consistent with `K_EMP`; the recovery WhatsApp number lives inside the admin record; session state
  can stay in-memory (renderer) with Main-side enforcement.

---

## F. Current Expense / Gift / Return Protection

**Expenses**
- Create: `_addItem('exp')` `:2492` → password → push to `state.expenses` → `persist()` (`K_STATE`);
  optionally `recordEmployeeAdvance()` (`:4536`)
- Edit: none (delete + re-add only)
- Delete: `deleteItem('exp',id)` `:2556` → password → `removeEmployeeAdvance` + filter + persist
- Path: `K_STATE` → `db-set` → `malahy-data.json`

**Gifts**
- Create: `_addItem('gift')` `:2491` → **NO password** → push with `seq` (`K_GSEQ`) + `at` → persist → auto-print
- Edit: none · Delete: `deleteItem('gift',id)` → password
- Gift ticket printing: `printGiftTicket` `:3916` → `giftTicketHTML` → IPC `print-ticket`;
  reprint via `reprintGift` `:3939` (no password)

**Returns**
- Create: `deductBatch` / `deductOne` → password → decrement counts + `txPricesPop` + `logReview` (`K_REVIEW`)
- Delete return record: **impossible** (append-only log)
- Reports: `reviewSection`, `reviewLogHTML`, `reviewReportBlock`, `dayReviewAppendHTML` are read-only;
  `printReviewLog` `:3229` prints the log

---

## G. Recommended User / Role Architecture

Two roles, matching the existing single-password mental model with minimal disruption:

- **Administrator** (exactly one): migrated from the current `K_PASS`. Holds `username` + `passwordHash` +
  `recoveryWhatsapp` + `recoveryState`. Full permissions, cannot be deleted. Can change own username/password
  and set/change the recovery number. The *person* using it may change over time.
- **Cashier** (0..N): `{id, username, passwordHash, permissions:{...}, mustChangePass, active}`. Changes own
  password only when the current one is known; cannot self-reset a forgotten password. Admin resets cashier passwords.
- **Session:** a lightweight in-renderer `currentUser` + permission cache, enforced at the point of each
  operation (see Section H). Given the renderer-only nature of the app, the *decision* should still be
  backed by Main for sensitive keys (Section D).

---

## H. Recommended Permission Architecture

Replace the single `getPass()` call inside the two prompts with a **permission check**, keeping the existing
modal UX untouched:

- **Permission registry** — one extensible map, e.g.
  `PERMS = {sales, ticketPrint, returns, expenseAdd, expenseDelete, giftAdd, giftDelete, reports,
  reportPrint, reportExport, gameManage, employeeManage, payroll, dayReset, historyDelete, settings, …}`.
  Admin implicitly has all; unknown / future IDs default-deny for cashiers.
- **One gate function** — e.g. `requirePerm(permId, {onOk, title, message})` wrapping the existing
  `openPasswordModal` / `empAskPass` bodies; call sites swap `openPasswordModal({...})` →
  `requirePerm('expenseDelete', {...})`.
- **Cashier authentication = their own password**; admin-only operations validate the admin password. This
  preserves the familiar "type password to confirm" UX users already know.
- **Extensibility:** adding a permission = add an ID to the registry + wire it at the call site; stored data
  stays forward/backward compatible (a missing permission key = default-deny).

---

## I. Administrator Recovery Architecture — Requirements

Current state: **no recovery exists at all.** A safe design requires:
1. Store `recoveryWhatsapp` inside the Admin record (users / settings key).
2. "Forgot Password" → generate a random temporary code → **transmit** it → user enters the code → verify →
   set a new password → invalidate the code.
3. Recovery state (`pendingCodeHash`, `expiresAt`, `attempts`) stored in the users key, **hashed**, cleared on
   success / expiry; single-use + short TTL + attempt limit.
4. **Critical constraint: the app has NO backend / server.** All logic is local; the only outbound capability
   is `shell.openExternal` (opens a URL; the user must press send). Recovery *transport* cannot be done
   securely inside the app alone.

---

## J. WhatsApp Integration Requirements

- **Existing integration: NONE.** Only hardcoded `wa.me/201100704812` deep links in `activation.js:152` and
  `windows/update.html:315`. **No HTTP client** (no axios / node-fetch; only electron-updater's internal net).
  **No WhatsApp API credentials anywhere in the project.**
- **Sending a message automatically requires the WhatsApp Business / Cloud API** → which requires a Meta
  developer account, a Phone Number ID, and a token. **These tokens must NOT be stored** in the renderer, in
  `malahy-data.json`, in `preload.js`, or in the repository. Given that no backend exists, an
  **external relay service is mandatory** — the desktop app would call a small HTTPS endpoint (via Electron
  `net`) that holds the token server-side and sends the code.
- **Offline / emergency alternative (recommended):** a locally-generated **recovery key printed / saved at
  setup time** (one-time reveal, stored hashed), plus a developer-assisted manual reset tied to the existing
  activation code. This keeps recovery working with zero connectivity and zero credentials inside the app.
- Per the Phase 3A brief: **WhatsApp must NOT be implemented in this phase.**

---

## K. Migration Risks (v2.5.1 → new system)

Risks are **low** because the store is purely additive:
- **Existing password preserved:** on first run, if `K_PASS` exists and ≠ `1234`, seed the Admin account with
  it; if default / absent, Admin gets `1234` and the existing `#passBanner` nudge keeps working.
- **Existing settings untouched:** the `settings()` default-merge pattern (`:1966-1997`) already handles new fields.
- **No DB rewrite:** a new `malahy_users_v1` key; `loadJSON(key, fallback)` handles missing keys.
- **Behavior preservation:** every listed deletion keeps requiring a password — only the *decision source*
  changes. Sales, printing, QR, shifts, reports, activation, and auto-update remain untouched.
- **Real risks to manage:** (1) any Main-side auth on `db-set` must not break existing `saveJSON` flows — gate
  *sensitive keys only*; (2) the update gate (`FLOOR_VERSION` in `update-gate.js`) must be bumped so the new
  build is enforced; (3) the password-change UX must stay reachable without breaking `K_PASS` readers during
  the transition.

---

## L. Exact Files / Functions That Would Need Modification Later

**`index.html`** (renderer — all logic):
- Password core: `getPass` `:2128`, `openPasswordModal` `:2654`, `empAskPass` `:4593`,
  `openChangePass` / `submitChangePass` `:2627` / `:2643`, `updatePassBanner` `:2799`,
  `#passBanner` HTML `:1570`, key constants `:1864-1871`
- Expenses / gifts: `_addItem` `:2492`, `deleteItem` `:2556`, `reprintGift` `:3939`
- Returns: `deductBatch` `:2411`, `deductOne` `:2447`
- Day / history: `requestRestart` / `doRestart` `:2580` / `:2589`, `deleteHistDay` `:2747`,
  `clearAllHistory` `:2763`
- Reports: `openReports` `:3079`, `exportReportPDF` `:3413`, `exportReportExcel` `:3423`,
  `printReviewLog` `:3229`, `printTodayReport` `:4043`, `printDayReportObj` `:4067`
- Games: `gmForm` `:5758`, `gmToggle` `:5839`, `gmDelete` `:5861`, restore `:5746`
- Employees / payroll: `empDash` buttons `:4701-4728`, `empDelete` `:5170`, `empPayOne` `:5136`,
  `empPayAll` `:5154`, `empStartNewWeek` `:5182`, `empMoneySection` `:4827`, `empForm` `:4756`
- Attendance: `openDailyReg` `:5479`, `drRecordIn` / `drRecordOut` `:5403` / `:5414`, `drSetAmount` `:5429`
- Settings: `openSettings` `:4156`, `settings()` `:1966`, `saveSettings` `:1999`
  (add Accounts / Permissions / Recovery cards)
- Boot: `:5900-5911` (session init) · Header buttons `:1673-1685` (visibility gating)

**`main.js`:** `db-set` `:83`, `db-delete` `:86`, `db-clear` `:89` (add authorization for sensitive keys);
new auth IPC handlers. **`preload.js`:** new auth bridge(s). **`update-gate.js`:** bump `FLOOR_VERSION`.
**`package.json`:** bump `version`.

**New files (later phase):** a users / auth module (e.g. `users.js` in Main + a renderer login screen).

---

## M. Protected Files / Systems — MUST NOT Be Modified

- **Ticket SVG / layout:** `assets/ticket/ticket-template.svg`, `assets/ticket/ticket-template.js`,
  `ticketTemplateSvg` `:3635`, `ticketArtCSS` `:3660`, `ticketArtScaleStyle` `:3686`,
  `ticketArtOverlays` `:3740`, `ticketOverlay` `:3724`, `textWidthVB` / `fitFontSize` `:3706` / `:3713`,
  `ticketCSS` `:3517`, `ticketHTML*` `:3783-3838`, `giftTicketHTML*` `:3867-3914`
- **QR:** `assets/vendor/qrcode.js`, `ticketQrSvg` `:3446`, `ticketQrEnabled` `:3462`, `isValidMapUrl` `:3443`
- **Printer architecture:** `main.js` `get-printers` `:186`, `print-ticket` `:215`,
  `installedPrinterNames` `:204`; `paperKind` `:3502`, `brandLogoPrint` `:3470`
- **Shifts:** `shiftTimes` / `shiftOfDate` / `shiftLabel` `:2832-2868`, `businessDayKey*` `:2923-2983`,
  `validateShiftTimes` `:2903`
- **Sales calculations & pricing:** `totals` `:2173`, `txPrices*` `:2194-2231`, `gameSalesTotals` `:2233`,
  `gameBreakdown` `:2259`, `addTicket` / `addBatch`, game price snapshot / audit `:1804-1848`
- **Employee / payroll logic:** `empMigrate` `:4457`, `calcWeek` `:4563`, `weekStats` `:4574`,
  `recordEmployeeAdvance` / `removeEmployeeAdvance` `:4536` / `:4550`, week helpers `:4480-4491`
- **Branding:** `brandName` / `brandLogo` / `applyBranding` `:2047-2098`, `DEFAULT_*` constants
- **Activation:** `activation.js` (entire file) · **Auto-update:** `update-gate.js` logic, gate IPC + `initUpdater`
  in `main.js:285-514`, `initUpdateUI` `:5888`
- **Storage engine:** `database.js` (entire file) · **Existing DB records:** all `K_*` data
- **Reports data layer:** `buildReportData` `:2996`, `aggregate` `:3022`, `reportRows` `:3239`,
  `reportHTML` `:3356`, `salaryReportHTML` `:5226`, `statementHTML` `:5285` (only *access gating*, never recalculation)

---

## N. Recommended Phase 3B Plan

1. **Users module in Main** (`users.js`): Admin + Cashiers, salted-hashed passwords (Node `crypto.scrypt`),
   permission registry, recovery state; persisted under `malahy_users_v1`. Expose typed IPC
   (`auth:login`, `auth:changePass`, `auth:resetCashier`, `auth:hasPerm`).
2. **Authorize sensitive IPC:** gate `db-set` / `db-delete` for sensitive keys (`K_PASS`, `K_HIST`, `K_EMP`,
   `K_GAMES`, `K_SETTINGS`, `K_USERS`) behind a session / permission check in `main.js`; keep all other writes untouched.
3. **Renderer gate function** `requirePerm(permId, {onOk,…})` and replace the ~20 `openPasswordModal` /
   `empAskPass` call sites listed in Section L (behavior identical, decision source changes).
4. **Login screen** on boot (after activation) establishing an in-memory session; Admin sees all buttons,
   Cashiers see only permitted ones (hide, not just disable).
5. **Settings additions:** an Admin Account card (username, password, recovery WhatsApp) + a Cashier Management
   card (add / list / reset password / toggle permissions) inside the existing `openSettings` modal.
6. **Recovery (analysis-first):** a local recovery-key flow as the offline fallback; WhatsApp deferred until an
   external relay exists — credentials never in the app or the repo.
7. **Migration & release:** seed Admin from `K_PASS` on first run, bump `version` + `FLOOR_VERSION`, then verify
   every item in Section M is byte-identical before build.

---

## Audit Scope & Integrity Statement

- The audit was **READ-ONLY**. **No application files were modified** during the audit.
- **No build, publish, or commit was performed**, and the **application version was not changed**.
- All findings above were obtained by directly inspecting the project source files
  (`main.js`, `preload.js`, `database.js`, `activation.js`, `update-gate.js`, `launch.js`, `index.html`,
  `windows/`, `assets/`, `README.md`, `package.json`).
- No findings were invented and no conclusion of the audit has been altered in this archive.

**Audit complete — Phase 3B not started.**
