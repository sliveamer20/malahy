// preload.js — جسر آمن بين الواجهة (index.html) والعملية الرئيسية (main.js)
// يمنع الوصول المباشر لـ Node من الواجهة، ويعرّض فقط دوال محددة.
const { contextBridge, ipcRenderer } = require("electron");

// تخزين البيانات في ملف JSON على الجهاز (متزامن لسهولة الاستخدام)
contextBridge.exposeInMainWorld("malahyDB", {
  get: (key, def = null) => ipcRenderer.sendSync("db-get", { key, def }),
  set: (key, value) => ipcRenderer.sendSync("db-set", { key, value }),
  delete: (key) => ipcRenderer.sendSync("db-delete", { key }),
  clear: () => ipcRenderer.sendSync("db-clear"),
  file: () => ipcRenderer.sendSync("db-file"),
});

// معلومات التطبيق + التحديثات التلقائية
contextBridge.exposeInMainWorld("malahyApp", {
  version: () => ipcRenderer.sendSync("app-version"),
  onUpdate: (cb) =>
    ipcRenderer.on("update-status", (_e, data) => {
      try { cb(data); } catch (_) {}
    }),
  checkForUpdates: () => ipcRenderer.send("updater-check"),
  installUpdate: () => ipcRenderer.send("updater-install"),
});

// تصدير التقارير (PDF / Excel)
contextBridge.exposeInMainWorld("malahyExport", {
  savePDF: (opts) => ipcRenderer.invoke("export-pdf", opts),
  saveCSV: (opts) => ipcRenderer.invoke("export-csv", opts),
});
