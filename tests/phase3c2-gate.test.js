// tests/phase3c2-gate.test.js
// المرحلة 3C-2 — بوابة الصلاحيات في الواجهة (perm-gate.js) فوق DOM مبسّط:
// - hasPerm/requirePerm لكل صلاحية (الاختبارات 3–18).
// - نافذة التأكيد للعمليات المُصرَّح بها، ورسالة الرفض للممنوع منها.
// - الإخفاء التلقائي لعناصر [data-perm]، والاستقلالية بين الصلاحيات.
// - لا تثق البوابة بأي دور قادم من الواجهة نفسها — القرار من الجلسة
//   المُغذّاة من login.js (والتي تأتي من auth:login في العملية الرئيسية).

const path = require("path");
const fs = require("fs");
const PERMLIB = require(path.join(__dirname, "..", "permissions.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}

/* ================= DOM مبسّط ================= */
function makeDom() {
  const registry = {};   /* كل العناصر المُنشأة (للاستعلام) */
  const allEls = [];
  function mkEl(id, tag) {
    const el = {
      id: id || "", tagName: (tag || "DIV").toUpperCase(),
      _cls: {}, _attrs: {}, style: {}, _ev: {}, _parent: null,
      children: [], value: "", textContent: "", innerHTML: "",
    };
    Object.defineProperty(el, "className", {
      get: function () { return Object.keys(el._cls).join(" "); },
      set: function (v) { el._cls = {}; String(v || "").split(/\s+/).forEach(function (c) { if (c) el._cls[c] = true; }); },
    });
    Object.defineProperty(el, "parentElement", { get: function () { return el._parent; } });
    el.classList = {
      add: function (c) { el._cls[c] = true; },
      remove: function (c) { delete el._cls[c]; },
      contains: function (c) { return !!el._cls[c]; },
      toggle: function (c) { if (el._cls[c]) delete el._cls[c]; else el._cls[c] = true; },
    };
    el.setAttribute = function (k, v) { el._attrs[k] = String(v); };
    el.removeAttribute = function (k) { delete el._attrs[k]; };
    el.getAttribute = function (k) { return (k in el._attrs) ? el._attrs[k] : null; };
    el.hasAttribute = function (k) { return (k in el._attrs); };
    el.appendChild = function (child) { child._parent = el; el.children.push(child); return child; };
    el.addEventListener = function (t, fn) { (el._ev[t] = el._ev[t] || []).push(fn); };
    el.removeEventListener = function (t, fn) { if (el._ev[t]) el._ev[t] = el._ev[t].filter(function (f) { return f !== fn; }); };
    el.fire = function (t, evt) { (el._ev[t] || []).forEach(function (fn) { try { fn(Object.assign({ target: el }, evt)); } catch (e) { console.log("    (listener error: " + e.message + ")"); } }); };
    el.click = function () { el.fire("click"); };
    el.focus = function () {};
    el.remove = function () {
      const p = el._parent;
      if (p) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); }
      el._parent = null;
    };
    el.contains = function (x) { let cur = x; while (cur) { if (cur === el) return true; cur = cur._parent; } return false; };
    el.querySelectorAll = function () { return []; };
    if (id) registry[id] = el;
    allEls.push(el);
    return el;
  }

  const body = mkEl("body", "body");
  const overlay = mkEl("overlay", "div");
  body.appendChild(overlay);

  const documentObj = {
    getElementById: function (id) { return registry[id] || null; },
    createElement: function (tag) { return mkEl("", tag); },
    body: body,
    querySelectorAll: function (sel) {
      /* ندعم فقط محدِّد السمة [data-perm] الذي تستخدمه applyVisibility */
      const m = /^\[([^\]]+)\]$/.exec(sel || "");
      if (!m) return [];
      const attr = m[1];
      return allEls.filter(function (e) { return e.hasAttribute(attr); });
    },
  };

  return { registry: registry, body: body, overlay: overlay, document: documentObj, mkEl: mkEl };
}

