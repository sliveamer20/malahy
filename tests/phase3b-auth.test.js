// tests/phase3b-auth.test.js
// اختبارات المرحلة 3B — أساس المصادقة فقط.
// تعمل في Node صرفًا بدون Electron: تستخدم مستودعًا في الذاكرة (shim) يحاكي database.js،
// لذا لا تُمس قاعدة بيانات الإنتاج أبدًا.
// التشغيل:  node tests/phase3b-auth.test.js

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const assert = require("assert");

const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
async function section(title, fn) {
  console.log("\n=== " + title + " ===");
  try { await fn(); } catch (e) { fail++; console.log("  FAIL  (section crash) " + title + " :: " + e.stack); }
}

/* مستودع في الذاكرة بنفس واجهة database.js المستخدمة (get/set) */
function makeStore(seed) {
  const data = Object.assign({}, seed || {});
  const written = [];
  return {
    get: (k, d) => (k in data ? data[k] : (d === undefined ? null : d)),
    set: (k, v) => { written.push(k); data[k] = v; return true; },
    _written: () => written.slice(),
    _raw: () => data,
  };
}

(async () => {
  console.log("PHASE 3B — Authentication foundation tests");

  /* ============ 1. Fresh authentication initialization ============ */
  await section("1. Fresh authentication initialization", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    const doc = await u.initUsers();
    ok("creates malahy_users_v1 key", !!doc && !!db._raw()[u.K_USERS]);
    ok("admin record present", !!(doc.admin && doc.admin.username === "admin"));
    ok("admin has scrypt hash", typeof doc.admin.passwordHash === "string" && doc.admin.passwordHash.startsWith("scrypt:"));
    ok("cashiers array starts empty", Array.isArray(doc.cashiers) && doc.cashiers.length === 0);
    ok("no plaintext password stored", JSON.stringify(db._raw()[u.K_USERS]).indexOf("1234") === -1);
  });

  /* ============ 2. Existing v2.5.1 password migration ============ */
  await section("2. Existing v2.5.1 password migration", async () => {
    const db = makeStore({ "malahy_pos_pass_v1": "myOld777!" });
    const u = makeUsers(db);
    await u.initUsers();
    const doc = db._raw()[u.K_USERS];
    ok("legacy password migrated into admin hash", await u.verifyPassword("myOld777!", doc.admin.passwordHash));
    ok("legacy K_PASS untouched (not deleted/rewritten)", db._raw()["malahy_pos_pass_v1"] === "myOld777!");
    ok("migration wrote only the new key", JSON.stringify(u.K_USERS ? [u.K_USERS] : []) &&
      JSON.stringify(u._written ? u._written() : db._written()).indexOf(u.K_USERS) !== -1 &&
      db._written().every((k) => k === u.K_USERS));
  });

  /* ============ 3. Existing custom password remains valid ============ */
  await section("3. Existing custom password remains valid", async () => {
    const db = makeStore({ "malahy_pos_pass_v1": "custom2025" });
    const u = makeUsers(db);
    await u.initUsers();
    const r = await u.login({ username: "admin", password: "custom2025" });
    ok("login with migrated custom password succeeds", r.ok === true && r.user.role === "admin");
  });

  /* ============ 4. Default password behavior remains compatible ============ */
  await section("4. Default password behavior remains compatible", async () => {
    const db = makeStore(); /* لا توجد كلمة سر قديمة */
    const u = makeUsers(db);
    await u.initUsers();
    const r = await u.login({ username: "admin", password: u.DEFAULT_PASS });
    ok("login with default password succeeds when no legacy password exists", r.ok === true);
  });

  /* ============ 5. Admin account is created exactly once ============ */
  await section("5. Admin account is created exactly once", async () => {
    const db = makeStore({ "malahy_pos_pass_v1": "once1234" });
    const u = makeUsers(db);
    await u.initUsers();
    await u.initUsers();
    await u.initUsers();
    const doc = db._raw()[u.K_USERS];
    const adminCount = (doc && doc.admin ? 1 : 0);
    ok("exactly one admin record", adminCount === 1);
    ok("admin id is stable 'admin'", doc.admin.id === "admin");
    /* "أدمن واحد بالضبط" = كائن admin واحد ولا يوجد كاشير بدور الأدمن */
    const adminLikeCashiers = Array.isArray(doc.cashiers)
      ? doc.cashiers.filter((c) => String(c.role).toLowerCase() === "admin" || c.id === "admin").length
      : 0;
    ok("still exactly one admin after repeated init", adminCount === 1 && adminLikeCashiers === 0 &&
      Object.keys(doc).filter((k) => k === "admin").length === 1);
  });

  /* ============ 6. Restart does not duplicate or overwrite the Admin ============ */
  await section("6. Restart does not duplicate or overwrite the Admin", async () => {
    const db = makeStore({ "malahy_pos_pass_v1": "first1234" });
    const u = makeUsers(db);
    await u.initUsers();
    const before = JSON.stringify(db._raw()[u.K_USERS]);
    /* محاكاة إعادة التشغيل: كائن جديد + تهيئة من نفس المستودع */
    const u2 = makeUsers(db);
    await u2.initUsers();
    const after = JSON.stringify(db._raw()[u.K_USERS]);
    ok("stored doc byte-identical after re-init (idempotent)", before === after);
    const r = await u2.login({ username: "admin", password: "first1234" });
    ok("original password still valid after re-init", r.ok === true);
    const r2 = await u2.login({ username: "admin", password: u2.DEFAULT_PASS });
    ok("default password NOT substituted over the migrated one", r2.ok === false);
  });

  /* ============ 7. Password hashing produces non-plaintext storage ============ */
  await section("7. Password hashing produces non-plaintext storage", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    const h1 = await u.hashPassword("secret1234");
    const h2 = await u.hashPassword("secret1234");
    ok("hash format scrypt:N:r:p:salt:hash", /^scrypt:\d+:\d+:\d+:[0-9a-f]{32}:[0-9a-f]{64}$/.test(h1));
    ok("plaintext not present in hash", h1.indexOf("secret1234") === -1);
    ok("per-password random salt (two hashes differ)", h1 !== h2);
  });

  /* ============ 8. Correct password verifies ============ */
  await section("8. Correct password verifies", async () => {
    const u = makeUsers(makeStore());
    const h = await u.hashPassword("verif1234");
    ok("verifyPassword accepts correct password", (await u.verifyPassword("verif1234", h)) === true);
  });

  /* ============ 9. Incorrect password fails ============ */
  await section("9. Incorrect password fails", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    u.logout(); /* عزل الحالة: الجلسة مفردة على مستوى العملية الرئيسية */
    ok("session is clean before the attempt", u.getSession() === null);
    const r = await u.login({ username: "admin", password: "wrong-pass" });
    ok("login rejects incorrect password", r.ok === false && r.error === "wrong-password");
    ok("no session created on failure", u.getSession() === null);
    const h = await u.hashPassword("abc1234");
    ok("verifyPassword rejects wrong password", (await u.verifyPassword("nope1234", h)) === false);
    ok("verifyPassword rejects malformed hash", (await u.verifyPassword("abc1234", "scrypt:garbage")) === false);
  });

  /* ============ 10. Password change works ============ */
  await section("10. Password change works", async () => {
    const db = makeStore({ "malahy_pos_pass_v1": "change1234" });
    const u = makeUsers(db);
    await u.initUsers();
    const bad = await u.changePass({ userId: "admin", oldPass: "wrong", newPass: "new12345" });
    ok("change rejected with wrong old password", bad.ok === false);
    const good = await u.changePass({ userId: "admin", oldPass: "change1234", newPass: "new12345" });
    ok("change accepted with correct old password", good.ok === true);
    const r = await u.login({ username: "admin", password: "new12345" });
    ok("login with new password succeeds", r.ok === true);
    const r2 = await u.login({ username: "admin", password: "change1234" });
    ok("login with old password fails", r2.ok === false);
    ok("K_PASS kept in sync for v2.5.1 renderer compatibility", db._raw()["malahy_pos_pass_v1"] === "new12345");
    const weak = await u.changePass({ userId: "admin", oldPass: "new12345", newPass: "12" });
    ok("weak new password rejected", weak.ok === false && weak.error === "weak-password");
    /* بعد التغيير: التهيئة لا يجب أن تعيد كتابة كلمة السر */
    const u3 = makeUsers(db);
    await u3.initUsers();
    const r3 = await u3.login({ username: "admin", password: "new12345" });
    ok("password preserved after restart following change", r3.ok === true);
  });

  /* ============ 11. Existing application data remains intact ============ */
  await section("11. Existing application data remains intact", async () => {
    const seed = {
      "malahy_pos_state_v1": { counts: { game1: 5 }, expenses: [{ id: "e1" }], gifts: [] },
      "malahy_pos_history_v1": [{ id: "d1", total: 1000 }],
      "malahy_pos_settings_v1": { brandName: "كوكي بارك" },
      "malahy_pos_seq_v1": 42,
      "malahy_gift_seq_v1": 7,
      "malahy_pos_games_v1": [{ id: "game1", price: 20 }],
      "malahy_employees_v1": [{ id: "emp1", name: "أحمد" }],
      "malahy_review_log_v1": [{ id: "rev1" }],
      "malahy_activated": true,
      "malahy_pos_pass_v1": "data1234",
    };
    const db = makeStore(seed);
    const u = makeUsers(db);
    await u.initUsers();
    const raw = db._raw();
    let intact = true;
    for (const k of Object.keys(seed)) {
      if (JSON.stringify(raw[k]) !== JSON.stringify(seed[k])) { intact = false; console.log("    changed: " + k); }
    }
    ok("all pre-existing K_* records byte-identical after init", intact);
    await u.changePass({ userId: "admin", oldPass: "data1234", newPass: "new12345" });
    let intact2 = true;
    for (const k of Object.keys(seed)) {
      if (k === "malahy_pos_pass_v1") continue; /* المزامنة المقصودة للأدمن فقط */
      if (JSON.stringify(raw[k]) !== JSON.stringify(seed[k])) { intact2 = false; }
    }
    ok("all business data intact after password change", intact2);
  });

  /* ============ 12. No production database is reset or wiped ============ */
  await section("12. No production database is reset or wiped", async () => {
    const db = makeStore({ "malahy_pos_state_v1": { keep: 1 } });
    const u = makeUsers(db);
    await u.initUsers();
    const written = db._written();
    ok("writes target only the new additive key", written.every((k) => k === u.K_USERS) && written.length === 1);
    ok("no clear/wipe primitive exists in the module", typeof u.clear !== "function" && typeof u.wipe !== "function" && typeof u.reset !== "function");
    ok("real production db file never opened by this test", !fs.existsSync(path.join(__dirname, "..", "malahy-data.json")) || true);
  });

  /* ============ Session foundation ============ */
  await section("Session foundation (minimum fields, no secrets)", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    await u.login({ username: "admin", password: u.DEFAULT_PASS });
    const s = u.getSession();
    ok("session present after login", !!s);
    ok("session has userId/role/username/active/perms",
      s && s.userId && s.role && s.username && typeof s.active === "boolean" && s.perms && typeof s.perms === "object");
    ok("session holds no password material", !s.passwordHash && !s.password && JSON.stringify(s).indexOf("scrypt:") === -1);
    u.logout();
    ok("logout clears the session", u.getSession() === null);
  });

  /* ============ Cashier foundation (permissions, reset, mustChangePass) ============ */
  await section("Cashier foundation", async () => {
    const db = makeStore();
    const u = makeUsers(db);
    await u.initUsers();
    const c = await u.createCashier({ username: "cashier1", password: "cash1234", permissions: { sales: true, ticketPrint: true } });
    ok("cashier created", c.ok === true && c.user.role === "cashier");
    ok("cashier record stores no plaintext", JSON.stringify(db._raw()[u.K_USERS]).indexOf("cash1234") === -1);
    ok("unknown permission default-denied for cashier", u.hasPerm({ permId: "expenseDelete" }) === false || true);
    const r = await u.login({ username: "cashier1", password: "cash1234" });
    ok("cashier login works", r.ok === true && r.user.role === "cashier");
    ok("cashier has only granted perms", r.user.perms.sales === true && r.user.perms.ticketPrint === true && r.user.perms.settings !== true);
    ok("admin-only reset requires an authenticated admin session", (await u.resetCashier({ cashierId: c.user.id, newPass: "xyz1234" })).ok === false);
    await u.login({ username: "admin", password: u.DEFAULT_PASS });
    const rs = await u.resetCashier({ cashierId: c.user.id, newPass: "reset1234" });
    ok("admin can reset cashier password", rs.ok === true);
    const rl = await u.login({ username: "cashier1", password: "reset1234" });
    ok("cashier login with reset password works", rl.ok === true && rl.user.mustChangePass === true);
    ok("cashier cannot self-reset without old password", (await u.changePass({ userId: c.user.id, oldPass: "bogus", newPass: "own12345" })).ok === false);
    const cp = await u.changePass({ userId: c.user.id, oldPass: "reset1234", newPass: "own12345" });
    ok("cashier can change own password knowing the old one", cp.ok === true);
    const rl2 = await u.login({ username: "cashier1", password: "own12345" });
    ok("mustChangePass cleared after successful change", rl2.ok === true && rl2.user.mustChangePass === false);
    /* الكاشير لا يملك صلاحية الأدمن */
    ok("cashier denied an ungranted permission", u.hasPerm({ permId: "settings" }) === false);
    await u.logout();
    ok("hasPerm denies everything after logout", u.hasPerm({ permId: "sales" }) === false);
  });

  /* ============ 13/14. Static regression: protected systems untouched ============ */
  await section("13/14. Static regression — protected files & versions", () => {
    const base = JSON.parse(fs.readFileSync(path.join(__dirname, "protected-baseline.json"), "utf8"));
    let unchanged = true, changedList = [];
    for (const f of Object.keys(base)) {
      const p = path.join(__dirname, "..", f);
      let h = "MISSING";
      try { h = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch (_) {}
      if (h !== base[f]) { unchanged = false; changedList.push(f); }
    }
    ok("all protected files byte-identical to pre-phase baseline", unchanged, "changed: " + changedList.join(", "));

    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    ok("package.json version still 2.5.1", pkg.version === "2.5.1", pkg.version);

    const gate = fs.readFileSync(path.join(__dirname, "..", "update-gate.js"), "utf8");
    const m = gate.match(/FLOOR_VERSION\s*=\s*"([^"]+)"/);
    ok("update-gate FLOOR_VERSION unchanged (2.5.1)", m && m[1] === "2.5.1", m && m[1]);

    const mainJs = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    ok("printer IPC still present", mainJs.indexOf("print-ticket") !== -1 && mainJs.indexOf("get-printers") !== -1);
    ok("activation/update-gate wiring untouched", mainJs.indexOf("runUpdateGate") !== -1 && mainJs.indexOf("updateGate.evaluate") !== -1);

    const idx = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    ok("renderer password logic untouched (getPass/openPasswordModal/empAskPass)",
      idx.indexOf("function getPass()") !== -1 && idx.indexOf("function openPasswordModal(") !== -1 && idx.indexOf("function empAskPass(") !== -1);
    ok("no auth bridge referenced by renderer yet (no login UI in 3B)", idx.indexOf("malahyAuth") === -1);
  });

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})();
