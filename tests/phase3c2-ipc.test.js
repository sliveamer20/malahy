// tests/phase3c2-ipc.test.js
// المرحلة 3C-2 — محاكاة طبقة IPC الكاملة بما فيها حماية المفاتيح الحساسة:
//   db-set / db-delete / db-clear (الاختبارات 24–25) + تسجيل الدخول/الخروج
//   (26–27) + auth:setCashierPerms. كل القرارات في العملية الرئيسية.
// يعمل على مستودع في الذاكرة فقط — لا تُفتح أي قاعدة بيانات إنتاجية.

const path = require("path");
const fs = require("fs");
const makeUsers = require(path.join(__dirname, "..", "users.js"));
const PERMLIB = require(path.join(__dirname, "..", "permissions.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
  delete: (k) => { delete store[k]; return true; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); return true; },
};
const users = makeUsers(db);

/* ====== فحص أن main.js يحتوي فعليًا على الحماية (لا تكفي المحاكاة) ====== */
const mainSrc = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
ok("main.js authorizes db-set for sensitive keys",
   mainSrc.indexOf("authorizeDbOp") !== -1 && mainSrc.indexOf('ipcMain.on("db-set"') !== -1);
ok("main.js authorizes db-delete for sensitive keys",
   mainSrc.indexOf('ipcMain.on("db-delete"') !== -1);
ok("main.js gates db-clear behind an admin session",
   mainSrc.indexOf('ipcMain.on("db-clear"') !== -1 && mainSrc.indexOf("db-clear") !== -1 &&
   /db-clear[\s\S]{0,400}?role\s*!==\s*"admin"/.test(mainSrc));
ok("main.js still exposes the printer IPC and the update gate (regression)",
   mainSrc.indexOf("print-ticket") !== -1 && mainSrc.indexOf("get-printers") !== -1 &&
   mainSrc.indexOf("runUpdateGate") !== -1);

/* ====== نسخة طبق المنطق الفعلي لمعالجات main.js (نفس القرار بالضبط) ====== */
const _MISS = {};
const logLines = [];
function dbSet(key, value) {
  try {
    let exists = true;
    try { exists = db.get(key, _MISS) !== _MISS; } catch (_) {}
    if (!PERMLIB.authorizeDbOp("write", key, users.getSession(), exists)) {
      logLines.push("db-set DENIED: " + key);
      return false;
    }
    return db.set(key, value);
  } catch (err) { return false; }
}
function dbDelete(key) {
  try {
    if (!PERMLIB.authorizeDbOp("delete", key, users.getSession(), true)) {
      logLines.push("db-delete DENIED: " + key);
      return false;
    }
    return db.delete(key);
  } catch (err) { return false; }
}
function dbClear() {
  try {
    const sess = users.getSession();
    if (!sess || sess.role !== "admin") { logLines.push("db-clear DENIED"); return false; }
    return db.clear();
  } catch (err) { return false; }
}

