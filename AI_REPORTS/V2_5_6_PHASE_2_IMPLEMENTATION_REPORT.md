# Malahy v2.5.6 — Phase 2 Implementation Report
## Thermal Payroll Disbursement Reports + Date-Selectable PDF / Excel Exports

**Status:** `PASS WITH WARNINGS` (all functional, test, and build checks pass; GitHub **publishing is blocked** by missing release authentication — see §9)
**Date:** 2026-10-13
**Repository:** `sliveamer20/malahy` (branch `main`)
**Phase 1.1 baseline:** `AI_REPORTS/V2_5_6_PHASE_1_1_ATTENDANCE_FINALIZATION_REPORT.md` (approved, PASS) — preserved in full.

---

## 1. Initial Git State and Inspected Architecture

### 1.1 Git state before any change

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `0ef9cc2742a2a2eec0d29f1e6b5719e919c5e6dbf8` — `docs: record v2.5.5 release build and GitHub publication evidence` |
| Working tree | Phase 1.1 work present, uncommitted, unmodified by this phase until Phase 2 edits |
| Tags at HEAD | none |
| Stashes | none |

The working tree matched the approved Phase 1.1 state exactly (`index.html`, `assets/payroll/payroll-core.js` modified; 3 AI reports + `tests/v256-attendance-scroll.test.js` untracked). No existing change was discarded or reverted.

### 1.2 Payout data model (as found — no field names were invented)

**Per-employee payout record** — `employee.payouts[]` (written by `applyPayout` in `assets/payroll/payroll-core.js`):

```
{ id, ts, dateKey, amount, batchId, ref,
  covered:{ fromKey, toKey, days[], absKeys[], vacKeys[], work, abs, vac,
            gross, bonus, pen, adv, ded, coveredNet, itemsDiff },
  applied:{ bonuses[], penalties[], advances[], deductions[] },
  paidBefore, balanceAfter, note, kind:'full'|'partial' }
```

**Payout batch** — store key `malahy_payroll_batches_v1` (`pbLoad`/`pbPut`/`pbGet`/`pbList` in `index.html`):

```
{ id, ref, ts, dateKey, note,
  items:[{ empId, empName, job, dailyWage, payCycle, work, abs, vac, gross,
           bonus, pen, adv, ded, coveredNet, itemsDiff, period, paidBefore,
           due, amount, balanceAfter, status:'pending'|'saved'|'failed'|'skipped',
           reason, error }],
  totals:{ gross, bonus, pen, adv, ded, paidBefore, amount, count } }
```

**Authoritative rule discovered and used throughout:** an item's `status === 'saved'` **iff** the payout was actually applied *and* persisted. This is the sole authority for "actual disbursement". Every report, total, and export in this phase filters on it — failed/skipped items never appear.

**Financial separation requirement.** Three amounts are kept explicitly distinct and are never merged:
- `due` = المستحق وقت الصرف (calculated entitlement — **not** necessarily paid)
- `amount` → `paid` = المصروف فعلًا (actually disbursed; authority = `status==='saved'`)
- `balanceAfter` = المتبقّي بعد الصرف (shown only when `paid < due`)

### 1.3 Pre-existing infrastructure reused (not duplicated)

`assets/report/payroll-report.js` already provided: `batchModel`, `receiptModel`, `batchHTML`, `receiptHTML`, `thermalCSS(58/80)`, `a4CSS`, `payrollPaperCSS`, `charWidth`, `wrapArabic`/`wrapHTML`, `fitAmount`. The thermal payroll batch report, individual receipt, per-batch PDF and per-batch CSV were **already implemented**; this phase adds only the missing selection/multi-batch/multi-sheet layer on top.

- **Printer widths:** `paperKind()` in `index.html` resolves `settings.paperWidth` (`58` | `80` | `a4`), else infers `58`/`80` from the selected printer name, else defaults to `a4`. Both 58 mm and 80 mm are supported and are exercised by the tests and the Electron validation.
- **Permissions:** `permissions.js` `PERMS` list — `payroll`, `reportExport`, `reportPrint` reused; **no new permission id was invented** (asserted in tests 7n).
- **Save dialog:** the existing Electron `dialog.showSaveDialog` + `contextBridge` security architecture is reused for the new `export-xls` channel.

---

## 2. Files Changed and Reason for Each Change

