# Malahy v2.5.7 — Salary Expenses Integration & Compact Daily Report

**Final status: `PASS WITH WARNINGS`**
**Published release (with the follow-up spacing fix): `v2.5.8`** — <https://github.com/sliveamer20/malahy/releases/tag/v2.5.8>
Feature release: `v2.5.7` — <https://github.com/sliveamer20/malahy/releases/tag/v2.5.7> (preserved, not replaced)

---

## 1. Initial Project State

| Item | Value |
|---|---|
| Repository root | `D:\Malahy` |
| Remote | `https://github.com/sliveamer20/malahy.git` (only remote) |
| Branch | `main` |
| Starting commit | `5bdbfd1` — `test: allowlist the v2.5.6 release publish report in the D9 scope guard` |
| Working tree at start | **clean** (`git status --porcelain` empty) |
| Version before | `2.5.6` |
| Published stable before | `v2.5.6`, published 2026-10-13, 4 assets — confirmed live by unauthenticated API read |
| Local release folders | `v2.4.1 v2.4.2 v2.4.6 v2.4.7 v2.4.8 v2.4.9 v2.5.0 v2.5.1 v2.5.2 v2.5.3 v2.5.4 v2.5.5 v2.5.6` |
| Test baseline | **2,231 passed / 0 failed** across 27 files — reproduced exactly before any change |

Phase 1 was **read-only**. No file was modified before the baseline was captured.

---

## 2. Existing Payroll and Daily Accounting Flow (as found)

Verified by reading the source, not assumed.

### 2.1 Payroll

| Concern | Implementation |
|---|---|
| Core engine | `assets/payroll/payroll-core.js` → `window.MalahyPayroll` (UMD) |
| Reports | `assets/report/payroll-report.js` → `window.MalahyPayrollReport` (UMD) |
| Employee record | db key `malahy_employees_v1`, array. Per employee: `days[]`, `payouts[]`, `bonuses[]`, `penalties[]`, `advances[]`, `deductions[]`, `weeks[]`, `reviewFlags[]` |
| Payout batches | db key `malahy_payroll_batches_v1`, object map by batch id; plus `_seq_YYYYMMDD` ref counters |
| Master formula | `statsUpTo(e, cutoff)` (`payroll-core.js:286`): `net = gross + bonus − pen − adv − ded`; `outstanding = net − paid`; `due = max(0, outstanding)` |
| Gross | `tallyDays` (`:261`) sums the **frozen per-day wage** `d.wage` over `status === 'work'` days |
| Actual payout | `applyPayout(e, plan, meta)` (`:520`) mints a stable `payoutId` (`'p_' + ts36 + rand`), rejects duplicates (`:526`), stamps `settledBy` on covered ops/days |
| Batch commit | `commitBatch(store, plans, opts, saveEmployee)` (`:625`) — per-employee atomic; on save failure the employee is restored and `item.status='failed'` |
| "Actually paid" | **The only confirmation is `item.status === 'saved'`**, set at `payroll-core.js:665`. Reports, exports and the UI all filter on it (`pbSavedItems`, `batchModel`, `payoutScopeModel`, CSV export). |
| Partial payment | Stored on both the payout record (`amount`, `paidBefore`, `balanceAfter`, `kind:'full'\|'partial'`) and the batch item (`due`, `amount`, `balanceAfter`) |
| Advances | Issued from the **expenses screen** (`index.html:2931-2943`): a normal expense is recorded with `isAdvance:true`, then linked to payroll via `recordEmployeeAdvance → PR().addAdvance`. Deduction at payout is **not a step** — it is folded into `net` and attributed by `settleOf`. |

### 2.2 Daily expenses

| Concern | Implementation |
|---|---|
| Storage | `state.expenses[]` inside db key `malahy_pos_state_v1` (one key for the whole live day) |
| Record shape | `{id, desc, amount}` plus, for an employee advance: `empId, empName, isAdvance, ts` |
| Sum | `totals()` `index.html:2593` — `state.expenses.reduce((s,x)=>s+(Number(x.amount)||0),0)` |
| Net | `index.html:2595` — `net = revenue − expenses` |
| Final | `index.html:2598` — `finalNet = net + gifts` |
| Add | `_addItem('exp')` `index.html:2907` (permission `expenseAdd`) |
| Delete | `deleteItem` `index.html:2975` (permission `expenseDelete`) |
| Archive | `archiveDay` `index.html:3025` → `malahy_pos_history_v1`, `expenseList: state.expenses.map(x=>({desc,amount}))` |
| Live report | `printTodayReport` `index.html:4390` — same `{desc, amount}` projection |

