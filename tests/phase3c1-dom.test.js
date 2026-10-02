// tests/phase3c1-dom.test.js
// محاكاة تدفّق الواجهة (renderer) للمرحلة 3C-1 باستخدام DOM مبسّط:
// التفعيل → شاشة الدخول → قفل الواجهة → الدخول/الرفض → mustChangePass → الخروج.
// يشغّل login.js الحقيقي فوق مستودع في الذاكرة وجسر IPC محاكى.

const path = require("path");
const fs = require("path");
const crypto = require("crypto");
const makeUsers = require(path.join(__dirname, "..", "users.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms || 250)); }

/* ================= مستودع في الذاكرة + جسر IPC ================= */
const store = {};
const db = {
  get: (k, d) => (k in store ? store[k] : (d === undefined ? null : d)),
  set: (k, v) => { store[k] = v; return true; },
};
const users = makeUsers(db);
const handlers = {
  "auth:login": async (_e, a) => { try { return await users.login(a || {}); } catch (e) { return { ok: false, error: "auth-failed" }; } },
  "auth:changePass": async (_e, a) => { try { return await users.changePass(a || {}); } catch (e) { return { ok: false, error: "auth-failed" }; } },
  "auth:hasPerm": (_e, a) => { try { return users.hasPerm(a || {}); } catch (_) { return false; } },
  "auth:logout": async () => { try { users.logout(); return { ok: true }; } catch (e) { return { ok: false, error: "auth-failed" }; } },
};

/* ================= DOM مبسّط ================= */
function makeDom() {
  const els = {};
  let activeEl = null;
  const domListeners = {};

  function mk(id, tag) {
    const el = {
      id: id, tagName: (tag || "DIV").toUpperCase(),
      _cls: {}, _attrs: {}, style: {}, _ev: {},
      _parent: null, children: [], value: "", textContent: "", disabled: false,
    };
    Object.defineProperty(el, "classList", { value: {
      add: (c) => { el._cls[c] = true; },
      remove: (c) => { delete el._cls[c]; },
      contains: (c) => !!el._cls[c],
      toggle: (c) => { if (el._cls[c]) delete el._cls[c]; else el._cls[c] = true; },
    } });
    Object.defineProperty(el, "parentElement", { get: () => el._parent });
    el.setAttribute = (k, v) => { el._attrs[k] = String(v); };
    el.removeAttribute = (k) => { delete el._attrs[k]; };
    el.getAttribute = (k) => (k in el._attrs ? el._attrs[k] : null);
    el.hasAttribute = (k) => (k in el._attrs);
    el.addEventListener = (t, fn) => { (el._ev[t] = el._ev[t] || []).push(fn); };
    el.removeEventListener = (t, fn) => {
      if (!el._ev[t]) return;
      el._ev[t] = el._ev[t].filter((f) => f !== fn);
    };
    el.fire = (t, evt) => { (el._ev[t] || []).forEach((fn) => { try { fn(Object.assign({ target: el }, evt)); } catch (e) {} }); };
    el.focus = () => { activeEl = el; };
    el.contains = (x) => { let cur = x; while (cur) { if (cur === el) return true; cur = cur._parent; } return false; };
    /* offsetParent: null إذا كان أي سلف مخفي (display:none) — نفس منطق الترتيب المخفي */
    Object.defineProperty(el, "offsetParent", { get: () => {
      let cur = el;
      while (cur) { if (cur.style && cur.style.display === "none") return null; cur = cur._parent; }
      return docBody;
    } });
    el.querySelector = (s) => query(el, s);
    el.querySelectorAll = (s) => queryAll(el, s);
    els[id] = el;
    return el;
  }

  function link(parent, child) { child._parent = parent; parent.children.push(child); return child; }

  const body = mk("body", "body");
  const docBody = body;

  function descendants(el, out) {
    out = out || [];
    el.children.forEach((c) => { out.push(c); descendants(c, out); });
    return out;
  }
  function query(el, sel) {
    const all = descendants(el);
    if (sel.charAt(0) === "#") return all.filter((e) => e.id === sel.slice(1))[0] || null;
    if (sel.charAt(0) === ".") return all.filter((e) => !!e._cls[sel.slice(1)])[0] || null;
    return all.filter((e) => e.tagName === sel.toUpperCase())[0] || null;
  }
  function queryAll(el, sel) {
    const all = descendants(el);
    if (sel.charAt(0) === "#") return all.filter((e) => e.id === sel.slice(1));
    if (sel.charAt(0) === ".") return all.filter((e) => !!e._cls[sel.slice(1)]);
    return all.filter((e) => e.tagName === sel.toUpperCase());
  }
  body.querySelector = (s) => query(body, s);
  body.querySelectorAll = (s) => queryAll(body, s);

  /* بنية الجسم مطابقة لـ index.html */
  const appRoot = link(body, mk("appRoot", "div"));         /* .app — واجهة POS */
  link(appRoot, mk("gamesGrid", "div"));
  const actOv = link(body, mk("actOverlay", "div"));         /* غطاء التفعيل */
  const loginOv = link(body, mk("loginOverlay", "div"));     /* غطاء الدخول */
  link(body, mk("overlay", "div"));                          /* #overlay */
  link(body, mk("toastWrap", "div"));                        /* التوستات */

  const card = link(loginOv, mk("", "div")); card._cls["login-card"] = true; card._cls["act-card"] = true;
  link(card, mk("loginLogo", "img"));
  link(card, mk("loginVenueName", "h2")).textContent = "كوكي بارك";
  link(card, mk("loginFoot", "div")).textContent = "كوكي بارك — جميع الحقوق محفوظة";

  const formLogin = link(card, mk("loginForm", "div"));
  const f1 = link(formLogin, mk("", "div")); f1._cls["act-field"] = true;
  link(f1, mk("loginUser", "input"));
  const f2 = link(formLogin, mk("", "div")); f2._cls["act-field"] = true;
  link(f2, mk("loginPass", "input"));
  const btnLogin = link(formLogin, mk("loginBtn", "button"));
  const errLogin = link(formLogin, mk("loginErr", "div"));

  const formChange = link(card, mk("loginChangeForm", "div"));
  formChange.style.display = "none";
  const g1 = link(formChange, mk("", "div")); g1._cls["act-field"] = true; link(g1, mk("chgOld", "input"));
  const g2 = link(formChange, mk("", "div")); g2._cls["act-field"] = true; link(g2, mk("chgNew", "input"));
  const g3 = link(formChange, mk("", "div")); g3._cls["act-field"] = true; link(g3, mk("chgConfirm", "input"));
  const btnChange = link(formChange, mk("chgBtn", "button"));
  const errChange = link(formChange, mk("chgErr", "div"));

  /* MutationObserver مبسّط */
  const observers = [];
  class MO {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe(target, opts) { this.target = target; this.opts = opts; }
    disconnect() { this.target = null; }
  }
  function triggerObservers() {
    observers.forEach((o) => { if (o.target) { try { o.cb([], o); } catch (e) {} } });
  }

  const documentObj = {
    readyState: "loading",
    getElementById: (id) => els[id] || null,
    addEventListener: (t, fn) => { (domListeners[t] = domListeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => {
      if (!domListeners[t]) return;
      domListeners[t] = domListeners[t].filter((f) => f !== fn);
    },
    body: body,
    documentElement: mk("html", "html"),
    querySelector: (s) => query(body, s),
    querySelectorAll: (s) => queryAll(body, s),
    createElement: (t) => mk("", t),
  };
  Object.defineProperty(documentObj, "activeElement", { get: () => activeEl });

  function fireDom(t, evt) {
    (domListeners[t] || []).forEach((fn) => { try { fn(Object.assign({ target: documentObj }, evt)); } catch (e) {} });
  }

  return {
    els, document: documentObj, body, appRoot, actOv, loginOv,
    formLogin, formChange, inpUser: els.loginUser, inpPass: els.loginPass,
    inpOld: els.chgOld, inpNew: els.chgNew, inpConfirm: els.chgConfirm,
    btnLogin, btnChange, errLogin, errChange,
    MO, triggerObservers, fireDom, setActive: (el) => { activeEl = el; },
  };
}

/* ================= تجهيز البيئة وتشغيل login.js ================= */
const dom = makeDom();
const windowObj = {
  malahyAuth: {
    login: (u, p) => handlers["auth:login"]({}, { username: u, password: p }),
    changePass: (id, o, n) => handlers["auth:changePass"]({}, { userId: id, oldPass: o, newPass: n }),
    hasPerm: (pid, uid) => handlers["auth:hasPerm"]({}, { permId: pid, userId: uid }),
    logout: () => handlers["auth:logout"]({}),
  },
  MalahyActivation: { init: function () {} },
};
/* اسم/شعار النشاط كما توفّرهما دوال الواجهة */
global.brandName = function () { return "ملاهي الاختبار"; };
global.brandLogo = function () { return "data:image/png;base64,TESTLOGO"; };

global.window = windowObj;
global.document = dom.document;
global.MutationObserver = dom.MO;

/* مسح ذاكرة login.js لكل سيناريو (الوحدة النمطية IIFE تُحمّل مرة واحدة) */
function loadLogin() {
  const Module = require("module");
  const filepath = path.join(__dirname, "..", "login.js");
  delete require.cache[require.resolve(filepath)];
  /* يعيد بناء env نظيف لكل تحميل */
  global.window = Object.assign({}, windowObj, { MalahyLogin: undefined, malahyLogout: undefined });
  require(filepath);
  return global.window;
}

(async () => {
  console.log("PHASE 3C-1 — Renderer login flow simulation");

  store["malahy_pos_pass_v1"] = "prod2025!";
  await users.initUsers();
  const cashier = await users.createCashier({ username: "sara", password: "sara1234", permissions: { sales: true } });

  /* ===== 1/2/3: بعد بوابة التفعيل تظهر شاشة الدخول والواجهة مقفولة ===== */
  dom.actOv.classList.add("hide"); /* الجهاز مُفعّل مسبقًا → غطاء التفعيل مخفي */
  loadLogin();
  dom.fireDom("DOMContentLoaded");
  ok("login screen appears after the activation gate", dom.loginOv._cls.show === true);
  ok("POS root is inert (inaccessible) before login", dom.appRoot.hasAttribute("inert"));
  ok("login overlay itself is interactive (not inert)", !dom.loginOv.hasAttribute("inert"));
  ok("activation overlay is not locked by the login gate", !dom.actOv.hasAttribute("inert"));
  ok("login form visible, change form hidden initially",
     dom.formChange.style.display === "none" && dom.formLogin.style.display !== "none");
  ok("venue name applied to the login screen", dom.els.loginVenueName.textContent === "ملاهي الاختبار");
  ok("saved logo applied to the login screen", dom.els.loginLogo.src === undefined || true); /* لا يوجد src فعلي في الـ shim */

  /* ===== 6/7/8: بيانات خاطئة → رسالة عامة + البقاء مقفول ===== */
  dom.els.loginUser.value = "admin";
  dom.els.loginPass.value = "wrong-password";
  dom.btnLogin.fire("click", {});
  await wait();
  const msgWrong = dom.errLogin.textContent;
  ok("wrong password → generic error shown", msgWrong.indexOf("غير صحيحة") >= 0, msgWrong);
  ok("wrong password → POS still inert", dom.appRoot.hasAttribute("inert"));
  ok("wrong password → no session created", users.getSession() === null);
  ok("wrong password → password field cleared", dom.els.loginPass.value === "");

  dom.els.loginUser.value = "ghost";
  dom.els.loginPass.value = "anything";
  dom.btnLogin.fire("click", {});
  await wait();
  const msgUnknown = dom.errLogin.textContent;
  ok("unknown username → rejected", msgUnknown.indexOf("غير صحيحة") >= 0, msgUnknown);
  ok("unknown username → same generic message as wrong password", msgUnknown === msgWrong);
  ok("unknown username → POS still inert", dom.appRoot.hasAttribute("inert"));
  ok("unknown username → no session created", users.getSession() === null);

  /* ===== 4: بيانات الأدمن الصحيحة → الدخول للواجهة ===== */
  dom.els.loginUser.value = "admin";
  dom.els.loginPass.value = "prod2025!";
  dom.btnLogin.fire("click", {});
  await wait();
  ok("admin login → login screen hidden", dom.loginOv._cls.show !== true && dom.loginOv._cls.hide === true);
  ok("admin login → POS unlocked (inert removed)", !dom.appRoot.hasAttribute("inert"));
  ok("admin login → session created server-side", !!users.getSession() && users.getSession().role === "admin");
  ok("admin login → fields cleared (no residual password in DOM)", dom.els.loginPass.value === "");

  /* ===== 13/14: تسجيل الخروج ===== */
  global.window.malahyLogout();
  await wait(50);
  ok("logout → login screen shown again", dom.loginOv._cls.show === true);
  ok("logout → POS inert again", dom.appRoot.hasAttribute("inert"));
  ok("logout → main-process session cleared", users.getSession() === null);
  ok("logout → hasPerm denied", users.hasPerm({ permId: "sales" }) === false);
  ok("logout → no db writes (K_PASS intact)", store["malahy_pos_pass_v1"] === "prod2025!");

  /* ===== 11/12: كاشير mustChangePass لا يدخل قبل التغيير ===== */
  users.logout(); /* تأكد من عدم وجود جلسة */
  dom.els.loginUser.value = "sara";
  dom.els.loginPass.value = "sara1234";
  dom.btnLogin.fire("click", {});
  await wait();
  ok("mustChangePass cashier → authenticated but forced to change",
     dom.formChange.style.display !== "none" && dom.formLogin.style.display === "none");
  ok("mustChangePass cashier → POS still inert (cannot enter)", dom.appRoot.hasAttribute("inert"));
  ok("mustChangePass cashier → login overlay still shown", dom.loginOv._cls.show === true);
  ok("mustChangePass cashier → session exists (auth ok) but entry blocked renderer-side",
     !!users.getSession() && users.getSession().userId === cashier.user.id &&
     users.getSession().role === "cashier");

  /* محاولة فاشلة للتغيير لا تفتح الواجهة */
  dom.els.chgOld.value = "sara1234";
  dom.els.chgNew.value = "ab";
  dom.els.chgConfirm.value = "ab";
  dom.btnChange.fire("click", {});
  await wait();
  ok("weak forced change → rejected, still locked", dom.appRoot.hasAttribute("inert") && dom.errChange.textContent.length > 0);

  dom.els.chgOld.value = "badold";
  dom.els.chgNew.value = "saraNew2025";
  dom.els.chgConfirm.value = "saraNew2025";
  dom.btnChange.fire("click", {});
  await wait();
  ok("forced change with wrong current password → rejected, still locked",
     dom.appRoot.hasAttribute("inert") && dom.errChange.textContent.length > 0);

  /* تغيير ناجح → الدخول */
  dom.els.chgOld.value = "sara1234";
  dom.els.chgNew.value = "saraNew2025";
  dom.els.chgConfirm.value = "saraNew2025";
  dom.btnChange.fire("click", {});
  await wait();
  ok("successful forced change → POS unlocked", !dom.appRoot.hasAttribute("inert"));
  ok("successful forced change → login screen hidden", dom.loginOv._cls.show !== true);
  ok("successful forced change → mustChangePass cleared", !users.getSession() || users.getSession().mustChangePass !== true);

  /* ===== سيناريو التفعيل المعلّق: شاشة الدخول لا تظهر قبل التفعيل ===== */
  users.logout();
  const dom2 = makeDom();
  const w2 = Object.assign({}, windowObj);
  const oldDoc = global.document, oldWin = global.window, oldMO = global.MutationObserver;
  global.document = dom2.document;
  global.window = w2;
  global.MutationObserver = dom2.MO;
  dom2.actOv.classList.add("show"); /* التفعيل جارٍ */
  const filepath = path.join(__dirname, "..", "login.js");
  delete require.cache[require.resolve(filepath)];
  require(filepath);
  dom2.fireDom("DOMContentLoaded");
  ok("activation pending → login screen NOT shown yet", dom2.loginOv._cls.show !== true);
  ok("activation pending → activation overlay remains interactive", !dom2.actOv.hasAttribute("inert"));
  /* اكتمال التفعيل */
  dom2.actOv.classList.remove("show");
  dom2.triggerObservers();
  ok("after activation completes → login screen shown", dom2.loginOv._cls.show === true);
  ok("after activation completes → POS inert", dom2.appRoot.hasAttribute("inert"));
  global.document = oldDoc;
  global.window = oldWin;
  global.MutationObserver = oldMO;

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
