# Phase 4 — UI Icon Consistency + Splash Version Fix

**Project:** Malahy (`D:\Malahy`) — production `main`, v2.5.2
**Branch:** `main` · **HEAD at start and end:** `18acba6` (*docs: record both release commits in the v2.5.2 final QA report*)
**Phase status:** **PARTIAL PASS** — goal 2 (clock icons) delivered and verified; goal 1 (splash version) deliberately skipped by instruction; goal 3 (emoji → SVG) audited in full and **blocked**, nothing replaced.
**Files changed:** `index.html` only — **+17 / −0 lines, one hunk**.
**No build. No commit. No tag. No push. No new GitHub release.**

---

## 1. Phase status

| # | Goal | Outcome |
|---|---|---|
| 1 | Fix stale `2.5.0` in the splash | **NOT DONE — deliberately skipped** (instructed; §3) |
| 2 | Fix Shift Settings clock icons | **DONE — verified in all 4 configurations** (§6, §7) |
| 3 | Audit + replace emoji icons | **AUDIT COMPLETE (245 occurrences, A–F classified). REPLACEMENT BLOCKED — 0 replaced** (§8–§12) |

---

## 2. v2.5.2 starting state

Pre-flight was read-only. Nothing was modified during it.

| Item | Value |
|---|---|
| `git status` | clean except two **pre-existing** untracked paths (see §21) |
| Working tree vs `HEAD` | identical |
| `package.json` version | `2.5.2` |
| `AI_REPORTS/RELEASE_v2.5.2_FINAL_QA.md` | read in full |
| `windows/splash.html`, `windows/update.html` | inspected |
| `assets/icons/` | `icon.ico`, `logo.png`, `radix/` (12 glyphs + `sprite.svg` + `LICENSE` + `README.md`) |
| Radix icon system | inline SVG, `fill="currentColor"`, `viewBox="0 0 15 15"`, `aria-hidden="true"`, `focusable="false"`, 15px box, `.rix-flip` RTL rule |
| `tests/` | 14 suites, no framework, run as `node tests/<suite>.test.js` |
| `electron-builder.yml` | inspected, unchanged |

### 2.1 The documented baseline does not reproduce — measured **718 PASS / 5 FAIL**

The brief and the v2.5.2 report both state `722 PASS / 1 FAIL`. Measured at clean `HEAD`:

| Suite | Documented | **Measured** | Failing assertion |
|---|---|---|---|
| `phase3b-auth.test.js` | 60 / 1 | **60 / 1** | `all protected files byte-identical to pre-phase baseline :: changed: index.html, package.json` |
| `phase3c1-gate.test.js` | 48 / 0 | **46 / 2** | `protected file unchanged: package.json` · `all protected baseline files intact (except the intended index.html)` |
| `phase3c2-baseline.test.js` | 63 / 0 | **61 / 2** | same two |
| other 11 suites | unchanged | unchanged | — |
| **TOTAL** | **722 / 1** | **718 / 5** | |

**Root cause (verified byte-exactly, not inferred).** The v2.5.2 release re-anchored `tests/protected-baseline.json`:

```
- "d1f2551fa0e7b24a55d78725f8aff2f458bee1fc8dfd47ea632512d270b2f37b"   (correct for v2.5.1)
+ "42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c"   (recorded for v2.5.2)
```

but the `package.json` committed alongside it hashes to **`afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d`**:

- disk file SHA-256 = `afb76afc…` (294 B, LF, no BOM)
- `git cat-file blob 5c9dc15:package.json` SHA-256 = `afb76afc…` — identical to disk
- the v2.5.1 blob `d1f2551f…` **does** match the pre-bump baseline exactly

So `42fbdb44…` matches **no** variant of the committed file. CRLF, trailing-LF and UTF-8-BOM variants were all computed and hash to `b95d16d2…`, `696df9a6…`, `62f3a20f…` — none is `42fbdb44…`.

**4 of the 5 current failures are this one stale hash.** `phase3b-auth` was already failing (it does not skip `index.html`); `phase3c1-gate` and `phase3c2-baseline` *do* skip `index.html` (`intended = { "index.html": true }`), so their only failure is `package.json`.

