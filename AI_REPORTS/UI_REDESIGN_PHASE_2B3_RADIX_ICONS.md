# PHASE 2B-3 — UI Redesign: Radix Icons — Next Static UI Surface

## FINAL VERIFICATION REPORT

**Project:** Malahy (كوكي بارك) — ticketing & daily-account system
**Base:** v2.5.1 (tag `v2.5.1`, commit `a3e790d`)
**Branch:** `experiment/ui-redesign-radix` in git worktree `D:\Malahy-redesign`
**`main` worktree:** `D:\Malahy` — **pristine and untouched** (still `main` @ `1d32a21`, only the two pre-existing untracked items)
**Previous phases:** Phase 2a (Radix Colors) — **PASS**; Phase 2b-1 (Radix icon system + Action Bar) — **PASS**; Phase 2b-2 (Report/Review modal icons) — **PASS**. All three left fully intact and proven intact.
**Scope:** ONE small static UI surface — the **password reminder banner**. Max 6 icons; **1 icon** migrated.
**No version bump, no build, no installer, no publish, no commit, no push, no merge. No Phase 2b-4 work started.**

---

## FINAL VERDICT: **PASS**

| Check | Result |
|---|---|
| New regression introduced | ✅ **0.** **713 PASS / 10 FAIL** — suite-by-suite identical to the 2a/2b-1/2b-2 baseline; all 10 failures byte-identical to the documented pre-existing set. |
| Inline JavaScript | ✅ **12/12** `<script>` blocks **byte-identical** to v2.5.1 (§11). |
| IDs / `onclick` / `data-perm` | ✅ multisets identical — **57** ids, **18** `onclick`, **10** `data-perm** (§12). |
| Icons render | ✅ paints in **both** themes, proven by decoded pixel analysis (§7, §8). |
| Dark / Light / RTL / hover / visibility | ✅ all verified with machine measurements (§7–§10). |
| Functionality | ✅ banner button handler fires; real `openChangePass()` opens the modal; visibility logic untouched (§10). |
| Phase 2b-1 (Action Bar) | ✅ **12/12** icons intact, markup + CSS **byte-identical** (§13). |
| Phase 2b-2 (Report/Review) | ✅ CSS block **byte-identical** (6195 chars); all 4 masked icons still correct at runtime (§14). |
| Protected systems | ✅ **22/22** protected files byte-identical to the published hashes (§15). |

**Safe to proceed: YES** (Phase 2b-3 stops here; Phase 2b-4 NOT started.)

---

## 1. Starting worktree state

| Item | Value |
|---|---|
| Worktree | `D:/Malahy-redesign a3e790d [experiment/ui-redesign-radix]` |
| HEAD | `a3e790d` = tag `v2.5.1` — unchanged by this phase |
| Branch | `experiment/ui-redesign-radix` (never switched away) |
| `main` worktree | `D:/Malahy 1d32a21 [main]`, pristine, only the two pre-existing untracked items |
| Phase 2a present | ✅ `assets/vendor/radix-colors.css`, `AI_REPORTS/UI_REDESIGN_PHASE_2A_RADIX_COLORS.md`, `<link>` in `index.html` |
| Phase 2b-1 present | ✅ `assets/icons/radix/` (13 `.svg` files), `AI_REPORTS/UI_REDESIGN_PHASE_2B1_RADIX_ICONS.md`, 12 Action Bar icons |
| Phase 2b-2 present | ✅ `AI_REPORTS/UI_REDESIGN_PHASE_2B2_REPORT_REVIEW_ICONS.md`, `.rep-foot`/`.rev-head` mask CSS |

**Environment note (carried from 2a/2b-1/2b-2):** `core.autocrlf=true` with no `.gitattributes`, so
plain `git status` lists 47 files as "modified" — a CRLF/LF display artifact. All measurements use
`git -c core.autocrlf=false`.

---

## 2. UI surface selected

**The password reminder banner — `#passBanner` (index.html ~1706–1710)** — a static, always-present
markup block directly below the top bar:

