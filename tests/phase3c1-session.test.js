// tests/phase3c1-session.test.js
// سلوك الجلسة على مستوى العملية الرئيسية (users.js) — المرحلة 3C-1.
// يغطي: نجاح/فشل الدخول، الجلسة المنظّفة، mustChangePass، تغيير كلمة السر،
// تسجيل الخروج، وعدم المساس بسجلات v2.5.1 الموجودة.
// يعمل على مستودع في الذاكرة — لا تُفتح أي قاعدة بيانات إنتاجية أبدًا.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms || 200)); }

/* مستودع في الذاكرة */
const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
  delete: (k) => { delete store[k]; return true; },
};
const users = makeUsers(db);

(async () => {
  console.log("PHASE 3C-1 — Main-process session behavior");

  /* سجلات v2.5.1 الموجودة (يجب أن تبقىbyte-identical) */
  const LEGACY = {
    "malahy_pos_state_v1": { day: "2025-01-01", total: 1000, expenses: [{ id: "x1", amt: 50 }] },
    "malahy_pos_history_v1": [{ id: "h1", day: "2024-12-31", total: 250 }],
    "malahy_pos_settings_v1": { brandName: "كوكي بارك", printerName: "P1", paperWidth: "auto" },
    "malahy_pos_games_v1": [{ id: "vr", name: "لعبة VR", price: 75, active: true }],
    "malahy_employees_v1": [{ id: "e1", name: "أحمد" }],
    "malahy_pos_seq_v1": { vr: 12 },
    "malahy_pos_pass_v1": "prod2025!",
  };
  Object.keys(LEGACY).forEach((k) => { store[k] = JSON.parse(JSON.stringify(LEGACY[k])); });
  const BEFORE = JSON.stringify({
    s: store["malahy_pos_state_v1"], h: store["malahy_pos_history_v1"],
    st: store["malahy_pos_settings_v1"], g: store["malahy_pos_games_v1"],
    e: store["malahy_employees_v1"], seq: store["malahy_pos_seq_v1"],
    pass: store["malahy_pos_pass_v1"],
  });

  await users.initUsers();

  /* ===== 4: بيانات الأدمن الصحيحة → نجاح ===== */
  let r = await users.login({ username: "admin", password: "prod2025!" });
  ok("correct admin credentials → login succeeds",
     r.ok === true && !!r.user && r.user.role === "admin", JSON.stringify(r));

  /* ===== 9: جلسة منظّفة (لا أسرار) ===== */
  const sess = users.getSession();
  ok("successful login creates a session", !!sess && sess.userId === "admin" && sess.role === "admin");
  ok("session holds no password/hash/secret",
     !!sess && !("password" in sess) && !("passwordHash" in sess) && !("salt" in sess) &&
     JSON.stringify(sess).indexOf("scrypt:") === -1);

  /* ===== 10: لا تجزئة/كلمة سر تُرجع للواجهة ===== */
  const doc = store["malahy_users_v1"];
  ok("login response carries no hash or salt",
     JSON.stringify(r.user).indexOf("scrypt:") === -1 &&
     JSON.stringify(r.user).indexOf("passwordHash") === -1 &&
     JSON.stringify(r.user).indexOf("salt") === -1);
  ok("stored admin record is a scrypt hash (not plaintext)",
     !!doc && typeof doc.admin.passwordHash === "string" &&
     doc.admin.passwordHash.indexOf("scrypt:") === 0 &&
     doc.admin.passwordHash.indexOf("prod2025!") === -1);
  ok("sanitized user payload shape",
     r.user.id === "admin" && r.user.username === "admin" && r.user.active === true &&
     r.user.mustChangePass === false && !!r.user.perms && r.user.perms.settings === true);

  users.logout();
  ok("logout clears the session", users.getSession() === null);
  ok("after logout hasPerm denies everything", users.hasPerm({ permId: "settings" }) === false);

  /* ===== 6/7/8: بيانات خاطئة → رفض ولا جلسة ===== */
  const wrong = await users.login({ username: "admin", password: "nope!" });
  ok("wrong password → login rejected", wrong.ok === false);
  ok("wrong password → no session created", users.getSession() === null);
  ok("wrong password error is a stable code (no leak wording)",
     wrong.error === "wrong-password" || wrong.error === "auth-failed");

  const unknown = await users.login({ username: "ghost", password: "whatever" });
  ok("unknown username → login rejected", unknown.ok === false);
  ok("unknown username → no session created", users.getSession() === null);
  ok("unknown username error is a stable code (no leak wording)",
     unknown.error === "user-not-found" || unknown.error === "auth-failed");

  /* ===== 5: بيانات الكاشير الصحيحة → نجاح ===== */
  const c = await users.createCashier({ username: "sara", password: "sara1234", permissions: { sales: true } });
  ok("cashier created for login test", c.ok === true);
  users.logout(); /* إنهاء جلسة الأدمن حتى لا تؤثر على اختبار الكاشير */
  const cl = await users.login({ username: "sara", password: "sara1234" });
  ok("correct cashier credentials → login succeeds",
     cl.ok === true && cl.user.role === "cashier", JSON.stringify(cl));
  ok("cashier session is sanitized too",
     JSON.stringify(cl.user).indexOf("scrypt:") === -1 && !cl.user.passwordHash);
  users.logout();

  /* ===== 11/12: mustChangePass ===== */
  /* كاشير جديد له mustChangePass=true (افتراضي createCashier) */
  ok("new cashier has mustChangePass=true", c.user.mustChangePass === true);
  const mc = await users.login({ username: "sara", password: "sara1234" });
  ok("mustChangePass cashier still authenticates (flag surfaced to renderer)",
     mc.ok === true && mc.user.mustChangePass === true);
  /* الواجهة هي من تمنع الدخول حتى التغيير؛ هنا نتحقق أن التغيير مطلوب وممكن */
  const blockedNoOld = await users.changePass({ userId: mc.user.id, oldPass: "wrongold", newPass: "newpass1234" });
  ok("forced change rejected without the current password", blockedNoOld.ok === false);
  const weak = await users.changePass({ userId: mc.user.id, oldPass: "sara1234", newPass: "12" });
  ok("forced change rejects a weak new password", weak.ok === false);
  const good = await users.changePass({ userId: mc.user.id, oldPass: "sara1234", newPass: "saraNew2025" });
  ok("forced change succeeds with the current password", good.ok === true);
  /* بعد التغيير يجب أن يُسمح بالدخول وmustChangePass قد أُلغي */
  const relogin = await users.login({ username: "sara", password: "saraNew2025" });
  ok("after forced change → login works with the new password",
     relogin.ok === true && relogin.user.mustChangePass === false, JSON.stringify(relogin));
  const oldNoMore = await users.login({ username: "sara", password: "sara1234" });
  ok("after forced change → old password no longer works", oldNoMore.ok === false);
  users.logout();

  /* ===== 13/14: تسجيل الخروج عبر طبقة IPC ===== */
  const li = await users.login({ username: "admin", password: "prod2025!" });
  ok("login again before logout test", li.ok === true && !!users.getSession());
  users.logout();
  ok("logout clears session (second time)", users.getSession() === null);
  ok("after logout → login screen state (hasPerm false)", users.hasPerm({ permId: "sales" }) === false);
  const re = await users.login({ username: "admin", password: "prod2025!" });
  ok("after logout → login succeeds again (session re-creatable)", re.ok === true);
  users.logout();

  /* ===== 15: سجلات قاعدة البيانات الموجودة كما هي ===== */
  const AFTER = JSON.stringify({
    s: store["malahy_pos_state_v1"], h: store["malahy_pos_history_v1"],
    st: store["malahy_pos_settings_v1"], g: store["malahy_pos_games_v1"],
    e: store["malahy_employees_v1"], seq: store["malahy_pos_seq_v1"],
    pass: store["malahy_pos_pass_v1"],
  });
  ok("existing K_* records byte-identical after the whole flow", BEFORE === AFTER);
  if (BEFORE !== AFTER) console.log("    before:", BEFORE, "\n    after :", AFTER);

  /* المفتاح الإضافي فقط هو ما كُتب */
  const keys = Object.keys(store);
  ok("no new top-level keys beyond the additive users key",
     keys.indexOf("malahy_users_v1") >= 0 &&
     keys.filter((k) => k.indexOf("malahy_") === 0).every((k) => (k in LEGACY) || k === "malahy_users_v1"),
     JSON.stringify(keys));

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
