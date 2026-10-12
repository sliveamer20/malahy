// database.js — تخزين كل بيانات البرنامج في ملف واحد على الجهاز باستخدام fs
// (بدون electron-store وبدون أي مكتبة خارجية — أضمن وأبسط ولا يتأثر بمسح المتصفح).
// مكان الملف: مجلد بيانات المستخدم الخاص بالبرنامج (userData) واسمه malahy-data.json
// مثال على ويندوز:  C:\Users\<الاسم>\AppData\Roaming\<اسم البرنامج>\malahy-data.json
// الملف بيفضل موجود بعد تحديث البرنامج ولا يمسحه تنظيف المتصفح إطلاقًا.
//
// ============ سلامة التخزين ============
// 1) كتابة ذرّية: نكتب في ملف مؤقت ثم نعيد تسميته فوق الملف الحيّ.
//    إعادة التسمية على نفس القرص ذرّية، فالملف الحيّ إما يبقى كاملًا أو لم يُمَس.
//    انقطاع الكهرباء أو انهيار البرنامج أثناء الكتابة لا يُتلف بيانات الإنتاج.
// 2) ثلاثة أجيال من النسخ: .bak و .bak2 بدل جيل واحد. جيل واحد كان غير كافٍ:
//    لو كان التلف قد أصاب الجيلين معًا فلا يبقى شيء للاسترجاع.
// 3) لا نكتب فوق بيانات غير قابلة للاسترجاع: إذا تلف الملف الحيّ وتلفت النسخ
//    كلها، يُعاد null بدل {}. كان { } يعني أن أول حفظ لاحق يمسح كل بيانات العمل.

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

function dataFile() {
  return path.join(app.getPath("userData"), "malahy-data.json");
}
function backupFile() {
  return path.join(app.getPath("userData"), "malahy-data.bak.json");
}
function backup2File() {
  return path.join(app.getPath("userData"), "malahy-data.bak2.json");
}
function tmpFile() {
  return path.join(app.getPath("userData"), "malahy-data.json.tmp");
}

// قراءة كل البيانات ككائن واحد — أو null إذا تعذّر الاسترجاع نهائيًا
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
    // محاولة استرجاع من النسخة الاحتياطية (الأحدث فالأقدم)
    for (const bak of [backupFile(), backup2File()]) {
      try {
        if (fs.existsSync(bak)) {
          const raw = fs.readFileSync(bak, "utf8");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
          }
        }
      } catch (_) {}
    }
    // لا يوجد ما يمكن الاسترجاع منه: نُبلغ الرمي(boolean) لا بيانات فارغة.
    // يُرجع null => ترفض كل عمليات الكتابة فلا تُمحى بيانات العمل.
    return null;
  }
}

// كتابة كل البيانات: تدوير ثلاثة أجيال + كتابة ذرّية
function writeAll(obj) {
  const dir = app.getPath("userData");
  const file = dataFile();
  const bak = backupFile();
  const bak2 = backup2File();
  const tmp = tmpFile();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) {
      // تدوير الأجيال: .bak2 الأقدم يُحذف، ثم .bak ← .bak2، ثم الملف ← .bak
      try {
        if (fs.existsSync(bak2)) fs.unlinkSync(bak2);
        if (fs.existsSync(bak)) fs.copyFileSync(bak, bak2);
        fs.copyFileSync(file, bak);
      } catch (_) {}
    }
    // كتابة ذرّية: ملف مؤقت ثم إعادة تسمية فوق الملف الحيّ
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    return false;
  }
}

// نسخة مُسمّاة مؤرّخة للبيانات الحيّة (لا تمسّ الملف الحيّ إطلاقًا) — تُستخدم
// كمرجع رجوع قبل أي عملية حساسة مثل ترحيل بيانات الرواتب.
function snapshot(tag) {
  const file = dataFile();
  const stamp = Date.now();
  const safeTag = String(tag || "snapshot").replace(/[^a-zA-Z0-9._-]/g, "");
  const dest = path.join(app.getPath("userData"), `malahy-data.${safeTag}-${stamp}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    fs.copyFileSync(file, dest);
    return dest;
  } catch (e) {
    return null;
  }
}

module.exports = {
  get(key, defaultValue = null) {
    const d = readAll();
    if (!d) return defaultValue;
    return key in d ? d[key] : defaultValue;
  },
  set(key, value) {
    const d = readAll();
    if (!d) return false; // بيانات غير قابلة للاسترجاع: لا نكتب فوقها
    d[key] = value;
    return writeAll(d);
  },
  delete(key) {
    const d = readAll();
    if (!d) return false;
    delete d[key];
    return writeAll(d);
  },
  has(key) {
    const d = readAll();
    return !!d && key in d;
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
  // نسخة مُسمّاة مؤرّخة من الملف الحيّ (لا تمسّه) — نقطة رجوع مُتحقَّق منها
  snapshot(tag) {
    return snapshot(tag);
  },
};
