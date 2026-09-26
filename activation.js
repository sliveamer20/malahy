/* activation.js — منطق التفعيل معزول تمامًا عن باقي التطبيق.
   - كود التفعيل مخزّن بشكل مشفّر (base64 + XOR) ولا يظهر كنص صريح.
   - يغلف كل شيء داخل IIFE بدون أي متغيّرات عامة ظاهرة.
   - يصدّر دالة وحيدة للتهيئة: MalahyActivation.init()
   - لا يلمس أي منطق آخر في التطبيق. */
(function(){
  "use strict";

  /* === مفتاح التفعيل مشفّر على هيئة base64 بعد XOR بايت-ببايت === */
  var ENC_B64 = "e0AfeUgZWXhDGlo=";
  var XOR_KEY  = [0x4B, 0x71, 0x2D, 0x68, 0x1F];
  var FRAG_LEN = [3, 4, 4];

  function decodeKey(){
    try{
      var raw = atob(ENC_B64);
      var s = "";
      var idx = 0;
      for(var p=0; p<FRAG_LEN.length; p++){
        for(var i=0; i<FRAG_LEN[p]; i++){
          s += String.fromCharCode(raw.charCodeAt(idx++) ^ XOR_KEY[i % XOR_KEY.length]);
        }
      }
      return s;
    }catch(_){ return ""; }
  }

  var STORAGE_KEY = "malahy_activated";

  function isActivated(){
    try {
      var val = window.malahyDB && window.malahyDB.get(STORAGE_KEY, null);
      return val === "1";
    }
    catch(_){ return false; }
  }
  function markActivated(){
    try {
      if(window.malahyDB && typeof window.malahyDB.set === "function"){
        window.malahyDB.set(STORAGE_KEY, "1");
      }
    }catch(_){}
  }

  var _inited = false;
  function init(){
    if(_inited) return;
    _inited = true;
    var ov    = document.getElementById("actOverlay");
    if(!ov){ _inited = false; return; }

    var input = document.getElementById("actInput");
    var btn   = document.getElementById("actBtn");
    var err   = document.getElementById("actErr");
    var wa    = document.getElementById("actWhatsapp");

    var EVTS = ["click","mousedown","mouseup","contextmenu","wheel","touchstart","touchmove","dblclick","keydown","keyup","keypress"];
    var card = ov.querySelector(".act-card");
    function blockEvts(e){
      if(card && e && e.target && (e.target === card || card.contains(e.target))) return;
      try{ e.stopPropagation(); }catch(_){}
      try{ e.preventDefault(); }catch(_){}
    }
    function setupBlock(){  EVTS.forEach(function(t){ ov.addEventListener(t, blockEvts, true); }); }
    function removeBlock(){ EVTS.forEach(function(t){ ov.removeEventListener(t, blockEvts, true); }); }

    /* === قفل الخلفية: كل عناصر <body> ما عدا غطاء التفعيل تصبح inert
           (مستحيل النقر عليها أو الوصول لها بالكيبورد أو بقارئات الشاشة). === */
    function setBgLock(on){
      try{
        var parent = ov.parentElement;
        if(!parent) return;
        var kids = parent.children;
        for(var i=0; i<kids.length; i++){
          var el = kids[i];
          if(el === ov) continue;
          if(on){
            el.setAttribute("inert", "");
            el.setAttribute("aria-hidden", "true");
          } else {
            el.removeAttribute("inert");
            el.removeAttribute("aria-hidden");
          }
        }
      }catch(_){}
    }

    /* === فخ التركيز (focus trap): زر Tab ما يخرّجش من غطاء التفعيل === */
    var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function trapTab(e){
      if(!ov.classList.contains("show")) return;
      if(e.key === "Escape"){ e.preventDefault(); return; }
      if(e.key !== "Tab") return;
      if(!card) return;
      var nodes = card.querySelectorAll(FOCUSABLE);
      if(!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length-1];
      var active = document.activeElement;
      if(e.shiftKey){
        if(active === first || !card.contains(active)){ e.preventDefault(); last.focus(); }
      } else {
        if(active === last || !card.contains(active)){ e.preventDefault(); first.focus(); }
      }
    }

    if(isActivated()){
      ov.classList.remove("show");
      ov.classList.add("hide");
      setBgLock(false);
      return;
    }

    ov.classList.remove("hide");
    ov.classList.add("show");
    setBgLock(true);
    setupBlock();
    document.addEventListener("keydown", trapTab, true);
    if(input){ setTimeout(function(){ try{ input.focus(); }catch(_){ } }, 60); }

    function doValidate(){
      if(err) err.textContent = "";
      var expected = decodeKey();
      var entered = input ? input.value.trim() : "";
      if(entered === expected){
        try { markActivated(); } catch(_){}
        if(ov){
          ov.classList.remove("show");
          ov.classList.add("hide");
        }
        setBgLock(false);
        try{ document.removeEventListener("keydown", trapTab, true); }catch(_){}
        removeBlock();
        if(input){ input.value = ""; input.blur(); }
      } else {
        if(err) err.textContent = "كود التفعيل غير صحيح";
        if(input){ input.focus(); input.select(); }
      }
    }

    if(input){
      input.addEventListener("keydown", function(e){
        if(e.key === "Enter"){ e.preventDefault(); doValidate(); }
      });
    }
    if(btn){
      btn.addEventListener("click", doValidate);
    }

    /* زر واتساب — يفتح رابط wa.me مباشرة */
    if(wa){
      wa.addEventListener("click", function(){
        var url = "https://wa.me/201100704812";
        var sh = window.malahyShell && typeof window.malahyShell.openExternal === "function";
        if(sh){
          try{ window.malahyShell.openExternal(url); }catch(_){}
        } else {
          try{ window.open(url, "_blank", "noopener,noreferrer"); }catch(_){}
        }
        /* عند العودة للنافذة: أعد بناء الـ capture listeners لأن Chromium قد يعيد تعيينها */
        window.addEventListener("focus", function once(){
          window.removeEventListener("focus", once);
          try{ removeBlock(); }catch(_){}
          try{ setupBlock(); }catch(_){}
          try{ if(input && ov && ov.classList.contains("show")) input.focus(); }catch(_){}
        });
      });
    }
  }

  /* التصدير الوحيد: دالة تهيئة واحدة */
  var MalahyActivation = { init: init };
  if(typeof window !== "undefined"){
    window.MalahyActivation = MalahyActivation;
    /* شبكة أمان: شغّل التهيئة تلقائيًا بعد اكتمال الـ DOM حتى لو لم يُستدعَ init() يدويًا */
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", function(){
        try{ MalahyActivation.init(); }catch(_){}
      });
    } else {
      try{ MalahyActivation.init(); }catch(_){}
    }
  }
})();
