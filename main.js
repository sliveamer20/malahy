// main.js — العملية الرئيسية لتطبيق "كوكي بارك"
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const db = require("./database");

// electron-updater اختياري (لو مش متثبت البرنامج يشتغل عادي بدون تحديثات)
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (e) {
  autoUpdater = null;
}

let splash = null;
let mainWindow = null;

function createSplash() {
  splash = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: "#181126",
    webPreferences: { devTools: false, contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, "windows", "splash.html"));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, "assets", "icons", "icon.ico"),
    title: "كوكي بارك",
    width: 1500,
    height: 950,
    minWidth: 1200,
    minHeight: 750,
    show: false,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: "#181126",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      try {
        if (splash && !splash.isDestroyed()) splash.close();
      } catch (_) {}
      /* قد تُغلق النافذة أثناء المهلة الثانيتين → أي استدعاء عليها بعدها
         يرمي "Object has been destroyed" غير مقبوض. */
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
      } catch (_) { return; }
      initUpdater();
    }, 2000);
  });
}

/* ============ IPC: تخزين البيانات (ملف JSON على الجهاز) ============ */
ipcMain.on("db-get", (e, { key, def }) => {
  try {
    e.returnValue = db.get(key, def === undefined ? null : def);
  } catch (err) {
    e.returnValue = def === undefined ? null : def;
  }
});
ipcMain.on("db-set", (e, { key, value }) => {
  try { db.set(key, value); e.returnValue = true; } catch (err) { e.returnValue = false; }
});
ipcMain.on("db-delete", (e, { key }) => {
  try { db.delete(key); e.returnValue = true; } catch (err) { e.returnValue = false; }
});
ipcMain.on("db-clear", (e) => {
  try { db.clear(); e.returnValue = true; } catch (err) { e.returnValue = false; }
});
ipcMain.on("app-version", (e) => { e.returnValue = app.getVersion(); });
ipcMain.on("db-file", (e) => {
  try { e.returnValue = db.file(); } catch (err) { e.returnValue = ""; }
});

/* ============ IPC: سجل الأخطاء (ملف نصّي داخل مجلد بيانات المستخدم) ============ */
function logFilePath() {
  return path.join(app.getPath("userData"), "malahy-errors.log");
}
function appendLog(line) {
  try {
    const dir = app.getPath("userData");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString();
    fs.appendFileSync(logFilePath(), "[" + stamp + "] " + String(line) + "\r\n", "utf8");
    return true;
  } catch (e) {
    return false;
  }
}
ipcMain.on("log-error", (e, msg) => {
  try { e.returnValue = appendLog(msg); } catch (err) { e.returnValue = false; }
});
ipcMain.on("log-file", (e) => {
  try { e.returnValue = logFilePath(); } catch (err) { e.returnValue = ""; }
});

/* ============ IPC: فتح رابط خارجي بالمتصفح/التطبيق الافتراضي ============ */
ipcMain.on("open-external", (e, url) => {
  if(typeof url !== "string" || !/^(https?|whatsapp):\/\//i.test(url)) return;
  shell.openExternal(url).catch(() => {});
});

/* ============ IPC: تصدير PDF (عبر طباعة الصفحة إلى PDF) ============ */
ipcMain.handle("export-pdf", async (_e, { html, suggestedName }) => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 900,
      height: 700,
      webPreferences: { contextIsolation: true, javascript: false },
    });
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 350));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
    });
    win.destroy(); win = null;

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "حفظ التقرير PDF",
      defaultPath: suggestedName || "report.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, pdf);
    return { ok: true, path: filePath };
  } catch (err) {
    try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
    return { ok: false, error: String(err) };
  }
});

