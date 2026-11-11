# Daily Report — Gifts Shown as One Aggregate Total

**Date:** 2026-11-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Version:** 2.6.0 (**unchanged** — no bump, no release, no tag, no push, no publish)
**Scope:** Presentation only, inside the daily report renderer. Gifts are shown as one total; no data, calculation, or other report section changes.

**Final status: PASS**

---

## 1. Root cause / previous behavior

The end-of-day report is built by a single renderer, `assets/report/daily-report.js` → `dayReportHTML()`, which is used by both print entry points:

| Entry point | Day source | Renderer |
|---|---|---|
| `printTodayReport()` (live day) | `totals()` + `state.gifts` | `dayReportHTML()` |
| `printDayReport(id)` (archived day) | `K_HIST` record | `dayReportHTML()` |

Both go through `main.js` → `preload.js` → the hidden print window, so there is exactly **one** daily-report renderer.

Inside it, the gifts block previously did this:

```js
if (m.gifts.length) {
  h += '<div class="b" data-sec="gifts">الهدايا:</div>';
  m.gifts.forEach(function (x) {
    h += row(x.label, money(x.amount));            // name/#seq + amount
    if (x.at) h += '<div class="sub2">…date · time…</div>';
  });
  h += row('إجمالي الهدايا', money(m.summary.giftSales));
  h += hr();
}
```

So every gift was printed individually (description, `#seq`, amount, timestamp), followed by a total row. The total row existed but the noisy per-gift detail did not belong in the end-of-day report.

There is **no separate on-screen daily report**: the report button opens only a print-choice dialog (`printDayReportObj`). The history screen (`histItem`) and the multi-day reports screen are different reports. Per the task's rule not to change unrelated/shared reports, they were investigated and left untouched (see §8).

### Authoritative gift total

`index.html` computes the day's gift total once:

```js
const gifts = state.gifts.reduce((s,x)=>s+(Number(x.amount)||0),0);   // totals()
```

and persists it, together with the per-gift snapshot list, in `archiveDay()`:

```js
gifts: t.gifts,
giftList: state.gifts.map(x=>({desc:x.desc,amount:x.amount,seq:x.seq||0,at:x.at||null})),
```

`dailyReportModel()` maps this to `summary.giftSales = day.gifts`, which feeds `totalSales`, `final`, and `finalCash`.

**The aggregate is therefore `summary.giftSales` (= `day.gifts`) — the same single source already used by the financial summary. No second calculation was invented, and gifts still enter the money math exactly once.**

---

## 2. Exact files changed

| File | Change |
|---|---|
| `assets/report/daily-report.js` | Gifts section now renders one aggregate row; comments updated. Only the gifts block changed (plus the header comment). |
| `tests/daily-report-gifts-aggregate.test.js` | **New** focused suite (81 assertions). |
| `tests/v256-attendance-scroll.test.js` | D9 scope-guard allow-list entries for the new test file and this report. |
| `AI_REPORTS/DAILY_REPORT_GIFTS_AGGREGATION_REPORT.md` | This report. |

No changes to `index.html`, the database layer, gift issuance/deletion, gift ticket printing, payroll, attendance, expenses, ticket counts, or multi-day reports.

The only production-code diff:

```diff
-    /* ---- 3) الهدايا ---- */
-    if (m.gifts.length) {
-      h += '<div class="b" data-sec="gifts">الهدايا:</div>';
-      m.gifts.forEach(function (x) {
-        h += row(x.label, money(x.amount));
-        if (x.at) h += '<div class="sub2">' + esc(t.fmtDMY(new Date(x.at))) + ' · ' + esc(t.fmtTime12(new Date(x.at))) + '</div>';
-      });
-      h += row('إجمالي الهدايا', money(m.summary.giftSales));
+    /* ---- 3) الهدايا: سطر إجمالي واحد فقط ---- */
+    if (m.gifts.length || m.summary.giftSales > 0) {
+      h += '<div class="r" data-sec="gifts"><span class="l">إجمالي الهدايا:</span>'
+        + '<span class="v num">' + esc(fmtNum(m.summary.giftSales) + ' جنيه') + '</span></div>';
       h += hr();
     }
```

