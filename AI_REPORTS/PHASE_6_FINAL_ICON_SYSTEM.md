# Phase 6 — Final Icon System + Splash Version Correction

**Project:** Malahy (`D:\Malahy`) — production `main`
**Release in tree:** v2.5.2 · **Branch:** `main` · **HEAD before and after:** `18acba6`
**Phase status:** **PASS**
**Regression:** **722 PASS / 1 FAIL** before → **722 PASS / 1 FAIL** after (identical)
**Files changed:** `index.html` · `windows/splash.html` · `tests/protected-baseline.json` (one hash) · **new** `assets/icons/lucide/`
**Protected logic files: 26 / 26 byte-identical** (only `splash.html` differs, deliberately)
**No build. No version bump. No commit. No tag. No push. No GitHub release.**

---

## 1. Starting baseline

| Check | Result |
|---|---|
| Branch | `main` ✅ |
| Version | `2.5.2` ✅ |
| Tests | **722 PASS / 1 FAIL** ✅ (the historical `phase3b-auth` `index.html` difference) |
| `AI_REPORTS/PHASE_5_BASELINE_REPAIR.md` | present (14 603 B) |
| `AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md` | present (27 465 B) |
| `git status` | `index.html` (Phase 4 clock CSS), `tests/protected-baseline.json` (Phase 5), 3 untracked reports |

Pre-existing untracked paths, not created or touched here: `AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md`, `qa-ticket-renders/`.

---

## 2. SVG architecture decision

**Decision: inline `<svg>`, one icon family (Lucide outline), for every newly migrated icon.**

Before choosing, Phase 6 **re-tested Phase 4's central claim by measurement** rather than by eye, using per-pixel ink-coverage analysis (`capturePage` → `toBitmap` → luminance histogram, at 3× device scale, on the real `index.html` in Electron). A host is *invisible* only when its ink coverage falls below the noise floor.

### Phase 4's claim is **not reproducible**

| Shipped icon | ink (dark) | ink (light) | Verdict |
|---|---|---|---|
| Action Bar `bar-chart` | 15.9 % | 15.9 % | renders |
| Action Bar `clock` | 7.3 % | 7.3 % | renders |
| Action Bar `gear` | 10.4 % | 10.4 % | renders |
| Expenses tile `minus` | 10.0 % | 34.7 % | renders |
| Add-expense `plus` | 19.0 % | 19.0 % | renders |
| `exp-emp-hint` chat bubble | 14.8 % | 14.8 % | renders |
| `.rep-foot` mask icon 1/2/3 | 12.9 / 15.9 / 11.6 % | same | render |
| `.rev-head` mask icon | 11.6 % | 11.6 % | renders |

**Both shipped techniques work.** Phase 4's "mask-image and `fill="currentColor"` don't render in Electron" was an artefact of screenshot-based inspection — stale frames and eyeballing 15 px glyphs. A thin `minus` bar read as "an empty box"; a scaled-down capture hid thin strokes.

### Why inline SVG anyway

- `index.html` is served over `file://` with web security on, so `<use href="…#id">`, `<img src="*.svg">` and external mask subresources are blocked by the file-origin policy and cannot honour `currentColor`. Inline markup is the only form that inherits the real text colour.
- It needs no data-URI encoding and no mask subresource, so nothing can silently fail.
- `stroke="currentColor"` makes hover, disabled and both themes work with **zero** extra CSS and zero per-theme rules.
- It is inspectable in DevTools and greppable in source.

### Why one family

Radix (the existing 12-glyph set) is **filled**, 15×15. Lucide is **outline**, 24×24. Mixing a filled family with an outline family inside one icon row looks visibly wrong. So the whole Settings-modal group was migrated to **one** family rather than mixed. The existing Radix Action Bar is a separate component group and was left untouched.

Every icon verified live in the DOM: `15×15 px`, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `aria-hidden="true"`, `focusable="false"`, parent `.ic`.

---

## 3. Existing Radix icons audited

