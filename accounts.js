/* accounts.js — إدارة الحسابات والصلاحيات (المرحلة 3C-3)
   ---------------------------------------------------------------
   تُضاف بطاقتان داخل نافذة الإعدادات الحالية (مرئيتان للمدير فقط):

   1) حساب المدير   : اسم المستخدم + تغيير كلمة السر + رقم واتساب الاستعادة
                      + حالة الاستعادة/الأمان.
   2) إدارة الكاشير : قائمة الكاشير + إضافة + تعديل الصلاحيات (منح/سحب/استعادة)
                      + إعادة تعيين كلمة السر + تفعيل/تعطيل + تغيير الاسم.

   قواعد التصميم (مطبّقة على مستوى العملية الرئيسية — هذه الوحدة مجرد واجهة):
   - يوجد حساب مدير واحد فقط، له كل الصلاحيات تلقائيًا، ولا يمكن حذفه.
   - الكاشير يبدأ بالصلاحيات اليومية الافتراضية، وكل صلاحية مستقلّة قابلة للتبديل.
   - الواجهة ليست حدّ الأمان: كل عملية تمرّ عبر malahyAuth (العملية الرئيسية)
     التي تتحقق من جلسة الأدمن قبل تنفيذ أي تغيير. التلاعب بحالة الواجهة أو
     استدعاء IPC مباشرةً يُرفض في العملية الرئيسية.
   - تستخدم سجلّ الصلاحيات الموحّد (MalahyPerms) مصدرًا واحدًا لأسماء
     الصلاحيات وتسمياتها وصلاحيات الكاشير الافتراضية — بدون أي تكرار.
   - لا تحتوي على أي أسرار ولا تقرأ/تكتب قاعدة البيانات مباشرةً.
   - تغيير كلمة السر الخاص متاح للأدمن والكاشير، ويتطلّب كلمة السر الحالية،
     ولا يُسمح للكاشير بتغيير كلمة سر حساب آخر (الفرض في العملية الرئيسية). */

