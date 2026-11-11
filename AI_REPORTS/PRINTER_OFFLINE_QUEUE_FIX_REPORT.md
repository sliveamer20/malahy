# Printer Offline / Not-Ready Queue Fix

**Date:** 2026-11-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Version:** 2.6.0 (**unchanged** — no bump, no installer build for release, no commit, no tag, no push, no publish)
**Scope:** Stop submitting print jobs to Windows when the printer is offline or not ready, without touching ticket transactions or financial behavior.

**Outcome:** Fixed and verified on the **packaged** Windows app. When the printer is offline/not ready, Malahy now:
records the ticket exactly as before, shows the required Arabic message, and **submits nothing to the Windows Print Spooler** (verified: zero new spooler jobs). On "reconnect" the spooler has nothing of Malahy's to replay, so old failed tickets cannot print. New tickets print only after a fresh Windows-native readiness check passes.

---

## 1. Root cause

### 1.1 What actually happens on print

| Step | Location | Behavior |
|---|---|---|
| 1 | `index.html` `addTicket()` / `addBatch()` | Records the sale, persists state, shows the success toast, then calls `printTicket(...)` |
| 2 | `index.html` `printTicket()` | Builds ticket HTML, calls `window.malahyPrint.printTicket({ html, printerName, paper, silent: true, jobId })` |
| 3 | `preload.js` | `ipcRenderer.invoke("print-ticket", opts)` |
| 4 | `main.js` `ipcMain.handle("print-ticket")` | Creates a hidden `BrowserWindow`, loads the HTML, calls `win.webContents.print(printOpts, cb)` |
| 5 | Chromium / Windows | Hands the job to the **Windows Print Spooler** |

### 1.2 Why offline printing was dangerous

`webContents.print()`'s callback success means **"the job was accepted by the spooler"**, not **"paper came out"**.

When the target printer is disconnected/paused, Windows keeps the job in the spooler queue and replays it when the printer returns. There was **no Malahy-level queue or retry**: the "queue" was Windows' own spooler plus Chromium's submission. The old preflight only checked that the printer *name* existed in `getPrintersAsync()`; that list still contains a disconnected USB printer.

### 1.3 Proof of the failure mode (pre-fix, controlled probe)

A controlled synthetic job was sent from Electron to the physically disconnected `Xprinter XP-80`:

- Windows spooler `JobCount` became `1`
- The spooler `DocumentName` came from the document `<title>`
- The job was cancelled immediately by its specific ID and `JobCount` returned to `0`

This proved the spooler retains a Malahy job for an offline printer, and that it would print on reconnect.

### 1.4 Why `Get-Printer` was not enough

For the disconnected thermal printer, Windows reports contradictory data:

| Source | Result |
|---|---|
| `Get-Printer` / `PrinterStatus` | `Normal` (misleading) |
| WMI `Win32_Printer.WorkOffline` | `True` |
| USB PnP presence for `USB001` device | `Present=False` (`CM_PROB_PHANTOM`) |

So readiness must be derived from Windows-native device state, not from the printer name or `getPrintersAsync()`.

---

## 2. The fix

### 2.1 New module: `printer-readiness.js`

A preflight module that asks Windows itself whether the printer can actually print **before** any job exists. It never writes files, never stores a job, never retries.

Probe sources (all Windows-native, PowerShell/CIM, no shell string interpolation — the target name is passed through an environment variable):

- `Win32_Printer` for the selected/default printer: `WorkOffline`, `PrinterStatus`, `ExtendedPrinterStatus`, `DetectedErrorState`, `PrinterState`, `Status`, `PortName`
- Spooler service state (`Get-Service Spooler`)
- For USB ports (`USB001`…): `USB Monitor\Ports\<port>` registry mapping to a PnP `DeviceID`, then `Win32_PnPEntity` presence + `Status` + `ConfigManagerErrorCode`
- For TCP/IP ports: `Win32_TCPIPPrinterPort` + a real TCP connect attempt (preferred port, then 9100/515/631, 1.4 s timeout each)
- Virtual/default ports (`nul:`, `PORT_PROMPT:`, `FILE:` or empty): spooler state is authoritative

### 2.2 Decision table (fail-safe)

Any state that cannot be *proven* ready is denied. No submission happens on denial.

