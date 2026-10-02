/* login.js — شاشة تسجيل الدخول والجلسة (المرحلة 3C-1)
   ---------------------------------------------------------------
   - تظهر بعد اكتمال بوابة التفعيل (activation.js) وقبل الوصول للواجهة.
   - تستدعي window.malahyAuth.login فقط — كل قرارات المصادقة في العملية الرئيسية.
   - تقفل الواجهة (inert + focus trap) حتى يتم تسجيل دخول ناجح (fail-closed).
   - في حالة mustChangePass===true تطلب تغيير كلمة السر قبل الدخول للواجهة،
     وذلك عبر أساس auth:changePass الموجود بالفعل (المرحلة 3B).
   - لا تقرأ قاعدة البيانات مباشرةً ولا تلمس أي أسرار أبدًا: تحتفظ الواجهة
     فقط ببيانات المستخدم المنظّفة (sanitized) العائدة من auth:login.
   - تسجيل الخروج: ينهي الجلسة في العملية الرئيسية ويعرض شاشة الدخول مجددًا
     بدون مسّ أي بيانات أو إعدادات. */

(function(){
  "use strict";

  var ov=null, card=null;
  var formLogin=null, formChange=null;
  var inpUser=null, inpPass=null, inpOld=null, inpNew=null, inpConfirm=null;
  var errLogin=null, errChange=null;
  var btnLogin=null, btnChange=null;
  var _inited=false;
  var _unlocked=false;   /* هل تم الدخول للواجهة بنجاح */
  var _session=null;     /* بيانات المستخدم المنظّفة فقط (لا أسرار) */

  /* رسائل خطأ عامة لا تكشف ما إذا كان الاسم أم كلمة المرور هو الخطأ */
  var ERR_BAD_CREDENTIALS="بيانات الدخول غير صحيحة — تحقق من اسم المستخدم وكلمة المرور";
  var ERR_LOGIN_FAIL="تعذّر تسجيل الدخول، حاول مرة أخرى";

  var EVTS=["click","mousedown","mouseup","contextmenu","wheel","touchstart","touchmove","dblclick","keydown","keyup","keypress"];
  var FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /* ============ قفل الخلفية ومنع التفاعل قبل الدخول ============ */
  function blockEvts(e){
    if(card && e && e.target && (e.target===card || card.contains(e.target))) return;
    try{ e.stopPropagation(); }catch(_){}
    try{ e.preventDefault(); }catch(_){}
  }
  function setupBlock(){ EVTS.forEach(function(t){ ov.addEventListener(t,blockEvts,true); }); }
  function removeBlock(){ EVTS.forEach(function(t){ ov.removeEventListener(t,blockEvts,true); }); }

  /* كل عناصر <body> ما عدا غطاء الدخول (وغطاء التفعيل) تصبح inert —
     مستحيل النقر أو الوصول بالكيبورد للواجهة قبل تسجيل الدخول. */
  function setBgLock(on){
    try{
      var parent=ov.parentElement;
      if(!parent) return;
      var kids=parent.children;
      for(var i=0;i<kids.length;i++){
        var el=kids[i];
        if(el===ov) continue;
        if(el.id==="actOverlay") continue; /* التفعيل مسؤول عن قفله الخاص */
        if(on){
          el.setAttribute("inert","");
          el.setAttribute("aria-hidden","true");
        } else {
          el.removeAttribute("inert");
          el.removeAttribute("aria-hidden");
        }
      }
    }catch(_){}
  }

  /* فخ التركيز: زر Tab لا يخرج من شاشة الدخول */
  function trapTab(e){
    if(!ov.classList.contains("show")) return;
    if(e.key==="Escape"){ e.preventDefault(); return; }
    if(e.key!=="Tab") return;
    if(!card) return;
    var nodes=card.querySelectorAll(FOCUSABLE);
    if(!nodes.length) return;
    /* الحقول المخفية (نموذج التغيير) لا تشارك في ترتيب التبويب */
    var vis=[];
    for(var i=0;i<nodes.length;i++){ if(nodes[i].offsetParent!==null) vis.push(nodes[i]); }
    if(!vis.length) return;
    var first=vis[0], last=vis[vis.length-1];
    var active=document.activeElement;
    if(e.shiftKey){
      if(active===first || !card.contains(active)){ e.preventDefault(); last.focus(); }
    } else {
      if(active===last || !card.contains(active)){ e.preventDefault(); first.focus(); }
    }
  }

  /* ============ أدوات مساعدة ============ */
  function clearLoginFields(){
    try{ if(inpPass) inpPass.value=""; }catch(_){}
  }
  function clearChangeFields(){
    try{ if(inpOld) inpOld.value=""; }catch(_){}
    try{ if(inpNew) inpNew.value=""; }catch(_){}
    try{ if(inpConfirm) inpConfirm.value=""; }catch(_){}
  }
  function setErr(el,msg){
    try{ if(el) el.textContent=msg||""; }catch(_){}
  }
  function invoke(fn){
    /* يلف استدعاء IPC بحيث لا يرمي أبدًا ويرجع وعدًا دائمًا */
    try{
      var p=fn();
      if(p && typeof p.then==="function") return p;
      return Promise.resolve(p);
    }catch(e){ return Promise.resolve(null); }
  }

  /* ============ تسجيل الدخول ============ */
  function doLogin(){
    setErr(errLogin,"");
    var u="", p="";
    try{ u=inpUser? String(inpUser.value).trim() : ""; }catch(_){}
    try{ p=inpPass? String(inpPass.value) : ""; }catch(_){}
    if(!u || !p){ setErr(errLogin,"أدخل اسم المستخدم وكلمة المرور"); return; }

    try{ if(btnLogin) btnLogin.disabled=true; }catch(_){}
    invoke(function(){ return window.malahyAuth.login(u,p); }).then(function(res){
      try{ if(btnLogin) btnLogin.disabled=false; }catch(_){}
      if(!res || !res.ok || !res.user || typeof res.user!=="object"){
        /* رسالة عامة لكل أسباب الرفض (مستخدم غير موجود / كلمة سر خطأ /
           حساب معطّل...) حتى لا نكشف أي تفاصيل داخلية. */
        setErr(errLogin,ERR_BAD_CREDENTIALS);
        clearLoginFields();
        try{ if(inpUser) inpUser.focus(); }catch(_){}
        return;
      }
      _session=res.user;
      onLoggedIn(res.user);
    }).catch(function(){
      try{ if(btnLogin) btnLogin.disabled=false; }catch(_){}
      setErr(errLogin,ERR_LOGIN_FAIL);
      clearLoginFields();
    });
  }

  /* ============ ما بعد نجاح المصادقة ============ */
  function onLoggedIn(user){
    if(user && user.mustChangePass===true){
      /* كاشير (أو أدمن) مطلوب منه تغيير كلمة السر قبل الدخول للواجهة */
      showChangeForm();
      return;
    }
    unlock();
  }

  /* فتح الواجهة: إزالة القفل وإخفاء شاشة الدخول دون إعادة تحميل البرنامج */
  function unlock(){
    _unlocked=true;
    /* إبلاغ بوابة الصلاحيات بالجلسة الحالية (بيانات منظّفة فقط — لا أسرار).
       بوابة الصلاحيات هي مصدر قرار الصلاحية الوحيد في الواجهة. */
    try{ if(window.MalahyPerm && window.MalahyPerm.setSession) window.MalahyPerm.setSession(_session); }catch(_){}
    setBgLock(false);
    try{ document.removeEventListener("keydown",trapTab,true); }catch(_){}
    removeBlock();
    ov.classList.remove("show");
    ov.classList.add("hide");
    clearLoginFields();
    clearChangeFields();
    setErr(errLogin,"");
    setErr(errChange,"");
  }

  /* ============ تغيير كلمة السر الإجباري (mustChangePass) ============ */
  function showChangeForm(){
    try{ formLogin.style.display="none"; }catch(_){}
    try{ formChange.style.display=""; }catch(_){}
    clearChangeFields();
    setErr(errChange,"");
    try{ if(inpOld) inpOld.focus(); }catch(_){}
  }
  function hideChangeForm(){
    try{ formChange.style.display="none"; }catch(_){}
    try{ formLogin.style.display=""; }catch(_){}
    clearChangeFields();
    setErr(errLogin,"");
    setErr(errChange,"");
    try{ if(inpUser) inpUser.focus(); }catch(_){}
  }

  function doChange(){
    setErr(errChange,"");
    var oldP="", newP="", conf="";
    try{ oldP=inpOld? String(inpOld.value) : ""; }catch(_){}
    try{ newP=inpNew? String(inpNew.value) : ""; }catch(_){}
    try{ conf=inpConfirm? String(inpConfirm.value) : ""; }catch(_){}
    if(!oldP || !newP || !conf){ setErr(errChange,"يرجى ملء جميع الحقول"); return; }
    if(newP!==conf){ setErr(errChange,"كلمتا المرور الجديدتان غير متطابقتين"); return; }
    if(newP.length<4){ setErr(errChange,"كلمة المرور الجديدة يجب ألا تقل عن ٤ أحرف"); return; }
    if(!_session || !_session.id){ setErr(errChange,"انتهت الجلسة، أعد تسجيل الدخول"); backToLogin(); return; }

    try{ if(btnChange) btnChange.disabled=true; }catch(_){}
    invoke(function(){ return window.malahyAuth.changePass(_session.id, oldP, newP); })
      .then(function(res){
        try{ if(btnChange) btnChange.disabled=false; }catch(_){}
        if(!res || !res.ok){
          /* نعتمد قرار الرفض على العملية الرئيسية؛ الرسالة عامة. */
          setErr(errChange,"تعذّر تغيير كلمة المرور — تحقق من كلمة المرور الحالية");
          try{ if(inpOld){ inpOld.value=""; inpOld.focus(); } }catch(_){}
          return;
        }
        if(_session) _session.mustChangePass=false;
        unlock();
      })
      .catch(function(){
        try{ if(btnChange) btnChange.disabled=false; }catch(_){}
        setErr(errChange,"تعذّر تغيير كلمة المرور، حاول مرة أخرى");
      });
  }

  function backToLogin(){
    _session=null;
    hideChangeForm();
  }

  /* ============ عرض شاشة الدخول (بعد التفعيل أو بعد الخروج) ============ */
  function activateLogin(){
    if(_unlocked) return; /* نحن داخل الواجهة بالفعل */
    _session=null;

    /* الهوية: اسم النشاط والشعار المحفوظان في الإعدادات (إن توفرا) */
    try{
      if(typeof brandName==="function"){
        var nm=brandName();
        var h2=document.getElementById("loginVenueName");
        if(h2) h2.textContent=nm;
        var foot=document.getElementById("loginFoot");
        if(foot) foot.textContent=nm+" — جميع الحقوق محفوظة";
      }
      if(typeof brandLogo==="function"){
        var img=document.getElementById("loginLogo");
        if(img) img.src=brandLogo();
      }
    }catch(_){}

    try{ formChange.style.display="none"; }catch(_){}
    try{ formLogin.style.display=""; }catch(_){}
    clearLoginFields();
    clearChangeFields();
    setErr(errLogin,"");
    setErr(errChange,"");

    setBgLock(true);
    ov.classList.remove("hide");
    ov.classList.add("show");
    setupBlock();
    try{ document.addEventListener("keydown",trapTab,true); }catch(_){}
    try{ if(inpUser) inpUser.focus(); }catch(_){}
  }

  /* ============ تسجيل الخروج ============ */
  /* ينهي الجلسة في العملية الرئيسية فقط (لا يمسح أي بيانات) ويعرض شاشة
     الدخول مجددًا. نقفل الواجهة فورًا (fail-closed) قبل انتظار رد IPC. */
  function doLogout(){
    _unlocked=false;
    _session=null;
    /* مسح صلاحيات الواجهة فورًا (fail-closed) قبل إنهاء الجلسة في Main */
    try{ if(window.MalahyPerm && window.MalahyPerm.clearSession) window.MalahyPerm.clearSession(); }catch(_){}
    activateLogin();
    invoke(function(){ return window.malahyAuth && window.malahyAuth.logout ? window.malahyAuth.logout() : null; })
      .catch(function(){});
  }

  /* ============ التهيئة (بعد بوابة التفعيل) ============ */
  function init(){
    if(_inited) return;
    _inited=true;

    ov=document.getElementById("loginOverlay");
    if(!ov){ _inited=false; return; }
    card=ov.querySelector(".login-card");
    formLogin=document.getElementById("loginForm");
    formChange=document.getElementById("loginChangeForm");
    inpUser=document.getElementById("loginUser");
    inpPass=document.getElementById("loginPass");
    inpOld=document.getElementById("chgOld");
    inpNew=document.getElementById("chgNew");
    inpConfirm=document.getElementById("chgConfirm");
    errLogin=document.getElementById("loginErr");
    errChange=document.getElementById("chgErr");
    btnLogin=document.getElementById("loginBtn");
    btnChange=document.getElementById("chgBtn");

    if(btnLogin) btnLogin.addEventListener("click",doLogin);
    if(btnChange) btnChange.addEventListener("click",doChange);
    if(inpUser) inpUser.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doLogin(); } });
    if(inpPass) inpPass.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doLogin(); } });
    if(inpOld) inpOld.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doChange(); } });
    if(inpNew) inpNew.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doChange(); } });
    if(inpConfirm) inpConfirm.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doChange(); } });

    /* التسلسل: شاشة الدخول تظهر فقط بعد اكتمال بوابة التفعيل. */
    var actOv=document.getElementById("actOverlay");
    if(actOv && actOv.classList.contains("show")){
      /* التفعيل جارٍ — نراقب إخفاء غطائه ثم نعرض شاشة الدخول */
      try{
        var obs=new MutationObserver(function(_m,o){
          if(!actOv.classList.contains("show")){ o.disconnect(); activateLogin(); }
        });
        obs.observe(actOv,{attributes:true,attributeFilter:["class"]});
        return;
      }catch(_){ /* سقط المراقب → نعرض الدخول مباشرةً (التفعيل مكتمل على الأرجح) */ }
    }
    activateLogin();
  }

  /* التصدير الوحيد: تهيئة + تسجيل خروج */
  var MalahyLogin={ init:init, logout:doLogout, activate:activateLogin };
  if(typeof window!=="undefined"){
    window.MalahyLogin=MalahyLogin;
    window.malahyLogout=function(){ try{ MalahyLogin.logout(); }catch(_){} };
    if(document.readyState==="loading"){
      document.addEventListener("DOMContentLoaded",function(){
        try{ MalahyLogin.init(); }catch(_){}
      });
    } else {
      try{ MalahyLogin.init(); }catch(_){}
    }
  }
})();
