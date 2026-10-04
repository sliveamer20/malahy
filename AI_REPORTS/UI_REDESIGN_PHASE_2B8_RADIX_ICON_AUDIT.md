# PHASE 2b-8 — READ-ONLY AUDIT: `minus.svg` + `chat-bubble.svg`

**Phase:** 2b-8 — Radix icon migration audit (STRICT READ-ONLY)
**Nature:** Audit only. **Zero application changes.** No icon implemented.
**Date / time:** 2026-10-04, 19:41 → 19:56 (local, +03:00) · 2026-10-04T16:41Z → 16:56Z
**Baseline commit:** `a3e790d0488d408b3e637248b63eb4dad5482063` (`release: Malahy v2.5.1`)
**Branch:** `experiment/ui-redesign-radix`
**Worktree:** `D:\Malahy-redesign` (experimental) · `D:\Malahy` = main, **untouched**
**Verdict:** **PASS** — both icons can be migrated in one future isolated phase (recommendation: one phase for both). Neither target needs any JavaScript change.

---

## 1. Scope and method

Phase 2b-6 vendored three official Radix glyphs. Phase 2b-7 consumed exactly one of them
(`plus.svg` → the two static "إضافة" buttons). Two vendored assets therefore remain
**unused on purpose**:

| Asset | Size | SHA-256 (first 16) | Currently referenced by application source |
|---|---|---|---|
| `assets/icons/radix/minus.svg` | 531 B | `484F07489B2B8DB4` | **0** references |
| `assets/icons/radix/chat-bubble.svg` | 1013 B | `08A3D25575EBB3F5` | **0** references |

This phase answers one question only: *can either glyph be applied later without touching
behaviour, handlers, text, IDs, classes, data attributes, business logic, protected files,
JavaScript or dependencies?* Everything below is evidence for that question.

**Method (all read-only):** `git status` / `git rev-parse` / `git diff --stat`; full-text
search of every tracked and untracked file; byte/line-level reading of `index.html`
(6 127 lines, the only file that renders these two elements); reading of the expense and
employee JavaScript paths that surround them; reading of `perm-gate.js`, the print
stylesheet, both themes, and the whole `tests/` suite. No file was written except this
report. No build, no packaging, no dependency operation, no commit.

---

## 2. Git status — BEFORE and AFTER

### 2.1 Before

```
$ git -C D:\Malahy-redesign rev-parse HEAD
a3e790d0488d408b3e637248b63eb4dad5482063
$ git -C D:\Malahy-redesign rev-parse --abbrev-ref HEAD
experiment/ui-redesign-radix
$ git -C D:\Malahy-redesign status --porcelain=v1 --untracked-files=all
 M .gitignore
 M AI_REPORTS/PHASE_3A_SECURITY_AUTHORIZATION_AUDIT.md
 M AI_REPORTS/PHASE_3B_AUTHENTICATION_FOUNDATION.md
 M AI_REPORTS/PHASE_3C1_LOGIN_SESSION.md
 M AI_REPORTS/PHASE_3C2_PERMISSION_ENFORCEMENT.md
 M AI_REPORTS/PHASE_3C3_CASHIER_MANAGEMENT_PERMISSIONS.md
 M AI_REPORTS/PHASE_3C4_1_RECOVERY_BACK_BUTTON.md
 M AI_REPORTS/PHASE_3C4_2_WHATSAPP_CODE_PRIVACY.md
 M AI_REPORTS/PHASE_3C4_ADMIN_PASSWORD_RECOVERY.md
 M AI_REPORTS/PHASE_3_FINAL_SECURITY_QA.md
 M AI_REPORTS/PHASE_4_DAILY_ACCOUNT_REPORT_REORGANIZATION.md
 M README.md
 M accounts.js
 M activation.js
 M assets/report/daily-report.js
 M assets/ticket/ticket-template.js
 M assets/ticket/ticket-template.svg
 M assets/vendor/qrcode.js
 M database.js
 M electron-builder.yml
 M index.html
 M launch.js
 M login.js
 M main.js
 M package-lock.json
 M package.json
 M perm-gate.js
 M permissions.js
 M preload.js
 M recovery.js
 M tests/phase3b-auth.test.js
 M tests/phase3b-ipc.test.js
 M tests/phase3c1-dom.test.js
 M tests/phase3c1-gate.test.js
 M tests/phase3c1-ipc.test.js
 M tests/phase3c1-session.test.js
 M tests/phase3c2-baseline.test.js
 M tests/phase3c2-gate.test.js
 M tests/phase3c2-ipc.test.js
 M tests/phase3c2-perms.test.js
 M tests/phase3c3-accounts.test.js
 M tests/phase3c3-ui.test.js
 M tests/phase3c4-recovery.test.js
 M tests/protected-baseline.json
 M update-gate.js
 M users.js
 M windows/splash.html
 M windows/update.html
?? AI_REPORTS/UI_REDESIGN_PHASE_2A_RADIX_COLORS.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B1_RADIX_ICONS.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B2_REPORT_REVIEW_ICONS.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B3_RADIX_ICONS.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B4_RADIX_ICONS.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B5_RADIX_ICON_ASSET_AUDIT.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B6_RADIX_ASSET_VENDORING.md
?? AI_REPORTS/UI_REDESIGN_PHASE_2B7_RADIX_PLUS_BUTTONS.md
?? assets/icons/radix/            (LICENSE, README.md, 14 *.svg incl. minus.svg + chat-bubble.svg)
?? assets/vendor/radix-colors.css
```