| File | Δ | Reason |
|---|---|---|
| `assets/report/payroll-report.js` | +~400 (pure additions; all pre-existing functions untouched) | New pure report layer: `payoutScopeModel`, `scopeReportHTML` (consolidated thermal 58/80/A4), `multiBatchModel`/`multiBatchHTML` (one PDF, date→batch→employee), `xlsBuild`/`xlsWorkbook`/`xSheet`/`xCell`/`safeSheetName` (multi-sheet Excel). Also `SCOPE_TITLE`, `MULTI_TITLE`, local `arr()` helper. |
| `index.html` | +~270 | UI: `pbSavedItems`/`pbActualEntries`/`pbActualDates` (actual-payout scope), `payrollScopePicker` (employee selection, one/many/all), `payrollDatePicker` (date/batch selection, one/many/all + clear), `payrollPrintScopeReport`, `payrollPrintSelectedReceipts`, `exportPayrollScopePDF`, `exportPayrollScopeXLS`, `payrollScopeFileStamp`, gated entry points `openPayrollPrintScope` / `openPayrollExportScope`, and four buttons on the payroll-batches screen. |
| `main.js` | +21 | New `export-xls` IPC handler: validates the payload contains a `<Workbook` root, uses the native save dialog, writes exactly once after confirmation. Accepts no path from the renderer. |
| `preload.js` | +2 | `saveXLS` bridge for `export-xls` (contextBridge, same shape as the existing `savePDF`/`saveCSV`). |
| `package.json` | 1 line | Version `2.5.5` → `2.5.6` (Phase F release bump; scripts/devDependencies untouched). |
| `tests/v256-payroll-exports.test.js` | new (146 assertions) | Focused Phase 2 regression suite, synthetic data only. |
| `tests/v256-attendance-scroll.test.js` | Phase 1.1 suite | Scope guards updated to the authorized Phase 2 allowlists (D1→2.5.6, D2/D3/D6 explicit function allowlist, D9 file allowlist). **No behavioral assertion was weakened.** |
| `tests/phase3b-auth.test.js`, `tests/phase3c1-gate.test.js`, `tests/phase3c2-baseline.test.js` | 1 line each | Version anchors re-anchored from 2.5.5 to the authorized 2.5.6 (their purpose is to block *unauthorized* bumps). |
| `AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md` | new | This report. |

**Files deliberately NOT touched:** `assets/payroll/payroll-core.js` (zero Phase 2 edits — asserted by test 8h2), `electron-builder.yml`, `update-gate.js` (`FLOOR_VERSION` stays `2.5.1`), `permissions.js`, `database.js`, `dist/`.

### 2.1 Incident: `package.json` truncation, detected and fully repaired

An `edit` tool call during the version bump deleted the `scripts` and `devDependencies` blocks (file shrank 20 → 11 lines). It was detected immediately by the test suite (`Object.keys(pkg.devDependencies)` threw), **repaired byte-exactly from HEAD** (`git checkout HEAD -- package.json`), and the bump was re-applied with a precise single-string replacement. A post-incident integrity harness (`integrity.js`) now verifies every modified file against HEAD: 0 removed functions, script-tag count unchanged, all config blocks intact. The build was re-run from the repaired tree.

---

## 3. Thermal Report Behavior and Supported Printer Widths

### 3.1 Employee selection (Phase B)

`payrollScopePicker({mode})` lists **only** employees with an actual saved payout in scope (checkbox list, "select all" / "clear", live count, no employee without a payout is ever offered). Modes:
- **Consolidated report** → `payrollPrintScopeReport` → `scopeReportHTML` (one document for the whole selection).
- **Individual receipts** → `payrollPrintSelectedReceipts` → one existing `receiptHTML` per selected employee, via the existing `payrollSend`/`printTicket` path.

### 3.2 Information shown (derived from stored records only)

Employee name and job; payroll period (`fromKey ← toKey`); attendance/absence/leave counts; earned wages (gross); bonuses; advances; penalties; deductions; **المستحق (احتساب)**; **المصروف فعلًا**; **مسدَّد سابقًا**; and **متبقّي بعد الصرف** shown only for partial payouts. Payout date, batch ref, and batch id appear on every row and section.

Fields not reliably derivable from the batch record (e.g. a live ledger recompute) are **not** fabricated — the report reads the values the payout stored.

### 3.3 Printer widths and Arabic wrapping

