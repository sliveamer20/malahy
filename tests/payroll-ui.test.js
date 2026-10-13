// tests/payroll-ui.test.js
// اختبار تكامل الواجهة: نفس دوال index.html الحقيقية (مستخرجة كما يفعل اختبار
// الطابعة) فوق مخزن JSON وهمي في الذاكرة — للتأكد أن الترحيل والحفظ والدفعة
// والإيصالات تعمل فعليًا كما تعمل داخل البرنامج، وأن فشل الحفظ على الجهاز
// يتراجع ولا يُعلم أي موظف كمدفوع.
//
// كل البيانات اصطناعية (Synthetic) — لا تُلمَس بيانات الإنتاج ولا يُفتح أي ملف.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "assets", "payroll", "payroll-core.js"));
const R = require(path.join(ROOT, "assets", "report", "payroll-report.js"));

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
/* نهاية اليوم الحالي — نفس نقطة القطع التي تستخدمها الواجهة فعليًا */
function EOD() { return P.endOfDayTs(Date.now()); }

/* ---------- استخراج دوال حقيقية من index.html ---------- */
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
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- مخزن جهاز وهمي + مساعدات واجهة ---------- */
function makeEnv(opts) {
  opts = opts || {};
  const store = {};
  const toasts = [];
  const env = {
    store: store,
    toasts: toasts,
    failWrite: false,
    writes: 0
  };
  const loadJSON = function (k, d) { return (k in store) ? store[k] : d; };
  const saveJSON = function (k, v) {
    if (env.failWrite && opts.failKey === k) { env.writes++; return false; }
    store[k] = JSON.parse(JSON.stringify(v));
    env.writes++;
    return true;
  };
  const uid = function () { return "u" + (env.writes + Math.random()).toString(36).slice(2, 8); };
  const toast = function (m, k) { toasts.push({ m: m, k: k || "ok" }); };
  const settings = function () { return opts.settings || {}; };
  const paperKind = function () { return opts.paper || "80"; };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  const fmtNum = function (n) {
    const r = Math.round((Number(n) || 0) * 100) / 100;
    return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  const fmtDMY = function (d) {
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  };
  const fmtTime12 = function (d) {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h < 12 ? "ص" : "م"; h = h % 12; if (h === 0) h = 12;
    return h + ":" + m + " " + ap;
  };
  const win = {
    MalahyPayroll: P,
    MalahyPayrollReport: R,
    malahyPrint: { printTicket: async function () { return { ok: true }; } }
  };
  const names = ["PR", "PRR", "empCore", "empLoad", "empSave", "empFind", "empMigrate", "empRunMigration",
    "empMigrationAudit", "empPrintMigrationAudit", "empPendingMigration",
    "pbLoad", "pbSave", "pbGet", "pbPut", "pbList", "payCommit",
    "recordEmployeeAdvance", "removeEmployeeAdvance",
    "payrollVenue", "payrollBatchHTML", "payrollReceiptHTML", "pbLatest"];
  const body = names.map(function (n) { return extractFunction(htmlSrc, n); }).join("\n")
    + "\nreturn {empLoad:empLoad,empSave:empSave,empFind:empFind,empMigrate:empMigrate,"
    + "empRunMigration:empRunMigration,empMigrationAudit:empMigrationAudit,"
    + "empPendingMigration:empPendingMigration,"
    + "empPrintMigrationAudit:empPrintMigrationAudit,"
    + "pbLoad:pbLoad,pbGet:pbGet,pbPut:pbPut,pbList:pbList,"
    + "payCommit:payCommit,recordEmployeeAdvance:recordEmployeeAdvance,"
    + "removeEmployeeAdvance:removeEmployeeAdvance,payrollVenue:payrollVenue,"
    + "payrollBatchHTML:payrollBatchHTML,payrollReceiptHTML:payrollReceiptHTML,pbLatest:pbLatest,"
    + "getList:function(){ return _emp.list; },clearList:function(){ _emp.list=null; }"
    + ",setBatches:function(b){ _pb=b; },getBatches:function(){ return _pb; }};";
  /* eslint-disable no-new-func */
  const api = new Function("loadJSON", "saveJSON", "uid", "toast", "settings", "paperKind",
    "window", "K_EMP", "K_PAYBATCH", "_emp", "_pb", body)(
    loadJSON, saveJSON, uid, toast, settings, paperKind,
    win, "malahy_employees_v1", "malahy_payroll_batches_v1",
    { list: null }, null);
  env.api = api;
  return env;
}

/* موظف إنتاجي قديم بالشكل الحقيقي */
function oldEmp(o) {
  const start = D(2026, 9, 26);
  return Object.assign({
    id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100, phone: "", hiredAt: D(2026, 1, 1),
    notes: "", weeks: [{
      key: K(2026, 9, 26), startTs: start, endTs: start + 6 * 86400000, dailyWage: 100,
      days: [{ status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
        { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
        { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
        { status: "work", penalty: 0, bonus: 0, note: "" }],
      bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
      paid: true, paidAt: D(2026, 10, 2),
      snapshot: { work: 7, vac: 0, abs: 0, bonus: 0, pen: 0, adv: 0, ded: 0, gross: 700, net: 700 }
    }]
  }, o || {});
}

console.log("PAYROLL UI BRIDGE — real index.html functions over an in-memory device store");

/* ==========================================================================
 * 1) الفتح لا يكتب: التحميل قراءةٌ خالصة، والترحيل لا يكون إلا بإذن صريح
 * ========================================================================== */
{
  const env = makeEnv();
  env.store["malahy_employees_v1"] = [oldEmp({ id: "E1", weeks: [Object.assign(oldEmp().weeks[0], { paid: false, paidAt: null, snapshot: null })] })];
  const list = env.api.empLoad();          /* التحميل وحده: لا كتابة ولا ترحيل */
  const e = list[0];
  ok("1a employee record kept", !!e && e.name === "أحمد");
  eq("1b the legacy week is still there", e.weeks.length, 1);
  /* === الضمان الجديد: الفتح لا يُعيد كتابة ملف البيانات === */
  eq("1c opening the employee screen performs ZERO writes", env.writes, 0);
  eq("1d no ledger was created merely by loading", e.days, undefined);
  eq("1e no schema stamp was written merely by loading", e.legacySchema, undefined);

  /* === الكشف عن الترحيل المعلّق: قراءةٌ خالصة === */
  const pend = env.api.empPendingMigration();
  eq("1f the pending migration is detected", pend.employees, 1);
  eq("1g ...with its week count", pend.weeks, 1);
  eq("1h the detector itself writes nothing", env.writes, 0);
  eq("1i ...and still leaves the record untouched", e.days, undefined);

  /* === الترحيل الصريح (بعد التأكيد) === */
  env.api.empRunMigration();
  ok("1j the explicit migration persisted the file", env.writes > 0);
  eq("1k elapsed days imported into the flexible ledger", e.days.length, 7);
  eq("1l owed from the unpaid legacy week", P.statsUpTo(e, EOD()).outstanding, 700);
  eq("1m preferred cycle initialised", e.payCycle, "weekly");
  eq("1n employees file persisted", env.store["malahy_employees_v1"].length, 1);

  /* إعادة الفتح لا تُكرّر الترحيل ولا تكتب شيئًا */
  env.api.setBatches(env.api.pbLoad());
  const writesBeforeReopen = env.writes;
  env.api.clearList();
  const again = env.api.empLoad()[0];
  eq("1o migration is idempotent across restarts", again.days.length, 7);
  eq("1p reopening after migration performs zero writes", env.writes, writesBeforeReopen);
  eq("1q nothing is pending any more", env.api.empPendingMigration().employees, 0);

  /* === إعادة الترحيل الصريحة لا تستورد شيئًا === */
  const before = JSON.stringify(env.store["malahy_employees_v1"]);
  const rerun = env.api.empRunMigration();
  eq("1r a second explicit run imports no days", rerun.importedDays, 0);
  eq("1s ...and changes nothing on disk", JSON.stringify(env.store["malahy_employees_v1"]), before);
}

/* ==========================================================================
 * 2) صرف دفعة عبر payCommit — كل موظف يُحفظ على حدة
 * ========================================================================== */
{
  const env = makeEnv();
  env.store["malahy_employees_v1"] = [
    { id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 100, note: "" }] },
    { id: "E2", name: "سارة", job: "مشغل ألعاب", dailyWage: 85, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 85, note: "" }] }
  ];
  const list = env.api.empLoad();
  const plans = list.map(function (e) { return P.planPayout(e, { nowTs: Date.now(), dateTs: Date.now() }); });
  const res = env.api.payCommit(plans, {});
  eq("2a both employees saved", res.saved, 2);
  eq("2b no failures", res.failed, 0);
  eq("2c batch total = 100 + 85", res.batch.totals.amount, 185);
  ok("2d batch reference assigned", /^PAY-\d{8}-01$/.test(res.batch.ref), res.batch.ref);
  /* الدفعات محفوظة في مخزن مستقل */
  const batches = env.api.pbList();
  eq("2e batch persisted", batches.length, 1);
  eq("2f latest batch id matches", env.api.pbLatest(), res.batch.id);
  /* الموظفون مدفوعون فعلًا في الملف المحفوظ */
  const saved = env.store["malahy_employees_v1"];
  saved.forEach(function (e) { eq("2g " + e.id + " settled on disk", P.statsUpTo(e, EOD()).outstanding, 0); });
  /* إعادة الصرف بنفس الخطط لا تُنتج عمليات مكررة */
  const plans2 = saved.map(function (e) { return P.planPayout(e, { nowTs: Date.now(), dateTs: Date.now() }); });
  const res2 = env.api.payCommit(plans2, {});
  eq("2h retry pays nobody (nothing due)", res2.saved, 0);
  eq("2i retry is not a failure", res2.failed, 0);
  eq("2j each employee still has exactly one payout", env.store["malahy_employees_v1"][0].payouts.length, 1);
}

