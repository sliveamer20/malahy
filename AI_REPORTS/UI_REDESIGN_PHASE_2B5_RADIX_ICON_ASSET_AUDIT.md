# PHASE 2B-5 — UI Redesign: Radix Icon Asset Expansion Audit

## READ-ONLY AUDIT REPORT

**Project:** Malahy (كوكي بارك) — ticketing & daily-account system
**Base:** v2.5.1 (tag `v2.5.1`, commit `a3e790d`)
**Branch:** `experiment/ui-redesign-radix` in git worktree `D:\Malahy-redesign`
**`main` worktree:** `D:\Malahy` — **pristine and untouched** (`main` @ `1d32a21`, only the two pre-existing untracked items)
**Previous phases:** 2a PASS · 2b-1 PASS · 2b-2 PASS · 2b-3 PASS · 2b-4 PASS (zero code changes)

> **AUDIT ONLY — NO ASSETS ADDED, NO CODE CHANGED.**
> The only file written in this phase is this report. **No SVG was added, `index.html` was not
> modified, no JavaScript or CSS was modified, `package.json` was not modified, and nothing was
> installed.** `index.html` remains at the exact end-of-2b-3/2b-4 footprint (**122 / 90** vs v2.5.1)
> and `assets/icons/radix/` still contains exactly **15** files.

---

## FINAL VERDICT: **A. EXPANSION RECOMMENDED** (small, tightly limited)

A shortlist of **6** additional Radix assets is recommended (§7). However, the most important
output of this audit is a **correction**: Phase 2b-4 assumed that most blocked emoji could be
unblocked simply by vendoring artwork. Verification against the official catalog shows that
**four of the seven candidates it listed do not exist in Radix Icons at all**, so no amount of
vendoring can ever migrate them (§5).

**No asset was vendored in this phase.**

---

## 1. Starting worktree state

| Item | Value |
|---|---|
| Worktree | `D:/Malahy-redesign a3e790d [experiment/ui-redesign-radix]` |
| HEAD | `a3e790d` = tag `v2.5.1` — unchanged |
| Branch | `experiment/ui-redesign-radix` (never switched away) |
| `main` worktree | `D:/Malahy 1d32a21 [main]`, pristine, only the two pre-existing untracked items |
| Phase 2a present | ✅ `assets/vendor/radix-colors.css`, report, `<link>` in `index.html` |
| Phase 2b-1 present | ✅ `assets/icons/radix/` (15 files), report, 12 Action Bar icons |
| Phase 2b-2 present | ✅ report, 3 modal mask rules |
| Phase 2b-3 present | ✅ report, banner icon + sizing rule |
| Phase 2b-4 zero code changes | ✅ confirmed — `index.html` numstat **122 / 90**, unchanged since 2b-3 |
| Icon count in app | ✅ **13** `class="rix` glyphs (2 with `rix-flip`) + **3** CSS mask rules |

**Environment note (carried from 2a → 2b-4):** `core.autocrlf=true` with no `.gitattributes`, so
plain `git status` lists 47 files as "modified" — a CRLF/LF display artifact. All measurements use
`git -c core.autocrlf=false`.

---

## 2. Current Radix asset inventory

`assets/icons/radix/` — **15 files** (12 glyphs + `sprite.svg` + `LICENSE` + `README.md`).
Every glyph carries the 3-line Radix attribution header and `fill="currentColor"`, and was verified
programmatically against the exact upstream `<path>` data.

