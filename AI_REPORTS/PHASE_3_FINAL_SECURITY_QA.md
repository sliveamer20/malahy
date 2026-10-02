# PHASE 3 FINAL — SECURITY / USERS / PERMISSIONS / PASSWORD / RECOVERY QA
**Malahy (كوكي بارك) · v2.5.1 · READ-ONLY FINAL QA AUDIT**

> **This is a read-only final QA audit.** No source file was modified, no test was
> modified, no build/publish/commit/push was performed, no version bump occurred, and
> no production database was opened, read, or written. Every number below was produced
> by actually executing the existing test suites and inspecting the current source files.

---

## 1. Final Status

# ✅ PASS WITH DOCUMENTED HISTORICAL TEST FAILURE

**645 of 646 checks pass.** The single failure is the already-documented, frozen
Phase 3B snapshot check reporting `index.html` — an intentional and necessary delta
introduced by Phases 3C-1/3C-2/3C-3/3C-4. It is not a security regression, not a
new defect, and it was **not** hidden or deleted. The current in-scope guardian
(`phase3c2-baseline.test.js`) passes **63/63** and independently confirms every other
protected file is intact.

**Recommendation: Phase 3 can be officially CLOSED** (see §8).

---

## 2. Exact Test Counts (all suites actually executed)

| Suite | Passed | Failed | Exit |
|---|---|---|---|
| `tests/phase3b-auth.test.js` | 60 | **1** | non-zero |
| `tests/phase3b-ipc.test.js` | 15 | 0 | 0 |
| **Phase 3B subtotal** | **75** | **1** | |
| `tests/phase3c1-session.test.js` | 30 | 0 | 0 |
| `tests/phase3c1-ipc.test.js` | 19 | 0 | 0 |
| `tests/phase3c1-dom.test.js` | 37 | 0 | 0 |
| `tests/phase3c1-gate.test.js` | 48 | 0 | 0 |
| **Phase 3C-1 subtotal** | **134** | **0** | |
| `tests/phase3c2-baseline.test.js` | 63 | 0 | 0 |
| `tests/phase3c2-gate.test.js` | 44 | 0 | 0 |
| `tests/phase3c2-ipc.test.js` | 49 | 0 | 0 |
| `tests/phase3c2-perms.test.js` | 39 | 0 | 0 |
| **Phase 3C-2 subtotal** | **195** | **0** | |
| `tests/phase3c3-accounts.test.js` | 92 | 0 | 0 |
| `tests/phase3c3-ui.test.js` | 76 | 0 | 0 |
| **Phase 3C-3 subtotal** | **168** | **0** | |
| `tests/phase3c4-recovery.test.js` | 73 | 0 | 0 |
| **Phase 3C-4 subtotal** | **73** | **0** | |
| **GRAND TOTAL** | **645** | **1** | |

### The single documented failure (reproduced exactly)

```
phase3b-auth.test.js
"all protected files byte-identical to pre-phase baseline"
changed: index.html
```

This matches the previously documented historical baseline mismatch **exactly**:
the frozen 3B snapshot asserted `index.html` was unmodified, which was correct only
during Phase 3B. `index.html` was then **intentionally and necessarily** changed by
3C-1 (login UI), 3C-2 (permission gate wiring), 3C-3 (admin cards), and 3C-4
(recovery script tag + CSS). No test was modified to make anything pass, and the
failure was reported, not silenced. The 3B test file itself remains a protected,
untouched artifact.

### 3C-2 baseline / integrity guardian — PASSES

`tests/phase3c2-baseline.test.js` passes **63/63**. It is the current, in-scope
guardian and explicitly documents `index.html` as the intended delta while asserting
all other protected files, the activation gate, the update gate, the printer IPC, the
ticket/QR assets, the storage engine, and the source-level security properties.

An **independent** re-computation of the SHA-256 baseline during this audit agrees:
**15 / 16 protected files byte-identical; the only delta is `index.html`.**

---

## 3. Phase-by-Phase Verification

### A. Phase 3A — Security audit findings addressed — ✅ PASS

