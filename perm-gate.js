/* perm-gate.js — بوابة الصلاحيات في الواجهة (المرحلة 3C-2)
   ---------------------------------------------------------------
   المصدر الوحيد لقرار الصلاحية داخل الواجهة. لا يُكتب منطق صلاحيات منفصل
   عند كل زر: كل العمليات المحمية تمرّ من هنا.

   - requirePerm(permId, opts): يفحص الجلسة المُصادَق عليها؛
       * الأدمن → مسموح تلقائيًا.
       * الكاشير → الصلاحيات الممنوحة فقط؛ غير المعروف مرفوض.
       * مُصرَّح → نافذة تأكيد العملية (نفس عادات v2.5.1، بدون كلمة سر)
         ثم استدعاء onOk(reason؟).
       * غير مُصرَّح → رسالة واضحة "ليس لديك صلاحية لتنفيذ هذه العملية".
   - hasPerm(permId): فحص صامت (لإخفاء/إظهار عناصر الواجهة).
   - setSession(user)/clearSession(): تُغذّى من login.js فقط (بيانات منظّفة).
   - applyVisibility(): إخفاء عناصر [data-perm] غير المسموح بها.

   الجلسة مصدرها العملية الرئيسية (auth:login) — لا يوجد أي سر هنا،
   ولا يُقبل دور قادم من الواجهة نفسها. */