(function () {
  "use strict";

  /* ============ سجلّ الصلاحيات الموحّد (المصدر الوحيد) ============ */
  var REG = null;
  try {
    if (typeof require === "function" && typeof module !== "undefined") REG = require("./permissions");
  } catch (_) { REG = null; }
  if (!REG && typeof window !== "undefined") REG = window.MalahyPerms;

  function PERMS() { return (REG && REG.PERMS) || []; }
  function label(id) { return (REG && REG.PERM_LABELS && REG.PERM_LABELS[id]) || id; }
  function isDefaultAllow(id) { return !!(REG && REG.DEFAULT_CASHIER_PERMS && REG.DEFAULT_CASHIER_PERMS[id] === true); }

  /* ============ أدوات DOM مستقلّة (نفس أسلوب باقي الوحدات) ============ */
  var BOOL_PROPS = { checked: 1, disabled: 1, readOnly: 1, autofocus: 1 };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    /* تقبل الوسيط الثاني إمّا كائن سمات أو سلسلة اسماء أصناف (نفس أسلوب perm-gate) */
    if (typeof attrs === "string") { var cls = attrs; attrs = { class: cls }; }
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = String(v);
      else if (k === "value") { try { n.value = (v == null) ? "" : String(v); } catch (_) {} }
      else if (k === "style" && v && typeof v === "object") {
        Object.keys(v).forEach(function (s) { try { n.style[s] = v[s]; } catch (_) {} });
      }
      else if (k.indexOf("on") === 0 && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (BOOL_PROPS[k]) { try { n[k] = !!v; } catch (_) {} }
      else if (v !== null && v !== false && v !== undefined) n.setAttribute(k, String(v));
    });
    (Array.isArray(kids) ? kids : (kids == null ? [] : [kids])).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function toast(msg, type) { try { if (typeof window.toast === "function") window.toast(msg, type || "ok"); } catch (_) {} }
  function logErr(where, err) { try { if (typeof window.logErr === "function") window.logErr("accounts:" + where, err); } catch (_) {} }

  /* ============ الجلسة: المدير فقط يرى بطاقات الإدارة ============ */
  function session() {
    try { return (window.MalahyPerm && window.MalahyPerm.getSession) ? window.MalahyPerm.getSession() : null; }
    catch (_) { return null; }
  }
  function isAdmin() {
    var s = session();
    return !!(s && s.role === "admin");
  }
  function hasBridge() {
    /* fail-closed: لو أيّ دالة إدارة ناقصة من الجسر لا تُعرض البطاقات أبدًا */
    var a = window.malahyAuth;
    return !!(a && typeof a === "object" &&
      typeof a.getAdminInfo === "function" &&
      typeof a.listCashiers === "function" &&
      typeof a.createCashier === "function" &&
      typeof a.getCashierPerms === "function" &&
      typeof a.setCashierPerms === "function" &&
      typeof a.setCashierActive === "function" &&
      typeof a.setCashierUsername === "function" &&
      typeof a.resetCashier === "function" &&
      typeof a.setRecoveryWhatsapp === "function" &&
      typeof a.changePass === "function");
  }

  /* التحقق المبدئي في الواجهة (UX فقط) — القرار النهائي في العملية الرئيسية */
  function guardAdmin() {
    if (!isAdmin()) { toast("ليس لديك صلاحية لتنفيذ هذه العملية", "warn"); return false; }
    if (!hasBridge()) { toast("تعذّر الوصول لنظام الحسابات", "warn"); return false; }
    return true;
  }

  /* ============ النوافذ الفرعية (.ovl2) — تبقي نافذة الإادات مفتوحة ============ */
  function openSub(title, opts) {
    opts = opts || {};
    var ovl = el("div", "ovl2");
    var box = el("div", "modal");
    box.style.maxWidth = opts.width || "560px";
    box.style.maxHeight = "86vh";
    box.style.overflowY = "auto";
    box.appendChild(el("h3", null, title));
    if (opts.message) box.appendChild(el("p", null, opts.message));
    var body = el("div");
    (opts.body || []).forEach(function (n) { if (n) body.appendChild(n); });
    box.appendChild(body);
    var acts = el("div", "modal-actions");
    box.appendChild(acts);
    ovl.appendChild(box);
    function close() { try { ovl.remove(); } catch (_) {} }
    ovl.addEventListener("click", function (ev) { if (ev.target === ovl) close(); });
    ovl.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.stopPropagation(); close(); } });
    try { document.body.appendChild(ovl); } catch (_) {}
    return { ovl: ovl, box: box, body: body, acts: acts, close: close };
  }

  /* ============ رسائل الخطأ الموحّدة للنماذج ============ */
  var ERR_MESSAGES = {
    "forbidden": "ليس لديك صلاحية لتنفيذ هذه العملية",
    "invalid-username": "اسم المستخدم غير صالح (حرفان على الأقل)",
    "username-taken": "اسم المستخدم مستخدم بالفعل — اختر اسمًا آخر",
    "weak-password": "كلمة المرور ضعيفة — يجب ألا تقل عن ٤ أحرف",
    "cashier-not-found": "حساب الكاشير غير موجود (ربما حُذف)",
    "not-initialized": "نظام الحسابات غير مهيّأ بعد",
    "invalid-number": "رقم غير صالح — استخدم أرقامًا مع رمز الدولة (مثال: 201001234567)",
    "invalid-argument": "قيمة غير صالحة",
  };
  function errText(code, fallback) {
    if (code && ERR_MESSAGES[code]) return ERR_MESSAGES[code];
    return fallback || "تعذّر تنفيذ العملية، حاول مرة أخرى";
  }

  /* ============ الحد الأدنى لطول كلمة السر (نفس	users.js) ============ */
  var MIN_PASS = 4;

  /* ===================================================================== *
   *  بطاقة حساب المدير
   * ===================================================================== */
  async function buildAdminCard() {
    var info = null;
    try { info = await window.malahyAuth.getAdminInfo(); }
    catch (e) { logErr("getAdminInfo", e); info = null; }

    var card = el("div", { class: "set-card acc-card" });
    card.appendChild(el("div", { class: "set-h" }, [
      el("span", { class: "ic", text: "🔐" }), "حساب المدير",
      el("span", { class: "acc-role admin", text: "مدير" }),
    ]));

    if (!info || !info.ok) {
      card.appendChild(el("div", { class: "acc-empty", text: "تعذّر تحميل بيانات حساب المدير." }));
      return card;
    }

    /* اسم المستخدم (للقراءة — حساب المدير الوحيد ولا يمكن حذفه) */
    card.appendChild(el("div", { class: "field" }, [
      el("label", { text: "اسم المستخدم" }),
      el("input", { class: "acc-username", type: "text", value: info.username, readOnly: true, autocomplete: "off" }),
      el("div", { class: "acc-note", text: "هذا هو حساب المدير الوحيد للنشاط — لا يمكن حذفه، وله كل الصلاحيات تلقائيًا. الشخص الذي يستخدمه قد يتغيّر، لكن يبقى حسابًا واحدًا." }),
    ]));

    /* تغيير كلمة السر (يستخدم نظام المستخدمين ويتطلب كلمة السر الحالية) */
    var passBtn = el("button", { class: "testbtn", type: "button" }, [el("span", { class: "ic", text: "🔑" }), " تغيير كلمة السر"]);
    passBtn.addEventListener("click", function () { changeMyPassword(); });
    card.appendChild(passBtn);

    /* رقم واتساب الاستعادة (خاص بحساب المدير — لا يُعرض للكاشير) */
    var waIn = el("input", { type: "tel", id: "accWaIn", value: info.recoveryWhatsapp || "", dir: "ltr",
      placeholder: "مثال: 201001234567", autocomplete: "off" });
    var waMsg = el("div", { class: "modal-err", id: "accWaErr" });
    var waBtn = el("button", { class: "testbtn", type: "button" }, [el("span", { class: "ic", text: "💾" }), " حفظ الرقم"]);
    function paintRecovery() {
      var has = !!(info.recoveryWhatsapp && String(info.recoveryWhatsapp).trim());
      var box = card.querySelector(".acc-recovery-status");
      if (!box) return;
      box.innerHTML = "";
      box.appendChild(el("span", { class: "acc-status " + (has ? "on" : "off"), text: has ? "مضبوط ✓" : "غير مضبوط" }));
      box.appendChild(el("span", { class: "acc-sub", text: has
        ? "رقم الاستعادة محفوظ لحساب المدير ويُستخدم لاستعادة كلمة المرور من شاشة الدخول عبر مسار «نسيت كلمة المرور؟»."
        : "لا يوجد رقم استعادة مضبوط — لن يمكن استعادة كلمة المرور إذا نُسيت. اكتب الرقم واضغط «حفظ الرقم»." }));
    }
    waBtn.addEventListener("click", async function () {
      if (!guardAdmin()) return;
      var num = (waIn.value || "").trim();
      waMsg.textContent = "";
      try {
        var res = await window.malahyAuth.setRecoveryWhatsapp(num);
        if (res && res.ok) {
          info.recoveryWhatsapp = res.recoveryWhatsapp;
          paintRecovery();
          toast("تم حفظ رقم الاستعادة ✓", "ok");
        } else {
          waMsg.textContent = errText(res && res.error, "تعذّر حفظ الرقم");
        }
      } catch (e) { logErr("setRecoveryWhatsapp", e); waMsg.textContent = "تعذّر حفظ الرقم"; }
    });
    card.appendChild(el("div", { class: "field" }, [
      el("label", { text: "رقم واتساب الاستعادة (خاص بحساب المدير)" }),
      waIn,
      el("div", { class: "acc-wa-row" }, [waBtn]),
      waMsg,
    ]));
    card.appendChild(el("div", { class: "acc-recovery-status" }));
    paintRecovery();

    return card;
  }

  /* ===================================================================== *
   *  بطاقة إدارة الكاشير
   * ===================================================================== */
  async function buildCashierCard() {
    var card = el("div", { class: "set-card acc-card" });
    var head = el("div", { class: "set-h" }, [
      el("span", { class: "ic", text: "👥" }), "إدارة الكاشير",
      el("span", { class: "acc-count", text: "0" }),
    ]);
    card.appendChild(head);

    /* زر الإضافة */
    var addBtn = el("button", { class: "testbtn", type: "button", style: { width: "100%", marginBottom: "12px" } },
      [el("span", { class: "ic", text: "＋" }), " إضافة كاشير جديد"]);
    addBtn.addEventListener("click", function () { openAddCashier(repaint); });
    card.appendChild(addBtn);

    /* حاوية قائمة الكاشير */
    var listWrap = el("div", { class: "acc-list" });
    card.appendChild(listWrap);
    card.appendChild(el("div", { class: "hintbox", text: "الكاشير الجديد يبدأ بالصلاحيات اليومية الافتراضية (بيع/طباعة تذاكر، مرتجعات، مصروفات وهدايش، تقارير). يمكن منح أو سحب أي صلاحية بشكل مستقل من زر «الصلاحيات». الصلاحيات الإدارية الحساسة تبقى للمدير افتراضيًا. كل التغييرات محمية في العملية الرئيسية ولا يمكن للكاشير تعديل صلاحياته." }));

    var cashiers = [];

    async function refresh() {
      try {
        var res = await window.malahyAuth.listCashiers();
        cashiers = (res && res.ok && Array.isArray(res.cashiers)) ? res.cashiers : [];
      } catch (e) { logErr("listCashiers", e); cashiers = []; }
      var cnt = head.querySelector(".acc-count");
      if (cnt) cnt.textContent = String(cashiers.length);
    }

    function paintList() {
      listWrap.innerHTML = "";
      if (!cashiers.length) {
        listWrap.appendChild(el("div", { class: "acc-empty", text: "لا يوجد أي كاشير بعد. أضف كاشيرًا لبدء العمل اليومي." }));
        return;
      }
      cashiers.forEach(function (c) { listWrap.appendChild(cashierRow(c)); });
    }

    async function repaint() { await refresh(); paintList(); }

    await refresh();
    paintList();
    card._repaint = repaint;
    return card;
  }

  /* صفّ كاشير واحد: الاسم + الشارات + أزرار الإدارة */
  function cashierRow(c) {
    var row = el("div", { class: "acc-row" });

    var left = el("div", { class: "acc-id" });
    left.appendChild(el("div", { class: "acc-name", text: c.username }));
    var meta = el("div", { class: "acc-meta" }, [
      el("span", { class: "acc-role cashier", text: "كاشير" }),
      el("span", { class: "acc-status " + (c.active === false ? "off" : "on"), text: c.active === false ? "معطّل" : "فعّال" }),
    ]);
    if (c.mustChangePass) meta.appendChild(el("span", { class: "acc-flag", text: "تغيير كلمة السر مطلوب" }));
    left.appendChild(meta);
    row.appendChild(left);

    var acts = el("div", { class: "acc-acts" });

    /* الصلاحيات */
    var permsBtn = el("button", { class: "testbtn", type: "button", title: "تعديل الصلاحيات" }, "الصلاحيات");
    permsBtn.addEventListener("click", function () { openPermsEditor(c); });
    acts.appendChild(permsBtn);

    /* إعادة تعيين كلمة السر */
    var passBtn = el("button", { class: "testbtn", type: "button", title: "إعادة تعيين كلمة السر" }, "كلمة السر");
    passBtn.addEventListener("click", function () { openResetCashierPass(c); });
    acts.appendChild(passBtn);

    /* تغيير الاسم */
    var nameBtn = el("button", { class: "testbtn", type: "button", title: "تغيير اسم المستخدم" }, "الاسم");
    nameBtn.addEventListener("click", function () { openRenameCashier(c); });
    acts.appendChild(nameBtn);

    /* تفعيل/تعطيل */
    var disabled = (c.active === false);
    var togBtn = el("button", { class: "testbtn " + (disabled ? "" : "danger"), type: "button",
      title: disabled ? "تفعيل الحساب" : "تعطيل الحساب" }, disabled ? "تفعيل" : "تعطيل");
    togBtn.addEventListener("click", async function () {
      if (!guardAdmin()) return;
      var next = disabled; /* true → تفعيل (enable), false → تعطيل (disable) */
      try {
        var res = await window.malahyAuth.setCashierActive(c.id, next);
        if (res && res.ok) {
          toast(next ? ("تم تفعيل حساب «" + c.username + "» ✓") : ("تم تعطيل حساب «" + c.username + "» — لن يستطيع تسجيل الدخول"), "ok");
          if (typeof repaintAll === "function") repaintAll();
        } else {
          toast(errText(res && res.error), "warn");
        }
      } catch (e) { logErr("setCashierActive", e); toast("تعذّر تغيير حالة الحساب", "warn"); }
    });
    acts.appendChild(togBtn);

    row.appendChild(acts);
    return row;
  }

  /* إعادة رسم البطاقات داخل نافذة الإعدادات (تُضبط من openSettings) */
  var _repaintFn = null;
  function repaintAll() { try { if (_repaintFn) _repaintFn(); } catch (_) {} }

  /* ===================================================================== *
   *  نافذة: إضافة كاشير
   * ===================================================================== */
  function openAddCashier(done) {
    if (!guardAdmin()) return;
    var uIn = el("input", { type: "text", id: "accNewUser", placeholder: "اسم المستخدم", autocomplete: "off" });
    var pIn = el("input", { type: "password", id: "accNewPass", placeholder: "كلمة المرور", autocomplete: "new-password" });
    var p2In = el("input", { type: "password", id: "accNewPass2", placeholder: "تأكيد كلمة المرور", autocomplete: "new-password" });
    var err = el("div", { class: "modal-err" });

    var sub = openSub("＋ إضافة كاشير جديد", {
      message: "سيحصل الكاشير على الصلاحيات اليومية الافتراضية، وسيُطلب منه تغيير كلمة السر عند أول تسجيل دخول.",
      body: [
        el("div", { class: "field" }, [el("label", { text: "اسم المستخدم" }), uIn]),
        el("div", { class: "field" }, [el("label", { text: "كلمة المرور" }), pIn]),
        el("div", { class: "field" }, [el("label", { text: "تأكيد كلمة المرور" }), p2In]),
        err,
      ],
    });
    var cancelBtn = el("button", { class: "cancel", text: "إلغاء" });
    cancelBtn.addEventListener("click", sub.close);
    var okBtn = el("button", { class: "confirm", text: "إنشاء الحساب" });
    okBtn.addEventListener("click", async function () {
      var u = (uIn.value || "").trim();
      var p = pIn.value || "";
      var p2 = p2In.value || "";
      err.textContent = "";
      if (u.length < 2) { err.textContent = "اسم المستخدم يجب ألا يقل عن حرفين"; uIn.focus(); return; }
      if (p.length < MIN_PASS) { err.textContent = "كلمة المرور يجب ألا تقل عن ٤ أحرف"; pIn.focus(); return; }
      if (p !== p2) { err.textContent = "كلمتا المرور غير متطابقتين"; p2In.focus(); return; }
      try { okBtn.disabled = true; } catch (_) {}
      try {
        var res = await window.malahyAuth.createCashier(u, p);
        try { okBtn.disabled = false; } catch (_) {}
        if (res && res.ok) {
          sub.close();
          toast("تم إنشاء حساب الكاشير «" + u + "» ✓", "ok");
          if (typeof done === "function") done();
        } else {
          err.textContent = errText(res && res.error);
          if ((res && res.error) === "username-taken") uIn.focus();
        }
      } catch (e) {
        try { okBtn.disabled = false; } catch (_) {}
        logErr("createCashier", e);
        err.textContent = "تعذّر إنشاء الحساب";
      }
    });
    sub.acts.appendChild(cancelBtn);
    sub.acts.appendChild(okBtn);
    try { uIn.focus(); } catch (_) {}
  }

  /* ===================================================================== *
   *  نافذة: تعديل صلاحيات كاشير (منح / سحب / استعادة)
   * ===================================================================== */
  function openPermsEditor(c) {
    if (!guardAdmin()) return;

    var loading = el("div", { class: "acc-empty", text: "جارٍ تحميل الصلاحيات…" });
    var sub = openSub("🎛️ صلاحيات: " + c.username, {
      message: "كل صلاحية مستقلّة. الصلاحيات الافتراضية للكاشير محدّدة، وكل تغيير يحتاج حفظًا. التغيير يُطبّق على حساب الكاشير ويظهر عند تسجيل دخوله التالي.",
      body: [loading],
    });
    var cancelBtn = el("button", { class: "cancel", text: "إلغاء" });
    cancelBtn.addEventListener("click", sub.close);

    (async function () {
      var perms = null;
      try { var res = await window.malahyAuth.getCashierPerms(c.id); if (res && res.ok) perms = res.perms; }
      catch (e) { logErr("getCashierPerms", e); perms = null; }
      if (!perms) {
        loading.textContent = "تعذّر تحميل الصلاحيات";
        sub.acts.appendChild(cancelBtn);
        return;
      }
      loading.remove();

      var daily = [];
      var sensitive = [];
      PERMS().forEach(function (id) {
        if (isDefaultAllow(id)) daily.push(id); else sensitive.push(id);
      });

      var boxes = {};

      function permRow(id) {
        var granted = (perms[id] === true);
        var def = isDefaultAllow(id);
        var cb = el("input", { type: "checkbox" });
        cb.checked = granted;
        boxes[id] = cb;
        var badge = null;
        if (granted && def) badge = el("span", { class: "acc-badge def", text: "افتراضي ✓" });
        else if (granted && !def) badge = el("span", { class: "acc-badge granted", text: "ممنوحة إضافية" });
        else if (!granted && def) badge = el("span", { class: "acc-badge revoked", text: "افتراضي مُلغى" });
        else badge = el("span", { class: "acc-badge off", text: "غير مفعّلة" });
        var lab = el("label", { class: "switch" }, [cb, label(id), badge]);
        cb.addEventListener("change", function () {
          var on = cb.checked;
          var cls = on ? (def ? "def" : "granted") : (def ? "revoked" : "off");
          badge.className = "acc-badge " + cls;
          badge.textContent = on ? (def ? "افتراضي ✓" : "ممنوحة إضافية") : (def ? "افتراضي مُلغى" : "غير مفعّلة");
        });
        return lab;
      }

      /* مجموعة الصلاحيات اليومية */
      if (daily.length) {
        var g1 = el("div", { class: "acc-group" });
        g1.appendChild(el("div", { class: "acc-group-h", text: "صلاحيات الكاشير اليومية (افتراضية)" }));
        daily.forEach(function (id) { g1.appendChild(permRow(id)); });
        sub.body.appendChild(g1);
      }
      /* مجموعة الصلاحيات الإدارية الحساسة */
      if (sensitive.length) {
        var g2 = el("div", { class: "acc-group sensitive" });
        g2.appendChild(el("div", { class: "acc-group-h danger", text: "⚠️ صلاحيات إدارية حساسة (للمدير افتراضيًا)" }));
        g2.appendChild(el("div", { class: "acc-warn", text: "هذه الصلاحيات تسمح بعمليات إدارية/تدميرية (إدارة الألعاب والموظفين، الرواتب، أرشفة اليوم، حذف السجل، الإعدادات). لا تُمنح إلا للحسابات الموثوقة جدًا." }));
        sensitive.forEach(function (id) { g2.appendChild(permRow(id)); });
        sub.body.appendChild(g2);
      }

      var err = el("div", { class: "modal-err" });
      sub.body.appendChild(err);

      var okBtn = el("button", { class: "confirm", text: "حفظ الصلاحيات" });
      okBtn.addEventListener("click", async function () {
        if (!guardAdmin()) return;
        /* نُرسل الحالة الكاملة لكل الصلاحيات المسجّلة (وليس الفرق فقط) حتى لا
           ترجع أي صلاحية غير مذكورة إلى قيمتها الافتراضية. */
        var out = {};
        PERMS().forEach(function (id) { out[id] = !!(boxes[id] && boxes[id].checked); });
        try { okBtn.disabled = true; } catch (_) {}
        try {
          var res = await window.malahyAuth.setCashierPerms(c.id, out);
          try { okBtn.disabled = false; } catch (_) {}
          if (res && res.ok) {
            sub.close();
            toast("تم حفظ صلاحيات «" + c.username + "» ✓ — تُطبّق عند تسجيل دخوله التالي", "ok");
            repaintAll();
          } else {
            err.textContent = errText(res && res.error);
          }
        } catch (e) {
          try { okBtn.disabled = false; } catch (_) {}
          logErr("setCashierPerms", e);
          err.textContent = "تعذّر حفظ الصلاحيات";
        }
      });
      sub.acts.appendChild(cancelBtn);
      sub.acts.appendChild(okBtn);
    })();
  }

  /* ===================================================================== *
   *  نافذة: إعادة تعيين كلمة سر كاشير (للأدمن)
   * ===================================================================== */
  function openResetCashierPass(c) {
    if (!guardAdmin()) return;
    var pIn = el("input", { type: "password", id: "accRpPass", placeholder: "كلمة المرور الجديدة", autocomplete: "new-password" });
    var p2In = el("input", { type: "password", id: "accRpPass2", placeholder: "تأكيد كلمة المرور الجديدة", autocomplete: "new-password" });
    var err = el("div", { class: "modal-err" });
    var sub = openSub("🔑 إعادة تعيين كلمة السر", {
      message: "الحساب: " + c.username + " — سيُطلب من الكاشير تغيير هذه الكلمة عند تسجيل دخوله التالي.",
      body: [
        el("div", { class: "field" }, [el("label", { text: "كلمة المرور الجديدة" }), pIn]),
        el("div", { class: "field" }, [el("label", { text: "تأكيد كلمة المرور الجديدة" }), p2In]),
        err,
      ],
    });
    var cancelBtn = el("button", { class: "cancel", text: "إلغاء" });
    cancelBtn.addEventListener("click", sub.close);
    var okBtn = el("button", { class: "confirm danger", text: "إعادة التعيين" });
    okBtn.addEventListener("click", async function () {
      var p = pIn.value || "";
      var p2 = p2In.value || "";
      err.textContent = "";
      if (p.length < MIN_PASS) { err.textContent = "كلمة المرور يجب ألا تقل عن ٤ أحرف"; pIn.focus(); return; }
      if (p !== p2) { err.textContent = "كلمتا المرور غير متطابقتين"; p2In.focus(); return; }
      try { okBtn.disabled = true; } catch (_) {}
      try {
        var res = await window.malahyAuth.resetCashier(c.id, p);
        try { okBtn.disabled = false; } catch (_) {}
        if (res && res.ok) {
          sub.close();
          toast("تم إعادة تعيين كلمة سر «" + c.username + "» ✓", "ok");
          repaintAll();
        } else {
          err.textContent = errText(res && res.error);
        }
      } catch (e) {
        try { okBtn.disabled = false; } catch (_) {}
        logErr("resetCashier", e);
        err.textContent = "تعذّر إعادة تعيين كلمة السر";
      }
    });
    sub.acts.appendChild(cancelBtn);
    sub.acts.appendChild(okBtn);
    try { pIn.focus(); } catch (_) {}
  }

  /* ===================================================================== *
   *  نافذة: تغيير اسم مستخدم كاشير
   * ===================================================================== */
  function openRenameCashier(c) {
    if (!guardAdmin()) return;
    var uIn = el("input", { type: "text", value: c.username, autocomplete: "off" });
    var err = el("div", { class: "modal-err" });
    var sub = openSub("✏️ تغيير اسم الكاشير", {
      message: "الاسم الحالي: " + c.username + " — لا تُمسَّ كلمة السر ولا الصلاحيات.",
      body: [
        el("div", { class: "field" }, [el("label", { text: "اسم المستخدم الجديد" }), uIn]),
        err,
      ],
    });
    var cancelBtn = el("button", { class: "cancel", text: "إلغاء" });
    cancelBtn.addEventListener("click", sub.close);
    var okBtn = el("button", { class: "confirm", text: "حفظ الاسم" });
    okBtn.addEventListener("click", async function () {
      var u = (uIn.value || "").trim();
      err.textContent = "";
      if (u.length < 2) { err.textContent = "اسم المستخدم يجب ألا يقل عن حرفين"; uIn.focus(); return; }
      try { okBtn.disabled = true; } catch (_) {}
      try {
        var res = await window.malahyAuth.setCashierUsername(c.id, u);
        try { okBtn.disabled = false; } catch (_) {}
        if (res && res.ok) {
          sub.close();
          toast("تم تغيير اسم الكاشير إلى «" + u + "» ✓", "ok");
          repaintAll();
        } else {
          err.textContent = errText(res && res.error);
          if ((res && res.error) === "username-taken") uIn.focus();
        }
      } catch (e) {
        try { okBtn.disabled = false; } catch (_) {}
        logErr("setCashierUsername", e);
        err.textContent = "تعذّر تغيير الاسم";
      }
    });
    sub.acts.appendChild(cancelBtn);
    sub.acts.appendChild(okBtn);
    try { uIn.focus(); } catch (_) {}
  }

  /* ===================================================================== *
   *  تغيير كلمة السر الخاصة (للأدمن والكاشير — يتطلب كلمة السر الحالية)
   * ===================================================================== */
  function changeMyPassword() {
    var s = session();
    if (!s || !s.id) { toast("يجب تسجيل الدخول أولًا", "warn"); return; }
    if (!hasBridge()) { toast("تعذّر الوصول لنظام الحسابات", "warn"); return; }
    var oldIn = el("input", { type: "password", placeholder: "كلمة السر الحالية", autocomplete: "current-password" });
    var newIn = el("input", { type: "password", placeholder: "كلمة السر الجديدة", autocomplete: "new-password" });
    var new2In = el("input", { type: "password", placeholder: "تأكيد كلمة السر الجديدة", autocomplete: "new-password" });
    var err = el("div", { class: "modal-err" });
    var who = (s.role === "admin") ? "حساب المدير" : ("حساب الكاشير «" + s.username + "»");
    var sub = openSub("🔑 تغيير كلمة السر — " + who, {
      message: "يجب إدخال كلمة السر الحالية. كل مستخدم يغيّر كلمة سره الخاصة فقط.",
      body: [
        el("div", { class: "field" }, [el("label", { text: "كلمة السر الحالية" }), oldIn]),
        el("div", { class: "field" }, [el("label", { text: "كلمة السر الجديدة" }), newIn]),
        el("div", { class: "field" }, [el("label", { text: "تأكيد كلمة السر الجديدة" }), new2In]),
        err,
      ],
    });
    var cancelBtn = el("button", { class: "cancel", text: "إلغاء" });
    cancelBtn.addEventListener("click", sub.close);
    var okBtn = el("button", { class: "confirm", text: "حفظ كلمة السر" });
    okBtn.addEventListener("click", async function () {
      var o = oldIn.value || "", n = newIn.value || "", n2 = new2In.value || "";
      err.textContent = "";
      if (!o || !n || !n2) { err.textContent = "يرجى ملء جميع الحقول"; return; }
      if (n.length < MIN_PASS) { err.textContent = "كلمة المرور الجديدة يجب ألا تقل عن ٤ أحرف"; newIn.focus(); return; }
      if (n !== n2) { err.textContent = "كلمتا المرور الجديدتان غير متطابقتين"; new2In.focus(); return; }
      try { okBtn.disabled = true; } catch (_) {}
      try {
        var res = await window.malahyAuth.changePass(s.id, o, n);
        try { okBtn.disabled = false; } catch (_) {}
        if (res && res.ok) {
          sub.close();
          toast("تم تغيير كلمة السر ✓", "ok");
        } else {
          err.textContent = errText(res && res.error, "كلمة السر الحالية غير صحيحة");
          try { oldIn.value = ""; oldIn.focus(); } catch (_) {}
        }
      } catch (e) {
        try { okBtn.disabled = false; } catch (_) {}
        logErr("changeMyPassword", e);
        err.textContent = "تعذّر تغيير كلمة السر";
      }
    });
    sub.acts.appendChild(cancelBtn);
    sub.acts.appendChild(okBtn);
    try { oldIn.focus(); } catch (_) {}
  }

  /* ===================================================================== *
   *  الواجهة العامة: بناء البطاقات لنافذة الإعدادات (للمدير فقط)
   * ===================================================================== */
  async function buildCards() {
    if (!isAdmin()) return [];          /* بطاقات الإدارة للمدير فقط */
    if (!hasBridge()) return [];
    try {
      var adminCard = await buildAdminCard();
      var cashierCard = await buildCashierCard();
      _repaintFn = function () {
        try { if (cashierCard && cashierCard._repaint) cashierCard._repaint(); } catch (_) {}
      };
      return [adminCard, cashierCard];
    } catch (e) {
      logErr("buildCards", e);
      return [];
    }
  }

  var api = {
    buildCards: buildCards,
    changeMyPassword: changeMyPassword,
  };
  if (typeof window !== "undefined") {
    window.MalahyAccounts = api;
    /* غلاف عام لتغيير كلمة السر (نفس أسلوب malahyLogout في login.js) */
    window.malahyChangeMyPass = function () { try { changeMyPassword(); } catch (_) {} };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