`data-sec="gifts"` moved from the old section header onto the single row, so section ordering and the existing order tests keep working unchanged.

---

## 3. New aggregation logic

1. The modal still exposes the full `gifts` list from `giftList` (for compatibility and tests), but the renderer no longer iterates it.
2. The rendered amount is `m.summary.giftSales`, the authoritative `day.gifts` total, formatted with the app's existing `fmtNum` helper.
3. The row uses the report's existing `.r / .l / .v.num` layout, so thermal wrapping/width behavior is identical to every other total row.
4. If there are no gifts (`giftList` empty and total 0), the section is omitted — the report's existing convention for a day with no gifts.
5. Legacy records with a gift total but no `giftList` now still show the aggregate (condition `gifts.length || giftSales > 0`), which is a safe superset of the old display.
6. No other section, calculation, CSS, paper size, or label was touched.

---

## 4. Before / after example

Four gifts: 10 + 20 + 30 + 40 = **100**.

**Before (58 mm thermal text):**

```
------------------------------
الهدايا:
  بالون أزرق #000001        10 ج
  02/10/2026 · 8:10 م
  دبدوب #000002             20 ج
  02/10/2026 · 8:11 م
  كرة قدم #000003           30 ج
  02/10/2026 · 8:12 م
  ساعة يد #000004           40 ج
  02/10/2026 · 8:13 م
إجمالي الهدايا             100 ج
------------------------------
```

**After (actual rendered HTML from the new code, 58 mm):**

```
------------------------------
إجمالي الهدايا:           100 جنيه
------------------------------
```

Actual generated markup:

```html
<div class="r" data-sec="gifts">
  <span class="l">إجمالي الهدايا:</span>
  <span class="v num">100 جنيه</span>
</div>
```

The row keeps the report's right-label / left-value alignment: the label is on the right, the amount on the left, exactly like the other totals. The currency unit is `جنيه` on this line as explicitly required; all other money rows keep their existing `ج` formatting.

Reported identical for `58`, `80`, and `a4` — only the separator style differs (existing behavior).

---

## 5. Tests and actual results

### New focused suite — `tests/daily-report-gifts-aggregate.test.js`

**81 passed, 0 failed.**

Coverage mapped to the requested checklist:

| # | Requirement | Assertions |
|---|---|---|
| 1 | 10/20/30/40 → one total of 100 | `1a–1d` |
| 2 | Only one gift summary line | `2a–2e` (one label, one section, one row, one separator) |
| 3 | Individual descriptions/amounts/sequences/timestamps absent | `3.1–3.14` |
| 4 | No gifts → zero per existing convention (section omitted) | `4a–4e` |
| 5 | Multiple gifts summed correctly (incl. decimals + `1,234.5 جنيه` formatting) | `5a–5d` |
| 6 | Another day's gifts excluded | `6a–6e` |
| 7 | Gift total not counted twice | `7a–7g` |
| 8 | Existing totals/final cash unchanged | `8a–8k` |
| 9 | Individual gift records intact (model + day object unmutated) | `9a–9f` |
| 10 | Thermal/A4 layout and other sections unchanged | `10a–10e` + per-paper checks |

The suite is pure: synthetic day objects only, no production data, no disk writes.

### Report suites re-run

| Suite | Result |
|---|---|
| `phase4-daily-report.test.js` | **71 / 71 PASS** (order, calculations, review log, 58/80/A4) |
| `v257-salary-expenses.test.js` | **122 / 122 PASS** |
| `v259-electronic-cash.test.js` | **194 / 194 PASS** (final cash + electronic deduction) |

### Full regression suite (all 32 `tests/*.test.js`)

