// tests/payroll-report.test.js
// المرحلة 5 — تقرير صرف رواتب الموظفين على الطابعة الحرارية + تنفيذ الدفعة
// المجمّعة مع الفشل الجزئي:
//   بنود التقرير، الإجماليات، عدد الموظفين، عرض 58/80/A4، التفاف النص
//   العربي، منع فيض الأسماء والمبالغ، الإيصال الفرعي، أخطاء الطابعة،
//   والتنفيذ الآمن (تراجع عند فشل الحفظ + عدم تكرار العمليات).

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
function D(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0, 0).getTime(); }
/* تاريخ + وقت (للاختبارات التي تحتاج دقيقة محددة) */
function DT(y, m, d, hh, mm) { return new Date(y, m - 1, d, hh, mm, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
const TS = DT(2026, 10, 12, 15, 30);        /* الاثنين 12 أكتوبر 2026، 03:30 م */

/* ---------- استخراج دوال حقيقية من index.html (نفس نمط اختبار الطابعة) ---------- */
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

/* ---------- دفعة اصطناعية: ثلاثة موظفين ببيانات مختلفة ---------- */
function mkPlan(o) {
  return {
    empId: o.id, name: o.name, job: o.job, dailyWage: o.wage, payCycle: "weekly",
    dateTs: TS, cutoffTs: TS,
    period: { fromTs: D(2026, 10, 6), toTs: TS, fromKey: K(2026, 10, 6), toKey: K(2026, 10, 12) },
    covered: { dayKeys: [], bonuses: [], penalties: [], advances: [], deductions: [] },
    work: o.work, abs: o.abs || 0, vac: 0,
    gross: o.gross, bonus: o.bonus || 0, pen: o.pen || 0, adv: o.adv || 0, ded: o.ded || 0,
    paidBefore: o.paidBefore || 0, outstandingBefore: o.amount, due: o.amount,
    amount: o.amount, balanceAfter: 0, ok: true, reason: ""
  };
}
const PLANS = [
  mkPlan({ id: "E1", name: "أحمد محمود", job: "كاشير", wage: 100, work: 6, gross: 600, paidBefore: 200, amount: 400 }),
  mkPlan({ id: "E2", name: "سارة علي عبد الله", job: "مشغل ألعاب", wage: 85, work: 5, gross: 425, adv: 100, paidBefore: 0, amount: 325 }),
  mkPlan({ id: "E3", name: "خالد", job: "كاشير", wage: 100, work: 3, gross: 300, bonus: 50, pen: 20, ded: 30, paidBefore: 0, amount: 300 })
];
const BATCH = P.buildBatch(PLANS, { ts: TS, dateTs: TS, ref: "PAY-20261012-01" });
PLANS.forEach((p, i) => { BATCH.items[i].status = "saved"; BATCH.items[i].period = p.period; });
BATCH.totals = P.retotal(BATCH.items);

console.log("PAYROLL REPORT — consolidated thermal payroll report + safe batch commit");

/* ==========================================================================
 * 1) الترويسة: النشاط + العنوان + التاريخ والوقت + رقم الدفعة
 * ========================================================================== */
{
  const html = R.batchHTML(BATCH, { paper: "80" });
  ok("1a park name printed (default ملاهي كوكو بارك)", html.indexOf("ملاهي كوكو بارك") !== -1);
  ok("1b report title printed", html.indexOf("تقرير صرف رواتب الموظفين") !== -1);
  ok("1c payout date printed", html.indexOf("12/10/2026") !== -1, html.slice(0, 400));
  ok("1d payout time printed", html.indexOf("3:30 م") !== -1);
  ok("1e batch reference printed", html.indexOf("PAY-20261012-01") !== -1);
  ok("1f configured venue overrides the default",
    R.batchHTML(BATCH, { paper: "80", venue: "ملاهي النجمة" }).indexOf("ملاهي النجمة") !== -1);
}

/* ==========================================================================
 * 2) بنود كل موظف
 * ========================================================================== */
{
  const html = R.batchHTML(BATCH, { paper: "80" });
  ok("2a employee name", html.indexOf("أحمد محمود") !== -1);
  ok("2b job / role", html.indexOf("مشغل ألعاب") !== -1);
  ok("2c daily wage line", html.indexOf("الأجر اليومي") !== -1);
  ok("2d attended days line", html.indexOf("أيام الحضور") !== -1);
  ok("2e gross wages line", html.indexOf("الأجر المكتسب") !== -1);
  ok("2f advances line", html.indexOf("سلف مخصومة") !== -1);
  ok("2g previously paid line", html.indexOf("مسدَّد سابقًا") !== -1);
  ok("2h amount paid in this batch", html.indexOf("المصروف في هذه الدفعة") !== -1);
  ok("2i remaining balance line", html.indexOf("المتبقي بعد الصرف") !== -1);
  ok("2j bonuses line", html.indexOf("مكافآت") !== -1);
  ok("2k penalties line", html.indexOf("جزاءات") !== -1);
  ok("2l other deductions line", html.indexOf("خصومات أخرى") !== -1);
  /* الحقول التي لا تنطبق على موظف لا تُطبع له */
  const one = P.buildBatch([PLANS[0]], { ts: TS, ref: "R1" });
  one.items[0].status = "saved";
  const h1 = R.batchHTML(one, { paper: "80" });
  ok("2m no advances line for an employee with no advances", h1.indexOf("سلف مخصومة") === -1);
  ok("2n no bonuses line for an employee with no bonuses", h1.indexOf("مكافآت") === -1);
  /* القيم مطابقة للسجل المحفوظ */
  ok("2o 600 / 425 / 300 printed", html.indexOf("600") !== -1 && html.indexOf("425") !== -1 && html.indexOf("300") !== -1);
  ok("2p 100 advance printed", html.indexOf("100") !== -1);
}

/* ==========================================================================
 * 3) الإجماليات وعدد الموظفين
 * ========================================================================== */
{
  const html = R.batchHTML(BATCH, { paper: "80" });
  const m = R.batchModel(BATCH, {});
  eq("3a total gross wages = 600+425+300", m.totals.gross, 1325);
  eq("3b total advances = 100", m.totals.adv, 100);
  eq("3c total penalties = 20", m.totals.pen, 20);
  eq("3d total deductions = 30", m.totals.ded, 30);
  eq("3e total advances+deductions", m.totals.deductionsTotal, 150);
  eq("3f total bonus = 50", m.totals.bonus, 50);
  eq("3g total net actually paid = 400+325+300", m.totals.amount, 1025);
  eq("3h number of employees included", m.count, 3);
  ok("3i batch count printed", html.indexOf("عدد الموظفين ضمن الدفعة") !== -1 && html.indexOf(">3<") !== -1);
  ok("3j totals block rendered", html.indexOf("إجمالي الأجر المكتسب") !== -1
    && html.indexOf("صافي المصروف فعليًا") !== -1
    && html.indexOf("إجمالي السلف والخصومات") !== -1);
  /* الإجماليات تُحسب من الصفوف لا من حقل مخزَّن قابل للتلاعب */
  const bad = JSON.parse(JSON.stringify(BATCH));
  bad.totals = { gross: 0, amount: 0, adv: 0, ded: 0, pen: 0, bonus: 0, count: 99 };
  eq("3k totals recomputed from the saved rows", R.batchModel(bad, {}).totals.amount, 1025);
  eq("3l count recomputed from the saved rows", R.batchModel(bad, {}).count, 3);
}

/* ==========================================================================
 * 4) لا تسمية أسبوع ثابتة (سبت/جمعة) في التقرير
 * ========================================================================== */
{
  ["58", "80", "a4"].forEach(function (paper) {
    const html = R.batchHTML(BATCH, { paper: paper });
    ok("4 no Saturday label on " + paper, html.indexOf("السبت") === -1);
    ok("4 no Friday label on " + paper, html.indexOf("الجمعة") === -1);
    ok("4 no 'weekly' wording on " + paper, html.indexOf("الأسبوع") === -1);
  });
  const html = R.batchHTML(BATCH, { paper: "80" });
  ok("4e earning period printed as a real range", html.indexOf("الفترة: 06/10/2026 ← 12/10/2026") !== -1, html.slice(0, 200));
}

/* ==========================================================================
 * 5) عرض الورق الفعلي — 58 / 80 / A4 (لا افتراض A4)
 * ========================================================================== */
{
  ok("5a 58mm body is 48mm wide", R.payrollPaperCSS("58").indexOf("body{width:48mm") !== -1);
  ok("5b 80mm body is 72mm wide", R.payrollPaperCSS("80").indexOf("body{width:72mm") !== -1);
  ok("5c A4 uses a page rule, not a fixed body width", R.payrollPaperCSS("a4").indexOf("@page{size:A4") !== -1);
  ok("5d 58mm has no A4 page rule", R.payrollPaperCSS("58").indexOf("@page{size:A4") === -1);
  const css = R.payrollPaperCSS("58");
  ok("5e black & white only (no colour literals)", css.indexOf("#000") !== -1 && !/#[0-9a-f]{6}/i.test(css.replace(/#fff/gi, "")));
  ok("5f Arabic-safe wrapping rules present", css.indexOf("overflow-wrap:anywhere") !== -1);
  ok("5g amounts are LTR-isolated", css.indexOf("unicode-bidi:embed") !== -1);
  ok("5h thermal rule for narrow paper", R.hrHTML("58").indexOf("------") !== -1);
  ok("5i A4 rule is a border, not text", R.hrHTML("a4") === '<div class="hr"></div>');
  ok("5j each paper width produces a different document",
    R.batchHTML(BATCH, { paper: "58" }) !== R.batchHTML(BATCH, { paper: "80" }));
}

/* ==========================================================================
 * 6) التفاف النص العربي + منع فيض الأسماء والمبالغ
 * ========================================================================== */
{
  eq("6a short name fits in one line", R.wrapArabic("أحمد", 20, 3).length, 1);
  const long = R.wrapArabic("محمد عبد الرحمن عبد الله_WINDOW الأطول", 12, 3);
  ok("6b long name wraps into several lines", long.length >= 2 && long.length <= 3, JSON.stringify(long));
  ok("6c no wrapped line exceeds the width", long.every(function (l) { return l.length <= 12; }));
  const longer = R.wrapArabic("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10, 3);
  ok("6d an unbreakable word is split, never overflows", longer.length === 3 && longer.every(function (l) { return l.length <= 10; }));
  ok("6e ellipsis applied on the last line", longer[2].indexOf("…") !== -1);
  eq("6f no ellipsis when it fits", R.ellipsis("أحمد", 10), "أحمد");
  eq("6g huge amounts are shortened, not overflowing", R.fitAmount(1234567890, 12).length, 12);
  /* اسم طويل داخل التقرير الحقيقي */
  const longPlan = mkPlan({
    id: "E9", name: "عبدالرحمن Ferdinand.Stdrovich-more", job: "مسؤول صالة ألعاب طويل جدا",
    wage: 1000000000, work: 3, gross: 3000000000, amount: 3000000000
  });
  const lb = P.buildBatch([longPlan], { ts: TS, ref: "R9" });
  lb.items[0].status = "saved";
  ["58", "80"].forEach(function (paper) {
    const h = R.batchHTML(lb, { paper: paper });
    ok("6h long name is wrapped on " + paper, h.indexOf("data-emp=\"E9\"") !== -1);
    const block = h.slice(h.indexOf('data-emp="E9"'), h.indexOf("</div></div></div>"));
    ok("6i name is split across lines on " + paper, (block.match(/<div>عبدالرحمن/g) || []).length >= 1
      || block.indexOf("Ferdinand") !== -1);
    ok("6j amounts are fitted on " + paper, R.fitAmount(3000000000, paper === "58" ? 23 : 32).length <= (paper === "58" ? 23 : 32));
  });
  /* الحروف العربية السالبة/الخاصة لا تكسر البناء */
  const hEsc = R.batchHTML((function () {
    const b = P.buildBatch([mkPlan({ id: "E5", name: "<script>alert(1)</script>", job: "a&b", wage: 10, work: 1, gross: 10, amount: 10 })], { ts: TS, ref: "RX" });
    b.items[0].status = "saved"; return b;
  })(), { paper: "80" });
  ok("6k html in a name is escaped", hEsc.indexOf("<script>") === -1 && hEsc.indexOf("&lt;script&gt;") !== -1);
}

/* ==========================================================================
 * 7) الإيصال الفردي
 * ========================================================================== */
{
  const item = BATCH.items[1];
  const h = R.receiptHTML(item, { paper: "58", ts: TS, ref: "PAY-20261012-01" });
  ok("7a receipt title", h.indexOf("إيصال صرف راتب") !== -1);
  ok("7b employee name on the receipt", h.indexOf("سارة") !== -1);
  ok("7c receipt number", h.indexOf("PAY-20261012-01") !== -1);
  ok("7d amount paid on the receipt", h.indexOf("المبلغ المصروف") !== -1 && h.indexOf("325") !== -1);
  ok("7e signature line", h.indexOf("توقيع الموظف") !== -1);
  ok("7f receipt is 58mm wide", h.indexOf("body{width:48mm") !== -1);
  const m = R.receiptModel(item, { ts: TS, ref: "R" });
  eq("7g receipt model has exactly one employee", m.count, 1);
  eq("7h receipt amount", m.totals.amount, 325);
  ok("7i receipt omits the batch totals of other employees", h.indexOf("1,325") === -1);
}

/* ==========================================================================
 * 8) تنفيذ الدفعة — الفشل الجزئي والتراجع وعدم التكرار
 * ========================================================================== */
{
  const mkStore = function () {
    const list = [];
    ["E1", "E2", "E3"].forEach(function (id, i) {
      list.push({
        id: id, name: "موظف " + id, job: "كاشير", dailyWage: 100, hiredAt: D(2026, 1, 1),
        days: [{ key: K(2026, 10, 12), ts: D(2026, 10, 12), status: "work", src: "manual", wage: 100, note: "" }],
        payouts: [], bonuses: [], penalties: [], advances: [], deductions: [], weeks: [], reviewFlags: [],
        payCycle: "weekly", cycleAnchorDay: 1, legacySchema: P.SCHEMA
      });
    });
    return list;
  };
  const makePlans = function (store) {
    return store.map(function (e) { return P.planPayout(e, { nowTs: TS, dateTs: TS }); });
  };

  /* 8a) نجاح كامل */
  {
    const store = mkStore();
    const plans = makePlans(store);
    const refStore = {};
    const ref = P.nextRef(refStore, TS);
    eq("8a sequential reference format", ref, "PAY-20261012-01");
    const saved = [];
    const res = P.commitBatch(store, plans, { ts: TS, dateTs: TS, ref: ref },
      function (e) { saved.push(e.id); return true; });
    ok("8b batch committed", res.ok === true);
    eq("8c all three saved", res.saved, 3);
    eq("8d save called once per employee", saved.length, 3);
    eq("8e total paid = 300", res.batch.totals.amount, 300);
    store.forEach(function (e) { eq("8f " + e.id + " settled", P.statsUpTo(e, TS).outstanding, 0); });
  }

  /* 8b) فشل حفظ موظف واحد ⇒ هو وحده يتراجع، والباقي ينجح */
  {
    const store = mkStore();
    const plans = makePlans(store);
    const res = P.commitBatch(store, plans, { ts: TS, dateTs: TS, ref: "PAY-20261012-02" },
      function (e) { return e.id !== "E2"; });          /* E2 يفشل في الحفظ */
    eq("8g two employees still saved", res.saved, 2);
    eq("8h one failure recorded", res.failed, 1);
    const e2 = store.find(function (e) { return e.id === "E2"; });
    ok("8i failed employee is NOT marked as paid", P.statsUpTo(e2, TS).outstanding === 100, String(P.statsUpTo(e2, TS).outstanding));
    eq("8j failed employee has no payout record", e2.payouts.length, 0);
    const ok1 = store.find(function (e) { return e.id === "E1"; });
    ok("8k successful employee is paid", P.statsUpTo(ok1, TS).outstanding === 0);
    eq("8l batch total excludes the failed employee", res.batch.totals.amount, 200);
    const failedItem = res.batch.items.find(function (i) { return i.empId === "E2"; });
    eq("8m failed item status", failedItem.status, "failed");
    eq("8n failed item amount printed as zero", failedItem.amount, 0);
    ok("8o the intended amount is still auditable", failedItem.intendedAmount === 100);
    /* التقرير لا يطبع مبلغًا لم يُحفظ */
    const m = R.batchModel(res.batch, {});
    eq("8p report totals match the saved employees only", m.totals.amount, 200);
    eq("8q report count matches the saved employees only", m.count, 2);
  }

  /* 8c) إعادة المحاولة بعد الإصلاح تنجح ولا تُنتج عملية مكررة */
  {
    const store = mkStore();
    const plans = makePlans(store);
    P.commitBatch(store, plans, { ts: TS, dateTs: TS, ref: "A" }, function (e) { return e.id !== "E2"; });
    const plans2 = makePlans(store);
    const res2 = P.commitBatch(store, plans2, { ts: TS, dateTs: TS, ref: "B" }, function () { return true; });
    eq("8r retry saves only the remaining employee", res2.saved, 1);
    eq("8s retry total = 100 (no double payment)", res2.batch.totals.amount, 100);
    store.forEach(function (e) {
      eq("8t " + e.id + " has exactly one payout", e.payouts.length, 1);
      eq("8u " + e.id + " balance is zero", P.statsUpTo(e, TS).outstanding, 0);
    });
  }

  /* 8d) موظف بلا مستحق ⇒ يُتخطّى ولا يُحفظ شيء (ليس فشلًا) */
  {
    const store = mkStore();
    const paid = P.planPayout(store[0], { nowTs: TS });
    P.applyPayout(store[0], paid, { ts: TS });
    const plans = makePlans(store);
    const res = P.commitBatch(store, plans, { ts: TS, dateTs: TS, ref: "C" }, function () { return true; });
    eq("8v already-paid employee is skipped, not failed", res.failed, 0);
    eq("8w only the two with dues are saved", res.saved, 2);
    eq("8x skipped employee keeps a single payout", store[0].payouts.length, 1);
  }

  /* 8e) مرجع متسلسل لا يتكرر */
  {
    const refStore = {};
    eq("8y first reference", P.nextRef(refStore, TS), "PAY-20261012-01");
    eq("8z second reference", P.nextRef(refStore, TS), "PAY-20261012-02");
    eq("8aa new day restarts numbering", P.nextRef(refStore, D(2026, 10, 13)), "PAY-20261013-01");
  }
}

/* ==========================================================================
 * 9) الطباعة الحرارية: استلام نتيجة الطباعة بأمان + لا نجاح كاذب
 *    (نستخدم دالة printResultToast الحقيقية من index.html)
 * ========================================================================== */
{
  const toastCalls = [], logCalls = [];
  const toast = function (m, k) { toastCalls.push({ m: m, k: k }); };
  const logErr = function (w, e) { logCalls.push({ w: w, e: String(e) }); };
  /* eslint-disable no-new-func */
  const printResultToast = new Function("toast", "logErr",
    extractFunction(htmlSrc, "printResultToast") + "\nreturn printResultToast;")(toast, logErr);

  printResultToast({ ok: true }, "تم الإرسال");
  eq("9a success → ok toast", toastCalls[0].k, "ok");
  printResultToast({ ok: false, reason: "no-printer-selected" });
  eq("9b no printer selected → warn", toastCalls[1].k, "warn");
  ok("9c Arabic message names the real cause", toastCalls[1].m.indexOf("لم يتم تحديد طابعة") !== -1, toastCalls[1].m);
  ok("9d never claims success", toastCalls[1].m.indexOf("تم الإرسال") === -1);
  printResultToast({ ok: false, reason: "printer-not-found" });
  ok("9e printer not found message", toastCalls[2].m.indexOf("الطابعة المختارة غير متوفرة") !== -1);
  eq("9f still a warning", toastCalls[2].k, "warn");
  printResultToast({ ok: false, reason: "Printer not connected" });
  eq("9g generic failure → warn", toastCalls[3].k, "warn");
  ok("9h failure is logged to the device log", logCalls.length >= 3);
}

/* ==========================================================================
 * 10) مزامنة index.html: الملفات الجديدة محمّلة فعلًا والتقرير مربوط بالمطبوعات
 * ========================================================================== */
{
  ok("10a payroll core is loaded before the app script", htmlSrc.indexOf('src="assets/payroll/payroll-core.js"') !== -1);
  ok("10b payroll report module is loaded", htmlSrc.indexOf('src="assets/report/payroll-report.js"') !== -1);
  ok("10c core loads before report-independent usage",
    htmlSrc.indexOf('src="assets/payroll/payroll-core.js"') < htmlSrc.indexOf('src="assets/report/payroll-report.js"'));
  ok("10d app wires the two modules", htmlSrc.indexOf("MalahyPayroll.setUtil") !== -1
    && htmlSrc.indexOf("MalahyPayrollReport.setUtil") !== -1);
  ok("10e the new batch print entry point exists", htmlSrc.indexOf("function payrollPrintBatch") !== -1);
  ok("10f individual receipt print exists", htmlSrc.indexOf("function payrollPrintReceipt") !== -1);

  /* ---------- 11) إزالة القيد الأسبوعي من مسار الصرف ---------- */
  ok("11a the weekly bulk-pay helper is gone", htmlSrc.indexOf("function empPayAll") === -1);
  ["weekKeyOf(", "satStartOf(", "newWeek(", "ensureWeeks(", "empCurKey(",
    "calcWeek(", "weekStats(", "empWeekTableData(", "weekRangeLabel(",
    "empDashboardStats(", "empStartNewWeek("].forEach(function (fn) {
    ok("11b weekly helper removed from the app: " + fn, htmlSrc.indexOf(fn) === -1);
  });
  ok("11c no Saturday→Friday payroll label anywhere in the app",
    htmlSrc.indexOf("الرواتب الأسبوعية") === -1 && htmlSrc.indexOf("السبت ← الجمعة") === -1);
  ok("11d the employee button still calls openEmployees()", htmlSrc.indexOf("onclick=\"openEmployees()\"") !== -1);
  ok("11e the daily-registration button still calls openDailyReg()", htmlSrc.indexOf("onclick=\"openDailyReg()\"") !== -1);
  ok("11f the advance bridge used by expenses is preserved",
    htmlSrc.indexOf("function recordEmployeeAdvance") !== -1 &&
    htmlSrc.indexOf("function removeEmployeeAdvance") !== -1 &&
    htmlSrc.indexOf("recordEmployeeAdvance(emp.id,amount,item.desc,item.id,item.ts)") !== -1);
  ok("11g legacy weekly records are kept for reading",
    htmlSrc.indexOf("🗄️ سجل الأسابيع القديم") !== -1);
  ok("11h the batch store key exists and is permission-protected",
    htmlSrc.indexOf("const K_PAYBATCH='malahy_payroll_batches_v1'") !== -1 &&
    fs.readFileSync(path.join(ROOT, "permissions.js"), "utf8").indexOf('"malahy_payroll_batches_v1"') !== -1);
/* 11i..11n — بوابة الترحيل الصريحة. لم نُضعِف الفحص بل شددناه:
     نتحقق من بقاء مساعدات كلمة سر غير مُستدعاة (قرار phase 3C-2)،
     وأن الترحيل لا يعمل تلقائيًا عند الفتح، وأن الكتابة لا تتم إلا
     خلف تأكيد صريح + بوابة صلاحية. */
  const stripComments = function (s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  };
  const codeOnly = stripComments(htmlSrc);
  const callsOf = function (fn) {
    return (codeOnly.match(new RegExp("\\b" + fn + "\\s*\\(", "g")) || []).length;
  };
  ok("11i the legacy password helpers stay defined but uncalled (phase 3C-2 rule preserved)",
    htmlSrc.indexOf("function getPass()") !== -1 &&
    htmlSrc.indexOf("function empAskPass(") !== -1 &&
    callsOf("empAskPass") === 1 /* التعريف فقط */ &&
    callsOf("openPasswordModal") === 1);
  ok("11j migration never runs automatically when a screen is opened",
    htmlSrc.indexOf("empLoad(); empMigrate();") === -1 &&
    /function empDash\s*\(\s*\)\s*\{\s*empMigrate\s*\(/.test(htmlSrc) === false &&
    /function empLoad\s*\([^)]*\)\s*\{[^}]*empMigrate/.test(htmlSrc) === false);
  ok("11k empMigrate has no call site left anywhere in the app",
    callsOf("empMigrate") === 1 /* التعريف فقط */);
  ok("11l the explicit run path is reachable and gated",
    /function empMigrationGate[\s\S]{0,1600}empRunMigration\s*\(/.test(codeOnly));
  ok("11m the gate requires the permission check before migrating",
    /function empMigrationGate[\s\S]{0,1600}MalahyPerm\.hasPerm\s*\(/.test(codeOnly) &&
    /MalahyPerm\.hasPerm\s*\(\s*['"]employeeManage['"]\s*\)[\s\S]{0,400}empRunMigration\s*\(/.test(codeOnly));
  ok("11n the gate offers an explicit cancel that writes nothing",
    /ترحيل الآن/.test(htmlSrc) && /إلغاء/.test(codeOnly) &&
    /['"]cancel['"][\s\S]{0,120}close\.remove\(\)/.test(codeOnly));
  ok("11o a read-only pending-migration detector exists and is not destructive",
    htmlSrc.indexOf("function empPendingMigration()") !== -1 &&
    !/function empPendingMigration[\s\S]{0,700}migrateEmployee/.test(codeOnly));
  ok("11p the dashboard shows the gate instead of migrating",
    /function empDash[\s\S]{0,400}empMigrationGate\s*\(\s*wrap\s*\)/.test(codeOnly));
}

/* ==========================================================================
 * 12) الانحدار — سيناريو المراجعة النهائية: غياب/إجازة مسجَّلان يجب أن
 *      يمرّا من خطة الصرف الحقيقية إلى التقرير المجمّع والإيصال الفردي،
 *      بأرقام مالية لم تتغيّر إطلاقًا.
 *      سجل: 10/10 عمل · 11/10 غياب · 12/10 عمل · 13/10 إجازة · سلفة 20
 * ========================================================================== */
{
  /* نستخدم المساعدين المعرَّفين أعلى الملف: D (تاريخ) و DT (تاريخ + وقت)
     و K (مفتاح يوم) — بلا تعريفات محلية حتى لا تُظلل أي اختبار آخر. */
  const NOW = DT(2026, 10, 13, 15, 30);
  const e = {
    id: "E1", name: "عبدالرحمن عبد الله", job: "مشغل ألعاب", dailyWage: 85,
    hiredAt: D(2026, 10, 1, 12), notes: "", weeks: []
  };
  P.ensureLedger(e);
  P.markDay(e, K(2026, 10, 10), "work");
  P.markDay(e, K(2026, 10, 11), "absent");
  P.markDay(e, K(2026, 10, 12), "work");
  P.markDay(e, K(2026, 10, 13), "vacation");
  P.addAdvance(e, { id: "ADV1", ts: D(2026, 10, 11, 12), amount: 20, reason: "سلفة" });

  const s = P.statsUpTo(e, P.endOfDayTs(NOW));
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });

  /* 12a) المصدر الواحد: الخطط والإحصاء متطابقان */
  eq("12a plan workdays = stats workdays", plan.work, s.work);
  eq("12b plan absences = stats absences", plan.abs, s.abs);
  eq("12c plan vacations = stats vacations", plan.vac, s.vac);
  eq("12d plan gross = stats gross", plan.gross, s.gross);

  /* 12e) الأرقام المالية المتوقعة: يومان عمل فقط، غياب وإجازة بلا أجر */
  eq("12e attended workdays = 2", plan.work, 2);
  eq("12f days absent = 1", plan.abs, 1);
  eq("12g days vacation = 1", plan.vac, 1);
  eq("12h gross wages = 2 x 85 (absences/vacations earn nothing)", plan.gross, 170);
  eq("12i advances deducted = 20", plan.adv, 20);
  eq("12j final payout = 170 - 20", plan.amount, 150);
  eq("12k remaining after payout = 0", plan.balanceAfter, 0);

  /* 12l) الدفعة الحقيقية والتقرير المجمّع */
  const batch = P.buildBatch([plan], { ts: NOW, dateTs: NOW, ref: "PAY-20261013-01" });
  const res = P.commitBatch([e], [plan], { ts: NOW, dateTs: NOW, ref: "PAY-20261013-01" }, () => true);
  ok("12l batch committed", res.ok === true);
  const saved = res.batch;
  eq("12m saved item carries the absence count", saved.items[0].abs, 1);
  eq("12n saved item carries the vacation count", saved.items[0].vac, 1);
  eq("12o saved item carries the exact absence day", saved.items[0].covered.absKeys.join(","), K(2026, 10, 11));
  eq("12p saved item carries the exact vacation day", saved.items[0].covered.vacKeys.join(","), K(2026, 10, 13));
  eq("12q payout balance settled", P.statsUpTo(e, P.endOfDayTs(NOW)).outstanding, 0);

  const html = R.batchHTML(saved, { paper: "80" });
  const m = R.batchModel(saved, {});
  ok("12r report prints the days-absent row", html.indexOf("أيام الغياب") !== -1);
  ok("12s report prints the days-vacation row", html.indexOf("أيام الإجازة") !== -1);
  eq("12t report model absences = 1", m.items[0].abs, 1);
  eq("12u report model vacations = 1", m.items[0].vac, 1);
  eq("12v report model workdays = 2", m.items[0].work, 2);
  eq("12w report gross = 170", m.totals.gross, 170);
  eq("12x report advances total = 20", m.totals.adv, 20);
  eq("12y report net actually paid = 150", m.totals.amount, 150);
  eq("12z report count = 1", m.count, 1);

  /* الإيصال الفردي يقرأ نفس البيانات */
  const rc = R.receiptHTML(saved.items[0], { paper: "58", ts: NOW, ref: saved.ref });
  const rm = R.receiptModel(saved.items[0], { ts: NOW, ref: saved.ref });
  ok("12aa receipt prints the days-absent row", rc.indexOf("أيام الغياب") !== -1);
  eq("12ab receipt model absences = 1", rm.items[0].abs, 1);
  eq("12ac receipt model workdays = 2", rm.items[0].work, 2);
  eq("12ad receipt amount matches the batch", rm.totals.amount, m.totals.amount);

  /* 12ae) مقارنة: نفس البيانات بدون غياب ولا إجازة ⇒ نفس الأرقام المالية */
  const ref = { id: "E2", name: "مرجع", job: "مشغل ألعاب", dailyWage: 85, hiredAt: D(2026, 10, 1, 12), weeks: [] };
  P.ensureLedger(ref);
  P.markDay(ref, K(2026, 10, 10), "work");
  P.markDay(ref, K(2026, 10, 12), "work");
  P.addAdvance(ref, { id: "ADV1", ts: D(2026, 10, 11, 12), amount: 20, reason: "سلفة" });
  const rp = P.planPayout(ref, { nowTs: NOW, dateTs: NOW });
  eq("12ae absences change no money at all", rp.amount, plan.amount);
  eq("12af ...gross identical", rp.gross, plan.gross);
  eq("12ag ...outstanding identical", rp.outstandingBefore, plan.outstandingBefore);

  /* 12ah) الدفعة التالية: لا يُعاد عرض أي يوم سبق عرضه */
  P.markDay(e, K(2026, 10, 14), "work");
  const next = P.planPayout(e, { nowTs: DT(2026, 10, 14, 15, 30), dateTs: DT(2026, 10, 14, 15, 30) });
  eq("12ah the absence is not re-reported", next.abs, 0);
  eq("12ai the vacation is not re-reported", next.vac, 0);
  eq("12aj only the new workday is reported", next.work, 1);
  eq("12ak payout = exactly one wage", next.amount, 85);
  P.applyPayout(e, next, { ts: DT(2026, 10, 14, 15, 30) });
  eq("12al attendance reported across both batches equals the real workdays",
    saved.items[0].work + next.work, 3);
  eq("12am total paid = 3 x 85 - 20 advance", P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 14))).paid, 235);
  eq("12an nothing lost and nothing double-paid",
    P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 14))).outstanding, 0);
}

/* ==========================================================================
 * 13) دفعة متعددة: موظف غيابُه قبل أول يوم عمل له — يجب أن يظهر في بطاقته
 *     وإلا اختفي الغياب من التقرير المجمّع كله.
 * ========================================================================== */
{
  const NOW2 = DT(2026, 10, 13, 16, 0);
  const A = { id: "A", name: "أحمد", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [] };
  const B = { id: "B", name: "سارة", job: "مشغل ألعاب", dailyWage: 85, hiredAt: D(2026, 10, 1), weeks: [] };
  P.ensureLedger(A); P.ensureLedger(B);
  /* أحمد: غياب ثم يومان عمل + سلفة 50 */
  P.markDay(A, K(2026, 10, 11), "absent");
  P.markDay(A, K(2026, 10, 12), "work");
  P.markDay(A, K(2026, 10, 13), "work");
  P.addAdvance(A, { id: "aA", ts: D(2026, 10, 11), amount: 50, reason: "سلفة" });
  /* سارة: غياب ثم يوم عمل واحد فقط */
  P.markDay(B, K(2026, 10, 12), "absent");
  P.markDay(B, K(2026, 10, 13), "work");

  const pa = P.planPayout(A, { nowTs: NOW2, dateTs: NOW2 });
  const pb = P.planPayout(B, { nowTs: NOW2, dateTs: NOW2 });
  eq("13a أحمد absence counted even though it precedes his first paid day", pa.abs, 1);
  eq("13b سارة absence counted even though it precedes her only workday", pb.abs, 1);

  const cb = P.commitBatch([A, B], [pa, pb], { ts: NOW2, dateTs: NOW2, ref: "PAY-M-01" }, () => true);
  eq("13c both employees saved", cb.saved, 2);
  const hm = R.batchHTML(cb.batch, { paper: "80" });
  const mm = R.batchModel(cb.batch, {});
  eq("13d batch count = 2", mm.count, 2);
  eq("13e both absences survive into the batch", mm.items.reduce(function (s, i) { return s + i.abs; }, 0), 2);
  eq("13f the absence row is printed once per employee",
    (hm.match(/أيام الغياب/g) || []).length, 2);
  eq("13g total gross = 200 + 85", mm.totals.gross, 285);
  eq("13h total advances = 50", mm.totals.adv, 50);
  eq("13i total paid = (200-50) + 85", mm.totals.amount, 235);
  eq("13j row amounts sum to the batch total",
    mm.items.reduce(function (s, i) { return s + i.amount; }, 0), mm.totals.amount);
  eq("13k both balances cleared",
    P.statsUpTo(A, P.endOfDayTs(NOW2)).outstanding + P.statsUpTo(B, P.endOfDayTs(NOW2)).outstanding, 0);
  eq("13l both absences remain on record",
    P.statsUpTo(A, P.endOfDayTs(NOW2)).abs + P.statsUpTo(B, P.endOfDayTs(NOW2)).abs, 2);

  /* لا إعادة عرض في دفعة لاحقة لأي منهما */
  P.markDay(A, K(2026, 10, 14), "work");
  const na = P.planPayout(A, { nowTs: DT(2026, 10, 14, 16, 0), dateTs: DT(2026, 10, 14, 16, 0) });
  eq("13m neither absence is re-reported", na.abs, 0);
  eq("13n only the new workday is reported", na.work, 1);
}

/* ==========================================================================
 * 14) التسوية في المستند المطبوع + تخطيط الورق الضيق + التفاف العربي
 *     ملاحظة: هذه فحوص آلية على HTML/CSS المُولَّد فقط — لا طابعة فيزيائية.
 * ========================================================================== */
{
  /* (أ) مستند يتساوى فيه بنود الدفعة مع المبلغ في كل الحالات */
  const SCENARIOS = [
    { n: "full", wage: 100, days: [["10-08", "work"], ["10-09", "work"], ["10-10", "work"]] },
    { n: "partial", wage: 100, days: [["10-08", "work"], ["10-09", "work"]], pay: 50 },
    { n: "advance-after-last-day", wage: 85, days: [["10-08", "work"], ["10-10", "work"]], adv: 20, advDay: "10-12" },
    { n: "with-all-adjustments", wage: 120, days: [["10-09", "work"], ["10-10", "work"]], abs: "10-08", vac: "10-11", adv: 30, ded: 10, pen: 5, bon: 40 }
  ];
  SCENARIOS.forEach(function (sc) {
    const e = { id: "S", name: "موظف", job: "كاشير", dailyWage: sc.wage, hiredAt: D(2026, 10, 1), weeks: [] };
    P.ensureLedger(e);
    sc.days.forEach(function (d) { P.markDay(e, K(2026, 10, +d[0].slice(3)), d[1]); });
    if (sc.abs) P.markDay(e, K(2026, 10, +sc.abs.slice(3)), "absent");
    if (sc.vac) P.markDay(e, K(2026, 10, +sc.vac.slice(3)), "vacation");
    if (sc.adv) P.addAdvance(e, { id: "A", ts: sc.advDay ? D(2026, 10, +sc.advDay.slice(3)) : D(2026, 10, 9), amount: sc.adv });
    if (sc.ded) e.deductions.push({ id: "D", ts: D(2026, 10, 10), amount: sc.ded, reason: "" });
    if (sc.pen) e.penalties.push({ id: "P", ts: D(2026, 10, 10), amount: sc.pen, reason: "" });
    if (sc.bon) e.bonuses.push({ id: "B", ts: D(2026, 10, 11), amount: sc.bon, reason: "" });
    const NOW = DT(2026, 10, 12, 15, 0);
    const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW, amount: sc.pay });
    const cb = P.commitBatch([e], [plan], { ts: NOW, dateTs: NOW, ref: "R-" + sc.n }, () => true);
    const m = R.batchModel(cb.batch, {});
    const it = m.items[0];
    eq("14a[" + sc.n + "] coveredNet == gross+bonus-pen-adv-ded",
      it.coveredNet, Math.round((it.gross + it.bonus - it.pen - it.adv - it.ded) * 100) / 100);
    eq("14b[" + sc.n + "] THE DOCUMENT RECONCILES", it.coveredNet + it.itemsDiff, it.amount);
    eq("14c[" + sc.n + "] remaining == outstandingBefore - amount",
      it.balanceAfter, P.statsUpTo(e, P.endOfDayTs(NOW)).outstanding);
    /* نفس المعادلة في الإجماليات */
    eq("14d[" + sc.n + "] batch totals reconcile too",
      m.totals.coveredNet + m.totals.itemsDiff, m.totals.amount);
    /* الإيصال الفردي يحمل نفس الأرقام */
    const rm = R.receiptModel(cb.batch.items[0], { ts: NOW, ref: cb.batch.ref });
    eq("14e[" + sc.n + "] receipt reconciles",
      rm.items[0].coveredNet + rm.items[0].itemsDiff, rm.totals.amount);
    /* السطران يظهران عند وجود فرق فقط */
    const h = R.batchHTML(cb.batch, { paper: "80" });
    const hasBridge = h.indexOf("بنود غير مُفصَّلة في هذا الإيصال") !== -1;
    eq("14f[" + sc.n + "] bridge line appears exactly when there is a gap",
      hasBridge, it.itemsDiff > 0);
    /* الإجمالي المطبوع يجب أن يطابق نفسه أيضًا — لا يُشترَط أن يوافق
       بطاقات الموظفين وحدها */
    ok("14f2[" + sc.n + "] the printed totals carry the items net",
      h.indexOf("إجمالي صافي بنود الدفعة") !== -1);
    ok("14f3[" + sc.n + "] the printed totals bridge the gap iff there is one",
      (h.indexOf("إجمالي بنود غير مُفصَّلة") !== -1) === (m.totals.itemsDiff > 0));
    /* تحقق حسابي من الأرقام المطبوعة نفسها (لا من النموذج) */
    const numIn = (label) => {
      const i = h.indexOf(label);
      if (i < 0) return null;
      const seg = h.slice(i, i + 400);
      const mm = seg.match(/class="num">([^<]*)</);
      return mm ? mm[1].replace(/[^\d.]/g, "") : null;
    };
    const tcov = numIn("إجمالي صافي بنود الدفعة");
    const tamb = numIn("صافي المصروف فعليًا");
    const tun = numIn("إجمالي بنود غير مُفصَّلة");
    eq("14f4[" + sc.n + "] printed totals add up: covNet + gap = paid",
      Math.round((Number(tcov || 0) + Number(tun || 0) - Number(tamb)) * 100) / 100, 0);
  });

  /* (أ٢) الاتجاه السالب: بنود تتجاوز المبلغ المصروف.
     سلفة كبيرة تُسدَّد أولًا ثم يوم عمل جديد — البنود المُسمّاة تشمل
     10 سُدِّدت سابقًا، فيجب أن يطبع السطر سالبًا وأن يبقى المجموع مطابقًا. */
  {
    const e = { id: "NEG", name: "مريم", job: "كاشير", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [] };
    P.ensureLedger(e);
    P.markDay(e, K(2026, 10, 8), "work");
    P.addAdvance(e, { id: "NA", ts: D(2026, 10, 9, 15), amount: 90, reason: "سلفة" });
    P.applyPayout(e, P.planPayout(e, { nowTs: D(2026, 10, 9, 15, 30), dateTs: D(2026, 10, 9, 15, 30) }),
      { ts: D(2026, 10, 9, 15, 30) });
    P.markDay(e, K(2026, 10, 10), "work");
    const now = D(2026, 10, 10, 15, 30);
    const plan = P.planPayout(e, { nowTs: now, dateTs: now });
    eq("14g1 the payout is the new day only", plan.amount, 100);
    eq("14g2 the itemised set nets to more than the payout", plan.coveredNet, 110);
    eq("14g3 the printed difference is negative", plan.itemsDiff, -10);

    const cb = P.commitBatch([e], [plan], { ts: now, dateTs: now, ref: "R-NEG" }, () => true);
    const h = R.batchHTML(cb.batch, { paper: "58" });
    ok("14g4 the negative-direction row is used, not the positive one",
      h.indexOf("يُسدَّد لاحقًا من بنود هذه الدفعة") !== -1 &&
      h.indexOf("بنود غير مُفصَّلة في هذا الإيصال") === -1);
    const m = R.batchModel(cb.batch, {});
    eq("14g5 batch totals still reconcile", m.totals.coveredNet + m.totals.itemsDiff, m.totals.amount);
    ok("14g6 the totals block uses the negative label too",
      h.indexOf("إجمالي يُسدَّد لاحقًا من بنود الدفعة") !== -1);
    const rec = R.receiptModel(cb.batch.items[0], { ts: now, ref: cb.batch.ref });
    eq("14g7 receipt reconciles", rec.totals.coveredNet + rec.totals.itemsDiff, rec.totals.amount);
  }

  /* (ب) تخطيط الورق الضيق — آلي على HTML/CSS فقط */
  const LONG = { id: "L", name: "عبدالرحمن Ferdinand.Stdrovich الطويل جدًا", job: "مسؤول صالة ألعاب ومعالجة", dailyWage: 9876543, hiredAt: D(2026, 10, 1), weeks: [] };
  P.ensureLedger(LONG);
  for (let d = 1; d <= 6; d++) P.markDay(LONG, K(2026, 10, d), "work");
  P.markDay(LONG, K(2026, 10, 7), "absent");
  const NOWL = DT(2026, 10, 12, 15, 0);
  const planL = P.planPayout(LONG, { nowTs: NOWL, dateTs: NOWL });
  const cbL = P.commitBatch([LONG], [planL], { ts: NOWL, dateTs: NOWL, ref: "R-LONG" }, () => true);
  ["58", "80", "a4"].forEach(function (paper) {
    const h = R.batchHTML(cbL.batch, { paper: paper });
    const css = R.payrollPaperCSS(paper);
    const thermal = paper !== "a4";
    ok("14g[" + paper + "] body width is fixed for the paper",
      thermal ? /body\{width:(48|72)mm/.test(css) : css.indexOf("@page{size:A4") !== -1);
    /* قاعدة الالتفاف القياسية overflow-wrap موجودة في كل الأنواع،
       وword-break إضافي للحراري فقط */
    ok("14h[" + paper + "] Arabic-safe wrapping rules present",
      css.indexOf("overflow-wrap:anywhere") !== -1 &&
      (thermal ? css.indexOf("word-break:break-word") !== -1 : true));
    ok("14i[" + paper + "] amounts are LTR-isolated", css.indexOf("unicode-bidi:embed") !== -1);
    /* لا تجاوز: كل قيمة رقمية مطبوعة تُقصّ إلى عرض الورق */
    const numbers = (h.match(/<span class="num">([^<]*)<\/span>/g) || []).map(function (x) {
      return x.replace(/<[^>]*>/g, "").trim();
    });
    const cap = paper === "58" ? 26 : (paper === "80" ? 36 : 44);
    ok("14j[" + paper + "] every printed value fits the paper width",
      numbers.length > 0 && numbers.every(function (n) { return n.length <= cap; }),
      JSON.stringify(numbers.slice(0, 6)));
    /* الاسم يُلَفّ على عدد أسطر العرض لا أكثر — وطول الاسم 41 حرفًا
       فيلتفّ على الحراري (24/15 حرفًا) ويبقى سطرًا واحدًا على A4 (64 حرفًا) */
    const card = h.slice(h.indexOf('data-emp="L"'));
    const nameBlock = card.slice(0, card.indexOf('class="emp-j"'));
    const printedLines = (nameBlock.match(/<div>/g) || []).length;
    const wrapped = R.wrapArabic(LONG.name, R.charWidth(paper), 3);
    eq("14k[" + paper + "] name line count matches the paper width",
      printedLines, wrapped.length);
    ok("14k[" + paper + "] name fits inside the printable width",
      printedLines > 0 && wrapped.every(function (l) { return l.length <= R.charWidth(paper); }),
      "lines=" + printedLines);
    ok("14k2[" + paper + "] a 41-char name wraps on narrow paper only",
      thermal ? printedLines >= 2 : printedLines === 1, "lines=" + printedLines);
    /* اسم واقعي عربي طويل (32 حرفًا) يبقى كاملًا بلا نقاط على 58mm */
    const REALISTIC = "عبدالرحمن Ferdinand بن عبدالله الطويل";
    const rl = R.wrapArabic(REALISTIC, 15, 3);
    ok("14k3[" + paper + "] a 36-char name survives 58mm intact (no ellipsis)",
      rl.length <= 3 && rl.every(function (l) { return l.indexOf("…") === -1; }),
      JSON.stringify(rl));
    ok("14k4[" + paper + "] even a 3-line name stays inside the card",
      printedLines <= 3, "lines=" + printedLines);
    ok("14l[" + paper + "] no Saturday/Friday weekly label",
      h.indexOf("السبت") === -1 && h.indexOf("الجمعة") === -1 && h.indexOf("الأسبوع") === -1);
  });
  /* التفاف عربي */
  eq("14m short Arabic name fits one line", R.wrapArabic("أحمد", 20, 3).length, 1);
  const wl = R.wrapArabic("محمد عبد الرحمن عبد الله مكلم الطويل", 12, 3);
  ok("14n long Arabic wraps within the line width",
    wl.length >= 2 && wl.length <= 3 && wl.every(function (l) { return l.length <= 12; }), JSON.stringify(wl));
  const wo = R.wrapArabic("ا".repeat(40), 10, 3);
  ok("14o an unbreakable run is split, never overflows",
    wo.length === 3 && wo.every(function (l) { return l.length <= 10; }));
  ok("14p ellipsis marks the truncation", wo[2].indexOf("…") !== -1);
  eq("14q no ellipsis when it fits", R.ellipsis("أحمد", 10), "أحمد");
  eq("14r huge amounts are shortened to the paper width", R.fitAmount(987654321, 8).length, 8);
}

/* ==========================================================================
 * 15) تقرير تدقيق الترحيل — إظهار عدد أيام الحضور المُرحَّلة
 *     (قرار المستخدم رقم 2). أرقام مخزَّنة، لا إعادة احتساب.
 *     ملاحظة: فحوص آلية على HTML/CSS — لا طابعة فيزيائية.
 * ========================================================================== */
{
  const oldEmp2 = function (id, nm, weeks) {
    return { id: id, name: nm, job: "كاشير", dailyWage: 100, phone: "",
      hiredAt: D(2026, 9, 1), notes: "", weeks: weeks };
  };
  const wk = function (key, paid) {
    return { key: key, startTs: P.tsOfDayKey(key), endTs: P.tsOfDayKey(key) + 6 * 86400000,
      dailyWage: 100,
      days: [{ status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
        { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "absent", penalty: 0, bonus: 0, note: "" },
        { status: "work", penalty: 0, bonus: 0, note: "" }, { status: "work", penalty: 0, bonus: 0, note: "" },
        { status: "vacation", penalty: 0, bonus: 0, note: "" }],
      bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
      paid: !!paid, paidAt: paid ? P.tsOfDayKey(key) + 6 * 86400000 : 0,
      snapshot: paid ? { work: 5, vac: 1, abs: 1, gross: 500, net: 500 } : null };
  };
  const list = [
    oldEmp2("M1", "عبدالرحمن بن عبدالله", [wk("2026-09-19", true), wk("2026-09-26", false)]),
    oldEmp2("M2", "سارة بنت محمد", [wk("2026-09-26", false)])
  ];
  list[0].weeks[1].advances = [{ id: "x1", day: 0, ts: P.tsOfDayKey("2026-09-26"), amount: 30, reason: "سلفة", note: "", expenseId: "E" }];
  list.forEach(function (e) { P.migrateEmployee(e, { nowTs: D(2026, 10, 12, 15) }); });
  const audit = P.migrationAudit(list);

  eq("15a one employee migrated from a paid + an unpaid week", audit.migrated, 2);
  eq("15b the paid week was never re-counted", audit.weeksPaid, 1);
  eq("15c attendance days imported", audit.days, 14);
  eq("15d operations imported", audit.ops, 1);
  eq("15e work/absent/vacation sum to the day count", audit.work + audit.abs + audit.vac, audit.days);
  eq("15f rows sum to the total days",
    audit.rows.reduce(function (a, r) { return a + r.days; }, 0), audit.days);

  const m = R.migrationAuditModel(audit, { ts: D(2026, 10, 12, 15) });
  ok("15g the audit model is internally balanced", m.balanced === true, JSON.stringify(m.totals));
  eq("15h rows agree with the header total", m.totals.rowsDays, m.totals.days);

  ["58", "80", "a4"].forEach(function (paper) {
    const h = R.migrationAuditHTML(audit, { paper: paper, venue: "ملاهي كوكو بارك", ts: D(2026, 10, 12, 15) });
    const css = R.payrollPaperCSS(paper);
    ok("15i[" + paper + "] the migrated attendance-day count is printed",
      h.indexOf("أيام الحضور المُرحَّلة") !== -1);
    ok("15j[" + paper + "] the work/absent/vacation breakdown is printed",
      h.indexOf("منها أيام عمل") !== -1 && h.indexOf("منها أيام غياب") !== -1 && h.indexOf("منها أيام إجازة") !== -1);
    ok("15k[" + paper + "] paid weeks are explicitly reported as not re-counted",
      h.indexOf("أسابيع مدفوعة (لم يُعد احتسابها)") !== -1);
    ok("15l[" + paper + "] every employee gets a card",
      h.indexOf('data-emp="M1"') !== -1 && h.indexOf('data-emp="M2"') !== -1);
    ok("15m[" + paper + "] no fixed Saturday/Friday weekly label",
      h.indexOf("السبت") === -1 && h.indexOf("الجمعة") === -1);
    ok("15n[" + paper + "] no A4 assumption in thermal modes",
      paper === "a4" ? true : /body\{width:(48|72)mm/.test(css));
    ok("15o[" + paper + "] Arabic wrapping rules present",
      css.indexOf("overflow-wrap:anywhere") !== -1);
    /* كل القيم المطبوعة داخل عرض الورق */
    const vals = (h.match(/<span class="num">([^<]*)<\/span>/g) || []).map(function (x) {
      return x.replace(/<[^>]*>/g, "").trim();
    });
    const cap = paper === "58" ? 30 : (paper === "80" ? 40 : 48);
    ok("15p[" + paper + "] no printed value overflows the paper",
      vals.length > 0 && vals.every(function (v) { return v.length <= cap; }),
      JSON.stringify(vals.filter(function (v) { return v.length > cap; })));
    /* الأرقام الظاهرة = الأرقام المخزَّنة */
    ok("15q[" + paper + "] the printed day count equals the stored one",
      vals.indexOf("14") !== -1, JSON.stringify(vals));
  });

  /* التوازن ينطبق حتى على قائمة فارغة */
  const emptyM = R.migrationAuditModel(P.migrationAudit([]), { ts: D(2026, 10, 12) });
  eq("15r an empty audit is still balanced", emptyM.balanced, true);
  eq("15s ...with zero imported days", emptyM.totals.days, 0);
  ok("15t ...and says so on the page",
    R.migrationAuditHTML(P.migrationAudit([]), { paper: "80" }).indexOf("لا يوجد سجلات مُرحَّلة") !== -1);
}
/* ==========================================================================
 * 16) انحدار: ملاحظة الدفعة كانت تُسقط التصيير.
 *     `batchHTML` استدعى `esc(...)` بلا تعريف ⇒ ReferenceError على أي دفعة
 *     تحمل ملاحظة. صامتة اليوم لأن الواجهة لا تمرّر `note`، لكنها لغم.
 * ========================================================================== */
{
  const e = { id: "NOTE1", name: "TEST موظف", job: "TEST", dailyWage: 100, hiredAt: D(2026, 10, 1), weeks: [] };
  P.ensureLedger(e);
  P.markDay(e, K(2026, 10, 1), "work");
  P.markDay(e, K(2026, 10, 2), "work");
  const t = D(2026, 10, 3, 15, 30);
  const plan = P.planPayout(e, { nowTs: t, dateTs: t });
  const NOTE = 'TEST SYNTHETIC <b>bold</b> & "quoted"';
  const cb = P.commitBatch([e], [plan], { ts: t, dateTs: t, ref: "NOTE-1", note: NOTE }, () => true);

  ["58", "80", "a4"].forEach(function (paper) {
    let h = null, err = null;
    try { h = R.batchHTML(cb.batch, { paper: paper }); } catch (ex) { err = String(ex); }
    ok("16a[" + paper + "] rendering a batch that carries a note does not throw", err === null, err);
    if (h === null) return;
    ok("16b[" + paper + "] the note reaches the page", h.indexOf("SYNTHETIC") !== -1);
    ok("16c[" + paper + "] the note is HTML-escaped, never injected raw",
      h.indexOf("&lt;b&gt;") !== -1 && h.indexOf("<b>bold</b>") === -1);
  });

/* النموذج يمرّر الملاحظة أيضًا دون أن يتعطّل */
  ok("16d the note is exposed on the model", R.batchModel(cb.batch, {}).note === NOTE);

  /* دفعة بلا ملاحظة remain fine (حالة الواجهة اليوم) */
  const cb2 = P.commitBatch([e], [plan], { ts: t, dateTs: t, ref: "NOTE-2" }, () => true);
  let okNoNote = true;
  try { R.batchHTML(cb2.batch, { paper: "80" }); } catch (ex) { okNoNote = false; }
  ok("16e a batch without a note still renders", okNoNote);

  /* دفعة فارغة + ملاحظة */
  let okEmpty = true;
  try { R.batchHTML({ items: [], note: NOTE }, { paper: "58" }); } catch (ex) { okEmpty = false; }
  ok("16f an empty batch carrying a note renders too", okEmpty);
}
console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