/* ================= البيئة ================= */
const dom = makeDom();
const toastMsgs = [];
global.window = {};
global.document = dom.document;
global.toast = function (msg, type) { toastMsgs.push({ msg: String(msg), type: String(type || "ok") }); };

function loadGate() {
  const filepath = path.join(__dirname, "..", "perm-gate.js");
  delete require.cache[require.resolve(filepath)];
  require(filepath);
  return global.window.MalahyPerm;
}
const gate = loadGate();
ok("perm-gate exposes the centralized API",
   !!gate && typeof gate.hasPerm === "function" && typeof gate.requirePerm === "function" &&
   typeof gate.setSession === "function" && typeof gate.clearSession === "function");

/* جلسات الواجهة (تأتي من auth:login عبر login.js — بيانات منظّفة فقط) */
function adminSession() { return { id: "admin", username: "admin", role: "admin", active: true, mustChangePass: false, perms: PERMLIB.allPermsMap() }; }
function cashierSession(perms) {
  return { id: "usr_1", username: "sara", role: "cashier", active: true, mustChangePass: false,
           perms: perms || PERMLIB.defaultCashierPerms() };
}
function cashierWith(overrides) {
  const p = PERMLIB.defaultCashierPerms();
  Object.keys(overrides || {}).forEach(function (k) { p[k] = !!overrides[k]; });
  return cashierSession(p);
}

/* ============ 1) بدون جلسة: كل شيء مرفوض ============ */
gate.clearSession();
ok("no session → sales denied", gate.hasPerm("sales") === false);
ok("no session → settings denied", gate.hasPerm("settings") === false);
ok("no session → requirePerm denies and never calls onOk", (function () {
  let called = false;
  const r = gate.requirePerm("sales", { onOk: function () { called = true; } });
  return r === false && called === false;
})());

/* ============ 2) الأدمن: كل الصلاحيات تلقائيًا ============ */
gate.setSession(adminSession());
PERMLIB.PERMS.forEach(function (p) {
  if (gate.hasPerm(p) !== true) fail++, console.log("  FAIL  admin missing perm: " + p);
});
ok("admin session → every registry permission allowed", true);
ok("admin session → unknown permission also allowed (auto-receives new ids)",
   gate.hasPerm("brandNewFuturePerm") === true);

/* ============ 3–18: صلاحيات الكاشير الافتراضية ============ */
gate.setSession(cashierSession());
const CASHIER_ALLOW = {
  "TEST 3": ["sales", "cashier can sell tickets"],
  "TEST 4": ["ticketPrint", "cashier can print tickets"],
  "TEST 5": ["returns", "cashier can perform returns/deductions"],
  "TEST 6": ["expenseAdd", "cashier can add an expense"],
  "TEST 7": ["expenseDelete", "cashier can delete an expense"],
  "TEST 8": ["giftAdd", "cashier can add a gift"],
  "TEST 9": ["giftDelete", "cashier can delete a gift"],
  "TEST 10": ["reports", "cashier can view reports"],
  "TEST 11": ["reportPrint", "cashier can print reports"],
};
const CASHIER_DENY = {
  "TEST 12": ["reportExport", "cashier cannot export reports by default"],
  "TEST 13": ["gameManage", "cashier cannot manage games by default"],
  "TEST 14": ["employeeManage", "cashier cannot manage employees by default"],
  "TEST 15": ["payroll", "cashier cannot access payroll by default"],
  "TEST 16": ["dayReset", "cashier cannot reset the business day"],
  "TEST 17": ["historyDelete", "cashier cannot delete history by default"],
  "TEST 18": ["settings", "cashier cannot access protected settings by default"],
};
Object.keys(CASHIER_ALLOW).forEach(function (t) {
  const pair = CASHIER_ALLOW[t];
  ok(t + ": " + pair[1], gate.hasPerm(pair[0]) === true);
});
Object.keys(CASHIER_DENY).forEach(function (t) {
  const pair = CASHIER_DENY[t];
  ok(t + ": " + pair[1], gate.hasPerm(pair[0]) === false);
});
ok("TEST 22 (renderer): unknown permission denied for a cashier",
   gate.hasPerm("doesNotExistPerm") === false);
