# PHASE 2B-1 — UI Redesign: Radix SVG Icon System + Action Bar Pilot

## FINAL VERIFICATION REPORT

**Project:** Malahy (كوكي بارك) — ticketing & daily-account system
**Base:** v2.5.1 (tag `v2.5.1`, commit `a3e790d`)
**Branch:** `experiment/ui-redesign-radix` in git worktree `D:\Malahy-redesign`
**`main` worktree:** `D:\Malahy` — **pristine and untouched**, used as the release reference
**Previous phase:** Phase 2a (Radix Colors migration) — **PASS**, left fully intact
**Scope:** one reusable icon system + the **main Action Bar only**.
**No version bump, no build, no installer, no publish, no commit, no push, no merge. No Phase 2b-2 work started.**

---

## FINAL VERDICT: **PASS**

| Check | Result |
|---|---|
| New regression introduced | ✅ **0.** Test totals identical to the 2a baseline: **713 pass / 10 fail**. All 10 failures are the same assertions, character-for-character, already classified in 2a §10. |
| Inline JavaScript byte-identical | ✅ All **12** `<script>` blocks byte-identical to v2.5.1 (hence to the 2a version). |
| IDs / `data-perm` / `onclick` preserved | ✅ multisets identical — **57** ids, **10** `data-perm`, **18** `onclick`, unchanged counts. |
| All Action Bar buttons intact | ✅ **12/12** original `class` / `onclick` / `data-perm` / label, in the original order. |
| Icons render | ✅ 12/12 paint; `missingAssets = 0`; no broken placeholders; **0 console errors**. |
| Dark / Light / RTL / hover / disabled | ✅ all verified with machine measurements (§7–§9). |
| Functionality + permissions | ✅ 12/12 handlers fire, 5/5 modals open, permission gate hides exactly the 8 gated buttons. |
| Protected systems | ✅ 20/21 protected files byte-identical to their 2a hashes; the 1 change is `index.html`, which this phase is required to edit. |
| Phase 2a preserved | ✅ 2a reconstruction reproduces the documented **78/75** exactly; `splash.html`/`update.html` untouched by this phase. |

**No new failure is acceptable, and none occurred. Safe to proceed.**

---

## 1. Starting worktree / branch state

| Item | Value |
|---|---|
| Worktree | `D:/Malahy-redesign a3e790d [experiment/ui-redesign-radix]` |
| HEAD | `a3e790d0488d408b3e637248b63eb4dad5482063` = tag `v2.5.1` |
| Branch | `experiment/ui-redesign-radix` (never switched to `main`) |
| `main` worktree | `D:/Malahy 1d32a21 [main]`, pristine |
| Phase 2a present | ✅ `assets/vendor/radix-colors.css` + `AI_REPORTS/UI_REDESIGN_PHASE_2A_RADIX_COLORS.md` + the 2a token repaint in 3 files |

**Environment note (carried over from 2a §16.4):** `core.autocrlf=true` with no
`.gitattributes`, so plain `git status` lists 46 files as "modified" — a CRLF/LF display
artifact. Every measurement in this report uses `git -c core.autocrlf=false`, which shows
the true change set. This is pre-existing and unrelated to Phase 2b-1.

---

## 2. Files added

All new files are inside `assets/icons/radix/` — nothing else was created.

| File | Purpose |
|---|---|
| `assets/icons/radix/download.svg` | canonical glyph |
| `assets/icons/radix/reload.svg` | canonical glyph |
| `assets/icons/radix/file-text.svg` | canonical glyph |
| `assets/icons/radix/lock-open-1.svg` | canonical glyph |
| `assets/icons/radix/exit.svg` | canonical glyph (RTL-mirrored) |
| `assets/icons/radix/lock-closed.svg` | canonical glyph |
| `assets/icons/radix/clipboard.svg` | canonical glyph |
| `assets/icons/radix/cube.svg` | canonical glyph |
| `assets/icons/radix/bar-chart.svg` | canonical glyph (RTL-mirrored) |
| `assets/icons/radix/group.svg` | canonical glyph |
| `assets/icons/radix/clock.svg` | canonical glyph |
| `assets/icons/radix/gear.svg` | canonical glyph |
| `assets/icons/radix/sprite.svg` | all 12 as `<symbol id="rix-*">`; catalog + ready for `<use>` |
| `assets/icons/radix/LICENSE` | Radix Icons MIT license, verbatim |
| `assets/icons/radix/README.md` | icon-system documentation (architecture, CSS contract, RTL rules, mapping) |

Each `.svg` carries a 3-line attribution header (icon name, source, MIT + copyright).