```html
<div class="pass-banner" id="passBanner">
  <span class="ic">🔑</span>                                    <!-- ← the one migrated icon -->
  <span>كلمة السر الحالية هي الافتراضية <b>1234</b> — يُفضّل تغييرها لكلمة سر خاصة بيك.</span>
  <button onclick="openChangePass()">تغيير كلمة السر الآن</button>
</div>
```

**Migrated: 1 icon** — the 🔑 inside `<span class="ic">` → vendored Radix **`lock-closed`**.

---

## 3. Why this surface was selected

A full, non-mutating audit of every emoji/symbol glyph in `index.html` (310 occurrences) was
classified as **static markup (11)** vs **inside `<script>` (299)**. Of the 11 static ones, the
surfaces that are *also* free of any JavaScript write were then evaluated:

| Static surface | Glyph(s) | JS writes the glyph? | Suitable existing Radix glyph? | Verdict |
|---|---|---|---|---|
| `#passBanner` banner | 🔑 | **No** — `updatePassBanner()` only toggles the `.show` class | ✅ **`lock-closed`** (credential/padlock) | **SELECTED** |
| `.panel.exp .tag` / `.panel.gift .tag` | ➖ 🎁 | No | ❌ needs `minus` / `gift` | deferred (§17.3) |
| Summary `.srow.sub` rows | ↳ 💵 💳 | No (JS writes only the numbers) | ❌ needs `corner-down-right` / banknote | deferred (§17.3) |
| `#expEmpHint` (expense hint) | 💬 | No | ❌ needs `chat-bubble` | deferred (§17.3) |
| `#actWhatsapp` (activation overlay) | 💬 | No (click handler only) | ❌ needs `chat-bubble` | deferred (§17.3) |
| `#updateIc` (update bar) | ⬇️ | **Yes** — `index.html:6086` `$('#updateIc').textContent=icon` | — | **excluded** (JS-owned glyph; migrating would be overwritten) |
| CSS comment text | `←` | n/a — inside a CSS comment | n/a | not an icon |

Reasons this banner was the right single surface:

1. **Genuinely static** — the glyph lives in hand-written markup, and the app's own
   `updatePassBanner()` (`index.html:3058`) only toggles `#passBanner`'s `.show` class; it never
   reads or writes the inner `.ic`. So the migration needs **zero** JavaScript changes.
2. **Correct existing artwork available** — 🔑 in a *password* reminder maps cleanly to the
   vendored **`lock-closed`** padlock, which the app already uses as its credential icon (the 🔐
   Action Bar button "كلمة المرور الخاصة بي"). A padlock is a standard credential metaphor; the
   glyph is not an unrelated stand-in.
3. **Well-isolated component** — it has its own CSS block (`.pass-banner`, ~10 rules) and is not
   entangled with any other control.
4. **No protected system is altered** — only one decorative glyph in static markup changes; the
   banner's visibility, its button, and its `openChangePass()` handler are untouched, and
   `assets/*`, auth, permissions, activation, and printing are all untouched.

**Scope note (per §2 "maximum 6 icons"):** only **1** icon was migrated — not because of effort, but
because every other static glyph either lacks a suitable vendored Radix equivalent or is owned by
JavaScript. Per §4/§5 the phase explicitly forbids inventing unrelated icons or forcing the
migration, so the remaining candidates are documented for a future phase (§17.3).

---

## 4. Number of icons migrated

**1 / 6 maximum** — 1 icon (🔑 in `#passBanner`).

No other surface met both the "static" and "suitable existing Radix glyph" conditions (§3 table).

---

## 5. Exact icon mappings

| Emoji | Where | Label (unchanged) | Radix glyph | Sourced from | Flip in RTL |
|---|---|---|---|---|---|
| 🔑 | `#passBanner` → `span.ic` | (banner text + button unchanged) | **`lock-closed`** | `assets/icons/radix/lock-closed.svg` (exact vendored path data, MIT attribution) | — (symmetric, not mirrored) |

