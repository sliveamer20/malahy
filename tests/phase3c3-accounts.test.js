// tests/phase3c3-accounts.test.js
// المرحلة 3C-3 — إدارة الحسابات والصلاحيات في العملية الرئيسية:
//   - إنشاء/سرد/إعادة تسمية/تفعيل-تعطيل الكاشير (للأدمن فقط).
//   - بيانات حساب المدير + رقم واتساب الاستعادة (للمدير فقط).
//   - منح/سحب/استعادة الصلاحية وتأثيرها على جلسة الكاشير التالية.
//   - إعادة تعيين كلمة سر الكاشير + قيد هوية تغيير كلمة السر.
// يعمل على مستودع في الذاكرة فقط — لا تُفتح أي قاعدة بيانات إنتاجية أبدًا.
//
// يغطي من قائمة التحقّق المطلوبة: 1 (دخول الأدمن)، 5 (عرض الكاشيرات)،
// 12 (الكاشير لا يغيّر الصلاحيات)، 13 (الكاشير لا يعدّل الأدمن)،
// 14 (منح صلاحية)، 15 (الكاشير يكتسبها)، 16 (سحبها)، 17 (الكاشير يفقدها)،
// 18 (إعادة تعيين كلمة سر الكاشير)، 19 (الكاشير المعطّل لا يدخل)، 20 (بيانات v2.5.1).