(function () {
  "use strict";

  var P = null;
  try {
    if (typeof require === "function" && typeof module !== "undefined") {
      P = require("./permissions");
    }
  } catch (_) { P = null; }
  if (!P && typeof window !== "undefined") P = window.MalahyPerms;

  var _session = null;
  var DENIED_MSG = "ليس لديك صلاحية لتنفيذ هذه العملية";

  /* ============ فحص الصلاحية (الطبقة الأولى في الواجهة) ============ */
  function hasPerm(permId) {
    if (!_session) return false;
    if (_session.role === "admin") return true;
    var id = String(permId || "");
    if (P && !P.isKnownPerm(id)) return false; /* معرّف غير معروف → مرفوض */
    return !!(_session.perms && _session.perms[id] === true);
  }

  /* ============ الرسالة الموحّدة للرفض ============ */
  function deny(msg) {
    var m = msg || DENIED_MSG;
    try { if (typeof toast === "function") toast(m, "warn"); } catch (_) {}
    return false;
  }

  /* ============ نافذة تأكيد العملية (بدون كلمة سر) ============ */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  /* confirmModal: تعرض نافذة التأكيد وتستدعي onOk(reason) عند التأكيد.
       - secondary=true → نافذة فرعية (.ovl2) تبقي النافذة الأم مفتوحة
         (نفس فكرة empAskPass لنوافذ الموظفين/الألعاب).
       - secondary=false → النافذة الرئيسية (#overlay) كالمعتاد. */
  function confirmModal(opts, onOk, onCancel) {
    opts = opts || {};
    var reasonIn = null;

    function closeMain() {
      var ov = document.getElementById("overlay");
      if (ov) { try { ov.classList.remove("show"); ov.innerHTML = ""; } catch (_) {} }
    }

    var box = el("div", "modal");
    box.appendChild(el("h3", null, opts.title || "تأكيد العملية"));
    if (opts.message) box.appendChild(el("p", null, opts.message));

    if (opts.reasonLabel) {
      var f = el("div", "field");
      f.appendChild(el("label", null, opts.reasonLabel));
      reasonIn = el("input");
      reasonIn.setAttribute("type", "text");
      reasonIn.setAttribute("autocomplete", "off");
      if (opts.reasonPlaceholder) reasonIn.setAttribute("placeholder", opts.reasonPlaceholder);
      reasonIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doConfirm(); } });
      f.appendChild(reasonIn);
      box.appendChild(f);
    }

    var acts = el("div", "modal-actions");
    var cancelBtn = el("button", "cancel", "إلغاء");
    var confirmBtn = el("button", "confirm" + (opts.danger ? " danger" : ""), opts.confirmText || "تأكيد");
    acts.appendChild(cancelBtn);
    acts.appendChild(confirmBtn);
    box.appendChild(acts);

    function doConfirm() {
      var reason = "";
      if (reasonIn) { try { reason = (reasonIn.value || "").trim(); } catch (_) {} }
      if (opts.secondary) { try { ovl.remove(); } catch (_) {} }
      else closeMain();
      try { onOk(reason); } catch (_) {}
    }
    function doCancel() {
      if (opts.secondary) { try { ovl.remove(); } catch (_) {} }
      else closeMain();
      try { if (typeof onCancel === "function") onCancel(); } catch (_) {}
    }
    cancelBtn.addEventListener("click", doCancel);
    confirmBtn.addEventListener("click", doConfirm);

    if (opts.secondary) {
      var ovl = el("div", "ovl2");
      ovl.appendChild(box);
      ovl.addEventListener("click", function (ev) { if (ev.target === ovl) doCancel(); });
      ovl.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") { ev.stopPropagation(); doCancel(); }
        if (ev.key === "Enter" && !reasonIn) { ev.stopPropagation(); doConfirm(); }
      });
      try { document.body.appendChild(ovl); } catch (_) {}
      try { confirmBtn.focus(); } catch (_) {}
      return;
    }

    /* النافذة الرئيسية: نفس نمط showModal في v2.5.1 */
    var mainOv = document.getElementById("overlay");
    if (!mainOv) { try { onOk(""); } catch (_) {} return; }
    try { mainOv.innerHTML = ""; mainOv.appendChild(box); mainOv.classList.add("show"); } catch (_) {}
    try { (reasonIn || confirmBtn).focus(); } catch (_) {}
  }

  /* ============ البوابة المركزية ============ */
  /* requirePerm(permId, {title,message,confirmText,danger,reasonLabel,
       reasonPlaceholder,onOk,onCancel,onDenied,denyMessage,secondary})
     - مُصرَّح → نافذة تأكيد → onOk(reason).
     - غير مُصرَّح → رسالة الرفض فقط (لا تُستدعى onOk أبدًا). */
  function requirePerm(permId, opts) {
    opts = opts || {};
    if (hasPerm(permId)) {
      var onOk = (typeof opts.onOk === "function") ? opts.onOk : function () {};
      confirmModal(opts, function (reason) { onOk(reason); }, opts.onCancel);
      return true;
    }
    deny(opts.denyMessage);
    try { if (typeof opts.onDenied === "function") opts.onDenied(); } catch (_) {}
    return false;
  }

  /* ============ الجلسة (تُغذّى من login.js فقط) ============ */
  function setSession(user) {
    _session = (user && typeof user === "object") ? user : null;
    applyVisibility();
  }
  function clearSession() {
    _session = null;
    applyVisibility();
  }
  function getSession() { return _session; }

  /* ============ إخفاء عناصر الإدارة عن غير المصرّح لهم ============ */
  /* كل عنصر يحمل data-perm="<permId>" يُخفى لو لم يملك المستخدم صلاحيته.
       الإخفاء طبقة UX فقط — يبقى الفرض الفعلي عند تنفيذ العملية. */
  function applyVisibility() {
    var nodes = [];
    try { nodes = document.querySelectorAll("[data-perm]"); } catch (_) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var perm = null;
      try { perm = node.getAttribute("data-perm"); } catch (_) {}
      var allowed = hasPerm(perm);
      try { node.style.display = allowed ? "" : "none"; } catch (_) {}
    }
  }

  var api = {
    hasPerm: hasPerm,
    requirePerm: requirePerm,
    deny: deny,
    setSession: setSession,
    clearSession: clearSession,
    getSession: getSession,
    applyVisibility: applyVisibility,
    PERMS: (P && P.PERMS) || [],
  };
  if (typeof window !== "undefined") window.MalahyPerm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  /* الحالة الآمنة عند التحميل: لا جلسة بعد → إخفاء أزرار الإدارة.
       (شاشة الدخول مقفلة أصلاً؛ هذا مجرد احتياط إضافي.) */
  try { applyVisibility(); } catch (_) {}
})();