| Group | Selector | Result |
|---|---|---|
| Action Bar (12 icons) | `.actions .abtn .ic` | ✅ all render — bar-chart 15.9 %, clock 7.3 %, gear 10.4 % |
| Report modal buttons | `.rep-foot .abtn .ic` | ✅ render via `mask-image` (11.6–15.9 %) |
| Review modal | `.rev-head .abtn .ic` | ✅ renders via `mask-image` (11.6 %) |
| Password Reminder banner | `.pass-banner .ic` | ✅ renders (inline `.rix`) |
| Add buttons | `.add-btn > .rix` | ✅ renders (19.0 %) |
| Minus | `.panel.exp .tag > .rix` | ✅ renders (10.0 % / 34.7 %) |
| Chat bubble | `.exp-emp-hint > .rix` | ✅ renders (14.8 %) |

### 3.1 Radix icons converted to inline SVG

**None — and deliberately so.**

Step 3 said to convert any mask-based icon *"that can fail in Electron."* Measurement shows the mask-based icons **do not fail**. Converting them would be pure churn: it would rewrite working markup, re-introduce a fill/outline mix into the Reports modal, and risk regression for no measurable gain. The instruction's condition is not met, so no conversion was performed. This is reported rather than silently skipped.

---

## 4. Static emoji inventory

Phase 4's inventory was reused unchanged: **245 emoji-bearing lines, 65 distinct emoji**
(`index.html` 235, `accounts.js` 9, `assets/report/daily-report.js` 1), classified
A 3 · B 40 · C 129 · D 15 · E 58 · F 0.

This phase migrated **10** Category A/B icons — all inside `openSettings()`, all in dedicated `.ic` spans carrying no handler, no `id` and no `data` attribute.

---

## 5. Icons replaced — 10

| # | File : line | Emoji | Replacement | Source | Reason | Risk |
|---|---|---|---|---|---|---|
| 1 | `index.html:4555` | 🕐 | Lucide `clock` | `assets/icons/lucide/clock.svg` | Shift Settings heading; **mandated Goal 6**; emoji clock face is dark-on-dark in Dark Mode | none — decoration only |
| 2 | `index.html:4479` | 🖨️ | Lucide `printer` | `printer.svg` | Printing section; exact semantic match (Radix has **no** printer glyph, which is why v2.5.2 used `file-text`) | none |
| 3 | `index.html:4491` | 🔄 | Lucide `refresh-cw` | `refresh-cw.svg` | Program Updates section; exact match | none |
| 4 | `index.html:4504` | 🎨 | Lucide `palette` | `palette.svg` | App Appearance section; exact match | none |
| 5 | `index.html:4601` | 🏷️ | Lucide `tag` | `tag.svg` | Venue Identity section; exact match (Radix has **no** tag glyph) | none |
| 6 | `index.html:4623` | ⚙️ | Lucide `settings` | `settings.svg` | Settings dialog title; exact match | none |
| 7 | `index.html:4484` | 🧾 | Lucide `receipt` | `receipt.svg` | Print-test-ticket button; exact match (Radix has **no** receipt glyph) | none — button text and `onClick` untouched |
| 8 | `index.html:4547` | ↩️ | Lucide `rotate-ccw` | `rotate-ccw.svg` | Restore default shift table; exact match | none |
| 9 | `index.html:4584` | ↩️ | Lucide `rotate-ccw` | `rotate-ccw.svg` | Restore default logo; exact match | none |
| 10 | `index.html:4611` | 🖼️ | Lucide `image` | `image.svg` | Choose new logo button; exact match | none |

Each is `el('span',{class:'ic',text:'…'})` → `el('span',{class:'ic'},[ricon('…')])`. Surrounding Arabic label text, `class`, `onClick`, `id` and `data-*` are byte-identical.

Every icon's existence was verified against the upstream repository **before** use. Radix's full catalogue (332 glyphs) was enumerated to check for an alternative first; Radix has no `gift`, `receipt`, `tag`, `printer` or `palette`.

---

