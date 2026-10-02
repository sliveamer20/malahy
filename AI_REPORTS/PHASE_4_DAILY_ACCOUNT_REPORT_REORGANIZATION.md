# PHASE 4 — Daily Account Report Layout & Calculation Reorganization

**Project:** Malahy (كوكي بارك) — ticketing & daily account system
**Version:** 2.5.1 (unchanged — no version bump, no build, no publish, no commit)
**Scope:** the printed end-of-day **Daily Account Report** (تقرير حساب اليوم) only.

---

## 1. Current report implementation inspected (read-only)

All Daily Account Report logic lived in the renderer inline script of `index.html`:

| Function | Location (pre-phase) | Role |
|---|---|---|
| `dayReportHTML(day)` | ~line 4196 | Built the whole printed daily report (text style, thermal + A4 via CSS swap) |
| `printDayReport(id)` | ~line 4263 | Prints an archived day from history (`K_HIST`) |
| `printTodayReport()` | ~line 4275 | Builds a live day object from `totals()`/`gameBreakdown()` and prints it |
| `printDayReportObj(day,onCancel)` | ~line 4300 | Shared print modal: «التقرير اليومي فقط» / «اليومي + سجل المرتجعات», gated by `MalahyPerm.hasPerm('reportPrint')` |
| `dayReviewAppendHTML(day)` | ~line 4330 | Returns-log appendix for the same business day (`businessDayKey`) |
| `reviewLogHTML(period)` / `printReviewLog(period)` | ~3417 / ~3454 | Standalone returns-log print |
| `reportPaperCSS()` / `thermalReportCSS(bodyW,fs)` / `a4ReportCSS(fs)` | ~3802 / ~3807 / ~3825 | Print CSS per paper kind |
| `paperKind()` | ~3730 | `'58' \| '80' \| 'a4'` from `settings().paperWidth` / printer name |
| `calcFinalNet(day)` | ~2967 | `revenue − expenses + gifts` |
| `totals()` / `gameSalesTotals()` / `gameBreakdown()` | ~2387 / ~2447 / ~2473 | Sales data source (game sales, cash/elec split, per-game breakdown) |
| `archiveDay(t)` | ~2827 | Day object shape (`revenue, expenses, gifts, net, finalNet, tickets, cashTickets, elecTickets, breakdown, expenseList, giftList, startedAt, endedAt, dateLabel`) |
| `brandName()` | ~2261 | **Configurable** venue name from `settings().brandName` (fallback `DEFAULT_BRAND_NAME`) |
| `businessDateLabel()` / `businessDayKey()` / `businessDayStartMin()` | ~3152 / ~3207 / ~3147 | Business-day boundary (starts at shift 1) |
| `loadReview()` / `logReview()` | ~2353 / ~2354 | Returns log storage (`K_REVIEW`), independent of sales |
| `methodText()` / `shiftBadgeText()` | ~3164 | Payment-method / shift labels |

Print pipeline (main process, **left untouched**): `main.js` `ipcMain.handle("print-ticket", …)` — validates `printerName` against installed printers, loads the HTML via `data:text/html,…` with `javascript:false`, and applies `pageSize:"A4"` + default margins for `paper==="a4"`, or `usePrinterDefaultPageSize:true` + `margins:"none"` for 58/80 mm rolls; `deviceName` is passed straight through. `preload.js` exposes `window.malahyPrint.printTicket`.

**Old printed order (thermal):** header → ticket counts → totals (revenue / cash revenue / elec revenue) → game details → expenses → gifts → running totals (المبيعات / −المصروفات / =الصافي / +الهدايا / =الإجمالي النهائي) → footer, with the returns log string-appended after `</body>` when chosen.

---

## 2. Exact files modified

| File | Change |
|---|---|
| `assets/report/daily-report.js` | **NEW** — single source of truth for the daily report model, calculations, section order and print CSS (58/80/A4). UMD: exposes `window.MalahyDailyReport` in the app and `module.exports` for Node tests. |
| `index.html` | (a) loads the new module (`<script src="assets/report/daily-report.js">`, same pattern as `qrcode.js` / `ticket-template.js`); (b) injects the app's real helpers once via `MalahyDailyReport.setUtil({fmtNum, esc, fmtDMY, fmtTime12, dayNames:AR_DAYS, monthNames:AR_MONTHS, dayStartMin:businessDayStartMin})`; (c) `dayReportHTML(day, opts)` now delegates to the module (venue = `brandName()`, CSS = `reportPaperCSS()`, paper = `paperKind()`, optional `reviewHTML`); (d) `reportPaperCSS/thermalReportCSS/a4ReportCSS` delegate to the module (one CSS source); (e) `printDayReportObj` passes the returns log as `reviewHTML` (no more `html.replace('</body></html>', …)`); (f) `dayReviewAppendHTML` / `reviewLogHTML` use the shared `hrHTML(paper)` separator and the returns section is tagged `data-sec="review"`. |
| `tests/phase4-daily-report.test.js` | **NEW** — 71 focused checks (order, math, tickets, returns, 3 print formats). |
| `electron-builder.yml` | **Not modified** — verified byte-identical to `tests/protected-baseline.json` (sha256 `b4463605…`). The module ships via the existing `assets/**/*` glob. |

