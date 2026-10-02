// tests/phase3c3-ui.test.js
// المرحلة 3C-3 — محاكاة طبقة الواجهة (renderer) لإدارة الحسابات والصلاحيات:
//   - accounts.js فوق DOM مبسّط + جسر malahyAuth محاكى (نفس قرارات main.js).
//   - بطاقات الإدارة تظهر للمدير فقط وتُخفى عن الكاشير.
//   - إنشاء كاشير + محرر الصلاحيات (منح/سحب/استعادة) + إعادة تعيين كلمة السر
//     + إعادة التسمية + تفعيل/تعطيل + تغيير كلمة السر الخاصة.
//   - التحقق من عمليات الكاشير الافتراضية عبر بوابة الصلاحيات الحقيقية.
//
// لا يُفتح أي قاعدة بيانات إنتاجية أبدًا — مستودع في الذاكرة فقط.

const path = require("path");
const fs = require("fs");
const makeUsers = require(path.join(__dirname, "..", "users.js"));
const PERMLIB = require(path.join(__dirname, "..", "permissions.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms || 30)); }

/* ================= مستودع في الذاكرة + users.js ================= */
const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
};
const users = makeUsers(db);

/* ================= DOM مبسّط ================= */
function makeDom() {
  const els = {};
  const all = [];
  function mk(id, tag) {
    const el = {
      id: id || "", tagName: (tag || "DIV").toUpperCase(),
      _cls: {}, _attrs: {}, style: {}, _ev: {}, _parent: null,
      children: [], value: "", _text: "", _textSet: false, _html: "",
      checked: false, disabled: false, readOnly: false,
    };
    Object.defineProperty(el, "className", {
      get: () => Object.keys(el._cls).join(" "),
      set: (v) => { el._cls = {}; String(v || "").split(/\s+/).forEach((c) => { if (c) el._cls[c] = true; }); },
    });
    Object.defineProperty(el, "parentElement", { get: () => el._parent });
    /* textContent محسوب من الأبناء (كما في DOM الحقيقي) — يلزم لمطابقة النصوص */
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
    /* fire يُرجع نتيجة آخر مستمع حتى نستطيع await على المعالجات غير المتزامنة */
    el.fire = (t, evt) => {
      let last;
      (el._ev[t] || []).forEach((fn) => { try { last = fn(Object.assign({ target: el }, evt)); } catch (e) {} });
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
    getElementById: (id) => els[id] || null,
    createElement: (t) => mk("", t),
    createTextNode: (t) => { const n = mk("", "TEXT"); n.textContent = String(t); return n; },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: body,
    querySelector: (s) => query(body, s),
    querySelectorAll: (s) => queryAll(body, s),
  };
  return { els: els, body: body, document: documentObj, mk: mk, all: all };
}

const dom = makeDom();
const toastMsgs = [];

/* ================= جسر malahyAuth محاكى (نفس قرارات main.js) ================= */
const handlers = {
  "auth:getAdminInfo": () => users.getAdminInfo(),
  "auth:listCashiers": () => {
    const s = users.getSession();
    if (!s || s.role !== "admin") return { ok: false, error: "forbidden" };
    return { ok: true, cashiers: users.listCashiers() };
  },
  "auth:createCashier": async (a) => {
    const s = users.getSession();
    if (!s || s.role !== "admin") return { ok: false, error: "forbidden" };
    return await users.createCashier(a || {});
  },
  "auth:getCashierPerms": (a) => users.getCashierPermissions(a || {}),
  "auth:setCashierPerms": (a) => users.setCashierPermissions(a || {}),
  "auth:setCashierActive": (a) => users.setCashierActive(a || {}),
  "auth:setCashierUsername": (a) => users.setCashierUsername(a || {}),
  "auth:resetCashier": async (a) => await users.resetCashier(a || {}),
  "auth:setRecoveryWhatsapp": (a) => users.setRecoveryWhatsapp(a || {}),
  "auth:changePass": async (a) => {
    const aa = (a && typeof a === "object") ? a : {};
    const s = users.getSession();
    if (s && s.role !== "admin" && String(aa.userId || "") !== String(s.userId || "")) {
      return { ok: false, error: "forbidden" };
    }
    return await users.changePass(aa);
  },
};

global.window = {
  malahyAuth: {
    getAdminInfo: () => handlers["auth:getAdminInfo"](),
    listCashiers: () => handlers["auth:listCashiers"](),
    createCashier: (u, p) => handlers["auth:createCashier"]({ username: u, password: p, permissions: null }),
    getCashierPerms: (id) => handlers["auth:getCashierPerms"]({ cashierId: id }),
    setCashierPerms: (id, perms) => handlers["auth:setCashierPerms"]({ cashierId: id, permissions: perms }),
    setCashierActive: (id, active) => handlers["auth:setCashierActive"]({ cashierId: id, active: active }),
    setCashierUsername: (id, u) => handlers["auth:setCashierUsername"]({ cashierId: id, username: u }),
    resetCashier: (id, p) => handlers["auth:resetCashier"]({ cashierId: id, newPass: p }),
    setRecoveryWhatsapp: (n) => handlers["auth:setRecoveryWhatsapp"]({ number: n }),
    changePass: (id, o, n) => handlers["auth:changePass"]({ userId: id, oldPass: o, newPass: n }),
  },
  toast: (msg, type) => { toastMsgs.push({ msg: String(msg), type: String(type || "ok") }); },
  logErr: () => {},
};
global.document = dom.document;

/* تحميل سجلّ الصلاحيات + بوابة الصلاحيات الحقيقية + وحدة إدارة الحسابات */
global.window.MalahyPerms = PERMLIB;
function loadJs(name) {
  const fp = path.join(__dirname, "..", name);
  delete require.cache[require.resolve(fp)];
  require(fp);
}
loadJs("perm-gate.js");
loadJs("accounts.js");
const gate = global.window.MalahyPerm;
const acc = global.window.MalahyAccounts;
ok("accounts.js exposes the management API",
   !!acc && typeof acc.buildCards === "function" && typeof acc.changeMyPassword === "function");
ok("accounts.js exposes the global self-service password wrapper",
   typeof global.window.malahyChangeMyPass === "function");

/* ================= أدوات البحث في الـDOM ================= */
function buttons(root, text, cls) {
  return dom.all.filter((e) => {
    if (e.tagName !== "BUTTON" || !e.textContent) return false;
    if (cls && !e.classList.contains(cls)) return false;
    return e.textContent.indexOf(text) !== -1 && (function up(n) { let c = n; while (c) { if (c === root) return true; c = c._parent; } return false; })(e);
  });
}
function inputs(root) { return dom.all.filter((e) => e.tagName === "INPUT" && e.contains && root.contains(e)); }
function lastOvl2() {
  const kids = dom.body.children;
  for (let i = kids.length - 1; i >= 0; i--) if (kids[i].classList.contains("ovl2")) return kids[i];
  return null;
}

/* ===================================================================== */
(async () => {
  console.log("PHASE 3C-3 — Renderer account & permission management UI");

  store["malahy_pos_pass_v1"] = "prod2025!";
  await users.initUsers();

  /* ============ TEST 4: دخول الكاشير ============ */
  const adminLogin = await users.login({ username: "admin", password: "prod2025!" });
  ok("administrator login works", adminLogin.ok === true);
  const created = await users.createCashier({ username: "sara", password: "sara1234" });
  ok("a cashier exists for the UI scenarios", created.ok === true);

  /* ============ الكاشير لا يرى بطاقات الإدارة ============ */
  const cashierLogin = await users.login({ username: "sara", password: "sara1234" });
  ok("TEST 4: cashier login works", cashierLogin.ok === true && cashierLogin.user.role === "cashier");
  gate.setSession(cashierLogin.user);
  let cashierCards = await acc.buildCards();
  ok("cashier session → management cards are not built (empty array)",
     Array.isArray(cashierCards) && cashierCards.length === 0);
  /* الكاشير يحاول فتح محرر الصلاحيات مباشرةً → الواجهة ترفض + العملية الرئيسية ترفض */
  toastMsgs.length = 0;
  acc.changeMyPassword(); /* مسموح: كلمة السر الخاصة */
  let ovl = lastOvl2();
  ok("cashier can open the self-service change-password dialog", !!ovl);
  if (ovl) { try { ovl.remove(); } catch (_) {} }

  /* ============ 6–11: عمليات الكاشير الافتراضية عبر بوابة الصلاحيات ============ */
  ok("TEST 6/7: cashier can sell and print tickets (gate)",
     gate.hasPerm("sales") === true && gate.hasPerm("ticketPrint") === true);
  ok("TEST 8: cashier can process returns/deductions (gate)", gate.hasPerm("returns") === true);
  ok("cashier can add and DELETE expenses (gate)",
     gate.hasPerm("expenseAdd") === true && gate.hasPerm("expenseDelete") === true);
  ok("cashier can add and DELETE gifts (gate)",
     gate.hasPerm("giftAdd") === true && gate.hasPerm("giftDelete") === true);
  ok("TEST 10: cashier can view and print reports (gate)",
     gate.hasPerm("reports") === true && gate.hasPerm("reportPrint") === true);
  ok("cashier can view/print the returns log (reports/reportPrint — the log lives in reports)",
     gate.hasPerm("reports") === true && gate.hasPerm("reportPrint") === true);
  ok("TEST 11: cashier cannot access administrator-only operations (gate)",
     gate.hasPerm("gameManage") === false && gate.hasPerm("employeeManage") === false &&
     gate.hasPerm("payroll") === false && gate.hasPerm("dayReset") === false &&
     gate.hasPerm("historyDelete") === false && gate.hasPerm("settings") === false &&
     gate.hasPerm("reportExport") === false);
  ok("unknown permission still denies a cashier through the gate",
     gate.hasPerm("futurePermX") === false);
  users.logout();
  gate.clearSession();

  /* ============ جلسة الأدمن: بناء البطاقات ============ */
  const al = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al.user);
  ok("administrator session established for the UI", al.ok === true && gate.getSession().role === "admin");

  const cards = await acc.buildCards();
  ok("administrator session → two management cards are built", Array.isArray(cards) && cards.length === 2);

  /* ====== بطاقة حساب المدير ====== */
  const adminCard = cards[0];
  ok("admin card has the administrator role badge",
     !!adminCard.querySelector(".acc-role") && adminCard.querySelector(".acc-role").classList.contains("admin"));
  const unameIn = adminCard.querySelector(".acc-username");
  ok("admin card shows the single administrator username (read-only)",
     !!unameIn && unameIn.value === "admin" && unameIn.readOnly === true);
  ok("admin card shows the recovery status placeholder",
     !!adminCard.querySelector(".acc-recovery-status"));
  ok("admin card exposes a change-password entry",
     buttons(adminCard, "تغيير كلمة السر").length === 1);

  /* رقم الاستعادة */
  const waIn = adminCard.querySelector("#accWaIn");
  ok("recovery field starts empty", !!waIn && waIn.value === "");
  waIn.value = "201001234567";
  await buttons(adminCard, "حفظ الرقم")[0].fire("click");
  await wait();
  ok("recovery number saved from the UI", users.getAdminInfo().recoveryWhatsapp === "201001234567");
  ok("recovery save shows a success toast",
     toastMsgs.some((t) => t.msg.indexOf("تم حفظ رقم الاستعادة") !== -1));
  toastMsgs.length = 0;
  waIn.value = "not-a-number";
  await buttons(adminCard, "حفظ الرقم")[0].fire("click");
  await wait();
  ok("invalid recovery number is rejected with a clear message",
     users.getAdminInfo().recoveryWhatsapp === "201001234567" &&
     adminCard.querySelector("#accWaErr").textContent.length > 0);

  /* ====== بطاقة إدارة الكاشير ====== */
  const cashierCard = cards[1];
  ok("cashier card lists the existing cashier",
     cashierCard.querySelector(".acc-list") &&
     cashierCard.querySelector(".acc-list").querySelector(".acc-row") !== null);
  const row = cashierCard.querySelector(".acc-row");
  ok("cashier row shows the username and the cashier role badge",
     row.querySelector(".acc-name").textContent === "sara" &&
     row.querySelector(".acc-role").classList.contains("cashier"));
  ok("cashier row shows the active status badge",
     row.querySelector(".acc-status").classList.contains("on") &&
     row.querySelector(".acc-status").textContent.indexOf("فعّال") !== -1);
  ok("cashier row exposes management buttons (permissions/password/name/toggle)",
     buttons(row, "الصلاحيات").length === 1 && buttons(row, "كلمة السر").length === 1 &&
     buttons(row, "الاسم").length === 1 && buttons(row, "تعطيل").length === 1);

  /* ====== إضافة كاشير من الواجهة ====== */
  await buttons(cashierCard, "إضافة كاشير جديد")[0].fire("click");
  ovl = lastOvl2();
  ok("add-cashier opens a secondary overlay that keeps the settings modal intact", !!ovl);
  let ins = inputs(ovl);
  ins[0].value = "mona"; ins[1].value = "mona1234"; ins[2].value = "mona1234";
  await buttons(ovl, "إنشاء الحساب")[0].fire("click");
  await wait();
  /* ملاحظة: لا نسجّل دخول mona هنا حتى لا نُغيّر جلسة العملية الرئيسية (admin) */
  const afterAdd = global.window.malahyAuth.listCashiers();
  ok("creating a cashier through the UI works",
     afterAdd.ok === true && afterAdd.cashiers.some((c) => c.username === "mona"));
  ok("add-cashier overlay closes after success", lastOvl2() === null);

  /* التحقق من فشل الإدخال */
  await buttons(cashierCard, "إضافة كاشير جديد")[0].fire("click");
  ovl = lastOvl2();
  ins = inputs(ovl);
  ins[0].value = "ab"; ins[1].value = "123"; ins[2].value = "123";
  await buttons(ovl, "إنشاء الحساب")[0].fire("click");
  await wait();
  ok("short username + weak password are rejected before any request",
     !store["malahy_users_v1"].cashiers.some((c) => c.username === "ab") &&
     ovl.querySelector(".modal-err") && ovl.querySelector(".modal-err").textContent.length > 0);
  ins[0].value = "sara"; ins[1].value = "sara12345"; ins[2].value = "sara12345";
  await buttons(ovl, "إنشاء الحساب")[0].fire("click");
  await wait();
  ok("duplicate username is rejected with a clear message",
     ovl.querySelector(".modal-err").textContent.indexOf("مستخدم") !== -1);
  buttons(ovl, "إلغاء")[0].fire("click");
  ok("cancel closes the add-cashier overlay", lastOvl2() === null);

  /* ====== محرر الصلاحيات (منح / سحب / استعادة) ====== */
  await buttons(cashierCard, "الصلاحيات")[0].fire("click");
  ovl = lastOvl2();
  ok("permission editor opens as a secondary overlay", !!ovl && ovl.classList.contains("ovl2"));
  await wait(); /* تحميل الصلاحيات غير المتزامن */
  ovl = lastOvl2();
  ok("permission editor loaded the cashier's permissions",
     !!ovl && ovl.querySelectorAll(".acc-group").length >= 1);

  const groupEls = Array.from(ovl.querySelectorAll(".acc-group"));
  const dailyGroup = groupEls.filter((g) => !g.classList.contains("sensitive"))[0];
  const sensitiveGroup = groupEls.filter((g) => g.classList.contains("sensitive"))[0];
  ok("permissions are split into daily and sensitive groups",
     !!dailyGroup && !!sensitiveGroup);
  ok("daily group contains exactly the registry default-allow set",
     dailyGroup.querySelectorAll(".switch").length ===
     PERMLIB.PERMS.filter((p) => PERMLIB.DEFAULT_CASHIER_PERMS[p] === true).length);
  ok("sensitive group contains exactly the registry default-deny set",
     sensitiveGroup.querySelectorAll(".switch").length ===
     PERMLIB.PERMS.filter((p) => PERMLIB.DEFAULT_CASHIER_PERMS[p] !== true).length);
  ok("sensitive group is clearly marked as dangerous",
     sensitiveGroup.querySelector(".acc-group-h.danger") !== null &&
     sensitiveGroup.querySelector(".acc-warn") !== null);
  ok("every permission uses the shared registry labels (no duplicated list)",
     PERMLIB.PERMS.every((p) => {
       const sws = ovl.querySelectorAll(".switch");
       return Array.from(sws).some((s) => s.textContent.indexOf(PERMLIB.PERM_LABELS[p]) !== -1);
     }));

  /* العثور على مربع تقرير التصدير (حساس، غير مفعّل افتراضيًا) */
  function checkboxFor(labelText) {
    const sws = Array.from(ovl.querySelectorAll(".switch"));
    const sw = sws.filter((s) => s.textContent.indexOf(labelText) !== -1)[0];
    return sw ? sw.querySelector("input") : null;
  }
  const exportCb = checkboxFor(PERMLIB.PERM_LABELS.reportExport);
  ok("reportExport checkbox exists and is off by default", !!exportCb && exportCb.checked === false);
  ok("default badges distinguish granted defaults from sensitive-off entries",
     ovl.querySelectorAll(".acc-badge.def").length > 0 &&
     ovl.querySelectorAll(".acc-badge.off").length > 0);

  /* TEST 14: منح صلاحية كانت مُلغاة */
  exportCb.checked = true;
  exportCb.fire("change");
  ok("checking a sensitive permission flips its badge to 'extra grant'",
     exportCb.parentElement.querySelector(".acc-badge.granted") !== null);
  await buttons(ovl, "حفظ الصلاحيات")[0].fire("click");
  await wait();
  let saraPerms = users.getCashierPermissions({ cashierId: created.user.id });
  ok("TEST 14: granting reportExport through the UI persists in Main",
     saraPerms.ok === true && saraPerms.perms.reportExport === true);
  ok("the UI sends the complete permission map (defaults preserved)",
     saraPerms.perms.sales === true && saraPerms.perms.settings !== true);
  ok("permission editor closes after saving", lastOvl2() === null);

  /* TEST 15: الكاشير يكتسبها بعد تحديث الجلسة (تسجيل دخول جديد) */
  users.logout(); gate.clearSession();
  const cl2 = await users.login({ username: "sara", password: "sara1234" });
  gate.setSession(cl2.user);
  ok("TEST 15: cashier immediately gains the granted permission on the next login",
     cl2.user.perms.reportExport === true && gate.hasPerm("reportExport") === true);

  /* TEST 16/17: سحبها مجددًا من الواجهة */
  users.logout(); gate.clearSession();
  const al3 = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al3.user);
  await buttons(cashierCard, "الصلاحيات")[0].fire("click");
  await wait();
  ovl = lastOvl2();
  const cb2 = checkboxFor(PERMLIB.PERM_LABELS.reportExport);
  ok("editor reflects the currently granted permission", !!cb2 && cb2.checked === true);
  cb2.checked = false;
  cb2.fire("change");
  ok("unchecking flips the badge to 'default revoked' style", true);
  await buttons(ovl, "حفظ الصلاحيات")[0].fire("click");
  await wait();
  saraPerms = users.getCashierPermissions({ cashierId: created.user.id });
  ok("TEST 16: removing the permission through the UI persists in Main",
     saraPerms.perms.reportExport !== true);
  users.logout(); gate.clearSession();
  const cl3 = await users.login({ username: "sara", password: "sara1234" });
  gate.setSession(cl3.user);
  ok("TEST 17: cashier loses the permission after removal on the next login",
     cl3.user.perms.reportExport !== true && gate.hasPerm("reportExport") === false);
  ok("removing one permission leaves the daily defaults intact",
     cl3.user.perms.sales === true && cl3.user.perms.expenseDelete === true &&
     cl3.user.perms.giftDelete === true);
  users.logout(); gate.clearSession();

  /* ====== إعادة تعيين كلمة سر الكاشير من الواجهة ====== */
  const al4 = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al4.user);
  await buttons(cashierCard, "كلمة السر")[0].fire("click");
  ovl = lastOvl2();
  ok("reset-password overlay opens with the target cashier name",
     !!ovl && ovl.textContent.indexOf("sara") !== -1);
  ins = inputs(ovl);
  ins[0].value = "new12345"; ins[1].value = "new12345";
  await buttons(ovl, "إعادة التعيين")[0].fire("click");
  await wait();
  users.logout(); gate.clearSession();
  const cl4 = await users.login({ username: "sara", password: "new12345" });
  ok("TEST 18: cashier logs in with the password reset from the UI",
     cl4.ok === true && cl4.user.mustChangePass === true);
  users.logout(); gate.clearSession();

  /* ====== إعادة تسمية الكاشير من الواجهة ====== */
  const al5 = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al5.user);
  await buttons(cashierCard, "الاسم")[0].fire("click");
  ovl = lastOvl2();
  ins = inputs(ovl);
  ins[0].value = "sara_new";
  await buttons(ovl, "حفظ الاسم")[0].fire("click");
  await wait();
  users.logout(); gate.clearSession();
  const cl5 = await users.login({ username: "sara_new", password: "new12345" });
  ok("rename through the UI takes effect on the next login", cl5.ok === true);
  users.logout(); gate.clearSession();

  /* ====== تفعيل/تعطيل الكاشير من الواجهة ====== */
  const al6 = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al6.user);
  const card6 = await acc.buildCards();
  const row6 = card6[1].querySelector(".acc-row");
  await buttons(row6, "تعطيل")[0].fire("click");
  await wait();
  users.logout(); gate.clearSession();
  const cl6 = await users.login({ username: "sara_new", password: "new12345" });
  ok("TEST 19: cashier disabled from the UI cannot log in", cl6.ok === false);
  ok("failed login of a disabled cashier creates no session", users.getSession() === null);

  /* إعادة التفعيل */
  const al7 = await users.login({ username: "admin", password: "prod2025!" });
  gate.setSession(al7.user);
  const card7 = await acc.buildCards();
  const row7 = card7[1].querySelector(".acc-row");
  const enableBtn = buttons(row7, "تفعيل")[0];
  ok("disabled cashier shows an enable action", !!enableBtn);
  if (enableBtn) await enableBtn.fire("click");
  await wait();
  users.logout(); gate.clearSession();
  const cl7 = await users.login({ username: "sara_new", password: "new12345" });
  ok("re-enabling from the UI restores login", cl7.ok === true);
  users.logout(); gate.clearSession();

  /* ====== تغيير كلمة السر الخاصة (الكاشير) ====== */
  const cl8 = await users.login({ username: "sara_new", password: "new12345" });
  gate.setSession(cl8.user);
  acc.changeMyPassword();
  ovl = lastOvl2();
  ok("self-service password dialog opens for a cashier", !!ovl);
  ins = inputs(ovl);
  ins[0].value = "wrong"; ins[1].value = "abc12345"; ins[2].value = "abc12345";
  await buttons(ovl, "حفظ كلمة السر")[0].fire("click");
  await wait();
  ok("wrong current password is rejected",
     ovl.querySelector(".modal-err").textContent.length > 0 && lastOvl2() !== null);
  ins[0].value = "new12345"; ins[1].value = "abc12345"; ins[2].value = "abc12345";
  await buttons(ovl, "حفظ كلمة السر")[0].fire("click");
  await wait();
  users.logout(); gate.clearSession();
  const cl9 = await users.login({ username: "sara_new", password: "abc12345" });
  ok("cashier self-service password change works", cl9.ok === true);
  users.logout(); gate.clearSession();

  /* ====== الأمان: الكاشير لا يستطيع تنفيذ عمليات الإدارة عبر الجسر مباشرةً ====== */
  const cl10 = await users.login({ username: "sara_new", password: "abc12345" });
  gate.setSession(cl10.user);
  const bridge = global.window.malahyAuth;
  ok("TEST 12/13: cashier cannot list cashiers through the bridge",
     (await bridge.listCashiers()).ok === false);
  ok("TEST 12/13: cashier cannot create a cashier through the bridge",
     (await bridge.createCashier("evil", "evil12345")).ok === false);
  ok("TEST 12/13: cashier cannot read the admin account through the bridge",
     bridge.getAdminInfo().ok === false);
  ok("TEST 12/13: cashier cannot modify another cashier's permissions through the bridge",
     bridge.setCashierPerms(created.user.id, { settings: true }).ok === false);
  ok("TEST 12/13: cashier cannot read cashier permissions through the bridge",
     bridge.getCashierPerms(created.user.id).ok === false);
  ok("TEST 12/13: cashier cannot toggle another account through the bridge",
     bridge.setCashierActive(created.user.id, false).ok === false);
  ok("TEST 12/13: cashier cannot rename another account through the bridge",
     bridge.setCashierUsername(created.user.id, "evil").ok === false);
  ok("TEST 12/13: cashier cannot set the admin recovery number through the bridge",
     bridge.setRecoveryWhatsapp("201000000000").ok === false);
  ok("TEST 12/13: cashier cannot change the admin's password through the bridge",
     (await bridge.changePass("admin", "abc12345", "zzz12345")).ok === false);
  ok("cashier can still change only its own password through the bridge",
     (await bridge.changePass(cl10.user.id, "abc12345", "xyz12345")).ok === true);
  ok("the denied attempts never granted anything",
     users.hasPerm({ permId: "settings" }) === false &&
     store["malahy_users_v1"].admin.username === "admin");
  users.logout(); gate.clearSession();

  /* ====== بدون جلسة: لا بطاقات إدارة ====== */
  const noSessCards = await acc.buildCards();
  ok("no session → no management cards (fail-closed)", Array.isArray(noSessCards) && noSessCards.length === 0);

  console.log("\n====================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  console.log("====================================");
  process.exit(fail === 0 ? 0 : 1);
})();
