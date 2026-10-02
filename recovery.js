/* recovery.js — استعادة كلمة مرور حساب المدير (المرحلة 3C-4)
   ---------------------------------------------------------------
   تُضاف إلى شاشة الدخول الموجودة (login.js) مسار «نسيت كلمة المرور؟»:

     ١) المستخدم يختار «نسيت كلمة المرور» فيُشرح له البرنامج أن الاستعادة
        تتطلب رقم واتساب الاستعادة المضبوط لحساب المدير.
     ٢) يُدخل/يؤكّد الرقم → العملية الرئيسية تتحقق منه (users.beginRecovery)
        وتولّد رمزًا عشوائيًا آمنًا تُخزّن تجزئته فقط، وتُرجعه مرة واحدة.
     ٣) نفتح واتساب على الرقم المضبوط برسالة جاهزة تحتوي الرمز، ويضغط
        المستخدم زر الإرسال يدويًا. لا يوجد أي تكامل WhatsApp API داخل
        التطبيق (لا رموز Meta ولا مفاتيح ولا خادم) — الإرسال ليس تلقائيًا.
     ٤) يُدخل المستخدم الرمز + كلمة السر الجديدة → العملية الرئيسية تتحقق
        من الرمز (صلاحية/حدّ محاولات/استخدام لمرة واحدة) ثم تستبدل كلمة
        سر المدير وتُبطل الرمز فورًا. كلمة السر القديمة غير مطلوبة إطلاقًا.

   قواعد أمنية صارمة:
   - الرمز لا يُعرض في الواجهة ولا في أي سجل أبدًا — يذهب إلى رسالة واتساب
     فقط، ولا يُمرّر إلا إلى آلية فتح الرابط الخارجية المعتمدة.
   - لا يُقرأ/يُكتب قاعدة البيانات ولا أي سر من هنا — كل شيء عبر malahyAuth.
   - لا يُنشئ حسابات ولا يلمس الكاشيرين/الصلاحيات/المبيعات/التقارير.
   - إن تعذّل تحميل الوحدة أو نقص أي عنصر/جسر لا يتأثر تسجيل الدخول العادي
     (fail-safe: كل شيء محروس وفشل الوحدة صامت). */