**Not touched** — per instruction this is reported only. Correcting `42fbdb44…` → `afb76afc…` would restore `722 / 1`, but that is a test-data edit outside a UI phase.

---

## 3. Splash version issue

**Exact source of the stale `2.5.0`** — `windows/splash.html:179`:

```html
<div class="version">الإصدار <span>2.5.0</span></div>
```

A **hardcoded literal** in static markup. There is no build step, no templating and no JavaScript in `splash.html` (0 `<script>` blocks).

**Why it is not made dynamic (and was skipped anyway).** The splash window has **no preload**:

```js
// main.js:33
webPreferences: { devTools: false, contextIsolation: true },
```

so it cannot reach `app.getVersion()`. The existing version channel is `ipcMain.on("app-version", …)` (`main.js:123`) exposed via `preload.js:22` (`malahyApp.version()`) — neither is reachable from the splash renderer. Making it dynamic would require editing `main.js` (protected) to add a preload to the splash window, which creates a new IPC surface for that renderer — explicitly forbidden by this phase ("DO NOT modify … IPC security … application startup logic") and by Step 7's protected list.

**Decision taken:** skip the fix; leave `windows/splash.html` byte-identical. See §21 for the second, independent reason.

**`windows/update.html` — no stale version. Left untouched.** Verified: its version cells (`#vCur`, `#vReq`) are empty placeholders (`—`) populated at runtime from the `update-status` IPC payload. There is no version literal anywhere in the file.

---

## 4. Fix applied for the splash

**None.** `windows/splash.html` is byte-identical to `HEAD` (`7e9e9d03…`, unchanged). This remains an open defect.

---

## 5. Clock icon issue

Reproduced on the real app before touching anything (Electron harness driving the genuine `index.html` through the real `openSettings()` handler; screenshots retained).

The Shift Settings card has **two** distinct clock glyphs, and **both** were near-invisible in Dark Mode:

1. **The native picker indicator** (the reported bug). `index.html:727–732` styles
   `input[type="time"]` but had **no `::-webkit-calendar-picker-indicator` rule at all**.
   Chromium paints that indicator as a *dark* glyph, so on the dark `--bg` field it was
   black-on-near-black. Light Mode was already fine (dark glyph on white).

2. **The `🕐` section-header emoji** — `index.html:4498`
   `el('div',{class:'set-h'},[el('span',{class:'ic',text:'🕐'}),'إعدادات الورديات'])`.
   Segoe UI Emoji draws `U+1F550` as a dark clock face, which also sinks into the dark
   card. **Left unchanged** — see §10.

Baseline (Dark, before): the four time inputs show barely-perceptible dark clock pips, and the section-header clock is an unreadable dark disc.

---

## 6. Clock icon fix

`index.html`, immediately after the existing `.shift-field input[type="time"]:focus` rule — **17 added lines, 0 removed, 1 hunk**. CSS only; **no JavaScript, no HTML, no SVG, no `currentColor` paint**:

```css
.shift-field input[type="time"]::-webkit-calendar-picker-indicator{
  opacity:.7;cursor:pointer;filter:invert(1);
  transition:opacity .2s ease,filter .2s ease;
}
.shift-field input[type="time"]:hover::-webkit-calendar-picker-indicator,
.shift-field input[type="time"]:focus::-webkit-calendar-picker-indicator{opacity:1;}
[data-theme="light"] .shift-field input[type="time"]::-webkit-calendar-picker-indicator{opacity:.65;filter:none;}
```

Why this is safe and presentation-only:

- `opacity`, `filter`, `cursor` and `transition` are **paint-only** properties. They do not affect layout, box geometry, hit-testing, the input's value, or focus order.
- **No `appearance` and no `display` override.** The indicator is the only affordance that opens the time picker, so hiding it (`display:none`, a very common "fix") was deliberately rejected.
- The picker still opens on click; the value is untouched; `checkShift()` and every `input`/`change` listener are untouched.
- **No layout shift:** no box size, padding, margin or font-size is altered.
- **Theme detection matches the app's own model:** `index.html:2274–2279` — Dark = `:root` with **no** `data-theme` attribute; Light = `[data-theme="light"]`. `filter:invert(1)` therefore applies only in Dark Mode, and the Light override sets `filter:none`.
- **RTL:** the inputs already carry `direction:ltr` (`index.html:730`), so the indicator sits at the same physical edge in both document directions. No mirror rule is needed and none was added — mirroring would have been wrong here.

