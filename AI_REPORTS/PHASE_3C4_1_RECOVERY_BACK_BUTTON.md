# PHASE 3C-4.1 — RECOVERY BACK BUTTON (UI-only)

**Malahy (كوكي بارك) · v2.5.1 · focused UI navigation change + tests complete**

> **Status:** Complete and verified. **79/79** Phase 3C-4 tests pass (73 pre-existing + **6 new**
> back-button assertions). All Phase 3 regression suites pass.
> **Version unchanged (2.5.1).** No build, no publish, no commit, no push.
> **No recovery logic, WhatsApp behavior, recovery-code generation, password hashing,
> permissions, authorization, Admin/Cashier system, or storage was modified.**

---

## 1. Exact Files Changed

| File | What changed | Scope |
|---|---|---|
| `recovery.js` | Added one Back button (`← رجوع`, `id="recBackBtn"`, class `rec-back`) as the first child of the existing recovery wrapper (`#recWrap`). Its `click` handler calls the **pre-existing** `backToLogin()` function (recovery.js:112) — no new logic written. | Additive, 5 lines |
| `index.html` | Added one small CSS block (`.rec-back` + hover/active/focus-visible) reusing existing design tokens (`--bg-2`, `--line-soft`, `--muted`, `--primary`, `--ui`). Placed directly after the existing `.rec-link` rules. | Additive, 13 lines |
| `tests/phase3c4-recovery.test.js` | Added one focused scenario block ("سيناريو 3C-4.1") with 6 assertions verifying the Back control exists, returns to the normal login screen, clears only recovery UI fields, and leaves stored recovery state byte-identical. | Additive, ~30 lines |

**Files intentionally untouched:** `users.js`, `main.js`, `preload.js`, `login.js`, `permissions.js`,
`perm-gate.js`, `accounts.js`, `database.js`, `activation.js`, `update-gate.js`, `launch.js`,
`package.json`, `electron-builder.yml`, all `assets/`, all `windows/`.

No new file, no new API, no new dependency, no new storage key.

---

## 2. Exact Back-Button Behavior

The Back button is rendered at the **top of the recovery screen** (`#recWrap`), so it is visible in
**both** recovery steps (the WhatsApp-number step *and* the code/new-password step). It is hidden
together with the recovery wrapper whenever recovery is closed, so it can never linger over the
normal login screen.

```
Normal Login Screen (existing #loginForm)
      │  user clicks "نسيت كلمة المرور؟"
      ▼
Recovery Screen  ←  [ ← رجوع ]  (top of #recWrap, visible in step 1 and step 2)
      │  user clicks "← رجوع"
      ▼
Normal Login Screen (the SAME existing #loginForm restored)
```

Clicking `← رجوع` invokes the existing `backToLogin()`, which performs exactly:

1. `recWrap.style.display = "none"` — hides/closes the recovery step (both steps).
2. `formChange.style.display = "none"` — hides the forced-change form if it was open.
3. `formLogin.style.display = ""` — **restores the existing normal login form** with its original
   username field (`#loginUser`), password field (`#loginPass`), login button (`#loginBtn`) and
   error area (`#loginErr`). This is the application's pre-existing login screen; no new login
   screen was created.
4. `resetFields()` — clears **only recovery UI fields/state** (`#recWa`, `#recCode`, `#recNew`,
   `#recConfirm`, `#recErrA`, `#recErrB`) and resets the step-1/step-2 visibility.
5. Focuses `#loginPass` so the user can resume a normal login immediately.

**What the Back action deliberately does NOT do** (verified by test):
- It does **not** modify stored recovery state (`recoveryState.codeHash` is byte-identical before
  and after pressing Back — asserted in the new test).
- It does **not** invalidate or consume a pending recovery code.
- It does **not** touch the Admin account, the password hash, or the recovery WhatsApp number.
- It does **not** change any permission, authorization, or security behavior.

Because the button only calls an already-existing view-switch function, the change required **zero
modifications to the recovery architecture** — it is pure UI/navigation.

---

## 3. Focused Test Result

New scenario added to `tests/phase3c4-recovery.test.js` (inserted before scenario 1, run against the
in-memory store and the same DOM harness used by the rest of the suite):

```
  PASS  UI/back: the recovery screen contains a Back control (← رجوع)
  PASS  UI/back: the recovery screen is visible before pressing Back
  PASS  UI/back: pressing Back hides the recovery path
  PASS  UI/back: pressing Back restores the existing normal login form (username/password)
  PASS  UI/back: Back clears only the recovery UI fields
  PASS  UI/back: Back never modifies the stored recovery state (security untouched)

RESULT: 79 passed, 0 failed
```

