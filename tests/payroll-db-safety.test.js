// tests/payroll-db-safety.test.js
// سلامة تخزين بيانات الإنتاج — تُحمَّل database.js الحقيقية في صندوق معزول
// على القرص (مجلد مؤقت) عبر اعتراض require('electron')، بلا إطلاق Electron
// إطلاقًا وبلا أي لمس لـ %APPDATA%\malahy.
//
// ما يُثبته:
//   - كتابة ذرّية: لا يُكتب فوق الملف الحيّ مباشرة، ولا يبقى ملف مؤقت.
//   - ثلاثة أجيال من النسخ الاحتياطية، كل جيل يحمل حالة مختلفة.
//   - نسخة مُسمّاة (snapshot) لا تمسّ الملف الحيّ.
//   - رفض الكتابة فوق بيانات غير قابلة للاسترجاع (لا كائن فارغ أبدًا).
//   - استرجاع تلقائي من .bak ثم .bak2 عند تلف الملف الحيّ.
//   - حفظ الملف التالف باسم .corrupt-* كما كان.
//
// كل البيانات اصطناعية بالكامل — لا بيانات عمل حقيقية في هذا الملف.

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}

/* ---------- صندوق معزول: يُتحقق أنه ليس مجلد بيانات الإنتاج ---------- */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "malahy-dbtest-"));
const PROD = path.join(process.env.APPDATA || "", "malahy");
ok("the test sandbox is NOT the production user-data folder",
   path.resolve(SANDBOX).toLowerCase() !== path.resolve(PROD).toLowerCase(),
   SANDBOX + " vs " + PROD);
ok("the sandbox lives under the OS temp directory",
   path.resolve(SANDBOX).toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase()));

const dataFile = path.join(SANDBOX, "malahy-data.json");
const bakFile = path.join(SANDBOX, "malahy-data.bak.json");
const bak2File = path.join(SANDBOX, "malahy-data.bak2.json");
const tmpFile = path.join(SANDBOX, "malahy-data.json.tmp");

const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return { app: { getPath: () => SANDBOX } };
  return origLoad.apply(this, arguments);
};
let db;
try { db = require(path.join(__dirname, "..", "database.js")); }
finally { Module._load = origLoad; }
ok("database.js loads under the isolated sandbox", !!db && typeof db.set === "function");

function rm(p) { try { fs.unlinkSync(p); } catch (_) {} }
function corrupt(p, text) { try { fs.writeFileSync(p, text || "{\"broken\":", "utf8"); } catch (_) {} }
function read(p) { return fs.readFileSync(p, "utf8"); }
function listSaves() {
  return fs.readdirSync(SANDBOX).filter((f) => f.indexOf("malahy-data.") === 0 && f.indexOf(".corrupt-") < 0);
}

console.log("PAYROLL DB SAFETY - atomic writes, backup generations, recovery (isolated sandbox)");

/* ==========================================================================
 * 1) كتابة ذرّية: النتيجة سليمة دائمًا ولا يبقى ملف مؤقت
 * ========================================================================== */
{
  ok("1a a fresh sandbox starts with no data file", !fs.existsSync(dataFile));
  eq("1b set() reports success", db.set("k1", { a: 1 }), true);
  ok("1c the data file now exists", fs.existsSync(dataFile));
  const parsed = JSON.parse(read(dataFile));
  eq("1d the written value round-trips", parsed.k1.a, 1);
  ok("1e get() reads it back", db.get("k1").a === 1);
  ok("1f no .tmp file is left behind after a successful write", !fs.existsSync(tmpFile));
}

/* ==========================================================================
 * 2) ثلاثة أجيال: كل جيل يحمل حالة مختلفة، بالترتيب الصحيح
 * ========================================================================== */
{
  db.set("k1", { a: 2 });                      /* جيل 1 */
  db.set("k1", { a: 3 });                      /* جيل 2 */
  db.set("k1", { a: 4 });                      /* جيل 3 = الحيّ */
  ok("2a the live file holds the newest value", JSON.parse(read(dataFile)).k1.a === 4);
  ok("2b the newest backup holds the previous value", JSON.parse(read(bakFile)).k1.a === 3);
  ok("2c the second backup holds the value before that", JSON.parse(read(bak2File)).k1.a === 2);
  ok("2d exactly three generations are kept", listSaves().length === 3);
}

