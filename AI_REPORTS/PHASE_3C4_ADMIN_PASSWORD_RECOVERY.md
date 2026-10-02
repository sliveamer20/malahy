# PHASE 3C-4 — ADMINISTRATOR PASSWORD RECOVERY
**Malahy (كوكي بارك) · v2.5.1 · implementation + tests complete**

> **Status:** Complete and verified. **73/73** Phase 3C-4 tests pass. All regression suites pass
> (3C-1: 134/134 · 3C-2: 195/195 · 3C-3: 168/168 · 3B: 75/76 with the one pre-documented snapshot failure).
> **Version unchanged (2.5.1).** No build, no publish, no commit. **No production database touched.**

---

## 1. Files Modified

| File | What changed | Scope |
|---|---|---|
| `users.js` | Recovery core: `RECOVERY_*` constants, `randomRecoveryCode()` (crypto.randomInt), `hashRecoveryCode()`/`verifyRecoveryCode()` (sha256 + per-code salt + timingSafeEqual), `digitsOnly()`, `beginRecovery()`, `completeRecovery()`, `sanitizeRecoveryState()`; `getAdminInfo()` redacts the code hash; `initUsers()` sweeps expired recovery state on boot; new functions+constants exported. | Additive, ~140 lines |
| `main.js` | Two IPC handlers: `auth:beginRecovery`, `auth:completeRecovery`. Intentionally pre-auth (recovery exists *because* there is no session). Logs only error context — never a code. | Additive, ~18 lines |
| `preload.js` | `malahyAuth.beginRecovery(whatsapp)` and `malahyAuth.completeRecovery(code, newPass, confirm)` on the existing secure bridge. | Additive, 6 lines |
| `recovery.js` | **New** — renderer recovery flow inside the existing login screen (steps 1→2), builds the prepared WhatsApp message and hands it to the existing `openExternal` mechanism. Never logs/displays the code. | New, ~330 lines |
| `index.html` | `<script src="recovery.js" defer>` after `accounts.js`; one small CSS block (`.rec-*`) reusing existing login-overlay styles. | Additive, ~35 lines |
| `accounts.js` | Admin settings card: recovery-status text updated from "recovery not enabled in this version" to describe the now-active recovery path. | 1 line (text only) |
| `tests/phase3c4-recovery.test.js` | **New** — 73 focused tests (source security, Main core, UI + WhatsApp interception, regression, no-secret-in-logs). | New, ~540 lines |

**Files intentionally untouched:** `permissions.js`, `perm-gate.js`, `database.js`, `activation.js`,
`update-gate.js`, `launch.js`, `login.js` (only read — the recovery UI attaches to its overlay without
modifying it), `electron-builder.yml`, `README.md`, `package.json`, all `assets/`, all `windows/`.
The ticket SVG/layout, ticket QR logic, printer architecture, shift logic, sales/pricing/returns/gift
logic, reports/payroll/game history calculations, branding, activation, auto-update, and the storage
engine are **byte-identical** to the protected baseline (verified programmatically — see §9).

---

## 2. Administrator Recovery Architecture

Confirmed by read-only inspection before any edit (Phase 3A report + direct source reading):
exactly **one** Administrator account (`doc.admin`), **zero or more** Cashiers, Admin has full
permissions implicitly, Admin resets cashier passwords (`resetCashier`), and the recovery WhatsApp
number belongs to the **single Admin record** only.

Recovery reuses the existing users/auth storage architecture — **no new database or storage system**:

```
malahy_users_v1 (existing additive key)
└── admin
    ├── id, username, passwordHash   (unchanged since 3B)
    ├── recoveryWhatsapp             (settable since 3C-3 — now used)
    └── recoveryState               (NEW in 3C-4, null when idle)
        ├── codeHash   sha256:<saltHex>:<digestHex>   ← only the hash is stored
        ├── createdAt, expiresAt
        ├── attempts   (0..5)
        └── used       (bool)
```

