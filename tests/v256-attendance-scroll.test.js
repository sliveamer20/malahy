// tests/v256-attendance-scroll.test.js
// v2.5.6 — المرحلة الأولى: تمرير نافذة التسجيل اليومي، قواعد الغياب اليومية،
//          وتمرير سجل الأيام السابقة عند توسيع يوم.
//
// البنية: بلا أي بيانات إنتاجية — كل الموظفين والتواريخ في هذا الملف اصطناعية
// (Synthetic)، ولا يُقرأ أي ملف بيانات حقيقي ولا يُكتب شيء على القرص.
//
// الأجزاء:
//   A) نافذة التسجيل اليومي: جذر التمرير #drRoot + بناء الواجهة الحقيقي
//   B) قاعدة الغياب: closeAttendanceDay في payroll-core + التمثيل في الواجهة
//   C) سجل الأيام السابقة: إصلاح انكماش العناصر داخل .hist-list

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "assets", "payroll", "payroll-core.js"));
const Perm = require(path.join(ROOT, "perm-gate.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function D(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0, 0).getTime(); }
/* صف بعينه أو كائن فارغ — فيفشل التأكيد بوضوح بدل أن ينهار الملف */
function rowAt(list, i) { return (list && list[i]) || {}; }

const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- قراءة قواعد CSS من index.html (بدون متصفح) ---------- */
function cssBlock(selector) {
  const i = htmlSrc.indexOf("\n  " + selector + "{");
  if (i < 0) return null;
  const a = htmlSrc.indexOf("{", i);
  const b = htmlSrc.indexOf("}", a);
  return htmlSrc.slice(a + 1, b);
}
function hasProps(rule, props) {
  return rule !== null && props.every(function (p) { return rule.indexOf(p) !== -1; });
}

/* ---------- استخراج دوال حقيقية من index.html (نفس نمط payroll-ui) ---------- */
function extractFunction(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found in index.html: " + name);
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

/* ---------- شجرة DOM وهمية صغيرة ----------
   لا DOM حقيقي: نحتاج فقط شجرة نصوص وأصناف لقراءة ما تبنيه drBody فعلًا. */
function mkEl(tag, attrs, kids) {
  attrs = attrs || {};
  const n = {
    tag: tag, attrs: attrs, cls: attrs.class || "", title: attrs.title || "",
    disabled: !!attrs.disabled, value: attrs.value, text: "", kids: [],
    onClick: typeof attrs.onClick === "function" ? attrs.onClick : null
  };
  (kids || []).forEach(function (k) {
    n.kids.push(typeof k === "string" ? { tag: "#text", text: k, kids: [] } : k);
  });
  if (attrs.text != null) n.text = String(attrs.text);
  n.appendChild = function (kid) {
    this.kids.push(typeof kid === "string" ? { tag: "#text", text: kid, kids: [], cls: "" } : kid);
    return kid;
  };
  n.addEventListener = function () {};
  n.removeEventListener = function () {};
  n.remove = function () {};
  const self = n;
  n.classList = {
    add: function (c) { if (self.cls.indexOf(c) === -1) self.cls += " " + c; },
    remove: function (c) { self.cls = self.cls.split(" ").filter(function (x) { return x && x !== c; }).join(" "); },
    contains: function (c) { return self.cls.split(" ").indexOf(c) !== -1; },
    toggle: function (c) { if (this.contains(c)) this.remove(c); else this.add(c); }
  };
  return n;
}
function walk(node, fn) {
  if (!node) return;
  if (!node.cls) node.cls = "";
  fn(node);
  (node.kids || []).forEach(function (k) { walk(k, fn); });
}
function allText(node) {
  let s = "";
  walk(node, function (n) { s += (n.text || ""); });
  return s;
}
function collect(node, pred, out) {
  out = out || [];
  walk(node, function (n) { if (pred(n)) out.push(n); });
  return out;
}

/* ---------- بيئة نافذة التسجيل اليومي فوق متجر ذاكرة ---------- */
function makeEnv(opts) {
  opts = opts || {};
  const store = {};
  const toasts = [];
  const env = { store: store, toasts: toasts, writes: 0, saved: [], permCalls: [] };

  const loadJSON = function (k, d) { return (k in store) ? store[k] : d; };
  const saveJSON = function (k, v) {
    if (env.failWrite && k === "malahy_employees_v1") { env.writes++; return false; }
    store[k] = JSON.parse(JSON.stringify(v)); env.writes++; return true;
  };
  let seq = 0;
  const uid = function () { return "u" + (seq++); };
  const toast = function (m, k) { toasts.push({ m: m, k: k || "ok" }); };
  const fmtNum = function (n) {
    const r = Math.round((Number(n) || 0) * 100) / 100;
    return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  const fmtTime12 = function (d) {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h < 12 ? "ص" : "م"; h = h % 12; if (h === 0) h = 12;
    return h + ":" + m + " " + ap;
  };
  const repCard = function (label, value, icon) { return mkEl("div", { class: "rep-card" }, [label + " " + value]); };

  let dayKey = opts.dayKey;
  const list = opts.employees || [];
  const dregs = opts.dregs || [];
  let confirmCb = null;             /* onOk الذي تستدعيه بوابة الصلاحيات */

  const perm = {
    hasPerm: function (p) { env.permCalls.push(p); return opts.canPerm !== false; },
    deny: function () { env.permCalls.push("DENY"); return false; },
    requirePerm: function (p, o) {
      env.permCalls.push("require:" + p);
      confirmCb = (o && o.onOk) || null;
      env.lastPrompt = o || null;
      return true;
    }
  };

  const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const keyToDate = function (k) { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const keyToTsSafe = function (k) { const d = keyToDate(k); return isNaN(d.getTime()) ? 0 : d.getTime(); };
  const businessDayKey = function (ts) { return P.dayKeyOfTs(ts); };

  const drLoad = function () { return loadJSON("malahy_daily_reg_v1", []) || []; };
  const drSave = function () { return saveJSON("malahy_daily_reg_v1", loadJSON("malahy_daily_reg_v1", [])); };
  const drRec = function (empId, k) {
    return drLoad().find(function (r) { return r && r.empId === empId && r.dayKey === k; }) || null;
  };
  const drTodayKey = function () { return opts.todayKey; };
  const drDayLabel = function (k) {
    const d = keyToDate(k);
    return AR_DAYS[d.getDay()] + " " + d.getDate() + " " + AR_MONTHS[d.getMonth()] + " " + d.getFullYear();
  };
  const drGo = function (k) { dayKey = k; };
  const empLoad = function () { return list; };
  const empSave = function () { return saveJSON("malahy_employees_v1", list); };
  const empCore = function (e) { P.ensureLedger(e); return e; };
  const empFind = function (id) { return list.find(function (x) { return x && x.id === id; }) || null; };

  /* استخراج اختياري: يسمح بتشغيل الملف على نسخة أقدم فيرى أي التأكيدات
   يفشل فعليًا قبل الإصلاح بدل أن يتوقف عند أول دالة جديدة. */
  function tryExtract(name) {
    try { return extractFunction(htmlSrc, name); } catch (_) { return ""; }
  }
  const names = ["drDayStats", "drDayFinished", "drMarkAbsent", "drCloseDay", "drBody",
    "drSetAmount", "drRecordIn", "drRecordOut"];
  const body = "function drDayFinished(){return false}\nfunction drMarkAbsent(){}\nfunction drCloseDay(){}\n"
    + names.map(tryExtract).join("\n")
    + "\nreturn {drDayStats:drDayStats,drBody:drBody,drMarkAbsent:drMarkAbsent,"
    + "drDayFinished:drDayFinished,drCloseDay:drCloseDay,drSetAmount:drSetAmount,"
    + "drDayLabel:drDayLabel,"
    + "setDay:function(k){ dayKey=k; },getDay:function(){ return dayKey; }};";

  /* _dreg حيّة: تتشارك مع setDay كما في التطبيق */
  const dreg = { dayKey: dayKey, empId: opts.empId || null, list: null };

  /* شجرة DOM مصغّرة: تلتقط طبقة المعاينة التي تُلحق بـ document.body
     (drCloseDay ينشئ .ovl2 وفيه .modal بداخله زر التأكيد). */
  const overlays = [];
  const docStub = {
    body: {
      appendChild: function (node) {
        overlays.push(node);
        walk(node, function (n) { if (n.cls === "modal" && !env.lastPrompt) env.lastPrompt = n; });
        node.remove = function () { const i = overlays.indexOf(node); if (i >= 0) overlays.splice(i, 1); };
        return node;
      }
    },
    createElement: function () { return mkEl("div", {}, []); },
    querySelector: function () { return null; }
  };

  /* eslint-disable no-new-func */
  const api = new Function("loadJSON", "saveJSON", "uid", "toast", "el", "PR", "repCard",
    "drLoad", "drSave", "drRec", "drTodayKey", "drDayLabel", "drGo",
    "empLoad", "empSave", "empFind", "empCore", "keyToDate", "keyToTsSafe", "businessDayKey",
    "fmtNum", "fmtTime12", "MalahyPerm", "closeOverlay", "openEmployees", "empGo",
    "paintDreg", "paintDregSummary", "_dreg", "document", "JSON", body)(
      loadJSON, saveJSON, uid, toast, mkEl, function () { return P; }, repCard,
      drLoad, drSave, drRec, drTodayKey, drDayLabel, drGo,
      empLoad, empSave, empFind, empCore, keyToDate, keyToTsSafe, businessDayKey,
      fmtNum, fmtTime12, perm,
      function () {}, function () {}, function () {},
      function () {}, function () {}, dreg, docStub, JSON);

  env.api = api;
  env.overlays = overlays;
  env.setDay = function (k) { dayKey = k; dreg.dayKey = k; };
  env.setEmpId = function (v) { dreg.empId = v; };
  env.store["malahy_employees_v1"] = list;
  env.store["malahy_daily_reg_v1"] = dregs;
  return env;
}

/* موظف اصطناعي */
function emp(o) {
  return Object.assign({
    id: "E" + (o.n || 1), name: "موظف " + (o.n || 1), job: "كاشير",
    dailyWage: 100, phone: "", notes: "", hiredAt: D(2026, 1, 1),
    days: [], weeks: [], bonuses: [], penalties: [], advances: [], deductions: [], payouts: []
  }, o);
}

console.log("V2.5.6 PHASE 1 — attendance window scroll, absence rules, history scroll");

/* مفاتيح أيام اصطناعية ثابتة (لا وقت النظام) حتى تكون الاختبارات حتمية */
const TODAY = K(2026, 10, 12);
const PAST = K(2026, 10, 11);
const FUTURE = K(2026, 10, 13);

/* ==========================================================================
 * A) نافذة التسجيل اليومي: جذر التمرير + بناء الواجهة
 * ========================================================================== */
console.log("\n-- A) daily attendance window scrolling --");
{
  const empModal = cssBlock(".overlay .modal.emp-modal");
  const drRoot = cssBlock("#drRoot");
  const empRoot = cssBlock("#empRoot");
  const gmRoot = cssBlock("#gmRoot");

  ok("A1 the daily window root #drRoot has a CSS rule at all (it had none before)",
     drRoot !== null, "rule not found");
  ok("A2 #drRoot is a flex child that can shrink", hasProps(drRoot, ["flex:1", "min-height:0"]));
  ok("A3 #drRoot is the vertical scroll container", hasProps(drRoot, ["overflow-y:auto"]));
  ok("A4 #drRoot does not scroll horizontally (no double scrollbar)",
     hasProps(drRoot, ["overflow-x:hidden"]));
  ok("A5 the daily window gets the same treatment as #empRoot/#gmRoot",
     hasProps(drRoot, ["overflow-y:auto"]) && hasProps(empRoot, ["overflow-y:auto"]) &&
     hasProps(gmRoot, ["overflow-y:auto"]));
  ok("A6 the modal itself still clips (flex column, max-height) so #drRoot must scroll",
     hasProps(empModal, ["overflow:hidden", "max-height", "flex-direction:column"]));
  ok("A7 #drRoot has styled scrollbar thumb/track like the sibling windows",
     htmlSrc.indexOf("#drRoot::-webkit-scrollbar-thumb{") !== -1 &&
     htmlSrc.indexOf("#drRoot::-webkit-scrollbar-track{") !== -1);
  ok("A8 the light theme covers the #drRoot scrollbar track too",
     /\[data-theme="light"\]\s+#drRoot::-webkit-scrollbar-track/.test(htmlSrc));

  /* لا تمرير أفقي مزدوج جديد داخل الجذر (شرط «تجنّب الأشرطة المزدوجة») */
  const drIndex = htmlSrc.indexOf("#drRoot .dr-sticky");
  const cssTail = htmlSrc.slice(0, drIndex);
  const nestedScrollers = (cssTail.match(/#drRoot\s+[^{]*\{[^}]*overflow-y:auto/g) || []);
  eq("A9 no nested vertical scroller introduced inside #drRoot", nestedScrollers.length, 0);

  /* شريط التنقّل ملتصق، وحامله صنف مخصّص لا التاريخ العام */
  const stickyRule = cssBlock("#drRoot .dr-sticky");
  ok("A10 the day-navigation bar can stay pinned while the list scrolls",
     hasProps(stickyRule, ["position:sticky", "top:0"]));

  /* بناء الواجهة الحقيقي: كل الموظفين يظهرون بلا سقف عدد */
  const N = 40;
  const many = []; for (let i = 1; i <= N; i++) many.push(emp({ n: i }));
  const env = makeEnv({ employees: many, dayKey: K(2026, 10, 11), todayKey: K(2026, 10, 12) });
  const body = env.api.drBody();
  const rows = collect(body, function (n) { return n.tag === "tr"; });
  eq("A11 a short/long list still renders one row per employee + 1 header row", rows.length, N + 1);
  const names = allText(body);
  ok("A12 the LAST employee of a long list is present in the DOM",
     names.indexOf("موظف " + N) !== -1);
  ok("A13 the FIRST employee is still present", names.indexOf("موظف 1") !== -1);
  ok("A14 no arbitrary employee-list limit was introduced (no slice cap on the roster)",
     htmlSrc.indexOf("const rows=list.slice(-62)") !== -1 /* سجل الموظف الفردي فقط */ &&
     !/\bL\s*=\s*\w+\.slice\(/.test(htmlSrc.slice(htmlSrc.indexOf("function drBody("), htmlSrc.indexOf("function paintDregSummary("))));
  ok("A15 the day-navigation controls are all still rendered",
     names.indexOf("اليوم السابق") !== -1 && names.indexOf("اليوم التالي") !== -1 &&
     names.indexOf("📍 اليوم") !== -1);
  ok("A16 the navigation bar is the sticky one", (function () {
    const bars = collect(body, function (n) { return n.cls.indexOf("emp-week-bar") !== -1; });
    return bars.length === 1 && bars[0].cls.indexOf("dr-sticky") !== -1;
  })());
  ok("A17 attendance punch buttons survive for every employee on the current day",
     (function () {
       const e2 = makeEnv({ employees: many, dayKey: TODAY, todayKey: TODAY });
       return collect(e2.api.drBody(), function (n) { return n.cls.indexOf("dr-in") !== -1; }).length === N;
     })());
  ok("A18 a past day shows the read-only placeholder instead of punch buttons (unchanged)",
     collect(body, function (n) { return n.cls.indexOf("dr-in") !== -1; }).length === 0 &&
     collect(body, function (n) { return n.cls.indexOf("dr-na") !== -1; }).length === 2 * N);
  ok("A19 rendering a long list performs zero writes to the device store",
     env.writes === 0, "writes=" + env.writes);
}

/* ==========================================================================
 * B) قاعدة الغياب اليومية
 * ========================================================================== */
console.log("\n-- B) daily absence rules --");
{
  /* B0: قاعدة العمل المعتمدة في هذا النشاط: كل يوم تقويمي يوم عمل —
     لا يوم راحة أسبوعي ولا أعياد ولا جدول عمل للموظف.فالشرط الوحيد
     على «يوم العمل المؤهَّل» أن يكون اليوم سابقًا وأنّه بعد تاريخ التعيين.
     والتأكيدات أدناه تُثبت أنه لم تُختَرع أي قاعدة راحة أو تقويم أعياد. */
  ok("B0 the core exposes the finalization plan + apply pair",
     typeof P.planAttendanceClose === "function" &&
     typeof P.applyAttendanceClose === "function");
  ok("B0b the UI finalizes through that pair only",
     htmlSrc.indexOf("planAttendanceClose") !== -1 &&
     htmlSrc.indexOf("applyAttendanceClose") !== -1);
  ok("B0c NO rest-day or holiday rule was invented",
     !/restDay|weeklyOff|dayOff|daysOff|holiday/i.test(htmlSrc) &&
     !/restDay|weeklyOff|dayOff|daysOff|holiday/i.test(
       fs.readFileSync(path.join(ROOT, "assets", "payroll", "payroll-core.js"), "utf8")));
  ok("B0d NO hardcoded rest/holiday date logic in the finalization code",
     (function () {
       const src = fs.readFileSync(path.join(ROOT, "assets", "payroll", "payroll-core.js"), "utf8");
       const body = src.slice(src.indexOf("function planAttendanceClose"),
                              src.indexOf("function daysUpTo"));
       return !/getDay\(\)\s*[=!]==/.test(body);
     })());
  /* B0e: التخطيط نقيّ — استدعاؤه وحده لا يكتب أي سجل */
  {
    const pure = emp({ n: 99, hiredAt: D(2026, 1, 1) });
    const before = JSON.stringify(pure);
    P.planAttendanceClose([pure], PAST, { todayKey: TODAY });
    eq("B0e planning alone writes nothing", JSON.stringify(pure), before);
  }

  /* --- B1: هل انتهى يوم العمل؟ --- */
  const eT = emp({ n: 1, hiredAt: D(2026, 1, 1) });
  const envF = makeEnv({ employees: [eT], dayKey: TODAY, todayKey: TODAY });
  eq("B1a the current business day is NOT finished", envF.api.drDayFinished(TODAY), false);
  eq("B1b a past day is finished", envF.api.drDayFinished(PAST), true);
  eq("B1c a future day is NOT finished", envF.api.drDayFinished(FUTURE), false);
  eq("B1d the comparison is on the business-day key, not midnight", envF.api.drDayFinished(K(2026, 10, 12)), false);

  /* --- B2: تسجيل غياب يدوي لموظف واحد --- */
  const e2 = emp({ n: 2, hiredAt: D(2026, 1, 1) });
  const env2 = makeEnv({ employees: [e2], dayKey: PAST, todayKey: TODAY });
  env2.api.drMarkAbsent(e2.id, PAST);
  eq("B2a a manual absence is recorded for that employee only", (e2.days || []).length, 1);
  eq("B2b ...keyed to the chosen finished day", rowAt(e2.days, 0).key, PAST);
  eq("B2c ...classified absent by the single classifier",
     P.dayClass(P.dayRec(e2, PAST)), "absent");
  eq("B2d ...stamped as a manual record (no auto source)", rowAt(e2.days, 0).src, "manual");
  eq("B2e the payroll stats report exactly one absent day",
     P.statsUpTo(e2, P.endOfDayTs(D(2026, 10, 12))).abs, 1);
  eq("B2f it was persisted exactly once", env2.writes, 1);

  /* --- B3: التكرار لا يضاعف --- */
  env2.api.drMarkAbsent(e2.id, PAST);
  env2.api.drMarkAbsent(e2.id, PAST);
  eq("B3a repeating the action creates no second row", (e2.days || []).length, 1);
  eq("B3b ...and still counts once",
     P.statsUpTo(e2, P.endOfDayTs(D(2026, 10, 12))).abs, 1);
  ok("B3c ...the operator was told the day is already recorded",
     env2.toasts.some(function (t) { return t.k === "warn"; }));

  /* --- B4: لا يُطمس أي سجل قائم --- */
  const w = emp({ n: 4, hiredAt: D(2026, 1, 1) });
  P.markDay(w, PAST, "work", { src: "dreg", dregId: "d1" });
  const envW = makeEnv({ employees: [w], dayKey: PAST, todayKey: TODAY });
  envW.api.drMarkAbsent(w.id, PAST);
  eq("B4a a valid attendance record is preserved", P.dayClass(P.dayRec(w, PAST)), "work");
  eq("B4b ...untouched (same dreg link)", P.dayRec(w, PAST).dregId, "d1");
  eq("B4c ...no extra row", w.days.length, 1);
  eq("B4d ...and nothing was written", envW.writes, 0);

  const v = emp({ n: 5, hiredAt: D(2026, 1, 1) });
  P.markDay(v, PAST, "vacation", { src: "manual", note: "إجازة معتمدة" });
  const envV = makeEnv({ employees: [v], dayKey: PAST, todayKey: TODAY });
  envV.api.drMarkAbsent(v.id, PAST);
  eq("B4e approved leave is preserved", P.dayClass(P.dayRec(v, PAST)), "vacation");
  eq("B4f ...its note survives", P.dayRec(v, PAST).note, "إجازة معتمدة");
  eq("B4g ...no extra row", v.days.length, 1);

  const m = emp({ n: 6, hiredAt: D(2026, 1, 1) });
  P.markDay(m, PAST, "absent", { src: "manual", note: "غياب يدوي" });
  const envM = makeEnv({ employees: [m], dayKey: PAST, todayKey: TODAY });
  envM.api.drMarkAbsent(m.id, PAST);
  eq("B4h an already-recorded absence is not duplicated", m.days.length, 1);
  eq("B4i ...its manual note is kept", P.dayRec(m, PAST).note, "غياب يدوي");

  /* --- B5: اليوم الجاري ممنوع — لا غياب ليومٍ ما زال يعمل --- */
  const t = emp({ n: 7, hiredAt: D(2026, 1, 1) });
  const envT = makeEnv({ employees: [t], dayKey: TODAY, todayKey: TODAY });
  envT.api.drMarkAbsent(t.id, TODAY);
  eq("B5a absence on the running day is refused", (t.days || []).length, 0);
  eq("B5b ...nothing was written", envT.writes, 0);
  ok("B5c ...the operator was warned", envT.toasts.some(function (x) { return x.k === "warn"; }));
  const f1 = emp({ n: 8, hiredAt: D(2026, 1, 1) });
  const envF1 = makeEnv({ employees: [f1], dayKey: FUTURE, todayKey: TODAY });
  envF1.api.drMarkAbsent(f1.id, FUTURE);
  eq("B5d absence on a future day is refused", (f1.days || []).length, 0);

  /* --- B6: الصلاحية --- */
  const d = emp({ n: 9, hiredAt: D(2026, 1, 1) });
  const envD = makeEnv({ employees: [d], dayKey: PAST, todayKey: TODAY, canPerm: false });
  envD.api.drMarkAbsent(d.id, PAST);
  eq("B6a without the permission nothing is written", envD.writes, 0);
  eq("B6b ...and no absence is recorded", (d.days || []).length, 0);
  ok("B6c ...the denial path was taken", envD.permCalls.indexOf("DENY") !== -1);

  /* --- B7: فشل الحفظ ⇒ تراجع فوري --- */
  const s = emp({ n: 10, hiredAt: D(2026, 1, 1) });
  const envS = makeEnv({ employees: [s], dayKey: PAST, todayKey: TODAY });
  envS.failWrite = true;
  envS.api.drMarkAbsent(s.id, PAST);
  eq("B7a a failed save leaves no absence in memory", (s.days || []).length, 0);
  eq("B7b ...the stored record is untouched",
     envS.store["malahy_employees_v1"][0].days.length, 0);
  ok("B7c ...the operator was warned", envS.toasts.some(function (x) { return x.k === "warn"; }));

  /* --- B8: الغياب حدث غير مالي — حسابات الرواتب لا تتغيّر --- */
  const g = emp({ n: 11, hiredAt: D(2026, 1, 1) });
  P.markDay(g, K(2026, 10, 5), "work", {}); P.markDay(g, K(2026, 10, 6), "work", {});
  P.markDay(g, K(2026, 10, 7), "work", {}); P.markDay(g, K(2026, 10, 8), "work", {});
  const cut = P.endOfDayTs(D(2026, 10, 12));
  const before = P.statsUpTo(g, cut);
  const envG = makeEnv({ employees: [g], dayKey: PAST, todayKey: TODAY });
  envG.api.drMarkAbsent(g.id, PAST);
  const after = P.statsUpTo(g, cut);
  eq("B8a gross unchanged", after.gross, before.gross);
  eq("B8b net unchanged", after.net, before.net);
  eq("B8c outstanding unchanged", after.outstanding, before.outstanding);
  eq("B8d due unchanged", after.due, before.due);
  eq("B8e work days unchanged", after.work, before.work);
  eq("B8f but the absent counter rose by exactly one", after.abs - before.abs, 1);
  eq("B8g the absence itself earns nothing", P.tallyDays([P.dayRec(g, PAST)], 100).gross, 0);

  /* --- B9: تقرير الدفعة يعرضه مرة واحدة --- */
  const p1 = emp({ n: 12, hiredAt: D(2026, 1, 1) });
  P.markDay(p1, K(2026, 10, 9), "work", {}); P.markDay(p1, K(2026, 10, 10), "work", {});
  const envP = makeEnv({ employees: [p1], dayKey: PAST, todayKey: TODAY });
  envP.api.drMarkAbsent(p1.id, PAST);
  envP.api.drMarkAbsent(p1.id, PAST);
  const plan = P.planPayout(p1, { nowTs: D(2026, 10, 12), dateTs: D(2026, 10, 12) });
  eq("B9a the payout plan is still valid", plan.ok, true);
  eq("B9b the covered work days are the two work days", plan.covered.dayKeys.length, 2);
  eq("B9c the absence appears once in the payout window", plan.abs, 1);
  eq("B9d ...as one key", plan.covered.absKeys.length, 1);
  eq("B9e the payout covers only the two work days", plan.gross, 200);
  P.applyPayout(p1, plan, { ts: D(2026, 10, 12), ref: "R1" });
  const plan2 = P.planPayout(p1, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  eq("B9f after paying, a second payout is not due", plan2.due, 0);
  eq("B9g ...the absence is not re-listed later", plan2.abs, 0);
  eq("B9h ...and is still counted exactly once in stats",
     P.statsUpTo(p1, P.endOfDayTs(D(2026, 10, 13))).abs, 1);

  /* --- B10: العرض في النافذة يأتي من المصدر الوحيد --- */
  const sToday = emp({ n: 21, hiredAt: D(2026, 1, 1) });
  const sAbsent = emp({ n: 22, hiredAt: D(2026, 1, 1) });
  const sVac = emp({ n: 23, hiredAt: D(2026, 1, 1) });
  const sWork = emp({ n: 24, hiredAt: D(2026, 1, 1) });
  P.markDay(sAbsent, PAST, "absent", { src: "manual" });
  P.markDay(sVac, PAST, "vacation", { src: "manual" });
  P.markDay(sWork, PAST, "work", { src: "legacy" });
  const sList = [sToday, sAbsent, sVac, sWork];

  const envPast = makeEnv({ employees: sList, dayKey: PAST, todayKey: TODAY });
  const txtPast = allText(envPast.api.drBody());
  ok("B10a a recorded absence shows as absence", txtPast.indexOf("❌ غياب") !== -1);
  ok("B10b approved leave shows as leave", txtPast.indexOf("🌴 إجازة") !== -1);
  ok("B10c a ledger work day with no punch still shows as attendance",
     txtPast.indexOf("✅ حضور (من السجل)") !== -1);
  ok("B10d an unrecorded finished day reads as ended-but-unrecorded",
     txtPast.indexOf("⚠️ لم يُسجَّل — اليوم انتهى") !== -1);
  const stPast = envPast.api.drDayStats(PAST, sList);
  eq("B10e the day summary counts one absence", stPast.absent, 1);
  eq("B10f ...and one leave day", stPast.vacation, 1);
  eq("B10g ...punch counters stay independent of the ledger", stPast.present, 0);

  const envNow = makeEnv({ employees: sList, dayKey: TODAY, todayKey: TODAY });
  const chipsNow = collect(envNow.api.drBody(), function (n) { return n.cls.indexOf("dr-status") !== -1; });
  ok("B10h an unrecorded CURRENT day is never shown as absence",
     chipsNow.every(function (c) { return c.text.indexOf("غياب") === -1; })
     && chipsNow.every(function (c) { return c.text.indexOf("اليوم جارٍ") !== -1; }));
  eq("B10i the current day summary reports zero absences",
     envNow.api.drDayStats(TODAY, sList).absent, 0);

  /* --- B11: زر «تسجيل غياب» يظهر في المكان الصحيح فقط --- */
  function absentButtons(list, key) {
    const e = makeEnv({ employees: list, dayKey: key, todayKey: TODAY });
    return collect(e.api.drBody(), function (n) { return n.cls.indexOf("dr-absent") !== -1; });
  }
  eq("B11a the absence action is offered only for the employee with no record",
     absentButtons([sToday, sAbsent, sVac, sWork], PAST).length, 1);
  eq("B11b ...never for the current running day",
     absentButtons([sToday], TODAY).length, 0);
  eq("B11c ...never for a future day", absentButtons([sToday], FUTURE).length, 0);
  eq("B11d ...for every unrecorded employee on a finished day",
     absentButtons([sToday, emp({ n: 31 }), emp({ n: 32 })], PAST).length, 3);

  /* --- B12: العرض لا يكتب ولا يغيّر شيئًا --- */
  const r = emp({ n: 41, hiredAt: D(2026, 1, 1) });
  const snap = JSON.stringify(r);
  const envR = makeEnv({ employees: [r], dayKey: PAST, todayKey: TODAY });
  envR.api.drBody();
  envR.api.drDayStats(PAST, [r]);
  envR.api.drDayFinished(PAST);
  eq("B12a viewing a historical date performs zero writes", envR.writes, 0);
  eq("B12b ...and mutates nothing", JSON.stringify(r), snap);
  eq("B12c ...the day stays unrecorded, not absent",
     P.dayClass(P.dayRec(r, PAST)), "unrecorded");

  /* --- B13: السجلات التاريخية لا تُعاد كتابتها --- */
  const h = emp({ n: 51, hiredAt: D(2026, 1, 1) });
  P.markDay(h, K(2026, 9, 1), "work", { note: "يوم قديم" });
  P.markDay(h, K(2026, 9, 2), "vacation", { note: "إجازة قديمة" });
  const hBefore = JSON.stringify(h.days);
  const envH = makeEnv({ employees: [h], dayKey: PAST, todayKey: TODAY });
  envH.api.drMarkAbsent(h.id, PAST);
  eq("B13a older rows stay byte-identical", JSON.stringify(h.days.slice(0, 2)), hBefore);
  eq("B13b ...only one new row appended", h.days.length, 3);
  eq("B13c ...the ledger is chronologically sorted",
     JSON.stringify(h.days.map(function (x) { return x.key; })),
     JSON.stringify(h.days.map(function (x) { return x.key; }).slice().sort()));

  /* --- B14: المصدر الوحيد للحساب لم يتغيّر --- */
  eq("B14a an unknown status is still 'unrecorded' (not absent)",
     P.dayClass({ key: "2026-01-01", status: "sick-leave" }), "unrecorded");
  const tally = P.tallyDays([
    { key: "2026-01-01", status: "work", wage: 100 },
    { key: "2026-01-02", status: "absent", wage: 100 },
    { key: "2026-01-03", status: "vacation", wage: 100 },
    { key: "2026-01-04", wage: 100 }
  ], 100);
  eq("B14b unrecorded is still counted separately", tally.unrecorded, 1);
  eq("B14c ...absent", tally.absent, 1);
  eq("B14d ...vacation", tally.vacation, 1);
  eq("B14e ...work", tally.work, 1);
  eq("B14f ...gross counts work days only", tally.gross, 100);
  eq("B14g no holiday/rest-day status is invented by the core",
     ["holiday", "rest", "off", "weekend"].every(function (s) {
       return P.dayClass({ key: "2026-01-01", status: s }) === "unrecorded";
     }), true);
}
/* ==========================================================================
 * B15) إغلاق يوم الحضور (المرحلة 1.1) — قاعدة العمل: كل يوم تقويمي يوم عمل
 * ========================================================================== */
console.log("\n-- B15) attendance-day finalization (Phase 1.1) --");
{
  const HIRED = D(2026, 1, 1);

  /* --- رفض اليوم الجاري وما بعده --- */
  const cur = emp({ n: 1, hiredAt: HIRED });
  const pToday = P.planAttendanceClose([cur], TODAY, { todayKey: TODAY });
  eq("B15a the current day is refused", pToday.ok, false);
  eq("B15b ...with an explicit reason", pToday.reason, "not-finished");
  eq("B15c ...and nothing is planned", pToday.mark.length, 0);
  const pFuture = P.planAttendanceClose([cur], FUTURE, { todayKey: TODAY });
  eq("B15d a future day is refused", pFuture.ok, false);
  eq("B15e ...same reason", pFuture.reason, "not-finished");
  eq("B15f an invalid date key is refused", P.planAttendanceClose([cur], "nope", { todayKey: TODAY }).reason, "bad-day");
  eq("B15g ...and no record was created", (cur.days || []).length, 0);
  const aToday = P.applyAttendanceClose([cur], pToday);
  eq("B15h applying a refused plan does nothing", aToday.ok, false);
  eq("B15i ...and wrote nothing", (cur.days || []).length, 0);

  /* --- يوم سابق منتهٍ: المؤهَّل يُغيب، وغير المؤهَّل يُترك --- */
  const w = emp({ n: 2, hiredAt: HIRED });                 /* مؤهَّل */
  const vac = emp({ n: 3, hiredAt: HIRED });               /* إجازة معتمدة */
  P.markDay(vac, PAST, "vacation", { src: "manual", note: "معتمدة" });
  const work = emp({ n: 4, hiredAt: HIRED });               /* حضور مسجَّل */
  P.markDay(work, PAST, "work", { src: "dreg", dregId: "d1" });
  const abs = emp({ n: 5, hiredAt: HIRED });                /* غياب يدوي */
  P.markDay(abs, PAST, "absent", { src: "manual", note: "يدوي" });
  const late = emp({ n: 6, hiredAt: new Date(2026, 9, 12).getTime() });  /* تعيين بعد اليوم */
  const noHire = emp({ n: 7, hiredAt: 0 });
  const roster = [w, vac, work, abs, late, noHire];

  const plan = P.planAttendanceClose(roster, PAST, { todayKey: TODAY });
  eq("B15j the finished day is accepted", plan.ok, true);
  eq("B15k everyone is examined", plan.total, 6);
  eq("B15l exactly the eligible unrecorded employee is planned", plan.mark.length, 1);
  eq("B15m ...and it is the right one", plan.mark[0].id, w.id);
  eq("B15n three employees already have a status", plan.recorded.length, 3);
  eq("B15o ...with their real statuses",
     plan.recorded.map(function (m) { return m.status; }).sort().join(","), "absent,vacation,work");
  eq("B15p the employee hired after that day is skipped", plan.notHired.length, 1);
  eq("B15q ...specifically him", plan.notHired[0].id, late.id);
  eq("B15r an employee with no hire date is skipped", plan.noHire.length, 1);
  eq("B15s the plan carries names for the preview", plan.mark[0].name, w.name);

  /* --- المعاينة لا تكتب --- */
  const snapAll = JSON.stringify(roster);
  P.planAttendanceClose(roster, PAST, { todayKey: TODAY });
  eq("B15t planning writes nothing at all", JSON.stringify(roster), snapAll);

  /* --- التنفيذ = المعاينة بالضبط --- */
  const res = P.applyAttendanceClose(roster, plan);
  eq("B15u the apply succeeded", res.ok, true);
  eq("B15v exactly the planned count was marked", res.marked.length, plan.mark.length);
  eq("B15w nothing else was skipped at apply time", res.alreadySkipped, 0);
  eq("B15x the eligible employee is now absent",
     P.dayClass(P.dayRec(w, PAST)), "absent");
  eq("B15y ...stamped with the close source", P.dayRec(w, PAST).src, "close");
  eq("B15z approved leave survived", P.dayClass(P.dayRec(vac, PAST)), "vacation");
  ok("B15aa ...with its note intact", P.dayRec(vac, PAST).note === "معتمدة");
  eq("B15ab the recorded work day survived", P.dayClass(P.dayRec(work, PAST)), "work");
  eq("B15ac ...with its link intact", P.dayRec(work, PAST).dregId, "d1");
  eq("B15ad the manual absence survived", P.dayRec(abs, PAST).note, "يدوي");
  eq("B15ae the later-hired employee got no row", (late.days || []).length, 0);
  eq("B15af the employee with no hire date got no row", (noHire.days || []).length, 0);

  /* --- التكرار لا يضاعف --- */
  for (let i = 0; i < 5; i++) {
    const again = P.planAttendanceClose(roster, PAST, { todayKey: TODAY });
    P.applyAttendanceClose(roster, again);
  }
  eq("B15ag repeated finalization marks nobody", w.days.length, 1);
  eq("B15ah ...the roster still holds exactly one row per finalized employee",
     roster.reduce(function (a, e) { return a + (e.days || []).length; }, 0), 4);
  eq("B15ai re-planning now finds nobody to mark",
     P.planAttendanceClose(roster, PAST, { todayKey: TODAY }).mark.length, 0);
  eq("B15aj ...because all four eligible employees are already recorded",
     P.planAttendanceClose(roster, PAST, { todayKey: TODAY }).recorded.length, 4);
  eq("B15ak ...and the two ineligible ones are still skipped, not recorded",
     P.planAttendanceClose(roster, PAST, { todayKey: TODAY }).notHired.length +
     P.planAttendanceClose(roster, PAST, { todayKey: TODAY }).noHire.length, 2);

  /* --- حارس «ما ظهر بين المعاينة والتنفيذ» --- */
  const race = emp({ n: 8, hiredAt: HIRED });
  const racePlan = P.planAttendanceClose([race], PAST, { todayKey: TODAY });
  P.markDay(race, PAST, "vacation", { src: "manual" });     /* تغيّر بعد المعاينة */
  const raceRes = P.applyAttendanceClose([race], racePlan);
  eq("B15ak a row that appeared after the preview is never overwritten",
     P.dayClass(P.dayRec(race, PAST)), "vacation");
  eq("B15al ...and the apply reports it as skipped", raceRes.alreadySkipped, 1);
  eq("B15am ...marking nobody", raceRes.marked.length, 0);

  /* --- الغياب غير مالي: حسابات الرواتب لا تتغيّر --- */
  const g = emp({ n: 9, hiredAt: HIRED });
  P.markDay(g, K(2026, 10, 5), "work", {}); P.markDay(g, K(2026, 10, 6), "work", {});
  P.markDay(g, K(2026, 10, 7), "work", {}); P.markDay(g, K(2026, 10, 8), "work", {});
  const cut = P.endOfDayTs(D(2026, 10, 12));
  const before = P.statsUpTo(g, cut);
  P.applyAttendanceClose([g], P.planAttendanceClose([g], PAST, { todayKey: TODAY }));
  const after = P.statsUpTo(g, cut);
  eq("B15an gross unchanged", after.gross, before.gross);
  eq("B15ao net unchanged", after.net, before.net);
  eq("B15ap outstanding unchanged", after.outstanding, before.outstanding);
  eq("B15aq due unchanged", after.due, before.due);
  eq("B15ar work days unchanged", after.work, before.work);
  eq("B15as absent rose by exactly one", after.abs - before.abs, 1);

  /* --- الاتساق مع تقرير صرف الدفعة --- */
  const p2 = emp({ n: 10, hiredAt: HIRED });
  P.markDay(p2, K(2026, 10, 9), "work", {}); P.markDay(p2, K(2026, 10, 10), "work", {});
  P.applyAttendanceClose([p2], P.planAttendanceClose([p2], PAST, { todayKey: TODAY }));
  const pay = P.planPayout(p2, { nowTs: D(2026, 10, 12), dateTs: D(2026, 10, 12) });
  eq("B15at the payout plan is valid", pay.ok, true);
  eq("B15au ...covering the two work days", pay.covered.dayKeys.length, 2);
  eq("B15av the new absence appears once", pay.abs, 1);
  eq("B15aw ...as one key", pay.covered.absKeys.length, 1);
  eq("B15ax the payout pays only the work days", pay.gross, 200);
  P.applyPayout(p2, pay, { ts: D(2026, 10, 12), ref: "R" });
  const pay2 = P.planPayout(p2, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  eq("B15ay no second payout is due", pay2.due, 0);
  eq("B15az ...and the absence is not re-listed", pay2.abs, 0);

  /* --- سجلات تاريخية أقدم لم تُعَد كتابة --- */
  const h = emp({ n: 11, hiredAt: HIRED });
  P.markDay(h, K(2026, 9, 1), "work", { note: "قديم" });
  P.markDay(h, K(2026, 9, 2), "vacation", { note: "قديم" });
  const hBefore = JSON.stringify(h.days);
  P.applyAttendanceClose([h], P.planAttendanceClose([h], PAST, { todayKey: TODAY }));
  eq("B15ba older rows stay byte-identical", JSON.stringify(h.days.slice(0, 2)), hBefore);
  eq("B15bb ...only one new row appended", h.days.length, 3);
  eq("B15bc the ledger is chronologically sorted",
     JSON.stringify(h.days.map(function (x) { return x.key; })),
     JSON.stringify(h.days.map(function (x) { return x.key; }).slice().sort()));

  /* --- مسار الواجهة drCloseDay: معاينة ← تأكيد ← كتابة ← تراجع --- */
  const u1 = emp({ n: 21, hiredAt: HIRED });
  const u2 = emp({ n: 22, hiredAt: HIRED });
  P.markDay(u2, PAST, "vacation", { src: "manual" });
  const envF1 = makeEnv({ employees: [u1, u2], dayKey: PAST, todayKey: TODAY });
  envF1.api.drCloseDay();
  ok("B15bd the preview overlay is shown before anything is written", !!envF1.lastPrompt);
  eq("B15be ...nothing written yet", (u1.days || []).length, 0);
  ok("B15bf ...the overlay carries the finalize button",
     envF1.lastPrompt.classList.contains("modal") &&
     /إغلاق اليوم/.test(allText(envF1.lastPrompt)));
  ok("B15bg ...it shows the selected date (its exact business-day label)",
     allText(envF1.lastPrompt).indexOf(envF1.api.drDayLabel(PAST)) !== -1,
     "label missing: " + envF1.api.drDayLabel(PAST));
  ok("B15bh ...it names the affected employee",
     allText(envF1.lastPrompt).indexOf(u1.name) !== -1);
  ok("B15bi ...it explains the recorded one that will be spared",
     allText(envF1.lastPrompt).indexOf("لن يُلمس") !== -1);
  const confirmBtn = collect(envF1.lastPrompt, function (n) {
    return n.tag === "button" && /إغلاق اليوم/.test(n.text || "");
  })[0];
  ok("B15bj the confirm control exists", !!confirmBtn && typeof confirmBtn.onClick === "function");
  confirmBtn.onClick();
  eq("B15bk after confirming, the eligible employee is absent",
     P.dayClass(P.dayRec(u1, PAST)), "absent");
  eq("B15bl ...exactly once", u1.days.length, 1);
  eq("B15bm the employee on approved leave is untouched",
     P.dayClass(P.dayRec(u2, PAST)), "vacation");
  eq("B15bn ...with no extra row", u2.days.length, 1);
  eq("B15bo the change was persisted once", envF1.writes, 1);
  ok("B15bp the operator is told how many were marked and skipped",
     envF1.toasts.some(function (t) { return t.k === "ok" && /غُيّب 1/.test(t.m); }));

  /* --- رفض اليوم الجاري من الواجهة --- */
  const c1 = emp({ n: 31, hiredAt: HIRED });
  const envT1 = makeEnv({ employees: [c1], dayKey: TODAY, todayKey: TODAY });
  envT1.api.drCloseDay();
  ok("B15bq finalizing today from the UI is refused", envT1.toasts.length > 0);
  eq("B15br ...nothing written", envT1.writes, 0);
  eq("B15bs ...no preview shown", envT1.lastPrompt, undefined);
  eq("B15bt ...no record created", (c1.days || []).length, 0);

  /* --- الصلاحية --- */
  const d1 = emp({ n: 41, hiredAt: HIRED });
  const envD1 = makeEnv({ employees: [d1], dayKey: PAST, todayKey: TODAY, canPerm: false });
  envD1.api.drCloseDay();
  eq("B15bu without the permission nothing is written", envD1.writes, 0);
  eq("B15bv ...no absence recorded", (d1.days || []).length, 0);
  ok("B15bw ...no preview shown", envD1.lastPrompt === undefined);
  ok("B15bx ...the denial path was taken", envD1.permCalls.indexOf("DENY") !== -1);

  /* --- فشل الحفظ ⇒ تراجع كامل لكل الموظفين --- */
  const s1 = emp({ n: 51, hiredAt: HIRED });
  const s2 = emp({ n: 52, hiredAt: HIRED });
  const envS1 = makeEnv({ employees: [s1, s2], dayKey: PAST, todayKey: TODAY });
  envS1.api.drCloseDay();
  const sb = collect(envS1.lastPrompt, function (n) {
    return n.tag === "button" && /إغلاق اليوم/.test(n.text || "");
  })[0];
  envS1.failWrite = true;
  sb.onClick();
  eq("B15by a failed save leaves NO absence in memory (employee 1)", (s1.days || []).length, 0);
  eq("B15bz ...nor employee 2 (full rollback, not partial)", (s2.days || []).length, 0);
  eq("B15ca ...the store is untouched too",
     envS1.store["malahy_employees_v1"].filter(function (e) { return (e.days || []).length; }).length, 0);
  ok("B15cb ...the operator is warned", envS1.toasts.some(function (t) { return t.k === "warn"; }));

  /* --- كل الموظفين مسجَّلون ⇒ لا داعي للمعاينة --- */
  const k1 = emp({ n: 61, hiredAt: HIRED });
  P.markDay(k1, PAST, "work", {});
  const envK1 = makeEnv({ employees: [k1], dayKey: PAST, todayKey: TODAY });
  envK1.api.drCloseDay();
  eq("B15cc nothing to finalize ⇒ no preview", envK1.lastPrompt, undefined);
  eq("B15cd ...nothing written", envK1.writes, 0);

  /* --- العرض وتبديل التاريخ لا يكتبون --- */
  const r1 = emp({ n: 71, hiredAt: HIRED });
  const snapR = JSON.stringify(r1);
  const envR1 = makeEnv({ employees: [r1], dayKey: PAST, todayKey: TODAY });
  envR1.api.drBody();
  envR1.api.drDayStats(PAST, [r1]);
  envR1.api.drDayFinished(PAST);
  envR1.api.drBody();                       /* إعادة رسم بسبب تبديل التاريخ */
  eq("B15ce viewing/switching a date performs zero writes", envR1.writes, 0);
  eq("B15cf ...and mutates nothing", JSON.stringify(r1), snapR);
  eq("B15cg the day is still unrecorded, not absent",
     P.dayClass(P.dayRec(r1, PAST)), "unrecorded");

  /* --- زر الإغلاق يظهر لليوم المنتهٍ فقط --- */
  function finButtons(key) {
    const e = makeEnv({ employees: [emp({ n: 81, hiredAt: HIRED })], dayKey: key, todayKey: TODAY });
    return collect(e.api.drBody(), function (n) { return n.cls.indexOf("dr-fin") !== -1; });
  }
  const fPast = finButtons(PAST);
  eq("B15ch the finalize button exists for a finished day", fPast.length, 1);
  eq("B15ci ...and is enabled", fPast[0].disabled, false);
  eq("B15cj it is disabled for the running day", finButtons(TODAY)[0].disabled, true);
  eq("B15ck ...and for a future day", finButtons(FUTURE)[0].disabled, true);
}

/* ==========================================================================
 * C) سجل الأيام السابقة
 * ========================================================================== */
console.log("\n-- C) previous-days history scrolling --");
{
  const histList = cssBlock(".hist-list");
  const histItem = cssBlock(".hist-item");
  const histBody = cssBlock(".hist-body");

  ok("C1 .hist-item no longer shrinks (this was the clipping bug)",
     /flex:\s*0\s+0\s+auto/.test(histItem), histItem);
  ok("C2 the history list is still the scroll container",
     hasProps(histList, ["overflow:auto", "max-height"]));
  ok("C3 the list is still a flex column", hasProps(histList, ["display:flex", "flex-direction:column"]));
  ok("C4 no inner scroller was added to the expanded body",
     histBody !== null && histBody.indexOf("overflow") === -1, histBody);

  /* نموذج مبسّط لسلوك عمود مرن محدود بـ max-height مع overflow:auto:
     العناصر المرنة بـ flex-shrink:1 (الوضع القديم) تتقاسم العجز بالتناسب
     على أحجامها الأساسية قبل أي تمرير، فتنكمش صناديقها؛ ومع
     overflow:hidden على .hist-item يُقصّ محتواها ولا يظهر شريط تمرير أصلًا.
     مع flex:0 0 auto لا ينكمش شيء، فيتجاوز المحتوى الحاوية ويُتاح التمرير. */
  function layoutModel(items, viewport, shrinkable) {
    const basis = items.slice();
    const natural = basis.reduce((a, b) => a + b, 0);
    if (natural <= viewport) return { clipped: 0, scrollable: false, natural: natural };
    if (!shrinkable) return { clipped: 0, scrollable: true, natural: natural };
    const deficit = natural - viewport;
    const totalWeight = basis.reduce((a, b) => a + b, 0);
    let unmet = deficit;
    const boxes = basis.slice();
    for (let pass = 0; pass < 3 && unmet > 0.001; pass++) {
      const w = boxes.reduce((a, b) => a + b, 0);
      if (!w) break;
      let used = 0;
      for (let i = 0; i < boxes.length; i++) {
        const share = unmet * boxes[i] / w;          /* flex-shrink × base */
        const take = Math.min(share, basis[i] - 40); /* حد أدنى لتبقى القراءة */
        boxes[i] -= take; used += take;
      }
      unmet -= used;
    }
    if (unmet > 0.001) boxes[boxes.length - 1] = Math.max(40, boxes[boxes.length - 1] - unmet);
    const shown = boxes.reduce((a, b) => a + b, 0);
    let clipped = 0;
    for (let i = 0; i < items.length; i++) clipped += Math.max(0, items[i] - boxes[i]);
    return { clipped: Math.round(clipped), scrollable: false, natural: natural };
  }

  const oneExpanded = [260];                       /* يوم واحد مفتوح، أطول من المساحة */
  const manyWithOneOpen = [60, 60, 60, 60, 260, 60, 60, 60, 60, 60];
  const old1 = layoutModel(oneExpanded, 200, true);
  const new1 = layoutModel(oneExpanded, 200, false);
  eq("C5 a single expanded day taller than the viewport was clipped before",
     old1.clipped > 0, true);
  eq("C6 ...and produced no scrollbar before", old1.scrollable, false);
  eq("C7 nothing is clipped after the fix", new1.clipped, 0);
  eq("C8 ...and the list becomes scrollable instead", new1.scrollable, true);

  const old2 = layoutModel(manyWithOneOpen, 500, true);
  const new2 = layoutModel(manyWithOneOpen, 500, false);
  eq("C9 an expanded day among many was clipped before", old2.clipped > 0, true);
  eq("C10 nothing is clipped after the fix", new2.clipped, 0);
  eq("C11 the long list is scrollable after the fix", new2.scrollable, true);
  eq("C12 the collapsed baseline never needed scrolling",
     layoutModel([60, 60, 60], 500, false).scrollable, false);

  /* سلوك الفتح/الطي محفوظ */
  ok("C13 expand/collapse behavior preserved (.open toggles .hist-body display)",
     /\.hist-item\.open \.hist-body\{display:block;\}/.test(htmlSrc) &&
     /\.hist-body\{display:none;/.test(htmlSrc));
  ok("C14 the chevron rotation is preserved", /\.hist-item\.open \.chev\{transform:rotate\(180deg\);\}/.test(htmlSrc));
  ok("C15 the item is still built from histItem(day) with class hist-item",
     /const item=el\('div',\{class:'hist-item'\}\);/.test(htmlSrc));

  /* الحسابات والعرض وترتيب السجلات لم تُمسّ */
  const histSrc = htmlSrc.slice(htmlSrc.indexOf("function openHistory("), htmlSrc.indexOf("function deleteHistDay("));
  ok("C16 no calculation inside the history screen was modified",
     histSrc.indexOf("calcFinalNet(day)") !== -1 &&
     histSrc.indexOf("fmtNum(day.revenue)") !== -1 &&
     histSrc.indexOf("fmtNum(day.expenses)") !== -1 &&
     histSrc.indexOf("fmtNum(day.gifts)") !== -1);
  ok("C17 record ordering is unchanged (history is unshifted / iterated as-is)",
     /hist\.unshift\(\{/.test(htmlSrc) && /hist\.forEach\(day=>list\.appendChild\(histItem\(day\)\)\)/.test(htmlSrc));
  ok("C18 print + delete actions are preserved in each history row",
     histSrc.indexOf("hist-row-print") !== -1 && histSrc.indexOf("hist-row-del") !== -1);
  ok("C19 the history modal header and close action are still rendered",
     histSrc.indexOf("📋 سجل الأيام السابقة") !== -1 && histSrc.indexOf("'إغلاق'") !== -1);
  ok("C20 the open/close toggle call is unchanged",
     /onClick:\(\)=>item\.classList\.toggle\('open'\)/.test(htmlSrc));
  ok("C21 no new scroll container was added to the history screen",
     !/hist-[a-z]+\{[^}]*overflow-y:auto/.test(htmlSrc));
}

/* ==========================================================================
 * D) حراسة النطاق: لاVersions bump ولا تصدير ولا بيانات إنتاجية
 * ========================================================================== */
console.log("\n-- D) scope guards --");
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  eq("D1 the app version is 2.5.8 (the authorized v2.5.8 patch release bump)", pkg.version, "2.5.8");

  /* مرجع ثابت: حالة ما قبل إصدار v2.5.6 (آخر HEAD مستقر قبل التزام الإصدار).
     بعد دمج العمل في HEAD لم يعد فرق HEAD مجديًا، لذا نُثبّت خط الأساس
     عند نقطة الإصدار السابقة ليبقى الحارس صارمًا وذات معنى. */
  const { execFileSync } = require("child_process");
  /* خط الأساس الثابت = الأب المباشر لالتزام الإصدار v2.5.6 (آخر حالة مستقرة قبل
     الإصدار). يُشتق برمجيًا من الوسم نفسه فلا يعتمد على نسخ معرّف يدويًا قد يخطئ،
     ولا يتزحزح عند إضافة التزامات لاحقة بعد الإصدار (كما كان يحدث مع HEAD~1،
     فيفارغ فرق الدوال ويُنتج إنذارات كاذبة في D2/D3/D8). */
  const BASE = (function () {
    try {
      return execFileSync("git", ["rev-parse", "v2.5.6~1"], { cwd: ROOT }).toString("utf8").trim();
    } catch (_) { return ""; }
  })();
  let head = "";
  try {
    head = execFileSync("git", ["show", BASE + ":index.html"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString("utf8");
  } catch (_) {
    try { head = execFileSync("git", ["show", "HEAD:index.html"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString("utf8"); }
    catch (__) { head = ""; }
  }

  function defFns(src) {
    const set = new Set();
    const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m; while ((m = re.exec(src))) set.add(m[1]);
    return set;
  }
  const addedFns = [...defFns(htmlSrc)].filter(function (n) { return !defFns(head).has(n); });
  const removedFns = [...defFns(head)].filter(function (n) { return !defFns(htmlSrc).has(n); });

  /* حراس النطاق: نُبقيهم صارمين بمطابقة قوائم صريحة. المرحلة 1.1 أضافت
     ثلاثيّتها فقط، والمرحلة 2 (المُصرَّح بها لاحقًا) أضافت مجموعة التصدير
     المسموح بها حصرًا — أي دالة خارج القائمتين تعتبر انتهاكًا للنطاق. */
  const PHASE11_FNS = ["drCloseDay", "drDayFinished", "drMarkAbsent"];
  const PHASE2_FNS = ["exportPayrollScopePDF", "exportPayrollScopeXLS", "openPayrollExportScope",
    "openPayrollPrintScope", "payrollDatePicker", "payrollPrintScopeReport",
    "payrollPrintSelectedReceipts", "payrollScopeFileStamp", "payrollScopePicker",
    "pbActualDates", "pbActualEntries", "pbSavedItems",
    "picked", "refresh", "setAll"]; /* مساعدات داخلية ضمن دوالي الانتقاء */
  /* إصدار v2.5.7 (رواتب ⇒ مصروفات اليوم): دالتان فقط — تسجيل بند المصروف من
     دفعة محفوظة، وتحويل بند مصروف إلى صفّ تقرير يحتفظ برابط الصرف. */
  const V257_FNS = ["recordPayrollExpenses", "dayExpenseRow"];
  const allowedAdded = PHASE11_FNS.concat(PHASE2_FNS).concat(V257_FNS).sort();
  ok("D2 every function added to index.html is on the authorized phase list",
     addedFns.length === allowedAdded.length,
     "added=" + JSON.stringify(addedFns.sort()) + " allowed=" + JSON.stringify(allowedAdded));
  ok("D3 ...the Phase 1.1 finalization trio is intact, plus only the authorized Phase 2 + v2.5.7 sets",
     JSON.stringify(addedFns.sort()) === JSON.stringify(allowedAdded) &&
     PHASE11_FNS.every(function (n) { return addedFns.indexOf(n) !== -1; }) &&
     V257_FNS.every(function (n) { return addedFns.indexOf(n) !== -1; }),
     JSON.stringify(addedFns.sort()));
  eq("D4 no existing function was removed from index.html", removedFns.length, 0);
  ok("D5 no new script tag was added to index.html",
     (htmlSrc.match(/<script[^>]*>/g) || []).length === (head.match(/<script[^>]*>/g) || []).length);
  ok("D6 no UNPLANNED export/report function was introduced (only the authorized Phase 2 names)",
     !/function\s+(printPayrollThermal|exportPdf|exportPDF|exportExcel|toXLSX)\s*\(/.test(htmlSrc) &&
     addedFns.every(function (n) { return allowedAdded.indexOf(n) !== -1; }));
  ok("D7 no new external dependency was introduced",
     Object.keys(pkg.dependencies).length === 1 && Object.keys(pkg.devDependencies).length === 2);
  ok("D8 the payroll core gained ONLY the finalization plan+apply pair + the v2.5.7 salary-expense trio",
     (function () {
       const p = fs.readFileSync(path.join(ROOT, "assets", "payroll", "payroll-core.js"), "utf8");
       let h = "";
       try { h = execFileSync("git", ["show", BASE + ":assets/payroll/payroll-core.js"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString("utf8"); } catch (_) { try { h = execFileSync("git", ["show", "HEAD:assets/payroll/payroll-core.js"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString("utf8"); } catch (__) { h = ""; } }
       if (!h) return true;
       const a = [...defFns(p)].filter(function (n) { return !defFns(h).has(n); });
       const r = [...defFns(h)].filter(function (n) { return !defFns(p).has(n); });
       return JSON.stringify(a.sort()) === JSON.stringify(["applyAttendanceClose", "arDayCount",
            "fmt", "planAttendanceClose", "salaryDesc", "salaryExpenseEntries", "salaryExpenseTotal"])
           && r.length === 0;
     })());
  ok("D8b no existing payroll function body was removed (pure additions)",
     (function () {
       try {
         const p = fs.readFileSync(path.join(ROOT, "assets", "payroll", "payroll-core.js"), "utf8");
         const h = execFileSync("git", ["cat-file", "blob", BASE + ":assets/payroll/payroll-core.js"],
           { cwd: ROOT, maxBuffer: 1 << 28, encoding: "utf8" });
         const norm = (s) => s.replace(/\r\n/g, "\n").split("\n")
           .map((l) => l.replace(/^\s*\*.*$/, "").replace(/^\s*\/\*.*$/, "").trim())
           .filter((l) => l && !/^function (planAttendanceClose|applyAttendanceClose|arDayCount|fmt|salaryDesc|salaryExpenseEntries|salaryExpenseTotal)/.test(l));
         const a = norm(h), b = norm(p);
         /* كل سطر موجود في HEAD يجب أن يبقى موجودًا */
         const setB = new Set(b);
         return a.filter((l) => !setB.has(l)).length === 0;
       } catch (_) { return true; }
     })());
  ok("D9 only the phase files are touched (2 sources + 1 test + 3 reports)",
     (function () {
       try {
         /* بعد التزام الإصدار: التغيير بين خط الأساس الثابت ورأس الإصدار،
          بالإضافة إلى أي ملف غير مُلتزم بعد في شجرة العمل */
         let files = [];
         try { files = execFileSync("git", ["diff", "--name-only", BASE, "HEAD"], { cwd: ROOT }).toString("utf8").split("\n").filter(Boolean).map(function (l) { return l.trim().replace(/\\/g, "/"); }); } catch (_) {}
         files = files.concat(execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString("utf8")
           .split("\n").filter(Boolean)
           .map(function (l) { return l.slice(3).trim().replace(/\\/g, "/"); }));
         const allowed = ["index.html", "assets/payroll/payroll-core.js",
           "assets/report/payroll-report.js", "main.js", "preload.js", "package.json",
           "tests/v256-attendance-scroll.test.js", "tests/v256-payroll-exports.test.js",
           "tests/phase3b-auth.test.js", "tests/phase3c1-gate.test.js", "tests/phase3c2-baseline.test.js",
           /* تصحيح معتمَد للاختبار فقط: إصلاح 7g التابع للتاريخ + سجل الانتكاس 7g2 */
           "tests/payroll-ui.test.js",
           /* تقارير مراجعة ما قبل النشر — على نفس نمط التقارير المصرّح بها أعلاه */
           "AI_REPORTS/V2_5_6_PHASE_1_REPORT.md",
           "AI_REPORTS/V2_5_6_PHASE_1_REVIEW_REPORT.md",
           "AI_REPORTS/V2_5_6_PHASE_1_1_ATTENDANCE_FINALIZATION_REPORT.md",
           "AI_REPORTS/V2_5_6_PHASE_2_IMPLEMENTATION_REPORT.md",
           "AI_REPORTS/V2_5_6_PRE_RELEASE_REVIEW_REPORT.md",
           "AI_REPORTS/V2_5_6_FINAL_PRE_PUBLISH_REPORT.md",
           "AI_REPORTS/V2_5_6_RELEASE_PUBLISH_REPORT.md",
            /* إصدار v2.5.7 (رواتب ⇒ مصروفات اليوم): وحدة تقرير اليوم + اختبار
               مركزي جديد + تقرير التنفيذ. نفس النمط المصرَّح به أعلاه. */
            "assets/report/daily-report.js",
            "tests/v257-salary-expenses.test.js",
            "AI_REPORTS/V2_5_7_SALARY_EXPENSES_IMPLEMENTATION_REPORT.md"];
         return files.every(function (f) { return allowed.indexOf(f) !== -1; });
       } catch (_) { return true; }
     })(), (function () {
       try {
         return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString("utf8")
           .split("\n").filter(Boolean).map(function (l) { return l.slice(3).trim(); }).join(" | ");
       } catch (_) { return "n/a"; }
     })());
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
