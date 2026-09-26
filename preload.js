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

// سجل الأخطاء على الجهاز (يساعد في تشخيص أي مشكلة في نسخة الإنتاج)
contextBridge.exposeInMainWorld("malahyLog", {
  error: (msg) => { try { return ipcRenderer.sendSync("log-error", String(msg)); } catch (e) { return false; } },
  file: () => { try { return ipcRenderer.sendSync("log-file"); } catch (e) { return ""; } },
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

// طباعة التذاكر (قائمة الطابعات + إرسال إيصال للطباعة)
contextBridge.exposeInMainWorld("malahyPrint", {
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printTicket: (opts) => ipcRenderer.invoke("print-ticket", opts),
});

// فتح روابط خارجية (يُستخدم لفتح واتساب عبر التطبيق الافتراضي للمتصفح)
contextBridge.exposeInMainWorld("malahyShell", {
  openExternal: (url) => { try { ipcRenderer.send("open-external", String(url || "")); } catch (_) {} },
});

// بوابة التحديث الإجباري (النافذة المقفولة قبل الواجهة الرئيسية)
// ملاحظة: لا يوجد أي دالة "skip"/"later"/"close" — البرنامج لا يُقفل إلا
// بعد التحديث، ولا يمكن تجاوز البوابة بأي زر أو اختصار.
contextBridge.exposeInMainWorld("malahyGate", {
  // الحالة الأولية للبوابة (install/required/latest/reason)
  init: () => { try { return ipcRenderer.sendSync("gate-init"); } catch (e) { return null; } },
  // الاستماع لتحديثات الحالة (تنزيل/تثبيت/خطأ)
  onStatus: (cb) => {
    try { ipcRenderer.on("gate-status", (_e, data) => { try { cb(data); } catch (_) {} }); } catch (e) {}
  },
  // إعادة محاولة فحص/تنزيل التحديث
  retry: () => { try { ipcRenderer.send("gate-retry"); } catch (e) {} },
  // إعادة تشغيل البرنامج بعد اكتمال التحديث (quitAndInstall)
  restart: () => { try { ipcRenderer.send("gate-restart"); } catch (e) {} },
});
