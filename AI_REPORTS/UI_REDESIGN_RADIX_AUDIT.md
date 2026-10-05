# UI Redesign Experiment — Phase 1 — Read-Only Radix UI Architecture Audit

**Application:** Malahy / كوكي بارك (Cookie Park) — theme-park ticketing & daily sales desktop app
**Stable baseline:** `v2.5.1` (on `main`) — **rollback target; must not be modified**
**Phase:** 1 — AUDIT ONLY (read-only). No source, config, dependency, build, or release changes.
**Date:** 2026-10-03
**Question answered:** *Can Radix UI be safely used for a professional UI redesign of Malahy?*

---

## Executive Summary

| Question | Answer |
| --- | --- |
| Is the renderer React-based? | **No.** Plain HTML + CSS + vanilla JavaScript. Zero framework. |
| Is Radix Primitives directly compatible? | **No.** Radix Primitives is React-only. Using it requires introducing React + a bundler — a full architecture change, not a UI-only redesign. |
| Would Radix Themes be practical? | **No.** React-based, ships its own theming engine, and would replace Malahy's existing hand-rolled token system and fight its RTL layout. |
| Would Radix Icons be practical? | **Yes — highly practical and low-risk.** Framework-agnostic pure SVG. Direct replacement for the current emoji-icon system. |
| Would Radix Colors be practical? | **Yes — practical and low-risk.** A framework-agnostic CSS color-scale system that maps cleanly onto Malahy's existing CSS custom-property tokens. |
| Can a UI-only redesign be isolated from business logic? | **Partially.** CSS-only changes are fully isolatable. Markup changes are safe *if element IDs and handler hooks are preserved*. The inline business logic is not isolatable without a refactor. |
| Recommended path | Adopt the **framework-agnostic half of Radix only** (Icons as SVG + Colors as CSS tokens) and re-implement Radix-Primitives *behaviors* as small vanilla-JS components that reuse the existing `el()` / `showModal()` patterns. **Do not introduce React.** |
| Separate branch/worktree? | **Yes — mandatory.** `main` = stable v2.5.1. All experiment work on a dedicated branch/worktree. |

**Bottom line:** Radix UI *as a product suite* is not compatible with this codebase without a rewrite, but **two of its four parts (Icons + Colors) are directly usable today**, and the *design language* of the other two (Primitives behaviors: focus-trapped dialogs, dismissable layers, accessible menus) can be replicated in vanilla JS at low risk. That combination delivers the stated design goals (professional buttons, modern icons, cleaner navigation, better cards/dialogs/forms/colors, consistent states, light/dark) **without touching a single line of business logic.**

---

## 1. Current Architecture

Malahy is a **Windows x64 Electron desktop application** with a fully Arabic, right-to-left (RTL) interface. It is a ticketing point-of-sale system: cut tickets for games, track expenses/gifts, compute the daily account, manage employees/payroll, and print tickets and reports to thermal (58 mm/80 mm) and A4 printers.

### Process model

- **Main process** — `main.js` (699 lines). Creates the splash + main `BrowserWindow`. Security posture is strict:
  - `contextIsolation: true`, `nodeIntegration: false`, `devTools: false`
  - `Menu.setApplicationMenu(null)` (no native menu)
  - `autoHideMenuBar: true`
- **Preload bridge** — `preload.js` (109 lines). Uses `contextBridge` to expose **8 narrow, audited namespaces** and nothing else. The renderer can never touch Node directly:
  `malahyDB`, `malahyLog`, `malahyApp`, `malahyExport`, `malahyPrint`, `malahyShell`, `malahyAuth`, `malahyGate`
- **IPC surface** — **33 channels** in `main.js`: `db-*` (5, sync), `app-version`, `log-*` (2), `open-external`, `export-pdf`, `export-csv`, `get-printers`, `print-ticket`, `updater-*` (2), `gate-*` (3), and `auth:*` (17). Sensitive writes (protected DB keys) are authorized **in the main process against an authenticated session**, never trusted from the renderer.
- **Storage** — `database.js`: a single local JSON file (`%APPDATA%\كوكي بارك\malahy-data.json`) with an auto-backup. No ORM, no external DB, no query layer.

### File inventory (source only)

| File | Size | Role |
| --- | --- | --- |
| `index.html` | **679 KB / 6,086 lines** | **The entire main UI** — markup + ~1,600 lines of CSS + ~4,200 lines of inline JS |
| `main.js` | 30 KB / 699 lines | Main process, window lifecycle, all IPC, auto-update |
| `preload.js` | 6.4 KB / 109 lines | contextBridge (the only renderer→Node path) |
| `accounts.js` | 34 KB | Cashier account management UI (admin) |
| `users.js` | 29 KB | User model: scrypt hashing, sessions, permissions |
| `recovery.js` | 19 KB | Admin password recovery flow |
| `login.js` | 14 KB | Login overlay logic (isolated from DB) |
| `perm-gate.js` | 8 KB | Renderer-side permission gating (`data-perm` attributes) |
| `permissions.js` | 7.7 KB | Permission definitions/decisions |
| `activation.js` | 6.7 KB | Offline activation lock (self-contained) |
| `update-gate.js` | 4.3 KB | Pure mandatory-update-gate logic (testable without Electron) |
| `database.js` | 3.0 KB | JSON storage + backup |
| `launch.js` | 1.6 KB | Dev launcher (console-free) |
| `windows/splash.html` | — | Splash screen (self-contained CSS) |
| `windows/update.html` | — | Locked mandatory-update screen (self-contained CSS) |
| `assets/ticket/ticket-template.js` | **201 KB** | Ticket layout (SVG-backed) → `window.MalahyTicketTemplate` |
| `assets/report/daily-report.js` | 16 KB | Daily account report → `window.MalahyDailyReport` |
| `assets/vendor/qrcode.js` | 55 KB | Offline QR generation |
| `assets/icons/icon.ico`, `assets/images/logo.png` | — | App icon + brand logo (PNG; logo is base64-inlined in the topbar) |
| `electron-builder.yml` | — | NSIS x64 build + GitHub auto-update publish config |
| `package.json` | — | version `2.5.1`; see §3 |

### Tests

