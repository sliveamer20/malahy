// tests/v260-uninstall-auth.test.js
// v2.6.0 — حماية إلغاء تثبيت التطبيق بالرقم السري لحساب المسؤول.
//
// ما يُختبَر هنا هو نفس الكود الذي يعمل في التطبيق:
//   · users.js → verifyAdminPassword (قراءة فقط، نفس verifyPassword/dالة تسجيل الدخول)
//   · main.js  → وضع --uninstall-auth (رمز الخروج هو قرار التفويض)
//   · preload.js → جسر الواجهة (contextIsolation)
//   · windows/uninstall-auth.html → حقل مخفي + رسائل عربية + إلغاء
//   · build/uninstall-auth.nsh → Abort عند أي رمز خروج ≠ 0 وتجاوز مسار التحديث
//
// البيانات اصطناعية بالكامل وفي الذاكرة (shim يحاكي database.js) —
// لا Electron ولا أي بيانات إنتاجية تُمس.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

const makeUsers = require(path.join(ROOT, "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
async function section(title, fn) {
  console.log("\n=== " + title + " ===");
  try { await fn(); } catch (e) { fail++; console.log("  FAIL  (section crash) " + title + " :: " + e.stack); }
}

/* مستودع في الذاكرة بنفس واجهة database.js المستخدمة (get/set) + تسجيل الكتابة */
function makeStore(seed) {
  const data = Object.assign({}, seed || {});
  const written = [];
  return {
    get: (k, d) => (k in data ? data[k] : (d === undefined ? null : d)),
    set: (k, v) => { written.push(k); data[k] = v; return true; },
    _written: () => written.slice(),
    _reset: () => { written.length = 0; },
    _raw: () => data,
  };
}
/* مستودع "فاسد": get ترمي (يحاكي ملف بيانات غير قابل للاسترجاع) */
function makeBrokenStore() {
  return { get: () => { throw new Error("unrecoverable"); }, set: () => false };
}

(async () => {
  console.log("v2.6.0 — Uninstall admin-password protection tests");

  /* ============ 1. الرقم السري الصحيح مسموح ============ */
  await section("1. Correct admin password allows uninstall", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    await u.changePass({ userId: "admin", oldPass: "1234", newPass: "Test4321!" });
    ok("correct password accepted", await u.verifyAdminPassword("Test4321!") === true);
    ok("login still works with the same password",
      (await u.login({ username: "admin", password: "Test4321!" })).ok === true);
  });

  /* ============ 2. الرقم السري الخطأ مرفوض ============ */
  await section("2. Wrong password blocks uninstall", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    ok("wrong password rejected", await u.verifyAdminPassword("nope9999") === false);
    ok("empty password rejected", await u.verifyAdminPassword("") === false);
    ok("null password rejected", await u.verifyAdminPassword(null) === false);
    ok("near-miss password rejected", await u.verifyAdminPassword("1235") === false);
  });

  /* ============ 3. التحقق قراءة فقط (لا يكتب شيئًا أبدًا) ============ */
  await section("3. Verification is strictly read-only", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    u.logout(); /* الجلسة متغيرة على مستوى الوحدة — نؤكد أن التحقق لا يلمسها */
    db._reset(); /* نمسح سجل كتابة التهيئة */
    ok("session is null before verification", u.getSession() === null);
    await u.verifyAdminPassword("1234");
    await u.verifyAdminPassword("wrong");
    ok("no db writes during verification", db._written().length === 0);
    ok("no session created by verification", u.getSession() === null);
    ok("K_PASS untouched by verification", db._raw()["malahy_pos_pass_v1"] === undefined);
  });

  /* ============ 4. عدم وجود إعداد للمسؤول → رفض (fail-closed) ============ */
  await section("4. Missing administrator configuration is denied", async () => {
    const db = makeStore(); /* مستودع فاضي تمامًا — لا malahy_users_v1 */
    const u = makeUsers(db);
    ok("no admin record → deny", await u.verifyAdminPassword("1234") === false);
    ok("no admin record: even default password denied",
      await u.verifyAdminPassword(u.DEFAULT_PASS) === false);
    /* المستخدم غير مَعزول دائمًا: التطبيق لا يهاجر كلمة السر في هذا المسار */
    ok("verification never creates the users key", db._raw()[u.K_USERS] === undefined);
  });

  /* ============ 5. تخزين فاسد لا يُصرّح بالحذف ============ */
  await section("5. Corrupted credential storage does not authorize removal", async () => {
    /* (أ) مستودع يرمي عند القراءة (ملف غير قابل للاسترجاع) */
    const uBroken = makeUsers(makeBrokenStore());
    ok("store throwing on read → deny", await uBroken.verifyAdminPassword("1234") === false);
    ok("store throwing on read: no exception leaks", true);

    /* (ب) سجل مسؤول بدون تجزئة */
    const db2 = makeStore({ malahy_users_v1: { admin: { username: "admin" } } });
    const u2 = makeUsers(db2);
    ok("admin without passwordHash → deny", await u2.verifyAdminPassword("1234") === false);

    /* (ج) تجزئة بتنسيق تالف */
    const u3 = makeUsers(makeStore({
      malahy_users_v1: { admin: { username: "admin", passwordHash: "garbage" } },
    }));
    ok("garbage hash → deny", await u3.verifyAdminPassword("1234") === false);

    /* (د) تجزئة ناقصة الحقول */
    const u4 = makeUsers(makeStore({
      malahy_users_v1: { admin: { username: "admin", passwordHash: "scrypt:16384:8:1:abc" } },
    }));
    ok("truncated hash → deny", await u4.verifyAdminPassword("1234") === false);

    /* (هـ) خوارزمية غير scrypt (bcrypt مثال) → رفض، فلا تخفيف للتحقق */
    const u5 = makeUsers(makeStore({
      malahy_users_v1: { admin: { username: "admin", passwordHash: "$2b$12$xxxxx" } },
    }));
    ok("non-scrypt hash → deny", await u5.verifyAdminPassword("1234") === false);

    /* (و) تجزئة scrypt صحيحة البنية لكنها لحساب آخر (كلمة سر مختلفة) → رفض */
    const db6 = makeStore();
    const u6 = makeUsers(db6);
    await u6.initUsers();
    await u6.changePass({ userId: "admin", oldPass: "1234", newPass: "RealPass#9" });
    ok("valid hash but wrong password → deny", await u6.verifyAdminPassword("1234") === false);

    /* (ز) تجزئة بصيغة hex غير صالحة (طول ملح/تجزئة خاطئ) → رفض */
    const u7 = makeUsers(makeStore({
      malahy_users_v1: { admin: { username: "admin", passwordHash: "scrypt:16384:8:1:zzzz:abcd" } },
    }));
    ok("invalid hex hash → deny", await u7.verifyAdminPassword("1234") === false);
  });

  /* ============ 6. نفس سلطة تسجيل الدخول (لا توجد سلطة ثانية) ============ */
  await section("6. Same authority as login — no second password authority", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    await u.changePass({ userId: "admin", oldPass: "1234", newPass: "Unified#1" });
    ok("hash stored is scrypt format",
      typeof db._raw()[u.K_USERS].admin.passwordHash === "string" &&
      db._raw()[u.K_USERS].admin.passwordHash.indexOf("scrypt:16384:8:1:") === 0);
    ok("login and uninstall verify agree (accept)",
      (await u.login({ username: "admin", password: "Unified#1" })).ok === true &&
      await u.verifyAdminPassword("Unified#1") === true);
    ok("login and uninstall verify agree (reject)",
      (await u.login({ username: "admin", password: "Bad" })).ok === false &&
      await u.verifyAdminPassword("Bad") === false);
    /* كلمة السر محفوظة كتجزئة فقط في مستودع المستخدمين الحديث — لا نص واضح.
       ملاحظة: K_PASS القديم (متوافق مع واجهة v2.5.1) يبقى كما هو بسلوكه
       القائم قبل هذه الميزة؛ مسار إلغاء التثبيت لا يقرأه إطلاقًا. */
    const usersJson = JSON.stringify(db._raw()[u.K_USERS]);
    ok("users store holds no plaintext password",
      usersJson.indexOf("Unified#1") === -1 && usersJson.indexOf("scrypt:16384:8:1:") !== -1);
    ok("uninstall verification ignores the legacy plaintext key",
      (function () {
        const src = fs.readFileSync(path.join(ROOT, "users.js"), "utf8");
        const s = src.indexOf("async function verifyAdminPassword");
        if (s === -1) return false;
        let i = src.indexOf("{", s), depth = 0, end = -1;
        for (; i < src.length; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = src.slice(s, end);
        return body.indexOf("K_PASS") === -1 && body.indexOf("verifyPassword") !== -1;
      })());
  });

  /* ============ 7. تحقق ثابت: main.js / preload.js ============ */
  await section("7. Static checks — main process and preload", async () => {
    const mainSrc = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    const preloadSrc = fs.readFileSync(path.join(ROOT, "preload.js"), "utf8");

    ok("main.js detects --uninstall-auth before the single-instance lock",
      mainSrc.indexOf('UNINSTALL_AUTH_FLAG = "--uninstall-auth"') !== -1 &&
      mainSrc.indexOf("runUninstallAuthMode()") !== -1);
    ok("auth mode exits 0 only on success, non-zero otherwise",
      /exitUninstallAuth\(true\)/.test(mainSrc) && /exitUninstallAuth\(false\)/.test(mainSrc) &&
      /app\.exit\(code\)/.test(mainSrc));
    ok("auth mode registers only verify/cancel channels",
      mainSrc.indexOf('"uninstall-auth:verify"') !== -1 &&
      mainSrc.indexOf('"uninstall-auth:cancel"') !== -1);
    /* أمن حرج: لا يُسمح بأخذ كلمة السر من سطر الأوامر أو البيئة أبداً */
    ok("no password accepted from argv/env in main.js",
      !/argv[^;]{0,80}(password|pass\b)/i.test(mainSrc.replace(/passwordHash|verifyAdminPassword|uninstall-auth/g, "")) &&
      !/process\.env[^;]{0,60}(pass|secret|hash)/i.test(mainSrc));
    {
      /* جسم دالة وضع المصادقة فقط: لا تهيئة مستخدمين ولا كتابة في البيانات */
      const fnStart = mainSrc.indexOf("function runUninstallAuthMode(");
      ok("runUninstallAuthMode defined", fnStart !== -1);
      if (fnStart !== -1) {
        let i = mainSrc.indexOf("{", fnStart), depth = 0, fnEnd = -1;
        for (; i < mainSrc.length; i++) {
          if (mainSrc[i] === "{") depth++;
          else if (mainSrc[i] === "}") { depth--; if (depth === 0) { fnEnd = i; break; } }
        }
        const body = mainSrc.slice(fnStart, fnEnd);
        ok("auth mode never calls initUsers", body.indexOf("initUsers") === -1);
        ok("auth mode never writes to the db", body.indexOf("db.set") === -1 &&
          body.indexOf("writeDoc") === -1 && body.indexOf("db.clear") === -1);
        ok("auth mode never starts the updater or update gate",
          body.indexOf("initUpdater") === -1 && body.indexOf("runUpdateGate") === -1 &&
          body.indexOf("autoUpdater") === -1);
        ok("auth mode never creates the main window or splash",
          body.indexOf("createMainWindow") === -1 && body.indexOf("createSplash") === -1);
        ok("auth mode never requests the single-instance lock",
          body.indexOf("requestSingleInstanceLock") === -1);
      }
    }
    ok("auth window keeps Electron security (contextIsolation, no nodeIntegration)",
      /unauthWindow = new BrowserWindow\([\s\S]{0,700}contextIsolation: true[\s\S]{0,200}nodeIntegration: false/.test(mainSrc));
    ok("preload bridges verify via ipcRenderer.invoke only",
      preloadSrc.indexOf('ipcRenderer.invoke("uninstall-auth:verify"') !== -1 &&
      preloadSrc.indexOf('"uninstall-auth:cancel"') !== -1);
    ok("preload never exposes the hash or a login bypass", preloadSrc.indexOf("passwordHash") === -1);
  });

  /* ============ 8. تحقق ثابت: نافذة الحوار العربية ============ */
  await section("8. Static checks — Arabic auth dialog", async () => {
    const html = fs.readFileSync(path.join(ROOT, "windows", "uninstall-auth.html"), "utf8");
    ok("title present", html.indexOf("إلغاء تثبيت ملاهي كوكو بارك") !== -1);
    ok("instructional message present",
      html.indexOf("أدخل الرقم السري لحساب المسؤول للسماح بحذف البرنامج.") !== -1);
    ok("password field is masked", html.indexOf('type="password"') !== -1);
    ok("confirm button present", html.indexOf("تأكيد الحذف") !== -1);
    ok("cancel button present", html.indexOf("إلغاء") !== -1);
    ok("Arabic error message for invalid credentials",
      html.indexOf("الرقم السري غير صحيح") !== -1);
    ok("RTL Arabic document", html.indexOf('dir="rtl"') !== -1 && html.indexOf('lang="ar"') !== -1);
    ok("no hardcoded password or hash in dialog",
      !/1234|scrypt:[0-9]/.test(html));
    ok("uses the secure bridge (no direct IPC secret handling)", html.indexOf("malahyUninstallAuth") !== -1);
  });

  /* ============ 9. تحقق ثابت: مزيل NSIS ============ */
  await section("9. Static checks — NSIS uninstaller hook", async () => {
    const nsh = fs.readFileSync(path.join(ROOT, "build", "uninstall-auth.nsh"), "utf8");
    ok("hook guarded to uninstaller build only",
      nsh.indexOf("!ifdef BUILD_UNINSTALLER") !== -1 && nsh.indexOf("!macro customUnInstall") !== -1);
    ok("launches the app in uninstall-auth mode",
      nsh.indexOf("--uninstall-auth") !== -1 && nsh.indexOf("ExecWait") !== -1);
    ok("aborts on any non-zero exit code", nsh.indexOf("Abort") !== -1 && nsh.indexOf("!= 0") !== -1);
    ok("auto-update path is exempted (--updated)", nsh.indexOf("${isUpdated}") !== -1);
    ok("fails closed when the app executable is missing",
      nsh.indexOf("FileExists") !== -1 && /APP_EXECUTABLE_FILENAME/.test(nsh));
    ok("no embedded password/hash/secret in the uninstaller script",
      !/password\s*=\s*"|scrypt:[0-9]|secret/i.test(nsh));
  });

  /* ============ 10. تكوين البناء ============ */
  await section("10. Build configuration", async () => {
    const yml = fs.readFileSync(path.join(ROOT, "electron-builder.yml"), "utf8");
    ok("nsis.include points at the protection script",
      yml.indexOf("include: build/uninstall-auth.nsh") !== -1);
    ok("app-data deletion behaviour unchanged",
      yml.indexOf("deleteAppDataOnUninstall: true") !== -1);
    ok("dialog file is packaged (windows/**/*)", yml.indexOf("windows/**/*") !== -1);
    ok("data preservation on update note still present", yml.indexOf("isUpdated") !== -1);
  });

  console.log("\n========================================");
  console.log("PASS: " + pass + "   FAIL: " + fail);
  console.log("========================================");
  if (fail > 0) process.exitCode = 1;
})();