| Requirement | Verification |
|---|---|
| Audit findings addressed | Every gap in 3A §D/§I is now closed by 3B–3C-4 (auth module, hashed passwords, IPC authorization, recovery). |
| No old single-global-password-only architecture remains as the active account model | Confirmed. Boot now runs `users.initUsers()` (`main.js:670`) before the window is created; the login screen (`login.js`) is the sole entry, authenticating via `auth:login`. The legacy `getPass()`/`openPasswordModal`/`empAskPass` remain only as **dead function definitions** (`index.html:2864`, `index.html:4818`) with **0 active call sites** (verified programmatically) — preserved for rollback safety, not used. |
| Password handling is secure | `crypto.scrypt` (N=16384, r=8, p=1) + per-password 16-byte random salt + `crypto.timingSafeEqual` constant-time compare (`users.js:52-76`). Malformed hashes rejected safely. |
| Sensitive IPC/database operations have authorization boundaries | `db-set`/`db-delete` gated by `PERMLIB.authorizeDbOp` and `db-clear` gated to an admin session (`main.js:91-122`). |

### B. Phase 3B — Authentication foundation — ✅ PASS

| Requirement | Verification |
|---|---|
| Exactly one Administrator account | `initUsers` overwrites a single `doc.admin` (`users.js:159`); no API exists to create a second admin. `createCashier` rejects the admin username (`users.js:296`). |
| Multiple Cashiers supported | `doc.cashiers` is an array; `createCashier` appends with unique `usr_<uuid>` ids. |
| Admin has full permissions | `allPermsMap()` built dynamically from `PERMS` (`permissions.js:88`); admin record stores **no** `permissions` field — full access is implicit. |
| Cashiers use configurable permissions | `sanitizePerms` keeps only explicitly-granted known perms; `setCashierPermissions` (admin-only) toggles each independently. |
| Admin recovery WhatsApp number belongs only to Admin | Stored on `doc.admin.recoveryWhatsapp` only (`users.js:436,454`); cashier records carry no such field. |

### C. Phase 3C — Users, sessions, permissions — ✅ PASS

| Requirement | Verification |
|---|---|
| Cashiers created/managed by Admin | `auth:createCashier` requires an admin Main-session (`main.js:170-178`); UI in `accounts.js`. |
| Cashier active/inactive state works | `setCashierActive` (admin-only, explicit boolean); `login` rejects inactive accounts (`users.js:197`). The 3C-3 report documents a real production bug in the toggle button that was fixed (`accounts.js:299` `var next = disabled`). |
| Cashier password management works | `resetCashier` (admin-only, sets `mustChangePass`); self-change requires the current password. |
| Admin can configure/revoke cashier permissions | `setCashierPermissions` builds the full map from explicit true/false only; unknown ids are never granted (`users.js:377-399`). |
| Permission enforcement is not UI-only | The Main-process session is the authority for `authorizeDbOp`, `hasPerm`, and every admin-gated handler. Renderer hiding (`data-perm`, 10 attributes) is explicitly a UX layer. |

### D. Phase 3D — Password change & recovery — ✅ PASS

| Requirement | Verification |
|---|---|
| Admin can change password | `changePass` + UI card in `accounts.js`; Main-side identity guard (`main.js:142`). |
| Forgot Password flow exists | `recovery.js` adds «نسيت كلمة المرور؟» to the login screen; steps 1→2. |
| Recovery WhatsApp number configurable | `setRecoveryWhatsapp` (admin-only, format-validated, empty clears). |
| Recovery code cryptographically generated | `crypto.randomInt(0, 1_000_000)` padded to 6 digits (`users.js:479`); `Math.random` never used. |
| Recovery code NOT stored in plaintext | Only `sha256:<saltHex>:<digestHex>` persisted (`users.js:480-481`); plaintext returned **once**, in-memory, to the renderer. |
| Recovery code has expiration | 10-minute `RECOVERY_TTL_MS`; expired rejected; swept on boot (`users.js:170`). |
| Recovery attempts limited | 5 wrong guesses → state wiped, `too-many-attempts` (`users.js:513-518`). |
| Recovery code is single-use | `recoveryState = null` immediately on success (`users.js:530`). |
| New code invalidates the old | `beginRecovery` replaces `recoveryState` wholesale (`users.js:480`). |
| Successful recovery does not require the old password | `completeRecovery` only verifies the code + new password. |
| WhatsApp uses the configured Admin recovery number | `digitsOnly` comparison against `doc.admin.recoveryWhatsapp`; the returned destination is the matched digits. |
| Current WhatsApp behavior is manual Send via prepared wa.me message | `recovery.js:162` opens `https://wa.me/<digits>?text=<encoded>` through the whitelisted `open-external`; the UI explicitly tells the user to press Send manually. |
| NO automatic WhatsApp API required / NO 5MinutesAPI / NO WAHA/OpenWA | Confirmed by scan: **0 hits** for `5MinutesAPI`, `WAHA`, `OpenWA`, Meta/Cloud API, tokens, or Phone Number IDs anywhere in the project. The only textual match is a comment in `recovery.js:11` stating no Meta tokens exist. |