| Result | Count |
|---|---|
| Passing assertions | **2735** |
| Failing assertions | **1** |
| Failing files | **1** — `tests/payroll-ui.test.js` |

The single failure is the **pre-existing, unrelated, date-dependent** payroll test:

```
FAIL 7g2 batch reference is pinned to the fixed batch day
     got="PAY-20261111-01" want="PAY-20261013-01"
```

`payCommit()` uses `Date.now()`; the test expects the fixed day 2026-10-13, so it fails on any other real date. It was already documented as a known pre-existing payroll 7g/7g2 issue before this task, and no payroll code was touched.

---

## 6. Data integrity

- The report is a pure rendering function: `dailyReportModel()` maps `giftList` into the model and `dayReportHTML()` reads it. **Neither writes nor mutates the input.**
- Test `9a` proves the day object is byte-identical (JSON) after rendering 58/80/A4 reports.
- Test `9b–9f` proves every gift row (description, amount, sequence, timestamp) is still present in the model and in `day.giftList`.
- Gift records are still created, stored in `state.gifts`, archived in `giftList`, and used by gift printing/reprinting exactly as before. Nothing was removed or aggregated in storage.
- The database schema and all persistence keys are untouched.

---

## 7. Financial totals and final cash

The displayed gift total is the same number already used by the summary, so no financial value changed:

For the test fixture (revenue 1000, expenses 200, gifts 100, electronic 100):

| Metric | Value | Change |
|---|---|---|
| Game sales | 1,000 | none |
| Gift sales | 100 | none |
| Total sales | 1,100 | none |
| Expenses | 200 | none |
| Net before electronic | 800 | none |
| Total before electronic | 900 | none |
| Electronic deduction | 100 | none |
| Final cash | 800 | none |
| Legacy parity `revenue − expenses + gifts` | 900 | none |

Gifts contribute exactly once to `totalSales` and once to `final`; the gifts block is a presentation subtotal, not an extra addition. Tests `7a–7g` and `8a–8j` assert this, including “final unchanged when gifts are zeroed”.

---

## 8. Screen vs printed report

Investigation result: **there is no on-screen daily report.** `printTodayReport()` / `printDayReport()` open a print-options dialog and then render the same `dayReportHTML()` for the thermal printer. Therefore the conditional requirement (“if screen and printed reports both display individual gifts…”) does not apply.

The two places that still list individual gifts are different features and were intentionally **not** changed:

- `histItem()` — the expandable “سجل الأيام السابقة” history browser.
- `giftsReportBlock()` / `giftsSection()` — the multi-day reports screen.

Both were left untouched to respect “do not change multi-day reports or unrelated reports.”

---

## 9. Remaining limitations

1. The aggregate line uses the required wording/unit `جنيه`, while the rest of the report uses the shorthand `ج`. This is the only formatting difference, and it was chosen to match the required literal text.
2. Legacy archived records that contain a gift total but no `giftList` previously showed no gifts section; they now show the aggregate total. Financial values are unchanged.
3. A day whose archived `gifts` value disagrees with the sum of its `giftList` will display `day.gifts` (the authoritative financial value) — deliberately, so the report reconciles with final cash.
4. Gift counts are not shown (not requested); only the aggregated amount is printed.
5. Physical thermal-printer output was not re-tested; verification is at the renderer/HTML level plus the existing printer pipeline. The generated markup uses the same row classes and paper CSS already proven in `phase4-daily-report.test.js`.

---

## 10. Release safety

- Branch: `main`; HEAD: `9320e08`; version: `2.6.0`.
- Working tree also contains the previously reviewed, uncommitted printer-offline fix; it was not modified by this task.
- No commit, tag, push, publish, installer build, or release overwrite was performed.
- `protected-baseline.json` did not need changes: `index.html` was not touched by this task, and `daily-report.js` is not a baseline-protected file.

**Final status: PASS** — focused 81/81, full suite 2735 PASS / 1 pre-existing unrelated failure.
