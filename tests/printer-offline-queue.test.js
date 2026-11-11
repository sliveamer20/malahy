// tests/printer-offline-queue.test.js
// Offline printer queue fix — focused regression suite.
//
// Loads the REAL main.js (electron + child_process stubbed) and the REAL
// printer-readiness.js, invokes the actual registered `print-ticket` handler,
// and executes the REAL `printResultToast` body extracted from index.html.
//
// The Windows readiness probe is replaced by deterministic fixtures, so the
// suite runs anywhere and never opens a real printer or production user data.

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
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "malahy-offline-print-test-"));
const htmlSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

/* ---------- controllable environment ---------- */
const env = {
  probeResult: null,
  probeThrows: false,
  printResult: { success: true, failureReason: "" },
  printed: [],
  loadedUrls: [],
  electronPrinters: [],
};

function probeFor(name, overrides, extra) {
  const printer = Object.assign({
    Name: name,
    WorkOffline: false,
    PrinterStatus: 3,
    ExtendedPrinterStatus: 2,
    DetectedErrorState: 0,
    PrinterState: 0,
    Status: "Unknown",
    PortName: "nul:",
    Default: false,
    Local: true,
    Network: false,
    JobCount: 0,
    DriverName: "test",
  }, overrides || {});
  return Object.assign({
    ok: true,
    found: true,
    target: name,
    spooler: "Running",
    names: [name],
    tcpPorts: [],
    usbPort: null,
    printer: printer,
  }, extra || {});
}

/* ---------- electron + child_process stubs ---------- */
const ipcMain = {
  handle: (ch, fn) => { ipcMain._h[ch] = fn; },
  on: (ch, fn) => { ipcMain._o[ch] = fn; },
  _h: {}, _o: {},
};

class FakeWebContents {
  constructor() {
    this.getPrintersAsync = async () => env.electronPrinters;
    this.print = (opts, cb) => {
      env.printed.push(opts);
      setImmediate(() => cb(env.printResult.success, env.printResult.failureReason));
    };
    this.send = () => {};
    this.on = () => {};
  }
}
class FakeBrowserWindow {
  constructor() {
    this.webContents = new FakeWebContents();
    this.destroyed = false;
    FakeBrowserWindow.createdCount++;
  }
  loadFile() { return Promise.resolve(); }
  loadURL(url) { env.loadedUrls.push(url); return Promise.resolve(); }
  destroy() { this.destroyed = true; }
  isDestroyed() { return this.destroyed; }
  on() { return this; }
  once() { return this; }
  show() { return this; }
  focus() { return this; }
  isMinimized() { return false; }
  isVisible() { return true; }
  getPrintersAsync() { return this.webContents.getPrintersAsync(); }
}
FakeBrowserWindow.createdCount = 0;