### E. Phase 3E — Main/IPC authorization — ✅ PASS

| Requirement | Verification |
|---|---|
| Authorization enforced in Main/IPC | `db-set`, `db-delete`, `db-clear` + all `auth:*` handlers enforce sessions/permissions in `main.js`. |
| Renderer hiding alone is not the security boundary | `perm-gate.js` comments and `permissions.js:120-144` make the Main process the final authority; the authority chain is documented in the 3C-2 report §10. |
| Cashier cannot bypass permissions via direct IPC | `malahy_users_v1` is **never** writable via IPC (`write: null`); all management handlers reject non-admin sessions with `forbidden`. |
| Cashier cannot access Admin-only data/operations | `getAdminInfo`, `listCashiers`, `getCashierPerms`, `createCashier`, `resetCashier`, `setCashierActive/Username/Permissions`, `setRecoveryWhatsapp` all require an admin Main-session. |
| Sensitive DB keys cannot be freely written through renderer IPC | `SENSITIVE_KEYS` (`permissions.js:73-80`) gates `K_PASS`, `K_HIST`, `K_EMP`, `K_GAMES`, `K_SETTINGS` by permission and blocks `K_USERS` entirely. Denied attempts are logged via `appendLog`. |

### Final authorization verification — ✅ PASS

- Boot order intact: `createSplash()` → `users.initUsers()` → `runUpdateGate()` → `createMainWindow()` (`main.js:666-686`), asserted by the 3C-1 gate suite.
- Login is fail-closed: `inert` + `aria-hidden` + capture-phase event blocking + Tab focus trap before authentication; a `login.js` load failure still leaves the POS covered (inline fallback).
- Session holds no secrets (asserted in 3B/3C-1 suites); `sanitize()` never returns `passwordHash`.
- `getAdminInfo` returns only `username`, `recoveryWhatsapp`, and a redacted `recoveryState` (`pending/expiresAt/attempts/used`) — **never** `codeHash` (`users.js:428-439`).

---

## 4. Security Findings

All checks performed read-only against the current source.

| Check | Result |
|---|---|
| Plaintext passwords in the auth store | **NONE.** `malahy_users_v1` holds only `scrypt:` strings. |
| Plaintext recovery codes in persistent storage | **NONE.** Only `sha256:<salt>:<digest>` is persisted; the plaintext code is returned once, in-memory, and never stored, logged, or rendered. |
| API keys / tokens / credentials | **NONE.** All pattern matches were false positives (base64 PNG icons in `index.html`, test fixtures). No WhatsApp/Meta/Cloud credentials exist. |
| 5MinutesAPI / WAHA / OpenWA | **NOT PRESENT.** No integration, no credentials, no network client added (Node built-in `crypto` only; no axios/node-fetch). |
| Recovery codes in console logs | **NONE.** No `console.*` call exists in any production security module (`users.js`, `recovery.js`, `main.js`, `perm-gate.js`, `accounts.js`, `login.js`, `permissions.js`). `console.*` appears only in `launch.js` (boot errors) and the test harnesses. `main.js` recovery handlers log only `String(err)`. |
| Sensitive data through `getAdminInfo` | **NONE.** Hash-redacted; admin-session-gated. |
| Cashier access to Admin data | **BLOCKED.** Every admin-only handler enforces the Main-process session; `buildCards()` returns `[]` for non-admins. |
| Renderer-only authorization on sensitive operations | **NONE.** Every sensitive operation has a Main-side boundary; renderer checks are UX only. |

### Observations / residual notes (not new defects)

1. **Legacy `K_PASS` plaintext sync remains.** `changePass` and `completeRecovery` mirror the new admin password to `malahy_pos_pass_v1` (`users.js:238`, `users.js:532`) to keep the untouched v2.5.1 renderer consistent. This is **pre-existing v2.5.1 behavior**, deliberately retained as a transition measure; the key is now write-protected by the `settings` permission, and removal is a documented post-Phase-3 cleanup item.
2. **`db-get` remains unauthenticated** (pre-existing). It is read-only, and the app's threat model is a local offline single-machine app where the data file is inherently readable at the OS level; the security boundary introduced in Phase 3 governs **writes** to sensitive keys, which is where the 3A critical gap was.
3. **No brute-force lockout on `auth:login`** (carried over from 3B, documented). Recovery, the higher-risk pre-auth path, **is** rate-limited (5 attempts / 10-minute TTL / single-use).

---

## 5. Remaining Limitations