/* ============ IPC: تصدير Excel (CSV بترميز UTF-8 مع BOM ليقرأ العربي) ============ */
ipcMain.handle("export-csv", async (_e, { rows, suggestedName }) => {
  try {
    const csv = (rows || [])
      .map((row) =>
        (row || [])
          .map((cell) => {
            let s = cell == null ? "" : String(cell);
            if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
            return s;
          })
          .join(",")
      )
      .join("\r\n");

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "حفظ ملف Excel",
      defaultPath: suggestedName || "report.csv",
      filters: [{ name: "CSV (Excel)", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, "\uFEFF" + csv, "utf8");
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/* ============ IPC: الطباعة (تذاكر) ============ */
ipcMain.handle("get-printers", async () => {
  try {
    const wc = mainWindow && mainWindow.webContents;
    if (!wc) return [];
    const list = await wc.getPrintersAsync();
    return (list || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!p.isDefault,
      status: p.status,
    }));
  } catch (e) {
    return [];
  }
});
ipcMain.handle("print-ticket", async (_e, opts) => {
  opts = opts || {};
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, javascript: false },
    });
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(opts.html || "")
    );
    await new Promise((r) => setTimeout(r, 250));
    const printOpts = {
      silent: opts.silent !== false,
      printBackground: true,
      margins: { marginType: "none" },
    };
    if (opts.printerName) printOpts.deviceName = opts.printerName;
    const result = await new Promise((resolve) => {
      try {
        win.webContents.print(printOpts, (success, failureReason) =>
          resolve({ success: success, failureReason: failureReason })
        );
      } catch (err) {
        resolve({ success: false, failureReason: String(err) });
      }
    });
    try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
    win = null;
    return { ok: !!result.success, reason: result.failureReason || "" };
  } catch (err) {
    try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
    return { ok: false, error: String(err) };
  }
});

/* ============ التحديثات التلقائية ============ */
function sendToWin(channel, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send(channel, data);
  } catch (_) {}
}
function initUpdater() {
  if (!autoUpdater) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-available", (info) =>
      sendToWin("update-status", { state: "available", version: info && info.version })
    );
    autoUpdater.on("update-not-available", () =>
      sendToWin("update-status", { state: "none" })
    );
    autoUpdater.on("error", (err) =>
      sendToWin("update-status", { state: "error", message: String(err) })
    );
    autoUpdater.on("download-progress", (p) =>
      sendToWin("update-status", { state: "downloading", percent: Math.round((p && p.percent) || 0) })
    );
    autoUpdater.on("update-downloaded", (info) =>
      sendToWin("update-status", { state: "downloaded", version: info && info.version })
    );
    autoUpdater.checkForUpdates();
  } catch (e) {}
}
ipcMain.on("updater-check", () => {
  if (autoUpdater) { try { autoUpdater.checkForUpdates(); } catch (_) {} }
});
ipcMain.on("updater-install", () => {
  if (autoUpdater) { try { autoUpdater.quitAndInstall(); } catch (_) {} }
});

/* ============ بوابة التحديث الإجباري (قبل عرض الواجهة الرئيسية) ============ */
const updateGate = require("./update-gate");

/* مهلة فحص التحديث: لو الخادم ما ردّش خلالها نعتبره غير قابل للوصول */
const GATE_CHECK_TIMEOUT_MS = 20000;

let gateWin = null;
let gateState = null;
let gateActive = false;
let gateListenersRegistered = false;

/* نسخة الحالية والمطلوبة من قرار البوابة. تُدمج مع كل رسالة حالة لأن رسالة
   الحالة الأولى قد تُرسل قبل أن تسجّل نافذة البوابة مستمعيها (تُفقد)، وحينها
   يجب أن تعرف النسخة المطلوبة من أي رسالة تالية. */
let gateVersions = null;

function sendGateStatus(data) {
  try {
    if (gateVersions && data) {
      data = Object.assign({}, gateVersions, data);
    }
    gateState = data;
    if (gateWin && !gateWin.isDestroyed()) {
      gateWin.webContents.send("gate-status", data);
    }
  } catch (_) {}
}