## 6. Icons intentionally unchanged

**235 emoji-bearing lines remain.** Nothing outside the 10 above was touched.

| Reason | Lines | Examples |
|---|---|---|
| **C — business/data-dependent** | 129 | `empListRow()` `ic` field, all `repCard(...)` labels, `.gm-chip`/`.emp-chip` state chips, printable salary/weekly statements, ticket & gift-receipt HTML |
| **D — security / activation / update enforcement** | 15 | `paintSettingsUpdate()`, `initUpdateUI()`, `#updateIc`, `act-wa-btn`, all 9 in `accounts.js` |
| **E — text/content emoji inside a label** | 58 | `'⚠️ تم العدّ لكن تعذّر حفظ…'`, `'💵 كاش: '`, `©` in the printable report |
| **B/A — deliberately deferred** | ~13 | 🎟️ / 💳 ticket-discount rows (no honest SVG equivalent); 🎁 gifts tile (see below); reports-modal headings 📊🎁🧾 |
| **Protected file** | 9 | all of `accounts.js` |

**🎁 gifts tile (`index.html:1798`) — deliberate.** It is the one remaining Category A candidate. Its direct sibling `.panel.exp .tag` carries a **filled Radix** `minus`, and Radix has no gift glyph. Replacing only the emoji with a Lucide outline gift would trade an emoji/SVG mix for a **fill/stroke mix** inside one header row — visually worse. `gift.svg` is vendored and ready; the tile keeps its emoji until a filled gift glyph exists. Documented in `assets/icons/lucide/README.md` §6.

Emoji remaining inside `openSettings()`: **4 lines**, 3 distinct (`⛔` ×2 — shift/QR error text, `⚠️` — logo-restore warning, `💾` — Settings save button label). All are text content or Category D/E.

---

## 7. Source and provenance for every new icon

All nine glyphs live in **`assets/icons/lucide/`**:

`clock.svg` · `printer.svg` · `refresh-cw.svg` · `palette.svg` · `tag.svg` · `settings.svg` · `receipt.svg` · `rotate-ccw.svg` · `image.svg` · `LICENSE` · `README.md`

- **Upstream:** `lucide-icons/lucide`, file `icons/<name>.svg`, fetched over HTTPS.
- **Licence:** ISC, © 2026 Lucide Icons and Contributors — `LICENSE` stored verbatim, including the Feather-derived MIT section.
- **Integrity:** each vendored file keeps the upstream root attributes (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps/joins) plus a 4-line provenance header. **No path data was invented, hand-drawn, scaled or otherwise altered** — the migration script extracted the geometry verbatim and asserted it still begins with a drawing element and never re-declares `stroke`.
- **Runtime form:** the glyph geometry is additionally embedded inline in `index.html` (`LUCIDE_GLYPHS`) because `file://` blocks external references. The vendored files remain the source of truth and provenance record.
- **No packages installed.** No `lucide-react`, no React, no Ariakit / Ark UI / Park UI / Tailwind / Radix runtime, no bundler, no icon runtime.

The build script guards: `radix-ui/icons` was enumerated in full (332 glyphs) before choosing Lucide; no React wrapper is used or installed.

---

## 8. Splash version correction

**Determined first whether an existing safe mechanism exists — it does not.**

The splash window is created with **no preload**:

```js
// main.js:33
webPreferences: { devTools: false, contextIsolation: true },
```

so it cannot reach `app.getVersion()`. The existing channel (`ipcMain.on("app-version")` at `main.js:123`, exposed as `malahyApp.version()` by `preload.js:22`) is unreachable from that renderer. Making the splash dynamic would require editing protected `main.js` to attach a preload — a new IPC surface for the splash window. **Not done**, per Step 7.

**Correction applied — the minimum presentation-only change**, one literal:

```diff
-  <div class="version">الإصدار <span>2.5.0</span></div>
+  <div class="version">الإصدار <span>2.5.2</span></div>
```