`tests/` contains 14 Node `assert`-based suites (auth, IPC, session, permissions, accounts, recovery, gate, DOM, daily-report) plus `protected-baseline.json`. These are **logic-level tests**, not visual regression tests — an important constraint for a UI redesign (see §10).

---

## 2. Renderer Technology

**The renderer is 100% plain HTML/CSS/JavaScript. There is no virtual DOM, no component framework, no build step for the UI, and no JSX.**

Evidence:

1. `package.json` `dependencies` contains exactly **one** runtime package: `electron-updater`. Dev deps are only `electron` and `electron-builder`. (Full contents below, §3.)
2. `node_modules` has **231 packages**; a search for `react`, `vue`, `svelte`, `solid`, `preact`, or `radix` returned **zero matches**. Every package is Electron/electron-builder/electron-updater tooling.
3. `index.html` loads its logic from `<script>` tags pointing at plain `.js` files plus one large inline `<script>` — **no bundler output**, no `type="module"` graph, no `dist/assets` chunking for the renderer.
4. The renderer manipulates the DOM imperatively with a hand-rolled helper:

```js
function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (EL_BOOL[k]) n[k] = !!v;
    else n.setAttribute(k, v);
  }
  ...
  return n;
}
```

5. Interactivity in static markup uses inline handlers, e.g. `onclick="toggleTheme()"`, `onclick="openSettings()"`, `onclick="addExpense()"`, referencing **global functions** declared by the inline script (~229 top-level functions).
6. `electron-builder.yml` ships the renderer **as-is** (`asar: true`, raw `index.html` + `windows/**` + `assets/**`), confirming no transpilation step is expected.

**Implication:** any library that requires React cannot be dropped in. Any solution must be either (a) framework-agnostic, or (b) coupled to introducing an entire React toolchain — which is an architecture rewrite, not a UI redesign.

---

## 3. Current Styling System

`package.json` in full:

```json
{
  "name": "malahy",
  "version": "2.5.1",
  "description": "كوكي بارك — نظام قطع التذاكر وحساب المبيعات اليومية",
  "main": "main.js",
  "scripts": { "start": "node launch.js", "dist": "electron-builder --win --publish never", "publish": "electron-builder --win --publish always" },
  "devDependencies": { "electron": "^43.7.5", "electron-builder": "^26.0.12" },
  "dependencies": { "electron-updater": "^6.3.9" }
}
```

**No CSS framework, no CSS-in-JS, no preprocessor, no Tailwind, no PostCSS.** Styling is hand-authored CSS with a mature token system:

### Design tokens (`:root`, dark default)

98 custom-property declarations organized by group — backgrounds (`--bg`, `--bg-2`, `--panel`, `--panel-2`), text (`--ink`, `--muted`, `--muted-2` + semantic aliases), brand colors (`--primary` cyan, `--secondary` gold, `--success`, `--danger`, `--brand`), `--radius`, `--shadow`, `--glow-primary` / `--focus-ring`, and semantic surface tokens (`--hi`, `--hi-2`, `--line`, `--line-2`, `--inset-hi`, `--ovl`, `--topbar-bg`, `--scoreboard-bg`, `--shift-bg`, …). This is already a disciplined, scalable foundation.

### Theming (light/dark)

- Dark is the default; light is opted in via `[data-theme="light"]` on `<html>` (~85 override blocks).
- Driven by vanilla JS: `setTheme()` toggles the attribute + persists to `localStorage`; `effectiveTheme()` resolves manual vs. **auto** theme (auto follows the active shift — day shift = light, night shift = dark, reading from the single shift-settings source of truth); `toggleTheme()` / `toggleAutoTheme()` are the header buttons.
- Tokens are **duplicated** in `windows/splash.html`, which carries a comment: *"Design System Tokens — must match index.html :root exactly."* Any token change must be mirrored there.

### Typography & modern CSS

- Fonts: **Cairo** (Arabic UI) + **Orbitron** (LED/numeric `.num` class), loaded from Google Fonts CDN (`<link>`).
- Uses modern CSS: `color-mix(in srgb, …)`, CSS gradients, `::-webkit-scrollbar` styling, `:focus-visible` rings, `inset` shadows. No CSS `@layer`s; specificity is managed by flat, semantic class names.
- ~213 hand-written component class rules (`.topbar`, `.scoreboard`, `.sc-cell`, `.ticket`, `.cut-btn`, `.abtn`, `.panel`, `.modal`, `.overlay`, `.toast`, `.set-card`, `.acc-row`, `.emp-*`, `.rep-*`, …) plus a boot skeleton (`#skBoot`, `.sk-*`).

**Assessment:** the styling system is in good shape structurally. The redesign goal is therefore **not** "build a token system" — it is **raise the visual quality of the token values and component classes**, and replace emoji with real icons. That is precisely where Radix Colors + Radix Icons help.

---

## 4. Current UI Component Approach

There is **no component framework**. UI is composed four ways:

1. **Static HTML** in `index.html` — topbar, scoreboard, games grid shell, expense/gift panels, summary rows, action bar, activation overlay, login overlay, toast wrapper.
2. **Imperative DOM building** with the `el()` helper — used by all modal builders (`openSettings`, `openReports`, `openEmployees`, `openDailyReg`, `openGameMgmt`, `openHistory`, `openChangePass`, `empEntryModal`, …).
3. **HTML-string rendering** into containers via `innerHTML` — list/grid renderers (`renderGames`, `renderList`, `paintGm`, `paintEmp`, `paintDreg`, `repCard`, `histItem`, …).
4. **Print documents** — standalone `<!DOCTYPE html>…` strings built by `ticketHTML()`, `giftTicketHTML()`, `dayReportHTML()`, `reportHTML()`, `salaryReportHTML()`, etc., honoring `paperKind()` (auto/58/80/A4) and backed by the `window.MalahyTicketTemplate` and `window.MalahyDailyReport` modules.

### Existing "components" and their quality