No other file was touched. `main.js`, `preload.js`, `database.js`, `users.js`, `login.js`, `permissions.js`, `perm-gate.js`, `accounts.js`, `recovery.js`, `activation.js`, `update-gate.js`, ticket templates and all assets are unchanged.

---

## 3. Exact report order implemented

```
1. HEADER            [venue/brand name]  ·  تقرير حساب اليوم
                     اليوم: …  ·  التاريخ: …  ·  الساعة: …
2. GAME DETAILS      تفصيل الألعاب:  name (qty×price) → total  +  كاش n · إلكتروني n
3. GIFTS             الهدايا:  each gift (#seq, value, date/time)  →  إجمالي الهدايا
4. EXPENSES          المصروفات:  each expense  →  إجمالي المصروفات
5. SALES SUMMARY     ملخص المبيعات:  مبيعات الألعاب / مبيعات الهدايا /
                     إجمالي المبيعات / إجمالي المصروفات / الإجمالي النهائي
6. TICKET COUNTS     التذاكر:  عدد التذاكر / منها كاش / منها إلكتروني
   + footer          [venue]  © نظام الحسابات
7. RETURNS LOG       🧾 سجل المرتجعات  (always last, when the operator picks
                     «التقرير اليومي + سجل المرتجعات»)
```

Header uses the existing **configurable** venue name (`brandName()`) — nothing is hardcoded. Day/date come from the business-day rule (`businessDayStartMin`), time from the day’s close (`endedAt`) or print time for the live day. Every section is tagged with an inert `data-sec="…"` attribute so the order is machine-verifiable.

Rendered example (80 mm, with returns) — actual module output:

```
كوكي بارك
تقرير حساب اليوم
------------------------------
اليوم: الجمعة
التاريخ: 2 أكتوبر 2026
الساعة: 11:30 م
------------------------------
تفصيل الألعاب:
القاء (5×100)            500 ج    كاش 3 · إلكتروني 2
السكوتر (6×220)        1,320 ج    كاش 3 · إلكتروني 3
------------------------------
الهدايا:
هدية طفل #000007        100 ج    02/10/2026 · 8:10 م
إجمالي الهدايا          100 ج
------------------------------
المصروفات:
كهرباء                  250 ج
صيانة                   150 ج
إجمالي المصروفات        400 ج
------------------------------
ملخص المبيعات:
مبيعات الألعاب        1,820 ج
مبيعات الهدايا          100 ج
إجمالي المبيعات       1,920 ج
إجمالي المصروفات        400 ج
الإجمالي النهائي      1,520 ج
------------------------------
التذاكر:
عدد التذاكر              10
منها كاش                  6
منها إلكتروني             4
------------------------------
كوكي بارك  ·  © نظام الحسابات
سجل المرتجعات … (returns details, or «لا توجد عمليات مرتجعات»)
```

---

## 4. Exact calculation formula (single source: `dailyReportModel`)

```
gameSales   = revenue                          (مبيعات الألعاب)
giftSales   = gifts                            (مبيعات الهدايا)
totalSales  = gameSales + giftSales            (إجمالي المبيعات)
expenses    = expenses                         (إجمالي المصروفات)
finalTotal  = totalSales − expenses            (الإجمالي النهائي)
```

`finalTotal ≡ revenue − expenses + gifts` — algebraically identical to the legacy `calcFinalNet(day)`, which is kept untouched for the history view. The gift value enters the financial summary **exactly once** (as `مبيعات الهدايا` inside Total Sales) and expenses are subtracted **exactly once**. The Gifts *details* section may repeat the gift total as a section subtotal — that is presentation, not double-counting.

Runtime example from the fixture used by the tests: `1,820 + 100 = 1,920`; `1,920 − 400 = 1,520`.

---

## 5. Ticket counts / payment breakdown

Reporting-only, taken from the existing classification (no change to how sales are recorded or to payment processing):

```
عدد التذاكر     = day.tickets
منها كاش        = day.cashTickets   (defaults to 0 for old records)
منها إلكتروني   = day.elecTickets   (defaults to 0 for old records)
```

---

## 6. Print-size behavior (one data source, three presentations)

One model (`dailyReportModel`) + one HTML builder; only the CSS and the separator style differ per paper kind:

| | **58 mm** | **80 mm** | **A4** |
|---|---|---|---|
| CSS | `thermalReportCSS(48, 11)` | `thermalReportCSS(72, 12)` | `a4ReportCSS(13)` |
| Page | `@page{margin:0}` | `@page{margin:0}` | `@page{size:A4;margin:12mm}` |
| Body width | `48mm` (pad `3mm 2mm`) | `72mm` | full page |
| Font | 11 px compact monospace | 12 px monospace | 13 px monospace, line-height 1.6 |
| Separator | `--------` rule text (`hrHTML('58')`) | rule text | `<div class="hr">` CSS `border-top` (no duplicated dashes) |
| Overflow control | `.r .v{white-space:nowrap}` values + `.r .l{min-width:0}` labels that wrap; no tables, no inline widths, no images | same | same |
| Print IPC (unchanged) | `usePrinterDefaultPageSize:true`, `margins:none` | same | `pageSize:"A4"`, `margins:default` |