`windows/splash.html` — 5 159 bytes, **1 line changed**, nothing else. Verified visually: the splash now renders **الإصدار 2.5.2**.

> **The value is intentionally static.** It is a build-time literal that must be bumped at each release. Nothing in this phase made it dynamic, and `main.js`, `preload.js`, IPC, the update gate and startup security are all untouched. The **v2.5.3 release phase must update this literal again.**

### 8.1 Baseline consequence — disclosed

`windows/splash.html` is byte-identity-guarded **three times per suite** in two suites. Measured by temporary patch-then-restore (restored byte-exactly, SHA-256 `7e9e9d03…` re-proved):

| Suite | Failures caused by the splash edit |
|---|---|
| `phase3b-auth` | already failing — additionally lists `windows\splash.html` |
| `phase3c1-gate` | `protected file unchanged: windows\splash.html` · `all protected baseline files intact` · `windows/splash.html + windows/update.html untouched` |
| `phase3c2-baseline` | `protected file unchanged: windows\splash.html` · `all protected baseline files intact` · `TEST 30d: splash + update windows untouched` |

That is **6 new failures → `716 PASS / 7 FAIL`**, i.e. Step 7 and Step 11 are mutually exclusive. **Authorised resolution:** re-anchor **only** that one digest, following the project's own precedent (v2.5.1 re-anchored `electron-builder.yml`, v2.5.2 re-anchored `package.json`):

```diff
-  "windows\\splash.html": "7e9e9d0337c87e8326e9b201cbad19960665fca3490e9d1fba6ac652d0e56110"
+  "windows\\splash.html": "7e6973cdfaddbcebc051fe27b08a83f5f15f41bc42f8fe6c9b673c3751b2fa46"
```

`7e6973cd…` is the actual SHA-256 of the corrected file, and is byte-identical to the value independently measured during the probe — **not** copied from a test expectation. No assertion was weakened; the guard is still strict byte equality.

---

## 9. Protected-file verification

Every tracked file compared against its `HEAD` blob.

**26 / 26 protected production files byte-identical:**
`main.js` · `preload.js` · `database.js` · `users.js` · `login.js` · `recovery.js` · `permissions.js` · `perm-gate.js` · `activation.js` · `update-gate.js` · `accounts.js` · `launch.js` · `package.json` · `package-lock.json` · `electron-builder.yml` · `.gitignore` · `README.md` · `windows/update.html` · `assets/ticket/ticket-template.js` · `assets/ticket/ticket-template.svg` · `assets/report/daily-report.js` · `assets/vendor/qrcode.js` · `assets/vendor/radix-colors.css` · `assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`

**`windows/splash.html` is the 27th and the only protected file that differs** — the mandated one-line version correction, with its digest re-anchored so the guards keep working.

Also confirmed: `update-gate.js` `FLOOR_VERSION` still `"2.5.1"` (line 14), untouched; `assets/icons/radix/*` byte-identical (the 12 glyphs, `sprite.svg`, `LICENSE`, `README.md`); all 14 test files byte-identical; `assets/icons/lucide/` is new and additive.

---

## 10. JavaScript integrity

**11 of 12 `<script>` blocks are byte-identical.** The 12th — the 209 KB application script — was diffed line-by-line with an LCS diff and audited:

| Metric | Value |
|---|---|
| HEAD lines / disk lines | 4 130 / 4 163 |
| **Unchanged lines** | **4 120** |
| Removed lines | **10** — all exactly the emoji call sites |
| Added lines | **43** — 32-line helper + 1 blank + 10 `ricon(...)` call sites |
| Unexpected removals / additions | **0 / 0** |
| Arithmetic | 4 120 + 10 = 4 130 ✅ · 4 120 + 43 = 4 163 ✅ |

The arithmetic closes exactly, which proves **no other line in the script moved**.

The single addition is `ricon(name)` — it creates one `<svg>` element and returns it. No state, no globals, no side effects, no behaviour, no network access.

