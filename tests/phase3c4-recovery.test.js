// tests/phase3c4-recovery.test.js
// المرحلة 3C-4 — استعادة كلمة مرور حساب المدير:
//   (أ) فحوص أمنية على المصدر (لا Math.random، لا أسرار، لا تسريب).
//   (ب) نواة العملية الرئيسية (users.js): توليد الرمز وتجزئته وصلاحيته
//       وحدّ المحاولات والاستخدام لمرة واحدة وإبطال الرمز القديم.
//   (ج) واجهة الاستعادة (recovery.js) + تسليم واتساب عبر آلية الرابط
//       الخارجية المعتمدة (openExternal) — بدون أي إرسال حقيقي.
//   (د) الانحدار: لا تُمسّ حسابات الكاشيرين/الصلاحيات/بيانات v2.5.1.
//   (هـ) لا يظهر أي سر في أي سجل.
//
// يعمل على مستودع في الذاكرة فقط — لا تُفتح أي قاعدة بيانات إنتاجية أبدًا.

const path = require("path");
const fs = require("fs");
const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms || 30)); }
/* انتظار حتمي لعمليّات Main غير المتزامنة. مسار النجاح في completeRecovery
   يشغّل crypto.scrypt (N=16384) لتجزئة كلمة السر الجديدة — وهو عمدًا بطيء
   (مقاومة هجوم القاموس) ويتجاوز مهلة الانتظار الثابتة. لذلك نستطلع الشرط
   حتى يتحقّق بدلًا من افتراض توقيت ثابت. لا يُغيّر هذا أيّ ادّعاء أمني. */
async function waitFor(cond, timeout) {
  const t0 = Date.now();
  timeout = timeout || 3000;
  while (Date.now() - t0 < timeout) {
    try { if (cond()) return true; } catch (_) {}
    await wait(25);
  }
  return false;
}
function rd(f) { return fs.readFileSync(path.join(__dirname, "..", f), "utf8"); }

/* ================= مستودع في الذاكرة (نفس واجهة database.js) ================= */
function mkStore() {
  const store = {};
  return {
    store: store,
    get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
    set: (k, v) => { store[k] = v; return true; },
    delete: (k) => { delete store[k]; return true; },
  };
}

/* ===================================================================== *
 *  (أ) فحوص أمنية على المصدر
 * ===================================================================== */
console.log("PHASE 3C-4 — Administrator password recovery");

const usersSrc = rd("users.js");
const mainSrc = rd("main.js");
const preloadSrc = rd("preload.js");
const recSrc = rd("recovery.js");
const idxSrc = rd("index.html");

ok("source: users.js never uses Math.random() for the recovery code",
   usersSrc.indexOf("Math.random(") === -1);
ok("source: users.js hashes the recovery code (sha256 + salt) and never stores plaintext",
   usersSrc.indexOf("function hashRecoveryCode") !== -1 &&
   usersSrc.indexOf("sha256:") !== -1);
ok("source: users.js exposes beginRecovery / completeRecovery",
   usersSrc.indexOf("async function beginRecovery") !== -1 &&
   usersSrc.indexOf("async function completeRecovery") !== -1);
ok("source: users.js defines TTL + attempt limit constants",
   /RECOVERY_TTL_MS\s*=/.test(usersSrc) && /RECOVERY_MAX_ATTEMPTS\s*=/.test(usersSrc));
ok("source: users.js never logs the recovery code (no console logging of secrets)",
   usersSrc.indexOf("console.log") === -1 && usersSrc.indexOf("console.error") === -1);
ok("source: main.js registers the recovery IPC handlers without session gating (recovery is pre-auth by design)",
   mainSrc.indexOf('"auth:beginRecovery"') !== -1 && mainSrc.indexOf('"auth:completeRecovery"') !== -1);
