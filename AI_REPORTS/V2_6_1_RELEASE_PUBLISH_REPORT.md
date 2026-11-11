# Malahy v2.6.1 — Release Publish Report

**Status:** `PUBLISHED` — GitHub Release live, public, and verified (assets downloaded and hashed).
**Publication date:** 2026-11-11
**Repository:** `sliveamer20/malahy` (`https://github.com/sliveamer20/malahy.git`)
**Release URL:** https://github.com/sliveamer20/malahy/releases/tag/v2.6.1
**Direct installer:** https://github.com/sliveamer20/malahy/releases/download/v2.6.1/malahy-setup-2.6.1.exe

---

## 1. Release Identity

| Item | Value |
|---|---|
| Version | `2.6.1` (`package.json`, and `package.json` inside `app.asar`) |
| Branch | `main` |
| Release commit (tagged) | `ad1d96eae4448aad665297abbc45b6156cdeb4f1` — `release: v2.6.1 - printer offline fail-safe + daily report gift aggregate` |
| Tag | annotated `v2.6.1` — object `f4931e8623c35993cfe76ef30f23779999636321`, peels to `ad1d96e` |
| Push | `main` fast-forward `9320e08..ad1d96e` (no force); tag `v2.6.1` created new |
| Previous release | `v2.6.0` preserved untouched; no history rewrite |

The tag points at the release commit. The report-only commit that adds this file sits on top of it (same convention as v2.5.5–v2.6.0).

---

## 2. What Was Released

### 2.1 Printer offline / not-ready fail-safe

- New `printer-readiness.js`: a Windows-native readiness preflight (`Win32_Printer`
  state, USB PnP device presence/status behind the printer port, TCP reachability
  for network ports, spooler service state).
- `main.js` runs that preflight before `webContents.print()`. When the printer is
  offline, paused, in error, or its physical presence/port cannot be proven, the
  request is denied **fail-safe** and **nothing is submitted to the Windows Print
  Spooler**. The sale/ticket is already recorded, so no transaction is lost.
- On success the verified printer is pinned as `deviceName`; the spooler document
  gets a Malahy `<title>` marker; a 15-second in-memory `jobId` dedupe prevents
  duplicate submissions.
- There is **no** Malahy print queue, no retry, no persisted print command, and no
  indiscriminate queue clearing / spooler restart.

### 2.2 Daily report — gifts as one aggregate line

- The printed daily report (`assets/report/daily-report.js`, used by both
  `printTodayReport()` and archived-day printing) now renders **one** row:
  `إجمالي الهدايا: [المجموع] جنيه`.
- Individual gift descriptions, amounts, sequence numbers and timestamps are no
  longer printed in the daily report.
- The amount is `summary.giftSales` (= `day.gifts`), the same authoritative total
  already used by `totalSales`, `final` and `finalCash` — no second calculation,
  no double count.
- Gift records, issuance/deletion, reprinting, multi-day reports, and all
  financial totals/final cash are unchanged.

Full implementation details: `AI_REPORTS/PRINTER_OFFLINE_QUEUE_FIX_REPORT.md`
and `AI_REPORTS/DAILY_REPORT_GIFTS_AGGREGATION_REPORT.md`.

---

## 3. Tests and Results

All tests were run individually on the release tree (`32` files, `tests/*.test.js`).

| Suite | Result |
|---|---|
| **Full regression suite (32 files)** | **2735 passed / 1 failed** |
| `printer-offline-queue.test.js` (new) | 50 / 50 |
| `phase1-printer-feedback.test.js` | 40 / 40 |
| `daily-report-gifts-aggregate.test.js` (new) | 81 / 81 |
| `phase4-daily-report.test.js` | 71 / 71 |
| `v257-salary-expenses.test.js` | 122 / 122 |
| `v259-electronic-cash.test.js` | 194 / 194 |
| `v256-attendance-scroll.test.js` (incl. D9 scope guard) | 218 / 218 |
| `v256-payroll-exports.test.js` | 146 / 146 |
| `phase3b-auth.test.js` | 62 / 62 |
| `phase3c1-gate.test.js` | 49 / 49 |
| `phase3c2-baseline.test.js` | 65 / 65 |

