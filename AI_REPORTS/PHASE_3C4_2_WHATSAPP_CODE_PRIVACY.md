# PHASE 3C-4.2 — RECOVERY CODE PRIVACY / WHATSAPP DELIVERY INVESTIGATION
**Malahy (كوكي بارك) · v2.5.1 · read-only investigation — NO implementation change**

> **Status: INVESTIGATION ONLY.** No safe, supported, local, credential-free mechanism exists to deliver
> the recovery code as a WhatsApp message without exposing it on the computer screen. Per the phase rules,
> the investigation **stopped at that result**. The existing `wa.me` manual-Send behavior is preserved
> **exactly as-is** and remains fully functional. **No code was changed. No tests were changed.**
> **Version unchanged (2.5.1). No build, no publish, no commit.**

---

## 1. How the Current WhatsApp Handoff Works

Established by read-only inspection of the shipped Phase 3C-4 sources (no edits made):

```
recovery.js  doBegin()
   1. renderer calls window.malahyAuth.beginRecovery(number)
        -> preload.js -> IPC "auth:beginRecovery" -> main.js -> users.beginRecovery()
             - digit-normalizes the input (+ / spaces / dashes ignored)
             - compares against the single Admin record's stored recoveryWhatsapp
             - on match: crypto.randomInt -> 6-digit code
             - persists ONLY sha256:<salt>:<digest> + expiresAt + attempts=0 + used=false
             - returns the PLAINTEXT CODE EXACTLY ONCE (in-memory, to the renderer)

   2. buildWaUrl(digits, code, minutes)      <- recovery.js:82
        "https://wa.me/<digits>?text=" + encodeURIComponent(msg)
        msg = "رمز استعادة كلمة مرور حساب المدير: <CODE>\nالصلاحية: 10 دقيقة …"

   3. window.malahyShell.openExternal(url)   <- recovery.js:162
        -> preload.js -> IPC "open-external" -> main.js:251
             - whitelist: /^(https?|whatsapp):\/\//i
             - shell.openExternal(url) -> OS default handler for https://wa.me/...
                -> web browser (WhatsApp Web) OR WhatsApp Desktop (if it owns the wa.me handler)

RESULT: a WhatsApp conversation to the configured number opens with the message pre-filled in the
visible compose area, INCLUDING the recovery code. Nothing is sent. The user must press Send manually.
The code is visible on the computer screen from the moment the link opens until Send is pressed.
```

Key sources read (unchanged): `recovery.js:82` (`buildWaUrl`), `recovery.js:148-192` (`doBegin`),
`recovery.js:162` (`openExternal` call), `preload.js:45` (`openExternal` bridge), `main.js:251-254`
(`open-external` handler + whitelist), `users.js` (`beginRecovery` / `hashRecoveryCode`).

**The exposure this phase was asked to eliminate:** the prepared message — and therefore the recovery
code — is rendered on the computer screen (browser tab or WhatsApp Desktop window) *before* Send.

**What is already private today (and stays private):** the code is never rendered inside the Malahy UI,
never written to the store (only its salted hash is), and never logged. Only the *external WhatsApp
compose area* shows it — i.e. the exposure belongs to the WhatsApp client, not to Malahy.

---

## 2. Whether a Safe Automatic/Background Delivery Mechanism Was Found

**Answer: NO.** Every candidate was evaluated against the hard constraints
(no paid API · no credentials · no third-party WhatsApp API · no undocumented internals ·
no browser/mouse/keyboard/UI automation · no server · must remain self-contained).

| # | Candidate local mechanism | Verdict | Why it fails the privacy requirement |
|---|---|---|---|
| 1 | `https://wa.me/<n>?text=<msg>` **(current)** | privacy fail | Official **click-to-chat** link. Its documented, sole purpose is to open a conversation with the message **pre-filled in the visible compose area** for human review. The code is on screen before Send. |
| 2 | `https://web.whatsapp.com/send?phone=<n>&text=<msg>` | privacy fail | Identical behavior: pre-fills the visible compose box in WhatsApp Web. Code on screen. |
| 3 | `whatsapp://send?phone=<n>&text=<msg>` (WhatsApp Desktop deep link) | privacy fail | Opens the Desktop app with the same pre-filled, visible compose area; still requires manual Send. Code on screen. |
| 4 | WhatsApp Desktop CLI / local IPC / local socket send | does not exist | WhatsApp Desktop exposes **no** documented command-line, IPC, REST, or socket interface for sending a message. There is nothing supported to call. |
| 5 | Electron / Node local API | does not exist | The app's only external primitive is `shell.openExternal` (whitelisted `https?\|whatsapp`). Electron has no "send WhatsApp message" API. The repo has **no HTTP client** (no axios/node-fetch — verified) and no WhatsApp library (**0 packages** matching whatsapp/baileys/waha/openwa in `node_modules` — verified). |
| 6 | WhatsApp Cloud / Business API | **forbidden** | Requires a paid Meta API, an access token/Phone Number ID, and a server-side relay. Explicitly disallowed by this phase and by the standing project rules. |
| 7 | Unofficial libraries (Baileys / OpenWA / WAHA / 5MinutesAPI) | **forbidden** | Third-party WhatsApp APIs speaking undocumented WhatsApp internals. Explicitly disallowed. |
| 8 | Browser / Desktop UI automation (fill + click Send) | **forbidden** | Mouse/keyboard/UI automation and "simulating a click on the Send button" are explicitly disallowed. It is also brittle and unsafe. |