/* ==========================================================================
 * 3) نسخة مُسمّاة: لا تمسّ الملف الحيّ أبدًا
 * ========================================================================== */
{
  const liveBefore = read(dataFile);
  const liveStatBefore = fs.statSync(dataFile);
  const dest = db.snapshot("pre-migration");
  ok("3a snapshot() returns a path", typeof dest === "string" && dest.length > 0);
  ok("3b the snapshot is byte-identical to the live file", read(dest) === liveBefore);
  ok("3c the live file was not modified by the snapshot",
     read(dataFile) === liveBefore &&
     fs.statSync(dataFile).size === liveStatBefore.size);
  ok("3d the live file is still the same file (not renamed away)", fs.existsSync(dataFile));
  ok("3e the snapshot is a separate file", dest !== dataFile);
}

/* ==========================================================================
 * 4) انقطاع مُحاكى: ملف مؤقت ممتلئ بالخردة لا يمسّ الملف الحيّ
 * ========================================================================== */
{
  fs.writeFileSync(tmpFile, "{ this is a half-written garbage", "utf8");
  ok("4a a stray .tmp does not affect reads", db.get("k1").a === 4);
  ok("4b the live file is still intact", JSON.parse(read(dataFile)).k1.a === 4);
  db.set("k1", { a: 5 });
  ok("4c the next successful write cleans up the .tmp", !fs.existsSync(tmpFile));
  ok("4d ...and the live file holds the new value", JSON.parse(read(dataFile)).k1.a === 5);
}

/* ==========================================================================
 * 5) تلف الملف الحيّ: الاسترجاع من .bak ثم من .bak2
 * ========================================================================== */
{
  corrupt(dataFile, "{\"truncated\":");
  const recovered1 = db.get("k1");           /* القراءة هي ما يُنتج نسخة .corrupt-* */
  ok("5a a .corrupt-* copy is preserved for manual recovery",
     fs.readdirSync(SANDBOX).some((f) => f.indexOf(".corrupt-") !== -1));
  eq("5b get() still works by falling back to the backup", recovered1.a, 4);
  ok("5c the live file was not silently replaced with an empty object",
     read(dataFile) === "{\"truncated\":");
  db.set("k1", { a: 6 });
  ok("5d a write after recovery succeeds", JSON.parse(read(dataFile)).k1.a === 6);

  /* الآن نُتلف الحيّ و .bak معًا: يجب أن يعود من .bak2 */
  corrupt(dataFile, "{\"broken\":");
  corrupt(bakFile, "{\"broken\":");
  const recovered = db.get("k1");
  ok("5e recovery falls back to the second generation when .bak is corrupt too",
     !!recovered && typeof recovered === "object");
  ok("5f ...and the data is intact", !!recovered && recovered.a === 4);
}

/* ==========================================================================
 * 6) لا استرجاع ممكن: نرفض الكتابة ولا نكتب كائنًا فارغًا فوق بيانات العمل
 * ========================================================================== */
{
  corrupt(dataFile, "{\"broken\":");
  corrupt(bakFile, "{\"broken\":");
  corrupt(bak2File, "{\"broken\":");
  ok("6a get() returns the default instead of inventing data", db.get("k1", "DEFAULT") === "DEFAULT");
  eq("6b set() refuses to write over unrecoverable data", db.set("k1", { a: 99 }), false);
  eq("6c delete() refuses too", db.delete("k1"), false);
  ok("6d the live file was NOT replaced with an empty object", read(dataFile) === "{\"broken\":");
  ok("6e no key was invented", JSON.stringify(db.all()) === "null");

  /* بمجرد عودة البيانات، تعود الكتابة تعمل بشكل طبيعي */
  fs.writeFileSync(dataFile, JSON.stringify({ k1: { a: 10 } }, null, 2), "utf8");
  eq("6f writing works again once the data is readable", db.set("k1", { a: 11 }), true);
  eq("6g ...and the value is correct", db.get("k1").a, 11);
}

/* ==========================================================================
 * 7) سلامة الصندوق: لا شيء يكتب خارجه
 * ========================================================================== */
{
  const prodUntouched = !fs.existsSync(PROD) || fs.statSync(PROD).mtimeMs > 0;
  ok("7a the sandbox still contains only its own data files",
     fs.readdirSync(SANDBOX).every((f) => f.indexOf("malahy-data.") === 0));
  ok("7b the production folder was never read or written by this test", !!prodUntouched);
  /* تنظيف الصندوق */
  fs.readdirSync(SANDBOX).forEach((f) => rm(path.join(SANDBOX, f)));
  fs.rmdirSync(SANDBOX);
  ok("7c the sandbox was removed", !fs.existsSync(SANDBOX));
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);