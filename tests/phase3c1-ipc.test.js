// tests/phase3c1-ipc.test.js
// محاكاة كاملة لمسار IPC للمرحلة 3C-1: renderer → preload bridge → main handlers.
// يغطي تسجيل الدخول/الخروج عبر الجسر، تسريب الأسرار، وتغيير كلمة السر الإجباري.

const path = require("path");
const assert = require("assert");
const fs = require("fs");
const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms || 200)); }

/* مستودع في الذاكرة + محاكاة ipcMain.handle */
const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
};
const handlers = {};
const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };

/* التسجيل كما في main.js تمامًا (بما فيها auth:logout الجديد) */
const users = makeUsers(db);
ipcMain.handle("auth:login", async (_e, args) => {
  try { return await users.login(args || {}); } catch (e) { return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:changePass", async (_e, args) => {
  try { return await users.changePass(args || {}); } catch (e) { return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:resetCashier", async (_e, args) => {
  try { return await users.resetCashier(args || {}); } catch (e) { return { ok: false, error: "auth-failed" }; }
});
ipcMain.handle("auth:hasPerm", (_e, args) => { try { return users.hasPerm(args || {}); } catch (_) { return false; } });
ipcMain.handle("auth:logout", async () => {
  try { users.logout(); return { ok: true }; } catch (e) { return { ok: false, error: "auth-failed" }; }
});

/* التحقق أن main.js فعليًا يسجّل المعالج الجديد */
const mainSrc = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
ok("main.js registers auth:logout handler",
   mainSrc.indexOf('ipcMain.handle("auth:logout"') >= 0);

/* جسر preload.js كما هو معرَّض (InvokeReturn) — بما فيها logout */
const preloadSrc = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
ok("preload bridge exposes logout()", /logout\s*:\s*\(\s*\)\s*=>\s*ipcRenderer\.invoke\(\s*"auth:logout"\s*\)/.test(preloadSrc));
ok("preload bridge exposes login/changePass/hasPerm",
   preloadSrc.indexOf('"auth:login"') >= 0 && preloadSrc.indexOf('"auth:changePass"') >= 0 &&
   preloadSrc.indexOf('"auth:hasPerm"') >= 0);

const malahyAuth = {
  login: (username, password) => handlers["auth:login"]({}, { username, password }),
  changePass: (userId, oldPass, newPass) => handlers["auth:changePass"]({}, { userId, oldPass, newPass }),
  resetCashier: (cashierId, newPass) => handlers["auth:resetCashier"]({}, { cashierId, newPass }),
  hasPerm: (permId, userId) => handlers["auth:hasPerm"]({}, { permId, userId }),
  logout: () => handlers["auth:logout"]({}),
};

(async () => {
  console.log("PHASE 3C-1 — End-to-end IPC bridge simulation");
  store["malahy_pos_pass_v1"] = "prod2025!";
  await users.initUsers();

  /* ===== دخول ناجح عبر الجسر ===== */
  const good = await malahyAuth.login("admin", "prod2025!");
  ok("bridge login accepts migrated admin password",
     good.ok === true && good.user.role === "admin", JSON.stringify(good));

  /* ===== لا تسريب للأسرار ===== */
  const blob = JSON.stringify(good.user);
  ok("bridge user payload has no hash/salt/password",
     blob.indexOf("scrypt:") === -1 && blob.indexOf("passwordHash") === -1 &&
     blob.indexOf("salt") === -1 && blob.indexOf("password") === -1);

  /* ===== دخول فاشل عبر الجسر ===== */
  await malahyAuth.logout(); /* نبدأ من حالة «لا جلسة» تمامًا كشاشة الدخول */
  ok("no session after logout", users.getSession() === null);
  const bad = await malahyAuth.login("admin", "wrong!");
  ok("bridge login rejects wrong password", bad.ok === false);
  ok("failed bridge login creates no session", users.getSession() === null);
  const ghost = await malahyAuth.login("nobody", "x");
  ok("bridge login rejects unknown username", ghost.ok === false);
  ok("failed bridge login still creates no session", users.getSession() === null);

  /* ===== hasPerm بعد الدخول ===== */
  await malahyAuth.login("admin", "prod2025!");
  ok("bridge hasPerm true for admin after login", (await malahyAuth.hasPerm("settings")) === true);

  /* ===== mustChangePass عبر الجسر (كاشير) ===== */
  const c = await users.createCashier({ username: "sara", password: "sara1234", permissions: { sales: true } });
  await malahyAuth.logout();
  const cl = await malahyAuth.login("sara", "sara1234");
  ok("bridge: cashier with mustChangePass authenticates, flag surfaced",
     cl.ok === true && cl.user.mustChangePass === true, JSON.stringify(cl));
  const cp = await malahyAuth.changePass(cl.user.id, "sara1234", "saraNew2025");
  ok("bridge: forced changePass works", cp.ok === true, JSON.stringify(cp));
  const after = await malahyAuth.login("sara", "saraNew2025");
  ok("bridge: cashier can enter after changing password",
     after.ok === true && after.user.mustChangePass === false, JSON.stringify(after));

  /* ===== تسجيل الخروج عبر الجسر ===== */
  await malahyAuth.login("admin", "prod2025!");
  ok("session exists before logout", !!users.getSession());
  const lo = await malahyAuth.logout();
  ok("bridge logout returns ok", lo.ok === true, JSON.stringify(lo));
  ok("bridge logout clears the main-process session", users.getSession() === null);
  ok("after logout hasPerm is false", (await malahyAuth.hasPerm("settings")) === false);
  ok("after logout db data intact (K_PASS untouched by logout)", store["malahy_pos_pass_v1"] === "prod2025!");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