### The root technical reason

All official WhatsApp link/protocol entry points (`wa.me`, `web.whatsapp.com/send`, `whatsapp://send`)
are **click-to-chat** links. Their documented contract is: *open a conversation and place `text` into the
compose area for the user to review and press Send.* Pre-filling a **visible** field is the entire purpose
of the `text=` parameter, and WhatsApp deliberately forces human review before any send (anti-spam/abuse
design). **No official link, parameter, or protocol variant submits a message without first rendering its
text in the UI.** Consequently, as long as the code must travel inside the WhatsApp message body and only
official, supported, credential-free, automation-free mechanisms are allowed, **the code is necessarily
rendered on the computer screen by the WhatsApp client itself.**

There is also **no already-existing approved mechanism in the project** that could do this: the only
external-channel primitive is `open-external` (a pure URL opener). No relay, no network client,
no WhatsApp integration, and no credentials exist anywhere in the codebase (re-verified by scan: 0 hits
for 5MinutesAPI / WAHA / OpenWA / Baileys / Cloud API / tokens / Phone Number IDs).

**Conclusion: the desired privacy behavior cannot be implemented safely within the stated constraints.**
Automatic/background WhatsApp delivery without an API or unsupported UI automation is **not available**
through the current `wa.me` mechanism or any other official local channel.

---

## 3. What Was Implemented

**Nothing.** Per the phase rule — *"If the only possible solution requires an API or unsupported automation,
STOP at the investigation result and preserve the existing implementation"* — no source file, test file,
configuration file, asset, or document was modified. The recovery architecture, the security model, and the
manual WhatsApp Send flow are byte-identical to the verified Phase 3C-4 / 3C-4.1 baseline.

Explicitly **not** introduced: no 5MinutesAPI, no WAHA, no OpenWA, no WhatsApp Cloud/Business API, no
third-party WhatsApp API of any kind, no API key, no access token, no secret credential, no browser
automation, no mouse/keyboard automation, no WhatsApp Desktop UI automation, no undocumented WhatsApp
internals, no server/VPS. The application remains fully self-contained.

### How the code is kept private under the preserved behavior

All existing recovery security rules remain in force and were re-verified by the passing suite:

- The plaintext code lives **only in memory** (returned once to the renderer, placed into the `wa.me` URL).
- **No plaintext code is persisted** — only `sha256:<16-byte-per-code-salt>:<digest>` reaches `malahy_users_v1`.
- **The code is never logged** — `recovery.js` and `users.js` contain no `console.*`; the `main.js` handlers
  log only `String(err)` context.
- **The code is never rendered in the Malahy UI** — the step-2 note tells the user the code is in WhatsApp
  and is never shown in the app (asserted by the UI test).
- 10-minute TTL, 5-attempt lock, single-use, and old-code invalidation are all unchanged.

---

## 4. Why the Current `wa.me` Mechanism Cannot Hide the Code Before Send

`wa.me` is a click-to-chat deep link. The OS hands `https://wa.me/<n>?text=<msg>` to the default handler,
which opens WhatsApp Web (browser) or WhatsApp Desktop with the **entire prepared message, code included,
displayed in the compose area**. The URL itself also carries the code in its query string. There is no
official flag, parameter, or alternate official endpoint that suppresses the compose-area preview or that
sends without it. Hiding the code from the compose area is **not a supported capability of any official
WhatsApp link or protocol** — the only things that could do it are a paid Cloud/Business API call (needs a
Meta token + a server relay) or UI automation of the Send button, both of which are forbidden by this phase
and by the project's standing security/architecture rules.

### Confirmations

- **No unsafe workaround was introduced.** Zero production source changes. Re-scanned after the
  investigation: no `whatsapp://`, no `web.whatsapp.com/send`, no automation library, no network client
  added (0 hits). `git` working tree left untouched.
- **The existing manual WhatsApp Send fallback remains fully intact and functional.** `recovery.js:82`
  (`buildWaUrl`), `recovery.js:162` (`openExternal`), the step-2 note instructing the user to press Send
  manually, and the fallback error shown when `openExternal` is unavailable are all unchanged. The recovery
  flow still works end-to-end: begin → WhatsApp opens with the prepared message → user presses Send → user
  reads the code on the phone → enters it → the admin password is reset.

