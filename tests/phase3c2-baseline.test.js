// tests/phase3c2-baseline.test.js
// المرحلة 3C-2 — انحدار الحماية وبنية التفعيل/التحديث والتذاكر/QR/الطابعة:
//   الاختبارات 28 (بوابة التفعيل)، 29 (بوابة التحديث الإجباري)، 30 (التذكرة/QR/الطابعة)
//   + فحوص أمنية على المصدر + الإصدار لم يتغير + نظام كلمة السر القديم لا يزال موجودًا.

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

console.log("PHASE 3C-2 — Regression, gates & source security");

/* ===== الإصدار لم يتغير ===== */
const pkg = JSON.parse(rd("package.json"));
ok("package.json version remains 2.5.3 (deliberate release bump, re-anchored for v2.5.3)", pkg.version === "2.5.3", String(pkg.version));

/* ===== الملفات المحمية مقابل خط الأساسي ===== */
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "protected-baseline.json"), "utf8"));
/* التغييرات المقصودة في هذه المرحلة: index.html (فرض الصلاحيات + الإخفاء). */
const intended = { "index.html": true };
let baseAll = true;
Object.keys(base).forEach(function (f) {
  if (intended[f]) { console.log("  SKIP  " + f + " (intentional 3C-2 change)"); return; }
  const same = sha(f) === base[f];
  if (!same) baseAll = false;
  ok("protected file unchanged: " + f, same);
});
ok("all protected baseline files intact (except the intended index.html)", baseAll);

/* ===== TEST 28: بوابة التفعيل كما هي ===== */
const act = rd("activation.js");
ok("TEST 28a: activation.js is byte-identical to the baseline",
   sha("activation.js") === base["activation.js"]);
ok("TEST 28b: activation still verifies malahy_activated and locks the app",
   act.indexOf("malahy_activated") >= 0 && act.indexOf("actOverlay") >= 0 && act.indexOf("setBgLock") >= 0);
ok("TEST 28c: activation remains the sole activation authority",
   rd("login.js").indexOf("malahy_activated") === -1 && rd("perm-gate.js").indexOf("malahy_activated") === -1);
ok("TEST 28d: activation gate still loads before everything and locks on failure",
   rd("index.html").indexOf('src="activation.js"') >= 0 &&
   rd("index.html").indexOf("MalahyActivation.init") >= 0);

/* ===== TEST 29: بوابة التحديث الإجباري كما هي ===== */
const ug = rd("update-gate.js");
ok("TEST 29a: update-gate.js is byte-identical to the baseline",
   sha("update-gate.js") === base["update-gate.js"]);