- `paper: '58'` → 48 mm body CSS, `paper: '80'` → 72 mm body CSS, `paper: 'a4'` → A4. All three asserted (`tests/v256-payroll-exports.test.js` 3a–3c) and exercised in Electron.
- **Long Arabic names are never clipped:** `scopeRowHTML` wraps with `maxLines = 0` (unbounded) rather than the 2-line cap used by the pre-existing receipt path, and the CSS carries `word-break:break-word; overflow-wrap:anywhere`. Asserted by 3j/3j2/3j3 (first word, last word, no ellipsis) for a 43-character synthetic name.
- Monetary amounts go through the existing `fitAmount` helper with `direction:ltr` so they never overflow the paper width.
- **Reprinting is read-only:** building, rendering, printing, and exporting performed **zero** writes to payroll keys — proven in the Electron harness (`payroll_writes_total: 0`, `store_unchanged_after_pdf: true`, `store_unchanged_after_xls: true`, `employees_unchanged_after_print: true`) and by test 6a (deep-equal snapshot before/after) and 6c (the report module source contains no `applyPayout`/`commitBatch`/`markDay`/`clearDay` call).

---

## 4. PDF and Excel Selection and Output Behavior

### 4.1 Shared date selection (Phase C)

`payrollDatePicker({mode:'pdf'|'xls'})` is the **single** entry point for both export buttons. Choices are populated **only** from `pbActualDates()` — i.e. batches that contain ≥1 `status==='saved'` item. Nothing is derived from attendance dates, hardcoded examples, or assumed weekly schedules (asserted by test 7c). Multiple batches on the same date are listed as **separate** rows with their own ref and id.

Supports: one date, multiple dates, all dates (default: all selected), and clear/change before exporting (`تحديد الكل` / `مسح التحديد`). Opening the picker writes nothing (`writes_from_opening_datepicker: 0` in Electron).

### 4.2 PDF export — one file for the whole selection

`exportPayrollScopePDF` → `multiBatchModel` + `multiBatchHTML` (A4). Organization: **payout date → distinct batch → employees**, with a batch header (ref, id, time, batch total), per-batch totals, a page break before each batch, and a final grand-total section. Grand totals sum each *observed* batch exactly once (`seen[]` de-duplication — a repeated batch object is not double-counted, test 4ac), and the grand total is labelled **الإجمالي المصروف فعلًا**, never conflated with entitlement.

Verified end-to-end in Electron with Chromium's real `printToPDF`: a valid `%PDF-` file, **3 pages** for the 2-batch synthetic scenario, both batch refs present, embedded Arabic font + `ToUnicode` CMap, `xref` + `%%EOF` intact.

### 4.3 Excel export — one workbook with one sheet per batch

`exportPayrollScopeXLS` → `xlsBuild`. **Format: SpreadsheetML 2003 (`.xls` XML).** This choice is deliberate and documented: the project has **no** `xlsx`/`exceljs`/`jszip` dependency and Phase constraints forbid adding one; SpreadsheetML is a Microsoft-defined XML format that Excel and LibreOffice open natively and gives real multiple worksheets, typed numeric cells, column widths, and styled header/total rows.

- One `<Worksheet>` per selected batch (name = payout date + batch ref), plus a final `الإجماليات` sheet with one row per batch and the grand total.
- Sheet names are sanitized (≤31 chars, no `: \ / ? * [ ]`) and de-duplicated (test 5f/5g).
- Numeric monetary cells are typed `ss:Type="Number"` (test 5k); `due` and `paid` are **separate columns** (test 5o); batch id and ref columns exist per row (test 5p).
- The workbook XML is tag-balanced (a stack-based well-formedness scan, test 9a), XML-special characters are escaped (test 5w/5x), and a file round-trip is byte-identical (test 9g).

### 4.4 Friday + Saturday required scenario (synthetic)

Synthetic dates **Friday 2026-10-09** (2 payouts, ref `PAY-20261009`) and **Saturday 2026-10-10** (3 payouts, ref `PAY-20261010`), plus a `failed` item and an all-`skipped` batch as negative controls. Selecting both dates:

- **PDF:** one document (`<html>` count = 1, test 4l/9j), both dates clearly separated under their own headings, **two** `data-sec="batch-head"` sections (test 4m), page breaks between them, and a single grand total = 2 045 = 950 + 1 095 (tests 4d/4e/9k). Electron-confirmed: `pdf_is_one_doc: true`, `pdf_batch_sections: 2`, filename `تقرير-رواتب-2026-10-09_2026-10-10.pdf`.
- **Excel:** one workbook with **3** worksheets (Fri, Sat, الإجماليات), both refs present, 92 typed numeric cells (Electron-confirmed), filename `تقرير-رواتب-2026-10-09_2026-10-10.xls`.
- The `failed` item (`لم يُصرف`) and the `skipped` item (`متخطّى`) appear in **neither** output.

