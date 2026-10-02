// main.js — العملية الرئيسية لتطبيق "كوكي بارك"
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const db = require("./database");
const PERMLIB = require("./permissions");
const users = require("./users")(db);

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
/* حماية المفاتيح الحساسة (المرحلة 3C-2): العملية الرئيسية هي السلطة النهائية.
   لا يكفي أن تطلب الواجهة كتابة/حذف مفتاح حساس — يجب أن تكون هناك جلسة
   مُصادَق عليها (في العملية الرئيسية نفسها) بالصلاحية المناسبة. هذا هو
   الحدّ الفاصل الأخير؛ فحوص الواجهة مجرد طبقة UX. المفاتيح غير الحساسة
   تعمل تمامًا كما في v2.5.1 (لا تتأثر). */
const _MISS = {}; /* قيمة حرس لا يمكن أن تكون قيمة مخزّنة فعلية */
ipcMain.on("db-get", (e, { key, def }) => {
  try {
    e.returnValue = db.get(key, def === undefined ? null : def);
  } catch (err) {
    e.returnValue = def === undefined ? null : def;
  }
});
ipcMain.on("db-set", (e, { key, value }) => {
  try {
    let exists = true;
    try { exists = db.get(key, _MISS) !== _MISS; } catch (_) {}
    if (!PERMLIB.authorizeDbOp("write", key, users.getSession(), exists)) {
      appendLog("db-set :: رفض كتابة مفتاح محمي بدون صلاحية: " + String(key));
      e.returnValue = false; return;
    }
    db.set(key, value); e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.on("db-delete", (e, { key }) => {
  try {
    if (!PERMLIB.authorizeDbOp("delete", key, users.getSession(), true)) {
      appendLog("db-delete :: رفض حذف مفتاح محمي بدون صلاحية: " + String(key));
      e.returnValue = false; return;
    }
    db.delete(key); e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.on("db-clear", (e) => {
  /* المسح الشامل يدمّر كل المفاتيح الحساسة (بما فيها حسابات المستخدمين)
     → يتطلّب جلسة أدمن مُصادَق عليها في العملية الرئيسية. */
  try {
    const sess = users.getSession();
    if (!sess || sess.role !== "admin") {
      appendLog("db-clear :: رفض: المسح الشامل يتطلّب جلسة أدمن");
      e.returnValue = false; return;
    }
    db.clear(); e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.on("app-version", (e) => { e.returnValue = app.getVersion(); });
ipcMain.on("db-file", (e) => {
  try { e.returnValue = db.file(); } catch (err) { e.returnValue = ""; }
});

/* ============ IPC: المصادقة والصلاحيات (users.js) ============ */
/* كل قرارات المصادقة تتم هنا في العملية الرئيسية. الواجهة تستلم نتائج
   منطقية فقط (نعم/لا + كائن مستخدم منظّف) ولا ترى أي أسرار أبدًا. */
ipcMain.handle("auth:login", async (_e, args) => {
  try { return await users.login(args || {}); }
  catch (err) { appendLog("auth:login :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:changePass", async (_e, args) => {
  try {
    const a = (args && typeof args === "object") ? args : {};
    const sess = users.getSession();
    /* كل مستخدم يغيّر كلمة سره الخاصة فقط (مع كلمة السر الحالية). الأدمن وحده
       يستطيع تغيير كلمة سر حساب آخر. هذا يمنع الكاشير من لمس حساب المدير حتى
       لو عرف كلمة سره. */
    if (sess && sess.role !== "admin" && String(a.userId || "") !== String(sess.userId || "")) {
      appendLog("auth:changePass :: رفض تغيير كلمة سر حساب آخر");
      return { ok: false, error: "forbidden" };
    }
    return await users.changePass(a);
  }
  catch (err) { appendLog("auth:changePass :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:resetCashier", async (_e, args) => {
  try { return await users.resetCashier(args || {}); }
  catch (err) { appendLog("auth:resetCashier :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:hasPerm", (_e, args) => {
  try { return users.hasPerm(args || {}); } catch (_) { return false; }
});
/* تعديل صلاحيات الكاشير (للأدمن فقط) — القرار في العملية الرئيسية.
    تُستخدم لاحقًا في واجهة إدارة الصلاحيات؛ هذه المرحلة توفّر الآلية الآمنة. */
ipcMain.handle("auth:setCashierPerms", async (_e, args) => {
  try { return users.setCashierPermissions(args || {}); }
  catch (err) { appendLog("auth:setCashierPerms :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* الاستعلام عن الصلاحيات الكاملة لكاشير (للأدمن فقط). */
ipcMain.handle("auth:getCashierPerms", async (_e, args) => {
  try { return users.getCashierPermissions(args || {}); }
  catch (err) { appendLog("auth:getCashierPerms :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* إنشاء حساب كاشير (للأدمن فقط) — createCashier دالة مكتبية لا تتحقق من الجلسة
   بنفسها، لذا الحدّ الفاصل بين الواجهة والعملية الرئيسية هو هنا. */
ipcMain.handle("auth:createCashier", async (_e, args) => {
  const sess = users.getSession();
  if (!sess || sess.role !== "admin") {
    appendLog("auth:createCashier :: رفض: إنشاء الكاشير يتطلّب جلسة أدمن");
    return { ok: false, error: "forbidden" };
  }
  try { return await users.createCashier(args || {}); }
  catch (err) { appendLog("auth:createCashier :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* قائمة حسابات الكاشير (للأدمن فقط) — بيانات منظّفة بدون أي أسرار. */
ipcMain.handle("auth:listCashiers", async () => {
  const sess = users.getSession();
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  try { return { ok: true, cashiers: users.listCashiers() }; }
  catch (err) { appendLog("auth:listCashiers :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* تفعيل/تعطيل حساب كاشير (للأدمن فقط) — القرار في العملية الرئيسية. */
ipcMain.handle("auth:setCashierActive", async (_e, args) => {
  try { return users.setCashierActive(args || {}); }
  catch (err) { appendLog("auth:setCashierActive :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* تغيير اسم مستخدم الكاشير (للأدمن فقط) — القرار في العملية الرئيسية. */
ipcMain.handle("auth:setCashierUsername", async (_e, args) => {
  try { return users.setCashierUsername(args || {}); }
  catch (err) { appendLog("auth:setCashierUsername :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* بيانات حساب المدير (للأدمن فقط) — بدون أي أسرار. */
ipcMain.handle("auth:getAdminInfo", async () => {
  try { return users.getAdminInfo(); }
  catch (err) { appendLog("auth:getAdminInfo :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* ضبط رقم واتساب الاستعادة (للمدير فقط) — رقم الاستعادة يُستخدم لاستعادة
    كلمة سر حساب المدير من شاشة الدخول (مسار «نسيت كلمة المرور»). */
ipcMain.handle("auth:setRecoveryWhatsapp", async (_e, args) => {
  try { return users.setRecoveryWhatsapp(args || {}); }
  catch (err) { appendLog("auth:setRecoveryWhatsapp :: " + String(err)); return { ok: false, error: "auth-failed" }; }
});
/* بدء استعادة كلمة سر المدير (متاح قبل تسجيل الدخول بالتصميم — هذا غرضه).
    يتحقق من رقم الاستعادة ويولّد رمزًا آمنًا. لا تُسجَّل أي أسرار أبدًا:
    الرمز لا يوضع في السجل، ولا في رسالة الخطأ، ولا في أي مكان دائم. */
ipcMain.handle("auth:beginRecovery", async (_e, args) => {
  try { return await users.beginRecovery(args || {}); }
  catch (err) { appendLog("auth:beginRecovery :: " + String(err)); return { ok: false, error: "recovery-failed" }; }
});
/* إكمال الاستعادة: التحقق من الرمز واستبدال كلمة سر المدير. متاح قبل
    تسجيل الدخول بالتصميم — السلطة هنا هي معرفة الرمز الذي وصل حصرًا إلى
    رقم واتساب الاستعادة المضبوط. كلمة السر القديمة غير مطلوبة. */
ipcMain.handle("auth:completeRecovery", async (_e, args) => {
  try { return await users.completeRecovery(args || {}); }
  catch (err) { appendLog("auth:completeRecovery :: " + String(err)); return { ok: false, error: "recovery-failed" }; }
});
/* إنهاء الجلسة (تسجيل الخروج): يمسح جلسة العملية الرئيسية فقط — لا يمسح
   أي بيانات ولا إعدادات. الواجهة هي من تعيد عرض شاشة الدخول. */
ipcMain.handle("auth:logout", async () => {
  try { users.logout(); return { ok: true }; }
  catch (err) { appendLog("auth:logout :: " + String(err)); return { ok: false, error: "auth-failed" }; }
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
      options: p.options || null,   /* معلومات الورق/الحجم إن وُجدت من الويندوز */
    }));
  } catch (e) {
    return [];
  }
});
/* أسماء الطابعات المثبّتة في الويندوز (للتحقق من الطابعة المختارة قبل الطباعة).
   تُرجع null لو تعذّر سرد الطابعات، وحينها نكتفي بالاسم المطلوب كما هو. */
async function installedPrinterNames() {
  try {
    const wc = mainWindow && mainWindow.webContents;
    if (!wc) return null;
    const list = await wc.getPrintersAsync();
    return (list || []).map((p) => (p && p.name) || "");
  } catch (e) {
    return null;
  }
}

ipcMain.handle("print-ticket", async (_e, opts) => {
  opts = opts || {};
  let win = null;
  try {
    /* 1) التحقق من الطابعة المختارة: لو الاسم محفوظ لكنه غير موجود بين طابعات
          الويندوز (طابعة غير موصّلة أو أُزيلت) نُرجع سببًا واضحًا للواجهة بدل
          رسالة "تعذّرت الطباعة" المبهمة. لو تعذّر السرد نكمل بالاسم كما هو. */
    const printerName = typeof opts.printerName === "string" ? opts.printerName : "";
    if (printerName) {
      const installed = await installedPrinterNames();
      if (installed && installed.indexOf(printerName) === -1) {
        appendLog("print-ticket: الطابعة المختارة غير مثبّتة: " + printerName);
        return { ok: false, reason: "printer-not-found", available: installed };
      }
    }

    win = new BrowserWindow({
      show: false,
      width: opts.paper === "a4" ? 900 : 420,
      height: 700,
      webPreferences: { contextIsolation: true, javascript: false },
    });
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(opts.html || "")
    );
    await new Promise((r) => setTimeout(r, 250));

    /* 2) خيارات الطباعة — يجب أن يكون حجم الورق صالحًا دائمًا. حسب عقد إلكترون:
          لو لم نُمرّر pageSize ولم نفعّل usePrinterDefaultPageSize (افتراضه false)
          يُرمى خطأ "Invalid printer settings" وتفشل الطباعة على الطابعات العادية.
          - الورق العادي A4: حجم صريح A4، مع هوامش الطابعة الافتراضية (الهوامش
            الصفرية المخصّصة قد تجعل المساحة القابلة للطباعة فارغة على بعض المحركات).
          - الرول الحراري 58/80مم: الطابعة تستخدم حجم رولها الافتراضي (وإلكترون
          يتحوّل احتياطيًا إلى A4 لو لم يُبلّغ المحرك عن حجم افتراضي).
          ملاحظة: لا يجوز الجمع بين pageSize و usePrinterDefaultPageSize. */
    const printOpts = {
      silent: opts.silent !== false,
      printBackground: true,
      margins: { marginType: opts.paper === "a4" ? "default" : "none" },
    };
    if (printerName) printOpts.deviceName = printerName;
    if (opts.paper === "a4") {
      printOpts.pageSize = "A4";
    } else {
      printOpts.usePrinterDefaultPageSize = true;
    }

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
    if (!result.success) {
      appendLog("print-ticket: فشلت الطباعة: " + (result.failureReason || "unknown") +
        " | printer=" + printerName + " paper=" + opts.paper);
    }
    return { ok: !!result.success, reason: result.failureReason || "" };
  } catch (err) {
    try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
    appendLog("print-ticket: استثناء: " + String(err));
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
    /* تهيئة مستودع المستخدمين وترحيل كلمة سر الأدمن (إضافي، idempotent، ولا يوقف
       الإقلاع أبدًا إذا تعذّر). */
    try { await users.initUsers(); }
    catch (e) { appendLog("users.initUsers :: " + String(e)); }
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