**Exhaustive search result:** `state.expenses` appears at exactly 9 places (`index.html` 2352, 2593, 2726, 2923, 2984, 2986, 3010, 3038, 4404). None of them is in the payroll flow.

### 2.3 Daily report & returns log

| Concern | Implementation |
|---|---|
| Single source of truth | `assets/report/daily-report.js` → `window.MalahyDailyReport` |
| Sections, in order | `SECTION_ORDER = ['header','games','gifts','expenses','summary','tickets','review']` |
| Expenses section | `daily-report.js:266-271` — heading `المصروفات:` then one `row(desc, amount)` per entry, then `إجمالي المصروفات` |
| Summary | `daily-report.js:274-279` — sales summary + `الإجمالي النهائي` |
| Returns Log | `index.html:4445 dayReviewAppendHTML(day)` — appended **last**, after the footer, via `opts.reviewHTML` (`daily-report.js:294`). Display only; it affects no total. |
| Print | `index.html:4420 doPrint` → `malahyPrint.printTicket` → `main.js:367 print-ticket` |
| Paper | 58 mm → 48 mm body @ 11 px · 80 mm → 72 mm body @ 12 px · A4 @ 13 px with `@page{size:A4;margin:12mm;}` |

### 2.4 The key Phase-4 finding — payouts did **not** touch the daily balance

Traced end to end before writing any code:

```
payCommit()  index.html:5301
  → PR().nextRef(store, ts)
  → PR().commitBatch(_emp.list||empLoad(), plans, {...}, () => empSave())
  → if (res.ok) pbPut(res.batch)
  → return res
```

`payCommit` writes **only** `malahy_employees_v1` and `malahy_payroll_batches_v1`. It never touches `state`, and `totals()` reads only `state.expenses`.

**Conclusion: before v2.5.7, actual salary cash payouts had *zero* effect on the daily net.** Cash left the drawer but never appeared as an expense. Every place a salary payout could influence a balance was enumerated and only two exist:

1. advances — recorded as an ordinary expense **on the day the advance was handed over**, and
2. nothing else.

Therefore the integration adds the **first and only** deduction. There is no pre-existing subtraction to collide with — the double-count risk is structurally zero, and this is asserted in tests `11b/11c/11d`.

---

## 3. Files Changed and Why

### 3.1 Production (3 files)

**`assets/payroll/payroll-core.js`** — +100 lines, **additions only**
- `arDayCount(n)` — Arabic day-count wording (`يوم واحد` / `يومان` / `ن أيام` / `ن يومًا`; zero prints nothing).
- `salaryDesc(x)` — builds the one-line Arabic statement.
- `salaryExpenseEntries(batch, opts)` — **pure**, read-only: converts a *saved* batch into daily-expense rows.
- `salaryExpenseTotal(entries)` — sums the rows themselves, never a stored scalar.
- Reason: keeps the bridge inside the existing payroll engine, free of DOM and storage, and directly `require`-able from Node tests. No existing line was removed or altered.

**`index.html`** — +75 lines
- `recordPayrollExpenses(batch, paidTs)` (new): appends the missing rows to `state.expenses`, persists, repaints.
- `payCommit()` — +3 lines calling it inside the existing `if (res.ok)` branch, wrapped in `try/catch`.
- `dayExpenseRow(x)` (new): one projection for archiving **and** live reporting, preserving the payout link.
- `archiveDay()` / `printTodayReport()` — now use `dayExpenseRow` instead of the lossy `{desc, amount}` map.
- `renderList('exp')` — `💰 راتب` badge so a salary row is identifiable on screen.
- `deleteItem()` — refuses to delete a salary row.
- Reason: reuse the existing expenses list as the single source; no second ledger, no new IPC, no new permission.

