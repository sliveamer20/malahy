// database.js — تخزين كل بيانات البرنامج في ملف واحد على الجهاز باستخدام fs
// (بدون electron-store وبدون أي مكتبة خارجية — أضمن وأبسط ولا يتأثر بمسح المتصفح).
// مكان الملف: مجلد بيانات المستخدم الخاص بالبرنامج (userData) واسمه malahy-data.json
// مثال على ويندوز:  C:\Users\<الاسم>\AppData\Roaming\<اسم البرنامج>\malahy-data.json
// الملف بيفضل موجود بعد تحديث البرنامج ولا يمسحه تنظيف المتصفح إطلاقًا.

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

function dataFile() {
  return path.join(app.getPath("userData"), "malahy-data.json");
}
function backupFile() {
  return path.join(app.getPath("userData"), "malahy-data.bak.json");
}

// قراءة كل البيانات ككائن واحد
function readAll() {
  const file = dataFile();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    // لو الملف اتخرب لأي سبب: نحفظ نسخة منه ونكمل ببيانات فاضية بدل ما البرنامج يقف
    try {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, file + ".corrupt-" + Date.now() + ".json");
      }
    } catch (_) {}
    // محاولة استرجاع من النسخة الاحتياطية
    try {
      const bak = backupFile();
      if (fs.existsSync(bak)) {
        const raw = fs.readFileSync(bak, "utf8");
        return raw ? JSON.parse(raw) : {};
      }
    } catch (_) {}
    return {};
  }
}

// كتابة كل البيانات (مع الاحتفاظ بنسخة احتياطية للملف السابق)
function writeAll(obj) {
  const dir = app.getPath("userData");
  const file = dataFile();
  const bak = backupFile();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, bak); } catch (_) {}
    }
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  get(key, defaultValue = null) {
    const d = readAll();
    return key in d ? d[key] : defaultValue;
  },
  set(key, value) {
    const d = readAll();
    d[key] = value;
    return writeAll(d);
  },
  delete(key) {
    const d = readAll();
    delete d[key];
    return writeAll(d);
  },
  has(key) {
    return key in readAll();
  },
  clear() {
    return writeAll({});
  },
  // مسار ملف البيانات (لعرضه للمستخدم أو لعمل نسخة احتياطية يدوية)
  file() {
    return dataFile();
  },
  // كل البيانات دفعة واحدة (مفيد للنسخ الاحتياطي/الاستعادة مستقبلاً)
  all() {
    return readAll();
  },
  replaceAll(obj) {
    return writeAll(obj || {});
  },
};