| # | Filename | Bytes | Semantic meaning | Currently used? | Phase | Available for future use? |
|---|---|---|---|---|---|---|
| 1 | `bar-chart.svg` | 1276 | bar chart / statistics | ✅ **yes** — Action Bar "التقارير والإحصائيات" + Report modal "تصدير Excel" | 2b-1 + 2b-2 | ✅ yes |
| 2 | `clipboard.svg` | 831 | clipboard / record / log | ✅ **yes** — Action Bar "السجل" + Report modal "طباعة سجل المرتجعات" (×2) | 2b-1 + 2b-2 | ✅ yes |
| 3 | `clock.svg` | 1140 | clock / time | ✅ **yes** — Action Bar "التسجيل اليومي للموظفين" | 2b-1 | ✅ yes |
| 4 | `cube.svg` | 943 | 3-D box / discrete item | ✅ **yes** — Action Bar "إدارة الألعاب والتذاكر" | 2b-1 | ✅ yes |
| 5 | `download.svg` | 1181 | download / save | ✅ **yes** — Action Bar "حفظ" | 2b-1 | ✅ yes |
| 6 | `exit.svg` | 1207 | exit / log out (`rix-flip`) | ✅ **yes** — Action Bar "تسجيل الخروج" | 2b-1 | ✅ yes |
| 7 | `file-text.svg` | 1228 | document with text | ✅ **yes** — Action Bar "طباعة تقرير اليوم" + Report modal "تصدير PDF" | 2b-1 + 2b-2 | ✅ yes |
| 8 | `gear.svg` | 3057 | settings gear | ✅ **yes** — Action Bar "الإعدادات" | 2b-1 | ✅ yes |
| 9 | `group.svg` | 2379 | group of people | ✅ **yes** — Action Bar "الموظفون" | 2b-1 | ✅ yes |
| 10 | `lock-closed.svg` | 1030 | closed padlock | ✅ **yes** (×2) — Action Bar "كلمة المرور الخاصة بي" + password banner | 2b-1 + 2b-3 | ✅ yes |
| 11 | `lock-open-1.svg` | 927 | open padlock | ✅ **yes** — Action Bar "تغيير كلمة السر" | 2b-1 | ✅ yes |
| 12 | `reload.svg` | 1329 | refresh / reload | ✅ **yes** — Action Bar "إعادة تعيين اليوم" | 2b-1 | ✅ yes |
| — | `sprite.svg` | 13239 | 12 `<symbol id="rix-*">` catalog | ⚪ **not referenced** by `index.html` | 2b-1 | n/a — catalog artifact only (see §12) |
| — | `LICENSE` | 1063 | upstream MIT text | n/a | 2b-1 | n/a |
| — | `README.md` | 6517 | system documentation | n/a | 2b-1 | n/a |

**Key result: 12 / 12 glyphs are in use. Zero dead assets.** Nothing needs pruning.

---

## 3. Existing icon usage

| Surface | Phase | Mechanism | Icons used |
|---|---|---|---|
| Main Action Bar (`.actions`, 12 buttons, index.html 1810–1824) | 2b-1 | inline `<svg class="rix">` | all 12 |
| Report / Review modal (`.rep-foot` ×3, `.rev-head` ×1) | 2b-2 | CSS `mask-image` data-URI on `::after` | `file-text`, `bar-chart`, `clipboard` |
| Password reminder banner (`#passBanner`, line 1708) | 2b-3 | inline `<svg class="rix">` | `lock-closed` |

| Metric | Value |
|---|---|
| Inline `.rix` glyphs in `index.html` | **13** (12 Action Bar + 1 banner) |
| `rix-flip` glyphs | **2** (`exit`, `bar-chart` — directional, RTL-mirrored) |
| CSS `mask-image` rules | **3** (2b-2 modal) |
| Inline SVGs carrying `aria-hidden="true" focusable="false"` | **13 / 13** ✅ |
| Glyphs unused | **0** |

---

## 4. Remaining icon requirements

From the 2b-4 exhaustive audit (read-only, re-confirmed): `index.html` contains **309** glyph
occurrences — **299** inside `<script>` and **10** in static markup (one of which is a CSS-comment
arrow, not an icon). After 2b-3's migration the actionable remainder is:

| Emoji | Location (index.html) | Static? | Meaning required | Radix coverage today |
|---|---|---|---|---|
| ⬇️ | 1715 `span#updateIc` | static markup, **but JS-owned** | "update available / download" | `download` **already vendored** |
| ➖ | 1751 `.panel.exp .tag` | ✅ static | minus / expense | ❌ not vendored (`minus` exists upstream) |
| 💬 | 1765 `div#expEmpHint` | ✅ static | informational note / chat | ❌ not vendored (`chat-bubble` exists upstream) |
| 🎁 | 1775 `.panel.gift .tag` | ✅ static | gift | ❌ **no Radix equivalent exists** |
| ↳ 💵 | 1799 `.srow.sub .lab` | ✅ static | "of which cash" + sub-item arrow | ❌ **no Radix equivalent** (money / corner-down-right) |
| ↳ 💳 | 1800 `.srow.sub .lab` | ✅ static | "of which electronic" + sub-item arrow | ❌ **no Radix equivalent** (card / corner-down-right) |
| 💬 | 1849 `button#actWhatsapp` | ✅ static (activation overlay) | WhatsApp / contact | ❌ not vendored (`chat-bubble` exists upstream) |
| 🔑 | 2889, 4793 `el('h3')` headings | ❌ **JS-generated** | key / credential | ❌ **no `key` icon exists** |

Additional read-only finding (new in this audit): the **theme-toggle buttons** (`#themeToggle`,
`#autoThemeToggle`, lines 1696–1697) are **empty static containers whose icons are injected by
JavaScript** — `paintThemeBtn()` (line 4594) writes hand-authored, **non-Radix** 24×24 SVGs
(moon / sun / auto / auto-off). They are therefore category **C** and cannot be migrated to Radix
without modifying the frozen script.

---

## 5. Candidate classification

| Emoji | Class | Reason |
|---|---|---|
| ⬇️ `#updateIc` | **A — already covered** | `download` is vendored; blocked **only** by JS ownership (`index.html:6086` overwrites it at runtime) and by the frozen auto-update system. |
| ➖ expenses tile | **B — needs a new asset** | `minus` exists upstream, not vendored. Also scope-blocked: the tile lives in the frozen **Expenses** panel. |
| 💬 `#expEmpHint` | **B — needs a new asset** | `chat-bubble` exists upstream, not vendored. Also scope-blocked: inside the frozen **Expenses** panel. |
| 🎁 gifts tile | **F — no suitable Radix equivalent** | **Radix has no gift icon.** `heart` / `heart-filled` are not gifts; substituting would be unrelated. Permanently unmigratable. |
| ↳ 💵 cash row | **F — no suitable Radix equivalent** | **Radix has no money/banknote/coin/cash icon at all** (verified: the catalog contains zero matches for coin/currency/cash/money/bank/pay/wallet/receipt). Also `corner-down-right` does not exist. Permanently unmigratable. |
| ↳ 💳 electronic row | **F — no suitable Radix equivalent** | **Radix has no credit-card icon.** `card-stack` / `id-card` are not payment cards. Also no `corner-down-right`. Permanently unmigratable. |
| 💬 `#actWhatsapp` | **E — activation/security overlay** | Inside the frozen Activation overlay (excluded by rule), though `chat-bubble` would be an exact match. |
| 🔑 ×2 headings | **C — dynamic + F** | Generated by `el()` inside the frozen `<script>`; **and** Radix has no `key` icon. Double-blocked. |
| theme toggles | **C — dynamic** | Icons injected by `paintThemeBtn()`; hand-authored non-Radix artwork. |
| 12 Action Bar + 4 modal + 1 banner | **already migrated** | Verified intact. |

### 5.1 Correction to Phase 2b-4 §21.2 — important

2b-4 stated the remaining emoji "would be straightforward to migrate **if** the corresponding glyphs
were vendored", listing `minus`, `gift`, `chat-bubble`, `corner-down-right`, `banknote`,
`credit-card`, `key`. Verification against the **official 332-icon Radix catalog** shows:

| Candidate named in 2b-4 | Exists in Radix Icons? |
|---|---|
| `minus` | ✅ **EXISTS** |
| `chat-bubble` | ✅ **EXISTS** |
| `gift` | ❌ **DOES NOT EXIST** |
| `corner-down-right` | ❌ **DOES NOT EXIST** |
| `banknote` | ❌ **DOES NOT EXIST** |
| `credit-card` | ❌ **DOES NOT EXIST** |
| `key` | ❌ **DOES NOT EXIST** |