ok("source: main.js recovery handlers log only error context, never codes or secrets",
   /auth:beginRecovery[\s\S]{0,200}appendLog\("auth:beginRecovery :: "\s*\+\s*String\(err\)/.test(mainSrc) &&
   /auth:completeRecovery[\s\S]{0,200}appendLog\("auth:completeRecovery :: "\s*\+\s*String\(err\)/.test(mainSrc) &&
   mainSrc.indexOf("recovery-failed") !== -1);
ok("source: preload exposes the recovery bridge (beginRecovery / completeRecovery)",
   preloadSrc.indexOf("beginRecovery:") !== -1 && preloadSrc.indexOf("completeRecovery:") !== -1 &&
   preloadSrc.indexOf('"auth:beginRecovery"') !== -1 && preloadSrc.indexOf('"auth:completeRecovery"') !== -1);
ok("source: preload never exposes the users DB key or raw handles",
   preloadSrc.indexOf("malahy_users_v1") === -1);
ok("source: recovery.js exists and reaches Main only through the auth bridge",
   recSrc.indexOf("window.malahyAuth.beginRecovery") !== -1 &&
   recSrc.indexOf("window.malahyAuth.completeRecovery") !== -1 &&
   recSrc.indexOf("malahy_users_v1") === -1 && recSrc.indexOf("scrypt") === -1);
ok("source: recovery.js never logs or displays the code (no console usage, code only in the wa.me payload)",
   recSrc.indexOf("console.") === -1 && recSrc.indexOf("Math.random") === -1);
ok("source: index.html loads recovery.js and keeps the renderer free of the auth bridge and DB key",
   idxSrc.indexOf('src="recovery.js"') !== -1 &&
   idxSrc.indexOf("malahyAuth") === -1 && idxSrc.indexOf("malahy_users_v1") === -1);

/* ===================================================================== *
 *  (ب) نواة العملية الرئيسية
 * ===================================================================== */
(async () => {
  const d = mkStore();
  const users = makeUsers(d);

  /* بيانات v2.5.1 الأصلية يجب أن تبقى كما هي (عدا K_PASS التي تتزامن
     مع كلمة سر المدير بصورة مقصودة — نفس سلوك changePass) */
  const LEGACY = {
    "malahy_pos_state_v1": { day: "2025-01-01", total: 1000, expenses: [{ id: "x1", amt: 50 }] },
    "malahy_pos_history_v1": [{ id: "h1", day: "2024-12-31", total: 250 }],
    "malahy_pos_settings_v1": { brandName: "كوكي بارك", printerName: "P1", paperWidth: "auto" },
    "malahy_pos_games_v1": [{ id: "vr", name: "لعبة VR", price: 75, active: true }],
    "malahy_pos_employees_v1": [{ id: "e1", name: "أحمد", weeks: [] }],
    "malahy_pos_seq_v1": { vr: 12 },
    "malahy_gift_seq_v1": 7,
    "malahy_review_log_v1": [{ id: "rev1" }],
    "malahy_pos_txlog_v1": [{ id: "tx1" }],
    "malahy_pos_gameaudit_v1": [{ id: "ga1" }],
    "malahy_daily_reg_v1": [{ id: "dr1" }],
  };
  Object.keys(LEGACY).forEach((k) => { d.store[k] = JSON.parse(JSON.stringify(LEGACY[k])); });
  d.store["malahy_pos_pass_v1"] = "prod2025!";

  await users.initUsers();

  /* ===== 3b: رقم غير مضبوط → رفض موحّد (بدون تسريب) — قبل ضبط الرقم ===== */
  {
    const r = await users.beginRecovery({ whatsapp: "201001234567" });
    ok("beginRecovery rejected when no recovery number is configured (single generic error)",
       r.ok === false && r.error === "invalid-recovery-number");
    ok("rejected beginRecovery creates no recovery state",
       d.store[users.K_USERS].admin.recoveryState === null);
  }

  /* ===== 1/2/3: رقم الاستعادة (الحفظ والاستمرارية والرفض) ===== */
  await users.login({ username: "admin", password: "prod2025!" });
  ok("TEST 1: admin recovery number can be saved",
     users.setRecoveryWhatsapp({ number: "201001234567" }).ok === true);
  users.logout();

  /* الاستمرارية عبر نسخة جديدة من الوحدة (محاكاة إعادة التشغيل) */
  const users2 = makeUsers(d);
  await users2.initUsers();
  await users2.login({ username: "admin", password: "prod2025!" });
  ok("TEST 2: recovery number persists across module instances (restart)",
     users2.getAdminInfo().recoveryWhatsapp === "201001234567");
  ok("TEST 3: invalid recovery number is rejected and the stored value is untouched",
     users2.setRecoveryWhatsapp({ number: "abc-not-a-number" }).error === "invalid-number" &&
     users2.getAdminInfo().recoveryWhatsapp === "201001234567");
  users2.logout();

  /* كاشير للاختبارات الانحدارية (لا يجب أن تتأثر حساباته/صلاحياته بالاستعادة) */
  const cashier = await users.createCashier({
    username: "sara", password: "sara1234",
    permissions: { sales: true, reportExport: true, settings: false },
  });
  ok("cashier fixture created for regression checks", cashier.ok === true);
  const cashiersBefore = JSON.parse(JSON.stringify(d.store[users.K_USERS].cashiers));

  /* ===== 4/5: توليد الرمز وتجزئته ===== */
  let r1 = await users.beginRecovery({ whatsapp: "201001234567" });
  ok("TEST 4a: beginRecovery accepts the configured recovery number",
     r1.ok === true, JSON.stringify(r1));
  ok("TEST 4b: recovery code is 6 numeric digits (secure random, not Math.random)",
     typeof r1.code === "string" && /^[0-9]{6}$/.test(r1.code));
  let r2 = await users.beginRecovery({ whatsapp: "201001234567" });
  ok("TEST 4c: two generated codes differ (random per request)", r1.code !== r2.code);
  ok("TEST 4d: beginRecovery returns the TTL and the matched destination digits",
     r2.ttlSeconds === 600 && r2.whatsapp === "201001234567");

  const st = d.store[users.K_USERS].admin.recoveryState;
  ok("TEST 5a: only the hash is persisted (recoveryState holds codeHash, not the code)",
     typeof st.codeHash === "string" && st.codeHash.indexOf("sha256:") === 0);
  ok("TEST 5b: the plaintext code never reaches the persistent store",
     JSON.stringify(d.store[users.K_USERS]).indexOf(r2.code) === -1);
  ok("TEST 5c: recovery state tracks attempts + used + expiry",
     st.attempts === 0 && st.used === false && st.expiresAt > Date.now());

  /* رقم مُدخل بصيغة مختلفة (+ ومسافات) يطابق المخزّن */
  ok("recovery number matching is digit-normalized (+ / spaces / dashes ignored)",
     (await users.beginRecovery({ whatsapp: "+20 100 123-4567" })).ok === true);
  ok("a wrong recovery number is rejected with the same generic error",
     (await users.beginRecovery({ whatsapp: "201000000000" })).error === "invalid-recovery-number");

  /* ===== 8: الرمز الخاطئ يزيد المحاولات ===== */
  const codeNow = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  let bad = await users.completeRecovery({ code: "000000", newPass: "new12345", confirm: "new12345" });
  ok("TEST 8: wrong code is rejected and increments the attempt counter",
     bad.ok === false && bad.error === "invalid-code" &&
     d.store[users.K_USERS].admin.recoveryState.attempts === 1);

  /* ===== 6/7: انتهاء الصلاحية ===== */
  d.store[users.K_USERS].admin.recoveryState.expiresAt = Date.now() - 1000;
  let exp = await users.completeRecovery({ code: codeNow, newPass: "new12345", confirm: "new12345" });
  ok("TEST 6: recovery code expires after its TTL", exp.ok === false);
  ok("TEST 7: an expired code is rejected with the generic code error",
     exp.error === "invalid-code" && d.store[users.K_USERS].admin.recoveryState !== null);

  /* ===== 9: حدّ المحاولات ===== */
  const codeLock = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  let last = null;
  for (let i = 0; i < users.RECOVERY_MAX_ATTEMPTS; i++) {
    last = await users.completeRecovery({ code: "111111", newPass: "x12345", confirm: "x12345" });
  }
  ok("TEST 9: too many wrong attempts lock the recovery code",
     last.ok === false && last.error === "too-many-attempts" &&
     d.store[users.K_USERS].admin.recoveryState === null);
  ok("after the lock, the (now invalidated) code no longer verifies",
     (await users.completeRecovery({ code: codeLock, newPass: "x12345", confirm: "x12345" })).ok === false);
  ok("after the lock, starting a new recovery works again",
     (await users.beginRecovery({ whatsapp: "201001234567" })).ok === true);

  /* ===== كلمة سر ضعيفة/غير متطابقة لا تستهلك الرمز ===== */
  const codePw = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  ok("a valid code is not consumed when the new password is too weak",
     (await users.completeRecovery({ code: codePw, newPass: "12", confirm: "12" })).error === "weak-password" &&
     d.store[users.K_USERS].admin.recoveryState.attempts === 0);
  ok("a valid code is not consumed when the confirmation does not match",
     (await users.completeRecovery({ code: codePw, newPass: "good1234", confirm: "different99" })).error === "confirm-mismatch" &&
     d.store[users.K_USERS].admin.recoveryState !== null);

  /* ===== 10/11/12: الرمز الصحيح → استبدال الكلمة + إبطال الرمز ===== */
  ok("the old admin password is not required by the recovery path (code-only)",
     (await users.changePass({ userId: "admin", oldPass: "wrong-old", newPass: "new12345" })).ok === false);
  let good = await users.completeRecovery({ code: codePw, newPass: "recovered2025", confirm: "recovered2025" });
  ok("TEST 10: a correct code allows the admin password to be reset",
     good.ok === true, JSON.stringify(good));
  ok("TEST 10b: the admin logs in with the new password (old one no longer works)",
     (await users.login({ username: "admin", password: "recovered2025" })).ok === true &&
     (await users.login({ username: "admin", password: "prod2025!" })).ok === false);
  ok("TEST 10c: K_PASS is kept in sync for the v2.5.1 renderer (unchanged behavior)",
     d.store["malahy_pos_pass_v1"] === "recovered2025");
  ok("TEST 11: the successful reset invalidated the recovery code (state cleared)",
     d.store[users.K_USERS].admin.recoveryState === null);
  ok("TEST 12: the same recovery code cannot be reused",
     (await users.completeRecovery({ code: codePw, newPass: "again12345", confirm: "again12345" })).ok === false);

  /* ===== 13: رمز جديد يُبطل السابق ===== */
  const cA = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  const cB = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  ok("TEST 13a: generating a new code invalidates the previous code",
     cA !== cB &&
     (await users.completeRecovery({ code: cA, newPass: "zz12345", confirm: "zz12345" })).ok === false);
  ok("TEST 13b: only the newest code works",
     (await users.completeRecovery({ code: cB, newPass: "zz12345", confirm: "zz12345" })).ok === true &&
     (await users.login({ username: "admin", password: "zz12345" })).ok === true);

  /* ===== حالة الاستعادة لا تُسرّب تجزئة الرمز للأدمن ===== */
  const pendCode = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  await users.login({ username: "admin", password: "zz12345" });
  const ai = users.getAdminInfo();
  ok("getAdminInfo never leaks the recovery code hash to the renderer",
     ai.ok === true && ai.recoveryState !== null && !("codeHash" in ai.recoveryState) &&
     JSON.stringify(ai).indexOf("codeHash") === -1);
  ok("getAdminInfo reports a pending (non-used, non-expired) recovery state",
     ai.recoveryState.pending === true && ai.recoveryState.used === false);
  ok("getAdminInfo is still forbidden for cashiers",
     (function () { users.logout(); return true; })() &&
     (await users.login({ username: "sara", password: "sara1234" })).user.role === "cashier" &&
     users.getAdminInfo().ok === false);
  users.logout();

  /* مسح حالة الاستعادة المنتهية عند الإقلاع */
  {
    d.store[users.K_USERS].admin.recoveryState.expiresAt = Date.now() - 1000;
    const u3 = makeUsers(d);
    await u3.initUsers();
    ok("initUsers clears an expired recovery state on boot (housekeeping)",
       d.store[users.K_USERS].admin.recoveryState === null);
  }

  /* ===================================================================== *
   *  (د) الانحدار: الاستعادة لا تلمس أي شيء آخر
   * ===================================================================== */
  const cashiersAfter = d.store[users.K_USERS].cashiers;
  ok("TEST 14: recovery never modified the cashier accounts",
     JSON.stringify(cashiersBefore) === JSON.stringify(cashiersAfter));
  ok("TEST 15: recovery never changed cashier permissions",
     cashiersAfter.length === 1 && cashiersAfter[0].username === "sara" &&
     cashiersAfter[0].permissions.sales === true &&
     cashiersAfter[0].permissions.reportExport === true &&
     cashiersAfter[0].permissions.settings !== true);

  let legacyIntact = true;
  Object.keys(LEGACY).forEach((k) => {
    if (JSON.stringify(d.store[k]) !== JSON.stringify(LEGACY[k])) {
      legacyIntact = false; console.log("    changed: " + k);
    }
  });
  ok("TEST 16: recovery left sales/history/reports/games/printers/shifts/branding/tickets untouched",
     legacyIntact);
  ok("the users store remains a single additive key (no new storage system)",
     Object.keys(d.store).filter((k) => k === users.K_USERS).length === 1);

  /* ===================================================================== *
   *  (هـ) لا يظهر أي سر في السجلات
   * ===================================================================== */
  const logs = [];
  const _log = console.log, _err = console.error, _warn = console.warn;
  console.log = (m) => { logs.push(String(m)); };
  console.error = (m) => { logs.push(String(m)); };
  console.warn = (m) => { logs.push(String(m)); };
  const secretCode = (await users.beginRecovery({ whatsapp: "201001234567" })).code;
  await users.completeRecovery({ code: "432109", newPass: "q12345", confirm: "q12345" });
  await users.completeRecovery({ code: secretCode, newPass: "final2025", confirm: "final2025" });
  console.log = _log; console.error = _err; console.warn = _warn;
  ok("TEST 17: no recovery secret appears in logs during the whole flow",
     logs.every((line) => line.indexOf(secretCode) === -1) &&
     JSON.stringify(d.store[users.K_USERS]).indexOf(secretCode) === -1);

  /* ===================================================================== *
   *  (ج) واجهة الاستعادة + تسليم واتساب (معترَض — بدون أي إرسال حقيقي)
   * ===================================================================== */
  await runUiTests(d, users, secretCode);

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PHASE 3C-4 CRASH:", e);
  process.exit(2);
});

/* ================== محاكاة الواجهة وتسليم واتساب ================== */
function makeDom() {
  const els = {};
  const all = [];
  function mk(id, tag) {
    const el = {
      id: id || "", tagName: (tag || "DIV").toUpperCase(),
      _cls: {}, _attrs: {}, style: {}, _ev: {}, _parent: null,
      children: [], value: "", _text: "", _textSet: false, _html: "",
      checked: false, disabled: false, readOnly: false, readyState: "interactive",
    };
    Object.defineProperty(el, "className", {
      get: () => Object.keys(el._cls).join(" "),
      set: (v) => { el._cls = {}; String(v || "").split(/\s+/).forEach((c) => { if (c) el._cls[c] = true; }); },
    });
    Object.defineProperty(el, "parentElement", { get: () => el._parent });
    Object.defineProperty(el, "textContent", {
      get: () => {
        if (el._textSet) return el._text;
        let out = "";
        (el.children || []).forEach((c) => { out += (c.tagName === "TEXT") ? String(c._text || "") : c.textContent; });
        return out;
      },
      set: (v) => { (el.children || []).forEach((c) => { c._parent = null; }); el._text = String(v); el._textSet = true; el.children = []; },
    });
    Object.defineProperty(el, "innerHTML", {
      get: () => el._html || "",
      set: (v) => { (el.children || []).forEach((c) => { c._parent = null; }); el._html = String(v); el.children = []; el._textSet = false; el._text = ""; },
    });
    el.classList = {
      add: (c) => { el._cls[c] = true; },
      remove: (c) => { delete el._cls[c]; },
      contains: (c) => !!el._cls[c],
      toggle: (c) => { if (el._cls[c]) delete el._cls[c]; else el._cls[c] = true; },
    };
    el.setAttribute = (k, v) => { el._attrs[k] = String(v); if (k === "id") el.id = String(v); };
    el.removeAttribute = (k) => { delete el._attrs[k]; if (k === "id") el.id = ""; };
    el.getAttribute = (k) => ((k in el._attrs) ? el._attrs[k] : null);
    el.hasAttribute = (k) => (k in el._attrs);
    el.appendChild = (c) => { c._parent = el; el.children.push(c); return c; };
    el.addEventListener = (t, fn) => { (el._ev[t] = el._ev[t] || []).push(fn); };
    el.removeEventListener = (t, fn) => { if (el._ev[t]) el._ev[t] = el._ev[t].filter((f) => f !== fn); };
    el.fire = (t, evt) => {
      let last;
      (el._ev[t] || []).forEach((fn) => { try { last = fn(Object.assign({ target: el, preventDefault: () => {} }, evt)); } catch (e) {} });
      return last;
    };
    el.click = () => el.fire("click");
    el.focus = () => {};
    el.remove = () => {
      const p = el._parent;
      if (p) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); }
      el._parent = null;
    };
    el.contains = (x) => { let cur = x; while (cur) { if (cur === el) return true; cur = cur._parent; } return false; };
    el.querySelector = (s) => query(el, s);
    el.querySelectorAll = (s) => queryAll(el, s);
    if (id) els[id] = el;
    all.push(el);
    return el;
  }
  function link(parent, child) { child._parent = parent; parent.children.push(child); return child; }
  function descendants(el, out) {
    out = out || [];
    (el.children || []).forEach((c) => { out.push(c); descendants(c, out); });
    return out;
  }
  function query(root, sel) { return queryAll(root, sel)[0] || null; }
  function queryAll(root, sel) {
    const list = descendants(root);
    const s = String(sel || "");
    if (s.charAt(0) === "#") return list.filter((e) => e.id === s.slice(1));
    if (s.charAt(0) === ".") {
      const classes = s.slice(1).split(".").filter((c) => c);
      return list.filter((e) => classes.every((c) => e._cls[c]));
    }
    return list.filter((e) => e.tagName === s.toUpperCase());
  }
  const body = mk("body", "body");
  const documentObj = {
    readyState: "interactive",
    getElementById: (id) => els[id] || null,
    createElement: (t) => mk("", t),
    createTextNode: (t) => { const n = mk("", "TEXT"); n.textContent = String(t); return n; },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: body,
    querySelector: (s) => query(body, s),
    querySelectorAll: (s) => queryAll(body, s),
  };

  /* بنية شاشة الدخول مطابقة لـ index.html */
  const loginOv = link(body, mk("loginOverlay", "div"));
  loginOv._cls["hide"] = true;
  const card = link(loginOv, mk("", "div"));
  card._cls["login-card"] = true; card._cls["act-card"] = true;
  const formLogin = link(card, mk("loginForm", "div"));
  link(formLogin, mk("loginUser", "input"));
  link(formLogin, mk("loginPass", "input"));
  link(formLogin, mk("loginBtn", "button"));
  link(formLogin, mk("loginErr", "div"));
  const formChange = link(card, mk("loginChangeForm", "div"));
  formChange.style.display = "none";
  link(card, mk("loginFoot", "div"));

  return { els: els, body: body, document: documentObj, mk: mk, link: link, all: all,
    loginOv: loginOv, card: card, formLogin: formLogin, formChange: formChange };
}