Rendered inline, exactly as in 2b-1:

```html
<span class="ic"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="M7.50098 0.97831…" fill="currentColor"/></svg></span>
```

Reason for `lock-closed` (not another glyph): the banner's whole message is about the **login
password**; a padlock is the app's established credential icon and the closest available semantic
match to 🔑 for "credential". `lock-open-1` was deliberately *not* reused — 2b-1 reserves the open
padlock for "change a password" (`تغيير كلمة السر`), so using it here would collide with that
meaning. The full Radix catalog does contain a `key` glyph, but it was **not vendored in 2b-1**, and
§4 restricts this phase to existing vendored artwork, so `lock-closed` is used and the deviation is
recorded.

---

## 6. Files modified

Exactly **one** file; net change is a **CSS line + a markup-line replacement**:

| File | Change |
|---|---|
| `index.html` | (a) 1 new CSS line `.pass-banner .ic .rix{width:15px;height:15px;}`; (b) 1 markup line — the `<span class="ic">🔑</span>` replaced by the inline `<svg class="rix">…</svg>`. |

Proven footprint (via reconstruction that undoes only these two edits):

| Comparison | Result |
|---|---|
| pre-2b-3 vs v2.5.1 | **120 / 89** — exactly the Phase 2b-2 baseline (Phase 2b-1 & 2b-2 untouched) |
| current vs v2.5.1 | **122 / 90** |
| **2b-3 delta** | **+2 / −1** = one CSS insert + one markup-line replace — nothing else |

**No other file created or modified.** No file added to `assets/icons/radix/`. No `node_modules/`,
no package installed (§18).

---

## 7. Dark Theme result — **PASS**

Real application, activation + `admin`/`1234` login through the app's own forms, real
`preload.js`/`database.js`/`users.js`/`permissions.js` against an isolated `userData` copy (no
production data; print/export stubbed as in prior phases).

DOM measurements on `#passBanner`:

| Check | Result |
|---|---|
| Banner shown by the app | ✅ `class="show"`, computed `display: flex` (password still the default) |
| Icon element | ✅ `svg.rix` present; `viewBox="0 0 15 15"`; `aria-hidden="true"`; `focusable="false"` |
| Icon box | ✅ **15 × 15 px** (CSS `width/height = 15px`); ink bbox `11 × 13` inside the viewBox |
| `currentColor` | ✅ `fill == icon color == banner color == rgb(246, 217, 138)` (banner `#f6d98a`) |
| Emoji retired | ✅ `span.ic` `textContent` is now empty (no 🔑 glyph remains) |
| Alignment | ✅ icon centre vs label centre delta = **0 px** |
| Spacing | ✅ banner `gap: 12px` (unchanged) |
| Paint proof (decoded PNG) | ✅ background `rgb(38,40,38)`; glyph pixels `rgb(246,217,138)` ≈ **7.7 %** — monochrome, no emoji bleed |
| Banner geometry | ✅ `1120 × 65` unchanged |
| Console errors | ✅ **0** |

---

## 8. Light Theme result — **PASS**

Reached with the app's own `toggleTheme()`; `data-theme="light"`.

| Check | Result |
|---|---|
| Theme applied | ✅ `data-theme="light"` |
| `currentColor` re-resolves | ✅ `fill == icon color == banner color == rgb(171, 100, 0)` = the Phase 2a light `--banner-color` token — **the same glyph flips from light amber to dark amber purely via the 2a tokens**, exactly like the 2b-1/2b-2 icons |
| Paint proof (decoded PNG) | ✅ background `rgb(245,241,220)`; glyph pixels `rgb(171,100,0)` ≈ **7.7 %** (mean luminance 228.8 vs 54.9 dark — genuinely distinct captures) |
| Size / alignment / spacing | ✅ identical to dark (15 × 15, delta 0) |