All recovery data lives inside the existing single additive key. `loadJSON(key, fallback)`-style
defaulting means the field is zero-risk for older data files (absent ⇒ `null` ⇒ recovery simply
requires a number to be configured first).

---

## 3. Recovery-Code Lifecycle

1. **Generation** — `crypto.randomInt(0, 1_000_000)` zero-padded to 6 digits. Cryptographically
   secure; `Math.random()` is never used (source-verified). 6 numeric digits = the global OTP
   standard — short enough to type in manually, and protected by the controls below.
2. **Hashing** — `sha256(salt ‖ code)` with a fresh 16-byte salt per code, verified with
   `crypto.timingSafeEqual`. Only `"sha256:<salt>:<digest>"` is persisted. **The plaintext code is
   never written to the store** (test 5b asserts the store JSON contains no code).
3. **One-time return** — `beginRecovery` returns the plaintext **once**, in-memory, to the renderer
   so it can be placed into the prepared WhatsApp message. It is never stored, never logged, and
   never rendered in the UI.
4. **Expiry** — TTL 10 minutes (`RECOVERY_TTL_MS`). Expired codes are rejected; `initUsers` also
   clears an expired state on boot.
5. **Attempt limit** — 5 wrong guesses (`RECOVERY_MAX_ATTEMPTS`). Each wrong code increments
   `attempts`; on the 5th the state is wiped and a new code must be requested.
6. **Single-use** — on success `recoveryState` is set to `null` immediately, so the same code can
   never be replayed (test 12).
7. **New code invalidates the old** — `beginRecovery` overwrites `recoveryState` wholesale, so any
   previously issued code stops verifying (test 13a).
8. **Not consumed by password errors** — a valid code survives a weak/mismatched new password
   (only wrong *codes* burn an attempt).

---

## 4. Recovery Flow (end to end)

1. On the login screen the user picks **«نسيت كلمة المرور؟»** (added by `recovery.js` inside the
   existing `#loginForm`).
2. The app explains recovery requires the configured recovery WhatsApp number.
3. The user enters/confirms the number; `beginRecovery` digit-normalizes it (`+`, spaces, dashes
   ignored) and compares against the Admin's stored `recoveryWhatsapp`.
4. **Mismatch / not configured ⇒ one generic error** (`invalid-recovery-number`) — the app does not
   leak whether a number is configured at all, nor whether a recovery is pending.
5. On match: generate a code, persist **only the hash + expiry + attempts=0 + used=false**.
6. WhatsApp handoff (see §5).
7. The user enters the code + a new password + confirmation.
8. `completeRecovery` verifies: hash matches · not expired · within the attempt limit · not used.
9. On success it replaces the Admin `passwordHash` (crypto.scrypt, same as every password), syncs
   `K_PASS` for the v2.5.1 renderer (identical behavior to `changePass`), and invalidates the code.
   **The old Admin password is never required** (explicitly tested).
10. The UI returns to the normal login form with all recovery fields cleared.

---

## 5. WhatsApp Transport — Honest Handoff, No Faked Integration

The Phase 3A audit established that this desktop app has **no WhatsApp Business API integration and
no backend server**. Phase 3C-4 does **not** invent one:

- **No API credentials of any kind** exist in the renderer, `preload.js`, `index.html`, storage, or
  the repository. Verified by a secret-pattern scan (0 hits for API keys/tokens/Business API patterns).
- `recovery.js` uses the **existing approved external-link mechanism** (`window.malahyShell.openExternal`
  → `ipcMain open-external`, already whitelisted to `https?|whatsapp` in `main.js`).
- It builds `https://wa.me/<digits>?text=<encoded message>` containing the code, opens it, and
  **tells the user explicitly** that WhatsApp opened with a prepared message and that **sending
  requires pressing Send manually** — nothing is sent automatically.
- If `openExternal` is unavailable, the app stays on step 1 with a clear error (no code is displayed;
  retrying issues a fresh code, which invalidates the undelivered one).

