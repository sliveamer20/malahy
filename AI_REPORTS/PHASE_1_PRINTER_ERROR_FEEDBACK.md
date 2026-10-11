# Phase 1 — Fix Missing or Unavailable Printer Feedback

**Date:** 2026-10-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Version:** v2.5.3 (**unchanged** — no bump, no build, no commit, no tag, no publish)
**Scope:** Diagnosis + minimal fix + focused verification.

**Outcome: ✅ Fixed. 2 files changed (+14 / −2). Regression suite 756 PASS / 7 FAIL — the 7 are pre-existing and unrelated. New focused suite: 40 PASS / 0 FAIL.**

---

## 1. Root cause

### 1.1 The complete path from clicking a ticket to the print call

| Step | File | Function | What happens |
|---|---|---|---|
| 1 | `index.html:2701` | `addTicket(id, method)` | Records the sale, persists, shows the success toast, then calls `printTicket(id, 1, method)` (line 2736) |
| 2 | `index.html:4162` | `printTicket(id, qty, method)` | Permission gate, `settings()`, builds the ticket HTML |
| 3 | `index.html:4174` | — | `window.malahyPrint.printTicket({ html, printerName: st.printerName \|\| '', paper, silent: true })` |
| 4 | `preload.js:40` | — | `ipcRenderer.invoke("print-ticket", opts)` |
| 5 | `main.js:346` | `ipcMain.handle("print-ticket")` | Availability check → creates a hidden `BrowserWindow` → `win.webContents.print(printOpts, cb)` |
| 6 | `index.html:4148` | `printResultToast(res)` | Maps the returned `reason` to an Arabic toast |

### 1.2 The actual defect

`main.js` (pre-fix) only guarded **one** of the two printer failure modes:

```js
const printerName = typeof opts.printerName === "string" ? opts.printerName : "";
if (printerName) {                                   // <-- SKIPPED when nothing is selected
  const installed = await installedPrinterNames();
  if (installed && installed.indexOf(printerName) === -1) {
    return { ok: false, reason: "printer-not-found", available: installed };
  }
}
```

When **no printer is selected** (`printerName === ""`):

1. The whole check is skipped — `installedPrinterNames()` was never even called.
2. `if (printerName) printOpts.deviceName = printerName;` never runs, so **no `deviceName` is sent**.
3. Electron therefore falls back to the Windows default printer. If **no printer is installed at all**
   (very common on a fresh POS machine, or after a printer/driver is removed), the print call
   produces an opaque Chromium error string.

`printResultToast` only knew `printer-not-found`, so this fell into the generic `else`:

> "تعذّرت الطباعة — تأكد من توصيل الطابعة واختيارها من «الإعدادات»"

which does **not** tell the user that no printer was ever selected or connected.

### 1.3 Proof of the defect (mutation test, below)

With the fix reverted, the handler returns **`{ ok: true, reason: "" }`** for a machine with zero
printers and no selection — i.e. it reports success while nothing can possibly print, and falls
through to a misleading generic message.

### 1.4 The three cases are genuinely different — confirmed against the code

| # | Case | Detectable? | How the code treats it |
|---|---|---|---|
| 1 | **No printer selected, none installed** | Yes, via `getPrintersAsync()` returning `[]` | **Was undetected** → opaque failure. **Now:** `no-printer-selected` |
| 2 | **Selected printer missing from list** (unplugged / driver removed) | Yes | Already detected → `printer-not-found` (message already correct) |
| 3 | **Discovery itself failed** (`getPrintersAsync` throws) | Yes | `installedPrinterNames()` returns `null` → check skipped → falls back to attempting the print. **Preserved unchanged.** |
| 4 | **Printer present, print call fails** (out of paper, jam, spooler error) | Only at print time | `{ ok:false, reason: <real reason> }` → generic message. **Preserved unchanged.** |

Important nuance discovered during tracing: `printerName === ""` is **not** a bug state — the settings
dropdown's first option is literally *"الطابعة الافتراضية للويندوز"* (Windows default). So the fix
only reports `no-printer-selected` when nothing is selected **and** no printer exists at all. If any
printer is installed, existing behaviour (print to the Windows default) is untouched.

---

## 2. Exact files changed

### 2.1 `main.js` — +10 / −1 (`print-ticket` handler only)

