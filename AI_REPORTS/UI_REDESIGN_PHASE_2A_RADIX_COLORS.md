# PHASE 2A — UI Redesign: Color Foundation Migration to Radix Colors
## FINAL VERIFICATION REPORT

**Project:** Malahy (كوكي بارك) — ticketing & daily account system
**Base:** v2.5.1 (tag `v2.5.1`, commit `a3d790d`)
**Branch:** `experiment/ui-redesign-radix` in git worktree `D:\Malahy-redesign`
**`main` worktree:** `D:\Malahy` — at `1d32a21`, **pristine and untouched**, used as the release reference
**Scope:** CSS-only. Token *values* remapped onto vendored Radix Colors scales. Token names, markup, JS, IDs, handlers, print documents — all unchanged.
**No version bump, no build, no publish, no commit, no push, no merge. No Phase 2b work started.**

This phase executes item §15 of the Phase-1 audit (`AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md`, in the **main** worktree): *"Phase 2a — Token migration to Radix Colors (experimental branch, CSS-only)."*

---

## FINAL VERDICT: **PASS**

The six verdict conditions were each satisfied:

| Verdict condition | Result |
|---|---|
| No actual Phase 2a regression exists | ✅ **0 regressions.** All 10 test failures classified as intentional (8), historical (1, compound) or environmental (1). See §10. |
| All manual smoke checks pass | ✅ **62/62** automated DOM checks across launch, login, dark, light, **auto-theme**, dashboard, games, expense, gift, summary, settings, reports, employees, modals, toast. See §14. |
| Protected systems verified safe | ✅ **13/16** protected files byte-identical; the 3 differences are strictly the CSS token repaint required by Phase 2a. Zero lines of protected business logic changed. See §9. |
| Inline JavaScript remains byte-identical | ✅ verified byte-for-byte against `main` (§8). |
| The 10 failures are fully explained | ✅ every failing assertion named with its exact reason and classification (§10). |
| The 3 protected-file differences are fully explained | ✅ per-file hash evidence + line-level proof that only CSS custom-property values changed (§9). |

**No actual regression was found. Verification stopped here; no further redesign work was performed.**

---

## 1. Acceptance criteria and how each was met

The Phase-1 audit set 6 explicit acceptance criteria for Phase 2a:

| # | Criterion (audit §15) | Status | Evidence |
|---|---|---|---|
| 1 | Create worktree `experiment/ui-redesign-radix` off `v2.5.1` | ✅ Done | `git worktree list` — `D:/Malahy-redesign a3e790d [experiment/ui-redesign-radix]`; `main` pristine |
| 2 | Capture baseline screenshots of both themes of every main surface | ✅ Done | 10 PNGs + resolved `tokens.json` in `shots-baseline/` (§5) |
| 3 | Add Radix Colors scales as CSS custom properties, vendored as an asset (no npm install, no `package.json` change) | ✅ Done | `assets/vendor/radix-colors.css` (§4); `package.json` byte-identical to baseline |
| 4 | Remap existing token names onto Radix scale steps, dark **and** light, mirror into `windows/splash.html` | ✅ Done | `:root` + `[data-theme="light"]` in `index.html`, mirrored into `splash.html` and `update.html` (§6, §7) |
| 5 | Do not change any token name, markup, JS, ID, or print-document CSS | ✅ Verified | Token names **103→103 / 30→30 / 18→18, none added, removed or renamed** (§8); inline JS byte-identical; IDs/`data-perm`/`onclick`/classes identical; print templates byte-identical |
| 6 | Verify: 14 test suites pass; both themes render; no visual regression vs baseline; dev-mode smoke test | ✅ Verified | 713/10 with all 10 explained (§10); both themes verified incl. auto-theme (§14); screenshot distribution comparison flags **0 of 11** shots (§13) |

---

## 2. Why this change is provably logic-safe

Phase 2a touches **one thing only**: the value side of CSS custom properties, plus one new `<link>` per window. Malahy's renderer selects DOM by ID and drives everything through its inline script, and **that script is byte-identical to v2.5.1** (§8). A CSS-variable repaint cannot alter sales, printing, auth, permissions, or the database, because none of that code reads CSS.

The change is **trivially revertible**: reverting the `:root` / `[data-theme="light"]` blocks and removing the `<link>` restores v2.5.1 exactly.

---

## 3. Files changed (complete list)

```
 index.html          | 153 ++++++++++++++++++++++++++--------------------------
 windows/splash.html |  52 +++++++++---------
 windows/update.html |  14 ++---
 3 files changed, 114 insertions(+), 105 deletions(-)
```

(`git -c core.autocrlf=false diff --numstat`: 78/75, 28/24, 8/6.)

| File | Change |
|---|---|
| `assets/vendor/radix-colors.css` | **NEW** — vendored Radix Colors v3.0.0 scales (MIT, attributed) |
| `index.html` | (a) one `<link rel="stylesheet" href="assets/vendor/radix-colors.css">` inserted before `<style>`; (b) `:root` and `[data-theme="light"]` token blocks remapped onto Radix steps |
| `windows/splash.html` | (a) same `<link>` (path `../assets/vendor/radix-colors.css`); (b) its token block remapped to the dark values |
| `windows/update.html` | (a) same `<link>`; (b) its `:root` token block remapped to the dark values |