---

## 7. Emoji inventory — complete

Searched `index.html`, `main.js`, `preload.js`, `login.js`, `permissions.js`, `perm-gate.js`, `accounts.js`, `recovery.js`, `activation.js`, `update-gate.js`, `users.js`, `launch.js`, `windows/splash.html`, `windows/update.html`, `assets/report/daily-report.js`, `assets/ticket/ticket-template.js` using `\p{Extended_Pictographic}` with VS16 / ZWJ / modifier handling.

| File | Emoji-bearing lines |
|---|---|
| `index.html` | 235 |
| `accounts.js` | 9 |
| `assets/report/daily-report.js` | 1 |
| **Total** | **245 lines, 65 distinct emoji** |
| all others (`main.js`, `preload.js`, `login.js`, `permissions.js`, `perm-gate.js`, `recovery.js`, `activation.js`, `update-gate.js`, `users.js`, `launch.js`, `splash.html`, `update.html`, `ticket-template.js`) | **0** |

Most frequent: 💵×15 · 🎁×12 · ➕×12 · 📄×12 · 💰×12 · 🗑️×11 · ✅×10 · 🖨️×9 · ⚠️×9 · ➖×9 · 🟢×8 · 💳×6 · 🔄×6 · 📋×6 · 💾×6 · 🧾×6 · ⬇️×5 · 🔑×5 · 📊×5 · ⏸️×5 · 👥×5 · 🌴×5 · ❌×5 · 🔒×5 · ✏️×5 · 🏠×5 · ⛔×4 · 📅×4 · 👤×4 · 🕐×3 · ⏳×3 · 🟡×3 · 🗄️×3 · 🎟️×2 · 🏆×2 · 📉×2 · 🎮×2 · 🎈×2 · ↩️×2 · 📂×2 · 📝×2 · 💬 📈 🔍 ♻️ 🔁 ℹ️ 🔎 🎨 🏷️ 🖼️ ⚙️ 🧮 🪪 📜 👁️ ✔️ 📍 🗓️ ▶ ↩ 📌 🔐 🎛️ © (×1 each)

### 7.1 A–F classification

| Cat | Meaning | Count |
|---|---|---|
| **A** | Safe static presentation icon — hand-written markup, no handler | **3** |
| **B** | Dynamic presentation icon — built by `el()`, purely decorative | **40** |
| **C** | Business / data-dependent UI — sales, payroll, tickets, printing, attendance, game catalogue, printable documents | **129** |
| **D** | Security / activation / update-enforcement UI | **15** |
| **E** | Text / content emoji inside a user-facing label string | **58** |
| **F** | Unsupported — no suitable SVG equivalent | **0** |
| | **Total** | **245** |

Per file: `index.html` A3/B40/C129/D6/E57 · `accounts.js` D9 · `assets/report/daily-report.js` E1.

Notable sub-groups inside C: 20 lines are **printable document content** (ticket HTML, gift receipt, returns log, salary/weekly statements — `index.html:3588–3693`, `4066–4167`, `5451–5535`); 127 lines are the **employee/payroll screens** (4890–5405, 5620–5860) and the **games/tickets screen** (5880–6100).

---

## 8. Icons replaced

**None. 0 of 245.**

Section 12 explains why, with the measurements that forced it.

---

## 9. Source library for each new icon

**None — no icon artwork was added to the project.**

For the record, the artwork that *was* validated during this phase (all fetched from upstream and then deliberately **not** committed, because nothing could consume them safely):