```diff
     const printerName = typeof opts.printerName === "string" ? opts.printerName : "";
+    const installed = await installedPrinterNames();
     if (printerName) {
-      const installed = await installedPrinterNames();
       if (installed && installed.indexOf(printerName) === -1) {
         appendLog("print-ticket: الطابعة المختارة غير مثبّتة: " + printerName);
         return { ok: false, reason: "printer-not-found", available: installed };
       }
+    } else if (installed && installed.length === 0) {
+      appendLog("print-ticket: no printer selected and no printers installed");
+      return { ok: false, reason: "no-printer-selected", available: [] };
     }
```

Why: `installedPrinterNames()` is hoisted out of the `if (printerName)` block so the list is known
in both branches, and the previously-impossible "nothing selected **and** nothing installed" state
gets its own precise reason instead of a vague one. The existing `printer-not-found` branch, the
`installed === null` fallback, and every print option are untouched.

### 2.2 `index.html` — +4 / −1 (`printResultToast` only)

```diff
   const reason=(res && (res.reason||res.error))||'';
-  if(reason==='printer-not-found'){
+  if(reason==='no-printer-selected'){
+    toast('تعذّرت الطباعة: لم يتم تحديد طابعة. يُرجى اختيار طابعة أولاً من «الإعدادات».','warn');
+  }else if(reason==='printer-not-found'){
     toast('الطابعة المختارة غير متوفرة الآن — افتح «الإعدادات» واختر طابعة متصلة','warn');
   }else{
```

Why: adds the exact requested Arabic message as a **first branch**, leaving the existing
`printer-not-found` message and the generic fallback message byte-identical. Uses the same
`toast(...,'warn')` convention and the same «الإعدادات» pointer as every neighbouring message.

### 2.3 `tests/phase1-printer-feedback.test.js` — new (focused suite)

### 2.4 Files deliberately NOT touched

`database.js`, `activation.js`, `update-gate.js`, `users.js`, `permissions.js`, `perm-gate.js`,
`accounts.js`, `login.js`, `recovery.js`, `launch.js`, `preload.js`, `package.json`,
`electron-builder.yml`, `README.md`, `assets/**`, `windows/**`, `dist/**`, `releases/**`.

---

## 3. Before / after behaviour

| Scenario | Before | After |
|---|---|---|
| No printer selected, none installed | Falls through to a print attempt; if the call "fails" the user sees the **generic** "تعذّرت الطباعة — تأكد من توصيل الطابعة…" message; there is a real risk the handler returns `ok:true` if Chromium resolves the default slot without a device | **"تعذّرت الطباعة: لم يتم تحديد طابعة. يُرجى اختيار طابعة أولاً من «الإعدادات»."** — returned before any print attempt |
| Selected printer unplugged / driver removed | `printer-not-found` → "الطابعة المختارة غير متوفرة الآن — افتح «الإعدادات» واختر طابعة متصلة" | **unchanged** |
| No printer selected, but printers exist (user chose "Windows default") | Prints to the default | **unchanged** — still prints to the default |
| Discovery fails (`getPrintersAsync` throws) | Skips the check, attempts the print | **unchanged** |
| Printer present, print fails (out of paper etc.) | Generic message + real reason logged | **unchanged** — never claims "no printer selected" |
| Print succeeds | Success toast | **unchanged** |
| Sale / sales records | Recorded before printing | **unchanged** — the print path never writes to the database |

---

## 4. Tests run and actual results

### 4.1 New focused suite — `tests/phase1-printer-feedback.test.js`

**40 passed, 0 failed.**

It loads the **real `main.js`** with a stubbed `electron` module (via `Module._load`
interception) and invokes the **actual registered `print-ticket` handler**, and extracts the
**real `printResultToast` body out of `index.html`** by brace-matching and executes it. Nothing
under test is re-implemented.