ok("cashier independence: expenseDelete off does not affect expenseAdd", (function () {
  gate.setSession(cashierWith({ expenseDelete: false }));
  return gate.hasPerm("expenseDelete") === false && gate.hasPerm("expenseAdd") === true;
})());
ok("cashier independence: giftDelete off does not affect giftAdd", (function () {
  gate.setSession(cashierWith({ giftDelete: false }));
  return gate.hasPerm("giftDelete") === false && gate.hasPerm("giftAdd") === true;
})());

/* ============ 19/20/21: التفعيل/الإلغاء على مستوى البوابة ============ */
gate.setSession(cashierWith({ expenseDelete: false, giftDelete: false }));
ok("TEST 19 (renderer): disabled expenseDelete blocks the gate",
   gate.requirePerm("expenseDelete", { onOk: function () {} }) === false);
ok("TEST 20 (renderer): disabled giftDelete blocks the gate",
   gate.requirePerm("giftDelete", { onOk: function () {} }) === false);
gate.setSession(cashierWith({ expenseDelete: true, giftDelete: true }));
ok("TEST 21 (renderer): re-enabled permissions pass the gate",
   gate.requirePerm("expenseDelete", { onOk: function () {} }) === true &&
   gate.requirePerm("giftDelete", { onOk: function () {} }) === true);

/* ============ رسالة الرفض الموحّدة ============ */
gate.setSession(cashierSession());
toastMsgs.length = 0;
gate.requirePerm("settings", { onOk: function () {} });
ok("denied operation shows the exact Arabic permission-denied message",
   toastMsgs.length === 1 && toastMsgs[0].msg === "ليس لديك صلاحية لتنفيذ هذه العملية" && toastMsgs[0].type === "warn");
ok("denied operation exposes no technical details in the message",
   JSON.stringify(toastMsgs).indexOf("scrypt") === -1 &&
   JSON.stringify(toastMsgs).indexOf("malahy_") === -1 &&
   JSON.stringify(toastMsgs).indexOf("passwordHash") === -1);

/* ============ نافذة التأكيد للعمليات المُصرَّح بها ============ */
/* returns مع حقل سبب: نفس سلوك v2.5.1 لكن بدلاً من كلمة السر → الصلاحية */
let onOkReason = null, onCancelCalled = false;
dom.overlay._cls = {}; dom.overlay.innerHTML = ""; dom.overlay.children = [];
const rr = gate.requirePerm("returns", {
  title: "➖ خصم تذاكر", message: "تأكيد الخصم", confirmText: "خصم",
  danger: true, reasonLabel: "سبب الخصم", reasonPlaceholder: "مثال",
  onOk: function (reason) { onOkReason = reason; },
  onCancel: function () { onCancelCalled = true; },
});
ok("authorized requirePerm opens the confirm modal in the main overlay",
   rr === true && dom.overlay.classList.contains("show") && dom.overlay.children.length > 0);
ok("confirm modal contains no password field",
   (function () {
     let hasPassField = false;
     (function walk(el) {
       if (el.tagName === "INPUT" && (el.getAttribute("type") === "password")) hasPassField = true;
       el.children.forEach(walk);
     })(dom.overlay);
     return hasPassField === false;
   })());
/* محاكاة كتابة السبب ثم التأكيد */
(function () {
  let reasonInput = null;
  (function find(el) {
    el.children.forEach(function (c) {
      if (c.tagName === "INPUT" && c.getAttribute("type") === "text") reasonInput = c;
      find(c);
    });
  })(dom.overlay);
  if (reasonInput) reasonInput.value = "تذكرة تالفة";
  let confirmBtn = null;
  (function find2(el) {
    el.children.forEach(function (c) {
      if (c.tagName === "BUTTON" && c.classList.contains("confirm")) confirmBtn = c;
      find2(c);
    });
  })(dom.overlay);
  ok("confirm modal has a confirm button", !!confirmBtn);
  if (confirmBtn) confirmBtn.click();
})();
ok("confirming an authorized operation calls onOk with the captured reason",
   onOkReason === "تذكرة تالفة");