**Nothing installed.** No `node_modules/` exists in the worktree (§15).

---

## 3. Files modified

Exactly **one** file was modified by Phase 2b-1:

| File | Change |
|---|---|
| `index.html` | (a) 8 lines of icon CSS added in the `/* ===== Actions ===== */` block; (b) 12 Action Bar emoji replaced by inline SVG. |

True change set vs `v2.5.1` (`git -c core.autocrlf=false diff --numstat`):

| File | +/- | Attributed to |
|---|---|---|
| `index.html` | **99 / 88** | Phase 2a (78/75) **+ Phase 2b-1 (21/13)** |
| `windows/splash.html` | 28 / 24 | Phase 2a only — **untouched by 2b-1** |
| `windows/update.html` | 8 / 6 | Phase 2a only — **untouched by 2b-1** |

`windows/splash.html` and `windows/update.html` retain their **exact Phase 2a hashes**
(`8bc85e73…`, `d6be3dbd…` — identical to the values published in 2a §9). Phase 2b-1 did not
open them.

### 3.1 The Phase 2b-1 delta, proven exactly

To prove Phase 2a was not disturbed, the file was reconstructed by *reversing* the 2b-1 edits
(12 glyphs → emoji, 8 CSS lines removed) and diffed:

| Comparison | Result |
|---|---|
| `v2.5.1` → reconstructed 2a | **78 / 75** — reproduces the 2a report's documented numbers **exactly** ✅ |
| reconstructed 2a → current | **21 / 13** = 8 inserted CSS lines + 12 in-place button-line edits ✅ |

Every changed line in the whole diff was classified. Buckets: Phase 2a token repaint +
Phase 2a comment re-wording + the `radix-colors.css` `<link>`, **and** the 2b-1 CSS block and
12 button lines. **Zero unclassified lines.**

---

## 4. Radix Icons source and license