---

## 5. No API Key or Third-Party WhatsApp Service Was Added

Confirmed by direct scan of the repository and `node_modules`:

- **0 hits** for `5MinutesAPI`, `WAHA`, `OpenWA`, `baileys`, `whatsapp-web`, Cloud/Business API, Meta tokens,
  access tokens, or Phone Number IDs in any source file.
- **0 installed packages** matching `whatsapp`, `baileys`, `waha`, `openwa`, or `qrcode`.
- No HTTP client was added (the app still uses only Node built-ins; `open-external` is a pure URL opener).
- No credentials of any kind exist in the renderer, `preload.js`, `index.html`, storage, or the repo.

---

## 6. No Unrelated Systems Were Changed

**No system was changed.** The following remain byte-identical to the verified baseline (confirmed by the
passing regression suites in §7, including the `phase3c2-baseline.test.js` guardian):

Admin/Cashier architecture · permissions · authorization · password hashing · the recovery-code security
model · ticket · QR · printer · sales · pricing · returns · gifts · reports · payroll · games · shifts ·
branding · activation · auto-update · storage architecture.

---

## 7. Exact Test Results

All suites were run **unchanged**, on in-memory stores only (no production database was opened).

| Suite | Result |
|---|---|
| `tests/phase3c4-recovery.test.js` | **79 passed, 0 failed** |
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
| `tests/phase3c3-accounts.test.js` | 92 passed, 0 failed |
| `tests/phase3c3-ui.test.js` | 76 passed, 0 failed |
| **3C-3 subtotal** | **168 / 168** |
| `tests/phase3b-ipc.test.js` | 15 passed, 0 failed |
| `tests/phase3b-auth.test.js` | 60 passed, **1 failed** (see note) |
| **GRAND TOTAL** | **651 passed, 1 failed** |

**The one failure is the pre-existing, documented frozen-3B snapshot** (`phase3b-auth.test.js` ::
*"all protected files byte-identical to pre-phase baseline :: changed: index.html"*). `index.html` has been
intentionally and necessarily modified since Phase 3C-1 (login UI, permission enforcement, admin cards, and
the 3C-4 recovery script tag + CSS). It is **not** caused by Phase 3C-4.2 — nothing was changed in this
phase, so the result is identical before and after. The active guardian `phase3c2-baseline.test.js` passes
63/63 and confirms every other protected file is intact.

### Coverage of the requested privacy checklist (verified by the passing 3C-4 suite, unchanged)

1. Recovery code never rendered in the Malahy UI — asserted (`code never rendered in the app UI`).
2. Recovery code never persisted in plaintext — asserted (`the plaintext code never reaches the persistent
   store`; only `sha256:salt:digest` is stored).
3. Recovery code never logged — asserted (`no recovery secret appears in logs during the whole flow`).
4. The correct configured Admin recovery number is used — asserted (`the destination is the wa.me link for
   the configured digits` → `https://wa.me/201001234567?text=…`).
5. The WhatsApp delivery path is invoked correctly — asserted (`a valid number opens exactly one external
   WhatsApp destination`; code present in the prepared message; handoff verifies against the stored hash).
6. Recovery verification still works — asserted (correct code + matching passwords reset the password).
7. Expiration still works — asserted (TTL expiry rejected; expired state swept on boot).
8. Attempt limits still work — asserted (5 wrong attempts lock the code; UI returns to step 1).
9. Single-use behavior still works — asserted (success invalidates the code; no reuse).
10. Existing Phase 3 regression suites still pass — 134/134 · 195/195 · 168/168 · 15/15 (see table above).

Items 1-3, 4, and 5 above already hold **inside Malahy** today; the only residual exposure is the WhatsApp
client's own compose area, which no supported local mechanism can suppress (§2/§4).

---

## 8. Version / Build Rule Compliance

- No version bump · no `package.json` edit · `FLOOR_VERSION` unchanged (**2.5.1**).
- No build · no packaging · no installer · no publish · no commit · no push.
- No production database touched (in-memory stores only).
- Protected systems byte-identical; no secrets in code; no new dependencies.

---

## 9. Honest Statement of Demonstrated Capability

**Automatic WhatsApp sending was NOT implemented and is NOT claimed to work.** No send was performed or
simulated in any test. The investigation concluded that the only paths to background delivery — a paid
Cloud/Business API with a Meta token and server relay, or UI automation of the Send button — are both
forbidden by this phase's constraints. The current transport therefore remains the honest `wa.me`
deep-link handoff: the message is prepared and opened at the exact configured number, and the user presses
Send manually. The recovery system is left **unchanged and fully working**.
