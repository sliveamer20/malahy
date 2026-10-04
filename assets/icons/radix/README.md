# Radix Icons — Malahy vendored icon set (Phase 2b-1 pilot)

Small, framework-independent SVG icon system for Malahy. Vanilla HTML/CSS only:
**no React, no `@radix-ui/react-icons`, no npm package, no bundler, no JavaScript,
no network requests.**

## 1. Provenance and license

Every glyph here is the **unmodified artwork** of [Radix Icons](https://radix-ui.com/icons),
taken from the `packages/radix-icons/icons/*.svg` files of the `radix-ui/icons`
repository (published as `@radix-ui/react-icons`).

- **License:** MIT — see [./LICENSE](./LICENSE), verbatim from the upstream repository.
- **Copyright:** (c) 2022 WorkOS. The copyright notice and permission notice are
  reproduced in `LICENSE` and in the header comment of every `.svg` file, as the MIT
  license requires.
- Only the SVG artwork is vendored. The upstream React wrapper is **not** used and
  **not** installed — Malahy consumes the raw `<path>` data directly.

## 2. Files

| File | Purpose |
|---|---|
| `*.svg` (12) | One canonical glyph per file, exactly as upstream: `width="15" height="15" viewBox="0 0 15 15"`, one `<path fill="currentColor">`. |
| `sprite.svg` | All 12 glyphs as `<symbol id="rix-<name>">`. Catalog of the set and ready for `<use>` if a renderer ever needs it. |
| `LICENSE` | Upstream MIT text. |

The pilot set (only the icons the Action Bar needs — nothing more):

`download`, `reload`, `file-text`, `lock-open-1`, `exit`, `lock-closed`,
`clipboard`, `cube`, `bar-chart`, `group`, `clock`, `gear`

## 3. How icons are consumed — inline SVG

Malahy's renderer loads `index.html` over the `file://` protocol with web security
enabled (`main.js`: `contextIsolation: true`, `nodeIntegration: false`, no
`webSecurity: false`). Chromium treats each `file://` origin as distinct, so an
**external** reference such as `<use href="sprite.svg#rix-gear">` is blocked by the
same-origin policy and the icon would silently not render. `<img src="*.svg">` would
load, but cannot honour `currentColor`, so it cannot follow the button's text colour,
hover brightening, or the disabled dim.

The system therefore uses **inline SVG** — the static-asset approach that needs no
JavaScript at all. The Action Bar embeds the glyph's single `<path>` directly:

```html
<span class="ic"><svg class="rix" viewBox="0 0 15 15" aria-hidden="true" focusable="false"><path d="…" fill="currentColor"/></svg></span>
```

- `fill="currentColor"` + the CSS `color:inherit` below make each glyph take the
  button's text colour, so hover (`filter: brightness(1.1)` on `.abtn:hover`) and the
  disabled state (`button:disabled{opacity:.5}`) apply to the icon automatically.
- `aria-hidden="true"` keeps the glyph decorative — the button's text label remains the
  accessible name. No text label was replaced by an icon.
- The `.ic` span is already `inline-flex` with centred children and `.abtn` is
  `inline-flex` with `gap:9px`, so the SVG drops in with no layout change.

To add an icon later: drop the upstream `.svg` here, add it to `sprite.svg`, and inline
its `<path>` with `class="rix"`.

## 4. The CSS contract

Sizing, alignment and RTL direction are centralised in three rules in `index.html`
(near the existing `/* ===== Actions ===== */` block):

```css
.rix{flex:none;display:block;color:inherit;fill:currentColor;}
.abtn .ic .rix{width:15px;height:15px;}
[dir="rtl"] .rix-flip{transform:scaleX(-1);}
```

`15px` matches the pre-existing `.abtn .ic{font-size:15px}` the emoji used, so the
icon box — and therefore the button size — is unchanged.

## 5. RTL rule for directional glyphs

The application is Arabic and the document is `<html lang="ar" dir="rtl">`. Two glyphs
carry a horizontal direction and are marked `rix-flip` so they mirror under RTL:

| Glyph | Why mirrored |
|---|---|
| `exit` | The arrow points **right** (out of the door) in LTR. In RTL the "way out" is to the left, so it is mirrored. |
| `bar-chart` | Bars ascend toward the right, i.e. LTR reading order. In RTL, charts are read right-to-left, so the glyph is mirrored. |

Deliberately **not** mirrored, following the same convention as Material/Fluent RTL
guidance for process glyphs:

| Glyph | Why not mirrored |
|---|---|
| `reload` | A cyclic refresh arrow — direction is not meaningful; refresh glyphs are conventionally left as-is in RTL. |
| `download` | Vertical motion only (arrow into a tray) — identical in both directions. |

All other glyphs in the set (`file-text`, `lock-open-1`, `lock-closed`, `clipboard`,
`cube`, `group`, `clock`, `gear`) are symmetric or rotationally symmetric and need no
mirroring.

## 6. Action Bar mapping (the pilot)

Replacing decorative emoji only. Button `class`, `id`, `data-perm`, `onclick`, text and
order are all untouched.

| # | Button action | Label (AR) | Emoji → Radix glyph | `rix-flip` |
|---|---|---|---|---|
| 1 | `manualSave()` | حفظ | 💾 → `download` | — |
| 2 | `requestRestart()` | إعادة تعيين اليوم | 🔄 → `reload` | — |
| 3 | `printTodayReport()` | طباعة تقرير اليوم | 🖨️ → `file-text` | — |
| 4 | `openChangePass()` | تغيير كلمة السر | 🔑 → `lock-open-1` | — |
| 5 | `malahyLogout()` | تسجيل الخروج | 🚪 → `exit` | yes |
| 6 | `malahyChangeMyPass()` | كلمة المرور الخاصة بي | 🔐 → `lock-closed` | — |
| 7 | `openHistory()` | السجل | 📋 → `clipboard` | — |
| 8 | `openGameMgmt()` | إدارة الألعاب والتذاكر | 🎮 → `cube` | — |
| 9 | `openReports()` | التقارير والإحصائيات | 📊 → `bar-chart` | yes |
| 10 | `openEmployees()` | الموظفون | 👥 → `group` | — |
| 11 | `openDailyReg()` | التسجيل اليومي للموظفين | 🕐 → `clock` | — |
| 12 | `openSettings()` | الإعدادات | ⚙️ → `gear` | — |

Selection notes:

- **Print → `file-text`, not a printer.** Radix Icons has **no** printer glyph (verified
  against the full 332-icon set). The button prints *today's report*, so the document
  glyph is the closest honest representation.
- **Games/tickets → `cube`.** Radix Icons has no controller or ticket glyph. `cube`
  reads as a discrete sellable item and stays distinct from every other glyph.
- **Employees → `group`** (two figures), not `person` — the label is plural.
- **The two password buttons stay distinguishable:** admin-changes-a-credential keeps an
  *open* padlock (`lock-open-1`), own credential keeps a *closed* one (`lock-closed`).