| Scenario | Assertions | Result |
|---|---|---|
| App boots; main window created before assertions | 1 | ✅ |
| **1. No printer selected + none installed** | 4 — `ok:false`, `reason==='no-printer-selected'`, empty `available`, `webContents.print` never reached | ✅ 4/4 |
| **2. Selected printer missing from list** | 4 — `printer-not-found`, real available list returned, no print attempted | ✅ 4/4 |
| **3. Printer available, print succeeds** | 3 — `ok:true`, `deviceName` forwarded, no failure reason | ✅ 3/3 |
| **4. Printer present, print call fails** | 4 — real reason preserved, **not** misreported as `no-printer-selected`, print was attempted | ✅ 4/4 |
| **5. Nothing selected but printers exist** | 3 — still prints to Windows default, no `deviceName` forced, no false claim | ✅ 3/3 |
| **6. Discovery itself fails** | 2 — falls back, no false rejection | ✅ 2/2 |
| **7. Arabic message mapping** | 9 — exact string match for `no-printer-selected`, `printer-not-found` unchanged, generic unchanged and does **not** contain "لم يتم تحديد طابعة", exactly **one** toast per failure, success path returns `true` | ✅ 9/9 |
| **8. Failure never swallowed** | 3 — reason surfaced, written to the error log, user notified | ✅ 3/3 |
| **9. Paper/print options untouched** | 3 — A4 still `pageSize:'A4'` + default margins; thermal still `usePrinterDefaultPageSize` + `marginType:'none'` and **no** `pageSize`; `printBackground` preserved | ✅ 3/3 |
| **10. Print never touches the database** | 1 — DB file byte-identical across two failure paths | ✅ 1/1 |
| **11. `get-printers` discovery API unchanged** | 1 — still returns mapped objects incl. `isDefault` | ✅ 1/1 |
| **12. Production data never opened** | 2 — sandbox is a temp dir, production DB still present | ✅ 2/2 |

**Isolation:** `app.getPath("userData")` is redirected to a fresh `mkdtemp` directory; the sandbox is
deleted afterwards. Production `%APPDATA%\malahy` was never read or written.

### 4.2 Mutation check — does the test actually catch the bug?

The fix was programmatically reverted in `main.js` and the suite re-run, then `main.js` was restored
byte-for-byte:

```
reverted main.js to the pre-fix logic
  FAIL  1a returns ok:false
  FAIL  1b reason is 'no-printer-selected' :: {"ok":true,"reason":""}
  FAIL  1c available list is empty
  FAIL  1d never reached webContents.print
  summary: 36 passed, 4 failed
MUTATION DETECTED: the test does catch the bug.
main.js restored to the fixed version.
```

This also **confirms the root cause**: pre-fix, a machine with zero printers and no selection
returned `{ok:true}`.

### 4.3 Full regression suite

| Test file | PASS | FAIL |
|---|---|---|
| **phase1-printer-feedback.test.js** (new) | 40 | 0 |
| phase3b-auth.test.js | 60 | 1 ⚠️ |
| phase3b-ipc.test.js | 15 | 0 |
| phase3c1-dom.test.js | 37 | 0 |
| phase3c1-gate.test.js | 45 | 3 ⚠️ |
| phase3c1-ipc.test.js | 19 | 0 |
| phase3c1-session.test.js | 30 | 0 |
| phase3c2-baseline.test.js | 60 | 3 ⚠️ |
| phase3c2-gate.test.js | 44 | 0 |
| phase3c2-ipc.test.js | 49 | 0 |
| phase3c2-perms.test.js | 39 | 0 |
| phase3c3-accounts.test.js | 92 | 0 |
| phase3c3-ui.test.js | 76 | 0 |
| phase3c4-recovery.test.js | 79 | 0 |
| phase4-daily-report.test.js | 71 | 0 |
| **TOTAL** | **756** | **7** |

- **Before this phase:** 716 PASS / 7 FAIL
- **After this phase:** 756 PASS / 7 FAIL  → **+40 PASS, +0 FAIL**

Per-file PASS/FAIL counts are byte-for-byte identical to the pre-change run for all 14 pre-existing
files. **Zero regressions.**

### 4.4 The 7 failures are pre-existing and unrelated

Captured **before** any edit was made:

```
FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html, README.md, electron-builder.yml
FAIL  protected file unchanged: README.md
FAIL  protected file unchanged: electron-builder.yml
FAIL  all protected baseline files intact (except the intended index.html)   (×2)
```

Cause: the hashes in `tests/protected-baseline.json` were anchored *before* the previous,
user-approved uninstall-cleanup phase, which changed `README.md` (path correction + data-loss
warning) and `electron-builder.yml` (`deleteAppDataOnUninstall: true`).