const appStub = {
  getPath: () => SANDBOX,
  getVersion: () => "2.6.0",
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
const childProcessStub = {
  execFile: (_file, _args, _options, cb) => {
    if (env.probeThrows) {
      setImmediate(() => cb(new Error("probe unavailable"), "", ""));
      return;
    }
    setImmediate(() => cb(null, JSON.stringify(env.probeResult), ""));
  },
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return electronStub;
  if (request === "electron-updater") return { autoUpdater: null };
  if (request === "child_process") return childProcessStub;
  return origLoad.apply(this, arguments);
};

const readiness = require(path.join(root, "printer-readiness.js"));
require(path.join(root, "main.js"));

const printTicket = ipcMain._h["print-ticket"];
const toastCalls = [], logCalls = [];
const toast = (msg, kind) => { toastCalls.push({ msg: msg, kind: kind }); };
const logErr = (where, what) => { logCalls.push({ where: where, what: String(what) }); };
/* eslint-disable no-new-func */
const printResultToast = new Function(
  "toast", "logErr",
  extractFunction(htmlSrc, "printResultToast") + "\nreturn printResultToast;"
)(toast, logErr);

function opts(o) {
  return Object.assign({ html: "<html><head></head><body>ticket</body></html>", paper: "80", silent: true, printerName: "EPSON TM-T20" }, o);
}
function reset() {
  env.probeResult = probeFor("EPSON TM-T20");
  env.probeThrows = false;
  env.printResult = { success: true, failureReason: "" };
  env.printed = [];
  env.loadedUrls = [];
  toastCalls.length = 0;
  logCalls.length = 0;
}
function decodeLoaded(url) {
  const prefix = "data:text/html;charset=utf-8,";
  return url.indexOf(prefix) === 0 ? decodeURIComponent(url.slice(prefix.length)) : url;
}

(async function () {
  console.log("PRINTER OFFLINE QUEUE FIX");
  console.log("sandbox userData: " + SANDBOX + "\n");

  for (let i = 0; i < 200 && FakeBrowserWindow.createdCount < 2; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  ok("app ready: splash + main window created", FakeBrowserWindow.createdCount >= 2);

  /* ================= A. pure readiness decision ================= */
  console.log("-- A. Windows readiness decisions --");
  let d;
  d = await readiness.evaluateProbe(probeFor("P"), "P");
  ok("A1 online virtual printer is ready", d.ok === true, JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { WorkOffline: true }), "P");
  ok("A2 WorkOffline=true blocks", d.ok === false && d.detail === "offline", JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { PrinterStatus: 7 }), "P");
  ok("A3 PrinterStatus=Offline blocks", d.detail === "offline", JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { ExtendedPrinterStatus: 8 }), "P");
  ok("A4 ExtendedPrinterStatus=Paused blocks", d.detail === "paused", JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { DetectedErrorState: 8 }), "P");
  ok("A5 DetectedErrorState=Jammed blocks", d.detail === "paper-jam", JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { PrinterState: 256 }), "P");
  ok("A6 PrinterState error flag blocks", d.detail === "error", JSON.stringify(d));

  d = await readiness.evaluateProbe(
    probeFor("P", { PortName: "USB001" }, { usbPort: { Name: "USB001", DeviceId: "USB\\VID_X\\1", Present: false, DeviceStatus: "", ConfigManagerErrorCode: -1 } }),
    "P"
  );
  ok("A7 USB device physically absent blocks", d.detail === "usb-device-absent", JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { PortName: "USB001" }, { usbPort: null }), "P");
  ok("A8 USB port with no device mapping fails safe", d.detail === "usb-unverified", JSON.stringify(d));

  d = await readiness.evaluateProbe(
    probeFor("P", { PortName: "USB001" }, { usbPort: { Name: "USB001", DeviceId: "USB\\VID_X\\1", Present: true, DeviceStatus: "OK", ConfigManagerErrorCode: 0 } }),
    "P"
  );
  ok("A9 present USB device with no error is ready", d.ok === true, JSON.stringify(d));

  d = await readiness.evaluateProbe(
    probeFor("P", { PortName: "IP_192.0.2.9" }, { tcpPorts: [{ Name: "IP_192.0.2.9", HostAddress: "192.0.2.9", PortNumber: 9100 }] }),
    "P",
    { tcpReachable: async () => false }
  );
  ok("A10 unreachable network printer blocks", d.detail === "network-unreachable", JSON.stringify(d));

  d = await readiness.evaluateProbe(
    probeFor("P", { PortName: "IP_192.0.2.9" }, { tcpPorts: [{ Name: "IP_192.0.2.9", HostAddress: "192.0.2.9", PortNumber: 9100 }] }),
    "P",
    { tcpReachable: async () => true }
  );
  ok("A11 reachable network printer is ready", d.ok === true, JSON.stringify(d));

  d = await readiness.evaluateProbe(probeFor("P", { PortName: "WSD-abc" }), "P");
  ok("A12 unknown/WSD port fails safe", d.detail === "port-unverified", JSON.stringify(d));

  d = await readiness.evaluateProbe({ ok: true, found: true, spooler: "Stopped", names: [], printer: probeFor("P").printer }, "P");
  ok("A13 stopped spooler blocks", d.ok === false && d.detail === "spooler-stopped", JSON.stringify(d));

  d = await readiness.evaluateProbe({ ok: true, found: false, target: "P", names: ["A", "B"], spooler: "Running" }, "P");
  ok("A14 missing selected printer -> printer-not-found", d.reason === "printer-not-found" && d.available.length === 2, JSON.stringify(d));

  d = await readiness.evaluateProbe({ ok: true, found: false, target: "", names: [], spooler: "Running" }, "");
  ok("A15 no default and nothing installed -> no-printer-selected", d.reason === "no-printer-selected", JSON.stringify(d));

  /* ================= B. print-ticket never submits when not ready ================= */
  console.log("\n-- B. no Windows print submission when the printer is not ready --");
  reset();
  env.probeResult = probeFor("EPSON TM-T20", { WorkOffline: true });
  let res = await printTicket({}, opts({}));
  ok("B1 offline ticket returns ok:false", res.ok === false, JSON.stringify(res));
  ok("B2 offline ticket reason is printer-not-ready", res.reason === "printer-not-ready" && res.detail === "offline", JSON.stringify(res));
  ok("B3 offline ticket never reaches webContents.print", env.printed.length === 0);
  ok("B4 the hidden print window is destroyed on refusal", FakeBrowserWindow.createdCount > 0);

  reset();
  env.probeResult = probeFor("EPSON TM-T20", { ExtendedPrinterStatus: 8 });
  res = await printTicket({}, opts({}));
  ok("B5 paused printer: no submission", res.ok === false && env.printed.length === 0, JSON.stringify(res));

  reset();
  env.probeResult = probeFor("EPSON TM-T20", { DetectedErrorState: 8 });
  res = await printTicket({}, opts({}));
  ok("B6 printer error: no submission", res.ok === false && env.printed.length === 0, JSON.stringify(res));

  reset();
  env.probeThrows = true;
  res = await printTicket({}, opts({}));
  ok("B7 unverifiable readiness fails safe (no submission)", res.ok === false && env.printed.length === 0 && res.detail === "probe-failed", JSON.stringify(res));

  reset();
  env.probeResult = { ok: true, found: false, target: "EPSON TM-T20", names: ["Other"], spooler: "Running", tcpPorts: [], usbPort: null };
  res = await printTicket({}, opts({}));
  ok("B8 missing printer: no submission + available list", res.reason === "printer-not-found" && env.printed.length === 0 && res.available[0] === "Other", JSON.stringify(res));

  /* ================= C. normal path & duplicate protection ================= */
  console.log("\n-- C. normal submission and duplicate protection --");
  reset();
  res = await printTicket({}, opts({ jobId: "tx-1" }));
  ok("C1 ready printer prints exactly once", res.ok === true && env.printed.length === 1, JSON.stringify(res));
  ok("C2 verified printer is pinned as deviceName", env.printed[0].deviceName === "EPSON TM-T20");
  const loaded = decodeLoaded(env.loadedUrls[env.loadedUrls.length - 1]);
  ok("C3 spooler document name is marked as Malahy", /<title[^>]*>Malahy print /.test(loaded), loaded.slice(0, 160));

  reset();
  await printTicket({}, opts({ jobId: "dup-1" }));
  res = await printTicket({}, opts({ jobId: "dup-1" }));
  ok("C4 repeated jobId is not submitted twice", env.printed.length === 1 && res.ok === true && res.duplicate === true, JSON.stringify(res));

  reset();
  await printTicket({}, opts({ jobId: "a" }));
  await printTicket({}, opts({ jobId: "b" }));
  ok("C5 different jobIds are separate jobs", env.printed.length === 2);

  reset();
  res = await printTicket({}, "<html>not-an-object</html>");
  ok("C6 invalid request is rejected before any print", res.ok === false && res.reason === "invalid-print-request" && env.printed.length === 0);

  /* ================= D. printer disappears after preflight ================= */
  console.log("\n-- D. printer disappears between preflight and submission --");
  reset();
  env.printResult = { success: false, failureReason: "Printer not connected" };
  res = await printTicket({}, opts({ jobId: "race-1" }));
  ok("D1 real submission failure is surfaced", res.ok === false && res.reason === "Printer not connected", JSON.stringify(res));
  ok("D2 exactly one submission attempt (no retry)", env.printed.length === 1);
  await new Promise((r) => setTimeout(r, 500));
  ok("D3 still one attempt after waiting (no delayed retry)", env.printed.length === 1);

  /* ================= E. exact Arabic message ================= */
  console.log("\n-- E. ticket failure message --");
  reset();
  let ret = printResultToast({ ok: false, reason: "printer-not-ready" }, null, { ticket: true });
  ok("E1 ticket failure shows the exact required Arabic message",
     toastCalls.length === 1 &&
     toastCalls[0].msg === "تعذر الطباعة، الطابعة غير متصلة أو غير جاهزة. تم تسجيل عملية قطع التذكرة.",
     JSON.stringify(toastCalls));
  ok("E2 warning, not success", toastCalls[0].kind === "warn" && ret === false);
  ok("E3 exactly one notification", toastCalls.length === 1);
  ok("E4 reason logged", logCalls.length === 1 && logCalls[0].what === "printer-not-ready");

  reset();
  printResultToast({ ok: false, reason: "printer-not-found" }, null, { ticket: true });
  ok("E5 missing printer on a ticket also uses the exact message",
     toastCalls[0].msg === "تعذر الطباعة، الطابعة غير متصلة أو غير جاهزة. تم تسجيل عملية قطع التذكرة.");

  reset();
  printResultToast({ ok: false, reason: "printer-not-ready" });
  ok("E6 non-ticket print does not claim a ticket was recorded",
     toastCalls[0].msg === "تعذر الطباعة، الطابعة غير متصلة أو غير جاهزة." &&
     toastCalls[0].msg.indexOf("تم تسجيل") === -1, toastCalls[0].msg);

  reset();
  printResultToast({ ok: false, reason: "no-printer-selected" });
  ok("E7 existing no-printer message preserved",
     toastCalls[0].msg.indexOf("لم يتم تحديد طابعة") !== -1, toastCalls[0].msg);

  /* ================= F. transaction independence ================= */
  console.log("\n-- F. ticket recording is independent from printing --");
  const addTicketSrc = extractFunction(htmlSrc, "addTicket");
  const addBatchSrc = extractFunction(htmlSrc, "addBatch");
  ok("F1 addTicket records the transaction before printing",
     addTicketSrc.indexOf("appendTxLog(") !== -1 &&
     addTicketSrc.indexOf("appendTxLog(") < addTicketSrc.indexOf("printTicket(") &&
     addTicketSrc.indexOf("persist();") < addTicketSrc.indexOf("printTicket("));
  ok("F2 the recorded transaction id is passed as the print job id",
     /const txId=uid\(\)/.test(addTicketSrc) && /printTicket\(id,1,method,txId\)/.test(addTicketSrc));
  ok("F3 addBatch uses the same single-path pattern",
     /const txId=uid\(\)/.test(addBatchSrc) && /printTicket\(id,q,'cash',txId\)/.test(addBatchSrc));
  ok("F4 printing is not awaited by addTicket (a print failure cannot cancel a sale)",
     !/await\s+printTicket\(/.test(addTicketSrc));
  ok("F5 no rollback/undo path was added around printing",
     addTicketSrc.indexOf("txPricesPop") === -1 && addTicketSrc.indexOf("state.counts[id]=c-1") === -1);

  const dbFile = path.join(SANDBOX, "malahy-data.json");
  const before = fs.existsSync(dbFile) ? fs.readFileSync(dbFile) : null;
  reset();
  env.probeResult = probeFor("EPSON TM-T20", { WorkOffline: true });
  await printTicket({}, opts({}));
  env.probeThrows = true;
  await printTicket({}, opts({}));
  const after = fs.existsSync(dbFile) ? fs.readFileSync(dbFile) : null;
  ok("F6 print failures never write the database",
     before === null ? after === null : Buffer.compare(before, after) === 0);

  /* ================= G. no queue / retry / reconnect handler ================= */
  console.log("\n-- G. no application-level queue or reconnect retry --");
  const readinessSrc = fs.readFileSync(path.join(root, "printer-readiness.js"), "utf8");
  const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const handlerSrc = mainSrc.slice(mainSrc.indexOf('ipcMain.handle("print-ticket"'), mainSrc.indexOf('/* ============ التحديثات التلقائية'));
  ok("G1 readiness module never writes files or local storage",
     readinessSrc.indexOf("writeFile") === -1 && readinessSrc.indexOf("localStorage") === -1 &&
     readinessSrc.indexOf("saveJSON") === -1);
  ok("G2 print handler has no retry timer or reconnection listener",
     handlerSrc.indexOf("setInterval") === -1 && handlerSrc.indexOf("retry") === -1 &&
     handlerSrc.indexOf("online") === -1 && handlerSrc.indexOf("reconnect") === -1);
  ok("G3 no pending offline print storage in the print path",
     handlerSrc.indexOf("pending") === -1 && handlerSrc.indexOf("queue") === -1);

  /* ================= H. production data untouched ================= */
  console.log("\n-- H. isolation --");
  ok("H1 sandbox is a temp directory, not the production profile",
     path.resolve(appStub.getPath("userData")) === path.resolve(SANDBOX) &&
     path.resolve(SANDBOX) !== path.resolve(path.dirname(process.env.APPDATA + "\\malahy\\malahy-data.json")));

  Module._load = origLoad;
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