**`assets/report/daily-report.js`** — +35 lines
- `dailyReportModel`: splits `expenses` into `salaryExpenses` / `otherExpenses`, adds `summary.salaryTotal`. **Display only — no total was redefined.**
- `dayReportHTML` section 4: salary rows first, then one payroll subtotal, then the untouched ordinary expenses.
- `.pw` compact-line rule in both `thermalReportCSS` and `a4ReportCSS`.
- Reason: this module is the documented single source of truth for the daily report, so payroll had to be rendered *here* to stay inside the existing section.

### 3.2 Tests (6 files)

| File | Change |
|---|---|
| `tests/v257-salary-expenses.test.js` | **New** — 122 assertions covering all 24 required scenarios |
| `tests/payroll-ui.test.js` | sandbox now also loads `recordPayrollExpenses` plus `state/persist/renderList/renderSummary/logErr` (test harness only) |
| `tests/v256-attendance-scroll.test.js` | release-scope guards maintained (see §9) |
| `tests/v256-payroll-exports.test.js` | version guard `8a` |
| `tests/phase3b-auth.test.js`, `tests/phase3c1-gate.test.js`, `tests/phase3c2-baseline.test.js` | version guards |

### 3.3 Untouched

`main.js`, `preload.js`, `permissions.js`, `database.js`, `update-gate.js`, `activation.js`, `perm-gate.js`, `recovery.js`, `users.js`, `accounts.js`, `login.js`, `launch.js`, `electron-builder.yml`, `assets/report/payroll-report.js`, `assets/ticket/*`, `assets/vendor/*`.

`git diff 5bdbfd1..HEAD -- main.js preload.js permissions.js update-gate.js electron-builder.yml` → **0 changed lines**.

---

## 4. Final Salary-Settlement Formula

The payroll engine is unchanged. This is the exact relationship the new code relies on:

```
gross  = Σ wage_frozen_on_day  over days with status = 'work'   (covered by this payout)
net    = gross + bonus − penalty − advance − deduction
due    = max(0, net − already_paid)

expense_amount  =  item.amount                    ← the ACTUAL CASH PAID
                =  gross + bonus − pen − adv − ded + itemsDiff
```

`itemsDiff` is signed on purpose and is what makes the statement self-consistent
(`coveredNet + itemsDiff = amount`); it is already documented in `planPayout`.

Worked example, reproduced by test `1a`–`1m`:

| Item | Value |
|---|---|
| 3 eligible days × 100 | gross **300** |
| advance previously issued | −30 |
| other deduction | −20 |
| net due | **250** |
| cash actually paid | **250** |
| **daily expense recorded** | **250** (never 300) |

`10c` asserts `amount === gross + bonus − pen − adv − ded` for every generated row.

---

## 5. How Actual Salary Payouts Become Daily Expenses

```
payCommit(plans)                                   index.html
  └─ PR().commitBatch(...)                          per-employee atomic
       ├─ item.status='saved'  (real, persisted)
       └─ item.payoutId  (stable id from applyPayout)
  └─ if (res.ok):
       └─ recordPayrollExpenses(res.batch, ts)
            ├─ PR().salaryExpenseEntries(batch, {ts})   ← pure, 4 acceptance gates
            ├─ dedup by payoutId against state.expenses
            └─ state.expenses.push({ …, isSalary:true, payoutId, batchId, batchRef, … })
                 └─ persist() → renderList('exp') → renderSummary()
```

From that moment the row is an **ordinary daily expense**: it is summed by `totals()`, deducted from `net`, shown in the expenses panel with its badge, archived by `archiveDay`, printed by `printTodayReport`/`printDayReport`, and included in the PDF/Excel daily reports. No payroll code had to be taught about expenses, and no expense code had to be taught about payroll.

**The four acceptance gates** (all must hold, otherwise no row and no deduction):

1. `item.status === 'saved'` — real and persisted
2. `item.payoutId` present — source link
3. `amount > 0` — real cash movement
4. `empName` non-empty — taken from the authoritative employee record

### Date semantics

`recordPayrollExpenses` stamps `ts = batch.ts` (the instant `payCommit` ran = when the cash actually left the drawer) and derives `dateKey` from it. The row therefore lands in the currently open POS day — the same bucket that carries that day's other cash movements. Attendance dates covered by the payout (which may be weeks earlier) stay on the payout record (`covered.dayKeys`, `period.fromKey/toKey`) and are **never** charged to a past day; test `16a`–`16e` proves one payout covering five old attendance days produces exactly **one** expense.