(function () {
  "use strict";

  /* ============ أدوات DOM مستقلة (نفس أسلوب باقي الوحدات) ============ */
  var BOOL_PROPS = { checked: 1, disabled: 1, readOnly: 1, autofocus: 1 };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
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
  function logErr(where, err) {
    /* لا نُمرّر أي رمز أو سر أبدًا — فقط سياق الخطأ */
    try { if (typeof window.logErr === "function") window.logErr("recovery:" + where, err); } catch (_) {}
  }

  /* رسائل الرفض الموحّدة (لا تكشف أي تفاصيل داخلية) */
  var ERR = {
    "invalid-recovery-number": "رقم الاستعادة غير صحيح أو غير مُعدّ — تأكد من الرقم المرتبط بحساب المدير",
    "invalid-code": "الرمز غير صحيح أو انتهت صلاحيته — تحقق من الرسالة وأعد الإدخال",
    "too-many-attempts": "محاولات خاطئة كثيرة — أعد بدء الاستعادة للحصول على رمز جديد",
    "weak-password": "كلمة المرور يجب ألا تقل عن ٤ أحرف",
    "confirm-mismatch": "كلمتا المرور غير متطابقتين",
    "not-initialized": "نظام الحسابات غير مهيّأ بعد",
  };
  function errText(code, fallback) {
    if (code && ERR[code]) return ERR[code];
    return fallback || "تعذّر إكمال العملية، حاول مرة أخرى";
  }

  var MIN_PASS = 4; /* نفس users.js */

  /* ============ تطبيع الرقم وبناء وجهة واتساب ============ */
  function digitsOnly(s) { return String(s == null ? "" : s).replace(/[^0-9]/g, ""); }
  /* wa.me يتوقع رقمًا دوليًا بدون «+» وبدون بادئة «00» */
  function waDigits(num) {
    var d = digitsOnly(num);
    if (d.indexOf("00") === 0) d = d.slice(2);
    return d;
  }
  function buildWaUrl(digits, code, minutes) {
    var msg = "رمز استعادة كلمة مرور حساب المدير: " + code +
      "\nالصلاحية: " + minutes + " دقيقة — للاستخدام مرة واحدة فقط." +
      "\nإن لم تطلب استعادة كلمة المرور يمكنك تجاهل هذه الرسالة.";
    return "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg);
  }

  function hasBridge() {
    var a = window.malahyAuth;
    return !!(a && typeof a === "object" &&
      typeof a.beginRecovery === "function" &&
      typeof a.completeRecovery === "function");
  }

  /* ============ الحالة ============ */
  var ov = null, card = null, formLogin = null, formChange = null;
  var recWrap = null, stepA = null, stepB = null;
  var waIn = null, codeIn = null, newIn = null, confIn = null;
  var errA = null, errB = null, noteB = null;
  var btnA = null, btnB = null;
  var _inited = false;

  /* ============ عرض/إخفاء مسار الاستعادة ============ */
  function showRecovery() {
    try { formLogin.style.display = "none"; } catch (_) {}
    try { formChange.style.display = "none"; } catch (_) {}
    try { recWrap.style.display = ""; } catch (_) {}
    resetFields();
    try { if (waIn) waIn.focus(); } catch (_) {}
  }
  function backToLogin() {
    try { recWrap.style.display = "none"; } catch (_) {}
    try { formChange.style.display = "none"; } catch (_) {}
    try { formLogin.style.display = ""; } catch (_) {}
    resetFields();
    /* العودة لحقل كلمة المرور في نموذج الدخول العادي */
    try { var p = document.getElementById("loginPass"); if (p) p.focus(); } catch (_) {}
  }
  function resetFields() {
    try { if (waIn) waIn.value = ""; } catch (_) {}
    try { if (codeIn) codeIn.value = ""; } catch (_) {}
    try { if (newIn) newIn.value = ""; } catch (_) {}
    try { if (confIn) confIn.value = ""; } catch (_) {}
    try { if (errA) errA.textContent = ""; } catch (_) {}
    try { if (errB) errB.textContent = ""; } catch (_) {}
    try { if (stepA) stepA.style.display = ""; } catch (_) {}
    try { if (stepB) stepB.style.display = "none"; } catch (_) {}
  }

  function invoke(fn) {
    try {
      var p = fn();
      if (p && typeof p.then === "function") return p;
      return Promise.resolve(p);
    } catch (e) { return Promise.resolve(null); }
  }

  /* ============ الخطوة ١: طلب الرمز ============ */
  function doBegin() {
    if (!hasBridge()) { try { if (errA) errA.textContent = "تعذّر الوصول لنظام الاستعادة"; } catch (_) {} return; }
    var num = "";
    try { num = waIn ? String(waIn.value).trim() : ""; } catch (_) {}
    if (!digitsOnly(num)) { try { if (errA) errA.textContent = "أدخل رقم واتساب الاستعادة (أرقام مع رمز الدولة)"; } catch (_) {} return; }
    try { if (errA) errA.textContent = ""; } catch (_) {}
    try { if (btnA) btnA.disabled = true; } catch (_) {}

    invoke(function () { return window.malahyAuth.beginRecovery(num); }).then(function (res) {
      try { if (btnA) btnA.disabled = false; } catch (_) {}
      if (!res || !res.ok) {
        try { if (errA) errA.textContent = errText(res && res.error, "تعذّر بدء الاستعادة"); } catch (_) {}
        try { if (waIn) { waIn.value = ""; waIn.focus(); } } catch (_) {}
        return;
      }
      /* فتح واتساب برسالة جاهزة — الإرسال يدوي ولن يتم تلقائيًا.
         الرمز يذهب إلى الرقم المضبوط فقط ولا يُعرض هنا. */
      var digits = waDigits(res.whatsapp || num);
      var minutes = Math.max(1, Math.round((res.ttlSeconds || 600) / 60));
      var opened = false;
      try {
        if (window.malahyShell && typeof window.malahyShell.openExternal === "function") {
          window.malahyShell.openExternal(buildWaUrl(digits, res.code, minutes));
          opened = true;
        }
      } catch (e) { logErr("openExternal", e); opened = false; }

      if (!opened) {
        /* بقينا في الخطوة ١: أي محاولة جديدة تُولّد رمزًا جديدًا وتُبطل الحالي */
        try { if (errA) errA.textContent = "تعذّر فتح واتساب — تأكد من توفره على الجهاز ثم أعد المحاولة"; } catch (_) {}
        return;
      }

      try {
        if (noteB) {
          noteB.innerHTML = "";
          noteB.appendChild(el("div", { class: "rec-note-ok" }, [
            "تم فتح واتساب على الرقم " + digits + " برسالة جاهزة تحتوي الرمز. ",
            "الإرسال لا يتم تلقائيًا: اضغط زر الإرسال داخل واتساب بنفسك، ",
            "ثم اقرأ الرمز من الرسالة الواردة على هذا الرقم. ",
            "لأسباب أمنية لا يُعرض الرمز هنا أبدًا.",
          ]));
        }
      } catch (e) { logErr("noteB", e); }

      try { if (stepA) stepA.style.display = "none"; } catch (_) {}
      try { if (stepB) stepB.style.display = ""; } catch (_) {}
      try { if (codeIn) codeIn.focus(); } catch (_) {}
    }).catch(function () {
      try { if (btnA) btnA.disabled = false; } catch (_) {}
      try { if (errA) errA.textContent = "تعذّر بدء الاستعادة، حاول مرة أخرى"; } catch (_) {}
    });
  }

  /* ============ الخطوة ٢: الرمز + كلمة السر الجديدة ============ */
  function doComplete() {
    if (!hasBridge()) { try { if (errB) errB.textContent = "تعذّر الوصول لنظام الاستعادة"; } catch (_) {} return; }
    var code = "", np = "", cf = "";
    try { code = codeIn ? String(codeIn.value).trim() : ""; } catch (_) {}
    try { np = newIn ? String(newIn.value) : ""; } catch (_) {}
    try { cf = confIn ? String(confIn.value) : ""; } catch (_) {}
    if (!digitsOnly(code)) { try { if (errB) errB.textContent = "أدخل الرمز المرسل إلى رقم الاستعادة"; } catch (_) {} return; }
    if (!np || !cf) { try { if (errB) errB.textContent = "يرجى إدخال كلمة السر الجديدة وتأكيدها"; } catch (_) {} return; }
    if (np.length < MIN_PASS) { try { if (errB) errB.textContent = "كلمة المرور يجب ألا تقل عن ٤ أحرف"; } catch (_) {} return; }
    if (np !== cf) { try { if (errB) errB.textContent = "كلمتا المرور غير متطابقتين"; } catch (_) {} return; }
    try { if (errB) errB.textContent = ""; } catch (_) {}
    try { if (btnB) btnB.disabled = true; } catch (_) {}

    invoke(function () { return window.malahyAuth.completeRecovery(code, np, cf); }).then(function (res) {
      try { if (btnB) btnB.disabled = false; } catch (_) {}
      if (!res || !res.ok) {
        try { if (errB) errB.textContent = errText(res && res.error, "تعذّر إكمال الاستعادة"); } catch (_) {}
        /* بعد القفل يلزم بدء استعادة جديدة → نعود للخطوة ١ */
        if ((res && res.error) === "too-many-attempts") {
          try { if (stepB) stepB.style.display = "none"; } catch (_) {}
          try { if (stepA) stepA.style.display = ""; } catch (_) {}
          resetFields();
        } else {
          try { if (codeIn) { codeIn.value = ""; codeIn.focus(); } } catch (_) {}
        }
        return;
      }
      toast("تم تغيير كلمة مرور المدير ✓ — سجّل الدخول بكلمة السر الجديدة", "ok");
      backToLogin();
    }).catch(function () {
      try { if (btnB) btnB.disabled = false; } catch (_) {}
      try { if (errB) errB.textContent = "تعذّر إكمال الاستعادة، حاول مرة أخرى"; } catch (_) {}
    });
  }

  /* ============ بناء الواجهة داخل شاشة الدخول الحالية ============ */
  function build() {
    card = ov.querySelector(".login-card");
    formLogin = document.getElementById("loginForm");
    formChange = document.getElementById("loginChangeForm");
    if (!card || !formLogin) return false;

    /* رابط «نسيت كلمة المرور» داخل نموذج الدخول */
    var link = el("button", { class: "rec-link", type: "button" }, "نسيت كلمة المرور؟");
    link.addEventListener("click", function () { showRecovery(); });
    formLogin.appendChild(link);

    /* غلاف مسار الاستعادة (مخفي افتراضيًا — لا يؤثر على الدخول العادي) */
    recWrap = el("div", { id: "recWrap", class: "rec-wrap" });
    recWrap.style.display = "none";

    /* زر الرجوع (← رجوع): يُغلق مسار الاستعادة ويعيد شاشة الدخول العادية
       عبر backToLogin() الموجودة مسبقًا — لا يُغيّر أي حالة استعادة مخزّنة. */
    var backBtn = el("button", { class: "rec-back", type: "button", id: "recBackBtn" }, "← رجوع");
    backBtn.addEventListener("click", function () { backToLogin(); });
    recWrap.appendChild(backBtn);

    /* ---- الخطوة ١: شرح + الرقم ---- */
    stepA = el("div", { id: "recStepA", class: "rec-step" });
    stepA.appendChild(el("p", { class: "act-msg rec-msg" }, [
      "استعادة كلمة مرور حساب المدير تتطلب رقم واتساب الاستعادة المضبوط مسبقًا ",
      "من الإعدادات. أدخل الرقم ليُولّد البرنامج رمز استعادة عشوائيًا آمنًا ",
      "يُرسل إلى هذا الرقم عبر واتساب. كلمة السر الحالية غير مطلوبة.",
    ]));
    waIn = el("input", { type: "tel", id: "recWa", dir: "ltr", placeholder: "مثال: 201001234567",
      autocomplete: "off", "aria-label": "رقم واتساب الاستعادة" });
    errA = el("div", { class: "act-err", id: "recErrA" });
    btnA = el("button", { class: "act-btn", type: "button", id: "recBtnA" }, "بدء الاستعادة");
    btnA.addEventListener("click", function () { doBegin(); });
    stepA.appendChild(el("div", { class: "act-field login-field" }, [
      el("label", { class: "login-label", text: "رقم واتساب الاستعادة" }), waIn,
    ]));
    stepA.appendChild(btnA);
    stepA.appendChild(errA);

    /* ---- الخطوة ٢: واتساب جاهز + الرمز + كلمة السر ---- */
    stepB = el("div", { id: "recStepB", class: "rec-step" });
    stepB.style.display = "none";
    noteB = el("div", { class: "rec-note", id: "recNote" });
    codeIn = el("input", { type: "text", inputmode: "numeric", id: "recCode", dir: "ltr",
      placeholder: "••••••", autocomplete: "off", "aria-label": "رمز الاستعادة" });
    newIn = el("input", { type: "password", id: "recNew", autocomplete: "new-password",
      placeholder: "••••", "aria-label": "كلمة المرور الجديدة" });
    confIn = el("input", { type: "password", id: "recConfirm", autocomplete: "new-password",
      placeholder: "••••", "aria-label": "تأكيد كلمة المرور الجديدة" });
    errB = el("div", { class: "act-err", id: "recErrB" });
    btnB = el("button", { class: "act-btn", type: "button", id: "recBtnB" }, "تأكيد الاستعادة");
    btnB.addEventListener("click", function () { doComplete(); });
    stepB.appendChild(noteB);
    stepB.appendChild(el("div", { class: "act-field login-field" }, [
      el("label", { class: "login-label", text: "رمز الاستعادة المرسل إلى واتساب" }), codeIn,
    ]));
    stepB.appendChild(el("div", { class: "act-field login-field" }, [
      el("label", { class: "login-label", text: "كلمة المرور الجديدة" }), newIn,
    ]));
    stepB.appendChild(el("div", { class: "act-field login-field" }, [
      el("label", { class: "login-label", text: "تأكيد كلمة المرور الجديدة" }), confIn,
    ]));
    stepB.appendChild(el("div", { class: "login-hint", text: "٤ أحرف على الأقل. كلمة السر القديمة غير مطلوبة بعد التحقق من الرمز." }));
    stepB.appendChild(btnB);
    stepB.appendChild(errB);
    var backB = el("button", { class: "rec-link", type: "button" }, "العودة لتسجيل الدخول");
    backB.addEventListener("click", function () { backToLogin(); });
    stepB.appendChild(backB);

    recWrap.appendChild(stepA);
    recWrap.appendChild(stepB);
    card.appendChild(recWrap);

    /* إدخال عبر Enter داخل حقول الاستعادة */
    [waIn, codeIn, newIn, confIn].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        try { e.preventDefault(); } catch (_) {}
        if (stepB.style.display === "none") doBegin(); else doComplete();
      });
    });

    /* إعادة الضبط عند إخفاء شاشة الدخول (بعد الدخول/الخروج) حتى تبدأ
       نظيفة دائمًا عند إظهارها مجددًا. */
    try {
      new MutationObserver(function () {
        if (ov.classList.contains("hide")) resetFields();
      }).observe(ov, { attributes: true, attributeFilter: ["class"] });
    } catch (_) {}

    return true;
  }

  /* ============ التهيئة ============ */
  function init() {
    if (_inited) return;
    ov = document.getElementById("loginOverlay");
    if (!ov) return; /* شاشة الدخول غير موجودة → لا شيء (fail-safe) */
    if (!hasBridge()) return; /* الجسر غير متاح → لا يظهر المسار أبدًا */
    _inited = true;
    if (!build()) { _inited = false; }
  }

  var api = { init: init, showRecovery: showRecovery, backToLogin: backToLogin };
  if (typeof window !== "undefined") {
    window.MalahyRecovery = api;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { try { init(); } catch (_) {} });
    } else {
      try { init(); } catch (_) {}
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