/* ==========================================================================
 * 3) فشل حفظ الجهاز ⇒ تراجع كامل ولا تعليم كمدفوع
 * ========================================================================== */
{
  const env = makeEnv({ failKey: "malahy_employees_v1" });
  env.failWrite = true;
  env.store["malahy_employees_v1"] = [
    { id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 100, note: "" }] }
  ];
  const list = env.api.empLoad();
  const plans = list.map(function (e) { return P.planPayout(e, { nowTs: Date.now(), dateTs: Date.now() }); });
  /* لقطة ما قبل الالتزام: التخطيط قد يُهيّئ سجل Ledgervia ensureLedger، وهذا
     تهيئة شرعية لا تُعد تراجعًا. المهم: فشل الحفظ يعيد السجل لما كان عليه
     لحظةCommit بالضبط — لا أكثر ولا أقل. */
  const before = JSON.stringify(list[0]);
  const res = env.api.payCommit(plans, {});
  eq("3a nobody saved", res.saved, 0);
  eq("3b the failure is reported", res.failed, 1);
  eq("3c employee object rolled back in memory", JSON.stringify(list[0]), before);
  eq("3d employee object on disk unchanged", JSON.stringify(env.store["malahy_employees_v1"][0]), before);
  eq("3e no batch stored as a successful payout", env.api.pbList().length, 0);
  /* بعد إصلاح الحفظ يمكن المحاولة بأمان */
  env.failWrite = false;
  const res2 = env.api.payCommit(list.map(function (e) { return P.planPayout(e, { nowTs: Date.now(), dateTs: Date.now() }); }), {});
  eq("3f retry after the fix succeeds", res2.saved, 1);
  eq("3g settled exactly once", P.statsUpTo(env.api.empFind("E1"), EOD()).outstanding, 0);
}