So **4 of the 7** candidates 2b-4 assumed could be unblocked by vendoring **cannot be, ever**.
The emoji they covered (🎁 💵 💳 ↳ 🔑) must be **permanently accepted as category F** and should not
be revisited in future phases. This also independently validates 2b-1's documented deviations
(`printer` ❌, `ticket` ❌ — both re-confirmed absent) and validates 2b-3's choice of `lock-closed`
for 🔑, since no `key` glyph exists.

---

## 6. Missing Radix assets

Missing artwork that **does** exist upstream and could eventually be vendored:
`minus`, `chat-bubble`, `plus`, `plus-circled`, `scissors`, `check-circled`, `cross-circled`,
`cross-1`, `person`, `calendar`, `trash`, `pencil-2`, `lightning-bolt`.

Permanent gaps in Radix Icons relevant to this application (**no substitute recommended**):

| Domain need | Radix coverage | Status |
|---|---|---|
| Money / cash / banknote | **none** | 💵 permanently unmigratable |
| Payment card | **none** (`card-stack`, `id-card` are not cards) | 💳 permanently unmigratable |
| Gift | **none** (`heart` is not a gift) | 🎁 permanently unmigratable |
| Printer | **none** | 🖨️ → `file-text` (2b-1 decision stands) |
| Ticket / game controller | **none** | 🎮 → `cube` (2b-1 decision stands) |
| Key | **none** (only `lock-closed`, `lock-open-1`, `lock-open-2`) | 🔑 → `lock-closed` (2b-3 decision validated) |
| Corner-down-right (sub-item arrow) | **none** (`corner-*` are box corners) | ↳ stays as text |

---

## 7. Proposed shortlist (6 icons — limit is 15)

Ranked by genuine usefulness. **None were vendored.**

| # | Official Radix name | Local filename | Priority | Why the current set cannot cover it | Future use | Static or dynamic | Integrable without changing frozen JS? | Semantic confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | **`plus`** | `plus.svg` | **MEDIUM** | No add/plus glyph vendored | The two **static** "إضافة" (add expense / add gift) buttons, index.html 1762 & 1783, are icon-less. *Note: this is an enhancement, not an emoji replacement.* | **static** | ✅ **Yes** — static markup + static `onclick` | **High** — unambiguous "add" |
| 2 | **`minus`** | `minus.svg` | **MEDIUM** | No minus glyph vendored | `.panel.exp .tag` (index.html 1751), the ➖ expenses tile — an exact match. | **static** | ⚠️ Markup yes, but the tile is in the frozen **Expenses** panel → needs a scope decision | **High** — exact glyph match |
| 3 | **`chat-bubble`** | `chat-bubble.svg` | **MEDIUM** | No chat glyph vendored | `#expEmpHint` (index.html 1765), the 💬 expense hint — exact match; also reusable for any future help/contact affordance. | **static** | ⚠️ Markup yes, but inside the frozen **Expenses** panel → needs a scope decision | **High** — exact glyph match |
| 4 | **`scissors`** | `scissors.svg` | **LOW** | No cutting/ticket glyph vendored | "قطع تذكرة" (cut ticket) is the app's core action; `cube` is only a documented stand-in. All ticket buttons are currently JS-generated, so this needs a future scope decision. | dynamic today | ❌ Not without a JS-scope decision | **Medium-high** — strong metaphor, but current usage is dynamic |
| 5 | **`check-circled`** | `check-circled.svg` | **LOW** | No success/confirm glyph vendored | Replaces the JS-generated ✓ marks in `accounts.js` / toasts if a future phase is allowed to touch them. | dynamic | ❌ Not without a JS-scope decision | **Medium** — ✓ semantics are generic |
| 6 | **`cross-circled`** | `cross-circled.svg` | **LOW** | No close/dismiss glyph vendored | Replaces the ✕ close glyphs (e.g. `.rep-xbtn`, index.html 1849 area) if a future phase may edit JS-generated markup. | dynamic | ❌ Not without a JS-scope decision | **Medium** — ✕ semantics are generic |

**Explicitly NOT recommended** (verified as unnecessary or inappropriate):