| Multiset | HEAD | disk |
|---|---|---|
| `id="…"` | 57 | **57 identical** |
| `onclick="…"` | 18 | **18 identical** |
| `data-perm="…"` | 10 | **10 identical** |
| `<script src>` | 9 | **9 identical** |
| `<link rel=stylesheet>` | 1 | **1 identical** |

`index.html` CRLF line endings preserved (6 198 CRLF / 6 198 LF, zero bare LF).

No business logic touched: Sales, tickets, QR, printing, daily accounts, returns, gifts, expenses, payroll, advances, shifts, authentication, permissions, recovery, activation, update enforcement, database, storage, IPC, security — all byte-identical and all still covered by the passing regression.

---

## 11–14. Dark / Light / RTL / LTR QA

Real Electron launch of the genuine `index.html`, driven through the real `openSettings()` handler and real `MalahyPerm`, themed with the app's own `setTheme()` and direction set on `<html dir>`.

| # | Config | Icons visible | Contrast | Alignment / size | Clipping / overflow | Layout shift |
|---|---|---|---|---|---|---|
| 1 | **Dark + RTL** | 9/9 measured OK | ink 15.4–43.9 %, lum span 23→238 | 15 px, uniform | none | none |
| 2 | **Dark + LTR** | 9/9 measured OK | 15.7–26.5 % | 15 px, uniform | none | none |
| 3 | **Light + RTL** | 9/9 measured OK | 16.0–38.1 %, lum 33→254 | 15 px, uniform | none | none |
| 4 | **Light + LTR** | 9/9 measured OK | 15.2–38.1 % | 15 px, uniform | none | none |

The 10th (`refresh-cw`) was measured off-screen by the scroller but confirmed visually in `p6-updates-dark.png` — a clean outline refresh glyph next to "تحديثات البرنامج".

Specifically verified:
- **Shift Settings** — heading clock is now a crisp theme-adaptive outline clock in all four configs; the native time-picker clocks (Phase 4 fix) remain visible in Dark and unchanged in Light.
- **Action Bar, Report/Review, Password Reminder, Expenses, Gifts** — all audited, all rendering (§3).
- **No black-on-dark** and **no white-on-light** icon: `stroke="currentColor"` inherits the host text colour, so contrast follows the theme automatically.
- **Consistent stroke weight** — all nine share `stroke-width="2"` and one 24×24 viewBox.
- **RTL** — none of the nine glyphs is direction-bearing, so no `rix-flip` equivalent is needed and none was added. Verified no mirroring artefacts in either direction.
- **No layout shift** — `.ic>.luc{width:15px;height:15px}` reproduces exactly the box the emoji occupied (`.ic` is `font-size:15px`); `display:block` removes the inline baseline gap; `flex:none` prevents shrinking inside `.ic`'s inline-flex box.
- **Splash** — `p6-splash.png` renders "الإصدار 2.5.2".

---

## 15. Regression results

| Suite | Result |
|---|---|
| `phase3b-auth.test.js` | 60 / **1** |
| `phase3b-ipc.test.js` | 15 / 0 |
| `phase3c1-dom.test.js` | 37 / 0 |
| `phase3c1-gate.test.js` | 48 / 0 |
| `phase3c1-ipc.test.js` | 19 / 0 |
| `phase3c1-session.test.js` | 30 / 0 |
| `phase3c2-baseline.test.js` | 63 / 0 |
| `phase3c2-gate.test.js` | 44 / 0 |
| `phase3c2-ipc.test.js` | 49 / 0 |
| `phase3c2-perms.test.js` | 39 / 0 |
| `phase3c3-accounts.test.js` | 92 / 0 |
| `phase3c3-ui.test.js` | 76 / 0 |
| `phase3c4-recovery.test.js` | 79 / 0 |
| `phase4-daily-report.test.js` | 71 / 0 |
| **TOTAL** | **722 PASS / 1 FAIL** |

| | Before | After |
|---|---|---|
| PASS | 722 | **722** |
| FAIL | 1 | **1** |
| Δ | — | **0 / 0** |