/* ==========================================================================
 * 4) السلف: تسجيل من المصروفات ثم الصرف ثم الحذف
 * ========================================================================== */
{
  const env = makeEnv();
  env.store["malahy_employees_v1"] = [
    { id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 100, note: "" }] }
  ];
  env.api.empLoad();
  const adv = env.api.recordEmployeeAdvance("E1", 40, "سلفة نقدية", "EXP7", D(2026, 10, 11));
  ok("4a advance recorded", !!adv && adv.amount === 40);
  eq("4b advance linked to its expense", env.api.empFind("E1").advances[0].expenseId, "EXP7");
  eq("4c due = wage - advance", P.statsUpTo(env.api.empFind("E1"), EOD()).outstanding, 60);
  const plans = [P.planPayout(env.api.empFind("E1"), { nowTs: Date.now(), dateTs: Date.now() })];
  env.api.payCommit(plans, {});
  eq("4d settled after paying", P.statsUpTo(env.api.empFind("E1"), EOD()).outstanding, 0);
  eq("4e advance NOT deducted twice", env.api.empFind("E1").advances.length, 1);
  eq("4f advance still auditable", env.api.empFind("E1").advances[0].settledBy != null, true);
  /* حذف المصروف المرتبط يحذف السلفة */
  const e2 = env.api.empFind("E1");
  P.addAdvance(e2, { id: "a2", ts: Date.now(), amount: 25, expenseId: "EXP8" });
  env.api.removeEmployeeAdvance("E1", "EXP8");
  eq("4g deleting the expense removes its advance", env.api.empFind("E1").advances.length, 1);
  env.api.removeEmployeeAdvance("E1", "EXP7");
  eq("4h deleting the original advance works too", env.api.empFind("E1").advances.length, 0);
}