| Semantics needed | Chosen source | Verified |
|---|---|---|
| clock / time | **Radix `clock`** (already vendored) | in `assets/icons/radix/clock.svg` |
| print / document | **Radix `file-text`** (already vendored) | project precedent: Radix has no printer glyph |
| chart / Excel | **Radix `bar-chart`** (already vendored) | in `assets/icons/radix/bar-chart.svg` |
| refresh / updates | **Radix `reload`** (already vendored) | in `assets/icons/radix/reload.svg` |
| settings | **Radix `gear`** (already vendored) | in `assets/icons/radix/gear.svg` |
| appearance | **Radix `color-wheel`** | `radix-ui/icons` — exists |
| reset / undo | **Radix `reset`** | `radix-ui/icons` — exists |
| image / logo | **Radix `image`** | `radix-ui/icons` — exists |
| gift | **Lucide `gift`** | `lucide-icons/lucide` — exists; **Radix has no gift glyph** |
| receipt | **Lucide `receipt`** | exists; **Radix has no receipt glyph** |
| tag / brand | **Lucide `tag`** | exists; **Radix has no tag glyph** (only `badge`) |

Full Radix catalogue enumerated from the official repository: **332 glyphs**. Confirmed absent from Radix: `gift`, `receipt`, `tag`, `printer`, `ticket`, `credit-card`, `palette` (nearest: `color-wheel`).

Lucide renames worth recording: `trash-2` → **`trash`**, `check-circle` → **`circle-check`**, `alert-triangle` → **`triangle-alert`**.

---

## 10. Asset provenance

The Radix set in `assets/icons/radix/` was left **byte-identical** — `LICENSE`, `README.md`, all 12 glyphs and `sprite.svg` unchanged (verified: `sprite.svg` 14 586 B / 19 CRLF, matching its pre-phase on-disk state).

Had the replacements proceeded, the provenance would have been:

- **Radix Icons** — MIT, © 2022 WorkOS, from `packages/radix-icons/icons/*.svg` of `radix-ui/icons`. Unmodified artwork, vendored — **not** generated. Licence text already at `assets/icons/radix/LICENSE`.
- **Lucide** — ISC, © 2026 Lucide Icons and Contributors, from `lucide-icons/lucide` `icons/*.svg`. Unmodified artwork, vendored — **not** generated. Licence text fetched verbatim (including the Feather-derived MIT section).

No path data was ever invented, hand-drawn or approximated. The only permitted deviation was a documented **stroke-weight normalisation** (Lucide `stroke-width` 2 → 2.4) so outline glyphs read at the same optical weight as the filled 15×15 Radix glyphs; no coordinates were altered.

---

## 11. Dark / Light / RTL / LTR visual QA

Real Electron 43 launch of the genuine `index.html` (read-only), driven through the **real** `openSettings()` handler and the **real** `MalahyPerm` gate, then themed with the app's own `setTheme()` and screenshotted with `capturePage()`. Dark = `data-theme` attribute absent; Light = `data-theme="light"` (the app's own convention).

| # | Config | Clock icons | Alignment | Clipping / overflow | Layout shift | Invisible icons |
|---|---|---|---|---|---|---|
| 1 | **Dark + RTL** | 4/4 clearly visible, light on dark | centred in each field | none | none | none |
| 2 | **Dark + LTR** | 4/4 clearly visible | centred | none | none | none |
| 3 | **Light + RTL** | 4/4 visible, dark on white (as before) | centred | none | none | none |
| 4 | **Light + LTR** | 4/4 visible | centred | none | none | none |

Verified specifically: indicator colour, indicator position (same physical edge in both directions), field height, label alignment, hint-box wrapping, and that no emoji glyph changed appearance. Light Mode is pixel-equivalent to the pre-fix baseline — the fix is inert there by design.

---

## 12. Icons intentionally NOT replaced

### 12.1 The blocker (why 0 replacements shipped)

I implemented the replacement set, then **reverted all of it** because it could not be verified — and shipping 15 icons that render as *nothing* would be a functional regression worse than leaving emoji.

**Measured on the shipped Electron/Chromium build:**

- **A data-URI SVG used through `mask-image` renders with zero alpha in this build.** Isolated controlled test (5 variants, `qa-tech.html`, identical artwork, only the technique varying):

  | Technique | Result |
  |---|---|
  | `mask-image` on `::after` | ❌ solid block |
  | `-webkit-mask-image` on `::after` | ❌ solid block |
  | `-webkit-mask-image` on the element | ❌ nothing painted |
  | `background-image` on `::after` | ✅ glyph |

  This means the **shipped v2.5.2** `.rep-foot .abtn .ic::after` / `.rev-head .abtn .ic::after` masks (Phase 2b-2) and the `.abtn .ic` mask approach are very likely **already broken in production**. Reported, not touched.