/* يسجّل مستمعي التحديث مرة واحدة قبل أي فحص — حتى لا تفوتنا أحداث التنزيل
   بين بدء الفحص وفتح نافذة البوابة (تنزيل مخزّن سابقًا قد يكتمل سريعًا). */
function registerGateListeners() {
  if (gateListenersRegistered || !autoUpdater) return;
  gateListenersRegistered = true;
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-available", (info) =>
    sendGateStatus({ state: "checking", latest: info && info.version })
  );
  autoUpdater.on("download-progress", (p) =>
    sendGateStatus({ state: "downloading", percent: Math.round((p && p.percent) || 0) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    sendGateStatus({ state: "downloaded", version: info && info.version });
    /* إعادة تشغيل تلقائية في النسخة الجديدة — فقط أثناء البوابة الإجبارية
       حتى لا نغيّر سلوك التحديث الاختياري داخل الواجهة الرئيسية. */
    if (gateActive) {
      setTimeout(() => {
        try { autoUpdater.quitAndInstall(); } catch (_) {}
      }, 1200);
    }
  });
  autoUpdater.on("error", (err) =>
    sendGateStatus({ state: "error", message: String(err) })
  );
}

/* فحص أحدث نسخة متاحة على خادم التحديثات مع مهلة زمنية.
   ملاحظة: مؤقت المهلة يجب تنظيفه دائمًا، وإلا فإن وعده يُرفض لاحقًا بدون
   مُعالج (unhandledRejection) بعد أن يكون الفحص قد انتهى فعلًا. */
async function checkLatestVersion() {
  if (!autoUpdater) {
    return { reached: false, latest: null, error: "updater-unavailable" };
  }
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve(autoUpdater.checkForUpdates()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), GATE_CHECK_TIMEOUT_MS);
      }),
    ]);
    if (result && result.updateInfo && result.updateInfo.version) {
      return { reached: true, latest: result.updateInfo.version, error: null };
    }
    /* وصلنا للخادم ولا يوجد تحديث → النسخة الحالية هي الأحدث */
    return { reached: true, latest: null, error: null };
  } catch (e) {
    return { reached: false, latest: null, error: String((e && e.message) || e) };
  } finally {
    if (timer) { clearTimeout(timer); timer = null; }
  }
}

/* يقرّر هل نسمح بفتح الواجهة الرئيسية ولا نُلزم بالتحديث أولًا */
async function runUpdateGate() {
  const installed = app.getVersion();
  /* في وضع التطوير: electron-updater يحتاج تطبيقًا معبّأً ليعمل، لذا نتخطّى
     البوابة ما لم يُطلب تشغيلها صراحةً (MALAHY_TEST_GATE=1) لاختبار الواجهة. */
  if (!app.isPackaged && process.env.MALAHY_TEST_GATE !== "1") {
    return { action: "proceed", installed: installed, required: installed };
  }
  /* نفترض أن التحديث قد يلزم من البداية، فنفعّل إعادة التشغيل التلقائية
     قبل أي تنزيل — التنزيل المخزّن قد يكتمل بين الفحص وفتح النافذة.
     لو اتضح أن النسخة محدّثة نُلغي التفعيل قبل الدخول للواجهة الرئيسية. */
  gateActive = true;
  registerGateListeners();
  const status = await checkLatestVersion();
  const decision = updateGate.evaluate(installed, status);
  gateVersions = { installed: decision.installed, required: decision.required };
  if (decision.action === "proceed") gateActive = false;
  return decision;
}

/* النافذة المقفولة: لا يمكن إغلاقها ولا تخطّيها — الواجهة الرئيسية
   لا تُنشأ أصلًا طالما البوابة مفعّلة، فلا يوجد ما يمكن تخطّيه إليه. */