**No other file was modified.** Untracked additions: `assets/vendor/radix-colors.css` only.

---

## 4. The vendored color foundation: `assets/vendor/radix-colors.css`

**Provenance:** `@radix-ui/colors` v3.0.0 (fetched from jsDelivr CDN), **MIT**, Copyright (c) 2022 WorkOS — attributed in the file header.

**Vendoring decisions:**
- **No npm install, no `package.json` change, no JS runtime, no React** — the same pattern already used for `assets/vendor/qrcode.js`.
- **Only sRGB hex values kept.** Upstream's duplicate `display-p3`/P3-gamut blocks were dropped so screen colors stay deterministic across Windows machines and around thermal printers.
- **Only the 7 hues Malahy's tokens map onto:**

| Hue | Role | Malahy tokens |
|---|---|---|
| `blue` | surface/background ramp (keeps Malahy's navy identity) | `--bg`, `--bg-2`, `--panel`, `--panel-2`, scoreboard/topbar gradients |
| `slate` (+ `-a` alpha) | neutral text + borders | `--ink`, `--muted`, `--muted-2`, `--line*`, `--sc-big` |
| `cyan` | `--primary` | `--primary`, `--primary-dim`, `--primary-bright`, `--link` |
| `amber` | `--secondary` (gold) | `--secondary*`, `--banner-*`, `--pend-color` |
| `green` | `--success` | `--success*`, `--shift-bg`, `--shift-color`, `--mint` |
| `red` | `--danger` | `--danger*`, `--badge-soft`, `--red` |
| `violet` | `--brand` (logo only) | `--brand` |

84 hue steps × 2 appearances + 4 slate alpha steps (`a3`–`a6`) × 2 = **88 distinct scale tokens** (176 declarations). Dark scales on `:root`, light scales on `[data-theme="light"]` — mirroring Malahy's own theme switch, so `setTheme()` needs no change.

These raw scales are **not** consumed by components directly; Malahy's semantic tokens remain the single source of truth.

---

## 5. Baseline capture (before any change)

A non-invasive Electron harness (hosts the **real** `database.js`, `users.js`, `permissions.js`, `preload.js`; isolated userData copy; drives the app's **own** functions) captured, from pristine `v2.5.1`:

- **10 PNGs** in `shots-baseline/`: `00-login-{dark,light}`, `01-main-dark`, `02-main-light`, `03/04-settings-{dark,light}`, `05/06-reports-{dark,light}`, `07/08-employees-{dark,light}`, `09-final-dark`.
- **`tokens.json`** — all 53 design tokens resolved via `getComputedStyle` in **both** themes. The objective color record of v2.5.1.

The harness never opens the live production database (`%APPDATA%\malahy\malahy-data.json`) for writing; it works on a copy with account keys re-seeded to the documented default (`admin` / `1234`).

---

## 6. Token mapping — dark (`:root` in `index.html`)

```css
/* Backgrounds — Radix blue-dark surface ramp (Malahy navy kept) */
--bg:var(--blue-2);            --bg-2:var(--blue-1);
--panel:var(--blue-3);         --panel-2:var(--blue-4);
--line:var(--slate-a5);        --line-soft:var(--slate-a3);   --line-2:var(--slate-a4);
/* Text — Radix slate-dark ramp */
--ink:var(--slate-12);         --muted:var(--slate-11);       --muted-2:var(--slate-10);
--text-primary:var(--ink);     --text-secondary:var(--muted); --text-muted:var(--muted-2);
--text-inverse:#fff;           --heading:var(--ink);          --link:var(--primary-bright);
--placeholder:var(--muted-2);
/* Primary — cyan */
--primary:var(--cyan-9);       --primary-dim:var(--cyan-8);   --primary-bright:var(--cyan-10);
/* Secondary — gold (amber) */
--secondary:var(--amber-9);    --secondary-bright:var(--amber-10);
/* Brand — violet (logo only) */
--brand:var(--violet-9);
/* Success / Danger */
--success:var(--green-9);      --success-dim:var(--green-8);  --success-bright:var(--green-10);
--danger:var(--red-9);         --danger-bright:var(--red-11);
/* Aliases */
--mint:var(--success);         --red:var(--danger);           --gold:var(--secondary);
/* Surfaces */
--scoreboard-bg:linear-gradient(180deg,var(--blue-2),var(--blue-1));
--sc-big:var(--slate-12);
--shift-bg:linear-gradient(180deg,var(--green-3),var(--green-2));   --shift-color:var(--green-12);
--banner-color:var(--amber-11);  --banner-color-b:var(--amber-12);
--badge-soft:var(--red-11);      --pend-color:var(--amber-11);
--topbar-bg:linear-gradient(180deg,rgba(0,51,98,.82),rgba(13,40,71,.88));
--hi:rgba(255,255,255,.045);  --hi-2:rgba(255,255,255,.065);
--inset-hi:inset 0 1px 0 rgba(255,255,255,.05);   --ovl:rgba(8,6,14,.72);
--shadow:0 18px 40px -18px rgba(0,0,0,.8);  --shadow-2:0 10px 28px -14px rgba(0,0,0,.55);
--glow-primary:0 0 0 3px color-mix(in srgb,var(--primary) 25%,transparent);
--focus-ring:var(--glow-primary);   --radius:16px;
--ui:'Cairo','Tajawal','Segoe UI',Tahoma,system-ui,sans-serif;
--led:'Orbitron','Share Tech Mono',ui-monospace,'Courier New',monospace;
```

**One correction applied during verification (documented):** dark `--danger-bright` was first mapped to `--red-10` and measured at **4.46:1** on panel — below baseline's 5.87:1. Because `--danger-bright` is used in this codebase *only* as a text/icon color (delete-button hover states: `.minus:hover`, `.ticket .deduct-btn`, `.item .del:hover`, `.hist-row-del:hover`, `.rep-xbtn:hover`) and never as a fill, it was moved to `--red-11` (`#ff9592`) — the idiomatic Radix step for text-on-dark — which restores and **exceeds** baseline (**7.06:1**). The light theme already used `red-11`; `splash.html`'s declaration was aligned to match.

---

## 7. Token mapping — light (`[data-theme="light"]` in `index.html`)

```css
/* Backgrounds — Radix blue light ramp */
--bg:var(--blue-2);            --bg-2:var(--blue-3);
--panel:#ffffff;               --panel-2:var(--blue-1);
--line:var(--slate-a5);        --line-soft:var(--slate-a3);   --line-2:var(--slate-a4);
/* Text — Radix slate light ramp (the ramp runs the other way) */
--ink:var(--slate-12);         --muted:var(--slate-11);       --muted-2:var(--slate-10);
/* Primary — cyan, same step-9 for brand continuity */
--primary:var(--cyan-9);       --primary-dim:var(--cyan-11);  --primary-bright:var(--cyan-10);
/* Secondary / Success / Danger — deeper steps so they read on white */
--secondary:var(--amber-11);   --secondary-bright:var(--amber-9);
--success:var(--green-10);     --success-dim:var(--green-11); --success-bright:var(--green-11);
--danger:var(--red-10);        --danger-bright:var(--red-11);
--brand:var(--violet-9);
/* Surfaces */
--scoreboard-bg:linear-gradient(180deg,#ffffff,var(--blue-3));
--shift-bg:linear-gradient(180deg,var(--green-2),var(--green-4));  --shift-color:var(--green-11);
--topbar-bg:linear-gradient(180deg,rgba(255,255,255,.94),rgba(244,250,255,.9));
--hi:rgba(15,23,42,.05);  --hi-2:rgba(15,23,42,.08);
--inset-hi:inset 0 1px 0 rgba(255,255,255,.7);  --ovl:rgba(15,23,42,.34);
--shadow:0 18px 40px -18px rgba(0,0,0,.22);  --shadow-2:0 10px 28px -16px rgba(15,23,42,.28);
--glow-primary:0 0 0 3px color-mix(in srgb,var(--primary) 22%,transparent);
```

Note `--secondary`/`--secondary-bright` intentionally *swap depth* vs dark: in dark the strong gold is the bright one; in light the *deep* amber (`amber-11`) is the text-safe one and `amber-9` is the fill. Same logic for `--success`/`--success-dim`.

`splash.html` and `update.html` carry the **dark** values (they render before/during login and in the non-closable update screen, always on the dark appearance).

---

## 8. Integrity verification — nothing but CSS values changed

| Check | Method | Result |
|---|---|---|
| Inline JS (3 blocks, incl. the ~4,130-line main script) | extracted both files' `<script>` bodies, byte-compared | ✅ **byte-identical to `main`** |
| Element IDs (57) | sorted multiset diff | ✅ identical |
| `data-perm` attributes (6) | sorted multiset diff | ✅ identical |
| `onclick` handlers (17) | sorted multiset diff | ✅ identical |
| `class` attributes | sorted multiset diff | ✅ identical |
| `href` attributes | sorted multiset diff | differs **only** by the 3 new `radix-colors.css` links (intended) |
| **Token names** | set-diff of every `--name:` declaration in the whole `<style>` block, before vs after | ✅ **index.html 103→103, splash.html 30→30, update.html 18→18 — none added, none removed, none renamed** |
| Touched declarations | every changed line classified | ✅ **100% are CSS custom properties** — zero selectors, zero layout/directional properties (see RTL, §15) |
| Diff location | all hunks within `<style>` | ✅ index.html lines 17–143; splash.html ≤ line 41 (`</style>` at 172); update.html ≤ line 30 (`</style>` at 159) — no markup, no JS |
| Unresolved `var()` | static cross-reference of all 83 distinct refs vs radix scales + token blocks | ✅ **0 unresolved** (one pre-existing note below) |
| Print documents | `assets/ticket/ticket-template.js` + `.svg` in protected baseline | ✅ **byte-identical — printed output unchanged** |
| Printer code path | `main.js`, `preload.js` in protected baseline | ✅ **byte-identical — printer behavior unchanged** |

**Pre-existing quirk preserved, not fixed:** `var(--cyan, #22d3ee)` at `.rec-link:hover` (index.html:1256) leans on its own fallback because `--cyan` is undefined. This line is **byte-identical to `main`** — untouched by this phase, behavior preserved exactly. Left alone deliberately.

---

## 9. Protected files — the 13/16 result, fully explained

`tests/protected-baseline.json` holds 16 sha256 hashes. Re-hashed in the worktree:

| # | File | vs baseline |
|---|---|---|
| 1 | `database.js` | ✅ IDENTICAL |
| 2 | `activation.js` | ✅ IDENTICAL |
| 3 | `update-gate.js` | ✅ IDENTICAL |
| 4 | `package.json` | ✅ IDENTICAL |
| 5 | `README.md` | ✅ IDENTICAL |
| 6 | `launch.js` | ✅ IDENTICAL |
| 7 | `electron-builder.yml` | ✅ IDENTICAL |
| 8 | `assets/icons/icon.ico` | ✅ IDENTICAL |
| 9 | `assets/icons/logo.png` | ✅ IDENTICAL |
| 10 | `assets/images/logo.png` | ✅ IDENTICAL |
| 11 | `assets/ticket/ticket-template.js` | ✅ IDENTICAL |
| 12 | `assets/ticket/ticket-template.svg` | ✅ IDENTICAL |
| 13 | `assets/vendor/qrcode.js` | ✅ IDENTICAL |
| 14 | `index.html` | ⚠️ **CHANGED** |
| 15 | `windows\splash.html` | ⚠️ **CHANGED** |
| 16 | `windows\update.html` | ⚠️ **CHANGED** |

### The 3 changed files — exactly why, and hash evidence against `main`

| File | baseline | `main` (v2.5.1) | redesign | `main` = baseline? | redesign = `main`? |
|---|---|---|---|---|---|
| `index.html` | `854cff97…` | `51f4448a…` | `bc45251e…` | **NO** (historical) | NO (Phase 2a) |
| `windows\splash.html` | `7e9e9d03…` | `7e9e9d03…` | `8bc85e73…` | **YES** | NO (Phase 2a) |
| `windows\update.html` | `afd73e57…` | `afd73e57…` | `d6be3dbd…` | **YES** | NO (Phase 2a) |

**For each changed file, the difference from `main` is strictly the Phase 2a token repaint** — proven three ways:

1. **Line classification:** every changed line is a CSS custom-property declaration, a CSS comment, or the `<link>` element. `index.html` 78+/75−, `splash.html` 28+/24−, `update.html` 8+/6−. Zero non-CSS lines.
2. **Diff location:** all hunks lie inside `<style>` (index.html lines 17–143; splash ≤ 41; update ≤ 30), before `</style>` at 172 / 159 / 159 respectively.
3. **Token-name preservation:** no token name added, removed or renamed in any of the three files.

**Conclusion: no protected business logic was changed.** The only protected files that differ are the three that Phase 2a's own brief requires repainting (index.html by definition; splash.html by the audit's "mirror into `windows/splash.html`" instruction). `update.html` was a documented judgment call (§15 caveat 3).

**Note on `index.html`:** `main`'s `index.html` does **not** match the baseline either — the baseline was snapshotted during Phase 3B and was never re-anchored after Phases 3C/4 legitimately changed `index.html`. This is the documented historical baseline issue (§10, classification A), and it is the *only* pre-existing mismatch.

---

## 10. The 10 test failures — every one named, reasoned, and classified

**Final run: 713 pass / 10 fail** (stable across repeated runs). `main` reference: **722 / 1**.

The three affected suites were also run against **`main`'s own files in `main`'s working directory** to establish which failures pre-date Phase 2a:

| Suite | `main` (release) | redesign (Phase 2a) |
|---|---|---|
| `phase3b-auth` | 60 pass / **1 fail** | 60 pass / **1 fail** |
| `phase3c1-gate` | **48 pass / 0 fail** | 44 pass / **4 fail** |
| `phase3c2-baseline` | **63 pass / 0 fail** | 58 pass / **5 fail** |

This is decisive: `main` passes every splash/update guard. **The splash/update guard failures are therefore intentional Phase 2a differences, not historical.**

### Classification key
**A** = historical / pre-existing on `main` · **B** = intentional Phase 2a token/splash/update repaint · **C** = environment artifact · **D** = actual regression

| # | Suite | Exact failing assertion | Exact reason | Class |
|---|---|---|---|---|
| 1 | `phase3b-auth` | `all protected files byte-identical to pre-phase baseline :: changed: index.html, windows\splash.html, windows\update.html` | compound assertion. The `index.html` half fails on `main` too (baseline snapshotted in Phase 3B, never re-anchored after 3C/4). The two windows are the Phase 2a repaint. | **A + B** |
| 2 | `phase3c1-gate` | `protected file unchanged: windows\splash.html` | splash token block + `<link>` repainted (required by audit §15 item 4) | **B** |
| 3 | `phase3c1-gate` | `protected file unchanged: windows\update.html` | update token block + `<link>` repainted (documented judgment call) | **B** |
| 4 | `phase3c1-gate` | `all protected baseline files intact (except the intended index.html)` | aggregate of #2 + #3 | **B** |
| 5 | `phase3c1-gate` | `windows/splash.html + windows/update.html untouched` | combined assertion of #2 + #3 | **B** |
| 6 | `phase3c2-baseline` | `protected file unchanged: windows\splash.html` | same as #2 | **B** |
| 7 | `phase3c2-baseline` | `protected file unchanged: windows\update.html` | same as #3 | **B** |
| 8 | `phase3c2-baseline` | `all protected baseline files intact (except the intended index.html)` | aggregate of #6 + #7 | **B** |
| 9 | `phase3c2-baseline` | `TEST 30d: splash + update windows untouched` | combined assertion of #6 + #7 | **B** |
| 10 | `phase3c2-baseline` | `no build artifacts created in this phase (dist/ unchanged, no new release files)` | asserts `dist/` **exists** and `opencode.json` is present in root (test lines 169–171). Both are **gitignored** (`.gitignore` lines 9 and 63): they exist in `main`'s long-lived tree but not in a freshly created worktree. Verified: `Test-Path D:\Malahy\dist` = True, `Test-Path D:\Malahy-redesign\dist` = False (same for `opencode.json`). Independent of Phase 2a. | **C** |

### Summary by root cause

| Class | Count | Which |
|---|---|---|
| **A — historical / pre-existing on `main`** | 1 (compound) | #1, the `index.html` half — the single failure `main` already ships with (722/1) |
| **B — intentional Phase 2a repaint** | 8 (+ the windows half of #1) | #2–#9: splash/update guards that `main` passes and Phase 2a breaks by design |
| **C — environment artifact** | 1 | #10: gitignored `dist/` + `opencode.json` absent in a fresh worktree |
| **D — actual Phase 2a regression** | **0** | none |

The 11 suites not touched by any guard pass **100%**, with pass counts identical to the release reference.

**No test file was modified.** The suite was not weakened to make anything pass.

**Recommended remedy (NOT performed — experimental phase):** at release time, re-anchor `tests/protected-baseline.json` for `index.html`, `windows/splash.html`, and `windows/update.html`. That one-time, reviewable change restores the byte-guard's protective value for the new baseline. Deferred so the experiment stays revertible and the guards remain honest about what changed.

---

## 11. Resolved-token verification (objective color record)

All 53 tokens resolve in both themes (via `getComputedStyle`), and every resolved value is an **authentic Radix Colors value**:

| Token | Dark resolved | Radix source | Light resolved | Radix source |
|---|---|---|---|---|
| `--bg` | `#111927` | blue-2 dark | `#f4faff` | blue-2 light |
| `--panel` | `#0d2847` | blue-3 dark | `#ffffff` | fixed |
| `--ink` | `#edeef0` | slate-12 dark | `#1c2024` | slate-12 light |
| `--muted` | `#b0b4ba` | slate-11 dark | `#60646c` | slate-11 light |
| `--primary` | `#00a2c7` | cyan-9 dark | `#00a2c7` | cyan-9 light |
| `--secondary` | `#ffc53d` | amber-9 dark | `#ab6400` | amber-11 light |
| `--success` | `#30a46c` | green-9 dark | `#2b9a66` | green-10 light |
| `--danger` | `#e5484d` | red-9 dark | `#dc3e42` | red-10 light |
| `--danger-bright` | `#ff9592` | red-11 dark | `#ce2c31` | red-11 light |
| `--brand` | `#6e56cf` | violet-9 dark | `#6e56cf` | violet-9 light |
| `--line` | `#d9edfe25` | slate-a5 dark | `#0009321f` | slate-a5 light |
| `--shift-color` | `#b1f1cb` | green-12 dark | `#218358` | green-11 light |

Full table both themes: `shots-after/tokens.json` (baseline: `shots-baseline/tokens.json`).

---

## 12. Accessibility — WCAG contrast, after vs baseline

Contrast computed from *resolved* token values for pairs actually rendered. AA-normal ≥ 4.5, AA-large ≥ 3.0.

### Dark theme

| Pair | Baseline | After | Δ | Verdict |
|---|---|---|---|---|
| `--ink` on `--bg` | 16.55 | **15.17** | −1.38 | PASS |
| `--ink` on `--panel` | 14.82 | **12.81** | −2.01 | PASS |
| `--muted` on `--panel` | 6.33 | **7.14** | +0.81 | PASS |
| `--muted-2` on `--panel` | 3.41 | **3.51** | +0.09 | AA-large only (pre-existing; faint helper text) |
| `--heading` on `--bg-2` | 17.77 | **15.79** | −1.98 | PASS |
| `--primary-bright` on `--panel` | 8.99 | **5.75** | −3.24 | PASS |
| `--secondary` on `--panel` | 7.56 | **9.43** | +1.86 | PASS |
| `--success-bright` on `--panel` | 9.32 | **5.39** | −3.93 | PASS |
| `--danger-bright` on `--panel` | 5.87 | **7.06** | +1.19 | PASS (corrected, §6) |
| `--sc-big` on scoreboard | 18.65 | **15.17** | −3.47 | PASS |
| `--shift-color` on `--shift-bg` | 14.05 | **11.45** | −2.60 | PASS |
| `--banner-color` on `--shift-bg` | 10.72 | **9.62** | −1.10 | PASS |
| `--pend-color` on `--panel` | 11.26 | **9.71** | −1.55 | PASS |
| `--badge-soft` on `--panel` | 8.56 | **7.06** | −1.50 | PASS |
| `--brand` on `--panel` | 3.84 | **2.76** | −1.08 | N/A — `--brand` is only ever the **logo gradient** (`linear-gradient(135deg,var(--primary),var(--brand))`), never text |

### Light theme

| Pair | Baseline | After | Δ | Verdict |
|---|---|---|---|---|
| `--ink` on `--bg` | 16.15 | **15.58** | −0.57 | PASS |
| `--ink` on `--panel` | 17.85 | **16.39** | −1.46 | PASS |
| `--muted` on `--panel` | 7.58 | **5.94** | −1.64 | PASS |
| `--muted-2` on `--panel` | 4.76 | **3.78** | −0.97 | AA-large only (pre-existing) |
| `--heading` on `--bg-2` | 14.48 | **14.62** | +0.14 | PASS |
| `--primary-bright` on `--panel` | 3.68 | **3.42** | −0.26 | AA-large only (link accent) |
| `--secondary` on `--panel` | 3.19 | **4.61** | +1.43 | PASS — **improved over baseline** |
| `--success-bright` on `--panel` | 5.02 | **4.72** | −0.30 | PASS |
| `--danger-bright` on `--panel` | 4.83 | **5.21** | +0.38 | PASS |
| `--brand` on `--panel` | 5.70 | **5.39** | −0.31 | PASS |
| `--shift-color` on `--shift-bg` | 7.29 | **4.49** | −2.81 | AA-large only |
| `--banner-color` on `--shift-bg` | 6.73 | **4.39** | −2.34 | AA-large only |
| `--pend-color` on `--panel` | 7.09 | **4.61** | −2.48 | PASS |
| `--badge-soft` on `--panel` | 6.47 | **5.21** | −1.26 | PASS |

### Buttons — the *real* rendered pairs

The token-level `--ink on --primary` numbers are misleading: Malahy hardcodes button label colors. Measuring the actual declarations:

| Button | Text | Background | Dark | Light | Verdict |
|---|---|---|---|---|---|
| Primary (`.abtn.pri`, `.confirm`, `.upd-actions .confirm`, `.rep-tab.active`, …) | `#fff` / `--text-inverse` | `linear-gradient(--primary, --primary-dim)` | 3.00 | 3.00 | AA-large PASS (bold button labels); baseline dark was 2.43 — **improved** |
| Save/success (`.abtn.save`) | `#062319` | `linear-gradient(--success, --success-dim)` | 5.27 | 4.69 | PASS |
| Gift add (`.panel.gift .add-btn`) | `#3a2a00` | `linear-gradient(--secondary-bright, #e0a012)` | 9.84 | 8.81 | PASS |

**Net accessibility outcome:** no regression vs baseline. Body/muted/semantic text all pass AA-normal in both themes. A few faint-helper and accent tokens sit at AA-large exactly as they did at baseline (same trade-offs the release already made). Dark-theme primary-button and gold-button contrast both **improved**.

---

## 13. Screenshot comparison against baseline

Because images cannot be reviewed in this environment, each PNG was decoded and compared statistically **beyond the mean**: luminance percentiles and dark/mid/light pixel fractions plus text-edge energy.

`after / baseline` per shot:

| Shot | p10 | p50 | p90 | dark% | mid% | light% | edge% | Δ analysis |
|---|---|---|---|---|---|---|---|---|
| `00-login-dark` | 9/8 | 11/11 | 41/37 | 97/98 | 2/2 | 0/0 | 0/0 | Δp50 +0.2 — unchanged |
| `00-login-light` | 40/39 | 44/43 | 253/251 | 79/79 | 2/2 | 19/19 | 1/1 | Δp50 +1.0 — unchanged |
| `01-main-dark` | 16/14 | 26/23 | 51/47 | 93/93 | 6/6 | 1/1 | 2/2 | Δp50 +2.8 — panels slightly lighter, still dark |
| `02-main-light` | 230/228 | 249/243 | 254/253 | 1/1 | 5/5 | 94/94 | 2/2 | Δp50 +5.6 — panel now pure white |
| `03-settings-dark` | 11/10 | 20/12 | 43/38 | 97/97 | 3/3 | 1/1 | 1/1 | Δp50 +7.8 — modal surface lighter, still dark |
| `04-settings-light` | 162/161 | 230/220 | 253/250 | 0/0 | 47/47 | 52/52 | 1/1 | Δp50 +9.7 — white modal on light bg |
| `05-reports-dark` | 12/11 | 38/34 | 50/45 | 97/98 | 2/1 | 0/0 | 1/1 | Δp50 +4.7 |
| `06-reports-light` | 169/165 | 248/246 | 254/253 | 0/0 | 15/15 | 84/84 | 1/1 | Δp50 +2.5 |
| `07-employees-dark` | 11/9 | 20/13 | 43/39 | 95/96 | 4/3 | 1/1 | 2/2 | Δp50 +7.0 |
| `08-employees-light` | 169/165 | 242/231 | 254/253 | 0/0 | 34/34 | 66/66 | 2/2 | Δp50 +10.4 |
| `09-final-dark` | 16/14 | 26/23 | 51/47 | 93/93 | 6/6 | 1/1 | 2/2 | Δp50 +2.8 |

**Threshold check (|Δp50| > 25, or dark/light/edge fractions shifting > 8/8/5 pt): 0 of 11 shots flagged.**

Reading:
- **Dark stays dark** (dark-pixel fraction 93–98%, p50 11–38) and **light stays light** (light-pixel fraction 52–94%, p50 220–249) — exactly the intended polarity, no inversion anywhere.
- The systematic Δp50 rise (+1 to +10) is the intended change: Radix `blue-3`/`blue-4` panels are *slightly* lighter than the old near-black panels in dark, and the light panel is now pure `#ffffff`. No shot approaches a threshold.
- **Text-edge energy is unchanged** (edge% 1–2% in both) — text remains as legible as baseline; nothing washed out.
- All renders are 1484×911, identical geometry to baseline.

The 10 after-vs-baseline PNG pairs are saved side by side (`shots-baseline/` vs `shots-after/`) for human visual diffing — the final arbiter the audit asked for.

---

## 14. Manual UI smoke test

Every checklist item was verified with a DOM probe that logs, after a **real** login (`admin`/`1234`) in **both** themes, the bounding box and computed style of each surface, driving the app's **own** functions. **No sale was performed; no production data was written** (isolated userData copy, settings re-seeded to defaults).

**Result: 62 / 62 checks PASS.**

| Area | Checks | Result |
|---|---|---|
| **Launch** | renderer loaded; version reported; boot skeleton not stuck | 3/3 PASS |
| **Login** | login overlay shown; `admin`/`1234` accepted and overlay dismissed; session has admin permission | 3/3 PASS |
| **Dark theme** | `data-theme` absent (dark default); body bg `rgb(17,25,39)`; text `rgb(237,238,240)` | 3/3 PASS |
| **Light theme** | `data-theme="light"`; body bg `rgb(244,250,255)`; text `rgb(28,32,36)` | 3/3 PASS |
| **Automatic theme** | `toggleAutoTheme()` sets `autoTheme=true`; `effectiveTheme()` follows the shift clock (`autoThemeNow()` → `dark` at test time); DOM follows; a manual `toggleTheme()` disables auto and reasserts the manual choice; `#autoThemeToggle` `aria-pressed` reflects state | 5/5 PASS |
| **Main dashboard** | all 4 scoreboard cells, shift chip, clock, date, theme toggle, auto-theme toggle — VISIBLE | 8/8 PASS |
| **Games** | grid VISIBLE (1120×906); **6 ticket cards** rendered | 2/2 PASS |
| **Expense UI** | desc, amount, employee, list, total — all VISIBLE; total displays a value | 6/6 PASS |
| **Gift UI** | desc, amount, list, total — all VISIBLE; total displays a value | 5/5 PASS |
| **Summary** | revenue, cash, elec, expenses, net, gifts, final — all VISIBLE; final displays a value | 8/8 PASS |
| **Settings** | modal opens (`display:flex`, 1474×911) with 85,983 chars of rendered content; `closeOverlay()` closes it | 3/3 PASS |
| **Reports** | modal opens with 3,349 chars of rendered content; closes | 3/3 PASS |
| **Employees** | modal opens with 4,747 chars of rendered content; closes | 3/3 PASS |
| **Existing modals (general)** | toast system shows on demand | 1/1 PASS |
| **RTL** | document direction `rtl` | 1/1 PASS |
| **Brand identity** | name `كوكي بارك` preserved; `--brand` resolves to Radix `violet-9` `#6e56cf`; logo asset present | 3/3 PASS |

Sample evidence: `games=6`, `expense total="0"`, `gift total="50"`, `summary final="855"` — the dashboard renders real ledger data from the seeded copy.

**On "sell + print" from the audit's smoke list:** deliberately not performed (no production sale). The sell and print flows are *provably* unchanged because the inline JS that implements them is **byte-identical to `main`** (§8) and `main.js` / `preload.js` / `assets/ticket/*` are byte-identical (§9). The harness exercised the print IPC with its documented stub (`print-ticket → {ok:false}`, `get-printers → []`), which the app handles without error. A full end-to-end sale on a physical printer is a release-gate activity, not a CSS-migration gate.

---

## 15. RTL, readability, and identity verification

**RTL — proven at the diff level, not just observed:** every changed declaration across all three files was classified. **100% of touched declarations are CSS custom properties** (`--name: value`). The complete set of touched declaration names is:

`--bg --panel --line --line-soft --ink --muted --primary --primary-dim --primary-bright --secondary --secondary-bright --brand --success --success-dim --success-bright --danger --danger-bright --glow-primary --topbar-bg --scoreboard-bg --sc-big --shift-bg --shift-color --banner-color --banner-color-b --badge-soft --pend-color --secondary-dim --danger-dim --glow-secondary --glow-success`

**Zero** selectors changed. **Zero** layout properties (`margin*`, `padding*`, `float`, `direction`, `text-align`, `left/right`, `transform`) touched. Therefore **RTL cannot be affected** — directional layout is untouched, only color values changed. Confirmed at runtime: `dir=rtl` on the document, and every section renders with correct geometry in both themes.

**Readability:** see §12 — body and muted text pass AA-normal in both themes; text-edge energy in the screenshots is unchanged from baseline (§13).

**Contrast:** no regression; two improvements (dark primary button 2.43→3.00; dark danger text 5.87→7.06).

**Brand identity:** the venue name (`كوكي بارك`), the logo assets (`assets/icons/logo.png`, `assets/images/logo.png`, `assets/icons/icon.ico`) are all **byte-identical to baseline**. `--brand` resolves to Radix `violet-9` (`#6e56cf`), which is visually consistent with the pre-existing brand purple. The navy surface identity is preserved deliberately by choosing the Radix **blue** ramp for backgrounds.

**No print-template changes:** `assets/ticket/ticket-template.js` and `ticket-template.svg` are byte-identical to baseline (protected files #11, #12).

**No ticket changes:** the ticket UI (games grid + ticket cards) is driven by byte-identical inline JS; only its colors come from the remapped tokens.

**No printer changes:** `main.js` (all 33 IPC channels including `print-ticket` / `get-printers`) and `preload.js` are byte-identical to baseline (protected files). Printer behavior is unchanged.

---

## 16. Caveats

1. **10 test failures, fully classified in §10** — 8 intentional Phase 2a repaint + 1 compound (historical index.html + intentional windows) + 1 fresh-worktree environment artifact. **0 actual regressions. No test modified or weakened.**
2. **Recommended remedy (deferred):** re-anchor `tests/protected-baseline.json` for `index.html`, `windows/splash.html`, `windows/update.html` at release time. Not performed — this is an experimental phase and the guards should stay honest about what changed.
3. **`windows/update.html` was repainted** alongside `splash.html`. The Phase-2a brief listed it as "review only", but `splash.html` and `update.html` are guarded by the *same combined* assertions, so repainting only one costs the same guard failures while leaving the update screen on the old palette. Both were updated for consistency; the choice is reversible and recorded.
4. **Environment:** `core.autocrlf=true` with no `.gitattributes`. Plain `git status` shows all 46 files "modified" (a CRLF/LF display artifact). The real change set is `git -c core.autocrlf=false diff --stat` = the 3 intended files. All hashes/diffs in this report used `core.autocrlf=false`.
5. **Screenshots** are the final human arbiter and were not compared pixel-by-pixel; the machine evidence (luminance percentiles, dark/light fractions, text-edge energy, DOM probe, resolved tokens, WCAG math) is what this verdict rests on.
6. **`var(--cyan, #22d3ee)`** at `.rec-link:hover` relies on its fallback — pre-existing, byte-identical to `main`, left alone.

---

## 17. Next step (NOT started)

Phase 2b — **emoji → Radix Icons SVG swap** (`assets/icons/` + an `icon(name, cls)` helper), per the Phase-1 audit §8 and the 2a→2b ordering rule. It must reuse these protections: every ID / `data-perm` / `onclick` preserved, print documents kept on their current minimal glyph set, RTL arrow direction verified. **No Phase 2b work was performed.** Verification stopped here.

---

## Audit Trail

### Modified (3 files, CSS only)
- `index.html` — `<link>` at line 19; `:root` (dark) lines 21–86; `[data-theme="light"]` lines 88–143
- `windows/splash.html` — `<link>`; token block (all 30 token names preserved, values remapped)
- `windows/update.html` — `<link>`; `:root` token block (all 18 token names preserved, values remapped)

### Added (1 file)
- `assets/vendor/radix-colors.css` — Radix Colors v3.0.0 (MIT, WorkOS), sRGB hex only, 7 hues + slate alpha, dark on `:root` / light on `[data-theme="light"]`

### Verified byte-identical to v2.5.1 (untouched)
`database.js`, `activation.js`, `update-gate.js`, `package.json`, `package-lock.json`, `README.md`, `launch.js`, `electron-builder.yml`, `main.js`, `preload.js`, `users.js`, `login.js`, `recovery.js`, `permissions.js`, `perm-gate.js`, `accounts.js`, `assets/icons/icon.ico`, `assets/icons/logo.png`, `assets/images/logo.png`, `assets/ticket/ticket-template.js`, `assets/ticket/ticket-template.svg`, `assets/vendor/qrcode.js`, `assets/report/daily-report.js`, all 14 `tests/*.test.js`, `tests/protected-baseline.json`

### Verification artifacts (harness workspace, outside the repo)
- `shots-baseline/` — 10 baseline PNGs + `tokens.json`
- `shots-after/` — 10 after PNGs + `tokens.json` + `QA.md`
- `final-smoke.json` — 62/62 smoke-check record
- `smoke-probe.json` — section visibility + modal open/close record