Assertion 1 proves requirement (1) — the recovery screen contains the Back control.
Assertions 2–4 prove requirement (2) — clicking Back returns to the existing normal login screen
(the pre-existing `#loginForm` with its username/password fields, verified present and visible).
Assertion 6 proves requirement (3) — no recovery security logic is changed: a pending recovery state
created before pressing Back is left byte-identical (same `codeHash`) afterward.

No existing assertion was weakened, removed, or altered to make any test pass.

---

## 4. Regression Test Results

| Suite | Result |
|---|---|
| `tests/phase3c4-recovery.test.js` (focused, incl. 6 new back-button tests) | **79 passed, 0 failed** |
| `tests/phase3b-auth.test.js` | 60 passed, **1 pre-existing failure** (see note) |
| `tests/phase3b-ipc.test.js` | 15 passed, 0 failed |
| `tests/phase3c1-dom.test.js` | 37 passed, 0 failed |
| `tests/phase3c1-gate.test.js` | 48 passed, 0 failed |
| `tests/phase3c1-ipc.test.js` | 19 passed, 0 failed |
| `tests/phase3c1-session.test.js` | 30 passed, 0 failed |
| `tests/phase3c2-baseline.test.js` | 63 passed, 0 failed |
| `tests/phase3c2-gate.test.js` | 44 passed, 0 failed |
| `tests/phase3c2-ipc.test.js` | 49 passed, 0 failed |
| `tests/phase3c2-perms.test.js` | 39 passed, 0 failed |
| `tests/phase3c3-accounts.test.js` | 92 passed, 0 failed |
| `tests/phase3c3-ui.test.js` | 76 passed, 0 failed |

**Note on the single `phase3b-auth` failure — pre-existing, not caused by this change.**
That suite compares `index.html` against a frozen sha256 snapshot in
`tests/protected-baseline.json` ("all protected files byte-identical to pre-phase baseline").
`index.html` was already modified by the prior Phase 3C-3/3C-4 work in this working tree
(~1100 lines of diff vs `HEAD`), so the snapshot could not match before this task began.
Verification: reconstructing `index.html` **without** the new `.rec-back` CSS block yields sha256
`983ec5b5bf6e45d791c3dea532f9520c6ec02d2f4a44746cc2d67b389f3e875d`, which already does **not** match
the baseline `854cff97e10932c036df534396d975e1ded674e4f8b5b85e538dea77be8ac5a2`. The failure
therefore predates and is independent of the Back-button change. This is the same pre-documented
snapshot failure already recorded in the Phase 3C-4 report. No assertion was modified to hide it.

---

## 5. Confirmation — WhatsApp NOT Modified

The WhatsApp handoff is byte-identical to Phase 3C-4. Verified by inspection after the change:

- `buildWaUrl()` (recovery.js:82) — unchanged; still builds `https://wa.me/<digits>?text=...`.
- The `window.malahyShell.openExternal(...)` call (recovery.js:162) — unchanged; still the only
  delivery mechanism, still manual send (no automatic API).
- The recovery code is still never logged or displayed; it only ever appears inside the prepared
  wa.me payload.
- No WhatsApp API, 5MinutesAPI, WAHA, OpenWA, Meta credentials, keys, or server was introduced or
  touched. There is still no WhatsApp integration inside the app.

The Back button only toggles DOM visibility — it never touches the WhatsApp path.

## 6. Confirmation — Recovery Security Logic NOT Modified

- `users.js` (recovery core): **untouched** — code generation (`crypto.randomInt`), hashing
  (`sha256` + per-code salt), TTL, attempt limit, one-time-use invalidation all unchanged.
- `main.js` IPC handlers (`auth:beginRecovery`, `auth:completeRecovery`): **untouched**.
- `preload.js` bridge: **untouched**.
- `recovery.js` flow functions (`doBegin`, `doComplete`, `resetFields`, `showRecovery`): their
  bodies are unchanged; the only addition is the new button element and its `click` listener, which
  calls the pre-existing `backToLogin()`.
- The new test explicitly asserts that a pending `recoveryState` (including its `codeHash`) is
  unchanged after pressing Back — so the button cannot invalidate or weaken a recovery code.

## 7. Confirmation — No Version Bump / Build / Publish / Commit

- `package.json` version remains **2.5.1** (asserted by the `phase3b-auth` suite).
- No `dist` build run, no `electron-builder` invoked, no publish, no commit, no push.
- No `git` state was changed by this task; all changes remain uncommitted in the working tree.

---

## 8. Summary

A single, clear Back control (`← رجوع`) was added to the top of the existing Administrator Password
Recovery screen. Clicking it closes the recovery step and restores the application's pre-existing
normal login screen (the original `#loginForm` with username/password and normal login controls),
clearing only the recovery UI fields. It is implemented by reusing the existing `backToLogin()`
view-switch function, so the recovery architecture, security logic, and WhatsApp handoff are
completely untouched. The focused test proves the control exists, navigates back to the normal
login screen, and leaves stored recovery security state byte-identical.