function createGateWindow(decision) {
  gateWin = new BrowserWindow({
    icon: path.join(__dirname, "assets", "icons", "icon.ico"),
    title: "تحديث مطلوب",
    width: 640,
    height: 760,
    minWidth: 560,
    minHeight: 700,
    center: true,
    show: false,
    resizable: false,
    minimizable: true,
    closable: false, /* لا يوجد زر إغلاق → لا يمكن تجاوز البوابة */
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a1628",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  });

  Menu.setApplicationMenu(null);
  gateWin.loadFile(path.join(__dirname, "windows", "update.html"));

  gateWin.once("ready-to-show", () => {
    try { gateWin.show(); } catch (_) {}
    /* أعد إرسال آخر حالة (التنزيل قد يكون بدأ بالفعل أثناء الفحص) */
    if (gateState) {
      try { gateWin.webContents.send("gate-status", gateState); } catch (_) {}
    }
  });

  gateWin.on("closed", () => { gateWin = null; });

  /* أخبر النافذة بالنسخة الحالية والمطلوبة فورًا */
  sendGateStatus({
    state: decision.reason === "offline" ? "offline" : "checking",
    installed: decision.installed,
    required: decision.required,
    latest: decision.latest || null,
  });
}

ipcMain.on("gate-init", (e) => {
  try {
    e.returnValue = {
      installed: app.getVersion(),
      required: updateGate.FLOOR_VERSION,
    };
  } catch (err) {
    e.returnValue = null;
  }
});

ipcMain.on("gate-retry", () => {
  if (!autoUpdater) {
    sendGateStatus({ state: "error", message: "نظام التحديث غير متوفر" });
    return;
  }
  registerGateListeners();
  sendGateStatus({ state: "checking" });
  /* checkForUpdates قد ترجع وعدًا مرفوضًا (شبكة/خادم) بشكل غير متزامن —
     try/catch المتزامن لا يلتقطه، فيتحوّل إلى unhandledRejection. نلتقطه
     ونحوّله إلى حالة خطأ واضحة للنافذة المقفولة. */
  try {
    const p = autoUpdater.checkForUpdates();
    if (p && typeof p.then === "function") {
      p.then(
        (result) => {
          /* لو وصلنا ولم يوجد تحديث يلبّي المطلوب → حالة "غير متاح" */
          if (!result || !result.updateInfo || !result.updateInfo.version) {
            sendGateStatus({ state: "error", message: "لا توجد نسخة أحدث متاحة الآن. أعد المحاولة لاحقًا أو تواصل مع المطوّر." });
          }
        },
        (e) => sendGateStatus({ state: "error", message: String((e && e.message) || e) })
      );
    }
  } catch (e) {
    sendGateStatus({ state: "error", message: String(e) });
  }
});

ipcMain.on("gate-restart", () => {
  if (autoUpdater) {
    try { autoUpdater.quitAndInstall(); } catch (_) {}
  }
});

/* ============ دورة حياة التطبيق ============ */
/* قفل نسخة واحدة: لو المستخدم فتح البرنامج مرة تانية نركّز على النافذة الموجودة
   بدل ما نعمل نسخة جديدة من البرنامج (تفادي تكرار البيانات وتعدّد النوافذ). */
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    try {
      if (gateWin && !gateWin.isDestroyed()) { gateWin.focus(); return; }
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } catch (_) {}
  });

  /* البوابة تعمل قبل إنشاء النافذة الرئيسية: لو التحديث مطلوب نعرض
     شاشة التحديث المقفولة بدل الواجهة الرئيسية. */
  app.whenReady().then(async () => {
    createSplash();
    let decision;
    try {
      decision = await runUpdateGate();
    } catch (e) {
      decision = { action: "proceed", installed: app.getVersion(), required: app.getVersion() };
    }
    if (decision && decision.action === "proceed") {
      createMainWindow();
    } else {
      try {
        if (splash && !splash.isDestroyed()) splash.close();
      } catch (_) {}
      createGateWindow(decision);
    }
  });
}

app.on("browser-window-created", (_, window) => {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") event.preventDefault();
    if (input.control && input.shift && String(input.key).toUpperCase() === "I")
      event.preventDefault();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