No Phase 2a colour token was touched; light-theme contrast is exactly what 2a certified.

**Light theme: PASS.**

---

## 9. RTL result — **PASS**

`<html lang="ar" dir="rtl">`; the app is RTL-only.

| Check | Result |
|---|---|
| Document direction | ✅ `dir = "rtl"` |
| Icon placement | ✅ icon stays on the leading (right) side of the banner text — flex logical order |
| Mirroring | ✅ `transform: none` — `lock-closed` is symmetric (a padlock), so it is **deliberately not mirrored**, consistent with 2b-1 where `lock-closed` was also not flipped |
| Directional icons mirrored only when appropriate | ✅ the only directional glyph in the app (`bar-chart`, 2b-1/2b-2) remains mirrored; this padlock correctly is not |
| Text overflow / clipping | ✅ none; labels intact |

**RTL: PASS.**

---

## 10. Functional result — **PASS**

- **Handler fires:** clicking the banner button (`onclick="openChangePass()"`, attribute preserved)
  with a recording spy invoked `openChangePass` exactly **1/1** times.
- **Real action works:** calling the real `openChangePass()` opens the change-password modal
  (present, 145 chars rendered), then closes cleanly.
- **Visibility logic unchanged:** the banner is shown by the app's own unmodified
  `updatePassBanner()` (because the password is the default `1234`); removing `.show` hides it
  (`display: none`) and calling `updatePassBanner()` restores it — proving the function still
  governs the banner and the icon survives the toggle (`iconStillPresent: true`).
- **No JavaScript errors:** `consoleErrs` and `finalConsoleErrs` both empty (**0**) across login →
  banner interaction → modal → theme toggle → report modal.
- **Non-destructive:** only the change-password modal was opened and closed; no data was written, no
  printer contacted, no sale performed.

**Functionality: PASS.**

---

## 11. JavaScript integrity — **PASS**

| Check | Method | Result |
|---|---|---|
| `<script>` blocks | extracted from the working file and from `v2.5.1`, byte-compared | ✅ **12/12 byte-identical** |
| Functions / variables renamed or changed | — | ✅ **zero** (no script byte changed) |
| `change generated markup / event handlers / DOM logic` | — | ✅ none (the only edit is static markup + CSS) |

**Inline JavaScript integrity: PASS.**

---

## 12. IDs / onclick / data-perm integrity — **PASS**

Sorted-multiset comparison of the whole file against v2.5.1:

| Attribute | v2.5.1 | Phase 2b-3 | Result |
|---|---|---|---|
| element `id` | 57 | 57 | ✅ identical (`passBanner` kept) |
| `onclick` | 18 | 18 | ✅ identical (`openChangePass()` on the banner button kept) |
| `data-perm` | 10 | 10 | ✅ identical |

Text, order, disabled state, visibility, and keyboard behaviour of the banner button are unchanged;
the icon is decorative (`aria-hidden="true"`, `focusable="false"`), adds no focusable element, and no
label was replaced by an icon.

**IDs / onclick / data-perm integrity: PASS.**

---

## 13. Previous Phase 2b-1 integrity — **PASS**

- The `.actions` markup block (12 buttons) is **byte-identical** to the pre-2b-3 file.
- The 2b-1 icon CSS block (`.rix`, `.abtn .ic .rix`, `[dir="rtl"] .rix-flip`) is **byte-identical**.
- Runtime: all **12** Action Bar icons render, 15 × 15, `aria-hidden="true"`, `fill == button color`
  (e.g. save `rgb(6,35,25)`, restart `rgb(255,255,255)`, ghost `rgb(237,238,240)`).
- Total `class="rix` glyphs across the document: **13** = 12 (Action Bar) + 1 (new banner icon);
  `rix-flip` count unchanged at 2.

**Phase 2b-1 integrity: PASS.**

---

## 14. Previous Phase 2b-2 integrity — **PASS**