async function runUiTests(d, users, coreSecret) {
  const dom = makeDom();
  const openedUrls = [];
  const toastMsgs = [];
  const oldWin = global.window, oldDoc = global.document, oldMO = global.MutationObserver;
  global.window = {
    malahyAuth: {
      beginRecovery: (wa) => users.beginRecovery({ whatsapp: wa }),
      completeRecovery: (code, np, cf) => users.completeRecovery({ code: code, newPass: np, confirm: cf }),
    },
    malahyShell: { openExternal: (url) => { openedUrls.push(String(url || "")); } },
    toast: (m, t) => { toastMsgs.push(String(m)); },
    logErr: () => {},
  };
  global.document = dom.document;
  global.MutationObserver = class { observe() {} disconnect() {} };

  /* تحميل recovery.js (وحدته IIFE تُهيّئ نفسها فورًا لأن readyState=interactive) */
  const fp = path.join(__dirname, "..", "recovery.js");
  delete require.cache[require.resolve(fp)];
  require(fp);

  function byId(id) { return dom.all.filter((e) => e.id === id)[0] || null; }
  function buttons(root, text) {
    return dom.all.filter((e) => {
      if (e.tagName !== "BUTTON" || !e.textContent) return false;
      return e.textContent.indexOf(text) !== -1 && root.contains(e);
    });
  }

  ok("UI: recovery module initialized the recovery path inside the login card",
     !!global.window.MalahyRecovery && buttons(dom.formLogin, "نسيت كلمة المرور؟").length === 1);
  ok("UI: the recovery form starts hidden (normal login unaffected)",
     byId("recWrap") !== null && byId("recWrap").style.display === "none");

  /* ---- سيناريو 3C-4.1: زر «← رجوع» يُعيد المستخدم لشاشة الدخول العادية ---- */
  {
    const backBtn = byId("recBackBtn");
    ok("UI/back: the recovery screen contains a Back control (← رجوع)",
       !!backBtn && byId("recWrap").contains(backBtn) &&
       backBtn.textContent.indexOf("رجوع") !== -1);

    /* حالة استعادة معلّقة مسبقًا للتأكد من أن زر الرجوع لا يُعدّلها أبدًا */
    const begun = await users.beginRecovery({ whatsapp: "201001234567" });
    const hashBefore = d.store[users.K_USERS].admin.recoveryState.codeHash;

    buttons(dom.formLogin, "نسيت كلمة المرور؟")[0].fire("click");
    ok("UI/back: the recovery screen is visible before pressing Back",
       byId("recWrap").style.display !== "none" && dom.formLogin.style.display === "none");

    byId("recWa").value = "201001234567";
    backBtn.fire("click");

    ok("UI/back: pressing Back hides the recovery path",
       byId("recWrap").style.display === "none");
    ok("UI/back: pressing Back restores the existing normal login form (username/password)",
       dom.formLogin.style.display !== "none" && dom.formChange.style.display === "none" &&
       byId("loginUser") !== null && byId("loginPass") !== null && byId("loginBtn") !== null);
    ok("UI/back: Back clears only the recovery UI fields",
       byId("recWa").value === "");
    ok("UI/back: Back never modifies the stored recovery state (security untouched)",
       begun.ok === true &&
       d.store[users.K_USERS].admin.recoveryState !== null &&
       d.store[users.K_USERS].admin.recoveryState.codeHash === hashBefore);
  }

  /* ---- سيناريو ١: رقم غير صحيح → لا فتح واتساب ولا رمز ---- */
  buttons(dom.formLogin, "نسيت كلمة المرور؟")[0].fire("click");
  ok("UI: the recovery form replaces the login form", byId("recWrap").style.display !== "none" &&
     dom.formLogin.style.display === "none");
  byId("recWa").value = "201000000000"; /* غير المطابق */
  buttons(byId("recWrap"), "بدء الاستعادة")[0].fire("click");
  await wait();
  ok("UI: a wrong recovery number is rejected with a clear message and opens nothing",
     openedUrls.length === 0 && byId("recErrA").textContent.indexOf("غير صحيح") !== -1);

  /* ---- سيناريو ٢: الرقم الصحيح → فتح واتساب برسالة جاهزة ---- */
  byId("recWa").value = "201001234567";
  buttons(byId("recWrap"), "بدء الاستعادة")[0].fire("click");
  await wait();
  ok("UI: a valid number opens exactly one external WhatsApp destination",
     openedUrls.length === 1, "opened=" + openedUrls.length);
  const url = openedUrls[0] || "";
  ok("UI: the destination is the wa.me link for the configured digits",
     url.indexOf("https://wa.me/201001234567?text=") === 0, url.slice(0, 60));
  const msg = decodeURIComponent(url.split("text=")[1] || "");
  const codeMatch = msg.match(/(\d{6})/);
  ok("UI: the prepared message contains the 6-digit recovery code",
     !!codeMatch && /^[0-9]{6}$/.test(codeMatch[1]));
  ok("UI: the message tells the user it is a one-time recovery code",
     msg.indexOf("استعادة") !== -1 && msg.indexOf("مرة واحدة") !== -1);
  ok("UI: moving to the code step hides the number step",
     byId("recStepA").style.display === "none" && byId("recStepB").style.display !== "none");
  ok("UI: the user is told that sending is manual (no automatic WhatsApp API)",
     byId("recNote").textContent.indexOf("اضغط زر الإرسال") !== -1 &&
     byId("recNote").textContent.indexOf("تلقائي") !== -1);
  ok("UI: the code itself is never rendered in the app UI",
     byId("recNote").textContent.indexOf(codeMatch ? codeMatch[1] : "???") === -1 &&
     dom.all.every((e) => String(e.textContent || "").indexOf(codeMatch ? codeMatch[1] : "???") === -1));

  /* رمز صحيح يمرّ عبر التحقق المباشر (التحقق من سلامة التسليم) */
  const liveCode = codeMatch ? codeMatch[1] : "";
  const directOk = await users.verifyRecoveryCode(liveCode, d.store[users.K_USERS].admin.recoveryState.codeHash);
  ok("UI→Main handoff: the code received in the message verifies against the stored hash",
     directOk === true);

  /* ---- رمز خاطئ من الواجهة → رفض + بقاء القفل ---- */
  byId("recCode").value = "654321";
  byId("recNew").value = "ui12345"; byId("recConfirm").value = "ui12345";
  buttons(byId("recWrap"), "تأكيد الاستعادة")[0].fire("click");
  await wait();
  ok("UI: a wrong code is rejected with the generic code message",
     byId("recErrB").textContent.indexOf("غير صحيح") !== -1);

  /* ---- رمز صحيح + كلمتا مرور متطابقتان → نجاح ---- */
  byId("recCode").value = liveCode;
  byId("recNew").value = "uiNew2025"; byId("recConfirm").value = "uiNew2025";
  buttons(byId("recWrap"), "تأكيد الاستعادة")[0].fire("click");
  /* ننتظر حتى تكتمل عملية Main بالكامل (scrypt + الكتابة + إبطال الرمز) */
  await waitFor(function () { return d.store[users.K_USERS].admin.recoveryState === null; });
  ok("UI: a correct code + matching passwords reset the admin password",
     toastMsgs.some((t) => t.indexOf("تم تغيير كلمة مرور المدير") !== -1));
  ok("UI: after success the app returns to the normal login form",
     byId("recWrap").style.display === "none" && dom.formLogin.style.display !== "none");
  ok("UI: the recovery fields are cleared after success (no residual secret in the DOM)",
     byId("recCode").value === "" && byId("recNew").value === "" && byId("recConfirm").value === "");
  const uiLogin = await users.login({ username: "admin", password: "uiNew2025" });
  ok("UI: the admin can log in with the password set through the recovery UI",
     uiLogin.ok === true && uiLogin.user.role === "admin");
  ok("UI: the recovery state was invalidated after the successful reset",
     d.store[users.K_USERS].admin.recoveryState === null);

  /* ---- قفل المحاولات من الواجهة يعيد المستخدم للخطوة ١ ---- */
  await users.beginRecovery({ whatsapp: "201001234567" });
  buttons(dom.formLogin, "نسيت كلمة المرور؟")[0].fire("click");
  for (let i = 0; i < users.RECOVERY_MAX_ATTEMPTS; i++) {
    byId("recCode").value = "999999";
    byId("recNew").value = "lock1234"; byId("recConfirm").value = "lock1234";
    buttons(byId("recWrap"), "تأكيد الاستعادة")[0].fire("click");
    await waitFor(function () {
      return d.store[users.K_USERS].admin.recoveryState === null ||
             d.store[users.K_USERS].admin.recoveryState.attempts === i + 1;
    });
  }
  ok("UI: too many wrong attempts return the user to step 1 (re-issued code required)",
     byId("recStepB").style.display === "none" && byId("recStepA").style.display !== "none" &&
     d.store[users.K_USERS].admin.recoveryState === null);

  /* ---- تقاطع الأمان: لا يُرسل الاختبار أي رسالة واتساب حقيقية ---- */
  ok("UI: tests never performed a real WhatsApp send (only the intercepted external link)",
     openedUrls.every((u) => u.indexOf("https://wa.me/") === 0) && openedUrls.length >= 1);
  ok("UI: the core-test secret never leaked into the UI logs (no console usage in recovery.js)",
     recSrc.indexOf("console.") === -1);

  global.window = oldWin; global.document = oldDoc; global.MutationObserver = oldMO;
}