### 4.5 Export safety

| Requirement | Evidence |
|---|---|
| Opening the selector writes nothing | `writes_from_opening_datepicker: 0`, `writes_from_opening_scopePicker: 0` (Electron) |
| Exporting creates/alters no payout | `store_unchanged_after_pdf/xls: true`; test 6a deep-equal snapshot |
| Unpaid employees never shown as paid | `status==='saved'` filter throughout; tests 1b, 4ad, 5j |
| No double counting | batch `seen[]` de-dup; tests 4ac, 4d |
| Distinct batches stay distinct | separate sections/sheets + ref columns; tests 4m, 4w–4aa, 5u/5v |
| History unchanged | read-only path; test 6c (no payout-writing API in the report module) |
| Existing Electron save dialog + security model | `dialog.showSaveDialog`, contextBridge, no path accepted from renderer (tests 7q/7r/7s/7t) |
| Permissions preserved | `payroll` + `reportExport` required for export, `payroll` for printing; denial blocks and writes nothing (Electron `perm_denied_blocks_export: true`, `writes_after_perm_denial: 0`) |

---

## 5. Test Commands and Actual Results

Commands (Node.js v24.18.0, Windows):

```
node tests/v256-payroll-exports.test.js      # Phase 2 focused  → 146 passed, 0 failed
node tests/v256-attendance-scroll.test.js    # Phase 1.1 focused → 218 passed, 0 failed
```

Full suite (all `tests/*.test.js`, run one by one):

```
files run: 27 | passed: 2229 | failed: 1
remaining: payroll-ui.test.js (94 passed, 1 failed)
```

**The single failure is pre-existing and proven unrelated to this phase, with a fresh baseline run.**\n\n| | Pristine HEAD baseline | Current committed tree |\n|---|---|---|\n| File | `tests/payroll-ui.test.js` | `tests/payroll-ui.test.js` |\n| Assertion | `7g a new day gets its own reference` | `7g a new day gets its own reference` |\n| Result | `got="PAY-20261013-02" want="PAY-20261013-01"` → **94 passed, 1 failed** | `got="PAY-20261013-02" want="PAY-20261013-01"` → **94 passed, 1 failed** |\n\n**Root cause:** the test hardcodes `D(2026, 10, 13)` for its "next day" reference while the earlier batch in the same test is created with `Date.now()`; on the run date (2026-10-13) both land on the same day, so `nextRef` correctly returns `PAY-20261013-02`. The expectation is date-dependent and fails every day it is run on/after the hardcoded date, on any tree.\n\n**Method:** `tests/payroll-ui.test.js` was run against a fresh pristine baseline — `index.html`, `payroll-core.js`, `payroll-report.js`, `main.js`, `preload.js`, `package.json` and all guard/test sources extracted with `git show HEAD:` (the pre-release parent) into a throwaway `%TEMP%` directory, with every tracked test file likewise reverted to that baseline. It produced the identical 94 passed / 1 failed with the same `7g` failure, so Phase 2 adds **zero** regressions. This defect is out of scope and was left untouched.

Suite progression: 1 866 (v2.5.5 baseline) → 2 084 (after Phase 1.1) → **2 229** (after Phase 2).

### Electron UI validation (throwaway harness, `%TEMP%`, synthetic store, temp `userData`)

46 checks, all passing, including: report module loaded with all five new functions; `pbSavedItems` excludes the failed item; `pbActualEntries` = 4, all `saved`; `pbActualDates` = `2026-10-09:1:2:700` and `2026-10-10:1:2:370` (the all-skipped batch excluded); both pickers render with 0 writes; date picker shows 2 date rows / 2 batch rows with live summary; one PDF with both dates/refs, 2 batch sections, grand total, failed+skipped excluded; one XLS workbook with 3 worksheets and 92 numeric cells; 58 mm and 80 mm thermal CSS applied; due/paid/balance lines all present; permission denial blocks export and writes nothing; all four screen buttons present; **Phase 1.1 functions intact** (`drCloseDay`, `drMarkAbsent`, `drDayFinished`, `planAttendanceClose`, `applyAttendanceClose`).