- The 2b-2 modal CSS block (comment through the RTL flip rule, **6195 chars**) is **byte-identical**
  to the pre-2b-3 file; the `.rep-foot`/`.rev-head` mask rules are byte-identical.
- Mask rule count unchanged (3 `mask-image` rules).
- Runtime (Report/Review modal opened via `openReports()`): all **4** modal icons render, each with a
  data-URI `mask-image`, `mask-mode: alpha`, 15 × 15, `background-color == button color`,
  `span.ic` `font-size: 0px` (emoji still suppressed), `bar-chart` mirrored
  (`matrix(-1,0,0,1,0,0)`), the others `transform: none` — identical to 2b-2.

The single new rule is scoped to `.pass-banner .ic .rix` and cannot match Action Bar or modal markup.

**Phase 2b-2 integrity: PASS.**

---

## 15. Protected-system integrity — **PASS**

**22 / 22 protected files byte-identical** (SHA-256 prefixes) to the values published in 2b-1/2b-2:

| Group | Status |
|---|---|
| `main.js`, `preload.js`, `database.js`, `users.js`, `login.js`, `permissions.js`, `perm-gate.js`, `activation.js`, `update-gate.js`, `accounts.js`, `recovery.js` | ✅ identical |
| `package.json` (version **2.5.1**), `package-lock.json`, `electron-builder.yml` | ✅ identical |
| `assets/ticket/ticket-template.{js,svg}`, `assets/vendor/qrcode.js`, `assets/report/daily-report.js` | ✅ identical |
| `README.md`, `launch.js`, `windows/splash.html`, `windows/update.html` (Phase 2a state) | ✅ identical |
| `tests/**` (14 suites + `protected-baseline.json`) | ✅ `git diff` empty — no test touched |
| `assets/icons/radix/*`, `assets/vendor/radix-colors.css` | ✅ untouched |

Phase 2a colour tokens untouched (measured on the icon in both themes, §7–§8).

**Protected systems: PASS.**

---

## 16. Regression test results

All **14** suites run with plain `node` (Node built-ins + the app's own modules only; no package
installed, `node_modules/` absent).

**Total: 713 PASS / 10 FAIL — an exact, suite-by-suite match with the 2a / 2b-1 / 2b-2 baseline.**

| # | Suite | Pass | Fail | vs baseline |
|---|---|---|---|---|
| 1 | `phase3b-auth` | 60 | **1** | same |
| 2 | `phase3b-ipc` | 15 | 0 | same |
| 3 | `phase3c1-dom` | 37 | 0 | same |
| 4 | `phase3c1-gate` | 44 | **4** | same |
| 5 | `phase3c1-ipc` | 19 | 0 | same |
| 6 | `phase3c1-session` | 30 | 0 | same |
| 7 | `phase3c2-baseline` | 58 | **5** | same |
| 8 | `phase3c2-gate` | 44 | 0 | same |
| 9 | `phase3c2-ipc` | 49 | 0 | same |
| 10 | `phase3c2-perms` | 39 | 0 | same |
| 11 | `phase3c3-accounts` | 92 | 0 | same |
| 12 | `phase3c3-ui` | 76 | 0 | same |
| 13 | `phase3c4-recovery` | 79 | 0 | same |
| 14 | `phase4-daily-report` | 71 | 0 | same |
| | **TOTAL** | **713** | **10** | ✅ **identical** |

The 10 failing assertions are **byte-identical** to the published pre-existing set: the Phase 2a
intentional `splash.html`/`update.html`/`index.html` repaint guards (9) plus the fresh-worktree
`dist/` environment artifact (1). **None** mentions a banner, an icon, `lock-closed`, or anything
introduced by this phase. No test was modified, weakened, skipped, or deleted — `git diff -- tests/`
is empty.

**New failures introduced by Phase 2b-3: 0.**

---

## 17. Issues and limitations