| Area | Current implementation | Quality gap vs. design goal |
| --- | --- | --- |
| **Buttons** | `.abtn` (+ `.save`, `.restart`, `.ghost`, `.add-btn`, `.cut-btn`, `.testbtn`, `.theme-btn`) — gradient/ghost variants, hover lift, `:focus-visible` ring | Reasonable, but inconsistent across ~7 button classes; states not systematized |
| **Icons** | **Emoji** (🔑 💾 🔄 🖨️ 🎮 📊 👥 ⚙️ 🎁 ➖ 💬 ⬇️ 🕐 🚪 🔐 📋 ⚠️ ✓) + PNG logo | **Biggest visual weakness.** Emoji render inconsistently per OS/version, look unprofessional, and can't be styled/aligned precisely |
| **Dialogs/Modals** | One `#overlay` div; `showModal(node)` injects a node, `closeOverlay()` clears it; backdrop-click + `Escape` close | No focus trap, no focus return, no stacking/layering, no scroll-lock, no animation orchestration; each builder re-creates its own header/actions markup |
| **Menus / dropdowns** | Native `<select>` elements and hand-built tab bars (`.rep-tab`) | No accessible popovers/menus; no keyboard arrow navigation |
| **Forms** | Raw `<input>`/`<select>`/`<checkbox>` styled via `.field`, `.set-card`, `.emp-form`; live validation done ad-hoc per modal (e.g., `checkQr`, `checkShift`) | Inconsistent field styling, no shared label/error/feedback pattern |
| **Cards** | `.panel`, `.set-card`, `.sc-cell`, `.ticket`, `.rep-card`, `.bw-card` | Multiple parallel card styles; spacing/radius not unified |
| **Toasts** | `toast(msg, type)` → `.toast.ok` / `.toast.warn` with emoji icons | Works; icon + motion could be more professional |
| **Tables** | `.emp-table`, report tables with zebra striping | Functional; visual hierarchy could improve |
| **Navigation** | A flat **action bar** of `.abtn` buttons (no tabs/rails); modals act as "pages" | "Cleaner navigation" is a real opportunity — but note the flat action bar is also the *permission-gated* surface (`data-perm`) |
| **Skeleton/loading** | `#skBoot` boot skeleton auto-removed after first paint | Good pattern already in place |

### Security-critical UI behaviors (must survive any redesign)

- **Activation overlay** `#actOverlay` (`aria-modal`, `role="dialog"`): default-visible, `inert` + `aria-hidden` on the app behind it, **focus trap**, all events blocked. Fail-closed if JS fails.
- **Login overlay** `#loginOverlay`: main UI stays `inert` until a successful login; mandatory password-change state (`mustChangePass`).
- **Permission gating**: `data-perm="settings|reportPrint|dayReset|gameManage|reports|employeeManage"` attributes enforced by `perm-gate.js` (`MalahyPerm.hasPerm/deny`).
- **Update gate**: `windows/update.html` is a non-closable locked screen; the main window is not even created while the gate is active.

---

## 5. Radix Compatibility Assessment

Radix is a **family of four separate packages** with **very different technology requirements**. Conflating them is the main trap of this audit:

| Package | Technology | Compatible with vanilla-JS Malahy? |
| --- | --- | --- |
| **Radix Primitives** (`@radix-ui/react-*`) | **React only** | ❌ No |
| **Radix Themes** (`@radix-ui/themes`) | **React only** + own CSS + own theming engine | ❌ No |
| **Radix Icons** (`@radix-ui/react-icons`) | Published as **React components**, but the underlying art is **plain SVG** (MIT) | ✅ Yes — use the raw SVG, not the React wrapper |
| **Radix Colors** (`@radix-ui/colors`) | **Framework-agnostic** — ships CSS custom properties / JS color scales | ✅ Yes |

**Therefore the correct answer to "can Radix UI be used?" is: "the Radix *visual and behavioral language* can be adopted in full, but the React *runtime* must not be."** See §§6–9 for the part-by-part assessment.

---

## 6. Radix Primitives Assessment — ❌ NOT directly compatible

**Verdict: Do not introduce. Re-implement the *behaviors* in vanilla JS instead.**

**Why incompatible:**