`git diff --stat` (content-level, EOL-normalised) — the **only** three files with real
content differences vs. the baseline commit:

```
 index.html          | 225 +++++++++++++++++++++++---------------------
 windows/splash.html |  52 ++++++------
 windows/update.html |  14 ++--
 3 files changed, 169 insertions(+), 122 deletions(-)
```

(The remaining ` M` entries are `core.autocrlf=true` line-ending stat noise: `git diff`
reports no content delta for them. This is the pre-existing Phase 2a/3x state, not
something this phase produced.)

**Main worktree, untouched and verified:**

```
$ git -C D:\Malahy rev-parse HEAD
1d32a21e363c5c351a6fef81db64bcede37ceeb1
$ git -C D:\Malahy rev-parse --abbrev-ref HEAD
main
$ git -C D:\Malahy status --porcelain=v1 --untracked-files=all
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md
?? qa-ticket-renders/*.png      (11 pre-existing QA renders)
```
No tracked file in `D:\Malahy` is modified; the only entries are pre-existing untracked
artifacts that were already there before this phase.

### 2.2 After

`git status --porcelain=v1 --untracked-files=all` is **byte-identical** to §2.1, plus the
single new untracked deliverable:

```
?? AI_REPORTS/UI_REDESIGN_PHASE_2B8_RADIX_ICON_AUDIT.md
```

`HEAD` still `a3e790d0488d408b3e637248b63eb4dad5482063`; `git diff --stat` unchanged
(`index.html`, `windows/splash.html`, `windows/update.html` — same 169/122 counts).
`index.html` SHA-256 before and after the audit: `bf98e20fc39ddb5b2fef8a98faaf5ce18fd2d37ac3a51e1f91c08dbcccaadd96`
(identical — measured at the start and re-measured at the end).

---

## 3. Exhaustive search results

Search performed over the whole repository (`*.html`, `*.js`, `*.json`, `*.css`, `*.md`,
`*.svg`, `*.yml`), `node_modules` and `.git` excluded.

| Query | Hits in application source (`index.html`, `*.js`, `*.css`) | Hits in `AI_REPORTS/` (prose) |
|---|---|---|
| `minus.svg` | **0** | 8 (2b-3, 2b-4, 2b-5, 2b-6, 2b-7) |
| `chat-bubble` | **0** | 12 |
| `rix-minus` | **0** | 2b-6 only (sprite symbol) |
| `rix-chat-bubble` | **0** | 2b-6 only (sprite symbol) |
| `expEmpHint` | **1** — `index.html:1774` (the `id` in the markup itself) | 10 |
| `exp-emp-hint` (class) | **3** — CSS `index.html:917`, CSS `index.html:918` (`.exp-emp-hint b`), markup `index.html:1774` | 1 |
| `panel.exp` | **5** — all CSS (`:968`, `:987`, `:1000`, `:1021`) + `:1363` print rule mentions `.minus` class only | several |
| `class="tag"` | **2** — `index.html:1760` (exp), `index.html:1784` (gift) | — |
| `➖` (U+2796) | **9 code sites** — only **1** is our target (§5.6) | — |
| `💬` (U+1F4AC) | **3** — `1774` (target), `1858` (`#actWhatsapp`, activation overlay), report/JS strings | — |
| `innerText` | **0** anywhere in the app | — |
| `class:'tag'` / `class: "tag"` / `querySelector('.tag')` / `closest('.tag')` / `getElementsByClassName('tag')` | **0** | — |
| `rix` / `svg` / `icon` / `emoji` in `tests/**` | **0 icon assertions** (only `assets/ticket/ticket-template.svg` baseline hashes) | — |

Negative results that matter (each one removes a possible coupling):

- **`tests/**` never mentions `.tag`, `#expEmpHint`, `.exp-emp-hint`, `.rix`, any emoji, or
  any icon count.** No test asserts the presence or absence of these glyphs, so a future
  migration cannot break the regression suite. (Grep for `rix|svg|icon|emoji|➖|💬|المصروفات|expense`
  across `tests/` returns only permission-registry names such as `expenseAdd`,
  `expenseDelete`, DB fixtures with `expenses: [...]`, and the ticket-SVG baseline hash.)
- **`protected-baseline.json` line 2 stores a SHA-256 for `index.html`
  (`854cff97…`) which already does not match the current file** (`bf98e20f…`, changed by
  Phases 2a–2b-7). The enforcing tests (`phase3c2-baseline.test.js:28`,
  `phase3c1-gate.test.js:55`) already declare `const intended = { "index.html": true }`
  and **skip** that one file. So editing `index.html` is a tolerated, expected operation —
  but see §11.4 for the one caveat this creates.
- **No DOM scraping of the ledger exists.** `printTodayReport()` (`index.html:4235`)
  builds a plain data object and delegates to `printDayReportObj()` →
  `dayReportHTML(day, …)` → `window.malahyPrint.printTicket({html})`. The Expenses panel
  DOM is never printed and never parsed.

---

## 4. The established Radix icon contract (what a future phase must reuse)

From `index.html:1068–1083` (Phase 2b-1 / 2b-3 / 2b-7) and `assets/icons/radix/README.md`:

```css
.rix{flex:none;display:block;color:inherit;fill:currentColor;}
.abtn .ic .rix{width:15px;height:15px;}
[dir="rtl"] .rix-flip{transform:scaleX(-1);}          /* only for direction-carrying glyphs */
.add-btn>.rix{display:inline-block;vertical-align:middle;width:15px;height:15px;margin-inline-end:5px;}   /* 2b-7 */
.pass-banner .ic .rix{width:15px;height:15px;}       /* 2b-3 */
```

```html
<svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="…" fill="currentColor"/></svg>
```

Current inventory (measured, not quoted): **15** inline `<svg class="rix` glyphs in
`index.html` (12 Action Bar + 1 `#passBanner` + 2 `.add-btn`), of which exactly **2** carry
`rix-flip` (`exit`, `bar-chart`). `.rix` base rule and the three sizing rules above are
present and must stay byte-identical.

**Sizing is always supplied by a scoped CSS rule, never by `width`/`height` attributes on
the `<svg>`.** That is the single most important fact for this audit: a new glyph in a new
container needs **one new scoped CSS rule** — exactly what Phase 2b-7 did, and what
Phase 2b-3 did. Both targets below are in containers that have no sizing rule yet, so both
need one. This is CSS, not JavaScript, and it is presentation-only.

---

## 5. `minus.svg` — full analysis

### 5.1 The target

`index.html:1758–1765` (Expenses panel header), verbatim:

```html
    <div class="panel exp">
      <div class="panel-head">
        <div class="tag">➖</div>
        <div>
          <div class="ttl">المصروفات</div>
          <div class="desc">تُخصم من مبيعات الألعاب</div>
        </div>
      </div>
```

`index.html:1760` exactly: `        <div class="tag">➖</div>` — the glyph is
**U+2796 HEAVY MINUS SIGN**, no variation selector, no ZWJ, no combining marks.

### 5.2 What the element represents

The **category tile of the Expenses panel** — a fixed 36×36 rounded badge to the right
(RTL start) of the panel title "المصروفات" / "تُخصم من مبيعات الألعاب". Purely a visual
category marker. It carries no label text of its own.

### 5.3 Attribute / handler inventory (measured)

| Property | Value on `.panel.exp .tag` |
|---|---|
| `onclick` | **none** |
| event listeners | **none** — no `addEventListener`, no `on*` attribute, not a delegation target (no JS selector matches it) |
| `id` | **none** |
| `class` | `tag` only |
| `data-*` | **none** |
| `data-perm` | **none** (permission gate queries the `[data-perm]` **attribute** only — `perm-gate.js:161`) |
| `title` / `aria-*` / `role` / `tabindex` | **none** |
| focusable | no — a plain `<div>` with no tabindex; unreachable by keyboard |
| child nodes | exactly one: a text node `➖` |

### 5.4 CSS that styles it

```css
.panel-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;}          /* :964 */
.panel-head .tag{                                                                      /* :965 */
  width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:15px;flex:none;
}
.panel.exp .tag{background:rgba(251,113,133,.14);color:var(--red);border:1px solid rgba(251,113,133,.3);}  /* :968 */
```

Consequences for the swap:

- The tile's geometry is **hard-fixed** (`36×36`, `flex:none`) and its single child is
  centred by `place-items:center`. Replacing the text node with a sized SVG therefore
  **cannot move a single pixel of the panel header layout** — a stronger guarantee than
  2b-7 had to argue for a text-flow button.
- `color:var(--red)` is already declared and is **currently inert** (a colour emoji ignores
  `color`). With `fill="currentColor"` it becomes effective and theme-adaptive:
  `--red` → `--danger` → `--red-9` `#e5484d` (dark) / `--red-10` `#dc3e42` (light)
  (`index.html:54/58` and `:121/122`). This is precisely what 2b-3 (`currentColor: var(--red)`)
  and 2b-5 predicted for this tile.