| Condition | Result `reason` | Result `detail` |
|---|---|---|
| Probe crashed / timeout / invalid JSON | `printer-not-ready` | `probe-failed` |
| Spooler not `Running` | `printer-not-ready` | `spooler-<state>` |
| Selected printer not installed | `printer-not-found` | `not-found` |
| No selection and no default/installed printer | `no-printer-selected` | `not-found` |
| `WorkOffline = true` | `printer-not-ready` | `offline` |
| `PrinterStatus` offline / paused / error | `printer-not-ready` | `offline` / `paused` / `error` |
| `ExtendedPrinterStatus` offline/paused/error/jam/paper-out/door-open/… | `printer-not-ready` | mapped detail |
| `DetectedErrorState` jam/paper-out/no-toner/door-open/offline/… | `printer-not-ready` | mapped detail |
| Blocking `PrinterState` flags | `printer-not-ready` | mapped detail |
| Status text `error/degraded/no contact/lost comm/…` | `printer-not-ready` | `status-…` |
| USB port with no device mapping | `printer-not-ready` | `usb-unverified` |
| USB device absent | `printer-not-ready` | `usb-device-absent` |
| USB device error / not `OK` | `printer-not-ready` | `usb-device-error` / `usb-device-not-ready` |
| Network printer with unreachable host/port | `printer-not-ready` | `network-unreachable` |
| Unknown port type (WSD/IPP/COM/LPT/share) | `printer-not-ready` | `port-unverified` |
| Virtual port + spooler running | `ok: true` | — |
| USB device present, `Status=OK`, `ConfigManagerErrorCode=0` | `ok: true` | — |
| Reachable TCP printer | `ok: true` | — |
| Probe ready | `ok: true` with verified `printer` name | — |

Warning-only conditions (low toner/paper) are not treated as blocking; only states where printing cannot happen are denied.

**Latency observed:** ~1.3–1.7 s for the offline USB printer, ~2.6–2.7 s for the unreachable network printer (PowerShell startup dominates).

### 2.3 Print flow after the fix (`main.js`)

1. Reject malformed requests (`no object`, `no html`) **before** creating a window → `{ ok:false, reason:"invalid-print-request" }`. This also stops any possibility of submitting a blank page.
2. Start the readiness probe **in parallel** with loading the hidden print window (latency hiding).
3. Load the stamped document into the hidden window.
4. **Await the readiness result before `webContents.print`.** If not ready: destroy the window, log the precise Windows detail, return `{ ok:false, reason, detail, available }` — **no spooler submission**.
5. If ready: pin the *verified* printer as `deviceName` (including when the user chose "default printer", so the printer cannot change between probe and submission), then submit exactly once.
6. Return `{ ok:true, accepted:true }` on acceptance. A late submission failure is surfaced, never retried.

### 2.4 Duplicate protection (no new queue)

- Each ticket passes its transaction ID (`txId`) as `jobId`.
- `main.js` keeps an **in-memory** 15-second seen-set: a repeated `jobId` returns `{ ok:true, duplicate:true }` without probing or submitting.
- Nothing is persisted; the set evaporates on restart. This is a duplicate guard, not a queue.
- Gift tickets use `gift:<id>`; gift reprints use `gift-reprint:<id>:<timestamp>` so an intentional reprint is still allowed.

### 2.5 Spooler document marking

Every print document gets a `<title>Malahy print <ISO timestamp></title>` (replacing/inserting a title only — layout, CSS, and printed content are untouched; `<title>` is not printed in silent mode). This makes any future Malahy job identifiable in the spooler for controlled manual cleanup. Safety now does not depend on this marker.

### 2.6 User-facing behavior

- Ticket print failure (offline/not ready): exact required message  
  `تعذر الطباعة، الطابعة غير متصلة أو غير جاهزة. تم تسجيل عملية قطع التذكرة.`
  as a **warning**, exactly once.
- Non-ticket prints keep the shorter message without claiming a ticket was recorded.
- No automatic delayed retry, no “print later” queue, no reconnect listener.

### 2.7 Pre-existing broken call fixed

`empPrintMigrationAudit()` contained a legacy call `malahyPrint.printTicket(html, {...})` — the old non-Electron signature. `malahyPrint.printTicket` expects a single options object, so this could submit a **blank** print job. It now uses the correct options object (`html`, `printerName`, `paper`, `silent`) and reports via `printResultToast`.

---

## 3. Transaction and financial safety