### 17.1 Only 1 of 6 permitted icons was migrated
This is a deliberate outcome, not a shortfall in effort. A complete audit found only 11 emoji glyphs
in static markup application-wide; of those, all but the 🔑 either lack a semantically-correct glyph
in the existing vendored Radix set, or are written by JavaScript at runtime. Per §4/§5 (no invented
icons, no forced migration) the phase stopped at the one honest, correct replacement.

### 17.2 The 🔑 → padlock substitution is a metaphor change (documented, intentional)
Radix's full catalog includes a `key` glyph, but it was not vendored in 2b-1 and §4 restricts this
phase to existing artwork. `lock-closed` — the app's established credential icon — is the closest
available semantic match and is the same glyph the 🔐 Action Bar button already uses. If a future
phase vendors `key.svg`, this one icon can be swapped with a pure data change.

### 17.3 Deferred static surfaces (candidates for a future phase)
None were touched. Each is listed with the semantic glyph it would need; all are static and
JS-safe, so they become migratable as soon as the corresponding artwork is vendored:

| Surface | Glyph(s) | Glyph needed | Notes |
|---|---|---|---|
| `.panel.exp .tag` (expenses header) | ➖ | `minus` | fixed 36×36 tile; `currentColor: var(--red)` |
| `.panel.gift .tag` (gifts header) | 🎁 | `gift` | fixed 36×36 tile; `currentColor: var(--gold)` |
| `.srow.sub` × 2 (summary rows) | ↳ | `corner-down-right` | directional — needs the `.rix-flip` RTL rule |
| `.srow.sub` × 2 (summary rows) | 💵 💳 | banknote / credit-card | mixed with Arabic text inside `.lab` |
| `#expEmpHint` (expense hint) | 💬 | `chat-bubble` | inline hint text, not a control |
| `#actWhatsapp` (activation overlay) | 💬 | `chat-bubble` | inside the **activation** overlay — recommend leaving to a dedicated, separately-approved phase |

### 17.4 `#updateIc` (⬇️) is JS-owned and was excluded
`index.html:6086` sets `$('#updateIc').textContent = icon` from the update gate, so the glyph is
replaced at runtime and is **not** a static icon. Migrating it would be overwritten and is coupled
to the protected auto-update system. Correctly left alone.

### 17.5 Two remaining 🔑 emoji are JS-generated
Lines 2889 and 4793 create 🔑 headings via `el('h3', …)` (recovery modal and a generic modal title).
They sit inside the frozen `<script>`, so per §3 they are **deferred because migration would require
modifying the frozen JavaScript** — no attempt was made.

### 17.6 Icon `.ic` box shrank 22px → 15px
The 🔑 emoji box was 22 × 16 px; the standardized Radix icon is 15 × 15. The **banner's own geometry
is unchanged** (Δwidth 0, Δheight 0 measured against an emoji-restored comparison), because the
banner's height/width are driven by the text and the button. Only the inner `.ic` box is smaller
(−7 px wide, −1 px tall), which is the intended normalization to the system-wide 15 px icon box — the
same effect 2b-1/2b-2 accepted. No clipping, no overflow, no wrap change.

### 17.7 Screenshots reviewed by machine, not by eye
This environment cannot display images for visual inspection, so all conclusions rest on decoded PNG
pixel analysis (`nativeImage`), DOM geometry, computed styles, and handler/visibility probes. PNGs
are retained for a human visual diff (§19).

### 17.8 The 10 pre-existing failures were not fixed
Fixing them requires re-anchoring `tests/protected-baseline.json` for the intentionally-repainted
files — a release-time decision, not an experimental one.

---

## 18. Release & safety confirmation