- `font-size:15px` becomes unused once the text node is gone (the emoji's box). Harmless.

### 5.5 Static or dynamic?

**STATIC — 100 % hand-written markup.** Proof:

- The `<div class="tag">➖</div>` literal exists exactly twice in the document
  (`1760` expenses, `1784` gifts 🎁) and is produced by no code path.
- Grep for `class:'tag'`, `class: "tag"`, `querySelector('.tag')`, `closest('.tag')`,
  `getElementsByClassName('tag')`, `innerText` → **0 matches** in the whole app.
- `renderList('exp')` (`index.html:2572`) rewrites only `#expenseList`, never `.panel-head`.
- Nothing calls `.panel.exp` or `.tag` in JavaScript.

### 5.6 Does the glyph appear in multiple contexts?

The **character** ➖ appears at 9 code sites, but only **one** of them is this element:

| Line | Context | Is it `.panel.exp .tag`? |
|---|---|---|
| 1760 | `<div class="tag">➖</div>` — Expenses panel tile | ✅ **the target** |
| 2680 | `title:'➖ خصم تذاكر'` — dynamic permission-modal title | ❌ JS string |
| 2713 | `title:'➖ خصم تذكرة'` — dynamic permission-modal title | ❌ JS string |
| 4896 / 5150 / 5750 / 5843 | `repCard('➖ إجمالي الخصومات', …)` — dynamic report card | ❌ JS template |
| 5025 | `deductions:{ic:'➖', …}` — dynamic employee-deductions config | ❌ JS object |
| 5264 | `{ic:'➖', …}` — dynamic payroll operation row | ❌ JS template |
| 5767 | `'➖ الخصم و 🎁 المكافأة …'` — dynamic daily-registration note | ❌ JS string |

**The `.tag` element itself appears in exactly one place.** The other 8 sites are
JS-generated markup: changing them would require editing JavaScript (category **E**) and is
explicitly **out of scope**. A future phase must touch **line 1760 only** and must not
"helpfully" migrate the other ➖ occurrences.

### 5.7 Business-logic coupling — exhaustive

| Concern | Coupled? | Evidence |
|---|---|---|
| Expenses calculations | **No** | `totals()` derives from `state.expenses` / `state.gifts`. The tile is not an input and is never read. |
| Employee selection | **No** | `#expEmp` (`<select>`, `:1769`) is populated by `renderExpEmpOptions()` (`:4723`) and read in `_addItem()` (`:2765–2767`). The tile is a sibling of the whole `.add-row`, untouched. |
| Expense removal | **No** | `deleteItem(which,id)` is bound to `.item .del` buttons created by `renderList()` (`:2593`). The tile has no handler. |
| Totals | **No** | `#expTotal` (`:1778`) is a separate `<span>` written by `renderSummary()` (`:2604`). |
| Storage / DB | **No** | Item shape is `{id,desc,amount,isAdvance,empId,empName,ts}`; `archiveDay()` (`:2885`) and `printTodayReport()` (`:4249`) serialise `state`, never DOM. No `malahy_pos_state_v1` field derives from the tile. |
| Permissions | **No** | No `data-perm`; `perm-gate.js:161` selects `[data-perm]` only. Enforcement for expenses lives in `MalahyPerm.requirePerm('expenseAdd'/'expenseDelete')` inside the action functions — the tile plays no part. |
| Keyboard | **No** | Not focusable, no `tabindex`, no key handler. The only keyboard affordance nearby is `.add-btn::after` (an "Enter" CSS hint on the *button*, `:1083` comment) — untouched. |
| Accessibility | **Delta, no loss of meaning** | Today a screen reader may announce the emoji as "minus"/"heavy minus sign". An `aria-hidden="true"` SVG removes that announcement — identical to the treatment of all 15 existing `.rix` glyphs. The panel's accessible name is carried by the adjacent `.ttl` text "المصروفات", which is unchanged. Contrast improves/stays: the glyph takes `var(--red)` `#e5484d` on `rgba(251,113,133,.14)` over `--panel`. |
| Print path | **No** | `printTodayReport()` prints a generated HTML string, never this DOM. The `@media print` block (`:1361–1373`) affects only browser Ctrl+P of the window and does not hide `.tag`. Note `.panel.exp .tag{color:var(--red)}` beats the inherited `color:#111!important` on `.panel` (a child's own declaration always beats an inherited value), so the tile prints red — same as today. |
| Light theme | **No** | No `[data-theme="light"]` rule targets `.panel.exp .tag`; the token chain adapts automatically. |

### 5.8 Classification

- **A — static markup that can receive an inline SVG:** ✅ yes, verbatim, one line.
- **B — JS-generated:** ❌ no.
- **C — coupled to business/data logic:** ❌ no.
- **D — visual-only change is safe:** ✅ yes, plus **one new scoped CSS rule** for sizing.
- **E — would require a JavaScript change:** ❌ **no JS change required.**

### 5.9 Decision: **SAFE**

---

## 6. `chat-bubble.svg` — full analysis

### 6.1 The target

`index.html:1774`, verbatim (159 characters):

```html
      <div class="exp-emp-hint" id="expEmpHint">💬 لو اخترت موظفًا، المبلغ يُسجَّل <b>سلفة</b> (تُخصم تلقائيًا من راتبه الأسبوعي) بدل ما يكون مصروف عادي.</div>
```

The 💬 is **U+1F4AC** (surrogate pair `U+D83D U+DCAC`), immediately followed by a single
`U+0020` space, then the Arabic sentence, then `<b>سلفة</b>` (an inline `<b>`, must be kept).

### 6.2 What the element represents

A **static, informational hint** explaining that choosing an employee in `#expEmp` records
the amount as an advance ("سلفة") deducted from that employee's weekly salary. It is
advisory prose, not a control, not a label for an input, not a status region.

### 6.3 Attribute / handler inventory (measured)

| Property | Value on `#expEmpHint` |
|---|---|
| `id` | `expEmpHint` — **present, must be preserved byte-for-byte** |
| `class` | `exp-emp-hint` |
| `onclick` | **none** |
| event listeners | **none** — no JS reference of any kind |
| `data-*` / `data-perm` | **none** |
| `aria-*` / `role` / `tabindex` / `title` | **none** |
| focusable | no |
| JS references | **0** — `expEmpHint` occurs exactly **once** in the entire repository (its own `id` attribute). No `getElementById`, no `querySelector`, no template literal, no string concatenation, no test reference. |

### 6.4 Is it modified dynamically?

**No.** The element is created once by the HTML parser and is never touched again:

- It is **not** inside `#expenseList`, so `renderList()` (which does `box.innerHTML=''`,
  `:2575`) can never reach it.
- It is **not** inside `.add-row`, so nothing that clears the inputs can reach it.
- `renderAll()` (`:2615`) calls `renderGames`, `renderList('exp')`, `renderList('gift')`,
  `renderSummary`, `renderExpEmpOptions`, `updatePassBanner` — none of them targets it.
- `renderExpEmpOptions()` (`:4723–4733`) rebuilds `#expEmp`'s `<option>` list only. The hint
  is a static sibling that merely *describes* that select; it is not wired to it.

### 6.5 Is the icon inserted by a JS template/function?

**No.** There is no template, no `el()` call, no `innerHTML` assignment and no string
interpolation that produces this div or its 💬. It is 100 % literal markup.

### 6.6 Connection to employee / expense logic

**Presentation only.** The logic chain is:

```
#expEmp <select>  ──value──▶  _addItem('exp')            index.html:2754
                               empSel=$('#expEmp')      index.html:2765
                               empId/empFind(empId)     index.html:2766-2768
                               item.isAdvance / empId / empName / ts   index.html:2778+
                               recordEmployeeAdvance(...)              index.html:4735
```

`#expEmpHint` appears **nowhere** in that chain. Its text is authored prose; no code reads
`textContent`/`innerHTML` from it (and there is no `innerText` anywhere in the app).

### 6.7 Participation matrix

| Concern | Participates? | Evidence |
|---|---|---|
| Calculations | **No** | `totals()` / `renderSummary()` (`:2598`) read only `state` and write `#expTotal`, `#sumExpenses`, … |
| Validation | **No** | Validation lives in `_addItem()` (`:2757–2768`: `isNaN(amount)||amount<=0`, `empId&&!emp`). The hint is never consulted. |
| Storage | **No** | Nothing is written to `localStorage`/DB from this element; `state.expenses` carries `isAdvance/empId/empName/ts`, not the hint text. |
| Permissions | **No** | No `data-perm`; not matched by `perm-gate.js:161`. |
| Event handling | **No** | Zero handlers, zero listeners, zero selectors. |
| Accessibility | **Delta, no loss of meaning** | Today the emoji may be announced; with `aria-hidden="true" focusable="false"` it is hidden, exactly like the 15 existing `.rix` glyphs. The full Arabic sentence — including `<b>سلفة</b>` — remains the accessible content and is unchanged. The SVG inherits `color:var(--muted-2)` = `--slate-10` `#777b84` (dark) / `#80838d` (light), i.e. **the exact colour of the adjacent hint text**, so no new contrast question is introduced (2a already validated `--muted-2` as 11 px text). |
| Layout / text flow | **Needs one CSS rule** | `.exp-emp-hint{font-size:11px;color:var(--muted-2);margin:-6px 0 12px;line-height:1.6;}` (`:917`) is a plain block. `.rix` is `display:block` (`:1072`), so an unstyled inline SVG would break the sentence onto a second line. `display:inline-block;vertical-align:middle;width/height:12px;margin-inline-end:4px` restores single-line flow. |
| RTL | **No mirror needed** | `<html lang="ar" dir="rtl">` (`:2`). The icon sits at the paragraph start (right edge) either way; `margin-inline-end` puts the gap on the text side in both directions. `chat-bubble` carries no reading-order semantics (its tail is bottom-left), so `rix-flip` must **not** be added — mirroring a speech tail is a cosmetic opinion, and 2b-7 set the precedent that only direction-carrying glyphs get flipped. |
| Print path | **No** | Not part of `dayReportHTML()`; the `@media print` block does not hide `.exp-emp-hint`. |

### 6.8 Classification

- **A — static markup that can receive an inline SVG:** ✅ yes.
- **B — JS-generated:** ❌ no.
- **C — coupled to business/data logic:** ❌ no.
- **D — visual-only change is safe:** ✅ yes, plus **one new scoped CSS rule** for inline flow.
- **E — would require a JavaScript change:** ❌ **no JS change required.**

### 6.9 Decision: **SAFE**

### 6.10 Sibling `💬` occurrence — explicitly out of scope

`index.html:1858`: `<button class="act-wa-btn" id="actWhatsapp" type="button">💬 تواصل عبر واتساب</button>`
— inside the **activation overlay**. This is a *button with a click handler* (category
**C + E**) inside a **protected system** (Activation/update). It is **BLOCKED** and must be
left untouched. It is listed here only so that a future phase does not sweep it up.

---

## 7. Static vs dynamic — summary table

| Target | Line | Markup origin | Category | Verdict |
|---|---|---|---|---|
| `.panel.exp .tag` ➖ | 1760 | literal HTML | **A + D** | SAFE |
| `#expEmpHint` 💬 | 1774 | literal HTML | **A + D** | SAFE |
| `.panel.gift .tag` 🎁 | 1784 | literal HTML | A, but **no `gift` glyph exists** | out of scope (2b-5) |
| `#actWhatsapp` 💬 | 1858 | literal HTML, **has click handler**, activation overlay | **C + E** | BLOCKED |
| `title:'➖ …'` ×2 | 2680, 2713 | JS string | E | out of scope |
| `repCard('➖ …')` ×4 | 4896, 5150, 5750, 5843 | JS template | E | out of scope |
| `deductions:{ic:'➖'}` | 5025 | JS object | E | out of scope |
| payroll op row `ic:'➖'` | 5264 | JS template | E | out of scope |
| daily-reg note `'➖ …'` | 5767 | JS string | E | out of scope |

---

## 8. Business-logic coupling — summary

- **Neither target participates in any calculation, validation, storage, permission,
  event-handling or keyboard path.** Both are leaves of the DOM tree.
- **Neither target is an input to, or an output of, `state`.** All expense state flows
  through `state.expenses` → `totals()` → `renderSummary()` / `renderList()` /
  `archiveDay()` / `dayReportHTML()`, none of which touches `.panel-head` or
  `#expEmpHint`.
- **Neither target is referenced by any JavaScript identifier, selector, template or
  string.** This is the decisive fact: a change to static markup that no code can observe
  cannot alter behaviour.
- **The Expenses *system* is protected; the Expenses *panel's decorative chrome* is not.**
  Phase 2b-7 already established this boundary by shipping a Radix glyph inside the very
  same panel (`.panel.exp .add-btn`, `index.html:1772`) and passing. Both targets here sit
  in the same category: presentation-only nodes of a panel whose logic is untouched.
  The *logic* of Expenses (`_addItem`, `deleteItem`, `renderList`, `totals`,
  `recordEmployeeAdvance`, `archiveDay`) is **not** touched, referenced, reordered or
  reformatted by the recommended change.

---

## 9. Exact potential target locations

**Total: 2 lines of markup + 2 new CSS rules, all inside `index.html`. Nothing else.**

| # | File | Line | What |
|---|---|---|---|
| 1 | `index.html` | ~1084 (new, in the `<style>` block, immediately after the 2b-7 `.add-btn>.rix` rule) | 1 new scoped CSS rule for the tile glyph |
| 2 | `index.html` | 1760 | `<div class="tag">➖</div>` → `<div class="tag"><svg class="rix" …></svg></div>` |
| 3 | `index.html` | ~1085 (new) | 1 new scoped CSS rule for the inline hint glyph |
| 4 | `index.html` | 1774 | `💬 ` → `<svg class="rix" …></svg>` (text after it byte-identical) |

No other file. No asset change (`minus.svg` / `chat-bubble.svg` already exist and are
already the artwork source of truth). No `sprite.svg` change. No `assets/icons/radix/*`
change.

### 9.1 Glyph path data (verbatim from the vendored assets)

`minus.svg` (531 B) — the inner `<path>`, already `fill="currentColor"`:

```
M12.25 7C12.5261 7 12.75 7.22386 12.75 7.5C12.75 7.77614 12.5261 8 12.25 8H2.75C2.47386 8 2.25 7.77614 2.25 7.5C2.25 7.22386 2.47386 7 2.75 7H12.25Z
```

`chat-bubble.svg` (1013 B) — the inner `<path>`, already `fill="currentColor"`:

```
M12.7559 2.0127C14.0164 2.14082 15 3.20566 15 4.5V9.5C15 10.7943 14.0164 11.8592 12.7559 11.9873L12.5 12H11V14.5C11 14.7022 10.8782 14.8845 10.6914 14.9619C10.5046 15.0393 10.2895 14.9965 10.1465 14.8535L7.29297 12H2.5C1.11929 12 0 10.8807 0 9.5V4.5C1.54621e-05 3.11931 1.11929 2 2.5 2H12.5L12.7559 2.0127ZM2.5 3C1.67159 3 1.00001 3.67158 1 4.5V9.5C1 10.3284 1.67157 11 2.5 11H7.5L7.59766 11.0098C7.69389 11.0289 7.78311 11.0761 7.85352 11.1465L10 13.293V11.5C10 11.2239 10.2239 11 10.5 11H12.5L12.6533 10.9922C13.4097 10.9154 14 10.2767 14 9.5V4.5L13.9922 4.34668C13.9205 3.64069 13.3593 3.07949 12.6533 3.00781L12.5 3H2.5Z
```

Both are `viewBox="0 0 15 15"`, `width/height="15"` on the `<svg>` wrapper of the asset file
(dropped when inlining, exactly as 2b-1/2b-3/2b-7 did).

---

## 10. Minimum safe implementation (recommendation — **NOT applied in this phase**)

### 10.1 CSS additions (2 new rules, inside the existing `<style>` block)

Placed directly after the Phase 2b-7 rule at `index.html:1083`, so the icon system stays in
one contiguous block:

```css
  /* Radix icon system — Expenses panel tile + employee hint (proposed Phase 2b-9).
     Both hosts are hand-written static markup, so the glyph is inlined directly and no
     JavaScript is touched. The tile is a fixed 36x36 grid box, so a 15px glyph reproduces
     the emoji box exactly and cannot move the header. The hint is an 11px text flow, so
     the glyph must be inline-block at 12px with margin-inline-end (not margin-left) to
     keep the gap on the text side under RTL. No rix-flip: neither glyph carries reading
     order. */
  .panel.exp .tag>.rix{width:15px;height:15px;}
  .exp-emp-hint>.rix{display:inline-block;vertical-align:middle;width:12px;height:12px;margin-inline-end:4px;}
```

Selector safety, mirroring the 2b-7 argument:

- `.panel.exp .tag>.rix` — matches exactly one element in the document (the expenses tile).
  It cannot match the gift tile (`.panel.gift`) and cannot match any `.rix` in the Action Bar,
  `#passBanner` or the two `.add-btn`s.
- `.exp-emp-hint>.rix` — matches exactly one element; the class occurs only on `#expEmpHint`.
- Neither rule can match a `mask-image::after` (2b-2 pseudo-elements have no element).
- **Naming hazard to avoid:** the stylesheet **already has a `.minus` class**
  (`index.html:565`, the quantity-decrement button, also hidden in print at `:1363`).
  A future phase must **not** introduce a bare `.minus` selector or a `.minus` class on the
  tile — it would collide with the ticket quantity control. The selectors above avoid it.

### 10.2 Markup change 1 — `index.html:1760`

```diff
-        <div class="tag">➖</div>
+        <div class="tag"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="M12.25 7C12.5261 7 12.75 7.22386 12.75 7.5C12.75 7.77614 12.5261 8 12.25 8H2.75C2.47386 8 2.25 7.77614 2.25 7.5C2.25 7.22386 2.47386 7 2.75 7H12.25Z" fill="currentColor"/></svg></div>
```

Invariants: `<div class="tag">` element, its `class="tag"`, its position as first child of
`.panel-head`, its 36×36 box, its neighbours (`<div>` with `.ttl` / `.desc`) — **all
unchanged**. No `id`, no `data-*`, no `onclick`, no `aria-*` added or removed.

### 10.3 Markup change 2 — `index.html:1774`

```diff
-      <div class="exp-emp-hint" id="expEmpHint">💬 لو اخترت موظفًا، …
+      <div class="exp-emp-hint" id="expEmpHint"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="M12.7559 2.0127…H2.5Z" fill="currentColor"/></svg>لو اخترت موظفًا، …
```

(The single `U+0020` that followed the emoji is absorbed into `margin-inline-end:4px`,
matching 2b-7's "no literal space, margin instead" decision.)

Invariants: `id="expEmpHint"` **byte-identical**; `class="exp-emp-hint"` byte-identical;
every character of the Arabic sentence byte-identical, including `<b>سلفة</b>`; no `onclick`,
no `data-*`, no listener, no `aria-*` added to the container.

### 10.4 What a future phase must verify (checklist)

1. `git diff` shows **exactly 4 changed lines** in **exactly 1 file** (`index.html`).
2. `index.html` **inline `<script>` blocks byte-identical** (extract each `<script>` body and
   hash — 2b-1/2b-2/2b-4 use this method).
3. ID multiset unchanged (**57** ids), `onclick` multiset unchanged (**18**), `data-perm`
   multiset unchanged (**10**) — including `expEmpHint` still present.
4. `class="rix` count 15 → **17**; `rix-flip` count still exactly **2**; the 15 pre-existing
   glyphs byte-identical; `.rix`, `.abtn .ic .rix`, `[dir="rtl"] .rix-flip`,
   `.add-btn>.rix`, `.pass-banner .ic .rix` and the three 2b-2 `mask-image` rules byte-identical.
5. Live DOM: expenses tile still 36×36, glyph 15×15, computed `color` = the theme's `--red`;
   `#expEmpHint` still single-line at its natural height; `textContent` of `#expEmpHint`
   unchanged apart from the removed 💬.
6. Regression suite (`node tests/*.test.js` — there is **no `npm test` script**; `npm start`
   launches Electron and must not be used for this) → same result as Phase 2b-7.
7. Dark **and** light theme visual check of both elements.
8. `minus.svg`, `chat-bubble.svg`, `plus.svg`, `sprite.svg` byte-identical
   (`484F07489B2B8DB4`, `08A3D25575EBB3F5`, `1668CB1805492E10`, `01C8282B87DEDA7A`).

### 10.5 The single caveat a future phase must handle explicitly

`tests/protected-baseline.json` pins an `index.html` SHA-256 that is **already stale**
(`854cff97…` vs. current `bf98e20f…`) because of Phases 2a–2b-7. The enforcing tests skip
`index.html` via `const intended = { "index.html": true }`
(`tests/phase3c2-baseline.test.js:28`, `tests/phase3c1-gate.test.js:55`), so **no test change
is needed** — and `tests/**` is protected, so none should be made. A future phase should
simply state in its report that `index.html` remains an intentional, pre-declared deviation,
exactly as Phases 3C-2 and 2a–2b-7 did. This audit changed nothing here.

---

## 11. SAFE-CHANGE STANDARD — clause-by-clause

| Required clause | `minus.svg` → `.panel.exp .tag` | `chat-bubble.svg` → `#expEmpHint` |
|---|---|---|
| Visual icon changeable without behaviour change | ✅ | ✅ |
| Existing handlers untouched | ✅ none exist | ✅ none exist |
| Existing text unchanged | ✅ `.ttl`/`.desc` untouched | ✅ sentence + `<b>` byte-identical |
| Existing IDs / classes / data attributes unchanged | ✅ `class="tag"`, no id/data | ✅ `id="expEmpHint"`, `class="exp-emp-hint"` |
| No business-logic change | ✅ | ✅ |
| No protected file modified | ✅ only `index.html` markup/CSS | ✅ |
| No JS modification required | ✅ **zero** | ✅ **zero** |
| No package / dependency | ✅ | ✅ |

**Extra note on "CSS":** the minimum implementation adds 2 CSS rules to the `<style>` block
inside `index.html`. This is presentation-only, matches the precedent of Phase 2b-3
(`.pass-banner .ic .rix`) and Phase 2b-7 (`.add-btn>.rix`), and **is not a JavaScript
modification**. If a future phase were ever forbidden from adding CSS, both glyphs could
instead carry `width`/`height` presentation attributes inline — but that would break the
established 2b-1 sizing contract and, for `#expEmpHint`, would still need
`display:inline-block` to avoid breaking the text flow. **The 2-rule CSS route is the
recommended minimum.**

---

## 12. Files explicitly NOT modified by this phase

Application source — **not modified**:
`index.html` · `main.js` · `preload.js` · `database.js` · `users.js` · `login.js` ·
`recovery.js` · `permissions.js` · `perm-gate.js` · `activation.js` · `update-gate.js` ·
`accounts.js` · `launch.js` · `assets/report/daily-report.js` ·
`assets/ticket/ticket-template.js` · `assets/ticket/ticket-template.svg` ·
`assets/vendor/qrcode.js` · `assets/vendor/radix-colors.css` · `assets/icons/radix/plus.svg` ·
`assets/icons/radix/minus.svg` · `assets/icons/radix/chat-bubble.svg` ·
`assets/icons/radix/sprite.svg` · `assets/icons/radix/README.md` · `assets/icons/radix/LICENSE` ·
`assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`

Config / packaging — **not modified**: `package.json` · `package-lock.json` ·
`electron-builder.yml` · `.gitignore`

Tests — **not modified**: every file under `tests/**`, including
`tests/protected-baseline.json`

Windows assets — **not modified**: `windows/splash.html` · `windows/update.html`

Docs — **not modified**: `README.md` · all pre-existing `AI_REPORTS/*.md`

Repository hygiene: **no file created** other than
`AI_REPORTS/UI_REDESIGN_PHASE_2B8_RADIX_ICON_AUDIT.md` (this report). **No temporary file
was created inside the repository**; no analysis script was needed — every check was
executed with read-only `git` plumbing, the built-in search tool, and `Get-FileHash` /
`Get-Content`, none of which write to disk. No audit helper file was left in
`D:\Malahy-redesign` or anywhere else.

---

## 13. Explicit confirmations

1. **No application source was changed.** `git diff --stat` is identical before and after
   (`index.html`, `windows/splash.html`, `windows/update.html`; 169 insertions / 122
   deletions — the pre-existing Phase 2a/3x delta). `index.html` SHA-256 identical at start
   and end: `bf98e20fc39ddb5b2fef8a98faaf5ce18fd2d37ac3a51e1f91c08dbcccaadd96`.
2. **No JavaScript was changed.** Not one `<script>` block, not `main.js`, `preload.js`,
   `database.js`, `users.js`, `login.js`, `recovery.js`, `permissions.js`, `perm-gate.js`,
   `activation.js`, `update-gate.js`, `accounts.js`, `launch.js`, `daily-report.js`,
   `ticket-template.js` or `qrcode.js`.
3. **No CSS was changed.** Not `index.html`'s `<style>` block, not
   `assets/vendor/radix-colors.css`, not any stylesheet.
4. **No business logic was changed.** Sales, tickets, printer, A4/58 mm/80 mm, daily
   accounts, Returns Log, Gifts, Expenses, shift/business-day, payroll/employees,
   authentication, permissions, admin recovery, activation/update, storage, IPC — all
   untouched and un-referenced.
5. **No protected file was modified.** See §12 for the full list.
6. **No SVG asset was modified**, including `minus.svg`, `chat-bubble.svg`, `plus.svg` and
   `sprite.svg` (hashes in §9/§10.4).
7. **No test was modified.** No file under `tests/**` was written.
8. **No package was added and no dependency was installed.** `package.json` and
   `package-lock.json` are byte-untouched; `node_modules` was not touched; no `npm install`,
   `npm i`, `npm ci`, `npm audit`, `npm ls` or `npx` command was executed.
9. **No build was performed.** `npm start`, `npm run dist`, `npm run publish` and
   `electron-builder` were **not** executed. `node_modules` count unchanged.
10. **No packaging / publishing** occurred; no installer or artefact was produced.
11. **No commit, no push, no publish, no tag, no branch operation, no stash, no checkout,
    no reset, no version bump.** `HEAD` remains
    `a3e790d0488d408b3e637248b63eb4dad5482063` on `experiment/ui-redesign-radix`.
12. **`D:\Malahy` (main) remains untouched** — verified before and after: `HEAD`
    `1d32a21e363c5c351a6fef81db64bcede37ceeb1` on `main`, no tracked-file modification.
13. **Neither icon was implemented.** `index.html` still contains `<div class="tag">➖</div>`
    at line 1760 and `💬 …` at line 1774. `minus.svg` and `chat-bubble.svg` remain
    vendored-but-unused. The existing Phase 2b-7 `plus` implementation was not touched.

---

## 14. Final verdict

# PASS

The audit **proves both icons can be safely migrated** in one future isolated phase:

| Icon | Target | Verdict | JS change | Files touched |
|---|---|---|---|---|
| `minus.svg` | `index.html:1760` — `.panel.exp .tag` | **SAFE** | **none** | `index.html` only |
| `chat-bubble.svg` | `index.html:1774` — `#expEmpHint` | **SAFE** | **none** | `index.html` only |

Both are **static, hand-written, handler-free, ID/data-free, logic-free leaves of the DOM**
that no JavaScript can observe — the decisive property that makes a presentation-only swap
provably behaviour-neutral. Each needs **1 markup line + 1 scoped CSS rule**, reusing the
already-established `.rix` contract (`viewBox="0 0 15 15"`, `fill="currentColor"`,
`aria-hidden="true"`, `focusable="false"`, no `rix-flip`).

Nothing is BLOCKED among the two assigned targets. `#actWhatsapp` (💬, activation overlay)
and the 8 JS-generated ➖/💬 sites remain **out of scope by category E** and must be left
alone. `minus.svg` and `chat-bubble.svg` therefore stop being "unused assets" as of the
recommended future phase.

**This phase (2b-8) made no change whatsoever.** Awaiting further instructions.