- Every Radix Primitive (`Dialog`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`, `Accordion`, `ScrollArea`, `Slider`, `Switch`, `Checkbox`, `Select`, `Toast`, `Form`, `Portal`, `Slot`, `VisuallyHidden`, `FocusScope`, `DismissableLayer`, `Collection`, `Primitive`) is a **React component** requiring `react` + `react-dom` as peer dependencies and a JSX/bundler toolchain.
- Malahy's renderer has **no React, no bundler, no module graph** (§2). Adopting Primitives means: add React + ReactDOM (~130 KB gzipped), add Vite/Webpack/esbuild, rewrite ~229 inline functions and all `innerHTML` string renderers as components, rewire global-function event handling to React handlers, and re-test the entire app. **That is a rewrite of the renderer, i.e. exactly the kind of change that endangers the protected business logic.**
- Radix Primitives also depends on React's rendering model (portals, effect scheduling, `Radix.Primitive` + `Slot` composition). Mixing it into an imperative-DOM app would create two competing DOM ownership models — a serious correctness and maintainability hazard in a POS system that must print and sell reliably.

**What to do instead (the safe way to get the Radix Primitives value):** replicate the specific *behaviors* that matter for the redesign as small, dependency-free vanilla modules that plug into the patterns Malahy **already has**:

| Radix Primitive behavior | Safe vanilla replacement |
| --- | --- |
| `Dialog` / `AlertDialog` (focus trap, return focus, scroll lock, `Escape`, backdrop, `aria-modal`) | Upgrade existing `showModal(node)`/`closeOverlay()` — add a focus trap, restore previously-focused element, `document.body` scroll lock, layered z-index stack. ~60–100 lines, no new deps. |
| `DismissableLayer` (outside-click + Escape) | Already partly present (backdrop click + `Escape` listener). Generalize into a small `dismissible(node)` helper. |
| `DropdownMenu` / `Popover` (positioning, arrow, keyboard nav) | Small popover utility anchored to a trigger, with `position: fixed` + collision flipping and arrow-key navigation. Replaces ad-hoc `<select>`/tab-bar patterns where a richer menu is wanted. |
| `Tooltip` | Tiny hover/focus tooltip with `aria-describedby`. |
| `Tabs` | Replace `.rep-tab` hand-built tabs with a small `tabs(container)` helper wiring `role="tab"`/`tabpanel` + arrow keys. |
| `Toast` (with viewport + stacking) | Extend existing `toast()` with a proper viewport, auto-dismiss + pause-on-hover, and swipe/`×` dismissal. |
| `Switch` / `Checkbox` / `Slider` | Styled `<input type=checkbox/range>` with a shared `.switch`/`.slider` CSS (already partially present for `.switch`). |
| `ScrollArea` | Keep native scrolling + existing `::-webkit-scrollbar` styling (already professional). |
| `Portal` | Not needed — modals already render into a fixed `#overlay`; keep it. |

These give the redesign Radix-grade accessibility and interaction quality **without React**, reusing Malahy's own `el()` builder and `showModal()` contract.

---

## 7. Radix Themes Assessment — ❌ NOT practical

**Verdict: Reject for this project (and this codebase).**

Radix Themes is a React component library (`Theme`, `Button`, `Dialog`, `Card`, `TextField`, `Select`, `Table`, `Tooltip`, `Callout`, `Tabs`, `RadioButton`, `Switch`, `Slider`, `Spinner`, `Skeleton`, `ScrollArea`, `Separator`, `IconButton`, `RadixLogo` …) that:

1. **Requires React + a bundler** — same blocker as Primitives (§6), plus its own CSS import graph.
2. **Brings its own theming engine** — `<Theme accentColor="…" grayColor="…" appearance="dark|light" radius="…" scaling="…">` and a global CSS reset. It expects to *own* the design system. Malahy **already has** a 98-token custom-property system (§3) and 213 component classes; running both means two competing sources of truth, duplicated light/dark logic, and specificity wars.
3. **Fights RTL.** Malahy's whole layout is `dir="rtl"` with RTL-specific tuning (the README documents a shift-arrow RTL fix in v2.5.0). Radix Themes' logical-property support is not a drop-in guarantee for every component, and regressions here would be visible in every screen.
4. **Duplicates your own components** — Malahy's scoreboard, ticket cards, ledger panels, and print-preview surfaces are domain-specific; Themes' generic `Card`/`Table` would not replace them, only add weight.
5. **Bloates the shipped artifact** for a desktop POS where `asar` size and cold-start matter, and adds a transpilation step the build currently doesn't have.

**The one thing worth stealing:** Radix Themes' *design opinions* — its `accentColor`/`grayColor` pairing, consistent radius scale, 4-step gray ramp, and state system (hover/focus/active/disabled) — which are exactly expressible in **Radix Colors + your own CSS** (§9). You get the look without the runtime.

---

## 8. Radix Icons Assessment — ✅ PRACTICAL, low risk, high impact

**Verdict: Adopt. This is the single highest-value, lowest-risk change in the whole redesign.**

Radix Icons is a set of ~300 icons released as **MIT-licensed SVG**. Although published on npm as `@radix-ui/react-icons` (React wrappers), the **artwork is plain SVG and can be used without React** — you can consume the raw SVG paths directly (e.g. from the icon SVG files / the published sprite) with **no dependency, no bundler, and no package.json change required for a pure asset-copy approach**.

Why it fits Malahy:

- **Framework-agnostic.** Usable as inline `<svg>` in static HTML or as strings inside the existing `innerHTML` renderers and `el()`-built nodes. No React.
- **Directly replaces the emoji weakness.** Every current emoji maps cleanly to a Radix glyph:
  `💾`→`IconSave`/`Download`, `🔄`→`Reload`/`Reset`, `🖨️`→`Print`, `🔑`→`Key`, `🔐`→`LockClosed`, `🚪`→`Exit`/`Door`, `📋`→`Clipboard`, `🎮`→`Toy`/`Game`, `📊`→`BarChart`, `👥`→`People`, `🕐`→`Clock`, `⚙️`→`Gear`, `🎁`→`Gift`, `➖`→`Minus`, `💬`→`ChatBubble`, `⬇️`→`Download`, `⚠️`→`ExclamationTriangle`, `✓`→`Check`, `↳`→`ArrowLeft` (RTL-correct direction available).
- **Styleable.** Monochrome, `currentColor`-based, 15 px grid — they inherit text color, so they adapt to light/dark themes and to button variants automatically (something emoji can never do).
- **Consistent rendering** across Windows versions (emoji are drawn by the OS font, so `🎮`/`🖨️` differ between Win10/Win11 and can even be missing glyphs — a real professionalism problem on a shipping Windows app).
- **Already-proven pattern.** The codebase already inlines SVG for the QR feature (`assets/vendor/qrcode.js`) and the ticket template (`assets/ticket/ticket-template.svg`), so SVG-as-asset is an established, understood technique here.

**Caveats to plan for:**

- **Directional icons in RTL.** Icons like arrows (`ArrowLeft`/`ArrowRight`, `ChevronDown`, `Backspace`) need RTL-aware selection or a CSS `transform: scaleX(-1)` flip utility (the project already handled an analogous RTL arrow fix in v2.5.0 — same discipline applies).
- **Icon set packaging.** Recommended: create `assets/icons/radix/` (or an aggregated `assets/icons/radix-sprite.svg`) and a tiny `icon(name, cls)` helper returning an SVG string, so icons can be swapped in one place. This is an **asset + markup** change, not a dependency change.
- **Print documents are separate.** Ticket/report print HTML (§11) should keep their current minimal glyph set — do not pull Radix Icons into print documents (font/ink constraints, thermal printers).

---

## 9. Radix Colors Assessment — ✅ PRACTICAL, low risk

**Verix: Adopt as the color foundation of the redesign.**

Radix Colors is a **framework-agnostic** color system: every hue is a 12-step scale (1 = lightest … 12 = darkest) with matching alpha variants, and it ships as **CSS custom properties** (e.g. `--cyan-9`, `--cyan-3`, `--mauve-1`) — exactly the mechanism Malahy's token layer already uses (§3). **No React, no bundler, no runtime** — it's just CSS variables (or static JS scales if ever needed).

Why it fits:

- **It slots into the token layer you already have.** Map Radix scales onto the existing semantic tokens rather than the other way around — e.g.:
  - `--primary` ← cyan scale (`--cyan-9` dark / `--cyan-10` light text-on-accent)
  - `--secondary` (gold) ← amber scale
  - `--success` ← green scale; `--danger` ← red/tomato scale
  - `--bg`, `--bg-2`, `--panel`, `--panel-2` ← slate/mauve scale steps 1–5
  - `--ink`, `--muted`, `--muted-2` ← slate/mauve steps 11–9 / 10 / 8
  - hover/focus rings ← alpha variants (`--cyan-a4`, `--cyan-a6`)
  Because every component already reads from these variables, **repainting the whole app is a token-file change**, not a per-component change.
- **Built for light *and* dark.** Radix Colors documents which steps to use per appearance — this is exactly the systematic light/dark ramp the design goal asks for, and it removes the need to hand-pick per-component light overrides (the current `[data-theme="light"]` block is ~85 rules; many could be simplified to scale-step swaps).
- **Improves consistency and states.** A 12-step scale gives a systematic way to express hover/active/disabled states and subtle surfaces (`--hi`, `--line-2`) that are currently hand-written rgba values scattered across the stylesheet.
- **Accessible contrast by construction** (step 9/10 for text-on-accent, etc.), supporting the "professional appearance" goal.

**Caveats to plan for:**

- **Do not change the token *names*** the JS depends on. Theme functions (`setTheme`, `effectiveTheme`) only toggle `data-theme`, so swapping *values* is safe; but keep the public token names stable so ~213 component rules keep working.
- **`windows/splash.html` duplicates the tokens** ("must match index.html :root exactly") — any token migration must be mirrored there (and ideally `windows/update.html` reviewed for consistency).
- **Brand color is semi-locked.** The logo/brand purple (`--brand`) and the gold accents are part of the venue identity and ticket design; Radix Colors should be mapped *to* them, not replace them wholesale.
- **Keep print documents on their current palette.** Tickets are intentionally black-and-white only; reports use fixed colors. Radix Colors is a *screen* UI system (§11).

---

## 10. Risks

Ordered by severity. Every risk is **mitigated by the strategy in §13**.

1. **Co-located UI and business logic (HIGHEST).** The 679 KB `index.html` mixes ~4,200 lines of inline JS — including sales (`addTicket`, `deductBatch`, `totals`, `txPrices`, `gameSalesTotals`), shift/business-day math (`shiftOfDate`, `businessDayKey`, `validateShiftTimes`), report building (`buildReportData`, `aggregate`, `reportHTML`), payroll (`calcWeek`, `weekStats`, `empPayOne`), and ticket generation (`ticketHTML`, `ticketTemplateSvg`, `giftTicketHTML`) — **in the same file as the markup and CSS**. A careless markup/asset edit can silently break calculations. → *Mitigation: CSS-first and asset-only changes; freeze the inline script; add a grep-based guard that the script block is byte-identical to v2.5.1.*
2. **Element IDs are an implicit contract.** The JS selects by ID (`#scRevenue`, `#sumFinal`, `#gamesGrid`, `#expenseList`, `#overlay`, `#actInput`, `#loginUser`, …) — hundreds of `getElementById`/`$('#…')` lookups. Renaming or restructuring a DOM node silently breaks rendering. → *Mitigation: a redesign must preserve every ID and every `data-perm` attribute; add a test asserting all IDs referenced in JS still exist.*
3. **No visual regression safety net.** The 14 test suites are logic-level (auth, IPC, session, permissions, accounts, recovery, gate, DOM, daily-report). Nothing asserts how pixels look, so a visual redesign can ship ugliness or unreadable contrast with green tests. → *Mitigation: capture baseline screenshots of both themes before starting; diff after.*
4. **Emoji-to-SVG semantic drift.** Some emoji carry meaning that must survive (e.g. `⚠️` warn vs `✓` ok in toasts; the `↳` sub-line markers in the summary). A careless icon swap can invert meaning (e.g. a "trash" icon where a "restore" was intended). → *Mitigation: an explicit emoji→icon mapping table reviewed against behavior.*
5. **RTL regressions.** Directional glyphs, spacing (`margin-inline-*` vs `margin-left`), and alignment are easy to break. Radix Themes would have been a serious RTL risk (§7); hand-authored CSS avoids that, but each change must be eyeballed in RTL.
6. **Token duplication across windows.** `splash.html` (and to a lesser degree `update.html`) copies the token block; a partial migration causes a flash of mismatched styling at startup.
7. **Focus-trap / accessibility changes can break the activation lock.** `#actOverlay` and `#loginOverlay` rely on `inert` + `aria-hidden` + a focus trap for security. Upgrading `showModal()` must not weaken "the app is unreachable until activated/logged in." → *Mitigation: the activation/login overlays are on the protected list (§11); treat their DOM and focus behavior as frozen.*
8. **Accidental scope creep into React.** "We'll just add one Radix Dialog" is how a UI redesign silently becomes a renderer rewrite (§6). → *Mitigation: this audit's conclusion — no React — is the Phase-2 constraint, recorded in the branch's own README.*
9. **Print/thermal constraints.** Any style that leaks into the print documents (e.g. a global `button`/`input` reset, or a new font) can break 58 mm/80 mm/A4 output. Print documents are self-contained strings, so the risk is low **if** the print CSS builders are left alone.
10. **No bundler means manual asset hygiene.** Adding an icon sprite must be done with the same discipline as `qrcode.js`/`ticket-template.js` (plain `<script>`/`<img>`/inline SVG), or it won't survive `asar` packaging.

---

## 11. Protected Systems

The following must **not** be modified during the future UI redesign unless a separate, explicit phase requests it. For each, the audit identified the exact code location so future phases can route around it.

| Protected system | Location(s) — DO NOT MODIFY |
| --- | --- |
| Sales calculations | `index.html` inline script: `addTicket`, `deductBatch`/`deductOne`, `addBatch`, `totals`, `txPrices`/`txPricesPush`/`txPricesPop`, `gameSalesTotals`, `gameBreakdown`, `calcFinalNet`, `_addItem`, `addExpense`, `addGift` |
| Ticket calculations | `index.html`: `addTicket`, `deductBatch`, `txPrices*`, `printResultToast` |
| Ticket layout | `assets/ticket/ticket-template.js` (201 KB), `assets/ticket/ticket-template.svg`, and `ticketTemplateSvg`, `ticketTemplateAvailable`, `ticketHTML`, `ticketHTMLSvg`, `ticketHTMLFallback`, `giftTicketHTML*`, `ticketCSS`, `ticketArtCSS`, `ticketOverlay*`, `ticketStamp`, `textWidthVB`, `fitFontSize` in `index.html` |
| QR functionality | `assets/vendor/qrcode.js`; `isValidMapUrl`, `ticketQrSvg`, `ticketQrEnabled`, `checkQr` in `index.html` |
| Printer discovery | `main.js` `get-printers` handler; `openSettings()` printer `<select>` population |
| Printer selection | `settings().printerName` / `paperWidth`; `paperKind()`; `sel` change handler in `openSettings()` |
| A4 / 58 mm / 80 mm printing | `paperKind`, `ticketCSS`, `reportPaperCSS`, `thermalReportCSS`, `a4ReportCSS`, all `<!DOCTYPE html>…` print-document string builders (≈ lines 3440, 3591, 3989, 4004, 4087, 4099, 5395, 5457) and `main.js` `print-ticket` |
| Daily account report calculations | `assets/report/daily-report.js` (`window.MalahyDailyReport`); `buildReportData`, `aggregate`, `dayReportHTML`, `printTodayReport`, `printDayReportObj`, `dailyChartHTML`, `gameChartHTML` in `index.html` |
| Returns log | `loadReview`, `logReview`, `reviewInRange`, `reviewSection`, `reviewLogHTML`, `reviewReportBlock`, `dayReviewAppendHTML` |
| Gifts logic | `addGift`, `giftsReportBlock`, `giftsSection`, `giftTicketHTML*` |
| Expenses | `addExpense`, `recordEmployeeAdvance`/`removeEmployeeAdvance`, `renderList` expense branch |
| Shift logic | `parseShiftTime`, `isValidShiftTime`, `shiftTimes`, `shiftOfDate`, `shiftLabel`, `fmtShiftTime12`, `shiftRangeLabel`, `shiftBadgeText`, `validateShiftTimes`, `paintShiftNow`, `readShiftInputs`, `checkShift` |
| Business-day logic | `businessDayStartMin`, `businessDateLabel`, `businessDayKeyFrom`, `businessDayKey`, `keyToDate`, `periodLabel`, `filterRecords`, `isDayTime` |
| Payroll | `calcWeek`, `weekStats`, `empDashboardStats`, `empPayOne`, `empPayAll`, `empStartNewWeek`, `empWeekTableData`, `salaryReportHTML`, `empMoneySection`, `empCalcBox`, `weekOps`, `opInfo` |
| Employee registration | `empLoad`, `empSave`, `empMigrate`, `empForm`, `empFormBuild`, `empDelete`, `empEntryModal`, `openEmployees`, `paintEmp`; `dr*` daily-registration family; `users.js` |
| Authentication | `users.js` (scrypt hashing, sessions), `login.js`, `main.js` `auth:*` handlers (17 channels), `preload.js` `malahyAuth` |
| Permissions | `permissions.js`, `perm-gate.js` (`MalahyPerm`), `data-perm` attributes in markup, `main.js` session-based authorization for protected keys |
| Admin password recovery | `recovery.js`, `auth:beginRecovery`/`auth:completeRecovery`/`auth:setRecoveryWhatsapp` |
| Activation system | `activation.js`, `#actOverlay` DOM + its focus trap / `inert` / `aria-hidden` behavior |
| Auto-update system | `update-gate.js` (`FLOOR_VERSION`), `windows/update.html`, `main.js` updater + `gate-*` handlers, `update-gate` mandatory logic |
| Database / storage behavior | `database.js`, `main.js` `db-*` handlers, `preload.js` `malahyDB`, protected-key rules in `main.js` |
| Existing IPC contracts | All 33 channels in `main.js` + the 8 `preload.js` namespaces — names, argument shapes, and return shapes are frozen |
| Security mechanisms | `contextIsolation`, `nodeIntegration: false`, `devTools: false`, `Menu.setApplicationMenu(null)`, devtools-key blocking, single-instance lock, fail-closed overlays |

**Note:** several of these are *rendered through* the UI (ticket print, report print, permission-gated buttons). The redesign may restyle their **visual containers**, but the **logic, IDs, handlers, and print-document internals are frozen.**

---

## 12. Safe UI Redesign Surfaces

These surfaces carry **no business logic** — they are pure presentation, fed by existing render functions and IDs. They are the safe targets for the redesign, ordered by impact-to-risk ratio.

**Tier 1 — safest & highest impact (start here):**

1. **Action-bar buttons (`.abtn` + variants).** ~10 buttons in a flat strip. Pure presentational; each keeps its `onclick`/`data-perm`. Swap emoji → Radix SVG, unify the button system (size, radius, states). *This is the ideal proof-of-concept surface.*
2. **Header / topbar.** `.topbar`, `.brand`, `.logo-badge`, `.clockbox`, `.shift-chip`, `.theme-btn-group`. Display-only values (`#clock`, `#todayDate`, `#shiftText` are set by `tickClock`/`paintShiftNow`). Keep IDs.
3. **Icon system globally.** The emoji→Radix-SVG swap (§8), delivered via one `icon()` helper + an `assets/icons/` asset folder. Touches markup/CSS only.
4. **Color tokens (`. :root` + `[data-theme="light"]`).** Map Radix Colors onto the existing token names (§9). Repaints the entire app with **zero** markup/logic change — the single most leveraged change in the redesign.
5. **Toast system.** `toast()` + `.toast*`. Self-contained; upgrade icons, motion, and stacking.

**Tier 2 — safe with care (preserve IDs/classes):**

6. **Scoreboard.** `.scoreboard`, `.sc-main`, `.sc-strip`, `.sc-cell` — values injected into `#scRevenue`, `#scTickets`, `#scNet`, `#scFinal`. Visual shell only.
7. **Games grid ticket cards.** `.games`, `.ticket`, `.cut-btn`, `.minus`, `.epay-btn` — rendered by `renderGames`; the card chrome can be restyled while the quantity inputs, `.cut-btn`, and the callbacks behind them stay byte-identical.
8. **Ledger panels.** `.panel.exp`, `.panel.gift`, `.panel-head`, `.add-row`, `.list`, `.panel-total` — containers around `#expDesc`, `#expAmount`, `#expEmp`, `#giftDesc`, `#giftAmount`, `#expenseList`, `#giftList`. Visual shell only.
9. **Summary block.** `.summary`, `.srow*` — display rows fed by `renderSummary` into `#sumRevenue` … `#sumFinal`.
10. **Modal chrome.** `#overlay`, `.modal`, `.modal-actions`, modal headers/footers, and the shared `showModal()`/`closeOverlay()` contract. This is where a vanilla "Radix-behavior" upgrade (focus trap, focus return, scroll lock, Escape stacking) pays off — **excluding** `#actOverlay` and `#loginOverlay` (protected).
11. **Form fields.** `.field`, `.set-card`, `.emp-form`, inputs/selects/checkboxes — a unified label/input/error/feedback pattern. Validation *logic* (`checkQr`, `checkShift`, etc.) stays; only the *appearance* of valid/invalid states changes.
12. **Tables.** `.emp-table`, report tables, `.rep-*` — zebra striping, headers, row hover, numeric alignment (`.num`).
13. **Cards & spacing system.** Unify `.panel`, `.set-card`, `.sc-cell`, `.ticket`, `.rep-card`, `.bw-card` onto one radius/spacing/shadow scale; introduce a shared spacing rhythm.
14. **Skeleton/boot screen.** `#skBoot`, `.sk*` — align with the new tokens.

**Tier 3 — navigation (valuable, needs design care):**

15. **Navigation structure.** The flat `.actions` button strip can be reorganized (grouping, a rail, tabs) **provided every `data-perm` gate and `onclick` is preserved**. This is where "cleaner navigation" happens — but it is also the surface closest to permission logic, so it must be gated-checked against `perm-gate.js` after any change.

**Explicitly excluded from Tier scope:** everything in §11.

---

## 13. Recommended Migration Strategy

**Guiding principle: change the *paint*, not the *plumbing*.** CSS and assets are the attack surface; the inline script is frozen; IDs and `data-perm` attributes are an immutable contract; React never enters the project.

### Strategy A (RECOMMENDED) — "Radix language, vanilla runtime"

Adopt the framework-agnostic half of Radix and replicate the rest:

```
Radix Colors  → mapped onto existing CSS custom-property tokens   (screen UI only)
Radix Icons   → raw SVG assets + a small icon(name) helper        (replaces emoji)
Radix Primitives behaviors → small vanilla-JS modules on el()/showModal()
Radix Themes  → REJECTED (React + competing theme engine + RTL risk)
```

### Incremental phases (each independently shippable and reversible)

| Phase | Scope | Touches | Risk |
| --- | --- | --- | --- |
| **2a — Token migration** | Import Radix Colors scales; remap `:root` + `[data-theme="light"]` values onto existing token names; mirror into `windows/splash.html` | CSS only (no markup, no JS) | Very low — repaint, fully revertible by reverting one block |
| **2b — Icon system** | Add `assets/icons/` Radix SVG set; add `icon(name, cls)` helper; swap emoji in static markup + `innerHTML` renderers + toasts | Assets + markup strings | Low — visual only; verify RTL arrow direction |
| **2c — Button & card system** | Unify `.abtn*`/`.add-btn`/`.cut-btn`/`.testbtn` into one button system (sizes, radius, hover/focus/active/disabled); unify card classes onto one spacing/radius/shadow scale | CSS (+ minimal markup class tweaks) | Low |
| **2d — Modal engine upgrade** | Add focus trap, focus return, scroll lock, Escape/backdrop layering to `showModal()`; standardize modal header/actions markup | Small new vanilla JS module + CSS; **not** `#actOverlay`/`#loginOverlay` | Medium — requires accessibility re-test of activation & login overlays |
| **2e — Forms, tables, toasts, navigation** | Unified field/label/error styles; table polish; toast viewport + motion; reorganize the action bar (preserve `data-perm` + `onclick`) | CSS + markup classes | Medium (nav) — re-verify permission gating |
| **2f — Optional behaviors** | Vanilla Tabs/Popover/Tooltip/Menu helpers where the redesign needs richer navigation | New small modules | Medium |

**Guardrails for every phase:**
- **Never** edit the `index.html` inline `<script>` block (lines ~1889–6084) or the files in §11.
- **Never** rename/remove an element ID or a `data-perm` attribute.
- **Never** change `package.json`, `preload.js`, `main.js`, or any IPC channel.
- Before each phase: snapshot both themes; after each phase: run the 14 test suites + manual smoke test (login → activation bypass in dev → sell a ticket → print a test ticket → open each modal → export report).
- Keep each phase small enough to revert in one commit.

### Strategy B (NOT recommended) — Introduce React + Radix Primitives/Themes

Would deliver "real Radix" but requires: React + ReactDOM, a bundler, rewriting ~229 inline functions and all `innerHTML` renderers as components, re-wiring global-function handlers, re-testing the entire sales/print/auth surface, and maintaining two DOM ownership models in a POS that must print reliably. **This is a renderer rewrite, not a UI redesign, and it is disproportionate to the design goals.** Reject unless a full rewrite is separately commissioned.

---

## 14. Whether a Separate Experimental Branch/Worktree Should Be Used

**YES — mandatory. No experiment work touches `main`.**

Rationale:

1. **`main` is the stable v2.5.1 rollback baseline** (the last commit is `docs: final release report for v2.5.1`, preceded by `release: Malahy v2.5.1`). The whole point of a named baseline is that it stays reachable.
2. **The auto-update gate makes bad releases irreversible in the field.** Every published version becomes mandatory (`FLOOR_VERSION` + `latest.yml`), and the update screen is non-closable. A broken visual build pushed to users cannot be ignored — it *forces* itself onto every machine. Therefore the merge bar must be deliberately high.
3. **The audit found a clean working tree** (`git status --porcelain` shows only the pre-existing untracked `qa-ticket-renders/`; no modified files). That clean state is worth preserving as the rollback reference.
4. **A 679 KB monolith means mistakes are easy and reviews are hard.** Isolating the experiment makes diffs reviewable and lets `main` stay shippable at all times.

**Recommended setup:**

- Create a **worktree** (e.g. `D:\Malahy-redesign`) on a new branch `experiment/ui-redesign-radix` off the v2.5.1 tag, keeping `D:\Malahy` on `main` pristine and runnable as the stable reference.
- Record the Phase-1 constraints (no React, frozen script block, frozen IDs/`data-perm`, no `package.json`/IPC changes, §11 protected list) in the branch's own `AI_REPORTS/` notes so future sessions inherit the rules.
- Merge to `main` only after the full test suite passes **and** both themes are visually verified, as a single reviewed change set (or a small, individually revertible series).

---

## 15. Exact Recommended Next Phase

> **Phase 2a — Token migration to Radix Colors (experimental branch, CSS-only).**

Concretely:

1. Create worktree `experiment/ui-redesign-radix` off `v2.5.1` (per §14).
2. Capture baseline screenshots of both themes (dark + light) of every main surface for later diffing.
3. Add the Radix Colors scales as CSS custom properties (vendored as an asset — **no npm install, no `package.json` change** — consistent with how `qrcode.js` is already vendored).
4. Remap the **existing** token names (`--bg`, `--bg-2`, `--panel`, `--panel-2`, `--ink`, `--muted`, `--muted-2`, `--primary*`, `--secondary*`, `--success*`, `--danger*`, `--line*`, `--hi*`, `--glow*`, …) onto Radix scale steps, for dark **and** light (`[data-theme="light"]`), mirroring into `windows/splash.html`.
5. **Do not** change any token name, markup, JS, ID, or print-document CSS.
6. Verify: 14 test suites pass; both themes render correctly; no visual regression vs. baseline screenshots; dev-mode smoke test (sell + print + reports + each modal).

**Why this phase first:** it is the highest-leverage change in the entire redesign (it repaints the whole app), it is **zero-risk to business logic** (CSS-only), it is trivially revertible, and it establishes the color foundation that Phases 2b–2f (icons, buttons, cards, modals, forms) will build on.

Only after 2a lands cleanly should Phase 2b (the emoji → Radix Icons swap) begin — itself low-risk and visually dramatic, and the change most directly responsible for the "modern icons / professional buttons" goal.

---

## Audit Trail

### Files inspected (read-only)

**Configuration & metadata**
- `package.json` · `package-lock.json` · `electron-builder.yml` · `README.md` · `.gitignore` · `opencode.json`

**Electron core**
- `main.js` (699 lines — all 33 IPC channels reviewed) · `preload.js` (109 lines — all 8 `contextBridge` namespaces reviewed) · `launch.js` · `database.js`

**Renderer — entry & markup**
- `index.html` (6,086 lines): `<head>` + fonts/manifest, full `<style>` block (lines 17–1615; `:root` tokens, ~213 component rules, `[data-theme="light"]` overrides), body markup (lines 1629–1878: boot skeleton, topbar, pass banner, update bar, scoreboard, games grid, ledger panels, summary, action bar, `#actOverlay`, `#loginOverlay`, `#overlay`, `#toastWrap`), inline script (lines 1889–6084; ~229 top-level functions inventoried), print-document builders (≈ lines 3440–5483)

**Renderer — external scripts**
- `activation.js` · `login.js` · `permissions.js` · `perm-gate.js` · `accounts.js` · `recovery.js`
- `assets/ticket/ticket-template.js` (+ `.svg`) · `assets/report/daily-report.js` · `assets/vendor/qrcode.js`

**Secondary windows**
- `windows/splash.html` (duplicated token block confirmed) · `windows/update.html`

**Assets**
- `assets/icons/icon.ico` · `assets/images/logo.png` · `assets/fonts/` · `assets/sounds/`

**Tests**
- All 14 suites in `tests/` (inventoried; confirmed logic-level `assert`-based, no visual regression coverage)

**Dependency graph**
- `node_modules` — 231 packages; searched for `react|vue|svelte|solid|preact|radix` → **0 matches**

### Architecture conclusion

Malahy is a **plain HTML/CSS/vanilla-JS Electron app** with a **679 KB monolithic `index.html`**, a strict `contextIsolation` security model, 33 IPC channels behind 8 audited `preload` namespaces, a mature 98-token CSS custom-property design system with full light/dark theming, imperative DOM construction via a custom `el()` helper, a single-`#overlay` modal engine, and **emoji-based icons**. UI and business logic are **co-located in one inline script**, so the redesign must be paint-layer-only.

### Radix compatibility conclusion

- **Radix Primitives — NOT compatible** (React-only; would force a renderer rewrite). Replicate the *behaviors* (focus-trapped dialogs, dismissable layers, menus, tabs, tooltips) as small vanilla-JS modules on the existing `el()`/`showModal()` patterns instead.
- **Radix Themes — NOT practical** (React + its own theme engine + RTL risk; duplicates the existing token system and components). Borrow its design opinions only.
- **Radix Icons — COMPATIBLE & recommended** (framework-agnostic MIT SVG; direct, high-impact replacement for the emoji icons).
- **Radix Colors — COMPATIBLE & recommended** (framework-agnostic CSS custom-property scales; maps cleanly onto the existing token names for both themes).
- **Overall:** adopt the **framework-agnostic half of Radix (Icons + Colors) plus its design language**, and **do not introduce React**.

### Recommended next step

**Phase 2a — Token migration to Radix Colors** on a new `experiment/ui-redesign-radix` worktree off `v2.5.1`: vendor the Radix Colors scales as an asset, remap existing token *values* (names unchanged), mirror into `windows/splash.html`, CSS-only, then verify with the 14 test suites + baseline screenshot diff + dev smoke test. Follow with **Phase 2b — emoji → Radix Icons SVG swap**.

### Confirmations (READ-ONLY compliance)

- ✅ **No project files were modified.** The only file created is this report, `AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md`, which is the explicit deliverable of this phase. `git status --porcelain` before and after shows no change to tracked files (only the pre-existing untracked `qa-ticket-renders/`, untouched).
- ✅ **No packages were installed.** `package.json`, `package-lock.json`, and `node_modules` are unchanged; nothing was added or removed.
- ✅ **No build was performed.** Neither `npm run dist` nor `npm run publish` was executed; no installer, `dist/`, or `asar` artifact was produced.
- ✅ **No commit / push / release was performed.** `git log` still ends at `1d32a21 docs: final release report for v2.5.1`; no commits, pushes, tags, or GitHub releases were created; the application version remains `2.5.1`.
- ✅ **No source, CSS, HTML, JavaScript, Electron configuration, database logic, authentication, permissions, recovery, printer logic, ticket generation/layout, reports, sales, shifts, gifts, activation, or auto-update behavior was changed.** This phase was audit-only, as instructed.