**Known limitation:** if a payout is executed *after* the POS day has been reset, the row lands in the newly opened day. This is not detectable as a data error by the app and no automatic re-dating was invented, because silently moving cash between archived days would be a worse accounting defect than a visible, correct-in-the-open-day entry. Documented in §14.

---

## 6. Advances, Deductions and Bonuses — How They Are Represented

| Concept | Where it lives | Becomes cash expense? |
|---|---|---|
| Gross earned | `payout.covered.gross`, `e.days[].wage` frozen per day | **No** — displayed inside the statement only |
| Advance issued | a normal `state.expenses` row with `isAdvance:true` + a linked `e.advances[]` record | **Yes, once**, on the day it was handed over |
| Advance deducted at payout | folded into `net`, attributed by `settleOf`, stamped `settledBy` | **No** — `10a/10b` assert no advance expense is fabricated |
| Penalty / deduction | `e.penalties[]`, `e.deductions[]`, folded into `net` | **No** — non-cash by definition |
| Bonus | `e.bonuses[]`, added to `net` | **No** — non-cash by definition |
| Final net due | derived (`due`) | No — an entitlement, not a movement |
| **Actual amount paid** | `item.amount` / `payout.amount` | **Yes — the only salary cash expense** |
| Remaining unpaid | `payout.balanceAfter` / `outstanding` | **No** — test `4a`–`4e` |

Keeping these separate is what prevents double counting: the advance's own expense stays on its own date, and the payout records only the net cash that actually moved.

---

## 7. Double-Counting and Duplicate Prevention

| Risk | Defence | Test |
|---|---|---|
| Same payout counted from payroll **and** expenses list | The payroll record never enters a balance; only `state.expenses` does. `index.html` still holds the single `state.expenses.reduce(...)` sum | `24f` |
| Batch replay / double submit | `payoutId` dedup index over `state.expenses` before any push | `14a`–`14e` |
| Printing twice / re-exporting | Rendering only reads; `dailyReportModel` and `dayReportHTML` never write | `15a`–`15d` (also asserts **zero** device writes) |
| Failed save | `commitBatch` restores the employee and marks the item `failed` → gate 1 rejects it | `13a`–`13e` |
| Skipped (no due) | `item.status='skipped'` → gate 1 rejects it | `13f`, `13g` |
| Gross substituted for cash | Amount is `item.amount`, never `gross` | `1h`, `1i`, `8d`, `12a`–`12c` |
| Advance counted twice | Advance deduction produces no expense row | `10a`–`10c` |
| Cash moved to each attendance day | One expense per payout, not per covered day | `16a`–`16e` |
| Silent loss of a real cash outflow | `deleteItem` refuses to delete `isSalary` rows | `deleteItem` guard |
| Permissions weakened | Writing `malahy_pos_state_v1` needs no special grant; the triggering action already requires `payroll` | `D7` (1 dep + 2 devDeps) |

`tests/payroll-ui.test.js` (96 assertions) and `tests/payroll.test.js` (222) still pass unchanged, so the existing payroll-idempotency guarantees are intact.

---

## 8. Compact Printing Layout — How It Was Verified

### 8.1 Design

Salary rows render **inside `data-sec="expenses"`**, before the ordinary expenses:

```
المصروفات:
راتب طه | 3 أيام | إجمالي 300 - سلفة 30 - خصم 20 | المصروف 250 ج
راتب ملك | 7 أيام | إجمالي 595 - سلفة 50 - خصم 25 | المصروف 520 ج
راتب أسماء | 5 أيام | إجمالي 425 - خصم 25 | المصروف 400 ج
إجمالي الرواتب المصروفة: 1,170 ج
كهرباء المولد                                                    700 ج
إجمالي المصروفات                                             1,870 ج
```

Matches the requested format exactly. Zero-value items are never printed (no `سلفة 0`, no `خصم 0`).

### 8.2 Paper economy — measured

Produced by running the **real** `payCommit` → `recordPayrollExpenses` → `dayReportHTML` path on a synthetic batch of 3 employees:

| Paper | Printed elements with payroll | Without payroll | Delta |
|---|---|---|---|
| 58 mm | 38 | 34 | **+4** |
| 80 mm | 38 | 34 | **+4** |
| A4 | 38 | 34 | **+4** |

