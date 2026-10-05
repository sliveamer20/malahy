# Lucide Icons — Malahy vendored set (Phase 6)

Small, framework-independent SVG icon set for Malahy. Vanilla HTML/CSS/JavaScript only:
**no React, no `lucide-react`, no npm package, no bundler, no JavaScript icon runtime,
no network requests.**

## 1. Provenance and license

Every glyph here is the **unmodified artwork** of [Lucide Icons](https://lucide.dev/icons),
taken verbatim from the `icons/*.svg` files of the `lucide-icons/lucide` repository.

- **License:** ISC — see [./LICENSE](./LICENSE), verbatim from the upstream repository
  (including the Feather-derived MIT section, which does not apply to these nine glyphs).
- **Copyright:** (c) 2026 Lucide Icons and Contributors. The notice is reproduced in
  `./LICENSE` and in the header comment of every `.svg`, as the license requires.
- Only the SVG artwork is vendored. The upstream React wrapper is **not** used and
  **not** installed — Malahy consumes the raw path/circle/rect geometry directly.

## 2. Files

| File | Purpose |
|---|---|
| `clock.svg` `printer.svg` `refresh-cw.svg` `palette.svg` `tag.svg` `settings.svg` `receipt.svg` `rotate-ccw.svg` `image.svg` | Nine canonical glyphs, exactly as upstream: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps and joins. |
| `LICENSE` | Upstream ISC text. |

No sprite is provided: every glyph is consumed as **inline SVG** (see §3), so a
sprite would be dead weight.

## 3. How these icons are consumed — inline SVG

Phase 6 established by measurement that **both** inline `<svg>` and CSS `mask-image`
render correctly in Malahy's Electron build (Phase 4 reported otherwise; that turned out
to be a screenshot artefact, disproved by per-pixel ink-coverage measurement — see
`AI_REPORTS/PHASE_6_FINAL_ICON_SYSTEM.md`).

Phase 6 nevertheless standardises on **inline SVG** for every newly migrated icon, because:

- it needs no data-URI encoding and no mask subresource,
- `stroke="currentColor"` resolves against the real inherited text colour, so hover,
  disabled and per-theme colours all work with no extra CSS,
- it is inspectable and greppable in the markup.

The renderer loads `index.html` over `file://` with web security enabled
(`main.js`: `contextIsolation: true`, `nodeIntegration: false`). Chromium treats each
`file://` origin as distinct, so an **external** reference such as
`<use href="assets/icons/lucide/clock.svg#...">`, `<img src="*.svg">` or an external
CSS mask subresource is either blocked by the same-origin policy or cannot honour
`currentColor`. Those forms are unusable here.

Each icon is therefore written inline, with its glyph placed in the DOM by a tiny
presentational helper (`ricon()`) next to the existing `el()` helper:

```html
<span class="ic"><svg class="luc" viewBox="0 0 24 24" width="24" height="24"
     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
     stroke-linejoin="round" aria-hidden="true" focusable="false">…</svg></span>
```

## 4. The CSS contract

One rule, in `index.html`:

```css
.ic>.luc{width:15px;height:15px;flex:none;display:block;}
```

`15px` matches the `.ic` box that the emoji previously occupied
(`.ic{font-size:15px}`), so **no button or header changes size** and there is no layout
shift. `display:block` prevents the baseline gap an inline SVG would otherwise open.

`fill`/`stroke` are inherited from CSS, so the glyph takes the surrounding text colour
automatically. No glyph carries `rix-flip`: clock, printer, refresh-cw, palette, tag,
settings, receipt, rotate-ccw and image are all direction-neutral, so RTL needs no
mirroring. (`rotate-ccw` is a *rotate* action, not a directional "back" arrow, and is
conventionally left unmirrored in RTL, matching the existing `reload` decision.)

## 5. Why these nine, and why not Radix

Radix Icons (the 12-glyph set in `../radix/`) is **filled**, 15×15 artwork and stays in
use for the Action Bar and the two add-buttons. Mixing a filled family with an outline
family inside one icon row looks visibly inconsistent, so Phase 6 migrated the whole
Settings-modal icon group to **one** family — Lucide outline — rather than mixing them.

`radix-ui/icons` was enumerated in full (332 glyphs) to check for an outline-free
alternative before choosing Lucide. Radix has **no** `gift`, `receipt`, `tag`, `printer`
or `palette` glyph, and its `color-wheel` / `badge` are only approximate. Lucide has an
exact match for every semantic Phase 6 needed, which is why it was used for the new
group. The existing Radix set is untouched.

## 6. Mapping used in Phase 6

| Emoji | Lucide glyph | Host |
|---|---|---|
| 🕐 | `clock` | Shift Settings section header |
| 🖨️ | `printer` | Printing section header |
| 🔄 | `refresh-cw` | Program Updates section header |
| 🎨 | `palette` | App Appearance section header |
| 🏷️ | `tag` | Venue Identity section header |
| ⚙️ | `settings` | Settings dialog title |
| 🧾 | `receipt` | Print test ticket button |
| ↩️ | `rotate-ccw` | Restore default shift table / restore default logo |
| 🖼️ | `image` | Choose new logo button |

`gift` is vendored but **not yet used**: the gifts panel tile sits directly beside the
expenses tile, whose icon is a filled Radix glyph, and Radix has no gift equivalent.
Swapping only one of that pair would trade an emoji/SVG mix for a fill/stroke mix, so
the tile keeps its emoji until a filled gift glyph is available. Documented, not
overlooked.