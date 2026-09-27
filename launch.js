// launch.js — مشغّل التطوير: يطلق Electron دون أن يترك نافذة كونسول (cmd) مفتوحة.
//
// السبب: على ويندوز «npm start» بيشتغل عبر npm.cmd → cmd.exe + conhost.exe،
// ولأن electron.exe بيكون عملية ابنة لهم، نافذة الكونسول دي بتفضل مفتوحة قدام
// المستخدم طول ما البرنامج شغال. الحل: نطلق Electron كعملية منفصلة تمامًا
// (detached) وبدون كونسول (windowsHide = CREATE_NO_WINDOW)، ثم نخرج فورًا
// فتنغلق سلسلة npm/cmd كلها ويبقى واجهة التطبيق فقط.
//
// ملاحظة: التطبيق المعبّأ (النسخة المثبّتة) GUI-subsystem أصلاً ولا يُظهر
// أي كونسول — هذا الملف مخصص لوضع التطوير فقط.
const { spawn } = require("child_process");
const path = require("path");

let electronPath;
try {
  electronPath = require("electron");
} catch (e) {
  console.error("تعذّر العثور على electron — تأكد من تشغيل npm install أولاً.");
  process.exit(1);
}

try {
  const child = spawn(electronPath, [path.resolve(__dirname)], {
    stdio: "ignore",
    detached: true,
    windowsHide: true, // CREATE_NO_WINDOW — يمنع ظهور أي كونسول جديد
  });
  child.unref(); // لا ننتظر انتهاءه — العملية تعيش مستقلة
} catch (e) {
  console.error("تعذّر تشغيل التطبيق:", e && e.message ? e.message : e);
  process.exit(1);
}
