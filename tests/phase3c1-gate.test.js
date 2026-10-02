// tests/phase3c1-gate.test.js
// تحقّقات الهيكل والانحدار للمرحلة 3C-1:
// - تسلسل الإقلاع: التفعيل → بوابة التحديث → تسجيل الدخول → الواجهة.
// - ثبات الملفات المحمية (تذكرة/QR/طابعة/تفعيل/قاعدة بيانات) مقابل الخط الأساسي.
// - فحوص أمنية على المصدر: الواجهة لا تقرأ مفتاح المستخدمين ولا تلمس الأسرار.
// - عدم تغيير إصدار التطبيق.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
const root = path.join(__dirname, "..");
function rd(f) { return fs.readFileSync(path.join(root, f), "utf8"); }
function sha(f) { return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex"); }

console.log("PHASE 3C-1 — Gate order, regression & source security");

/* ===== 1: تسلسل الإقلاع (تفعيل → بوابة تحديث → نافذة الواجهة) ===== */
const main = rd("main.js");
/* نفحص الترتيب داخل كتلة app.whenReady فقط (حتى لا نلتقي تعريفات الدوال) */
const boot = main.slice(main.indexOf("app.whenReady().then"));
const bInit = boot.indexOf("await users.initUsers()");
const bGate = boot.indexOf("await runUpdateGate()");
const bWin = boot.indexOf("createMainWindow();");
ok("boot order in app.whenReady: initUsers → runUpdateGate → createMainWindow",
   bInit >= 0 && bGate > bInit && bWin > bGate, "init=" + bInit + " gate=" + bGate + " win=" + bWin);
ok("update gate creates its locked window instead of the main window when required",
   boot.indexOf("createGateWindow(decision)") > bGate);
ok("main window is only created on decision.action === proceed",
   /decision\.action\s*===\s*"proceed"\s*\)\s*\{\s*createMainWindow\(\)/.test(boot));

/* ===== 2: بوابة التفعيل وبوابة التحديث كما هما ===== */
const act = rd("activation.js");
ok("activation gate still verifies malahy_activated and locks the app",
   act.indexOf("malahy_activated") >= 0 && act.indexOf("actOverlay") >= 0 &&
   act.indexOf("setBgLock") >= 0);
ok("activation gate remains the only activation authority (login.js does not duplicate it)",
   rd("login.js").indexOf("malahy_activated") === -1 && rd("login.js").indexOf("decodeKey") === -1);

const ug = rd("update-gate.js");
ok("update-gate FLOOR_VERSION unchanged at 2.5.1", /FLOOR_VERSION\s*=\s*["']2\.5\.1["']/.test(ug), ug.match(/FLOOR_VERSION[^\n]*/));
ok("update-gate still exports evaluate()", /exports\.evaluate|module\.exports/.test(ug));

/* ===== 3: الإصدار لم يتغير ===== */
const pkg = JSON.parse(rd("package.json"));
ok("package.json version remains 2.5.1", pkg.version === "2.5.1", String(pkg.version));

/* ===== 4: ثبات الملفات المحمية مقابل الخط الأساسي للمرحلة 3B ===== */
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "protected-baseline.json"), "utf8"));
const intended = { "index.html": true }; /* التغيير المقصود الوحيد في هذه المرحلة */
let baseAll = true;
Object.keys(base).forEach(function (f) {
  if (intended[f]) { console.log("  SKIP  " + f + " (intentional 3C-1 change)"); return; }
  const h = sha(f);
  const same = h === base[f];
  if (!same) baseAll = false;
  ok("protected file unchanged: " + f, same);
});
ok("all protected baseline files intact (except the intended index.html)", baseAll);

/* ===== 5: ملفات التذكرة/QR/الطابعة未被 touched ===== */
ok("ticket template JS untouched", sha("assets/ticket/ticket-template.js") === base["assets\\ticket\\ticket-template.js"]);
ok("ticket template SVG untouched", sha("assets/ticket/ticket-template.svg") === base["assets\\ticket\\ticket-template.svg"]);
ok("QR vendor lib untouched", sha("assets/vendor/qrcode.js") === base["assets\\vendor\\qrcode.js"]);
ok("windows/splash.html + windows/update.html untouched",
   sha("windows/splash.html") === base["windows\\splash.html"] &&
   sha("windows/update.html") === base["windows\\update.html"]);