- **The QA harness mis-renders `fill="currentColor"` SVG — including already-shipped icons.** In one capture, the pre-existing Phase 2C Radix `minus` in `.panel.exp .tag` rendered as an **empty dark box** while a `stroke="currentColor"` inline SVG in the adjacent gifts tile rendered **correctly**. Since v2.5.2 ships ~15 inline `fill="currentColor"` Radix glyphs (all 12 Action Bar icons, the expenses tile, the password banner, both add-buttons), the harness produces **false negatives** for exactly the mechanism any replacement would use. I therefore cannot certify a replacement here, and this also means the shipped icons warrant an independent check on real hardware.

All vendored artwork, the sprite additions, the CSS block and every one of the 15 markup edits were removed. `git status` confirms `index.html` is the only modified file.

### 12.2 Classification-based exclusions (independent of the blocker)

| Reason | Count | Examples |
|---|---|---|
| **C — business/data-dependent.** Icon sits inside a row whose text, class or `onClick` is computed from ticket, payroll, attendance, discount or game data. Replacing the glyph risks changing a computed label. | 129 | `empListRow()` `ic` field (5271–5279), all `repCard(...)` labels (4903–4913, 5157–5165, 5298–5301, 5761–5765), `.gm-chip`/`.emp-chip` state chips, salary-statement print HTML (5451–5535) |
| **D — security / activation / update.** | 15 | `paintSettingsUpdate()` icon+buttons (4341–4362), `initUpdateUI()` (6120–6122), `#updateIc` (1738), `act-wa-btn` (1872), all 9 in `accounts.js` |
| **E — text/content emoji inside a label.** Removing them changes the visible label string and any `title`/`aria` derived from it. | 58 | `'⚠️ تم العدّ لكن تعذّر حفظ…'`, `'💵 كاش: '`, `'🧾 سجل المرتجعات'`, `©` in the printable report |
| **Protected file — `accounts.js` is cashier-management/authentication; out of scope by rule.** | 9 | 🔐 🔑 💾 👥 🎛️ ⚠️ ✏️ |
| **`🕐` at `index.html:4498`** — the Phase 4 clock emoji. Technically Category A (dedicated `.ic` span), but replacing it needs the blocked mechanism. **Left as-is; its dark-mode visibility problem is unresolved.** | 1 | see §21 |

### 12.3 Blocked candidates, fully specified for the next phase

If the icon work resumes, the safe set is exactly these 15 — all dedicated `.ic` spans or static decorative elements, all with honest artwork verified to exist:

| # | Location | Emoji | Would become | Source |
|---|---|---|---|---|
| 1 | `index.html:1798` `.panel.gift .tag` | 🎁 | gift | Lucide `gift` |
| 2 | `index.html:4422` `.set-h` header | 🖨️ | file-text | Radix (project precedent) |
| 3 | `index.html:4427` test-ticket button | 🧾 | receipt | Lucide `receipt` |
| 4 | `index.html:4434` `.set-h` header | 🔄 | reload | Radix `reload` |
| 5 | `index.html:4447` `.set-h` header | 🎨 | color-wheel | Radix |
| 6 | `index.html:4490` restore-shift button | ↩️ | reset | Radix `reset` |
| 7 | `index.html:4498` `.set-h` header | 🕐 | clock | Radix `clock` |
| 8 | `index.html:4527` restore-logo button | ↩️ | reset | Radix `reset` |
| 9 | `index.html:4544` `.set-h` header | 🏷️ | tag | Lucide `tag` |
| 10 | `index.html:4554` choose-logo button | 🖼️ | image | Radix `image` |
| 11 | `index.html:4566` dialog title | ⚙️ | gear | Radix `gear` |
| 12 | `index.html:3399`, `3417` | 📄 | file-text | Radix |
| 13 | `index.html:3400`, `3418` | 📊 | bar-chart | Radix |
| 14 | `index.html:3419`, `3434` | 🖨️ | file-text | Radix |
| 15 | `index.html:2556` / `2559` | 🎟️ / 💳 | — | **no honest mapping; leave** |