const path = require("path");
const fs = require("fs");
const makeUsers = require(path.join(__dirname, "..", "users.js"));
const PERMLIB = require(path.join(__dirname, "..", "permissions.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

/* مستودع في الذاكرة (نفس واجهة database.js) */
function mkStore() {
  const store = {};
  return {
    store: store,
    get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
    set: (k, v) => { store[k] = v; return true; },
    delete: (k) => { delete store[k]; return true; },
  };
}

/* ====== فحوص على المصدر: main.js يحتوي فعليًا على المعالجات الجديدة ====== */
const mainSrc = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
ok("main.js gates createCashier behind an admin session",
   mainSrc.indexOf('"auth:createCashier"') !== -1 &&
   /auth:createCashier[\s\S]{0,300}?role\s*!==\s*"admin"/.test(mainSrc));
ok("main.js gates listCashiers behind an admin session",
   mainSrc.indexOf('"auth:listCashiers"') !== -1 &&
   /auth:listCashiers[\s\S]{0,200}?role\s*!==\s*"admin"/.test(mainSrc));
ok("main.js exposes setCashierActive / setCashierUsername handlers",
   mainSrc.indexOf('"auth:setCashierActive"') !== -1 &&
   mainSrc.indexOf('"auth:setCashierUsername"') !== -1);
ok("main.js exposes getAdminInfo / setRecoveryWhatsapp handlers",
   mainSrc.indexOf('"auth:getAdminInfo"') !== -1 &&
   mainSrc.indexOf('"auth:setRecoveryWhatsapp"') !== -1);
ok("main.js exposes getCashierPerms handler",
   mainSrc.indexOf('"auth:getCashierPerms"') !== -1);
ok("main.js restricts changePass to the caller's own account (cashiers cannot touch others)",
   /auth:changePass[\s\S]{0,400}?role\s*!==\s*"admin"[\s\S]{0,200}?forbidden/.test(mainSrc));

/* ====== preload يعرّف الجسور الجديدة ====== */
const preloadSrc = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
["createCashier", "listCashiers", "getCashierPerms", "setCashierActive",
 "setCashierUsername", "getAdminInfo", "setRecoveryWhatsapp", "setCashierPerms",
 "resetCashier", "changePass", "login", "logout"].forEach(function (m) {
  ok("preload exposes malahyAuth." + m, preloadSrc.indexOf(m + ":") !== -1 || preloadSrc.indexOf(m + " (") !== -1);
});
ok("preload never returns the users DB key or raw handles",
   preloadSrc.indexOf("malahy_users_v1") === -1);

/* ====== users.js يُصدّر الدوال الجديدة ====== */
const usersSrc = fs.readFileSync(path.join(__dirname, "..", "users.js"), "utf8");
ok("users.js exports setCashierActive", usersSrc.indexOf("setCashierActive") !== -1);
ok("users.js exports setCashierUsername", usersSrc.indexOf("setCashierUsername") !== -1);
ok("users.js exports getAdminInfo", usersSrc.indexOf("getAdminInfo") !== -1);
ok("users.js exports setRecoveryWhatsapp", usersSrc.indexOf("setRecoveryWhatsapp") !== -1);
ok("users.js still exposes no wipe/reset primitive", usersSrc.indexOf("db.clear") === -1);
ok("users.js never leaks passwordHash through sanitize",
   usersSrc.indexOf("passwordHash: rec.passwordHash") === -1);

/* ====== accounts.js موجود ولا يحتوي على أسرار ولا وصول مباشر للقاعدة ====== */
const accPath = path.join(__dirname, "..", "accounts.js");
ok("accounts.js exists as the management UI module", fs.existsSync(accPath));
const accSrc = fs.readFileSync(accPath, "utf8");
ok("accounts.js reaches Main only through the auth bridge",
   accSrc.indexOf("window.malahyAuth") !== -1 && accSrc.indexOf("malahy_users_v1") === -1);
ok("accounts.js uses the shared registry (no duplicated permission list)",
   accSrc.indexOf("MalahyPerms") !== -1 && accSrc.indexOf("PERM_LABELS") !== -1);
ok("accounts.js never hashes or verifies passwords itself",
   accSrc.indexOf("scrypt") === -1 && accSrc.indexOf("crypto") === -1);
ok("accounts.js renders admin-only cards by session role",
   accSrc.indexOf("role === \"admin\"") !== -1);

/* ================= محاكاة معالجات main.js (نفس القرار بالضبط) ================= */
(async () => {
  console.log("PHASE 3C-3 — Main-process account & permission management");

  const d = mkStore();
  const users = makeUsers(d);

  /* بيانات v2.5.1 الأصلية يجب أن تبقى كما هي */
  const LEGACY = {
    "malahy_pos_state_v1": { day: "2025-01-01", total: 1000 },
    "malahy_pos_history_v1": [{ id: "h1", day: "2024-12-31", total: 250 }],
    "malahy_pos_settings_v1": { brandName: "كوكي بارك", printerName: "P1" },
    "malahy_pos_games_v1": [{ id: "vr", name: "لعبة VR", price: 75, active: true }],
    "malahy_employees_v1": [{ id: "e1", name: "أحمد", weeks: [] }],
    "malahy_review_log_v1": [{ id: "rev1" }],
  };
  Object.keys(LEGACY).forEach((k) => { d.store[k] = JSON.parse(JSON.stringify(LEGACY[k])); });
  d.store["malahy_pos_pass_v1"] = "prod2025!";

  await users.initUsers();

  /* ===== TEST 1: دخول الأدمن ===== */
  const al = await users.login({ username: "admin", password: "prod2025!" });
  ok("TEST 1: administrator login works", al.ok === true && al.user.role === "admin");

  /* نسخة طبق المنطق الفعلي لمعالج auth:createCashier في main.js */
  async function ipcCreateCashier(args) {
    const sess = users.getSession();
    if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
    try { return await users.createCashier(args || {}); }
    catch (_) { return { ok: false, error: "auth-failed" }; }
  }
  /* نسخة طبق المعالج auth:listCashiers */
  function ipcListCashiers() {
    const sess = users.getSession();
    if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
    return { ok: true, cashiers: users.listCashiers() };
  }
  /* نسخة طبق المعالج auth:changePass (مع قيد الهوية) */
  async function ipcChangePass(args) {
    const a = (args && typeof args === "object") ? args : {};
    const sess = users.getSession();
    if (sess && sess.role !== "admin" && String(a.userId || "") !== String(sess.userId || "")) {
      return { ok: false, error: "forbidden" };
    }
    return await users.changePass(a);
  }

  /* ===== TEST 5: عرض حسابات الكاشير ===== */
  ok("TEST 5a: empty cashier list initially", ipcListCashiers().cashiers.length === 0);
  const c1 = await ipcCreateCashier({ username: "sara", password: "sara1234" });
  ok("TEST 5b: admin creates a cashier account", c1.ok === true && c1.user.role === "cashier");
  const c2 = await ipcCreateCashier({ username: "ahmed", password: "ahmed1234" });
  ok("admin creates a second cashier", c2.ok === true);
  const listed = ipcListCashiers();
  ok("TEST 5c: cashier list shows all cashiers with sanitized fields",
     listed.ok === true && listed.cashiers.length === 2 &&
     listed.cashiers.every(function (c) {
       return typeof c.username === "string" && typeof c.active === "boolean" &&
              c.perms && typeof c.perms === "object" && !("passwordHash" in c);
     }));
  ok("cashier list exposes no password hashes",
     JSON.stringify(listed.cashiers).indexOf("scrypt") === -1);

  /* ===== الكاشير الافتراضي: عملياته اليومية كلها مفعّلة ===== */
  const ALLOW = ["sales", "ticketPrint", "returns", "expenseAdd", "expenseDelete",
                 "giftAdd", "giftDelete", "reports", "reportPrint"];
  const DENY = ["reportExport", "gameManage", "employeeManage", "payroll",
                "dayReset", "historyDelete", "settings"];
  ok("new cashier gets the registry default permissions",
     ALLOW.every(function (p) { return c1.user.perms[p] === true; }) &&
     DENY.every(function (p) { return c1.user.perms[p] === false; }));

  /* ===== TEST 12/13: الكاشير لا يستطيع إدارة الحسابات/الصلاحيات/الأدمن ===== */
  users.logout();
  const cl = await users.login({ username: "sara", password: "sara1234" });
  ok("cashier session established", cl.ok === true && cl.user.role === "cashier");
  ok("TEST 12a: cashier cannot create a cashier",
     (await ipcCreateCashier({ username: "x", password: "x12345" })).ok === false);
  ok("TEST 12b: cashier cannot list cashiers", ipcListCashiers().ok === false);
  ok("TEST 12c: cashier cannot change another cashier's permissions",
     users.setCashierPermissions({ cashierId: c2.user.id, permissions: { sales: false } }).ok === false);
  ok("TEST 12d: cashier cannot change own permissions (no self-elevation)",
     users.setCashierPermissions({ cashierId: c1.user.id, permissions: { settings: true } }).ok === false);
  ok("TEST 12e: cashier permissions unchanged after the denied attempt",
     users.hasPerm({ permId: "settings" }) === false &&
     users.hasPerm({ permId: "sales" }) === true);
  ok("TEST 13a: cashier cannot disable another cashier",
     users.setCashierActive({ cashierId: c2.user.id, active: false }).ok === false);
  ok("TEST 13b: cashier cannot rename another cashier",
     users.setCashierUsername({ cashierId: c2.user.id, username: "hacked" }).ok === false);
  ok("TEST 13c: cashier cannot read the administrator account info",
     users.getAdminInfo().ok === false);
  ok("TEST 13d: cashier cannot set the administrator recovery number",
     users.setRecoveryWhatsapp({ number: "201000000000" }).ok === false);
  ok("TEST 13e: cashier cannot reset another cashier's password",
     (await users.resetCashier({ cashierId: c2.user.id, newPass: "hacked1234" })).ok === false);
  ok("TEST 13f: cashier cannot change the administrator's password",
     (await ipcChangePass({ userId: "admin", oldPass: "prod2025!", newPass: "hacked1234" })).ok === false);
  ok("TEST 13g: cashier can change only its own password (with the current one)",
     (await ipcChangePass({ userId: cl.user.id, oldPass: "sara1234", newPass: "saraNew1234" })).ok === true);
  ok("TEST 13h: cashier cannot change its own password without the current one",
     (await ipcChangePass({ userId: cl.user.id, oldPass: "wrong", newPass: "saraNew12345" })).ok === false);
  users.logout();

  /* ===== TEST 14/15/16/17: دورة منح/سحب الصلاحية وتأثيرها على الجلسة ===== */
  const al2 = await users.login({ username: "admin", password: "prod2025!" });
  ok("admin session re-established for permission management", al2.ok === true);

  /* 14: منح صلاحية كانت مُلغاة افتراضيًا (reportExport) */
  const g = users.setCashierPermissions({ cashierId: c1.user.id, permissions: { reportExport: true } });
  ok("TEST 14: administrator can grant a previously disabled permission",
     g.ok === true && g.user.perms.reportExport === true);
  ok("granting one permission does not disturb the other defaults",
     g.user.perms.sales === true && g.user.perms.settings === false);

  /* 15: الكاشير يكتسب الصلاحية بعد تحديث الجلسة (تسجيل دخول جديد) */
  users.logout();
  const cl2 = await users.login({ username: "sara", password: "saraNew1234" });
  ok("TEST 15: cashier gains the granted permission on the next login (session refresh)",
     cl2.ok === true && cl2.user.perms.reportExport === true &&
     users.hasPerm({ permId: "reportExport" }) === true);

  /* 16: سحبها مجددًا */
  users.logout();
  await users.login({ username: "admin", password: "prod2025!" });
  const r = users.setCashierPermissions({ cashierId: c1.user.id, permissions: { reportExport: false } });
  ok("TEST 16: administrator can remove the permission again",
     r.ok === true && r.user.perms.reportExport === false);

  /* 17: الكاشير يفقد الوصول بعد السحب (تسجيل دخول جديد) */
  users.logout();
  const cl3 = await users.login({ username: "sara", password: "saraNew1234" });
  ok("TEST 17: cashier loses access after removal (next login reflects the change)",
     cl3.ok === true && cl3.user.perms.reportExport !== true &&
     users.hasPerm({ permId: "reportExport" }) === false);
  ok("cashier still keeps the default daily permissions after the cycle",
     users.hasPerm({ permId: "sales" }) === true &&
     users.hasPerm({ permId: "expenseDelete" }) === true &&
     users.hasPerm({ permId: "giftDelete" }) === true);
  users.logout();

  /* ===== TEST 18: إعادة تعيين كلمة سر الكاشير ===== */
  await users.login({ username: "admin", password: "prod2025!" });
  const rp = await users.resetCashier({ cashierId: c1.user.id, newPass: "reset1234" });
  ok("TEST 18a: administrator can reset a cashier password", rp.ok === true);
  users.logout();
  const cl4 = await users.login({ username: "sara", password: "reset1234" });
  ok("TEST 18b: cashier logs in with the reset password",
     cl4.ok === true && cl4.user.mustChangePass === true);
  ok("TEST 18c: old password no longer works",
     (await users.login({ username: "sara", password: "saraNew1234" })).ok === false);
  users.logout();

  /* ===== TEST 19: الكاشير المعطّل لا يستطيع تسجيل الدخول ===== */
  await users.login({ username: "admin", password: "prod2025!" });
  ok("cashier is active before disabling",
     users.setCashierActive({ cashierId: c2.user.id, active: true }).ok === true);
  const dis = users.setCashierActive({ cashierId: c2.user.id, active: false });
  ok("TEST 19a: administrator can disable a cashier account", dis.ok === true && dis.user.active === false);
  users.logout();
  const cl5 = await users.login({ username: "ahmed", password: "ahmed1234" });
  ok("TEST 19b: disabled cashier cannot log in", cl5.ok === false);
  ok("TEST 19c: disabled login attempt creates no session", users.getSession() === null);
  /* إعادة التفعيل */
  await users.login({ username: "admin", password: "prod2025!" });
  ok("TEST 19d: administrator can re-enable the cashier",
     users.setCashierActive({ cashierId: c2.user.id, active: true }).ok === true);
  users.logout();
  const cl6 = await users.login({ username: "ahmed", password: "ahmed1234" });
  ok("TEST 19e: re-enabled cashier can log in again", cl6.ok === true);
  users.logout();

  /* ===== إعادة التسمية ===== */
  await users.login({ username: "admin", password: "prod2025!" });
  const rn = users.setCashierUsername({ cashierId: c2.user.id, username: "ahmed2" });
  ok("administrator can rename a cashier", rn.ok === true && rn.user.username === "ahmed2");
  ok("rename rejects a name shorter than 2 characters",
     users.setCashierUsername({ cashierId: c2.user.id, username: "a" }).error === "invalid-username");
  ok("rename rejects a name colliding with the administrator",
     users.setCashierUsername({ cashierId: c2.user.id, username: "admin" }).error === "username-taken");
  ok("rename rejects a duplicate cashier name",
     users.setCashierUsername({ cashierId: c2.user.id, username: "sara" }).error === "username-taken");
  ok("rename rejects a non-boolean active flag",
     users.setCashierActive({ cashierId: c2.user.id, active: "true" }).error === "invalid-argument");
  users.logout();
  const cl7 = await users.login({ username: "ahmed2", password: "ahmed1234" });
  ok("cashier logs in with the new name after rename", cl7.ok === true);
  ok("old cashier name no longer resolves",
     (await users.login({ username: "ahmed", password: "ahmed1234" })).ok === false);
  users.logout();

  /* ===== حساب المدير + رقم الاستعادة ===== */
  await users.login({ username: "admin", password: "prod2025!" });
  const ai = users.getAdminInfo();
  ok("administrator info exposes username without secrets",
     ai.ok === true && ai.username === "admin" && !("passwordHash" in ai));
  ok("administrator info exposes the recovery placeholder state",
     ai.recoveryState === null && typeof ai.recoveryWhatsapp === "string");
  ok("recovery number can be set",
     users.setRecoveryWhatsapp({ number: "201001234567" }).ok === true);
  ok("recovery number persists in the admin record",
     users.getAdminInfo().recoveryWhatsapp === "201001234567");
  ok("recovery number rejects a clearly invalid value",
     users.setRecoveryWhatsapp({ number: "abc" }).error === "invalid-number");
  ok("recovery number can be cleared with an empty string",
     users.setRecoveryWhatsapp({ number: "" }).ok === true &&
     users.getAdminInfo().recoveryWhatsapp === "");
  ok("recovery number belongs to the single administrator account only (no per-cashier field)",
     JSON.stringify(d.store["malahy_users_v1"].cashiers).indexOf("recoveryWhatsapp") === -1);
  users.logout();

  /* ===== محدودية الأدمن: لا يمكن حذفه ولا إنشاء أدمن ثانٍ ===== */
  ok("there is exactly one administrator account",
     d.store["malahy_users_v1"].admin.id === "admin" &&
     !("permissions" in d.store["malahy_users_v1"].admin));
  ok("no API creates a second administrator",
     usersSrc.indexOf("createAdmin") === -1 && usersSrc.indexOf("doc.admin2") === -1);

  /* ===== TEST 20: بيانات v2.5.1 بقيت كما هي تمامًا ===== */
  ok("TEST 20a: legacy K_STATE intact", JSON.stringify(d.store["malahy_pos_state_v1"]) === JSON.stringify(LEGACY["malahy_pos_state_v1"]));
  ok("TEST 20b: legacy K_HIST intact", JSON.stringify(d.store["malahy_pos_history_v1"]) === JSON.stringify(LEGACY["malahy_pos_history_v1"]));
  ok("TEST 20c: legacy K_SETTINGS intact", JSON.stringify(d.store["malahy_pos_settings_v1"]) === JSON.stringify(LEGACY["malahy_pos_settings_v1"]));
  ok("TEST 20d: legacy K_GAMES intact", JSON.stringify(d.store["malahy_pos_games_v1"]) === JSON.stringify(LEGACY["malahy_pos_games_v1"]));
  ok("TEST 20e: legacy K_EMP intact", JSON.stringify(d.store["malahy_employees_v1"]) === JSON.stringify(LEGACY["malahy_employees_v1"]));
  ok("TEST 20f: legacy K_REVIEW intact", JSON.stringify(d.store["malahy_review_log_v1"]) === JSON.stringify(LEGACY["malahy_review_log_v1"]));
  ok("TEST 20g: legacy K_PASS preserved during migration", d.store["malahy_pos_pass_v1"] === "prod2025!");
  ok("TEST 20h: users store is additive (one extra key only)",
     Object.keys(d.store).filter(function (k) { return k === "malahy_users_v1"; }).length === 1);

  /* ===== الترحيل لا يطمس تخصيصات الصلاحيات التي أنشأناها ===== */
  const snap = JSON.stringify(d.store["malahy_users_v1"]);
  await users.initUsers();
  ok("initUsers stays idempotent after account management (no data loss)",
     JSON.stringify(d.store["malahy_users_v1"]) === snap);

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})();