/* ==========================================================================
 * 5) تقرير الطباعة مبني من سجل الدفعة المحفوظ فعليًا
 * ========================================================================== */
{
  const env = makeEnv({ paper: "58", settings: { brandName: "" } });
  env.store["malahy_employees_v1"] = [
    { id: "E1", name: "أحمد محمود", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 100, note: "" }] }
  ];
  env.api.empLoad();
  const plans = [P.planPayout(env.api.empFind("E1"), { nowTs: Date.now(), dateTs: Date.now() })];
  const res = env.api.payCommit(plans, {});
  const html = env.api.payrollBatchHTML(res.batch.id);
  ok("5a batch report generated from the saved batch", typeof html === "string" && html.length > 500);
  ok("5b park name printed", html.indexOf("ملاهي كوكو بارك") !== -1);
  ok("5c title printed", html.indexOf("تقرير صرف رواتب الموظفين") !== -1);
  ok("5d employee name printed", html.indexOf("أحمد") !== -1);
  ok("5e amount printed", html.indexOf("100") !== -1);
  ok("5f 58mm width honoured", html.indexOf("body{width:48mm") !== -1);
  ok("5g no weekly Saturday label", html.indexOf("السبت") === -1);
  /* الإيصال الفردي لنفس الموظف من نفس الدفعة */
  const rc = env.api.payrollReceiptHTML(res.batch.id, "E1");
  ok("5h receipt generated", rc.indexOf("إيصال صرف راتب") !== -1);
  ok("5i receipt shows the same amount", rc.indexOf("100") !== -1);
  /* معرّف غير موجود ⇒ لا اختراع لأي مستند */
  eq("5j unknown batch yields no html", env.api.payrollBatchHTML("nope"), "");
  eq("5k unknown employee yields no receipt", env.api.payrollReceiptHTML(res.batch.id, "nope"), "");
  /* إعادة الطباعة تعطي نفس المستند تمامًا (تقرير تاريخي) */
  ok("5l reprint is identical", env.api.payrollBatchHTML(res.batch.id) === html);
}

/* ==========================================================================
 * 6) اسم النشاط المهيّأ يُستخدم، والافتراضي يسقط عليه
 * ========================================================================== */
{
  const env = makeEnv({ settings: { brandName: "ملاهي النجمة" } });
  eq("6a configured brand used", env.api.payrollVenue(), "ملاهي النجمة");
  const env2 = makeEnv({ settings: {} });
  eq("6b default venue falls back", env2.api.payrollVenue(), R.DEFAULT_VENUE);
}