The label `min-width:0` (added in the shared CSS) guarantees long labels such as «بيت الكور والهوكي (12×40)» shrink/wrap instead of pushing the value off the paper — verified by a dedicated test.

---

## 7. Tests executed

Run with plain Node (`node tests/<file>.test.js`) — the project's existing convention. **No test framework was added, no dependency added.**

| Suite | Result |
|---|---|
| `tests/phase4-daily-report.test.js` (new) | **71 passed, 0 failed** |
| `tests/phase3b-auth.test.js` | 60 passed, **1 failed** ⚠ |
| `tests/phase3b-ipc.test.js` | 15 passed, 0 failed |
| `tests/phase3c1-dom.test.js` | 37 passed, 0 failed |
| `tests/phase3c1-gate.test.js` | 48 passed, 0 failed |
| `tests/phase3c1-ipc.test.js` | 19 passed, 0 failed |
| `tests/phase3c1-session.test.js` | 30 passed, 0 failed |
| `tests/phase3c2-baseline.test.js` | 63 passed, 0 failed |
| `tests/phase3c2-gate.test.js` | 44 passed, 0 failed |
| `tests/phase3c2-ipc.test.js` | 49 passed, 0 failed |
| `tests/phase3c2-perms.test.js` | 39 passed, 0 failed |
| `tests/phase3c3-accounts.test.js` | 92 passed, 0 failed |
| `tests/phase3c3-ui.test.js` | 76 passed, 0 failed |
| `tests/phase3c4-recovery.test.js` | 79 passed, 0 failed |
| **Total** | **722 passed, 1 failed** |

⚠ The single failure is **pre-existing and unrelated**: `phase3b-auth.test.js` asserts *every* baseline file is byte-identical to `tests/protected-baseline.json`, including `index.html`. `index.html` has differed from that snapshot since Phase 3C added the login UI (HEAD sha256 `cb1b2644…` vs baseline `854cff97…`), so this check already failed before Phase 4 began; Phases 3C1/3C2 explicitly whitelist `index.html` as `intended`. Phase 4 legitimately edits `index.html` (the daily report). The baseline file itself and the test were **not** modified (no test was weakened or re-baselined to force a pass). All other baseline files — including `electron-builder.yml` — hash-match exactly.

New-suite coverage mapped to the required checklist: header contains venue/day/date/time (1–5); game details before gifts (2/9), gifts before expenses (3/9), expenses before summary (4/9), returns log last (14); game/gift/total/expense/final calculations (5–8); gifts not double-counted (9–10, incl. `final` unchanged when `gifts=0` and `totalSales === gameSales+giftSales`); expenses not subtracted twice (10, `final===1520` not `1120`); total/cash/electronic ticket counts (11–13); no-return state works (15); A4 / 58 mm / 80 mm layout validity + no-clipping/overflow checks (16–19, incl. longest game name scenario); legacy-record regression (20 — negative net, missing ticket counters, empty sections) and `final === revenue−expenses+gifts` parity with the old formula.

Additional static verification: all three inline `<script>` blocks of `index.html` pass `node --check`; rendered report HTML has balanced tags (42/42 divs) in all three formats; report text was dumped and eyeballed for the exact order shown in §3.

---

## 8. Physical-print verification

The project has no headless print-preview harness, and no physical printer is attached to this environment, so a physical print could not be produced. What was verified instead, without touching the print stack:

- `main.js` `print-ticket` handler, `deviceName` handling, A4/58/80 print options and IPC are **byte-unchanged** (confirmed by diffing against HEAD and by the passing `printer IPC still present` assertions in the existing suite).
- The report document is emitted exactly the way the print path expects (`<!DOCTYPE html>` + inline `<style>`, no external resources, no scripts — loadable through the existing `data:text/html` + `javascript:false` mechanism).
- Per-format page geometry was statically validated (body width 48 mm / 72 mm for thermal, `@page A4` + 12 mm margins for A4, `margins:none` vs `default` handled by the untouched IPC options), and the HTML contains no tables, images or inline `width` styles — the main clipping risks on narrow rolls.

---

## 9. Protected systems — not changed

Ticket design/layout & QR, printer architecture / deviceName / Electron print config / IPC / A4-58-80 settings, sales recording, pricing (incl. historical `pprices`), returns business logic & storage (`K_REVIEW`), gifts business rules, expense recording/deletion authorization, payroll, employees, game management, shift logic, authentication, admin/cashier accounts, permissions, authorization, password & WhatsApp recovery, branding architecture (configurable `brandName()` used as-is), activation, auto-update, and storage architecture are all untouched. `calcFinalNet`, `totals`, `gameSalesTotals`, `gameBreakdown`, `archiveDay`, `logReview`, permission gates and every print entry point keep their exact behavior; only the daily report's presentation/aggregation order changed. Version remains **2.5.1** — no bump, no build, no commit, no push.