**Limitation (documented, not faked):** automatic WhatsApp delivery requires the Cloud/Business API
plus a server-side relay holding a Meta token. That does not exist in this architecture and is out of
scope for 3C-4; no attempt was made to fake it. The current mechanism delivers the code to the exact
configured number with the message pre-filled, which is the safest transport the present
architecture genuinely supports. Any future automatic integration is deferred to a later phase.

---

## 6. Security Model

| Property | Enforcement |
|---|---|
| No plaintext codes | Only `sha256:salt:digest` persisted; plaintext returned once, in-memory, to the renderer only |
| No plaintext passwords | Unchanged since 3B — `crypto.scrypt` + per-password salt |
| Rate limiting | 5 attempts per code, then state wipe + forced re-issue |
| Expiry | 10-minute TTL; rejected on use; swept on boot |
| Single-use | `recoveryState = null` immediately after a successful reset |
| Old code invalidation | Wholesale state replacement on each `beginRecovery` |
| No state leakage | One generic error for a wrong/unconfigured number; `invalid-code` covers missing/used/expired/wrong; `getAdminInfo` never returns `codeHash` (only `pending/expiresAt/attempts/used`) |
| No secret logging | `main.js` handlers log only `String(err)`; `recovery.js`/`users.js` contain no `console.*`; nothing sensitive reaches `malahyLog` |
| Minimal IPC surface | Two handlers; they never accept or return hashes, salts, or DB keys |
| Authorization boundary intact | `malahy_users_v1` remains non-writable via renderer IPC (`write: null`); recovery writes happen in Main only, exactly like `changePass` |
| Pre-auth by design | `beginRecovery`/`completeRecovery` need no session — the whole point of recovery. Authority is knowledge of the code, which only reaches the configured WhatsApp number |

Phase 3C-1/3C-2/3C-3 security boundaries are **not weakened** — `authorizeDbOp`, the permission
registry, session handling, and cashier restrictions are untouched.

---

## 7. Admin Settings (Recovery Number)

The existing Settings UI already contains the Admin Account card (from 3C-3): the single Admin can
view/update the recovery WhatsApp number, save it, and sees format validation (`invalid-number` for
malformed input, empty string clears it). Phase 3C-4 only updated its status copy text to describe
the now-active recovery path. **No second Admin account can be created**, no new settings/database
architecture was introduced, and the number stays on the single Administrator record (cashier records
carry no `recoveryWhatsapp` field — asserted in tests).

---

## 8. Tests Executed — Exact Results

### Phase 3C-4 (new) — `tests/phase3c4-recovery.test.js`: **73 passed, 0 failed**

Coverage of the required checklist: 1 recovery number saved · 2 persists across restart · 3 invalid
number rejected · 4 secure generation (6 digits, random, no `Math.random`) · 5 only the hash
persisted · 6 expiry · 7 expired rejected · 8 wrong code increments attempts · 9 lock after too many
attempts · 10 correct code allows reset (old password not required) · 11 success invalidates the code
· 12 no reuse · 13 new code invalidates the old · 14 cashier accounts untouched · 15 cashier
permissions untouched · 16 sales/history/reports/games/printers/shifts/branding/tickets untouched ·
17 no secret in logs · plus: number-mismatch non-disclosure, digit-normalized matching,
weak/mismatched password not consuming the code, `getAdminInfo` hash redaction, cashier cannot read
admin info, boot-time expired-state sweep, and the full WhatsApp interception suite
(correct destination digits, code present in the prepared message, code never rendered in the UI,
no real send, handoff verifies against the stored hash).

### Regression — full existing suite, run unchanged