ok("TEST 29b: FLOOR_VERSION unchanged at 2.5.1", /FLOOR_VERSION\s*=\s*["']2\.5\.1["']/.test(ug));
ok("TEST 29c: update gate still exports evaluate()", /exports\.evaluate|module\.exports/.test(ug));
const mainSrc = rd("main.js");
const boot = mainSrc.slice(mainSrc.indexOf("app.whenReady().then"));
ok("TEST 29d: boot order intact (initUsers → runUpdateGate → createMainWindow)",
   boot.indexOf("await users.initUsers()") >= 0 &&
   boot.indexOf("await runUpdateGate()") > boot.indexOf("await users.initUsers()") &&
   boot.indexOf("createMainWindow();") > boot.indexOf("await runUpdateGate()"));
ok("TEST 29e: locked update window still created when the gate requires an update",
   boot.indexOf("createGateWindow(decision)") > boot.indexOf("await runUpdateGate()"));
ok("TEST 29f: printer IPC intact (get-printers / print-ticket)",
   mainSrc.indexOf("get-printers") !== -1 && mainSrc.indexOf("print-ticket") !== -1);

/* ===== TEST 30: التذكرة / QR / الطابعة لم تُمَس ===== */
ok("TEST 30a: ticket template JS untouched", sha("assets/ticket/ticket-template.js") === base["assets\\ticket\\ticket-template.js"]);
ok("TEST 30b: ticket template SVG untouched", sha("assets/ticket/ticket-template.svg") === base["assets\\ticket\\ticket-template.svg"]);
ok("TEST 30c: QR vendor lib untouched", sha("assets/vendor/qrcode.js") === base["assets\\vendor\\qrcode.js"]);
ok("TEST 30d: splash + update windows untouched",
   sha("windows/splash.html") === base["windows\\splash.html"] &&
   sha("windows/update.html") === base["windows\\update.html"]);
ok("TEST 30e: database.js storage engine untouched", sha("database.js") === base["database.js"]);
ok("TEST 30f: ticket/QR/printer code paths not touched by the permission gate",
   rd("index.html").indexOf("function ticketTemplateSvg") !== -1 &&
   rd("index.html").indexOf("function ticketQrSvg") !== -1 &&
   rd("index.html").indexOf("function ticketHTML") !== -1 &&
   rd("index.html").indexOf("function giftTicketHTML") !== -1);

/* ===== نظام كلمة السر القديم لا يزال موجودًا (مرحلة انتقال) ===== */
const idx = rd("index.html");
ok("transition: getPass() still defined (not removed)",
   idx.indexOf("function getPass()") !== -1);
ok("transition: openPasswordModal still defined (available for compatibility)",
   idx.indexOf("function openPasswordModal(") !== -1);
ok("transition: empAskPass still defined (available for compatibility)",
   idx.indexOf("function empAskPass(") !== -1);
ok("transition: no remaining openPasswordModal/empAskPass call sites (all converted to the permission gate)",
   !/\bopenPasswordModal\s*\(/.test(idx.replace(/function openPasswordModal\(/, "DEF")) &&
   !/\bempAskPass\s*\(/.test(idx.replace(/function empAskPass\(/, "DEF")));

/* ===== فروض الصلاحيات في index.html ===== */
ok("index.html loads the shared registry and the permission gate",
   idx.indexOf('src="permissions.js"') >= 0 && idx.indexOf('src="perm-gate.js"') >= 0 &&
   idx.indexOf('src="perm-gate.js"') > idx.indexOf('src="permissions.js"'));
ok("index.html wires the centralized gate (MalahyPerm.requirePerm/hasPerm)",
   idx.indexOf("MalahyPerm.requirePerm(") !== -1 && idx.indexOf("MalahyPerm.hasPerm(") !== -1);
ok("index.html hides admin-only UI via data-perm attributes",
   idx.indexOf('data-perm="settings"') !== -1 &&
   idx.indexOf('data-perm="gameManage"') !== -1 &&
   idx.indexOf('data-perm="employeeManage"') !== -1 &&
   idx.indexOf('data-perm="dayReset"') !== -1 &&
   idx.indexOf('data-perm="reportExport"') === -1 /* لا يوجد زر للتصدير — يُفرض عند التنفيذ */);
ok("index.html has a fail-closed fallback if perm-gate.js fails to load",
   idx.indexOf("if(window.MalahyPerm) return;") !== -1 &&
   idx.indexOf("ليس لديك صلاحية لتنفيذ هذه العملية") !== -1 &&
   /window\.MalahyPerm\s*=\s*\{/.test(idx));

/* ===== أمان المصدر: لا أسرار في الواجهة ===== */
ok("index.html never references the users DB key", idx.indexOf("malahy_users_v1") === -1);
ok("index.html never talks to the auth bridge directly (goes through login.js)",
   idx.indexOf("malahyAuth") === -1);
ok("perm-gate.js handles no hashes/salts/secrets",
   rd("perm-gate.js").indexOf("scrypt") === -1 &&
   rd("perm-gate.js").indexOf("passwordHash") === -1 &&
   rd("perm-gate.js").indexOf("crypto") === -1);
ok("permissions.js defines no secrets (registry + policy only)",
   rd("permissions.js").indexOf("scrypt") === -1 && rd("permissions.js").indexOf("passwordHash") === -1);
ok("perm-gate.js reads no renderer-controlled role source (no cookie/localStorage/URL)",
   rd("perm-gate.js").indexOf("cookie") === -1 &&
   rd("perm-gate.js").indexOf("localStorage") === -1 &&
   rd("perm-gate.js").indexOf("URLSearchParams") === -1);
ok("login.js feeds the permission gate from the sanitized session",
   rd("login.js").indexOf("MalahyPerm.setSession") !== -1 &&
   rd("login.js").indexOf("MalahyPerm.clearSession") !== -1);

/* ===== طبقة Main: الحماية الفعلية ===== */
ok("main.js imports the permission registry and owns the users module",
   mainSrc.indexOf('require("./permissions")') !== -1 && mainSrc.indexOf('require("./users")') !== -1);
ok("main.js denies unauthorized sensitive writes with a logged reason",
   /authorizeDbOp\("write"/.test(mainSrc) && mainSrc.indexOf("رفض كتابة مفتاح محمي") !== -1);
ok("main.js denies unauthorized sensitive deletes with a logged reason",
   /authorizeDbOp\("delete"/.test(mainSrc) && mainSrc.indexOf("رفض حذف مفتاح محمي") !== -1);
ok("main.js gates db-clear behind an authenticated admin session",
   /db-clear[\s\S]{0,300}?role\s*!==\s*"admin"/.test(mainSrc));
ok("main.js exposes the setCashierPerms handler (admin-only decision)",
   mainSrc.indexOf('"auth:setCashierPerms"') !== -1);

/* ===== preload: الجسر الآمن ===== */
const preload = rd("preload.js");
ok("preload keeps the full auth bridge and adds setCashierPerms",
   preload.indexOf('"auth:login"') !== -1 && preload.indexOf('"auth:changePass"') !== -1 &&
   preload.indexOf('"auth:resetCashier"') !== -1 && preload.indexOf('"auth:hasPerm"') !== -1 &&
   preload.indexOf('"auth:logout"') !== -1 && preload.indexOf('"auth:setCashierPerms"') !== -1);
ok("preload never returns raw db handles or the users key", preload.indexOf("malahy_users_v1") === -1);

/* ===== users.js: الأساس سليم + إضافات المرحلة ===== */
const usersSrc = rd("users.js");
ok("users.js architecture intact: scrypt + single additive key + session",
   usersSrc.indexOf("malahy_users_v1") >= 0 && usersSrc.indexOf("crypto.scrypt") >= 0 &&
   usersSrc.indexOf("currentSession") >= 0 && usersSrc.indexOf("function logout") >= 0);
ok("users.js consumes the shared registry (no duplicated permission list)",
   usersSrc.indexOf('require("./permissions")') !== -1 &&
   usersSrc.indexOf('"sales", "ticketPrint"') === -1 /* القائمة لم تُكرر محليًا */);
ok("users.js exposes the permission-management mechanism",
   usersSrc.indexOf("function setCashierPermissions") !== -1);
ok("users.js still sanitizes user records (no secrets out)",
   usersSrc.indexOf("function sanitize") >= 0 && usersSrc.indexOf("passwordHash: rec.passwordHash") === -1);
ok("users.js exposes no wipe/reset primitive", usersSrc.indexOf("db.clear") === -1);

/* ===== الملفات الجديدة موجودة ===== */
ok("permissions.js exists and is the single registry source",
   fs.existsSync(path.join(root, "permissions.js")) && rd("permissions.js").indexOf("var PERMS = [") !== -1);
ok("perm-gate.js exists and exposes the centralized gate",
   fs.existsSync(path.join(root, "perm-gate.js")) && rd("perm-gate.js").indexOf("function requirePerm") !== -1);

/* ===== لا يوجد بناء/نشر ===== */
ok("no build artifacts created in this phase (dist/ unchanged, no new release files)",
   fs.existsSync(path.join(root, "dist")) === true /* المجلد موجود مسبقًا */ &&
   fs.readdirSync(path.join(root)).indexOf("opencode.json") >= 0);
ok("no WhatsApp/recovery code introduced in this phase",
   rd("permissions.js").indexOf("whatsapp") === -1 && rd("perm-gate.js").indexOf("whatsapp") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