**Recommended mechanism (proven to render in this build): inline `<svg>`,** as the project's own `assets/icons/radix/README.md` §3 already argues. That requires injecting SVG into `el()`-built nodes, i.e. a small documented helper in the frozen inline script — a deliberate trade the next phase must authorise, rather than a silent CSS workaround that demonstrably does not paint.

---

## 13. Dark QA

See §11. Dark + RTL and Dark + LTR both show all four picker indicators clearly legible; the section-header emoji remain as dark as they were (unfixed, §12.2).

## 14. Light QA

See §11. Light + RTL and Light + LTR are visually unchanged from the pre-fix baseline — `filter:none` in Light Mode is deliberate.

## 15. RTL QA

Indicators sit at the same physical edge as in LTR (the inputs force `direction:ltr`). No mirroring applied — mirroring a clock/picker affordance would be wrong.

## 16. LTR QA

Confirmed. No text-direction or alignment regression anywhere in the card.

---

## 17. Regression result

Repository convention: `node tests/<suite>.test.js`, 14 suites, no framework.

| | PASS | FAIL |
|---|---|---|
| **BEFORE** (clean `HEAD`, this session) | **718** | **5** |
| **AFTER** | **718** | **5** |
| **Delta** | **0** | **0** |

All five failures are byte-for-byte the same five as before, with the same messages:

```
phase3b-auth.test.js    FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html, package.json
phase3c1-gate.test.js   FAIL  protected file unchanged: package.json
phase3c1-gate.test.js   FAIL  all protected baseline files intact (except the intended index.html)
phase3c2-baseline.test.js FAIL  protected file unchanged: package.json
phase3c2-baseline.test.js FAIL  all protected baseline files intact (except the intended index.html)
```

**New failures: 0.** No test was modified, skipped, weakened or made conditional. No test file was touched at all.

---

## 18. Before / after comparison

| Measure | Before | After |
|---|---|---|
| Files changed | — | `index.html` only |
| `index.html` diff | — | **+17 / −0**, single hunk at line 733 |
| `index.html` bytes (HEAD blob) | 720 445 | 728 402 (**+7 957**) |
| `index.html` SHA-256 (LF-normalised) | `cd27407005cc15ac1d0ed8ba172c4340d33ecdaf7c18be21a6ecaa707977d263` | `6fad4deca8810e7a10cc80dfe5117e82443166fd6352b9474efdffb726821f75` |
| `id="…"` multiset | 57 | **57 — identical** |
| `onclick="…"` multiset | 18 | **18 — identical** |
| `data-perm="…"` multiset | 10 | **10 — identical** |
| `<script src>` multiset | 9 | **9 — identical** |
| `<link rel=stylesheet>` multiset | 1 | **1 — identical** |
| `<script>` blocks | 12 | **12 — 0 differ** (after EOL normalisation) |
| Line endings | CRLF working copy | **CRLF preserved, 0 bare LF** |

The change is **additive CSS only**. No JavaScript statement, no HTML element, no attribute, no id and no handler was touched.

---

## 19. Protected-file verification

Every tracked file compared byte-for-byte against its `HEAD` blob via `git cat-file`. **83 tracked files; content changed: `index.html` only.**

**27 / 27 protected files byte-identical**, including all eleven logic files named in Step 7:

`main.js` · `preload.js` · `database.js` · `users.js` · `login.js` · `recovery.js` · `permissions.js` · `perm-gate.js` · `activation.js` · `update-gate.js` · `accounts.js` · `launch.js` · `package.json` · `electron-builder.yml` · `.gitignore` · `README.md` · `package-lock.json` · `windows/splash.html` · `windows/update.html` · `assets/ticket/ticket-template.js` · `assets/ticket/ticket-template.svg` · `assets/report/daily-report.js` · `assets/vendor/qrcode.js` · `assets/vendor/radix-colors.css` · `assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`