+4 = 3 employee rows + 1 subtotal. Zero extra headings, zero extra separators (7 `hr` with and without), zero `page-break`/`break-after` rules, identical section list.

### 8.3 Width check — estimated, **no physical printer**

Estimated against the project's own monospace assumption (Consolas 0.55 em advance; 58 mm ⇒ 48 mm body @ 11 px ≈ 29 chars; 80 mm ⇒ 72 mm @ 12 px ≈ 41 chars):

| Line | Chars | 58 mm | 80 mm |
|---|---|---|---|
| `راتب طه … المصروف 250 ج` | 64 | 3 lines (wraps, no clipping) | 2 lines |
| `راتب ملك … المصروف 520 ج` | 65 | 3 lines (wraps) | 2 lines |
| `راتب أسماء … المصروف 400 ج` | 57 | 2 lines (wraps) | 2 lines |
| `إجمالي الرواتب المصروفة: 1,170 ج` | 32 | 2 lines | 1 line |

A 45-character Arabic name produced an 81-char statement that wraps to 3 lines at 58 mm — stored and printed **in full**, no `…`, no clipping (`22a`, `22c`). A hostile name (`<script>bad</script>`) is escaped to `&lt;script&gt;` (`22f`).

Because `.pw` declares `overflow-wrap:anywhere; word-break:break-word` and **no** `hidden`/`nowrap`/`ellipsis`, a line can never exceed the paper or inflate the report.

### 8.4 Scope of this verification

This is **automated verification of the generated HTML/CSS only.** No thermal printer was available; no paper output was inspected. See §13.

---

## 9. Test Results

### 9.1 Focused suite — `node tests/v257-salary-expenses.test.js`

**122 passed, 0 failed** — every one of the 24 required scenarios.

| Required | Coverage |
|---|---|
| 1–5 salary calculations | `1a`–`1m`, `2a`–`2e`, `3a`–`3f`, `4a`–`4e`, `5a`–`5d` |
| 6–10 expense integration | `6a`–`6b`, `7a`–`7b`, `8a`–`8d`, `9a`–`9b`, `10a`–`10c` |
| 11–16 accounting integrity | `11a`–`11d`, `12a`–`12c`, `13a`–`13g`, `14a`–`14i`, `15a`–`15d`, `16a`–`16e` |
| 17–24 compact report output | `17a`–`17e`, `18a`–`18e`, `19a`–`19e`, `20a`–`20c`, `21a`–`21g`, `22a`–`22f`, `23a`–`23f`, `24a`–`24f` |

It drives the **production** functions, not re-implementations: `payroll-core.js` is `require`d directly, and `payCommit`, `recordPayrollExpenses`, `dayExpenseRow`, `totals` are extracted from `index.html` and run with injected stubs. The clock is pinned (`atClock`) so results are deterministic. All data is synthetic and in memory.

### 9.2 Full suite — every `tests/*.test.js` run individually

**2,353 passed / 0 failed across 28 files** (baseline was 2,231 / 27).

```
payroll-db-safety 38 · payroll-e2e 89 · payroll-integrity 101 · payroll-migration-gate 39
payroll-migration 139 · payroll-properties 18 · payroll-report 333 · payroll-ui 96
payroll 222 · phase1-printer-feedback 40 · phase3b-auth 62 · phase3b-ipc 15
phase3c1-dom 37 · phase3c1-gate 49 · phase3c1-ipc 19 · phase3c1-session 30
phase3c2-baseline 65 · phase3c2-gate 44 · phase3c2-ipc 49 · phase3c2-perms 39
phase3c3-accounts 92 · phase3c3-ui 76 · phase3c4-recovery 79
phase4-daily-report 71 · update-data-preservation 25
v256-attendance-scroll 218 · v256-payroll-exports 146 · v257-salary-expenses 122
```

### 9.3 Release-scope guards — maintained, not weakened

`tests/v256-attendance-scroll.test.js` section D is a v2.5.6 phase guard anchored to `git rev-parse v2.5.6~1`. It had to be extended; the changes are:

| Guard | Change | Why unavoidable |
|---|---|---|
| `D1` | `2.5.6` → `2.5.7` → `2.5.8` | it pins the authorized version bump |
| `D2/D3` | added `V257_FNS = ["recordPayrollExpenses","dayExpenseRow"]` | any new `function name(` in `index.html` must be allow-listed; the length check is exact |
| `D8` | allow-list extended with `arDayCount`, `fmt`, `salaryDesc`, `salaryExpenseEntries`, `salaryExpenseTotal` | payroll-core gained only these; **no existing function was removed** |
| `D8b` | normaliser excludes the new functions | keeps the "pure additions" rule intact |
| `D9` | added `assets/report/daily-report.js`, `tests/v257-salary-expenses.test.js`, `AI_REPORTS/V2_5_7_…REPORT.md` | new files must be allow-listed |

**No assertion was weakened, skipped, or removed** — the same convention the v2.5.6 release used (see its publish report §2). `D4` (no function removed), `D5` (no new `<script>`), `D6`, `D7` (1 dependency + 2 devDependencies) are all still enforced and passing. The `git`-backed guards remain anchored to `v2.5.6~1`, which was deliberately **not** changed to `HEAD~1`.

---

## 10. Build and Artifact Verification

Built to a **temporary directory** with the project's existing `electron-builder.yml`, unchanged:

```
npx electron-builder --win --publish never \
  --config.directories.output=%TEMP%\malahy-build-258
→ exit 0 | electron-builder 26.15.3 | electron 43.7.5 | NSIS x64 | oneClick=false
```

Packaged `app.asar` inspected:

| Check | Result |
|---|---|
| entries | 366 |
| `tests/` or `AI_REPORTS/` entries | **0** |
| dev-dependency entries (`electron`, `electron-builder`) | **0** |
| packaged `package.json` version | **2.5.8** |
| `payroll-core.js` contains `salaryExpenseEntries` | yes |
| `daily-report.js` contains `إجمالي الرواتب المصروفة` | yes |
| `index.html` contains `recordPayrollExpenses` / `dayExpenseRow` | yes / yes |
| `index.html` still sums `state.expenses` as the single source | yes |
| `main.js` `contextIsolation:true` + `nodeIntegration:false` + `javascript:false` | unchanged |

### Release directory and assets

