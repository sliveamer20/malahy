// tests/phase3b-ipc.test.js
// محاكاة كاملة لمسار IPC: renderer → preload bridge → main handlers.
// نستبدل ipcMain/ipcRenderer بمحاكاة بسيطة، ونعيد بناء نفس الجسر المعرَّض في preload.js،
// ونسجّل نفس معالجات main.js — للتأكد أن العقد الكامل متّسقبل ويعمل من طرف لطرف.

const path = require("path");
const assert = require("assert");
const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

/* مستودع في الذاكرة + محاكاة ipcMain.handle */
const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
};
const handlers = {};
const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };

/* نفس تسجيل main.js تمامًا */
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

/* نفس جسر preload.js (InvokeReturn) */
const malahyAuth = {
  login: (username, password) => handlers["auth:login"]({}, { username, password }),
  changePass: (userId, oldPass, newPass) => handlers["auth:changePass"]({}, { userId, oldPass, newPass }),
  resetCashier: (cashierId, newPass) => handlers["auth:resetCashier"]({}, { cashierId, newPass }),
  hasPerm: (permId, userId) => handlers["auth:hasPerm"]({}, { permId, userId }),
};

(async () => {
  console.log("PHASE 3B — End-to-end IPC bridge simulation");
  store["malahy_pos_pass_v1"] = "prod2025!";

  const init = await users.initUsers();
  ok("main-side initUsers ran", !!(init && init.admin));

  /* renderer login via the preload bridge */
  const bad = await malahyAuth.login("admin", "nope");
  ok("bridge login rejects wrong password", bad.ok === false);
  const good = await malahyAuth.login("admin", "prod2025!");
  ok("bridge login accepts migrated password", good.ok === true && good.user.role === "admin");
  ok("bridge user payload carries no password hash",
    JSON.stringify(good.user).indexOf("scrypt:") === -1 && !good.user.passwordHash);

  /* changePass through the bridge */
  const cp = await malahyAuth.changePass("admin", "prod2025!", "bridge1234");
  ok("bridge changePass works", cp.ok === true);
  const li = await malahyAuth.login("admin", "bridge1234");
  ok("new password works through bridge", li.ok === true);
  ok("K_PASS synced so the untouched v2.5.1 renderer keeps working", store["malahy_pos_pass_v1"] === "bridge1234");

  /* hasPerm through the bridge — admin implicitly allowed */
  ok("bridge hasPerm true for admin (known perm)", (await malahyAuth.hasPerm("settings")) === true);
  ok("bridge hasPerm true for admin (unknown perm id)", (await malahyAuth.hasPerm("doesNotExist")) === true);

  /* cashier management through the bridge (admin session required) */
  users.logout(); /* الجلسة مفردة على مستوى العملية: ننهيها لمحاكاة "لا يوجد أدمن" */
  const c = await users.createCashier({ username: "sara", password: "sara1234", permissions: { sales: true } });
  ok("cashier created", c.ok === true);
  const denied = await malahyAuth.resetCashier(c.user.id, "newSara123");
  ok("resetCashier denied without an admin session (main-side decision)", denied.ok === false && denied.error === "forbidden");
  await malahyAuth.login("admin", "bridge1234"); /* أدمن الآن */
  const rs = await malahyAuth.resetCashier(c.user.id, "newSara123");
  ok("resetCashier allowed for admin", rs.ok === true);
  const cl = await malahyAuth.login("sara", "newSara123");
  ok("cashier logs in with the reset password", cl.ok === true && cl.user.mustChangePass === true);
  ok("cashier limited to granted perms", (await malahyAuth.hasPerm("sales")) === true && (await malahyAuth.hasPerm("settings")) === false);
  ok("cashier cannot query another user's perms", (await malahyAuth.hasPerm("sales", "admin")) === false);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