- **Source:** [Radix Icons](https://radix-ui.com/icons), from the `radix-ui/icons`
  repository, file `packages/radix-icons/icons/<name>.svg` (the set published as
  `@radix-ui/react-icons` v1.3.2).
- **License:** **MIT** — Copyright (c) **2022 WorkOS**.
- **Attribution preserved:** the copyright + permission notice is reproduced verbatim in
  `assets/icons/radix/LICENSE` and in the header comment of **every** vendored `.svg`, as the
  MIT license requires.
- **Artwork authenticity:** the 12 `<path d="…">` strings were generated programmatically from
  the upstream files and verified **byte-identical, 12/12** (`ok=12 bad=0`). The artwork is
  vendored, not redrawn or modified.
- **React was NOT used.** The upstream React wrapper is not installed and not required; only
  the raw SVG `<path>` data is consumed. The complete set was enumerated from the repository
  (332 icons) to confirm which glyphs genuinely exist — see the caveat in §14.1.

---

## 5. Icon system architecture

**Goal:** a small, framework-independent icon system that works without React, works
offline and inside Electron, supports `currentColor`, consistent dimensions, CSS styling,
RTL-aware directional icons, no network requests, no unsafe HTML injection, and does not
disturb existing rendering — built on the project's vanilla HTML/CSS/JS architecture.

### 5.1 Why inline SVG (the key decision)

The renderer loads `index.html` over `file://` with web security on
(`main.js`: `contextIsolation: true`, `nodeIntegration: false`, no `webSecurity: false`).
Two natural alternatives were therefore rejected on concrete grounds:

| Option | Verdict |
|---|---|
| `<use href="assets/icons/radix/sprite.svg#rix-gear">` | **Blocked.** Chromium treats each `file://` origin as distinct, so an external SVG subresource referenced by `<use>` is refused by the same-origin policy — the icon would silently not render. |
| `<img src="assets/icons/radix/gear.svg">` | **Wrong.** A referenced SVG cannot honour `currentColor`, so it could not follow the button's text colour, the hover `filter:brightness()`, or the disabled dim. It would need a second asset per theme. |
| **Inline `<svg>`** — **chosen** | Static, zero JavaScript, zero subresource fetch, guaranteed to render, honours `currentColor`. |

This also matches the brief's guidance to "prefer a static SVG asset approach … without
introducing additional JavaScript" — **no JavaScript was added at all.**

### 5.2 The mechanism

Three centralised CSS rules in `index.html` (inside the existing `/* ===== Actions ===== */`
block, so the styling stays scoped to the Action Bar):

```css
/* Radix icon system — inline SVG glyphs, currentColor-driven (Phase 2b-1).
   15px matches the .ic emoji box so button size is unchanged.
   .rix-flip mirrors directional/reading-order glyphs under RTL.
   See assets/icons/radix/README.md */
.rix{flex:none;display:block;color:inherit;fill:currentColor;}
.abtn .ic .rix{width:15px;height:15px;}
[dir="rtl"] .rix-flip{transform:scaleX(-1);}
```

Emitted markup per button (the existing `<span class="ic">` wrapper is retained):

```html
<span class="ic"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="…" fill="currentColor"/></svg></span>
```

Why this needs almost no new CSS:

- `.ic` was already `inline-flex` with `flex:none` + centring, and `.abtn` is `inline-flex`
  with `gap:9px` — so the SVG drops into the exact slot the emoji occupied. The existing
  `.abtn .ic{font-size:15px}` set the old glyph box; `15px` on `.rix` reproduces it.
- `fill="currentColor"` + `color:inherit` makes each glyph take the button's text colour, so
  the pre-existing `.abtn:hover{filter:brightness(1.1)}` and `button:disabled{opacity:.5}`
  apply to the icon **automatically**, with no icon-specific hover/disabled rules.
- `aria-hidden="true"` keeps the glyph decorative — the button's Arabic label remains the
  accessible name. No label was replaced by an icon.
- No `innerHTML`, no `eval`, no template strings: the markup is static, so no HTML-injection
  surface is introduced.

`sprite.svg` ships as the canonical catalog of the 12 `<symbol>`s and is documented as
ready for `<use>` if a future renderer ever allows it; it is deliberately **not** referenced
by `index.html` for the reason above.

### 5.3 Verified properties

| Requirement | Evidence |
|---|---|
| Works without React | ✅ no React in repo; `deps = {"electron-updater"}`, `dev = {"electron","electron-builder"}` unchanged |
| Works offline | ✅ inline; the only asset is the stylesheet already present |
| Works inside Electron | ✅ rendered in the real app under `file://` (§7) |
| `currentColor` | ✅ `iconFill === btnColor` on all 12, both themes (§7.1/§8) |
| Consistent dimensions | ✅ all 12 = **15×15 px**, `cssWidth/cssHeight = 15px` |
| CSS styling | ✅ driven by `.rix` / `.rix-flip` |
| RTL-aware | ✅ `exit` and `bar-chart` mirror; others deliberately not (§9) |
| No network requests | ✅ no `http(s)://` introduced; `get-printers`/`print-ticket` are the app's own existing calls |
| No unsafe injection | ✅ static markup only |
| No interference | ✅ 12 `<script>` blocks byte-identical (§12) |

---

## 6. Exact Action Bar emoji → SVG mapping

The 12 buttons of `<div class="actions">` (index.html ~1788). **Only the decorative glyph
inside `<span class="ic">` changed** — label, `class`, `data-perm`, `onclick`, order, and
disabled/visibility behaviour are untouched.

| # | Action | Label (AR) | Emoji → Radix glyph | `rix-flip` |
|---|---|---|---|---|
| 1 | `manualSave()` | حفظ | 💾 → **`download`** | — |
| 2 | `requestRestart()` | إعادة تعيين اليوم | 🔄 → **`reload`** | — |
| 3 | `printTodayReport()` | طباعة تقرير اليوم | 🖨️ → **`file-text`** | — |
| 4 | `openChangePass()` | تغيير كلمة السر | 🔑 → **`lock-open-1`** | — |
| 5 | `malahyLogout()` | تسجيل الخروج | 🚪 → **`exit`** | **yes** |
| 6 | `malahyChangeMyPass()` | كلمة المرور الخاصة بي | 🔐 → **`lock-closed`** | — |
| 7 | `openHistory()` | السجل | 📋 → **`clipboard`** | — |
| 8 | `openGameMgmt()` | إدارة الألعاب والتذاكر | 🎮 → **`cube`** | — |
| 9 | `openReports()` | التقارير والإحصائيات | 📊 → **`bar-chart`** | **yes** |
| 10 | `openEmployees()` | الموظفون | 👥 → **`group`** | — |
| 11 | `openDailyReg()` | التسجيل اليومي للموظفين | 🕐 → **`clock`** | — |
| 12 | `openSettings()` | الإعدادات | ⚙️ → **`gear`** | — |

Selection notes:

- **Print → `file-text`, not a printer.** Radix Icons has **no** printer glyph (verified
  against the complete 332-icon set, §14.1). The button prints *today's report*, so the
  document glyph is the closest honest representation. The brief's "Print → Printer" was
  explicitly an example, not a mandate.
- **Games/tickets → `cube`.** Radix has no controller and no ticket glyph. `cube` reads as a
  discrete sellable item and stays distinct from all other glyphs in the bar.
- **Employees → `group`** (two figures), not `person` — the label is plural.
- **The two password buttons stay distinguishable:** changing *another* credential keeps an
  **open** padlock, your *own* credential keeps a **closed** one — mirroring the old 🔑/🔐
  distinction, now with a clearer metaphor.

---

## 7. Dark theme result — **PASS**

Captured in the real application after a genuine `admin`/`1234` login through the app's own
login form, with the real `preload.js`, `database.js`, `users.js`, `permissions.js` hosted
against an isolated `userData` copy (no production data touched; print/export stubbed exactly
as in 2a).

| Check | Result |
|---|---|
| Icons present | ✅ `rixCount = 12`, `missingAssets = 0` |
| No broken/placeholder icons | ✅ 12/12 paths rasterize; `getTotalLength()` = 66–148 (real geometry) |
| Glyph pixels present | ✅ 12/12 contain pixels in the button's text colour (coverage 2.1 %–16.6 %) |
| `currentColor` on dark | ✅ `fill == color` on all 12 |
| Ghost buttons | `rgb(237,238,240)` = `--ink` (dark) |
| Save button | `rgb(6,35,25)` — dark ink on the green fill |
| Restart button | `rgb(255,255,255)` — white on the red fill |
| Consistent size | ✅ all 15×15 px |
| Vertical alignment | ✅ icon centre == label centre for all 12 (**delta 0 px**) |
| Icon↔label spacing | ✅ **9 px** on all 12 (equals `.abtn{gap:9px}`) |
| Hover | ✅ real mouse-move put the Reports button in `:hover`; button lifts + brightens, icon inherits |
| Disabled | ✅ `button:disabled{opacity:.5}` dims icon + label together (no icon-specific rule needed) |
| Button geometry | unchanged (`btnH = 55 px` on every button) |
| Layout shift / clipping / overflow | ✅ none — same 15 px slot the emoji occupied |
| Text legibility | ✅ labels intact, readable, never truncated |
| **Console errors** | ✅ **0** |

Polarity check (PNG decoded via `nativeImage`): `p50 = 31`, dark-pixel fraction **0.885** —
correctly dark, no inversion.

**Dark theme: PASS.**

---

## 8. Light theme result — **PASS**

Reached using the app's **own** `toggleTheme()`, confirmed `data-theme="light"`.

| Check | Result |
|---|---|
| Theme applied | ✅ `data-theme="light"`, `body` background `rgb(244,250,255)` = Phase 2a light `--bg` |
| `currentColor` re-resolves | ✅ ghost-button icons `rgb(28,32,36)` = Phase 2a light `--ink` `#1c2024` — **the same glyph flips from light ink to dark ink purely via tokens** |
| Save / restart buttons | ✅ `rgb(6,35,25)` and `rgb(255,255,255)` unchanged (hard-coded button colours, as in 2a) |
| Screenshot genuinely differs from dark | ✅ 27 079 B vs 26 767 B (the earlier identical pair was a harness bug, §14.2) |
| Polarity | ✅ `p50 = 237`, light-pixel fraction **0.889** |
| Size / spacing / alignment | ✅ identical to dark (15×15, 9 px, delta 0) |

No Phase 2a colour token was touched, so light-theme contrast is exactly what 2a certified.

**Light theme: PASS.**

---

## 9. RTL result — **PASS**

`<html lang="ar" dir="rtl">`. The bar is `display:flex`, so icon placement follows logical
order automatically.

| Check | Result |
|---|---|
| Document direction | ✅ `dir = "rtl"` |
| Icon on the **leading** (right) side in RTL | ✅ `iconsLeadingInRtl = true` for all 12 |
| Mirrored glyphs | ✅ `exit` and `bar-chart` → `transform = matrix(-1, 0, 0, 1, 0, 0)` |
| Non-directional glyphs | ✅ `transform = none` (no accidental mirroring) |
| Selected correctly for this locale | ✅ `exit` arrow points **left** in RTL ("the way out"); `bar-chart` ascends **left**, matching right-to-left reading order |
| Deliberately **not** mirrored | `reload` (cyclic refresh — not mirrored per Material/Fluent RTL guidance), `download` (vertical motion only) |
| Symmetric glyphs untouched | `file-text`, `lock-open-1`, `lock-closed`, `clipboard`, `cube`, `group`, `clock`, `gear` |
| No text overflow / clipping | ✅ none |

The flip is one centralised rule, `[dir="rtl"] .rix-flip`, so an LTR locale would render the
unmirrored glyph automatically.

**RTL: PASS.**

---

## 10. Button functionality result — **PASS**

### 10.1 Every button triggers its original action

Each handler was wrapped with a recording spy (so nothing destructive ran), then all 12
buttons were clicked:

| Invoked | Expected | Match |
|---|---|---|
| `manualSave`, `requestRestart`, `printTodayReport`, `openChangePass`, `malahyLogout`, `malahyChangeMyPass`, `openHistory`, `openGameMgmt`, `openReports`, `openEmployees`, `openDailyReg`, `openSettings` | same 12 | ✅ **12/12** |

### 10.2 The real actions still work end-to-end

The five modal openers were then invoked for real (spies removed) and asserted to render:

| Action | Result |
|---|---|
| `openSettings()` | ✅ modal open, 2 584 chars rendered |
| `openReports()` | ✅ modal open, 691 chars |
| `openEmployees()` | ✅ modal open, 451 chars |
| `openHistory()` | ✅ modal open, 111 chars |
| `openGameMgmt()` | ✅ modal open, 562 chars |

Destructive/irreversible actions (`requestRestart`, `malahyLogout`, credential changes) were
deliberately **spied rather than executed** against live state; their wiring is proven by
§10.1 and their `onclick` attributes are proven byte-preserved in §12.

### 10.3 Keyboard, disabled, visibility

- `onclick` attributes, `class` lists and `data-perm` values are unchanged, so **keyboard
  activation (Enter/Space on a `<button>`), `:focus-visible` rings, and `disabled` handling
  are structurally untouched** — the icon is `aria-hidden` and adds no focusable element
  (`focusable="false"`).
- All buttons are `<button>` elements as before; no nesting was introduced.

### 10.4 Login and activation gates

- Activation: `malahy_activated` seeded in the isolated store; `activation.js` and the
  fail-closed boot/fallback logic ran unmodified.
- Login: the app's own `login.js` accepted `admin`/`1234`, dismissed the overlay, and the
  dashboard unlocked.
- `main.js` / `preload.js` untouched → the update gate (`FLOOR_VERSION = 2.5.1`) is unchanged.

**No JavaScript errors occurred at any point (0 console errors, verified after all
interactions).**

**Button functionality: PASS.**

---

## 11. Permission result — **PASS**

`perm-gate.js` gates on the `[data-perm]` **attribute** only
(`perm-gate.js:161` — `document.querySelectorAll("[data-perm]")`); it never inspects the
`.ic` content, so swapping the glyph cannot affect it. Verified at runtime by driving the real
gate:

| Session | Result |
|---|---|
| Cashier with **no** permissions | ✅ **4 visible / 8 hidden** — exactly the 8 `data-perm` buttons hidden: `dayReset`, `reportPrint`, `settings` ×2, `gameManage`, `reports`, `employeeManage` ×2 |
| …the 4 ungated buttons stay available | ✅ `حفظ`, `تسجيل الخروج`, `كلمة المرور الخاصة بي`, `السجل` (no `data-perm`) |
| Restore admin session + `applyVisibility()` | ✅ **0 hidden** — all 12 buttons return |

`data-perm` multiset is byte-identical to v2.5.1 (**10 attributes**, unchanged), so the
admin/cashier permission model is exactly as before.

**Permission integrity: PASS.**

---

## 12. JavaScript integrity result — **PASS**

| Check | Method | Result |
|---|---|---|
| `<script>` blocks | extracted from both files, byte-compared | ✅ **12/12 byte-identical** to v2.5.1 |
| Main script | `script[11]` = **209 484 chars**, byte-identical | ✅ untouched |
| CSS custom-property **token names** | set-diff of every `--name:` in `<style>` | ✅ **103 → 103**, none added / removed / renamed |
| Phase 2a token **values** | reconstructed 2a file reproduces **78/75** | ✅ Phase 2a intact |
| Functions / variables renamed | — | ✅ zero (no script bytes changed) |
| `onclick` handlers | sorted multiset | ✅ **18 → 18** identical |
| `data-perm` attributes | sorted multiset | ✅ **10 → 10** identical |
| element IDs | sorted multiset | ✅ **57 → 57** identical |
| Action Bar `class` attributes | opening tags | ✅ **12/12** identical (`abtn save`, `abtn restart`, `abtn ghost` ×10) |
| Out-of-scope emoji | report/review modal glyphs (`📄`, `📊`, `🖨️`) | ✅ left untouched |
| Runtime errors | console during full login → click → theme → modal session | ✅ **0** |

Since the inline JS is byte-identical to v2.5.1, and Phase 2a was verified byte-identical to
v2.5.1, the renderer logic is unchanged from the Phase 2a baseline.

**Inline JavaScript integrity: PASS.**

---

## 13. Protected-file integrity result — **PASS`

SHA-256 of every protected file in the worktree, compared with the Phase 2a report §9 table
and `tests/protected-baseline.json`:

| File | Status vs Phase 2a |
|---|---|
| `windows/splash.html` | ✅ identical — `8bc85e73…` (28/24 vs HEAD, exactly as in 2a) |
| `windows/update.html` | ✅ identical — `d6be3dbd…` (8/6 vs HEAD, exactly as in 2a) |
| `main.js` | ✅ `58c7b415…` |
| `preload.js` | ✅ `cdf768f6…` |
| `database.js` | ✅ `04a687c4…` |
| `users.js` | ✅ `974a8653…` |
| `login.js` | ✅ `8ac89d8b…` |
| `permissions.js` | ✅ `a87acfc8…` |
| `perm-gate.js` | ✅ `0426a75c…` |
| `activation.js` | ✅ `47cee9f6…` |
| `update-gate.js` | ✅ `b9af3f2f…` |
| `accounts.js` | ✅ `61a2b84b…` |
| `recovery.js` | ✅ `8a70e47a…` |
| `package.json` | ✅ `d1f2551f…` (version 2.5.1, deps unchanged) |
| `package-lock.json` | ✅ `524b232d…` |
| `electron-builder.yml` | ✅ `2396654f…` |
| `assets/ticket/ticket-template.js` | ✅ `927d2d4a…` |
| `assets/ticket/ticket-template.svg` | ✅ `ea0f372f…` |
| `assets/vendor/qrcode.js` | ✅ `79ec86f8…` |
| `assets/report/daily-report.js` | ✅ `b4188bb8…` |
| `README.md`, `launch.js` | ✅ `4c9aa5ee…`, `7db341a1…` |
| `tests/**` (14 suites + `protected-baseline.json`) | ✅ `git diff` **empty** — no test touched |
| `index.html` | ⚠️ **changed** — required by this phase (icon CSS + 12 buttons). Script blocks byte-identical (§12). |

`tests/protected-baseline.json` re-hash reports **3 changed** files — `index.html`,
`windows\splash.html`, `windows\update.html` — the same three, for the same reasons, as in
Phase 2a. The other **13** are byte-identical.

**Protected systems: PASS.**

---

## 14. Issues and limitations

### 14.1 Radix Icons has no `printer` glyph (documented deviation)
The brief's example mapping "Print → Printer" cannot be honoured literally: the complete
332-icon Radix set (enumerated from the repository) contains no printer or print icon. The
button prints *today's report*, so **`file-text`** was chosen. Same reason, no controller and
no ticket glyph exists → **`cube`** for games/tickets. Both substitutions are semantic, and
the alternatives are documented in `assets/icons/radix/README.md`.

### 14.2 Two harness bugs found and fixed during validation (not app defects)
1. **First light-theme screenshot was identical to dark.** Cause: my probe referenced a
   harness-side `theme` variable inside a function stringified into the renderer
   (`ReferenceError: theme is not defined`), so `toggleTheme()` was never reached. Fixed by
   branching in the harness instead. The light capture is now genuinely different and the
   **console-error count is 0**.
2. **First per-icon pixel count reported one icon as 0 %.** Cause: a median-background
   threshold that the print button's lighter gradient position defeated. Re-measured against
   the button's *text* colour; the glyph was present all along. No app issue.

### 14.3 `capturePage()` returns cached frames in this environment
Electron 43.7.5 on this machine returns a stale compositor frame for repeated full-page
captures (verified: hiding all icons changed **0** page pixels while the DOM confirmed the
hide had applied). This is an **environment/compositor limitation, not an app or icon
defect**. It did not affect the pilot: icon paint was instead proven by **in-renderer canvas
rasterisation** of each live `<svg>` (12/12 load and paint, `getTotalLength()` 66–148) and by
per-icon pixel clips that **do** capture real content. Hover/disabled/dark/light screenshots
were each captured and verified as distinct.

### 14.4 Screenshots were reviewed by machine, not by eye
This environment cannot render images for visual inspection, so the dark/light screenshots
were verified by **decoding the PNGs** (luminance percentiles, dark/light pixel fractions,
colour histograms, per-band luminance profile) plus **DOM measurements** (geometry, computed
`fill`, computed `transform`, `Range`-based spacing, alignment). This is the same method the
Phase 2a report used in §13. The PNGs are kept for a human visual diff if wanted.

### 14.5 Print/export were stubbed
`get-printers → []` and `print-ticket → {ok:false}`, exactly as in the 2a harness. No physical
printing or sale was performed. The print path is provably unchanged: `main.js` and
`preload.js` are byte-identical and the inline JS that drives printing is byte-identical.

### 14.6 No verification of other UI areas — by design
The emoji inside the **report/review modal** buttons (created by JS at index.html ~3347–3382)
is **unchanged**: those are overlay buttons, not the main Action Bar, and the brief limits
this phase to the Action Bar. Recorded here so a later phase picks it up deliberately.

### 14.7 The 10 pre-existing test failures are unchanged
No remedy was attempted — fixing them means re-anchoring
`tests/protected-baseline.json` for the 3 intentionally-repainted files, which is a
release-time decision, not an experimental one. The guards are left honest.

---

## 15. Regression test results

All **14** existing suites were run with plain `node` (they need only Node built-ins plus the
app's own modules; **no package was installed** — `node_modules/` does not exist in the worktree).

**Total: 713 PASS / 10 FAIL** — an **exact match** with the documented Phase 2a baseline.

| # | Suite | Pass | Fail | vs 2a |
|---|---|---|---|---|
| 1 | `phase3b-auth` | 60 | **1** | same as 2a |
| 2 | `phase3b-ipc` | 15 | 0 | same |
| 3 | `phase3c1-dom` | 37 | 0 | same |
| 4 | `phase3c1-gate` | 44 | **4** | same as 2a |
| 5 | `phase3c1-ipc` | 19 | 0 | same |
| 6 | `phase3c1-session` | 30 | 0 | same |
| 7 | `phase3c2-baseline` | 58 | **5** | same as 2a |
| 8 | `phase3c2-gate` | 44 | 0 | same |
| 9 | `phase3c2-ipc` | 49 | 0 | same |
| 10 | `phase3c2-perms` | 39 | 0 | same |
| 11 | `phase3c3-accounts` | 92 | 0 | same |
| 12 | `phase3c3-ui` | 76 | 0 | same |
| 13 | `phase3c4-recovery` | 79 | 0 | same |
| 14 | `phase4-daily-report` | 71 | 0 | same |
| | **TOTAL** | **713** | **10** | ✅ **identical** |

### The 10 failures — every one already documented in Phase 2a §10

| # | Suite | Failing assertion (verbatim) | 2a class |
|---|---|---|---|
| 1 | `phase3b-auth` | `all protected files byte-identical to pre-phase baseline :: changed: index.html, windows\splash.html, windows\update.html` | **A+B** |
| 2 | `phase3c1-gate` | `protected file unchanged: windows\splash.html` | **B** |
| 3 | `phase3c1-gate` | `protected file unchanged: windows\update.html` | **B** |
| 4 | `phase3c1-gate` | `all protected baseline files intact (except the intended index.html)` | **B** |
| 5 | `phase3c1-gate` | `windows/splash.html + windows/update.html untouched` | **B** |
| 6 | `phase3c2-baseline` | `protected file unchanged: windows\splash.html` | **B** |
| 7 | `phase3c2-baseline` | `protected file unchanged: windows\update.html` | **B** |
| 8 | `phase3c2-baseline` | `all protected baseline files intact (except the intended index.html)` | **B** |
| 9 | `phase3c2-baseline` | `TEST 30d: splash + update windows untouched` | **B** |
| 10 | `phase3c2-baseline` | `no build artifacts created in this phase (dist/ unchanged, no new release files)` | **C** |

**Class key** (as defined in 2a): **A** historical/pre-existing on `main` · **B** intentional
Phase 2a token/splash/update repaint · **C** environment artifact · **D** actual regression.

- **A = 1** (the compound `index.html` half of #1) · **B = 8** (+ the windows half of #1) ·
  **C = 1** (#10: gitignored `dist/` + `opencode.json` absent in a fresh worktree).
- **D = actual regression = 0.**

**New failures introduced by Phase 2b-1: 0.** None of the 10 mentions an icon, `.rix`, the
Action Bar, or an SVG; all are the pre-existing protected-window guards and the
fresh-worktree environment artifact. No test file was modified, weakened, skipped, or
deleted — `git diff -- tests/` is **empty**.

---

## 16. Release & safety confirmation

| Item | Status |
|---|---|
| npm package installed | ✅ none — `node_modules/` does not exist in the worktree |
| `package.json` | ✅ unchanged (`d1f2551f…`, version **2.5.1**, deps unchanged) |
| `package-lock.json` | ✅ unchanged (`524b232d…`) |
| React introduced | ✅ none — no React anywhere; no `@radix-ui/react-icons` |
| Bundler / build added | ✅ none |
| Build performed | ✅ none — `dist/` absent; no installer created |
| Version bumped | ✅ none — still **2.5.1** |
| Commit | ✅ none — HEAD still `a3e790d` |
| Push | ✅ none |
| Merge to `main` | ✅ none |
| Publish | ✅ none |
| `main` worktree (`D:\Malahy`) | ✅ **untouched** — still `main` @ `1d32a21`, only the two pre-existing untracked items |
| Branch switched away | ✅ no — still `experiment/ui-redesign-radix` |
| Phase 2a changes discarded/reset | ✅ none — preserved and proven intact (§3.1) |
| Phase 2b-2 started | ✅ none — this pilot stops at the Action Bar |
| Other UI areas redesigned | ✅ none — single `index.html` block + 12 buttons |

**Revertibility:** restoring `index.html` to its Phase 2a state and deleting
`assets/icons/radix/` returns the project exactly to the Phase 2a baseline. The 2b-1 delta is
trivially revertible (21/13 lines in one file, plus a self-contained directory).

---

## 17. Final summary

| Item | Result |
|---|---|
| **Phase 2b-1 verdict** | **PASS** |
| Icons added | **12** (+1 sprite, +LICENSE, +README) |
| Action Bar buttons updated | **12 / 12** (emoji → inline Radix SVG) |
| Files changed | **1 modified** (`index.html`), **15 added** (`assets/icons/radix/*`) |
| Test results | **713 PASS / 10 FAIL** — identical to 2a; **0 new failures** |
| Dark theme | **PASS** |
| Light theme | **PASS** |
| RTL | **PASS** |
| Button functionality | **PASS** |
| Permission integrity | **PASS** |
| Protected systems | **PASS** |
| JavaScript integrity | **PASS** |
| **Safe to proceed** | **YES** |

---

## Audit trail

### Modified (1 file)
- `index.html` — 8 icon-CSS lines at 1068–1075 (inside `/* ===== Actions ===== */`); 12 Action Bar buttons at ~1789–1803 (emoji → inline SVG). Nothing else. Inline JS byte-identical.

### Added (15 files)
- `assets/icons/radix/*.svg` (12), `sprite.svg`, `LICENSE`, `README.md`

### Verified unchanged (Phase 2a preserved)
`windows/splash.html`, `windows/update.html` (2a hashes intact), `main.js`, `preload.js`,
`database.js`, `users.js`, `login.js`, `permissions.js`, `perm-gate.js`, `accounts.js`,
`recovery.js`, `activation.js`, `update-gate.js`, `package.json`, `package-lock.json`,
`electron-builder.yml`, `assets/ticket/*`, `assets/report/daily-report.js`,
`assets/vendor/qrcode.js`, `assets/icons/icon.ico`, `assets/icons/logo.png`,
`assets/images/logo.png`, `assets/vendor/radix-colors.css`, `README.md`, `launch.js`,
`tests/**` (14 suites + `protected-baseline.json`)

### Verification artifacts (outside the repo, harness workspace)
`C:\Users\slive\AppData\Local\Temp\opencode\shots-2b1\`
- `actionbar-dark.png`, `actionbar-light.png`, `actionbar-hover.png`, `actionbar-disabled.png`, `full-dark.png`
- `icon-00.png` … `icon-11.png` (per-icon clips)
- `report.json` — geometry, per-button `fill`/`color`/`transform`, handler firing, modal results, permission results, console errors, theme application
- `pixel-analysis.json`, `inspect.json` — decoded-luminance / histogram / per-band profile of the screenshots
- `glyph-coverage.json`, `raster-proof.json`, `spacing.json` — icon paint proof, per-icon spacing/alignment
`C:\Users\slive\AppData\Local\Temp\opencode\tests-2b1\` — 14 per-suite logs
`C:\Users\slive\AppData\Local\Temp\opencode\malahy-harness-data\` — isolated userData copy

---

## Next step (NOT started)

Phase 2b-2 — extending the icon system beyond the Action Bar (e.g. the report/review modal
buttons at index.html ~3347–3382 that intentionally kept their emoji in this phase). It must
reuse every protection proven here: existing JS byte-identical, IDs / `data-perm` / `onclick`
preserved, print documents untouched, RTL arrow direction verified.

**No Phase 2b-2 work was performed. Verification stopped here.**