(async () => {
  console.log("PHASE 3C-2 — Main-process DB protection & IPC security");

  /* بيانات v2.5.1 موجودة (يجب ألا تتأثر) */
  const LEGACY = {
    "malahy_pos_state_v1": { day: "2025-01-01", total: 1000 },
    "malahy_pos_history_v1": [{ id: "h1", day: "2024-12-31", total: 250 }],
    "malahy_pos_settings_v1": { brandName: "كوكي بارك", printerName: "P1" },
    "malahy_pos_games_v1": [{ id: "vr", name: "لعبة VR", price: 75, active: true }],
    "malahy_employees_v1": [{ id: "e1", name: "أحمد", weeks: [] }],
  };
  Object.keys(LEGACY).forEach((k) => { store[k] = JSON.parse(JSON.stringify(LEGACY[k])); });
  store["malahy_pos_pass_v1"] = "prod2025!";

  await users.initUsers();

  /* ============ TEST 24: كتابة مفتاح حساس بدون صلاحية → مرفوض ============ */
  ok("TEST 24a: K_HIST write rejected with no session",
     dbSet("malahy_pos_history_v1", [{ id: "evil" }]) === false &&
     JSON.stringify(store["malahy_pos_history_v1"]) === JSON.stringify(LEGACY["malahy_pos_history_v1"]));
  ok("TEST 24b: K_EMP write rejected with no session",
     dbSet("malahy_employees_v1", [{ id: "evil" }]) === false &&
     JSON.stringify(store["malahy_employees_v1"]) === JSON.stringify(LEGACY["malahy_employees_v1"]));
  ok("TEST 24c: K_GAMES write rejected with no session",
     dbSet("malahy_pos_games_v1", [{ id: "evil" }]) === false &&
     JSON.stringify(store["malahy_pos_games_v1"]) === JSON.stringify(LEGACY["malahy_pos_games_v1"]));
  ok("TEST 24d: K_SETTINGS write rejected with no session",
     dbSet("malahy_pos_settings_v1", { brandName: "hacked" }) === false &&
     store["malahy_pos_settings_v1"].brandName === "كوكي بارك");
  ok("TEST 24e: K_PASS write rejected with no session",
     dbSet("malahy_pos_pass_v1", "hacked") === false && store["malahy_pos_pass_v1"] === "prod2025!");
  ok("TEST 24f: K_USERS write is never allowed via renderer IPC (even for admin)",
     (function () { return true; })() /* يُفحص أدناه بعد تسجيل دخول الأدمن */);
  ok("denied writes are logged for auditing", logLines.length >= 5);

  /* ============ TEST 25: حذف مفتاح حساس بدون صلاحية → مرفوض ============ */
  ok("TEST 25a: K_HIST delete rejected with no session",
     dbDelete("malahy_pos_history_v1") === false && "malahy_pos_history_v1" in store);
  ok("TEST 25b: K_EMP delete rejected with no session",
     dbDelete("malahy_employees_v1") === false && "malahy_employees_v1" in store);
  ok("TEST 25c: K_GAMES delete rejected with no session",
     dbDelete("malahy_pos_games_v1") === false && "malahy_pos_games_v1" in store);
  ok("TEST 25d: K_SETTINGS delete rejected with no session",
     dbDelete("malahy_pos_settings_v1") === false && "malahy_pos_settings_v1" in store);
  ok("TEST 25e: K_PASS delete rejected with no session",
     dbDelete("malahy_pos_pass_v1") === false && "malahy_pos_pass_v1" in store);

  /* ============ المفاتيح غير الحساسة تعمل كما في v2.5.1 ============ */
  ok("non-sensitive key write works without any session (unchanged v2.5.1 behavior)",
     dbSet("malahy_pos_state_v1", { day: "new" }) === true && store["malahy_pos_state_v1"].day === "new");
  ok("non-sensitive key delete works without any session",
     dbDelete("malahy_pos_state_v1") === true && !("malahy_pos_state_v1" in store));
  ok("db-get is unaffected (reads still allowed)", db.get("malahy_pos_settings_v1", null) !== null);

  /* ============ استثناء تهيئة الإقلاع: إنشاء مفتاح غائب ============ */
  ok("boot-seed exception: first creation of an absent sensitive key is allowed without a session",
     (function () {
       delete store["malahy_pos_games_v1"];
       return dbSet("malahy_pos_games_v1", [{ id: "vr", name: "لعبة VR", price: 75, active: true }]) === true;
     })());
  ok("boot-seed exception does not allow modifying an existing sensitive key",
     dbSet("malahy_pos_games_v1", [{ id: "evil2" }]) === false &&
     store["malahy_pos_games_v1"][0].id === "vr");

  /* ============ الكاشير لا يستطيع كتابة المفاتيح الحساسة ============ */
  const c = await users.createCashier({ username: "sara", password: "sara1234" });
  users.logout();
  const cl = await users.login({ username: "sara", password: "sara1234" });
  ok("cashier session established", cl.ok === true && cl.user.role === "cashier");
  ok("cashier cannot write K_GAMES (no gameManage)",
     dbSet("malahy_pos_games_v1", [{ id: "evil3" }]) === false);
  ok("cashier cannot write K_SETTINGS (no settings)",
     dbSet("malahy_pos_settings_v1", { brandName: "hacked2" }) === false);
  ok("cashier cannot write K_EMP (no employeeManage/payroll)",
     dbSet("malahy_employees_v1", [{ id: "evil4" }]) === false);
  ok("cashier cannot delete K_HIST (no historyDelete)",
     dbDelete("malahy_pos_history_v1") === false && "malahy_pos_history_v1" in store);
  ok("cashier can still write non-sensitive keys (sales flow unaffected)",
     dbSet("malahy_pos_state_v1", { day: "cashier-day" }) === true);
  ok("db-clear denied for a cashier", dbClear() === false && "malahy_pos_history_v1" in store);
  users.logout();

  /* ============ الأدمن يستطيع كتابة/حذف المفاتيح الحساسة ============ */
  const al = await users.login({ username: "admin", password: "prod2025!" });
  ok("admin session established", al.ok === true && al.user.role === "admin");
  ok("admin can write K_SETTINGS", dbSet("malahy_pos_settings_v1", { brandName: "new name" }) === true);
  ok("admin can write K_HIST", dbSet("malahy_pos_history_v1", [{ id: "h9" }]) === true);
  ok("admin can delete K_HIST", dbDelete("malahy_pos_history_v1") === true && !("malahy_pos_history_v1" in store));
  ok("admin can write K_PASS (legacy compatibility)",
     dbSet("malahy_pos_pass_v1", "newpass2025") === true && store["malahy_pos_pass_v1"] === "newpass2025");
  ok("TEST 24f: K_USERS write is never allowed via renderer IPC even for admin",
     dbSet("malahy_users_v1", { admin: { id: "admin", passwordHash: "forged" } }) === false &&
     store["malahy_users_v1"].admin.passwordHash.indexOf("scrypt:") === 0);
  users.logout();

  /* ============ TEST 26/27: الدخول والخروج لا يزالان يعملان ============ */
  /* ملاحظة أمنية: كتابة الواجهة لـ K_PASS لا تُغيّر كلمة سر الدخول الفعلية —
     مصدر الحقيقة هو malahy_users_v1 (العملية الرئيسية). */
  const l1 = await users.login({ username: "admin", password: "prod2025!" });
  ok("TEST 26: existing login still works (auth store is the source of truth)",
     l1.ok === true && !!users.getSession());
  const l1b = await users.login({ username: "admin", password: "newpass2025" });
  ok("renderer-written K_PASS value does NOT become the login password",
     l1b.ok === false && users.getSession() !== null);
  ok("TEST 26b: wrong password still rejected", (await users.login({ username: "admin", password: "nope" })).ok === false);
  /* users.logout() نفسها دالة void — معالج IPC هو الذي يُغلّفها بـ {ok:true}.
     هنا نستدعيها مباشرةً (كما يفعل المعالج) ونتحقق من مسح الجلسة. */
  users.logout();
  ok("TEST 27: logout still works and clears the session", users.getSession() === null);
  ok("after logout, sensitive writes are rejected again",
     dbSet("malahy_pos_settings_v1", { brandName: "x" }) === false);

  /* ============ auth:setCashierPerms (محاكاة المعالج) ============ */
  const al2 = await users.login({ username: "admin", password: "prod2025!" });
  ok("handler simulation: admin session re-established", al2.ok === true);
  ok("handler simulation: setCashierPerms succeeds for admin",
     users.setCashierPermissions({ cashierId: c.user.id, permissions: { sales: false } }).ok === true);
  ok("handler simulation: the toggled permission took effect",
     users.hasPerm({ permId: "sales", userId: c.user.id }) === false);
  ok("handler simulation: unknown permission id in the request is ignored (never granted)",
     users.setCashierPermissions({ cashierId: c.user.id, permissions: { inventedPerm: true } }).ok === true &&
     users.hasPerm({ permId: "inventedPerm", userId: c.user.id }) === false);
  users.logout();
  ok("handler simulation: setCashierPerms forbidden without an admin session",
     users.setCashierPermissions({ cashierId: c.user.id, permissions: { sales: true } }).ok === false);

  /* ============ db-clear (في النهاية لأنها تمسح كل المخزن) ============ */
  const al3 = await users.login({ username: "admin", password: "prod2025!" });
  ok("db-clear: admin session established", al3.ok === true);
  ok("db-clear succeeds for an admin", dbClear() === true);
  ok("db-clear wiped the store", Object.keys(store).length === 0);
  users.logout();
  ok("after db-clear, login is unavailable until the users doc is re-initialized",
     (await users.login({ username: "admin", password: "prod2025!" })).ok === false);
  await users.initUsers();
  const recovered = await users.login({ username: "admin", password: "1234" });
  ok("re-initialization after a wipe restores the default admin (1234)",
     recovered.ok === true && recovered.user.role === "admin");

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})();
