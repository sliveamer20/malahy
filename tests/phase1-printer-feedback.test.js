// tests/phase1-printer-feedback.test.js
// Phase 1 — Printer error feedback.
//
// These tests load the REAL main.js (with a stubbed `electron`) and invoke the
// actual registered `print-ticket` handler, and extract the REAL
// `printResultToast` body out of index.html and execute it. Nothing here is a
// re-implementation of the logic under test.
//
// Everything runs against a throwaway temp userData directory — production
// user data is never opened.

const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

const root = path.join(__dirname, "..");

/* ---------- sandbox userData: production data is never touched ---------- */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "malahy-printer-test-"));

/* ---------- controllable printer environment ---------- */
const env = {
  printers: [],            // what Windows reports
  listThrows: false,       // discovery failure → installed === null
  printResult: null,       // { success, failureReason } handed to the callback
  printed: [],             // every webContents.print(opts, cb) invocation
  logs: [],                // appendLog lines
};

/* ---------- electron stub ---------- */
const ipcMain = {
  handle: (ch, fn) => { ipcMain._h[ch] = fn; },
  on: (ch, fn) => { ipcMain._o[ch] = fn; },
  _h: {}, _o: {},
};

class FakeWebContents {
  constructor() {
    this.getPrintersAsync = async () => {
      if (env.listThrows) throw new Error("no spooler");
      return env.printers.map((p) => Object.assign({ displayName: p.name, isDefault: false, status: 0, options: null }, p));
    };
    this.print = (opts, cb) => {
      env.printed.push(opts);
      setImmediate(() => cb(env.printResult.success, env.printResult.failureReason));
    };
    this.send = () => {};
    this.on = () => {};
  }
}
class FakeBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this.webContents = new FakeWebContents();
    this.destroyed = false;
    FakeBrowserWindow._all.push(this);
    FakeBrowserWindow.createdCount++;
  }
  loadFile() { return Promise.resolve(); }
  loadURL() { return Promise.resolve(); }
  destroy() { this.destroyed = true; }
  isDestroyed() { return this.destroyed; }
  on() { return this; }
  once(ev, fn) { if (ev === "ready-to-show") { /* never fire: keeps initUpdater out */ } return this; }
  show() { return this; }
  focus() { return this; }
  isMinimized() { return false; }
  isVisible() { return true; }
  getPrintersAsync() { return this.webContents.getPrintersAsync(); }
}
FakeBrowserWindow._all = [];
FakeBrowserWindow.createdCount = 0;

const appStub = {
  getPath: (n) => (n === "userData" ? SANDBOX : SANDBOX),
  getVersion: () => "2.5.5",
  requestSingleInstanceLock: () => true,
  on: () => {},
  whenReady: () => Promise.resolve(),
  isPackaged: false,
  quit: () => {},
};

const electronStub = {
  app: appStub,
  BrowserWindow: FakeBrowserWindow,
  Menu: { setApplicationMenu: () => {} },
  ipcMain: ipcMain,
  dialog: { showSaveDialog: async () => ({ canceled: true }) },
  shell: { openExternal: async () => {} },
};

/* intercept require('electron') and require('electron-updater') */
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electronStub;
  if (request === "electron-updater") return { autoUpdater: null };
  return origLoad.apply(this, arguments);
};

/* ---------- load the REAL main.js ---------- */
require(path.join(root, "main.js"));