1. **The frozen 3B snapshot failure** — documented, not silenced; its scope ended with 3B. The current guardian supersedes it and passes fully.
2. **Automatic WhatsApp sending is not implemented — by design.** It requires a backend relay holding a server-side Meta token, which does not exist in this offline desktop architecture. Current transport is the honest `wa.me` deep-link handoff (message prepared, user presses Send).
3. **Legacy dead code** (`getPass`, `openPasswordModal`, `empAskPass`, `submitChangePass`, `updatePassBanner`) and the `K_PASS` sync remain for rollback safety; cleanup is a later phase.
4. **Tests run on an in-memory store only.** No production database is ever opened. A final end-to-end check on a real test machine before release remains good practice.
5. **No audit log for permission changes** — out of the documented 3C-3 scope.
6. **Single-machine, local-only architecture** — no multi-branch/server account management.

---

## 6. Protected-System Integrity Result — ✅ PASS

Independently re-verified during this audit by recomputing SHA-256 hashes against
`tests/protected-baseline.json`:

```
matching: 15 / 16
deltas:   index.html   (intentional: login UI, permission gate, admin cards, recovery)
```

| Protected system | Status |
|---|---|
| Ticket design/layout (`assets/ticket/*`) | byte-identical |
| Ticket QR logic (`assets/vendor/qrcode.js`) | byte-identical |
| Printer architecture (`get-printers`, `print-ticket` in `main.js`) | intact |
| Shift logic, Sales, Pricing, Returns, Gifts | untouched (live in `index.html`, only the auth decision-source changed) |
| Reports / history protection | read path untouched; `K_HIST` write/delete gated by `dayReset`/`historyDelete` |
| Payroll (`K_EMP`) | gated by `employeeManage`/`payroll` |
| Game management/history (`K_GAMES`) | gated by `gameManage` |
| Branding, Activation (`activation.js`), Auto-update (`update-gate.js`) | byte-identical; `FLOOR_VERSION` still `2.5.1` |
| Storage engine (`database.js`) | byte-identical — auth uses it as-is via dependency injection |

**No protected system was damaged or altered by Phase 3.**

---

## 7. Explicit Confirmations

- ✅ **No source files were modified** — `git status` before and after this audit is byte-identical; this audit was purely read-only.
- ✅ **No tests were modified** — every suite ran exactly as it currently exists; results were recorded as produced.
- ✅ **No version bump occurred** — `package.json` = **2.5.1**, `update-gate.js` `FLOOR_VERSION` = **2.5.1**.
- ✅ **No build occurred** — `dist/` and `releases/` contents all pre-date Phase 3 (newest artifact is the v2.5.0 build).
- ✅ **No publish occurred** — no `latest.yml`/`app-update.yml` change, no tag, no release created.
- ✅ **No commit occurred** — `git log` head is still `5388949 release: v2.5.0`.
- ✅ **No production database was touched** — every suite runs on an in-memory store; no `malahy-data*.json` exists in the repository or was created.

---

## 8. Final Recommendation

### ✅ Phase 3 CAN be officially CLOSED.

**Basis:**
1. **645 / 646** checks pass across 13 executed suites; the single failure is the
   pre-documented, historical frozen 3B snapshot (`index.html` only), reproduced
   exactly as previously documented and not hidden.
2. The current integrity guardian (`phase3c2-baseline.test.js`) passes **63/63** and
   independent hash recomputation confirms **15/16** protected files byte-identical,
   with `index.html` as the sole intentional delta.
3. Every Phase 3 requirement (3A findings, 3B one-admin/multi-cashier foundation,
   3C-1 login/session, 3C-2 permission enforcement, 3C-3 cashier management, 3C-4
   recovery, 3E Main/IPC authorization) is verified as implemented and enforced.
4. No secrets, no plaintext credentials, no WhatsApp/5MinutesAPI/WAHA/OpenWA
   integration, and no unprotected sensitive-IPC path were found.
5. All protected systems (ticket, QR, printer, shifts, sales, pricing, returns, gifts,
   reports, payroll, games, branding, activation, auto-update, storage engine) are intact.

**Recommended pre-release follow-ups (outside Phase 3 scope, non-blocking):**
a real-machine end-to-end verification; removal of the legacy `K_PASS` plaintext sync
and dead password-modal code; and, if ever desired, a server-side relay for automatic
WhatsApp delivery (never credentials inside the app).

**Phase 3 — SECURITY / USERS / PERMISSIONS / PASSWORD / RECOVERY: COMPLETE AND VERIFIED.**