- The sale is committed **before** printing (`appendTxLog`, counters, price snapshots, `persist()`), and `printTicket` is not awaited by `addTicket`/`addBatch`.
- No rollback, void, reversal, re-count, re-price, or duplicate-sale path was added around printing.
- Print failure writes **nothing** to the database.
- Payroll, attendance, expenses, accounting, returns, voids, gifts, and security/permission gates were not modified.
- Diff in `index.html` is confined to: `addTicket`, `addBatch`, `printResultToast`, `printTicket`, gift print/reprint, and the migration-audit print call.

---

## 4. Files changed

| File | Change |
|---|---|
| `printer-readiness.js` | **New.** Windows-native readiness probe + decision logic; fail-safe; no writes/queue/retry |
| `main.js` | Preflight before submission, no submit on refusal, `deviceName` pinning, invalid-request rejection, 15 s in-memory `jobId` dedupe, document title stamping |
| `index.html` | Exact Arabic ticket failure message, `txId` → `jobId` wiring for tickets/batches, gift job IDs, migration-audit print call fixed |
| `electron-builder.yml` | `printer-readiness.js` added to packaged `files` |
| `tests/protected-baseline.json` | Deliberate hash re-anchor for the `electron-builder.yml` change (same approved pattern as v2.5.4 / v2.6.0) |
| `tests/printer-offline-queue.test.js` | **New.** 50 focused assertions |
| `tests/phase1-printer-feedback.test.js` | Deterministic readiness stub; default-printer pinning expectation; discovery-failure scenario |
| `tests/v256-attendance-scroll.test.js` | D9 scope-guard allow-list entries for the files above + this report |

Version in `package.json` remains **2.6.0**. `dist/` release artifacts were **not** overwritten.

---

## 5. Verification

### 5.1 Focused suites

| Suite | Result |
|---|---|
| `tests/printer-offline-queue.test.js` (new) | **50 / 50 PASS** |
| `tests/phase1-printer-feedback.test.js` | **40 / 40 PASS** |

The new suite loads the **real** `main.js` handler and the **real** `printer-readiness.js` (Electron + `child_process` stubbed, readiness fixtures deterministic) and extracts the **real** `printResultToast` from `index.html`. Highlights:

- offline/paused/error/unverifiable → **never reaches `webContents.print`**, hidden window destroyed
- ready → **exactly one** submission, verified printer pinned as `deviceName`
- repeated `jobId` → one submission; different `jobId` → separate job
- invalid request → rejected before any print
- printer disappears between preflight and submission → one attempt, no retry, no delayed retry
- ticket failure → exact required Arabic message, one warning toast
- sale recorded before printing; print failure never writes the database, never rolls back
- readiness module never writes files; no retry timer/reconnect listener/pending offline storage

### 5.2 Full regression suite

Every `tests/*.test.js` was executed (`node <file>`), 30 files:

| Result | Count |
|---|---|
| Passing assertions | **2596** |
| Failing assertions | **1** |
| Failing files | **1** (`tests/payroll-ui.test.js`) |

The single failure is **pre-existing and unrelated**:

```
FAIL 7g2 batch reference is pinned to the fixed batch day
     got="PAY-20261111-01" want="PAY-20261013-01"
```

`payCommit()` uses `Date.now()` for the batch reference; the test drives it with no date override and expects the fixed day 2026-10-13, so it fails on any other real calendar day (today is 2026-11-11). The same area was already noted as a known pre-existing payroll 7g/7g2 issue in the repository history. `index.html` payroll code was not touched by this change.

All other suites, including `payroll-report.test.js` (333), `v256-attendance-scroll.test.js` (218), `v259-electronic-cash.test.js` (194), `payroll.test.js` (222), and `v256-payroll-exports.test.js` (146), pass.

### 5.3 Packaged Windows app validation (not mocks)

**Build (validation only, temp output):**

```
npx electron-builder --win --dir --config.directories.output=C:\Users\slive\AppData\Local\Temp\opencode\malahy-validate
```