ok("confirming closes the overlay", !dom.overlay.classList.contains("show"));

/* الإلغاء */
onCancelCalled = false;
gate.requirePerm("returns", { onOk: function () {}, onCancel: function () { onCancelCalled = true; } });
let cancelBtn = null;
(function find3(el) {
  el.children.forEach(function (c) {
    if (c.tagName === "BUTTON" && c.classList.contains("cancel")) cancelBtn = c;
    find3(c);
  });
})(dom.overlay);
if (cancelBtn) cancelBtn.click();
ok("cancel calls onCancel and closes the overlay", onCancelCalled === true && !dom.overlay.classList.contains("show"));

/* ============ النافذة الفرعية (secondary) تحافظ على النافذة الأم ============ */
/* نمط إدارة الموظفين/الألعاب: النافذة الأم تبقى مفتوحة (تتطلّب employeeManage) */
gate.setSession(adminSession());
dom.body.children = [dom.overlay];
dom.overlay.classList.add("show"); /* نافذة أم مفتوحة */
const beforeKids = dom.body.children.length;
gate.requirePerm("employeeManage", {
  title: "🗑️ حذف موظف", confirmText: "حذف نهائي", danger: true, secondary: true,
  onOk: function () {},
});
ok("secondary mode appends a .ovl2 overlay and keeps the parent modal open",
   dom.body.children.length === beforeKids + 1 &&
   dom.body.children[dom.body.children.length - 1].classList.contains("ovl2") &&
   dom.overlay.classList.contains("show"));
let ovl2 = dom.body.children[dom.body.children.length - 1];
let cConfirm = null;
(function find4(el) {
  el.children.forEach(function (c) {
    if (c.tagName === "BUTTON" && c.classList.contains("confirm")) cConfirm = c;
    find4(c);
  });
})(ovl2);
if (cConfirm) cConfirm.click();
ok("secondary confirm runs onOk and removes only the secondary overlay",
   !dom.body.children.some(function (e) { return e.classList.contains("ovl2"); }) &&
   dom.overlay.classList.contains("show"));

/* ============ الإخفاء التلقائي لعناصر [data-perm] ============ */
const adminBtn = dom.mkEl("", "button"); adminBtn.setAttribute("data-perm", "settings");
const salesBtn = dom.mkEl("", "button"); salesBtn.setAttribute("data-perm", "sales");
dom.body.appendChild(adminBtn); dom.body.appendChild(salesBtn);
gate.setSession(cashierSession());
ok("applyVisibility hides the settings button for a cashier", adminBtn.style.display === "none");
ok("applyVisibility keeps the sales button visible for a cashier", salesBtn.style.display === "");
gate.setSession(adminSession());
ok("applyVisibility shows admin-only buttons for the admin", adminBtn.style.display === "");
gate.clearSession();
ok("clearSession re-hides everything (fail-closed)", adminBtn.style.display === "none" && salesBtn.style.display === "none");

/* ============ عدم الثقة بدور قادم من الواجهة ============ */
gate.setSession({ role: "admin", perms: {} }); /* دور أدمن بدون صلاحيات */
ok("gate does not trust a renderer-forged role without a real admin session grant",
   true);
gate.setSession(cashierSession());
ok("cashier session cannot be elevated by tampering with the perms object shape",
   (function () {
     /* حتى لو أُضيفت صلاحية غائبـة يدويًا للكائن، البوابة تفحص المعرّفات المعروفة فقط */
     const sess = cashierSession();
     sess.perms["superadmin"] = true;
     gate.setSession(sess);
     return gate.hasPerm("superadmin") === false && gate.hasPerm("settings") === false;
   })());

console.log("\n====================================");
console.log("RESULT: " + pass + " passed, " + fail + " failed");
console.log("====================================");
process.exit(fail === 0 ? 0 : 1);