### The single failure (pre-existing, unrelated)

`tests/payroll-ui.test.js` — **7g2**:

```
FAIL  7g2 batch reference is pinned to the fixed batch day
      got="PAY-20261111-01" want="PAY-20261013-01"
```

`payCommit()` uses `Date.now()` while the test pins the day `2026-10-13`, so it
fails on any other real date. It is exactly the same failure documented for
v2.6.0 (then as `7g`/`7g2`); no payroll code was touched in this release, and no
assertion was weakened or modified to hide it.

### Guard re-anchoring

- Version pins now expect `2.6.1`: `phase3b-auth`, `phase3c1-gate`,
  `phase3c2-baseline`, `v256-attendance-scroll` (D1), `v256-payroll-exports`.
- `tests/protected-baseline.json`: the single `electron-builder.yml` entry was
  re-anchored for the packaging change (same approved pattern as v2.5.4 / v2.6.0).
  `index.html` / `database.js` / `package.json` remain allow-listed as intended.
- D9 scope guard allow-list extended for the two new tests, the two feature
  reports, and this release report.

---

## 4. Build

| Item | Value |
|---|---|
| Build command | `npm run dist` → `electron-builder --win --publish never` |
| electron-builder | 26.15.3 |
| Electron | 43.7.5 (x64) |
| Target | NSIS x64, `oneClick: false`, `perMachine: false` |
| Output | `dist\malahy-setup-2.6.1.exe` |
| Size | **105,916,837 bytes** |
| SHA-256 | `5cb7bca74e8ff46442e9799217f218fb7d683eb5a7f48742919505b29033263b` |
| Blockmap | `malahy-setup-2.6.1.exe.blockmap`, 111,259 bytes, SHA-256 `20fbf7eb6f33e1c0689618f5eaa6123e1a25a66300d13b53b102540dd8181ef2` |
| `latest.yml` | 341 bytes, version `2.6.1`, SHA-512 `3ImctkvlR8gUd/ZchsJRJh+p+hiSxH/jljtrRapWIMxDjmvPkFox1fXENtHh9+DhS0lEBC2drPlshCnUnXxU9A==`, size matches the exe |

Build is the **final production build**, not a temporary validation build.
`app.asar` confirms `version=2.6.1`, contains `printer-readiness.js` (packaged
SHA-256 `865ceef0e28f128da4b7417d76417029cd1dbc714b0b46a5a72b39be80e6d9a3`,
identical to source), and contains the aggregate gift renderer.

Local release mirror: `releases/v2.6.1/` (exe + blockmap + latest.yml + SHA256SUMS.txt).

---

## 5. Packaged Application Validation (2.6.1)

The packaged app (`dist\win-unpacked\كوكي بارك.exe`) was launched with an isolated
`--user-data-dir` and `--remote-debugging-port=9333`; calls went through the real
preload bridge / renderer, not mocks.

| Check | Result |
|---|---|
| ASAR version | `2.6.1` |
| Offline Xprinter (`WorkOffline=True`) via `window.malahyPrint.printTicket(...)` | `{ok:false, reason:"printer-not-ready", detail:"offline"}` |
| Spooler jobs for Xprinter before / after | **0 / 0** (nothing submitted; no retry) |
| Daily report renderer in packaged app | exact text `إجمالي الهدايا:` + `100 جنيه`, **1** aggregate occurrence, **1** gifts section |
| Individual gift data in packaged report | **no leaks** (no names, sequences, per-gift amounts or times) |
| Summary gift row preserved | yes (`مبيعات الهدايا`) |

### Explicitly distinction — simulated vs physical