- electron-builder 26.15.3, Electron 43.7.5, app version 2.6.0
- Output: `...\malahy-validate\win-unpacked\` (no release build, `dist/` untouched)
- `app.asar` contains `printer-readiness.js`
- **Packaging integrity:** SHA-256 of `printer-readiness.js` extracted from `app.asar` equals the source file: `865CEEF0E28F128DA4B7417D76417029CD1DBC714B0B46A5A72B39BE80E6D9A3`

**App launch:** packaged `كوكي بارك.exe` with isolated profile `--user-data-dir=<temp>` and `--remote-debugging-port=9333`. Calls were made on the **main app page** through the real preload bridge (`window.malahyPrint.printTicket(...)`), i.e. the exact production IPC path.

**Real Windows probe executed from the packaged copy (no printing):**

| Target | Verdict |
|---|---|
| `Xprinter XP-80` (physical, disconnected) | `ok:false` — `printer-not-ready` / `offline` (port `USB001`) |
| `Xerox VersaLink B400 (b6:a1:cb) PS` (network, unreachable) | `ok:false` — `printer-not-ready` / `network-unreachable` |
| `OneNote (Desktop)` (virtual, `nul:`) | `ok:true` |
| `(default)` = Xerox | `ok:false` — `printer-not-ready` / `network-unreachable` |

#### Case B — printer offline (the fix's core claim)

Before the call: `Get-PrintJob -PrinterName "Xprinter XP-80"` → no jobs, `WorkOffline=True`.

Call through the packaged app → result:

```json
{
  "ok": false,
  "reason": "printer-not-ready",
  "detail": "offline",
  "available": []
}
```

After the call: **no job** for `Xprinter XP-80`; all printers still `Jobs=0`.

Additional packaged-app checks:

| Scenario | IPC result | Spooler effect |
|---|---|---|
| Offline Xprinter, second attempt (new jobId) | `ok:false` / `printer-not-ready` / `offline` | none |
| Two calls, same `jobId`, back-to-back | first `ok:false`/`offline`; second `{ok:true, duplicate:true}` | none |
| Default printer (unreachable Xerox) | `ok:false` / `printer-not-ready` / `network-unreachable` | none |
| `printTicket({})` and `printTicket({printerName:"Xprinter XP-80"})` | `ok:false` / `invalid-print-request` | none |

App log (`%APPDATA%`-equivalent isolated profile, `malahy-errors.log`):

```
[2026-11-11T19:20:58.737Z] print-ticket: الطابعة غير جاهزة [offline] printer=Xprinter XP-80
[2026-11-11T19:21:41.019Z] print-ticket: الطابعة غير جاهزة [offline] printer=Xprinter XP-80
[2026-11-11T19:21:52.038Z] print-ticket: الطابعة غير جاهزة [offline] printer=Xprinter XP-80
[2026-11-11T19:21:52.040Z] print-ticket: منع إرسال مكرر لنفس المهمة: pkg-dedupe-1794424910590
[2026-11-11T19:22:03.626Z] print-ticket: الطابعة غير جاهزة [network-unreachable] printer=(default)
[2026-11-11T19:22:15.380Z] print-ticket: طلب طباعة غير صالح
[2026-11-11T19:22:15.480Z] print-ticket: طلب طباعة غير صالح
```

#### Case A — printer ready

`OneNote (Desktop)` was the only ready target (virtual, `nul:`). Packaged-app call:

```json
{ "ok": true, "reason": "", "accepted": true }
```

The job completed and **no job was left in the queue**. This proves the fix did not break the normal submit path in the packaged app.

#### Case C — "reconnect" must not print old tickets

The physical thermal printer cannot be reconnected remotely, so the same code path was tested on the ready virtual printer by toggling Windows' own `WorkOffline` flag (reversible, non-admin):

1. Set `OneNote (Desktop)` to `WorkOffline=True` (simulated disconnection).
2. Packaged app ticket call → `ok:false` / `printer-not-ready` / `offline`. Spooler queue: **0**.
3. Set `WorkOffline=False` (simulated reconnection).
4. Immediately, and after 10 seconds, spooler queue for that printer: **0** — the old ticket did not print; Windows had nothing queued.
5. A **new** ticket after reconnection → `{ok:true, accepted:true}` (fresh readiness check passed).

`WorkOffline` was restored to `False` afterwards.

#### Restart test (no persisted queue)

The packaged app was fully closed (all spooler queues `0`), then relaunched with the **same** isolated profile and left running 15 seconds:

- all printers `Jobs=0`
- no print job appeared
- no printer driver/app was launched

This confirms the failed attempts were not persisted anywhere and cannot replay on next start.

---

## 6. Manual cleanup (if old jobs already exist)

Jobs submitted **before** this fix may still sit in the Windows spooler and can print on reconnect. Malahy cannot safely remove other applications' jobs, so cleanup is deliberate and filtered.

**Inspect first (read-only):**

```powershell
Get-PrintJob -PrinterName "Xprinter XP-80" |
  Select-Object Id, DocumentName, JobStatus, SubmittedTime