/* ---------- extract the REAL printResultToast from index.html ---------- */
function extractFunction(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found: " + name);
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
const htmlSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const toastCalls = [];
const toast = (msg, kind) => { toastCalls.push({ msg: msg, kind: kind }); };
const logCalls = [];
const logErr = (where, what) => { logCalls.push({ where: where, what: String(what) }); };
/* eslint-disable no-new-func */
const printResultToast = new Function(
  "toast", "logErr",
  extractFunction(htmlSrc, "printResultToast") + "\nreturn printResultToast;"
)(toast, logErr);

const printTicket = ipcMain._h["print-ticket"];
const getPrinters = ipcMain._h["get-printers"];

function reset() {
  env.printers = []; env.listThrows = false; env.printed = []; env.logs = [];
  env.printResult = { success: true, failureReason: "" };
  toastCalls.length = 0; logCalls.length = 0;
  FakeBrowserWindow._all.length = 0;
}
const opts = (o) => Object.assign({ html: "<html>x</html>", paper: "80", silent: true }, o);
function mainWin() { return FakeBrowserWindow._all[FakeBrowserWindow._all.length - 1]; }

(async function () {
  console.log("PHASE 1 — Printer error feedback");
  console.log("sandbox userData: " + SANDBOX + "\n");

  /* Wait until main.js has actually created its windows, otherwise the module
     private `mainWindow` is still null and installedPrinterNames() short-circuits
     to null — which would make every printer-availability assertion vacuous. */
  for (let i = 0; i < 200 && FakeBrowserWindow.createdCount < 2; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  ok("app ready: splash + main window created", FakeBrowserWindow.createdCount >= 2,
     "created=" + FakeBrowserWindow.createdCount);

  /* ================= SCENARIO 1: no printer selected, none installed ===== */
  console.log("-- Scenario 1: no printer selected + no printers installed --");
  reset();
  let res = await printTicket({}, opts({ printerName: "" }));
  ok("1a returns ok:false", res.ok === false);
  ok("1b reason is 'no-printer-selected'", res.reason === "no-printer-selected", JSON.stringify(res));
  ok("1c available list is empty", Array.isArray(res.available) && res.available.length === 0);
  ok("1d never reached webContents.print (nothing was sent to print)", env.printed.length === 0);

  console.log("\n-- Scenario 2: selected printer missing from the list --");
  reset();
  env.printers = [{ name: "HP LaserJet" }, { name: "EPSON TM-T20" }];
  res = await printTicket({}, opts({ printerName: "Zebra ZD421" }));
  ok("2a returns ok:false", res.ok === false);
  ok("2b reason is 'printer-not-found'", res.reason === "printer-not-found", JSON.stringify(res));
  ok("2c reports the real available printers", Array.isArray(res.available) && res.available.length === 2);
  ok("2d never reached webContents.print", env.printed.length === 0);

  console.log("\n-- Scenario 3: selected printer present, print succeeds --");
  reset();
  env.printers = [{ name: "EPSON TM-T20" }];
  res = await printTicket({}, opts({ printerName: "EPSON TM-T20" }));
  ok("3a returns ok:true", res.ok === true, JSON.stringify(res));
  ok("3b deviceName forwarded to Electron", env.printed.length === 1 && env.printed[0].deviceName === "EPSON TM-T20");
  ok("3c no failure reason", !res.reason);

  console.log("\n-- Scenario 4: printer present but the print call itself fails --");
  reset();
  env.printers = [{ name: "EPSON TM-T20" }];
  env.printResult = { success: false, failureReason: "Printer not connected" };
  res = await printTicket({}, opts({ printerName: "EPSON TM-T20" }));
  ok("4a returns ok:false", res.ok === false);
  ok("4b preserves the real failure reason", res.reason === "Printer not connected", JSON.stringify(res));
  ok("4c does NOT misreport it as 'no-printer-selected'", res.reason !== "no-printer-selected");
  ok("4d did reach webContents.print (real attempt)", env.printed.length === 1);

  console.log("\n-- Scenario 5: no printer selected BUT printers exist (Windows default) --");
  reset();
  env.printers = [{ name: "Microsoft Print to PDF", isDefault: true }];
  res = await printTicket({}, opts({ printerName: "" }));
  ok("5a existing behaviour preserved: prints to the Windows default", res.ok === true, JSON.stringify(res));
  ok("5b no deviceName forced (user chose 'default')", env.printed.length === 1 && !env.printed[0].deviceName);
  ok("5c does NOT claim 'no-printer-selected' when a default exists", res.reason !== "no-printer-selected");

  console.log("\n-- Scenario 6: printer discovery itself fails --");
  reset();
  env.listThrows = true;
  res = await printTicket({}, opts({ printerName: "EPSON TM-T20" }));
  ok("6a falls back without a false rejection", res.ok === true, JSON.stringify(res));
  ok("6b reached webContents.print", env.printed.length === 1);

  console.log("\n-- Scenario 7: Arabic message mapping (real printResultToast) --");
  reset();
  toastCalls.length = 0;
  let r = printResultToast({ ok: false, reason: "no-printer-selected" });
  ok("7a no-printer-selected -> exact Arabic message",
     toastCalls.length === 1 &&
     toastCalls[0].msg === "تعذّرت الطباعة: لم يتم تحديد طابعة. يُرجى اختيار طابعة أولاً من «الإعدادات».",
     JSON.stringify(toastCalls));
  ok("7b no-printer-selected -> warns (not a success)", toastCalls[0].kind === "warn");
  ok("7c returns false", r === false);

  reset();
  toastCalls.length = 0;
  printResultToast({ ok: false, reason: "printer-not-found" });
  ok("7d printer-not-found keeps its specific Arabic message",
     toastCalls.length === 1 && toastCalls[0].msg === "الطابعة المختارة غير متوفرة الآن — افتح «الإعدادات» واختر طابعة متصلة",
     JSON.stringify(toastCalls));

  reset();
  toastCalls.length = 0;
  printResultToast({ ok: false, reason: "Printer not connected" });
  ok("7e real print failure keeps the generic message",
     toastCalls.length === 1 &&
     toastCalls[0].msg === "تعذّرت الطباعة — تأكد من توصيل الطابعة واختيارها من «الإعدادات»",
     JSON.stringify(toastCalls));
  ok("7f generic message does NOT claim no printer was selected",
     toastCalls[0].msg.indexOf("لم يتم تحديد طابعة") === -1);
  ok("7g exactly one notification per failure (no duplicates)", toastCalls.length === 1);

  reset();
  toastCalls.length = 0;
  const okRet = printResultToast({ ok: true }, "تم إرسال تذكرة تجريبية للطابعة");
  ok("7h success path returns true", okRet === true);
  ok("7i success shows its own success message", toastCalls.length === 1 && toastCalls[0].kind === "ok");

  console.log("\n-- Scenario 8: failure is logged, never swallowed --");
  reset();
  env.printers = [{ name: "EPSON TM-T20" }];
  env.printResult = { success: false, failureReason: "Out of paper" };
  res = await printTicket({}, opts({ printerName: "EPSON TM-T20" }));
  printResultToast(res);
  ok("8a reason surfaced to the renderer", res.reason === "Out of paper");
  ok("8b reason written to the app error log", logCalls.length === 1 && logCalls[0].what === "Out of paper");
  ok("8c user saw a message", toastCalls.length === 1 && toastCalls[0].kind === "warn");

  console.log("\n-- Scenario 9: print options / paper behaviour untouched --");
  reset();
  env.printers = [{ name: "HP LaserJet" }];
  await printTicket({}, opts({ printerName: "HP LaserJet", paper: "a4" }));
  ok("9a A4 still uses pageSize A4 + default margins",
     env.printed[0].pageSize === "A4" && env.printed[0].margins.marginType === "default");
  reset();
  env.printers = [{ name: "EPSON TM-T20" }];
  await printTicket({}, opts({ printerName: "EPSON TM-T20", paper: "58" }));
  ok("9b thermal still uses printer default page size + no margins",
     env.printed[0].usePrinterDefaultPageSize === true &&
     env.printed[0].margins.marginType === "none" && !env.printed[0].pageSize);
  ok("9c printBackground preserved", env.printed[0].printBackground === true);

  console.log("\n-- Scenario 10: print never touches the database --");
  const dataFile = path.join(SANDBOX, "malahy-data.json");
  const before = fs.existsSync(dataFile) ? fs.readFileSync(dataFile) : null;
  reset();
  env.printers = [];
  await printTicket({}, opts({ printerName: "" }));          // failure path
  env.printers = [{ name: "EPSON TM-T20" }];
  env.printResult = { success: false, failureReason: "boom" };
  await printTicket({}, opts({ printerName: "EPSON TM-T20" })); // failure path
  const after = fs.existsSync(dataFile) ? fs.readFileSync(dataFile) : null;
  ok("10a sales/database file unchanged by print failures",
     before === null ? after === null : Buffer.compare(before, after) === 0);

  console.log("\n-- Scenario 11: get-printers discovery API unchanged --");
  reset();
  env.printers = [{ name: "EPSON TM-T20", isDefault: true }];
  const list = await getPrinters({});
  ok("11a still returns mapped printer objects",
     Array.isArray(list) && list.length === 1 && list[0].name === "EPSON TM-T20" && list[0].isDefault === true);

  console.log("\n-- Scenario 12: production user data never opened --");
  const prodFile = process.env.APPDATA + "\\malahy\\malahy-data.json";
  ok("12a sandbox userData is a temp dir, not %APPDATA%\\malahy",
     path.resolve(appStub.getPath("userData")) === path.resolve(SANDBOX) &&
     path.resolve(SANDBOX) !== path.resolve(path.dirname(prodFile)));
  ok("12b production DB still present and untouched by this test", fs.existsSync(prodFile));

  Module._load = origLoad;
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