**The single failure is the known historical one:**
`phase3b-auth.test.js :: FAIL all protected files byte-identical to pre-phase baseline :: changed: index.html`

No test was modified. `tests/protected-baseline.json` changed only in the one authorised `windows\splash.html` digest (§8.1). No assertion weakened, skipped, made conditional or removed.

---

## 16. Remaining limitations

1. **The splash version is a static literal.** It must be bumped again at the v2.5.3 release. Documented in-file and in §8.
2. **235 of 245 emoji lines remain.** Fully audited and classified; only 10 safe Category A/B icons were migrated. 129 are business/data-dependent, 58 are label text, 15 are security/activation/update, 9 are in protected `accounts.js`.
3. **🎁 gifts tile keeps its emoji** — its sibling tile uses a filled Radix glyph and Radix has no gift. Swapping one of the pair would create a fill/stroke mismatch.
4. **Reports modal is visually mixed** — mask-rendered Radix SVG icons in the footer buttons alongside emoji in the section headings. Converting the headings is Category E (emoji inside `text:` strings) and was out of scope; the footer icons were left alone because they demonstrably work.
5. **Phase 4's report is now known to contain a wrong conclusion** (that mask-image and `fill="currentColor"` fail in Electron). This report supersedes it on that point. Phase 4's *shipped* change — the `::-webkit-calendar-picker-indicator` fix — is verified good and remains in place.
6. **The `index.html` baseline entry is now the only stale digest** in `protected-baseline.json` (Phase 5 left it alone deliberately). It is the sole remaining test failure and needs an explicit decision, not another silent re-anchor.
7. **QA harness caveat:** activation and login were stubbed **outside the repository** (in-memory `malahyDB`, full-permission admin via the real `MalahyPerm.setSession`). The real `activation.js`, `login.js`, `users.js`, `main.js` and `preload.js` were never loaded, bypassed or modified in the repo. No production data touched.
8. **`assets/icons/lucide/gift.svg` is vendored but unused** — kept deliberately so the gifts tile can be migrated without another upstream fetch.
9. **Not done, as instructed:** no version bump, no build, no installer, no commit, no tag, no push, no GitHub release.

---

## 17. Git status

```
 M index.html                            (+77 / -13: helper + 10 call sites + CSS rule)
 M tests/protected-baseline.json         (  2 /  -2: splash.html digest only)
 M windows/splash.html                   (  1 /  -1: version literal only)
?? AI_REPORTS/PHASE_5_BASELINE_REPAIR.md
?? AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md    (pre-existing)
?? assets/icons/lucide/                     (new: 9 glyphs + LICENSE + README)
?? qa-ticket-renders/                       (pre-existing)
```

`tests/protected-baseline.json` carries both this phase's authorised `windows\splash.html` re-anchor and Phase 5's `package.json` correction.

---

*Phase 6 ends here. Nothing built, nothing versioned, nothing committed, tagged, pushed or published. The next phase is the dedicated v2.5.3 release, and must remember to bump `windows/splash.html` to `2.5.3`.*

---

## Appendix — root cause of Phase 4's incorrect conclusion

Phase 4 concluded that Electron could not render `mask-image` SVG data URIs, nor inline SVG painted with `fill="currentColor"`, and therefore reverted a 15-icon migration. Phase 6 disproved both claims with per-pixel ink-coverage measurement on the real application (§2). The root cause was **measurement error, not a browser defect**:

- Screenshots were captured from a window that intermittently returned **stale frames** (reproduced in Phase 4; fixed by `paintWhenInitiallyHidden` + `backgroundThrottling:false`).
- 15 px glyphs were judged **by eye** in downscaled captures. A filled `minus` is a thin bar and reads as an empty tile; thin strokes vanish at reduced scale.
- Several Phase 4 probes were **contaminated** by the production rules under test, so the "control" variants did not isolate the variable being claimed.

The durable lesson, now recorded here and reflected in the Phase 6 tooling: **verify icon rendering by measuring painted pixels, not by looking at pictures.**