| Item | Status |
|---|---|
| npm package installed | ✅ none — `node_modules/` does not exist |
| `package.json` / `package-lock.json` | ✅ unchanged (`d1f2551f…` / `524b232d…`), version **2.5.1** |
| React / `@radix-ui/react-icons` / icon library | ✅ none — only the already-vendored SVG artwork |
| Bundler / build added · build performed | ✅ none — `dist/` absent, no installer |
| Version bumped | ✅ none |
| Commit / push / merge / publish | ✅ none — HEAD still `a3e790d` |
| `main` worktree (`D:\Malahy`) | ✅ **untouched** — `main` @ `1d32a21`, only the two pre-existing untracked items |
| Branch switched away | ✅ no |
| Phase 2a / 2b-1 / 2b-2 discarded or reset | ✅ none — preserved and proven intact (§13–§15) |
| Phase 2b-4 started | ✅ none |
| Other UI areas redesigned | ✅ none — one CSS line + one static markup line in one file |

**Revertibility:** reverting the single markup line to `<span class="ic">🔑</span>` and deleting the
single CSS line returns `index.html` exactly to its Phase 2b-2 state (verified by reconstruction:
120 / 89 vs v2.5.1).

---

## 19. Audit trail

### Modified (1 file)
- `index.html` — **+2 / −1**:
  - 1 new CSS line after `.pass-banner .ic{font-size:16px;}`:
    `.pass-banner .ic .rix{width:15px;height:15px;}   /* Radix glyph keeps the system-wide 15px box */`
  - 1 markup line in `#passBanner`: `<span class="ic">🔑</span>` → inline `<svg class="rix">` of the
    vendored `lock-closed` glyph.
  - Nothing else. Inline JS byte-identical.

### Added (0 files)
None. `lock-closed.svg` already existed in `assets/icons/radix/`.

### Verified unchanged
Phase 2a tokens + windows; Phase 2b-1 Action Bar (markup + CSS byte-identical); Phase 2b-2 modal CSS
(byte-identical, 6195 chars); `main.js`, `preload.js`, `database.js`, `users.js`, `login.js`,
`permissions.js`, `perm-gate.js`, `accounts.js`, `recovery.js`, `activation.js`, `update-gate.js`,
`package.json`, `package-lock.json`, `electron-builder.yml`, `assets/ticket/*`,
`assets/report/daily-report.js`, `assets/vendor/qrcode.js`, `assets/vendor/radix-colors.css`,
`assets/icons/radix/*`, `README.md`, `launch.js`, `tests/**`.

### Verification artifacts (outside the repo, harness workspace)
`C:\Users\slive\AppData\Local\Temp\opencode\shots-2b3\`
- `report.json` — full DOM measurements (icon box, aria/focusable, fill vs color, alignment delta,
  banner geometry, layout comparison), visibility test, handler spy + real modal open, theme results,
  hover, previous-phase runtime check, console errors (0)
- `banner-dark.png`, `banner-light.png` — per-icon region clips
- `full-dark.png`, `full-light.png` — full-window captures
- `clip.log` — decoded-PNG colour statistics proving paint in both themes
- `leak.log` — runtime re-check of the 12 Action Bar + 4 Report/Review icons (no CSS leakage)

`C:\Users\slive\AppData\Local\Temp\opencode\probe-2b3\`
- `inspect2.js` + `out2.txt` — the read-only emoji audit that classified all 310 glyph occurrences
- `recon.js` — pre-2b-3 reconstruction proving the +2/−1 footprint
- `prevcheck.js` — byte-comparison of the 2b-1 / 2b-2 blocks

`C:\Users\slive\AppData\Local\Temp\opencode\tests-2b3\` — 14 per-suite logs

`C:\Users\slive\AppData\Local\Temp\opencode\malahy-harness-data\` — isolated userData copy

---

## Next step (NOT started)

Further static surfaces remain available but each needs its artwork vendored first (§17.3), or a
separately-approved phase for the JS-owned `#updateIc` / JS-generated 🔑 headings. Any such phase must
reuse every protection established here: existing `<script>` blocks byte-identical, IDs /
`data-perm` / `onclick` preserved, RTL mirroring verified, protected systems untouched.

**No Phase 2b-4 work was performed. Verification stopped here.**