| File | Result |
|---|---|
| `tests/phase3c3-accounts.test.js` | **92 passed, 0 failed** |
| `tests/phase3c3-ui.test.js` | **76 passed, 0 failed** |
| `tests/phase3c1-dom.test.js` | 37 passed, 0 failed |
| `tests/phase3c1-gate.test.js` | 48 passed, 0 failed |
| `tests/phase3c1-ipc.test.js` | 19 passed, 0 failed |
| `tests/phase3c1-session.test.js` | 30 passed, 0 failed |
| **3C-1 subtotal** | **134 / 134** |
| `tests/phase3c2-baseline.test.js` | 63 passed, 0 failed |
| `tests/phase3c2-gate.test.js` | 44 passed, 0 failed |
| `tests/phase3c2-ipc.test.js` | 49 passed, 0 failed |
| `tests/phase3c2-perms.test.js` | 39 passed, 0 failed |
| **3C-2 subtotal** | **195 / 195** |
| `tests/phase3b-ipc.test.js` | 15 passed, 0 failed |
| `tests/phase3b-auth.test.js` | **60 passed, 1 failed** (see note) |
| **3C-3 subtotal** | **168 / 168** |
| **3C-4** | **73 / 73** |
| **GRAND TOTAL** | **645 passed, 1 failed** |

**The one failure** — `phase3b-auth.test.js` :: *"all protected files byte-identical to pre-phase
baseline :: changed: index.html"*. This is the **pre-existing, documented** frozen 3B snapshot
(Phase 3C-3 report §10): `index.html` has been intentionally and necessarily modified in 3C-1
(login UI), 3C-2 (permission enforcement), 3C-3 (admin cards), and now 3C-4 (the recovery script tag
+ CSS). It was **not** modified to make this test pass, and it was **not** caused by Phase 3C-4 — it
is identical before and after this phase. The current guardian, `phase3c2-baseline.test.js`, passes
63/63 and confirms every other protected file is intact (independently re-verified below).

### Independent integrity verification
- All protected baseline files (ticket SVG/JS, QR vendor lib, printer IPC path, activation, update
  gate, storage engine, splash/update windows, assets) — **byte-identical**, only `index.html`
  differs (intentional).
- `package.json` version = **2.5.1** · `FLOOR_VERSION` = **2.5.1** (unchanged).
- No production database was opened — every test runs on an **in-memory store**; no `malahy-data.json`
  exists in the repository.
- No build, packaging, installer creation, publish, commit, or push was performed.
- Secret-pattern scan across all new/modified files: **0 hits**.

---

## 9. Remaining Limitations & Notes

1. **Automatic WhatsApp sending is not implemented** — by design. It requires a backend relay with a
   server-side Meta token. The 3C-4 transport is the honest `wa.me` deep-link handoff: message
   prepared, WhatsApp opened, user presses Send. See §5.
2. **The single test timing fix** was a genuine race in the test, not the implementation: the success
   path runs `crypto.scrypt` (N=16384), which is *deliberately* slow (~35 ms+) and exceeded the fixed
   30 ms wait. The test now polls deterministically for Main-side completion (`waitFor`) — **no
   assertion was removed or weakened**, and all security checks remain identical.
3. **Recovery codes are 6 digits** — standard OTP strength, intentionally short for manual entry,
   compensated by the 10-minute TTL, 5-attempt lockout, single-use rule, and per-code salted hashing.
4. **Tests cover in-memory storage only.** A final end-to-end check on a real test machine before
   release remains good practice, consistent with the 3C-3 report's note.
5. **Pre-existing failure** in the frozen 3B snapshot is documented, not silenced (§8).

---

## 10. Version / Build Rule Compliance

- ❌ no version bump · ❌ no `package.json` edit · ❌ no `FLOOR_VERSION` edit (both stay **2.5.1**)
- ❌ no build · ❌ no packaging · ❌ no installer · ❌ no publish · ❌ no commit · ❌ no push
- ✅ no production DB touched · ✅ protected systems byte-identical · ✅ no secrets in code

**Phase 3C-4 complete. Automatic 5MinutesAPI/WhatsApp integration is explicitly deferred to a later
phase, to be built only after this phase is fully verified.**