/* ==========================================================================
 * 7) تخزين الدفعات: ذرّ per-employee ولا يمسح سجل الموظفين
 * ========================================================================== */
{
  const env = makeEnv();
  const employees = [{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [], days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "dreg", wage: 100, note: "" }] }];
  env.store["malahy_employees_v1"] = employees;
  env.api.empLoad();
  /* تواريخ ثابتة (لا تعتمد على ساعة النظام) ⇒ المرجع قابل للتكرار في أي يوم */
  const batchDay = D(2026, 10, 13);
  const nextDay = D(2026, 10, 14);
  const res = env.api.payCommit([P.planPayout(env.api.empFind("E1"), { nowTs: batchDay, dateTs: batchDay })], {});
  ok("7a batch key created", !!env.store["malahy_payroll_batches_v1"]);
  eq("7b one batch inside", Object.keys(env.store["malahy_payroll_batches_v1"]).filter(function (k) { return k.indexOf("_seq_") !== 0; }).length, 1);
  ok("7b2 the only extra key is the daily reference counter",
    Object.keys(env.store["malahy_payroll_batches_v1"]).every(function (k) { return k.indexOf("_seq_") === 0 || !!env.store["malahy_payroll_batches_v1"][k].ts; }));
  const b = env.api.pbGet(res.batch.id);
  ok("7c batch carries the reference", b.ref === res.batch.ref);
  eq("7d batch carries the paid total", b.totals.amount, 100);
  ok("7e each item records its own payout id", typeof b.items[0].payoutId === "string" && b.items[0].payoutId.length > 0);
  /* بيانات الموظفين لم تُمسح */
  eq("7f employee still present", env.store["malahy_employees_v1"].length, 1);
  /* مرجع جديد في اليوم التالي لا يتكرر — كلا التاريخين ثابت فوق ساعة النظام،
     فينتج نفس النتيجة في أي يوم يُشغَّل فيه الاختبار */
  const ref2 = P.nextRef(env.api.pbLoad(), nextDay);
  eq("7g a new day gets its own reference", ref2, "PAY-" + K(2026, 10, 14).replace(/-/g, "") + "-01");
  /* سجل الانحدار: دفعة اليوم الثابت تُعطي مرجعًا من نفس اليوم المُثبَّت — لا من
     تاريخ اليوم الحقيقي (السبب الجذري للخطأ كان Date.now()) */
  eq("7g2 batch reference is pinned to the fixed batch day", res.batch.ref, "PAY-" + K(2026, 10, 13).replace(/-/g, "") + "-01");
}

/* ==========================================================================
 * 8) توحيد المستند مع شاشة التأكيد: نفس سطرَي التسوية اللذين يُطبعان في
 *     الإيصال يجب أن يظهرا في حوار التأكيد وجدول المراجعة، وإلا رأى
 *     المدير «المكتسب 85» و«المصروف 150» بلا تفسير.
 *     ملاحظة: فحص على مصدر index.html مباشرة (دوال العرض غير قابلة للتنفيذ
 *     خارج المتصفح)، والمحرك نفسه مُختبَر في payroll.test.js §20.
 * ========================================================================== */
{
  ok("8a confirm dialog prints the items net",
    /plan\.coveredNet/.test(htmlSrc) && htmlSrc.indexOf("صافي بنود هذه الدفعة") !== -1);
  ok("8b confirm dialog prints the bridging line",
    /plan\.itemsDiff/.test(htmlSrc) && htmlSrc.indexOf("بنود غير مُفصَّلة في هذا الإيصال") !== -1);
  ok("8c review table explains the gap under the gross cell",
    /p\.itemsDiff>0/.test(htmlSrc) && htmlSrc.indexOf("صافي البنود") !== -1);

  /* نفس الحالة عبر المحرك + دالة money المستخرجة فعلًا */
  const e = { id: "UE", name: "عبدالرحمن", job: "كاشير", dailyWage: 85, hiredAt: D(2026, 10, 1), weeks: [] };
  P.ensureLedger(e);
  P.markDay(e, K(2026, 10, 8), "work");
  P.markDay(e, K(2026, 10, 10), "work");
  P.addAdvance(e, { id: "UA", ts: D(2026, 10, 12), amount: 20, reason: "سلفة" });
  const plan = P.planPayout(e, { nowTs: D(2026, 10, 12), dateTs: D(2026, 10, 12) });
  eq("8d the engine gap is exactly the failing case", plan.itemsDiff, 85);
  eq("8e the UI would print 65 + 85 = the amount", plan.coveredNet + plan.itemsDiff, plan.amount);
  ok("8f ...and the amount is the full correct balance", plan.amount === 150);
  ok("8g the gap line is conditional (absent when there is none)",
    /plan\.itemsDiff>0\)\?/.test(htmlSrc));
}