`D:\Malahy\releases\v2.5.8\`

| File | Bytes | SHA-256 |
|---|---|---|
| `malahy-setup-2.5.8.exe` | 105,909,392 | `4635ce8a99bb623dcf6a529a525dfef873620393d2ff596213bc8403d3bed7cd` |
| `malahy-setup-2.5.8.exe.blockmap` | 111,150 | `e113c18442b7d844dc6e5a2fdee03935fa95a6c19918786057b4ce8672ef3013` |
| `latest.yml` | 341 | `b3d95eeab40449b6e20baf28fd54bd3ecc83c78577a11e46f7d5715be49b37bf` |
| `SHA256SUMS.txt` | 267 | — |

Installer SHA-512 (base64): `zR9fs5WQQIJugwOXkiXVCATUzhYW2XOrJaB9xWIxSjjSPuOY8QhRsR4YtrWcxvsxbHUtHX53cvwuvCEguKZ7Dw==`

`latest.yml` consistency: `version: 2.5.8` ✔ · `size: 105909392` == actual bytes ✔ · `sha512` recomputed independently ✔

`releases/` is git-ignored and untracked, matching v2.5.2–v2.5.6. `releases/v2.5.6/malahy-setup-2.5.6.exe` still hashes to `456dd4b1…` — byte-identical to the published v2.5.6 artifact.

---

## 11. Git Commits and Tags

```
f3ac103  fix: separate the payroll expense label from its amount in the daily report
3acfe66  release: v2.5.8 (patch) — correct compact salary-line spacing     ← tag v2.5.8
7260a50  release: v2.5.7 salary payouts post as compact daily expenses    ← tag v2.5.7
5bdbfd1  (pre-existing HEAD)
```

| Tag | Object | Peels to |
|---|---|---|
| `v2.5.8` | `8bf7d9a2014dd72887664d3077538e40e2ad1460` | `3acfe66f3a98568046393eb679e23e93edf73d1b` |
| `v2.5.7` | `37d98be220e6d5846d2810b65c7e292e00d449d5` | `7260a50214e5c1f915952771f45d0d6f2487eb18` |
| `v2.5.6` | `734ddb2b380f776c49455c58cd3e572839066343` | `0a548ad208deb595b97830126dd40dc12249acbb` (unchanged) |

```
git push origin main     → 7260a50..3acfe66  (fast-forward, no force)
git push origin v2.5.7   → * [new tag]
git push origin v2.5.8   → * [new tag]
origin/main              → 3acfe66
```

No `git reset --hard`, no `git clean`, no force-push, no amend, no tag moved or recreated. All staging used explicit paths — never `git add .` or `git add -A`.

### Why two releases

Automated layout verification (§8) found a real defect in the v2.5.7 build: the compact line rendered as `المصروف250 ج` because the statement and the LTR-isolated amount span had no whitespace between them. It was fixed in `f3ac103` and shipped as **v2.5.8**. The user was asked and chose to **keep v2.5.7 exactly as published** and release the fix separately, so v2.5.7's tag, commit and assets remain untouched. v2.5.8 is the release that contains the complete feature.

---

## 12. GitHub Releases — independently verified

| | v2.5.7 | v2.5.8 |
|---|---|---|
| URL | <https://github.com/sliveamer20/malahy/releases/tag/v2.5.7> | <https://github.com/sliveamer20/malahy/releases/tag/v2.5.8> |
| Release id | 411364389 | 411376714 |
| `draft` / `prerelease` | false / false | false / false |
| Published | 2026-10-13T06:39:52Z | 2026-10-13T06:55:02Z |
| Assets | 4, all `state=uploaded` | 4, all `state=uploaded` |

Verification was **by actual download, not by exit code** — using unauthenticated public HTTPS:

- Public API read: HTTP 200 for both tags, `draft:false`, 4 assets each.
- Every asset downloaded; SHA-256 recomputed → all match the published `SHA256SUMS.txt` **and** the local `releases/vX.Y.Z/` copies.
- Downloaded installer SHA-512 recomputed → matches `latest.yml` and the declared size.
- `GET …/releases/latest/download/latest.yml` → HTTP 200, `version: 2.5.8`.
- `GET …/releases/latest/download/malahy-setup-2.5.8.exe` → HTTP 200, 105,909,392 bytes.
- v2.5.7 re-verified after v2.5.8 was published: still 4 uploaded assets, hashes unchanged.

The built-in updater (`electron-updater`, GitHub provider, floor `2.5.1` in `update-gate.js`) can discover and download both.

---

## 13. Manual Tests NOT Performed

These are **not** claimed as verified:

1. **Physical thermal printing** on real 58 mm / 80 mm printers — no printer was available. All layout evidence is automated analysis of the generated HTML/CSS.
2. **Visual paper inspection** of the printed daily report, including where exactly line-wrapping falls on 58 mm.
3. **Opening the packaged app** end to end (login → employee → payroll → expenses → print) on a real install.
4. **Opening the Excel export in Microsoft Excel / LibreOffice.**
5. **Production-data behaviour** — deliberately untouched. `%APPDATA%\malahy` was never read, written or migrated; every test used synthetic data in memory or an `os.tmpdir()` sandbox, and `payroll-db-safety` asserts the sandbox is not the production folder.
6. **Long Arabic names on real paper at 58 mm** — verified programmatically (full text preserved, wrap-capable CSS) but not visually.
7. **Migration/backfill of historical payouts** — intentionally not performed (see §14).

---

## 14. Limitations, Risks and Warnings

**Warnings (behavioural, by design)**

1. **Daily net changes for future days only.** Before v2.5.7 salary cash was never deducted from the daily net; from v2.5.7 it is, via the linked expense. **No historical day was rewritten and no expense was fabricated for old payouts.** Historical daily reports for days before v2.5.7 keep their original (pre-feature) figures. This is intentional — inventing past cash outflows without authorization would corrupt recorded financials.
2. **Payout after a day reset.** The row lands in the currently open POS day. No automatic re-dating was invented; see §5.
3. **Deletion of a salary expense is refused.** This is new behaviour. There is no "reverse payout" screen, so a legitimate deletion was not possible anyway; refusing prevents a silent, unreconciled loss of a real cash movement.
4. **Ordering inside the expenses section.** Salary rows print **first**, then their subtotal, then the ordinary expenses in their original order. This matches the requested layout; it is a display grouping only and changes no amount.
5. **58 mm wraps to 2–3 physical lines per employee.** Inherent: the requested statement is 56–65 characters while 58 mm holds ≈29. Chosen over truncation, per the readability requirement.

**Risks**

6. Physical print output is unverified (§13.1). If 58 mm proves cramped in real use, the first lever is shortening the separators — no code path currently clips or loses data.
7. `state.expenses` grows by one row per paid employee per payout. Negligible; the archive path was already storing a per-row list.
8. If `recordPayrollExpenses` throws, the payout still stands (cash really left the drawer), the error is logged via `logErr`, and the user is warned — deliberately **not** rolled back, because rolling back a completed payout would misreport the employee as unpaid while holding their money.

**Blockers**

None.

---

## 15. Security and Data Preservation

- Electron security settings **not** weakened — `main.js` diff is empty; `contextIsolation:true`, `nodeIntegration:false`, `javascript:false` verified inside the packaged `app.asar`.
- Permissions and audit safeguards unchanged — `permissions.js` diff is empty; the triggering action still requires the `payroll` permission.
- `database.js`, `activation.js`, `update-gate.js`, `perm-gate.js`, `recovery.js`, `users.js` untouched.
- Production payroll data never accessed, migrated, reset or modified.
- Secret scan across all repository `.js/.json/.html/.yml/.md` (excluding `node_modules`, `.git`, `releases`, `dist`): **one** hit — a pre-existing Arabic prose line in `AI_REPORTS/PAYROLL_RELEASE_PUBLICATION_REPORT.md` (commit `0ef9cc2`, v2.5.5 era) that *names* the `ghp_` / `github_pat_` prefixes while describing the scan method. **Not a token.** No `.env`, cookie, session file, private key or certificate anywhere in the repository or in any release asset.
- `GH_TOKEN` was read from the environment for the API calls only. Its value was never printed, logged, written to a file, passed as a command-line argument, or committed. No secret value appears in this report or in either release note.
- No previous release asset deleted or overwritten. `releases/v2.5.6/malahy-setup-2.5.6.exe` still hashes to `456dd4b1…`, identical to the published v2.5.6 artifact; `v2.5.7` re-verified intact after v2.5.8 shipped.
- Release assets contain only the installer, its blockmap, updater metadata and checksums — no source tree, no `node_modules`, no tests, no reports.
- Only remote: `sliveamer20/malahy`.

---

## 16. Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Actual salary payments appear in the existing Daily Expenses section | ✅ | `17a`, `6a`–`6b` |
| Every paid employee has a clear, concise Arabic entry | ✅ | `17a`, `21a`–`21b`, §8.1 |
| Gross, advances, deductions and actual net cash are distinguishable | ✅ | `1j`–`1m`, `10c`, `12a`–`12c` |
| Total actual salary cash expense is correct | ✅ | `9a`–`9b`, `19a`–`19c` |
| Final daily cash/net correct without double deductions | ✅ | `11b`–`11d`, `19e` |
| Daily report and Returns Log workflow intact | ✅ | `20a`–`20c`, `phase4-daily-report` 71/71 |
| Report stays compact, no unnecessary payroll pages | ✅ | `18a`–`18e`, §8.2 (+4 elements) |
| All required tests pass | ✅ | 2,353 / 0 / 28 files |
| Production data and previous releases untouched | ✅ | §15 |
| Implementation report saved under `AI_REPORTS/` | ✅ | this file |

---

## 17. Final Status

# `PASS WITH WARNINGS`

Everything requested was implemented, tested and published. The two warnings are deliberate, documented behavioural decisions rather than defects:

- historical daily totals before v2.5.7 were **not** restated — backfilling past salary cash would require an authorized migration strategy, which Phase 5 explicitly withholds without one;
- a payout executed after a day reset is booked into the currently open day rather than silently re-dated into an archived one.

The single most important engineering finding is recorded in §2.4: **salary payouts previously had no effect on the daily balance at all**, so this integration introduces the first and only deduction and cannot double-count. That is asserted, not assumed — `11b`, `11c` and `11d` compare the daily net delta against the actual cash paid.

Nothing in this report is claimed that was not performed.
