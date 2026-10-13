# Malahy v2.5.9 — Electronic Payments Excluded from the Final Physical Cash

**Implementation report** · Malahy Amusement Park Management System · `sliveamer20/malahy`
Report language: Arabic / English (mixed, matching the repository's convention).

| | |
|---|---|
| Previous stable release | `v2.5.8` |
| This patch release | **`v2.5.9`** |
| Release type | Patch — focused accounting change |
| Branch / base | `main` · `6751130` (clean working tree) |
| Release commit / tag | `ade209c` · tag object `bfbe64d` |
| Full test suite | **2547 passed / 0 failed** across **29 files** |
| Baseline before this change | 2353 passed / 0 failed across 28 files |
| Final status | **PASS** |

---

## 1. Initial Git and release state

```
## main...origin/main
* main 6751130 [origin/main] docs: record the v2.5.7 salary-expenses implementation...
6751130 docs: record the v2.5.7 salary-expenses implementation, accounting and release evidence
3acfe66 release: v2.5.8 (patch) — correct compact salary-line spacing     ← tag v2.5.8
```

- Working tree: clean, no untracked files, no stash, no local divergence from `origin/main`.
- Local tags verified: `v2.5.8` → tag object `8bf7d9a2014dd72887664d3077538e40e2ad1460`
  → commit `3acfe66f3a98568046393eb679e23e93edf73d1b`. **v2.5.8 confirmed as the current
  published release** via the public GitHub API (`releases/latest` → `v2.5.8`,
  published `2026-10-13T06:55:02Z`, 4 assets, not a draft, not a prerelease).
- `package.json` version was `2.5.8`.
- No `git reset --hard`, `git clean`, or force-push was used at any point.

---

## 2. Existing electronic-payment data flow (verified before any change)

Traced end to end; nothing was assumed.

| Step | Location | Behaviour |
|---|---|---|
| Sale | `addTicket(id, 'elec')` in `index.html` | `state.ecounts[id]++`, then `txPricesPush(id,'elec',1,g.price)` records the **actual unit price paid**, then a transaction log entry with `method:'elec'`. |
| Price ledger | `state.pprices[gameId].elec[]` | One real entry per electronic ticket — the authoritative per-ticket price record. |
| Per-game totals | `gameSalesTotals(gameId)` | `count = c + e`, `cashTotal` and `elecTotal` built from the price ledger; the shortfall of very old data falls back to the catalog price. |
| Day totals | `totals()` | `revenue += st.total`, `elecRevenue += st.elecTotal`, `elecTickets += st.elecCount` — summed across games from the same records. |
| Returns / voids | `deductOne` / `deductBatch` | Decrements `state.ecounts` **and** pops from `state.pprices.elec`, so both the count and the amount fall together; a review-log entry is written once with `method:'elec'` or `'mixed'`. |
| Archive | `archiveDay(t)` | Persists `cashRevenue`, `elecRevenue`, `cashTickets`, `elecTickets` alongside `revenue`/`net`/`finalNet`, so every archived day already carries the authoritative payment split. |
| Day model | `dailyReportModel(day, opts)` | Read `day.tickets`/`cashTickets`/`elecTickets` and rendered a ticket breakdown, but **ignored `day.elecRevenue`**. |

**Was the electronic amount already deducted anywhere?** — **No.** Every consumer used
`elecRevenue` for *display* only (`#sumElec` card, `repCard('مبيعات إلكتروني 💳')`, the
`منها تحويل إلكتروني` row in `reportRows`/`reportHTML`). Neither `totals()` nor
`dailyReportModel()` ever subtracted it. Confirmed by full-text search and by reading
both computation paths. The change therefore adds a subtraction that genuinely did not exist,
rather than moving an existing one.

**Number of final-balance paths (reconciled):** there are exactly two producers of the
day-level final figure, and they must agree:

1. `totals()` → `finalNet = revenue − expenses + gifts` (screen: `#scFinal`, `#sumFinal`).
2. `dailyReportModel()` → `final = totalSales − expenses` where `totalSales = gameSales + giftSales`.

Algebraically identical (`totalSales − expenses ≡ revenue + gifts − expenses`). Both were
changed with the same single subtraction so the screen and the printer can never diverge.
A third, separate path — the multi-day **Reports & Statistics** aggregate
(`aggregate()`/`reportHTML`) — was deliberately **not** touched (see §10 Limitations).

---

## 3. Exact final-total formula before and after

**Before (v2.5.8)**

```
net      = revenue − expenses
finalNet = net + gifts          ← the single reported "الإجمالي النهائي"
final    = totalSales − expenses  (printed report; identical value)
```

**After (v2.5.9)** — the pre-electronic balance is preserved verbatim, and exactly one new
subtraction is appended:

```
net            = revenue − expenses                      (unchanged)
netBeforeElec  = gameSales − expenses                    (new, named)
final / finalNet = netBeforeElec + gifts                 (unchanged value — still the pre-electronic balance)
elecDeduction  = elecRevenue                             (new — the authoritative collected amount)
finalCash      = finalNet − elecDeduction                (new — "الإجمالي النهائي النقدي")
            ≡   netBeforeElec + gifts − elecRevenue
```

Applied in both producers with the **same** expression, so `screen == print` by construction.

**Worked example (synthetic, per the specification)**

| Line | Value |
|---|---|
| مبيعات الألعاب (game sales) | 520 |
| ↳ الدفع النقدي | 300 |
| ↳ الدفع الإلكتروني | 220 |
| ↳ التذاكر الإلكترونية | 8 |
| إجمالي المصروفات | 90 |
| الصافي قبل خصم الإلكتروني | 520 − 90 = **430** |
| الهدايا | +25 |
| الإجمالي قبل خصم الإلكتروني | **455** (unchanged legacy figure) |
| خصم المبيعات الإلكترونية | −220 |
| **الإجمالي النهائي النقدي** | 455 − 220 = **235** ✔ |

Verified by the model directly:

```json
{"gameSales":520,"giftSales":25,"totalSales":545,"expenses":90,"cashSales":300,
 "elecSales":220,"netBeforeElec":430,"final":455,"elecDeduction":220,"finalCash":235}
```

---

## 4. How electronic ticket counts are derived

Authoritative records exist, so no inference is used.

- `elecTickets` = `Σ state.ecounts[g.id]` over active games, summed by `totals()`.
- Each electronic ticket has its own entry in `state.pprices[gameId].elec[]`
  (`txPricesPush` pushes one entry per ticket), so the count is a real record count and
  **not** `elecRevenue / price`.
- Returns decrement `state.ecounts` **and** pop the price ledger in the same operation, so a
  refunded electronic ticket cannot remain in either the count or the amount — no double counting,
  no stale residue. A `mixed` batch (`deductBatch`) takes cash first, then electronic, exactly as
  the UI message states, and logs a single review entry.
- The printed report shows the electronic-ticket count once, in the sales-summary breakdown as
  `↳ التذاكر الإلكترونية` (count only — the amount is on the line above it), and the dedicated
  tickets section still prints `عدد التذاكر / منها كاش / منها إلكتروني`.
- **Zero inference from totals:** when a day record carries `elecRevenue` but the count is absent,
  the model reports the amount and leaves the count at its record value (0 for legacy records) —
  it never derives a count by division. Requirement 6 of Phase 4 is satisfied structurally.

## 5. Files changed and why

| File | Change | Why |
|---|---|---|
| `assets/report/daily-report.js` | 6 new summary fields (`cashSales`, `elecSales`, `netBeforeElec`, `elecDeduction`, `finalCash`, and `final` re-documented as the pre-electronic balance); 5 new printed rows in the sales-summary section; header comment updated with the full formula. | The single source of truth for the daily report's calculations and layout. Cash/electronic breakdown and the deduction live here so the printed report cannot drift from the screen. |
| `index.html` | `totals()` returns `elecDeduction` + `finalCash`; `renderSummary()` paints 3 new cells; the Daily Account Summary gains the electronic-ticket-count row, the pre-electronic-balance row, the deduction row and the final-cash row; the scoreboard's final cell is relabelled and now shows `finalCash`. | The only screen that shows the daily summary. All amounts are still derived from `totals()`; no second copy of the accounting exists. |
| `tests/v259-electronic-cash.test.js` | **New — 194 focused assertions.** | Regression coverage for the new accounting rule (full list in §6). |
| `tests/v256-attendance-scroll.test.js` | `D9` release-scope guard allowlist extended with the new test file and the new report; `D1` version guard → `2.5.9`. | Keeps the release-scope guard honest for this release; pins the authorized version bump. |
| `tests/phase3b-auth.test.js`, `tests/phase3c1-gate.test.js`, `tests/phase3c2-baseline.test.js`, `tests/v256-payroll-exports.test.js` | Version guards `2.5.8` → `2.5.9`. | The five suites that pin the authorized bump, exactly as `v2.5.8` did before it. |
| `package.json` | `version: 2.5.9`. | Release metadata. |
| `AI_REPORTS/V2_5_9_ELECTRONIC_CASH_RECONCILIATION_REPORT.md` | This file. | Required implementation report. |

**Diff size:** 8 modified files, 1 new test file, +710 / −22 lines. The two production files
account for +60 / −14 lines; the rest is tests, guards and metadata.

Nothing in the sales, payroll, expenses, gifts, returns, permissions, printing or update
subsystems was modified. `main.js`, `preload.js`, `database.js`, `activation.js`, `update-gate.js`,
`users.js`, `permissions.js`, `perm-gate.js`, `recovery.js`, `accounts.js`,
`electron-builder.yml` and every asset other than `daily-report.js` are untouched — this is
independently enforced by the `13/14` protected-baseline byte-identity guard, which still passes
(`index.html` and `package.json` are its declared intended-change files).

---

## 6. Focused test results

`tests/v259-electronic-cash.test.js` — **194 passed / 0 failed**, grouped A–F.
The tests exercise the **real** extracted functions from `index.html` (`totals`,
`gameSalesTotals`, `addTicket`, `addBatch`, `deductBatch`, `deductOne`, `gameBreakdown`,
`archiveDay`, `renderSummary`, `dayReviewAppendHTML`) plus the real `daily-report.js` module.
All data is synthetic and in-memory.

Coverage against the 17 required cases:

| # | Requirement | Assertion |
|---|---|---|
| 1 | Cash 300 + electronic 220 = 520 | `1d`, `13d` |
| 2 | Expenses 90 → pre-gift net 430 | `2b`, `2c`, `33f` |
| 3 | Gifts 25 per the existing convention | `3a`–`3c`, `13i`, `33g` |
| 4 | Final physical cash = 235 | `4b`, `4c`, `13k`, `20b`, `33j` |
| 5 | Deducted exactly once | `5a`–`5e`, `36e`, `36f` |
| 6 | Game sales stay 520, not 300 | `5d`, `6a`, `36a` |
| 7 | Electronic count from actual records | `7a`, `7d`, `14a`, `14b`, `33d` |
| 8 | Cash ticket counts unchanged | `7b`, `13g`, `16a`, `16f` |
| 9 | Zero-electronic day unchanged | `9a`–`9e`, `29a`–`29e` |
| 10 | Multiple electronic transactions summed | `10a`–`10c`, `31a`, `31b` |
| 11 | Cancelled/voided/returned follow the rules | `15a`–`15h`, `16a`–`16f`, `17a`–`17g` |
| 12 | Printing/exporting creates nothing | `21a`–`21d`, `24c`, `34a`, `34b` |
| 13 | Daily salary expenses still counted | `25a`–`25c` |
| 14 | Returns Log intact | `23c`, `24a`–`24c` |
| 15 | Screen and print agree | `20a`–`20c`, `33j`, `36g`–`36j` |
| 16 | 58 mm / 80 mm readable within width | §C/22 (width estimate, no table, nowrap values, min-width:0 labels, balanced tags, A4 unchanged) |
| 17 | Historical reports use saved data | `27a`–`31c` |

Additional focused checks that were found to matter during implementation:
an electronic refund leaves physical cash unchanged because the sale never entered the drawer
(`15d`/`15e`), a cash refund reduces it (`16c`, `17f`), the value is never clamped to zero
(`18a`/`18d`), and `renderSummary()` is a pure paint pass (`34a`/`34b`).

## 7. Full test-suite results

```
ok  payroll-db-safety.test.js          38     ok  phase3c2-baseline.test.js   65
ok  payroll-e2e.test.js                89     ok  phase3c2-gate.test.js       44
ok  payroll-integrity.test.js         101     ok  phase3c2-ipc.test.js        49
ok  payroll-migration-gate.test.js     39     ok  phase3c2-perms.test.js      39
ok  payroll-migration.test.js         139     ok  phase3c3-accounts.test.js   92
ok  payroll-properties.test.js         18     ok  phase3c3-ui.test.js         76
ok  payroll-report.test.js            333     ok  phase3c4-recovery.test.js   79
ok  payroll-ui.test.js                 96     ok  phase4-daily-report.test.js 71
ok  payroll.test.js                   222     ok  update-data-preservation..  25
ok  phase1-printer-feedback.test.js    40     ok  v256-attendance-scroll..   218
ok  phase3b-auth.test.js               62     ok  v256-payroll-exports..     146
ok  phase3b-ipc.test.js                15     ok  v257-salary-expenses..     122
ok  phase3c1-dom.test.js               37     ok  v259-electronic-cash..     194   ← new
ok  phase3c1-gate.test.js              49     ok  phase3c1-ipc.test.js        19
                                        ok  phase3c1-session.test.js     30
---- 29 files · 0 failing files · 2547 assertions ----
```

Zero failures. No existing assertion was weakened, skipped or deleted; the only edits to
pre-existing suites were the authorized version-guard bumps and the `D9` allowlist extension.

## 8. Printing-layout verification

Automated, on the generated HTML/CSS for all three paper kinds (no physical printer available):

| Check | 58 mm | 80 mm | A4 |
|---|---|---|---|
| Body width / page setup unchanged | `width:48mm` ✔ | `width:72mm` ✔ | `@page{size:A4;margin:12mm}` ✔ |
| Font size unchanged | 11 px ✔ | 12 px ✔ | 13 px ✔ |
| No `<table>` / no inline width | ✔ | ✔ | ✔ |
| Values single-line (`white-space:nowrap`), labels shrinkable (`min-width:0`) | ✔ | ✔ | ✔ |
| Widest summary row ≤ 2 wrapped lines within the paper | ✔ | ✔ | n/a |
| RTL document + LTR-isolated numbers | ✔ | ✔ | ✔ |
| Balanced `<div>` tags | ✔ | ✔ | ✔ |
| No `page-break` rule anywhere | ✔ | ✔ | ✔ |

- The summary section grew by **exactly 5 rows** (3 payment breakdown + deduction + final cash);
  no new separators, no new sections, no extra pages. `SECTION_ORDER` is unchanged and the
  Returns Log is still the final section, after the footer.
- Payroll block unchanged: one compact line per employee + one subtotal, still inside the
  expenses section, and the salary subtotal still equals the sum of the actual cash payouts.
- The printed final cash amount is produced by the same expression as the screen value, so
  `235` appears in both for the same day (`20a`–`20c`).

## 9. Build and checksum verification

Built in a temporary output directory
(`%TEMP%\opencode\malahy-dist-259`, `electron-builder --win --publish never`):

| Artifact | Bytes | SHA-256 |
|---|---|---|
| `malahy-setup-2.5.9.exe` | 105,908,711 | `857d543903ce864388c0e5a905ed9f69b3beb37396a8e99c7067ec28ab5c74d8` |
| `malahy-setup-2.5.9.exe.blockmap` | 111,209 | `5b9804c2388ad0bd9f996b3dd7aeea8b58f56b9d1e934a8c476ba7a09858410c` |
| `latest.yml` | 341 | `645284f71ca30b4d79beb0fd126aa79941041d2908f8242a162b371a06208288` |

`latest.yml` independently recomputed and verified: `version: 2.5.9` ✔ ·
`size: 105908711` == actual bytes ✔ ·
`sha512: YWT7srmE1rqImUfjp7+Gu5QDGXvNqKeHFRe2naKGY06X7N873H7MF6WBUdg0kF27+leCMByW1R3x3ZQGB51V/g==`
recomputed with Node `crypto` and byte-for-byte equal ✔.

**Packaged-app content check** — the asar was extracted to an isolated temp directory (never into
the repository) and 20 markers were asserted, including `const elecDeduction = elecSales;`,
`const finalCash = round2(finalTotal - elecDeduction);`, the new printed rows, the new element ids,
`const finalCash=finalNet-elecDeduction;` in `index.html`, `fmtNum(t.finalCash)` on the scoreboard,
`summary.final` still being the pre-electronic balance, the removed `id="sumFinal"`, and the absence
of any double deduction. All 20 pass → **the installer contains the intended change**.

> Incident and remedy: an initial `asar extract-file` invocation was run with the repository as the
> working directory and overwrote `package.json` in the working tree with the pruned packaged copy.
> It was detected immediately via `git status`, restored from the index, and re-bumped to `2.5.9`.
> The installer was then rebuilt from the corrected tree and re-verified, so the published artifact
> provably matches the committed sources. No other file was affected.

## 10. Release folder, assets and publication

Local folder, following the established convention `releases/<version>/`:

```
D:\Malahy\releases\v2.5.9\
├── malahy-setup-2.5.9.exe          105,908,711
├── malahy-setup-2.5.9.exe.blockmap     111,209
├── latest.yml                             341
└── SHA256SUMS.txt                         267
```

`SHA256SUMS.txt` (ASCII):

```
645284f71ca30b4d79beb0fd126aa79941041d2908f8242a162b371a06208288  latest.yml
857d543903ce864388c0e5a905ed9f69b3beb37396a8e99c7067ec28ab5c74d8  malahy-setup-2.5.9.exe
5b9804c2388ad0bd9f996b3dd7aeea8b58f56b9d1e934a8c476ba7a09858410c  malahy-setup-2.5.9.exe.blockmap
```

Copies are byte-identical to the build output (SHA-256 compared per file).

**Publication** — `gh` was not installed, so the GitHub REST API was used directly with the
token already present in the environment (the token was never printed or echoed into the chat).

- `git push origin main` → `6751130..ade209c main -> main`
- `git push origin v2.5.9` → `* [new tag] v2.5.9 -> v2.5.9`
- Release created (not a draft, not a prerelease, `make_latest: true`) and all four assets uploaded.

**Independent post-publish verification** (public API + CDN download, hashes recomputed):

```
latest release tag    : v2.5.9
html_url              : https://github.com/sliveamer20/malahy/releases/tag/v2.5.9
published_at          : 2026-10-13T11:19:03Z
prerelease / draft    : false / false
assets                : 4
  latest.yml                    341  sha256 645284f7…08288  OK
  malahy-setup-2.5.9.exe   105908711  sha256 857d5439…74d8  OK
  malahy-setup-2.5.9.exe.blockmap 111209  sha256 5b9804c2…410c  OK
  SHA256SUMS.txt                267  sha256 f7bc6259…4933  OK
```

**GitHub Release URL:** <https://github.com/sliveamer20/malahy/releases/tag/v2.5.9>
**Direct asset URL:** <https://github.com/sliveamer20/malahy/releases/download/v2.5.9/malahy-setup-2.5.9.exe>

Previous releases re-verified after publication — all intact, hashes unchanged:

| | v2.5.7 | v2.5.8 |
|---|---|---|
| exe sha-256 | unchanged | `4635ce8a99bb623dcf6a529a525dfef873620393d2ff596213bc8403d3bed7cd` |
| assets | 4 | 4 |
| URL | <https://github.com/sliveamer20/malahy/releases/tag/v2.5.7> | <https://github.com/sliveamer20/malahy/releases/tag/v2.5.8> |

## 11. Git commit and tag details

```
ade209c release: v2.5.9 (patch) — exclude electronic payments from the final physical cash
        9 files changed, 710 insertions(+), 22 deletions(-)
        create mode 100644 tests/v259-electronic-cash.test.js

tag v2.5.9  (annotated)
        object bfbe64d5d416a8a298d30a2600ac1c08af7ff735
        tagger sliveamer20 <sliveamer20@gmail.com>
        target ade209c955e4cb43f1e25f8b6eb91a3a8445322a
```

Tag history (most recent first): `v2.5.9` · `v2.5.8` · `v2.5.7` · `v2.5.6` · `v2.5.5` · … — no tag was
moved, deleted or recreated; `v2.5.8` still resolves to `3acfe66`.

## 12. Limitations and manual tests not performed

1. **No physical printing.** Layout was verified automatically on the generated HTML/CSS only
   (width estimation, no tables, no overflow classes, single-line values, balanced tags). A real
   58 mm/80 mm thermal print was not performed — consistent with every prior release in this repo.
2. **No runtime Electron smoke test.** The app was not launched from the packaged build; the
   change is verified at the source level by tests that execute the real functions extracted from
   `index.html`, plus a static content check of the packaged asar.
3. **Reports & Statistics (multi-day aggregate) intentionally unchanged.** `openReports()`,
   `aggregate()`, `reportRows()`, `reportHTML()`, the PDF and Excel exporters still show
   `الإجمالي النهائي` as the pre-electronic figure over a period. The requested scope was the
   *daily* report and the *daily* account summary; changing a multi-day roll-up would need its own
   design decision about whether a period figure should mix pre- and post-deduction days. Flagging
   it here as a known, deliberate boundary rather than an oversight.
4. **`windows/splash.html` still reads `الإصدار 2.5.4`.** Pre-existing and untouched by every
   release since v2.5.4; the authoritative version shown in-app comes from `package.json` via
   `app.getVersion()`. Left as-is to keep the change minimal.
5. **Zero-electronic days in production** were covered with synthetic records (`9a`–`9e`, `29a`–`29e`),
   including a legacy record with no payment fields at all. No production data was read, migrated,
   reset or modified.
6. **`elecRevenue` is treated as collected cash-equivalent revenue**, per the existing data model.
   Partially-paid or refunded-but-still-counted electronic flows are not modelled by the application
   and were not invented here.

## 13. Final status

**PASS**

- Total game sales unchanged (520 stays 520).
- Cash and electronic shown separately, reconciling to game sales.
- Electronic ticket count shown from authoritative records (8), never inferred from the amount.
- Electronic payments deducted exactly once, from the final balance only.
- The reference scenario yields **235 EGP** under the existing gifts convention.
- Expenses, payroll, gifts and returns consistent with the existing rules.
- Screen and printed daily report agree (235 in both).
- Report stays compact on 58 mm / 80 mm / A4 (+5 summary rows, no new sections or pages).
- All required tests pass: **2547 / 0** across 29 files.
- Previous releases and production data untouched and re-verified after publication.
- Implementation report saved at `AI_REPORTS/V2_5_9_ELECTRONIC_CASH_RECONCILIATION_REPORT.md`.