/* ==========================================================================
 * 9) إظهار عدد أيام الحضور المُرحَّلة في الواجهة (قرار المستخدم رقم 2).
 *     الدوال المستخرجة هنا هي نفسها الموجودة في index.html.
 * ========================================================================== */
{
  /* موظف قديم: أسبوع مدفوع + أسبوع غير مدفوع فيه غياب وإجازة وسلفة */
  const mkOld = function (id, nm) {
    const mkDays = () => [
      { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
      { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "absent", penalty: 0, bonus: 0, note: "" },
      { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
      { status: "vacation", penalty: 0, bonus: 0, note: "" }];
    const wk = (key, paid) => ({
      key, startTs: P.tsOfDayKey(key), endTs: P.tsOfDayKey(key) + 6 * 86400000,
      dailyWage: 100, days: mkDays(),
      bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
      paid, paidAt: paid ? P.tsOfDayKey(key) + 6 * 86400000 : 0,
      snapshot: paid ? { work: 5, vac: 1, abs: 1, gross: 500, net: 500 } : null
    });
    return { id, name: nm, job: "كاشير", dailyWage: 100, phone: "", hiredAt: D(2026, 9, 1), notes: "",
      weeks: [wk("2026-09-19", true), wk("2026-09-26", false)] };
  };
  const env = makeEnv();
  env.store["malahy_employees_v1"] = [mkOld("A1", "عبدالرحمن"), mkOld("A2", "سارة")];

  /* empLoad قراءةٌ خالصة: لا ترحيل ولا كتابة */
  env.api.empLoad();
  eq("9a0 loading alone performs zero writes", env.writes, 0);
  eq("9a00 the record is untouched before approval", env.api.getList()[0].days, undefined);
  /* الترحيل الصريح بعد التأكيد */
  env.api.empRunMigration();
  const aud = env.api.empMigrationAudit();

  ok("9a the audit is available from the UI layer", !!aud);
  eq("9b both employees are audited", aud.employees, 2);
  eq("9c the migrated attendance-day count is exposed", aud.days, 14);
  eq("9d ...broken down as work/absence/vacation",
    aud.work + aud.abs + aud.vac, aud.days);
  eq("9e paid weeks are counted separately and never re-counted", aud.weeksPaid, 2);
  eq("9f the paid weeks' days did not enter the new ledger",
    env.api.getList()[0].days.length, 7);
  eq("9g ...and only from the unpaid week", env.api.getList()[0].days[0].key >= "2026-09-26", true);
  eq("9h the lifetime gross reflects only the unpaid week",
    P.statsUpTo(env.api.getList()[0], P.endOfDayTs(Date.now())).gross, 500);

  /* idempotency through the UI layer */
  const run1 = env.api.empRunMigration();
  eq("9i an explicit re-run imports no extra days", run1.importedDays, 0);
  eq("9j ...and no extra operations", run1.importedOps, 0);
  const aud2 = env.api.empMigrationAudit();
  eq("9k the surfaced count survives the re-run", aud2.days, 14);

  /* the count is readable from the saved data, not from memory */
  const saved = JSON.parse(JSON.stringify(env.store["malahy_employees_v1"]));
  eq("9l the audit is persisted in the saved employee record",
    saved[0].legacyImport.days, 7);
  eq("9m ...with the breakdown", saved[0].legacyImport.work + saved[0].legacyImport.abs + saved[0].legacyImport.vac, 7);
  eq("9n ...and the paid-week count", saved[0].legacyImport.weeksPaid, 1);
  const readBack = P.migrationAudit(saved);
  eq("9o a fresh read of the saved file yields the same total", readBack.days, 14);

  /* the printable audit is wired to the real report module */
  ok("9p the dashboard surfaces the audit box",
    htmlSrc.indexOf("تدقيق ترحيل سجل الموظفين") !== -1 &&
    htmlSrc.indexOf("يوم حضور مُرحَّل") !== -1 &&
    htmlSrc.indexOf("empMigrationAudit()") !== -1);
  ok("9q each employee card shows its own audit line",
    htmlSrc.indexOf("عند الترحيل") !== -1);
  ok("9r a print button for the audit report is wired",
    htmlSrc.indexOf("طباعة تقرير تدقيق الترحيل") !== -1 &&
    htmlSrc.indexOf("migrationAuditHTML") !== -1);
  ok("9s the print path goes through the same thermal printer helper",
    /empPrintMigrationAudit[\s\S]{0,400}malahyPrint\.printTicket/.test(htmlSrc));
}
console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