Explicitly confirmed untouched: **QR** (`assets/vendor/qrcode.js`), **ticket assets** (`assets/ticket/*`), **printer-related files** (`assets/report/daily-report.js`, `assets/ticket/*`), **database** (`database.js`), **security** (`activation.js`, `update-gate.js`, `users.js`, `permissions.js`, `perm-gate.js`, `login.js`, `recovery.js`, `accounts.js`, `preload.js`), **IPC** (`preload.js`, `main.js`), **update gate** (`update-gate.js`, `FLOOR_VERSION` still `2.5.1`).

`update-gate.js` `FLOOR_VERSION` remains `2.5.1` — untouched, and its 3 guarding assertions still pass.

---

## 20. Business-logic verification

| System | Status |
|---|---|
| Sales · ticket calculations · ticket layout · QR | ✅ untouched (`assets/ticket/*`, `assets/vendor/qrcode.js` byte-identical) |
| Printing · printer discovery · A4 · 58mm · 80mm | ✅ untouched (`assets/report/daily-report.js` byte-identical) |
| Daily accounts · Returns Log | ✅ untouched (`accounts.js` byte-identical) |
| Gifts · Expenses calculations | ✅ untouched (all 244 KB of inline JS byte-identical) |
| Employee advances · Payroll | ✅ untouched |
| Shift calculations · business-day logic | ✅ untouched — no shift value, `DEFAULT_SHIFT_TIMES`, `validateShiftTimes()` or listener was modified |
| Authentication · Permissions · Recovery | ✅ untouched (byte-identical) |
| Activation · Update enforcement | ✅ untouched (byte-identical) |
| Database · Storage · IPC · Security | ✅ untouched |

The single change is `::-webkit-calendar-picker-indicator` paint properties. `opacity` / `filter` / `cursor` / `transition` cannot alter a value, a calculation, a stored key, an IPC message or a permission decision. No shift input's value, no business-day boundary and no printed output can be affected — confirmed both by inspection and by the unchanged 718/5 regression.

---

## 21. Remaining limitations

1. **Splash still shows `2.5.0`.** Skipped by instruction. A second, independent reason also argues against editing it: `phase3c1-gate.test.js:70` and `phase3c2-baseline.test.js:71` assert `windows/splash.html` is byte-identical, so the one-character-class fix would add **4 new failures** (`718/5` → `714/9`). Fixing it properly needs either a baseline re-anchor or a dynamic version channel, and the latter requires touching protected `main.js`.
2. **The 245 emoji remain.** All audited and classified; none replaced — see §12.1. The mechanism that works (inline SVG) needs a documented JS edit that this phase was not authorised to make.
3. **`🕐` at `index.html:4498` is still dark-on-dark in Dark Mode.** The native picker indicators are fixed; the section-header emoji is not. This is the one part of the reported clock issue left open.
4. **The documented `722 PASS / 1 FAIL` baseline is not reproducible**; the real figure is `718 / 5`, caused by a wrong `package.json` hash in `tests/protected-baseline.json` (§2.1). Reported, not touched.
5. **Possible pre-existing production defect:** the shipped Phase 2b-2 `mask-image` pseudo-element icons (`.rep-foot`/`.rev-head` modal buttons) do not paint on the Electron 43 / Chromium build tested here. Worth checking on real hardware.
6. **Possible pre-existing production defect:** the harness rendered the shipped `fill="currentColor"` Radix `minus` (`.panel.exp .tag`) as an empty box while a `stroke="currentColor"` SVG rendered correctly. If reproducible on real hardware, all shipped filled Radix icons need review.
7. **QA method caveat:** activation and login were stubbed in an out-of-repository harness (in-memory `malahyDB`, full-permission admin via the real `MalahyPerm.setSession`). The real `activation.js`, `login.js`, `users.js`, `main.js` and `preload.js` were never loaded, bypassed or modified in the repository. No production data was touched.
8. **Not done, as instructed:** no build, no version bump, no commit, no tag, no push, no GitHub release.
9. **Two pre-existing untracked paths** were present at pre-flight and were **not** created, modified or removed by this phase: `AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md`, `qa-ticket-renders/`.

---

*Phase 4 ends here. The next phase decides whether these corrections become v2.5.3 and performs the final release build.*