// tests/phase3c2-perms.test.js
// المرحلة 3C-2 — سجلّ الصلاحيات، صلاحيات الكاشير الافتراضية، سلوك الأدمن،
// والترحيل الآمن للصلاحيات (idempotent). يعمل على مستودع في الذاكرة فقط —
// لا تُفتح أي قاعدة بيانات إنتاجية أبدًا.
//
// يغطي الاختبارات المطلوبة: 1 (الأدمن كل الصلاحيات)، 2 (افتراضي الكاشير)،
// 19 (إلغاء expenseDelete)، 20 (إلغاء giftDelete)، 21 (إعادة التفعيل)،
// 22 (صلاحية غير معروفة مرفوضة)، 23 (الأدمن يعمل دون مصفوفة صلاحيات).

const path = require("path");
const makeUsers = require(path.join(__dirname, "..", "users.js"));
const PERMLIB = require(path.join(__dirname, "..", "permissions.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

function mkStore() {
  const store = {};
  return {
    store: store,
    get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
    set: (k, v) => { store[k] = v; return true; },
    delete: (k) => { delete store[k]; return true; },
  };
}

(async () => {
  console.log("PHASE 3C-2 — Permission registry, cashier defaults & admin behavior");

  /* السجل الموحّد: 16 صلاحية بالضبط، ولا تكرار للتعريفات في مكان آخر */
  ok("registry exposes exactly the required permission ids",
     PERMLIB.PERMS.length === 16 &&
     PERMLIB.PERMS.indexOf("expenseDelete") !== -1 &&
     PERMLIB.PERMS.indexOf("giftDelete") !== -1 &&
     PERMLIB.PERMS.indexOf("expenseAdd") !== -1 &&
     PERMLIB.PERMS.indexOf("giftAdd") !== -1 &&
     PERMLIB.PERMS.indexOf("reportExport") !== -1);
  ok("expenseDelete and giftDelete are separate registry entries",
     PERMLIB.PERMS.indexOf("expenseDelete") !== PERMLIB.PERMS.indexOf("giftDelete"));
  ok("registry is the single source (users.js re-exports the same list)",
     require(path.join(__dirname, "..", "users.js"))(mkStore()).PERMS === PERMLIB.PERMS);
  ok("isKnownPerm denies unknown ids", PERMLIB.isKnownPerm("bogus") === false && PERMLIB.isKnownPerm("sales") === true);

  /* ============ مخزن 1: الأدمن + الكاشير ============ */
  const d1 = mkStore();
  const users = makeUsers(d1);
  d1.store["malahy_pos_pass_v1"] = "prod2025!";
  await users.initUsers();

  /* ===== TEST 1: الأدمن يستطيع تنفيذ كل صلاحية مسجّلة ===== */
  const al = await users.login({ username: "admin", password: "prod2025!" });
  ok("admin login succeeds", al.ok === true && al.user.role === "admin");
  let adminAll = true;
  PERMLIB.PERMS.forEach(function (p) { if (users.hasPerm({ permId: p }) !== true) adminAll = false; });
  ok("TEST 1: admin can perform every registered permission", adminAll);
  ok("admin payload has every permission granted",
     PERMLIB.PERMS.every(function (p) { return al.user.perms[p] === true; }));

  /* ===== TEST 23: الأدمن يعمل دون وجود مصفوفة صلاحيات مخزّنة ===== */
  const doc = d1.store["malahy_users_v1"];
  ok("admin record stores no permissions field (full access is implicit)",
     doc.admin && !("permissions" in doc.admin));
  ok("TEST 23: admin stays authorized with no stored permission array",
     users.hasPerm({ permId: "settings" }) === true &&
     users.hasPerm({ permId: "payroll" }) === true &&
     users.hasPerm({ permId: "anyFuturePerm" }) === true /* admin auto-receives new ids */);

  /* ===== TEST 2: صلاحيات الكاشير الافتراضية صحيحة ===== */
  const c = await users.createCashier({ username: "sara", password: "sara1234" });
  ok("cashier created (default permissions applied)", c.ok === true && c.user.role === "cashier");
  const ALLOW = ["sales", "ticketPrint", "returns", "expenseAdd", "expenseDelete",
                 "giftAdd", "giftDelete", "reports", "reportPrint"];
  const DENY = ["reportExport", "gameManage", "employeeManage", "payroll",
                "dayReset", "historyDelete", "settings"];
  let allowOk = true, denyOk = true;
  ALLOW.forEach(function (p) { if (users.hasPerm({ permId: p, userId: c.user.id }) !== true) allowOk = false; });
  DENY.forEach(function (p) { if (users.hasPerm({ permId: p, userId: c.user.id }) !== false) denyOk = false; });
  ok("TEST 2: cashier defaults — allowed set exact (sales/ticketPrint/returns/expense*/gift*/reports/reportPrint)", allowOk);
  ok("TEST 2: cashier defaults — denied set exact (reportExport/gameManage/employeeManage/payroll/dayReset/historyDelete/settings)", denyOk);
  ok("cashier stored permissions equal the registry default map",
     JSON.stringify(d1.store["malahy_users_v1"].cashiers[0].permissions) === JSON.stringify(PERMLIB.defaultCashierPerms()));

  /* ===== TEST 22: صلاحية غير معروفة → مرفوضة للكاشير ===== */
  ok("TEST 22: unknown permission id denies a cashier",
     users.hasPerm({ permId: "totallyInventedPerm", userId: c.user.id }) === false);
  ok("cashier payload contains no unknown permission ids",
     Object.keys(c.user.perms).every(function (p) { return PERMLIB.isKnownPerm(p); }));

  /* ===== TEST 19: إلغاء expenseDelete يمنع حذف المصروف ===== */
  const r19 = users.setCashierPermissions({ cashierId: c.user.id, permissions: { expenseDelete: false } });
  ok("TEST 19a: admin can disable expenseDelete", r19.ok === true);
  ok("TEST 19b: expenseDelete now denied for the cashier",
     users.hasPerm({ permId: "expenseDelete", userId: c.user.id }) === false);
  ok("TEST 19c: expenseAdd remains allowed (permissions are independent)",
     users.hasPerm({ permId: "expenseAdd", userId: c.user.id }) === true);

  /* ===== TEST 20: إلغاء giftDelete يمنع حذف الهدية ===== */
  const r20 = users.setCashierPermissions({ cashierId: c.user.id, permissions: { giftDelete: false } });
  ok("TEST 20a: admin can disable giftDelete", r20.ok === true);
  ok("TEST 20b: giftDelete now denied for the cashier",
     users.hasPerm({ permId: "giftDelete", userId: c.user.id }) === false);
  ok("TEST 20c: giftAdd remains allowed (permissions are independent)",
     users.hasPerm({ permId: "giftAdd", userId: c.user.id }) === true);

  /* ===== TEST 21: إعادة التفعيل تستعيد الوصول ===== */
  const r21 = users.setCashierPermissions({ cashierId: c.user.id, permissions: { expenseDelete: true, giftDelete: true } });
  ok("TEST 21a: admin can re-enable a permission", r21.ok === true);
  ok("TEST 21b: expenseDelete access restored",
     users.hasPerm({ permId: "expenseDelete", userId: c.user.id }) === true);
  ok("TEST 21c: giftDelete access restored",
     users.hasPerm({ permId: "giftDelete", userId: c.user.id }) === true);

  /* ===== أمان: الكاشير لا يستطيع رفع صلاحياته ===== */
  users.logout();
  ok("setCashierPermissions requires an admin session (denied logged out)",
     users.setCashierPermissions({ cashierId: c.user.id, permissions: {} }).ok === false);
  const cl = await users.login({ username: "sara", password: "sara1234" });
  ok("cashier login succeeds", cl.ok === true);
  ok("cashier cannot self-elevate to settings",
     users.setCashierPermissions({ cashierId: c.user.id, permissions: { settings: true } }).ok === false);
  ok("cashier remains denied settings after the self-elevation attempt",
     users.hasPerm({ permId: "settings" }) === false);
  ok("cashier cannot query another user's permissions",
     users.hasPerm({ permId: "sales", userId: "admin" }) === false);
  users.logout();

  /* ============ الترحيل (Migration) ============ */
  /* ===== مخزن 2: كاشير قديم بدون أي حقل صلاحيات ===== */
  const d2 = mkStore();
  const users2 = makeUsers(d2);
  const legacyHash = await users2.hashPassword("old-pass-1234");
  d2.store["malahy_users_v1"] = {
    schema: 1,
    admin: { id: "admin", username: "admin", passwordHash: legacyHash, recoveryWhatsapp: "", recoveryState: null },
    cashiers: [{ id: "usr_legacy", username: "legacycashier", passwordHash: legacyHash, mustChangePass: false, active: true }],
  };
  const adminBefore = JSON.stringify(d2.store["malahy_users_v1"].admin);
  await users2.initUsers();
  const after = d2.store["malahy_users_v1"];
  ok("migration: cashier with no permissions receives the cashier defaults",
     !!after.cashiers[0].permissions &&
     after.cashiers[0].permissions.sales === true &&
     after.cashiers[0].permissions.settings === false);
  ok("migration: admin record untouched (byte-identical)", JSON.stringify(after.admin) === adminBefore);
  ok("migration: no duplicate cashiers", after.cashiers.length === 1);
  const snap = JSON.stringify(after);
  await users2.initUsers();
  ok("migration: idempotent — second init changes nothing", JSON.stringify(d2.store["malahy_users_v1"]) === snap);

  /* ===== مخزن 3: كاشير له تخصيص موجود — لا يُكتب فوقه ===== */
  const d3 = mkStore();
  const users3 = makeUsers(d3);
  d3.store["malahy_users_v1"] = {
    schema: 1,
    admin: { id: "admin", username: "admin", passwordHash: legacyHash, recoveryWhatsapp: "", recoveryState: null },
    cashiers: [{ id: "usr_custom", username: "custom", passwordHash: legacyHash, permissions: { sales: true, reports: true }, active: true }],
  };
  await users3.initUsers();
  const cu = d3.store["malahy_users_v1"].cashiers[0];
  ok("migration: existing customized permission set is preserved (not overwritten with defaults)",
     cu.permissions.sales === true && cu.permissions.reports === true && cu.permissions.returns === undefined);
  ok("migration: customized cashier still denies un-granted permissions",
     users3.hasPerm({ permId: "returns", userId: "usr_custom" }) === false);

  /* ===== مخزن 4: أول تشغيل بدون كلمة سر قديمة ===== */
  const d4 = mkStore();
  const users4 = makeUsers(d4);
  const fresh = await users4.initUsers();
  ok("fresh init: admin created from the default password", fresh.admin && fresh.admin.username === "admin");
  ok("fresh init: admin has no stored permissions (implicit full access)",
     fresh.admin && !("permissions" in fresh.admin));
  ok("fresh init: no cashiers created by default", Array.isArray(fresh.cashiers) && fresh.cashiers.length === 0);
  ok("fresh init: legacy K_PASS left untouched (not written by init)", d4.store["malahy_pos_pass_v1"] === undefined);

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})();