- **Simulated / packaged (performed):** offline denial, zero spooler submission,
  packaged report rendering, packaged asar integrity.
- **Physical Xprinter reconnection (NOT performed):** the printer is physically
  disconnected (`WorkOffline=True`). The physical reconnect test remains pending.
  Paused / paper-jam / door-open live states were also not induced (need admin),
  and the Xerox network printer is unreachable, so only the denial paths were
  exercised there. These limitations are unchanged from the implementation report.

---

## 6. GitHub Release and Public Verification

| Item | Value |
|---|---|
| Release name | `Malahy v2.6.1` |
| Tag | `v2.6.1` |
| Draft / prerelease | **false / false** |
| Latest | **yes** (GitHub API `releases/latest` returns `v2.6.1`) |
| Release URL | https://github.com/sliveamer20/malahy/releases/tag/v2.6.1 |
| Direct installer | https://github.com/sliveamer20/malahy/releases/download/v2.6.1/malahy-setup-2.6.1.exe |
| Public page check | HTTP 200 (unauthenticated) |

Uploaded assets (all `state: uploaded`):

| Asset | Size |
|---|---|
| `malahy-setup-2.6.1.exe` | 105,916,837 |
| `malahy-setup-2.6.1.exe.blockmap` | 111,259 |
| `latest.yml` | 341 |
| `SHA256SUMS.txt` | 267 |

**Download verification:** the public installer was downloaded anonymously
(`105,916,837` bytes) and its SHA-256 is
`5cb7bca74e8ff46442e9799217f218fb7d683eb5a7f48742919505b29033263b` — exactly
matching the local release artifact and the published `SHA256SUMS.txt`.

---

## 7. Auto-Update Confirmation

- Packaged `resources/app-update.yml`: `provider: github`, `owner: sliveamer20`,
  `repo: malahy`, `updaterCacheDirName: malahy-updater`.
- `main.js` still initializes electron-updater with `autoDownload = true`; no
  update configuration was changed in this release.
- The exact public URL electron-updater reads,
  `https://github.com/sliveamer20/malahy/releases/latest/download/latest.yml`,
  returns:
  - `version: 2.6.1`
  - `path: malahy-setup-2.6.1.exe`
  - `size: 105916837`
  - `sha512: 3ImctkvlR8gUd/ZchsJRJh+p+hiSxH/jljtrRapWIMxDjmvPkFox1fXENtHh9+DhS0lEBC2drPlshCnUnXxU9A==`
- `releases/latest` redirects to `.../releases/tag/v2.6.1`.
- Existing `2.6.0` installations can therefore discover and download `2.6.1`.

---

## 8. Tests Not Performed / Limitations

1. **Physical Xprinter reconnection — NOT performed.** The printer is physically
   disconnected. Reconnect behavior was covered by toggling Windows' own offline
   state on the only ready printer plus the packaged offline/restart checks, but
   not on the physical Xprinter. Run a final real reconnect check when it is
   plugged back in.
2. **Live paused / paper-jam / door-open** states were not induced (require admin);
   covered by deterministic readiness fixtures only.
3. **Xerox network printer** is unreachable, so only the network-unreachable
   denial was exercised, not a successful network print.
4. Readiness adds ~1.3–2.7 s before submission on this machine (documented in the
   printer report).
5. The pre-existing `payroll-ui` 7g2 date-sensitive failure remains (see §3).

---

## 9. Release Safety

- Only release-related files were committed: the two fixes, their new tests and
  implementation reports, the version bump, the release-guard pins, the baseline
  re-anchor for the packaging change, and the D9 allow-list.
- `dist/` and `releases/` are git-ignored; no build artifact was committed.
- No force-push, no history rewrite, no tag move; `v2.6.0` untouched.
- The release was marked published only after the public page, all four assets,
  and an anonymous full installer download + SHA-256 check succeeded.

**Final status: PASS — v2.6.1 published and publicly verified.**