Production `%APPDATA%\malahy\malahy-data.json` — size 46 245, mtime `2026-10-11T16:59:18.1805859Z`, hash unchanged across every run. **No production data was read, migrated, or modified.**

---

## 6. Build and Packaging Results

```
npx electron-builder --win --config.directories.output=%TEMP%\malahy-build-256
exit code: 0
```

| Artifact | Size | Notes |
|---|---|---|
| `malahy-setup-2.5.6.exe` | 105 909 034 bytes (101 MB) | NSIS x64, matches the established `malahy-setup-${version}.${ext}` convention |
| `malahy-setup-2.5.6.exe.blockmap` | 0.1 MB | update diffing |
| `latest.yml` | — | version 2.5.6, correct `url`/`sha512`/`size` |

**Checksum verification (computed independently and matched against `latest.yml`):**

```
file   : malahy-setup-2.5.6.exe
exists : true
size   : 105909034 bytes
sha512 : HOkpr33KtBAA2tSy7aOutO9Er/l0u/7EoQF4yymmw2/DiRG6SBjnG7mfSWO9KbwOaEi/pNHiZ468wVqMgKq36g==
match  : true  (both sha512 entries in latest.yml equal the computed hash;
               latest.yml also records size: 105909034 and version: 2.5.6)
```

These are the release assets and updater metadata, **verified locally**. No GitHub Release has been created, so nothing has been published or claimed as published.

The build was run twice: the first run used the (then-undetected) truncated `package.json`; after the repair the build was re-run from the corrected tree and is the result reported here. `dist/` was never written to — the existing v2.5.2–v2.5.5 release artifacts remain untouched.

Packaged-app inspection (`asar` extract): version **2.5.6**; all Phase 2 symbols present (`payoutScopeModel`, `multiBatchHTML`, `xlsBuild`, `pbActualDates`, `payrollDatePicker`, `exportPayrollScopeXLS`, `export-xls` IPC, `saveXLS` bridge); Phase 1.1 preserved (`drCloseDay`, `drMarkAbsent`, `planAttendanceClose`, `applyAttendanceClose`); existing `export-csv`/`export-pdf` handlers intact. (electron-builder legitimately strips `scripts`/`devDependencies` from the in-app `package.json`; the source file retains them — verified.)

Application startup was verified by the Electron harness itself, which loads the real `index.html` through the real `preload.js`/`main.js`/`database.js` and drives the real UI functions.

---

## 7. Versioning, Commit, Tag, Release

| Step | Status |
|---|---|
| `package.json` `2.5.5` → `2.5.6` | Done — single-line change, all other keys verified intact |
| `FLOOR_VERSION` in `update-gate.js` | Unchanged (`2.5.1`) — it is the update floor, not the app version |
| Stage only explicitly selected files | Done — no `git add .` / `git add -A` was used |
| Stage only explicitly selected files | Done — 15 files staged by name; no `git add .` / `git add -A` was used |
| Version commit | **Created locally** — `9fa138105dd899d4afeb06c6eee167c9bc659de6` on `main` (1 commit ahead of `origin/main`) |
| `v2.5.6` tag | **Created locally** (annotated tag), pointing at the commit above |
| Push to GitHub | **Not performed** (per explicit instruction) |
| GitHub Release | **Blocked** — see §9 |

### 7.1 Files in the release commit (exactly 15)

```
index.html                                         (Phase 1.1 + Phase 2 UI)
assets/payroll/payroll-core.js                     (Phase 1.1 — 62 lines added; Phase 2 untouched)
assets/report/payroll-report.js                    (Phase 2 — +418 lines)
main.js                                            (Phase 2 — export-xls IPC)
preload.js                                         (Phase 2 — saveXLS bridge)
package.json                                       (version bump, 1 line)
tests/v256-attendance-scroll.test.js               (Phase 1.1 suite, 218 assertions)
tests/v256-payroll-exports.test.js                 (Phase 2 suite, 146 assertions)
tests/phase3b-auth.test.js                         (version anchor → 2.5.6, 1 line)
tests/phase3c1-gate.test.js                        (version anchor → 2.5.6, 1 line)
tests/phase3c2-baseline.test.js                    (version anchor → 2.5.6, 1 line)
AI_REPORTS/V2_5_6_PHASE_1_REPORT.md
AI_REPORTS/V2_5_6_PHASE_1_REVIEW_REPORT.md
AI_REPORTS/V2_5_6_PHASE_1_1_ATTENDANCE_FINALIZATION_REPORT.md
AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md
```

