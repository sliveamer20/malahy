// main.js — العملية الرئيسية لتطبيق "مدينة الألعاب في فتح الله"
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
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
    title: "مدينة الألعاب في فتح الله",
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
      mainWindow.show();
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

/* ============ دورة حياة التطبيق ============ */
app.whenReady().then(() => {
  createSplash();
  createMainWindow();
});

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