**These are baseline-staleness, not defects.** Re-anchoring `protected-baseline.json` was
deliberately **not** done here: it is unrelated to the printer fix, and re-anchoring would also
silence future guards on the very files this change touches. It should be done as its own
deliberate step.

---

## 5. Protected systems — confirmed unchanged

SHA-256 compared against `tests/protected-baseline.json`:

| File | State |
|---|---|
| `database.js` | ✅ unchanged |
| `activation.js` | ✅ unchanged |
| `update-gate.js` | ✅ unchanged |
| `package.json` | ✅ unchanged (version still `2.5.3`) |
| `launch.js` | ✅ unchanged |
| `assets/ticket/ticket-template.js` | ✅ unchanged |
| `assets/ticket/ticket-template.svg` | ✅ unchanged |
| `assets/vendor/qrcode.js` | ✅ unchanged |
| `windows/splash.html` | ✅ unchanged |
| `windows/update.html` | ✅ unchanged |
| `electron-builder.yml` | changed — **previous** approved phase only, untouched here |
| `README.md` | changed — **previous** approved phase only, untouched here |

Explicitly confirmed unaffected:

- Ticket prices, sales calculations, payment recording — `addTicket` untouched; test 10a proves the
  database is byte-identical across print failures.
- Ticket layout, dimensions, QR codes, numbering — `ticketHTML` / `ticketTemplateSvg` /
  `ticketQrSvg` untouched; template assets hash-verified.
- Printer discovery architecture — `installedPrinterNames()`, `get-printers`, and the settings UI
  (`#pset-printer`) untouched; **reused** rather than rewritten (test 11a).
- Printer selection UI and paper-size handling — `paperKind()` untouched; test 9a–9c confirm A4 and
  thermal print options are byte-identical.
- A4 / 58 mm / 80 mm behaviour — verified in tests 9a–9c.
- Returns, gifts, expenses, daily reports, payroll, employees — untouched files.
- Database schema, persistence, authentication, permissions, activation, auto-update — untouched
  files.
- `electron-builder.yml`, README, version numbers, release files, GitHub publishing — not modified
  in this phase; no installer built; no commit, tag or push.

`git diff --stat` for this phase: **`index.html` +4/−1, `main.js` +10/−1** (plus the new test file).

---

## 6. NOT TESTED

| Scenario | Why |
|---|---|
| **3. Physical printer disconnect / reconnect while running** | Requires unplugging a real printer mid-print. Covered *logically* by tests 2 and 4 (a selected printer absent from the reported list is the exact same observable state Windows reports for an unplugged printer), but not exercised against real hardware. |
| **Real Electron `webContents.print()` with an actual printer** | The suite stubs the Electron surface. Wiring verified (correct channel, correct bridge, correct options shape), but not against a physical printing device. |
| **Real toast rendering / visual appearance** | DOM/CSS rendering not exercised. Messages follow the existing `toast(msg,'warn')` convention. |

---

## 7. Unresolved risks

1. **A network printer that drops offline but stays listed by Windows** would still fall through to
   the generic message rather than `printer-not-found`. This is correct behaviour — Windows still
   reports it as installed, and the real failure reason is preserved and logged. Not a defect, but
   the message is less specific than it could be.
2. **The 7 pre-existing baseline failures remain.** `tests/protected-baseline.json` is stale
   relative to the previous approved phase. Until it is re-anchored, the protected-file guard cannot
   detect new drift in `README.md` / `electron-builder.yml`.
3. **Other print entry points were intentionally left alone.** `printReviewLog`,
   `printDayReportObj`, `reprintGift` and `printGiftTicket` keep their existing generic Arabic
   messages rather than routing through `printResultToast`. They are not misleading (they say
   "تأكد من توصيل الطابعة واختيارها"), and changing their wording would be scope creep — but they
   will not show the new specific "no printer selected" message.
4. **The fix is not in a shipped build.** `package.json` is still `2.5.3` and the installed app is
   the released v2.5.3, which does **not** contain this fix.

---

## 8. Stopping point

Fix and report complete. **No version change, no installer build, no commit, no tag, no push, no
publish.** The installed application was not run or uninstalled, and production user data was not
touched (verified: 72 files / 9,264,937 bytes, identical to the end of the previous phase).

Awaiting review before the next phase.