Working tree is **clean** after the commit. No `dist/`, `node_modules/`, environment, key, token, or data file was staged or committed. The pre-existing stable tags are untouched — `v2.5.5` still resolves to commit `969ccc0` (`release: v2.5.5 flexible payroll`), and `origin/main` still sits at the pre-release commit `0ef9cc2`.

### 7.2 Scope-guard re-anchoring (why the D-section changed after the commit)

The Phase 1.1 suite's section-D guards compare the working tree against `HEAD`. Once the release commit lands, `HEAD` *contains* every new function, so the delta becomes empty and the guards report false negatives. They were re-anchored to a **fixed baseline** — the immediate parent of the release commit, derived programmatically via `git rev-parse HEAD~1` (never a hand-copied SHA, after one mistyped 42-character id was caught and replaced) — so they stay strict and meaningful on a clean tree. No behavioral assertion (sections A/B/B15/C) was modified or weakened.

---

## 8. Production-Data Confirmation

No database migration was required or performed. No production store was read or written. Every financial figure in this phase is derived from stored payout/batch records; no value was invented. The only writes during the whole phase were to `%TEMP%` (synthetic harness, extracted asar, build output) and to the repository's own source/test/report files.

---

## 9. Release Publishing — BLOCKER (why status is PASS WITH WARNINGS)

**GitHub Release could not be published. Exact blockers:**

1. **No release authentication token.** `electron-builder --publish always` (the project's `npm run publish`) requires `GH_TOKEN`/`GITHUB_TOKEN`. Neither is present in the environment (`GH_TOKEN` unset, `GITHUB_TOKEN` unset).
2. **No `gh` CLI.** `gh` is not installed, so the release cannot be created through the GitHub CLI either.

What *is* available: `git ls-remote origin HEAD` succeeds and Windows Credential Manager holds a `git:https://github.com` entry, so a plain `git push` of the commit and tag would likely succeed. However, creating the **GitHub Release** and attaching `malahy-setup-2.5.6.exe`, `malahy-setup-2.5.6.exe.blockmap`, and `latest.yml` is not possible without one of the two blocked paths.

**No release was claimed as published.** The version commit and `v2.5.6` tag exist **locally only**; nothing has been pushed and no GitHub Release exists. To finish the release:

```
# already done locally (commit 9fa1381 + annotated tag v2.5.6):
git push origin main --tags
$env:GH_TOKEN="<token>"; npm run publish   # or: npx electron-builder --win --publish always
```

---

## 10. Remaining Risks and Unverified Scenarios

1. **Release publishing unverified** — the primary open item (§9).
2. **Excel format is SpreadsheetML 2003 (`.xls`), not `.xlsx`.** Chosen to avoid a new dependency. Excel and LibreOffice open it natively with real sheets and typed cells, but a third-party tool expecting OOXML `.xlsx` would not read it. Mitigation documented in the save dialog's file filter ("Excel Workbook (XML)").
3. **The pre-existing `payroll-ui.test.js` 7g date-dependent failure** (§5) remains open and should be fixed separately by making that test not depend on the real clock.
4. **Manual checks not performed:** physical printing on real 58 mm / 80 mm printers (CSS widths were verified programmatically), opening the generated `.xls` in a real Excel installation (structure verified by XML well-formedness + type/width/count assertions), and visual PDF page-break inspection on paper.
5. **Long Arabic names on 58 mm** wrap over more lines than on 80 mm; verified unclipped, but not visually inspected at 58 mm.
6. **Large multi-date selections**: the PDF grows one page per batch plus totals; not tested beyond the 2-batch scenario for rendering performance.

---

## 11. Final Status

**`PASS WITH WARNINGS`**

Both features are implemented, tested (2 229 passing / 1 pre-existing failure, proven on a pristine baseline), validated in a real Electron window with synthetic data, and packaged as `malahy-setup-2.5.6.exe` (checksum verified) with the correct version and conventions. The local version commit (`9fa1381`) and annotated `v2.5.6` tag are created; **nothing has been pushed and no GitHub Release exists** — publishing remains blocked by missing release authentication (§9). Phase 1.1 attendance finalization, absence safeguards, payroll calculations, and scroll fixes are preserved and re-verified.