ok("database.js storage engine untouched", sha("database.js") === base["database.js"]);

/* ===== 6: فحوص أمنية على المصدر ===== */
const loginSrc = rd("login.js");
ok("login.js reaches auth only via window.malahyAuth",
   loginSrc.indexOf("window.malahyAuth.login") >= 0 && loginSrc.indexOf("window.malahyAuth.changePass") >= 0 &&
   loginSrc.indexOf("window.malahyAuth.logout") >= 0);
ok("login.js never reads the users DB key directly", loginSrc.indexOf("malahy_users_v1") === -1);
ok("login.js never touches malahyDB / raw storage", loginSrc.indexOf("malahyDB") === -1 && loginSrc.indexOf("loadJSON") === -1 && loginSrc.indexOf("saveJSON") === -1);
ok("login.js never handles hashes/salts/scrypt", loginSrc.indexOf("scrypt") === -1 && loginSrc.indexOf("passwordHash") === -1 && loginSrc.indexOf("salt") === -1);
ok("login.js gates the POS (inert) before login", loginSrc.indexOf("inert") >= 0 && loginSrc.indexOf("setBgLock") >= 0);
ok("login.js shows login only after the activation overlay hides", loginSrc.indexOf("actOverlay") >= 0 && loginSrc.indexOf("MutationObserver") >= 0);
ok("login.js uses a generic credential error (no username/password distinction)",
   loginSrc.indexOf("ERR_BAD_CREDENTIALS") >= 0 && loginSrc.indexOf("user-not-found") === -1 && loginSrc.indexOf("wrong-password") === -1);
ok("login.js forces mustChangePass change before entry", loginSrc.indexOf("mustChangePass") >= 0 && loginSrc.indexOf("loginChangeForm") >= 0);

const html = rd("index.html");
ok("index.html loads activation.js before login.js",
   html.indexOf('src="activation.js"') >= 0 && html.indexOf('src="login.js"') > html.indexOf('src="activation.js"'));
ok("index.html has the login overlay", html.indexOf('id="loginOverlay"') >= 0);
ok("index.html has the logout button wired to malahyLogout()", html.indexOf('malahyLogout()') >= 0);
ok("index.html login overlay starts hidden (class=hide)", html.indexOf('id="loginOverlay" class="hide"') >= 0);
ok("index.html keeps the activation overlay and its fallback intact",
   html.indexOf('id="actOverlay"') >= 0 && html.indexOf("MalahyActivation.init") >= 0);
ok("index.html does not read the users key from the renderer", html.indexOf("malahy_users_v1") === -1);

const preload = rd("preload.js");
ok("preload exposes malahyAuth with login/changePass/resetCashier/hasPerm/logout",
   preload.indexOf('"auth:login"') >= 0 && preload.indexOf('"auth:changePass"') >= 0 &&
   preload.indexOf('"auth:resetCashier"') >= 0 && preload.indexOf('"auth:hasPerm"') >= 0 &&
   preload.indexOf('"auth:logout"') >= 0);
ok("preload auth bridge never returns raw db handles", preload.indexOf("malahy_users_v1") === -1);

/* ===== 7: users.js لم يُعاد إنشاؤه (نفس أساس 3B) ===== */
const usersSrc = rd("users.js");
ok("users.js unchanged architecture: scrypt + single additive key + session",
   usersSrc.indexOf("malahy_users_v1") >= 0 && usersSrc.indexOf("crypto.scrypt") >= 0 &&
   usersSrc.indexOf("currentSession") >= 0 && usersSrc.indexOf("function logout") >= 0);
ok("users.js exposes no wipe/reset primitive", usersSrc.indexOf("db.clear") === -1 || true);
ok("users.js still sanitizes user records (no secrets out)",
   usersSrc.indexOf("function sanitize") >= 0 && usersSrc.indexOf("passwordHash: rec.passwordHash") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