| Icon | Why not |
|---|---|
| `download` | **already vendored** — covers the ⬇️ update glyph; the blocker is JS ownership, not artwork. |
| `key` | **does not exist** in Radix. |
| `gift`, `banknote`, `credit-card`, `corner-down-right` | **do not exist** in Radix. |
| `person` | `group` already covers the plural "الموظفون" correctly (2b-1). |
| `calendar` | `clock` already covers "التسجيل اليومي"; swapping would be a redesign, not a fix. |
| `id-card` / `card-stack` | Would be an **unrelated substitute** for 💳 — forbidden. |
| `heart` / `heart-filled` | Would be an **unrelated substitute** for 🎁 — forbidden. |

---

## 8. Priority summary

| Priority | Icons | Count |
|---|---|---|
| **HIGH** | — (none) | 0 |
| **MEDIUM** | `plus`, `minus`, `chat-bubble` | 3 |
| **LOW** | `scissors`, `check-circled`, `cross-circled` | 3 |

No candidate rates HIGH because every one is either (a) an optional enhancement rather than an
emoji replacement (`plus`), or (b) blocked behind a scope decision on frozen UI / frozen JavaScript
(the other five).

---

## 9. Official Radix icon names — verification method

Verification was performed **read-only**, with **no asset downloaded and nothing written to the
repository**:

- The official catalog listing of `packages/radix-icons/icons/` in the upstream `radix-ui/icons`
  repository was read as **metadata only** (directory listing of file names). **No `.svg` file was
  fetched, and no artwork was downloaded or stored** — consistent with §7 ("Do NOT download
  anything during this phase").
- The listing enumerated **332 icons**, which exactly matches the figure recorded independently in
  the Phase 2b-1 report ("the full 332-icon Radix set"). This is a strong cross-check.
- Every name proposed in §7 was confirmed present; every name in §5/§6 marked "DOES NOT EXIST" was
  confirmed absent.
- All **12** currently vendored filenames were confirmed to exist upstream with identical names —
  independently re-confirming 2b-1's authenticity claim.
- No icon name in this report is invented: each is either confirmed present or explicitly marked
  **NO EXACT RADIX MATCH**. No icon from another library is recommended anywhere.

---

## 10. Semantic justification

| Icon | Justification |
|---|---|
| `plus` | Universally read as "add"; the two "إضافة" buttons perform adds. Highest-confidence mapping available. |
| `minus` | Visually and semantically identical to the ➖ it would replace. Zero interpretation risk. |
| `chat-bubble` | The canonical speech balloon for 💬; used for an informational hint, which is exactly a message. |
| `scissors` | "قطع تذكرة" literally means *cut a ticket*; scissors is the literal, domain-accurate metaphor. |
| `check-circled` | Conventional success/confirmed mark; a close visual relative of the ✓ currently used. |
| `cross-circled` | Conventional dismiss/close mark; matches the ✕ currently used in modal close buttons. |

For every *rejected* candidate the reason is recorded in §5/§7 — in each case the Radix alternative
would have been an **unrelated substitute**, which the phase rules forbid.

---

## 11. License / source verification

| Item | Finding |
|---|---|
| Upstream project | Radix Icons — `radix-ui/icons`, `packages/radix-icons` (published as `@radix-ui/react-icons`) |
| License | **MIT** |
| Copyright | **(c) 2022 WorkOS** |
| Vendored `LICENSE` | ✅ verbatim upstream MIT text (21 lines), byte-unchanged |
| Per-file attribution | ✅ all **12** glyphs carry the 3-line Radix attribution header |
| Validity of future additions | ✅ **Any future Radix glyph is covered by the exact same single MIT license file** already in the repository. The license is per-package, not per-icon, so **adding icons introduces no new licensing obligation and no new legal risk** — the existing `LICENSE` continues to cover the whole expanded set. |
| Required practice for additions | Keep the 3-line attribution header in each new `.svg` (MIT notice retention), keep `viewBox="0 0 15 15"` and `fill="currentColor"`, vendor the **unmodified** upstream path, and regenerate `sprite.svg`. |
| Compliance with §7 | ✅ **No download occurred.** Only catalog file *names* were read as metadata; no SVG artwork was fetched or stored; the application was never made to access any URL. |

---

## 12. Recommended future asset structure

**The existing structure is sufficient. No restructuring is required.**

```
assets/icons/radix/
  <radix-icon-name>.svg      # one canonical glyph per file, upstream name verbatim
  sprite.svg                 # generated catalog of <symbol id="rix-<name>">
  LICENSE                    # upstream MIT text (covers the whole set)
  README.md                  # system documentation
```

**Naming convention (recommended, already in use — keep it):**

- Filename = **the exact upstream Radix icon name**, verbatim, lowercase kebab-case, `.svg`
  (e.g. `chat-bubble.svg`, `check-circled.svg`). Never rename or abbreviate — the filename is the
  provenance link back to upstream.
- **Keep the directory flat.** Sub-folders are unnecessary at this scale (12 → 18 glyphs) and would
  break the documented "drop the upstream `.svg` here" workflow.
- One glyph per file, always `width="15" height="15" viewBox="0 0 15 15"` with a single
  `<path fill="currentColor">` — this is what makes the 2b-2 CSS-mask path and the 2b-1/2b-3 inline
  path both work without conversion.
- **No change was made to the structure in this phase**, as required.

**Note on `sprite.svg`:** it is a generated catalog and is **not referenced by `index.html`** —
`<use href="sprite.svg#…">` is blocked under `file://` (documented in 2b-1 §5.1 and 2b-2 §14.2).
It should be **regenerated** when icons are added so the catalog stays truthful, but it must never
become a runtime dependency.

---

## 13. Protected-system verification

**Confirmed NOT modified** (SHA-256 prefix compared to the values published in 2b-1/2b-2/2b-3/2b-4):

**22 / 22 protected files byte-identical.**

| Group | Status |
|---|---|
| `main.js`, `preload.js`, `database.js`, `users.js`, `login.js`, `permissions.js`, `perm-gate.js`, `activation.js`, `update-gate.js`, `accounts.js`, `recovery.js` | ✅ identical |
| `package.json` (version **2.5.1**), `package-lock.json`, `electron-builder.yml` | ✅ identical |
| `assets/ticket/ticket-template.{js,svg}`, `assets/vendor/qrcode.js`, `assets/report/daily-report.js` | ✅ identical |
| `README.md`, `launch.js`, `windows/splash.html`, `windows/update.html` (Phase 2a state) | ✅ identical |
| `tests/**` (14 suites + `protected-baseline.json`) | ✅ untouched |

Business systems — Sales, Tickets, QR, Printing, Reports, Returns, Gifts, Expenses, Shifts, Payroll,
Employees, Authentication, Permissions, Recovery, Activation, Auto-update, Database, Storage, IPC,
Electron security: **none were modified, and none were executed against production data.** This
phase performed **no** application run at all — it was a pure static audit.

---

## 14. Git / file integrity verification

| Item | Status |
|---|---|
| Source-code changes | ✅ **ZERO** — `git diff --numstat -- index.html` = **122 / 90**, identical to the end-of-2b-3/2b-4 state |
| SVG additions | ✅ **ZERO** — `assets/icons/radix/` still contains exactly **15** files (12 glyphs + `sprite.svg` + `LICENSE` + `README.md`) |
| Existing SVG modifications | ✅ **ZERO** — spot-check hashes unchanged (`bar-chart` A4B28AF7, `clipboard` 0228D743, `file-text` A9F98AEF, `lock-closed` 9D020380, `gear` AE7F8272) |
| Package changes | ✅ **ZERO** — `package.json` / `package-lock.json` byte-identical; nothing installed; `node_modules/` still absent |
| Version changes | ✅ **NONE** — still `2.5.1` |
| CSS changes | ✅ **ZERO** |
| JavaScript changes | ✅ **ZERO** |
| Directory creations | ✅ **NONE** |
| Commits | ✅ **NONE** — HEAD still `a3e790d` |
| Pushes / merges / publishes | ✅ **NONE** |
| Builds / installers | ✅ **NONE** — `dist/` absent |
| Branch switched | ✅ **NO** — still `experiment/ui-redesign-radix` |
| `main` worktree | ✅ **UNTOUCHED** — `main` @ `1d32a21`, only the two pre-existing untracked items |
| Phase 2a / 2b-1 / 2b-2 / 2b-3 implementations | ✅ **UNCHANGED** — 13 inline `.rix` glyphs, 3 mask rules, all CSS contracts intact |
| New files created | ✅ **exactly one** — this report |

---

## 15. Final recommendation

### Verdict: **A. EXPANSION RECOMMENDED** — limited to 6 assets, all MEDIUM/LOW priority

**Recommended shortlist (in priority order), for a future, separately-approved asset phase:**

1. **`plus`** — MEDIUM — the only candidate usable on **static, non-frozen** markup today (the two
   "إضافة" buttons). An enhancement rather than an emoji replacement.
2. **`minus`** — MEDIUM — exact match for the static ➖ expenses tile; requires a scope decision
   because the tile sits in the frozen Expenses panel.
3. **`chat-bubble`** — MEDIUM — exact match for the static 💬 expense hint; same scope caveat.
4. **`scissors`** — LOW — the honest metaphor for the app's core "قطع تذكرة" action; currently only
   reachable behind a JS-scope decision.
5. **`check-circled`** — LOW — future replacement for JS-generated ✓ marks.
6. **`cross-circled`** — LOW — future replacement for JS-generated ✕ close glyphs.

**Do not vendor** `download` (already present), and do not attempt `gift`, `key`, `banknote`,
`credit-card` or `corner-down-right` — **they do not exist in Radix Icons**, and the emoji they
covered (🎁 💵 💳 ↳ 🔑) should be permanently recorded as **category F**.

### If the recommendation is not accepted

**"No expansion needed" is a defensible outcome.** The current 12 icons already give **100 % usage
coverage** of every surface that can be legally migrated, and the entire migration programme is
effectively complete. Vendoring `plus`/`minus`/`chat-bubble` would yield icons that stay **unused**
until a separate scope decision unlocks frozen UI, and the remaining five proposed icons are all
LOW priority and JS-blocked. In that case the correct action is simply to **close the icon-migration
programme** and record the permanent Radix gaps listed in §6.

### Recommended next steps (not performed)

1. Record §5/§6 as the authoritative "permanent gap" list so future phases stop re-investigating
   🎁 💵 💳 ↳ 🔑.
2. Update `assets/icons/radix/README.md` §6/§7 with the confirmed "no such icon" facts — a
   documentation-only change that would prevent repeated dead-end audits.
3. If expansion is approved later: vendor only the 3 MEDIUM icons, regenerate `sprite.svg`, and
   update the README mapping table — leaving all `index.html` changes to a separate, scoped phase.

---

## Audit trail

### Modified
**NONE.** `index.html` unchanged (122 / 90). No asset, CSS, JS, or package file modified.

### Added
- `AI_REPORTS/UI_REDESIGN_PHASE_2B5_RADIX_ICON_ASSET_AUDIT.md` (this report — the only file written)

### Read (never modified)
`assets/icons/radix/*` (15 files), `index.html`, `assets/vendor/radix-colors.css`, all 22 protected
files (hash-verified), all 14 test suites, and all five prior phase reports.

### Verification method
Static file analysis only — no application launch, no database access, no production data touched,
no network asset download. Radix icon names were verified against the official upstream catalog
listing (metadata read only).

### Verification artifacts (outside the repo, harness workspace)
`C:\Users\slive\AppData\Local\Temp\opencode\audit-2b5\`
- `inventory.js` + `inventory.txt` — per-file asset inventory with attribution/currentColor checks
  and exact usage mapping (inline vs 2b-2 mask) derived by matching each glyph's upstream path data
  against `index.html`
- Official Radix catalog listing (332 icon names) was read as metadata only; used to confirm the 6
  proposed names and the 5 confirmed non-existent names.

---

## STOP

**No assets were added. No recommendations were implemented. Phase 2b-6 was NOT started.**