```

New Malahy jobs have a document name starting with `Malahy print`. Jobs from before this fix may not have that marker.

**Cancel only Malahy jobs (preferred):**

```powershell
Get-PrintJob -PrinterName "Xprinter XP-80" |
  Where-Object { $_.DocumentName -like "Malahy print*" } |
  Remove-PrintJob
```

**Or cancel one job by its ID after confirming it is a Malahy ticket:**

```powershell
Remove-PrintJob -PrinterName "Xprinter XP-80" -ID 12
```

**Do not:**

- run `Clear-PrintQueue` on a printer (removes other apps' jobs blindly)
- restart the Print Spooler service (affects every application; requires admin)
- delete spool files from `C:\Windows\System32\spool\PRINTERS` manually
- delete any job whose `DocumentName` you cannot confirm is a Malahy ticket

If a job is held while the printer is offline and `Remove-PrintJob` is refused, retry it with an elevated PowerShell; do not clear the whole queue.

---

## 7. Limitations / not yet verified

1. **Physical reconnect on the thermal printer** (`Xprinter XP-80`) is still blocked: the printer is physically disconnected (`WorkOffline=True`, USB PnP `Present=False`). The reconnect behavior was therefore validated by toggling Windows' own offline state on the only ready printer, plus the restart/no-queue test. When the thermal printer is reconnected, run one final real Case A/C check.
2. **Paused / paper-jam / door-open states at the spooler level** cannot be induced without admin rights; they are covered by deterministic readiness fixtures, not a live printer.
3. **The Xerox network printer is currently unreachable** (`XC-B6A1CB` does not resolve/listen), so it could only validate the `network-unreachable` denial, not a successful network print.
4. **Readiness depends on Windows reporting.** A driver that reports a physically absent device as ready would defeat any software preflight; the current thermal printer is correctly reported offline by WMI/PnP (`Get-Printer` alone is not trusted).
5. **Validation side effect:** two small test pages were sent to `OneNote (Desktop)` to prove the ready path (Case A and the post-reconnect new ticket). OneNote was launched by the driver during the test; the process was closed afterward. Delete the marker-titled pages (`MALAHY PACKAGED VALIDATION …`) from OneNote's unfiled notes if they were saved.
6. Readiness adds ~1.3–2.7 s before submission on this machine. It runs in parallel with print-window loading, but it is still a user-visible delay on some prints.

---

## 8. Rollback

Revert these together (main depends on the new module):

- restore `main.js`, `index.html`, `electron-builder.yml`, `tests/phase1-printer-feedback.test.js`, `tests/protected-baseline.json`, `tests/v256-attendance-scroll.test.js`
- delete `printer-readiness.js` and `tests/printer-offline-queue.test.js`

Rolling back restores the previous behavior: print failures would again be submitted to the spooler and could replay on reconnect. Nothing else (data, transactions, financial logic) is affected.

---

## 9. Requirement checklist

| Requirement | Status |
|---|---|
| Record transaction first; print failure never cancels/reverses/duplicates the sale | ✅ (verified by tests; no rollback path added) |
| Ready printer → exactly one job | ✅ (unit/integration + packaged ready print) |
| Offline/not-ready → record, exact Arabic message, **no Windows submission**, no pending job, no retry | ✅ (packaged app: zero spooler jobs; log evidence) |
| Reconnect → never print old failed tickets; only new tickets after verification | ✅ (simulated reconnect: queue 0 before/after; new ticket accepted; restart shows no jobs) |
| Preflight via Windows-native status; fail safe if unverifiable | ✅ (`Win32_Printer` + USB PnP + TCP; deny on unknown port/probe failure) |
| No delayed retries / offline queues / persisted print commands / duplicate submissions | ✅ (15 s in-memory dedupe only; tests G1–G3, D3) |
| No indiscriminate queue clearing, no spooler restart | ✅ (no such code; manual filtered cleanup documented) |
| Preserve layout, prices, counts, returns, voids, payroll, attendance, expenses, accounting, security | ✅ (print-only diff; full regression run) |
| Test the packaged Windows app, not only mocks | ✅ (packaged build + real spooler + real probe) |
| No installer publish, tag, push, history rewrite | ✅ (none performed) |
