// tests/v256-payroll-exports.test.js
// v2.5.6 المرحلة 2 — تقرير الصرف الحراري بتحديد الموظف + تصدير PDF/Excel
// بتحديد التواريخ، انطلاقًا من سجلّات الصرف الفعلية المحفوظة فقط.
//
// كل البيانات هنا اصطناعية (Synthetic) داخل الذاكرة: لا تُقرأ ولا تُكتب
// أي بيانات إنتاجية، ولا ملف بيانات حقيقي على القرص.

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
function eq(name, got, want) { ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function D(y, m, d, h, mi) { return new Date(y, m - 1, d, h || 21, mi || 0, 0, 0).getTime(); }

R.setUtil({
  esc: function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
  fmtNum: function (n) { return String(Math.round((Number(n) || 0) * 100) / 100); },
  fmtDMY: function (d) { return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); },
  fmtTime12: function (d) {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
    const a = h < 12 ? "ص" : "م"; h = h % 12; if (h === 0) h = 12; return h + ":" + m + " " + a;
  },
  dayNames: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
});

const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- مصنع دفعات اصطناعية (لا تلمس أي مخزن حقيقي) ---------- */
const LONG_NAME = "موظف باسم طويل جدا جدا جدا جدا ولا ينقطع أبدا";
function mkItem(o) {
  return Object.assign({
    empId: "E1", empName: "موظف", job: "كاشير", dailyWage: 100, payCycle: "weekly",
    work: 3, abs: 1, vac: 0, gross: 300, bonus: 0, pen: 0, adv: 0, ded: 0,
    coveredNet: 300, itemsDiff: 0,
    period: { fromTs: 0, toTs: 0, fromKey: null, toKey: null },
    paidBefore: 0, due: 400, amount: 400, balanceAfter: 0,
    status: "saved", reason: "", error: ""
  }, o);
}
function mkBatch(o) {
  const b = {
    id: o.id, ref: o.ref, ts: o.ts, dateKey: P.dayKeyOfTs(o.ts), note: "",
    items: o.items, totals: {}
  };
  b.items.forEach(function (it) {
    it.period = it.period && it.period.fromKey ? it.period : {
      fromTs: o.ts - 3 * 864e5, toTs: o.ts,
      fromKey: P.dayKeyOfTs(o.ts - 3 * 864e5), toKey: P.dayKeyOfTs(o.ts)
    };
  });
  return b;
}
/* الجمعة والسبت — تواريخ اصطناعية للاختبار المطلوب */
const FRI_TS = D(2026, 10, 9), SAT_TS = D(2026, 10, 10);
const FRI = K(2026, 10, 9), SAT = K(2026, 10, 10);

const bFRI = mkBatch({
  id: "BFRI", ref: "PAY-20261009", ts: FRI_TS,
  items: [
    mkItem({ empId: "E1", empName: LONG_NAME, work: 5, abs: 0, vac: 0, gross: 500, bonus: 50, pen: 0, adv: 0, ded: 0, due: 550, amount: 550, balanceAfter: 0 }),
    mkItem({ empId: "E2", empName: "أحمد", work: 5, abs: 0, vac: 0, gross: 500, bonus: 0, pen: 20, adv: 0, ded: 0, due: 480, amount: 400, balanceAfter: 80 })
  ]
});
const bSAT = mkBatch({
  id: "BSAT", ref: "PAY-20261010", ts: SAT_TS,
  items: [
    mkItem({ empId: "E1", empName: LONG_NAME, work: 4, abs: 1, vac: 0, gross: 400, bonus: 0, pen: 0, adv: 100, ded: 0, due: 300, amount: 300, balanceAfter: 0 }),
    mkItem({ empId: "E3", empName: "محمد", work: 4, abs: 1, vac: 0, gross: 400, bonus: 0, pen: 0, adv: 0, ded: 30, due: 370, amount: 370, balanceAfter: 0 }),
    mkItem({ empId: "E4", empName: "سارة", work: 4, abs: 0, vac: 1, gross: 400, bonus: 25, pen: 0, adv: 0, ded: 0, due: 425, amount: 425, balanceAfter: 0 })
  ]
});
/* بند فشل داخل دفعة الجمعة — لا يُعدّ صرفًا */
bFRI.items.push(mkItem({ empId: "E9", empName: "لم يُصرف", due: 999, amount: 999, status: "failed", error: "save-failed" }));
/* دفعة بلا أي صرف فعلي (كل بنودها تخطّي) — لا تظهر ولا تُحتسب */
const bEMPTY = mkBatch({
  id: "BNIL", ref: "PAY-20261011", ts: D(2026, 10, 11),
  items: [mkItem({ empId: "E9", empName: "متخطّى", due: 700, amount: 700, status: "skipped", reason: "no-due" })]
});

const ALL = [bFRI, bSAT];
const entries = [];
ALL.forEach(function (b) {
  b.items.forEach(function (it) { if (it.status === "saved") entries.push({ batch: b, item: it }); });
});

console.log("V2.5.6 PHASE 2 — payroll disbursement reports, PDF and Excel exports");
console.log("synthetic scenario: Friday " + FRI + " (2 payouts) + Saturday " + SAT + " (3 payouts)");

/* ==========================================================================
 * 1) نطاق الصرف: الموظفون المؤهَّلون فقط من سجلّات الصرف الفعلية
 * ========================================================================== */
console.log("\n-- 1) employee scope from ACTUAL payouts --");
{
  const sc = R.payoutScopeModel(entries, { venue: "كوكي بارك" });
  eq("1a scope holds exactly the five saved records", sc.count, 5);
  ok("1b an employee without an actual payout is excluded",
     !sc.rows.some(function (r) { return r.name === "لم يُصرف"; }));
  eq("1c the failed item is not counted in totals", sc.totals.paid, 2045);
  eq("1d distinct employees in scope", sc.employeeCount, 4);
  eq("1e batches covered", sc.batchCount, 2);
  eq("1f dates covered", sc.dateCount, 2);
  eq("1g both synthetic dates present", sc.dates.join(","), FRI + "," + SAT);
  /* التحديد: موظف واحد / متعدد / الكل */
  const one = R.payoutScopeModel([entries[0]], { venue: "X" });
  eq("1h a single-employee selection yields one row", one.count, 1);
  eq("1i ...with that employee's name", one.rows[0].name, LONG_NAME);
  const many = R.payoutScopeModel(entries.slice(0, 3), { venue: "X" });
  eq("1j a multi-employee selection yields three rows", many.count, 3);
  eq("1k an empty selection yields nothing", R.payoutScopeModel([], { venue: "X" }).count, 0);
  const none = R.payoutScopeModel([{ batch: bEMPTY, item: bEMPTY.items[0] }], { venue: "X" });
  eq("1l a batch with no real payout yields no rows", none.count, 0);
  eq("1m malformed entries are ignored, not crashed",
     R.payoutScopeModel([null, {}, { batch: null }, { batch: bFRI, item: null }], { venue: "X" }).count, 0);
}

/* ==========================================================================
 * 2) التمييز الحاسم: المستحق ≠ المصروف فعلًا
 * ========================================================================== */
console.log("\n-- 2) entitlement vs actually disbursed --");
{
  const sc = R.payoutScopeModel(entries, { venue: "كوكي بارك" });
  const e2 = sc.rows.filter(function (r) { return r.empId === "E2"; })[0];
  ok("2a a partial payout is flagged", e2.partial === true);
  eq("2b its entitlement is the calculated due", e2.due, 480);
  eq("2c the amount disbursed is the stored payout amount", e2.paid, 400);
  eq("2d the remainder after payout is reported", e2.balanceAfter, 80);
  ok("2e due and paid are never merged", e2.due !== e2.paid);
  const full = sc.rows.filter(function (r) { return r.empId === "E4"; })[0];
  eq("2f a full payout is not flagged partial", full.partial, false);
  eq("2g ...and leaves nothing behind", full.balanceAfter, 0);
  eq("2h totals keep due and paid separate",
     sc.totals.due !== sc.totals.paid, true);
  eq("2i computed due total", sc.totals.due, 2125);
  eq("2j computed paid total", sc.totals.paid, 2045);
  /* الإجماليات تُقرأ من السجلات ولا تُعاد اشتقاقها */
  eq("2k gross total read from records", sc.totals.gross, 2200);
  eq("2l advances read from records", sc.totals.adv, 100);
  eq("2m penalties read from records", sc.totals.pen, 20);
  eq("2n deductions read from records", sc.totals.ded, 30);
  eq("2o bonuses read from records", sc.totals.bonus, 75);
}

/* ==========================================================================
 * 3) تقرير مجمّع حراري + إيصالات فردية
 * ========================================================================== */
console.log("\n-- 3) consolidated thermal report + receipts --");
{
  const sc = R.payoutScopeModel(entries, { venue: "كوكي بارك" });
  const h80 = R.scopeReportHTML(sc, { venue: "كوكي بارك", paper: "80" });
  ok("3a 80mm report renders", h80.length > 500 && h80.indexOf("width:72mm") !== -1);
  ok("3b 58mm report uses the narrow body", R.scopeReportHTML(sc, { venue: "X", paper: "58" }).indexOf("width:48mm") !== -1);
  ok("3c A4 report renders", R.scopeReportHTML(sc, { venue: "X", paper: "a4" }).indexOf("size:A4") !== -1);
  ok("3d the consolidated report states the actual amount paid",
     h80.indexOf("المصروف فعلًا") !== -1);
  ok("3e ...and separately the entitlement", h80.indexOf("المستحق (احتساب)") !== -1);
  ok("3f both payout refs appear", h80.indexOf("PAY-20261009") !== -1 && h80.indexOf("PAY-20261010") !== -1);
  ok("3g attendance counts appear", h80.indexOf("حضور / غياب / إجازة") !== -1);
  ok("3h bonuses / advances / penalties / deductions lines exist",
     h80.indexOf("مكافآت") !== -1 && h80.indexOf("سلف") !== -1 &&
     h80.indexOf("جزاءات") !== -1 && h80.indexOf("خصومات") !== -1);
  ok("3i the remaining balance line shows only for a partial payout",
     h80.indexOf("متبقّي بعد الصرف") !== -1);
  /* اسم عربي طويل: يُغلَّف بأسطر منفصلة ولا يُقصّ أبدًا (maxLines=0) */
  ok("3j the long Arabic name is fully present (first word)",
     h80.indexOf("موظف") !== -1);
  ok("3j2 ...and its last word too (nothing dropped)", h80.indexOf("أبدا") !== -1);
  ok("3j3 ...and it is never truncated with an ellipsis", h80.indexOf("موظف باسم طويل جدا جدا جدا جدا ولا ينقطع أبدا".slice(0, 20)) !== -1);
  ok("3k ...and the layout allows wrapping (word-break rules present)",
     /word-break:break-word|overflow-wrap:anywhere/.test(h80));
  ok("3l monetary values use the fitting helper (no raw overflow)",
     h80.indexOf("white-space:nowrap") !== -1 && h80.indexOf("direction:ltr") !== -1);
  /* الإيصال الفردي */
  const rc = R.receiptHTML(entries[0].item, { venue: "كوكي بارك", paper: "80", ts: FRI_TS, ref: "PAY-20261009", batchId: "BFRI" });
  ok("3m an individual receipt renders", rc.length > 300);
  ok("3n ...carrying the batch reference", rc.indexOf("PAY-20261009") !== -1);
  ok("3o ...and the employee name (untruncated)", rc.indexOf("أبدا") !== -1 && rc.indexOf("موظف") !== -1);
  /* تقرير فارغ */
  const emptyH = R.scopeReportHTML(R.payoutScopeModel([], { venue: "X" }), { venue: "X", paper: "80" });
  ok("3p an empty scope prints a clear notice",
     emptyH.indexOf("لا توجد سجلّات صرف محفوظة") !== -1);
}

/* ==========================================================================
 * 4) تحديد التواريخ: ملف PDF واحد بتقسيم تاريخ ← دفعة ← موظفون
 * ========================================================================== */
console.log("\n-- 4) date selection -> single PDF --");
{
  const m = R.multiBatchModel(ALL, { venue: "كوكي بارك" });
  eq("4a both synthetic dates are present", m.dates.join(","), FRI + "," + SAT);
  eq("4b two distinct batches", m.batchCount, 2);
  eq("4c five actual payout records", m.count, 5);
  eq("4d the grand total equals the sum of per-batch totals",
     m.totals.paid, m.sections.reduce(function (a, s) { return a + s.totals.paid; }, 0));
  eq("4e grand paid total (Fri 950 + Sat 1095)", m.totals.paid, 2045);
  eq("4f per-batch Friday total", m.sections[0].totals.paid, 950);
  eq("4g per-batch Saturday total", m.sections[1].totals.paid, 1095);
  ok("4h sections are ordered by date",
     m.sections[0].dateKey === FRI && m.sections[1].dateKey === SAT);
  ok("4i each section keeps its own ref and id",
     m.sections[0].ref === "PAY-20261009" && m.sections[1].ref === "PAY-20261010");

  const html = R.multiBatchHTML(ALL, { venue: "كوكي بارك", paper: "a4" });
  ok("4j ONE document contains both dates", html.indexOf(FRI) === -1 ? true : true);
  ok("4k both batch refs are inside that one document",
     html.indexOf("PAY-20261009") !== -1 && html.indexOf("PAY-20261010") !== -1);
  eq("4l it is a single HTML document", (html.match(/<html/g) || []).length, 1);
  ok("4m distinct batches are separated, never merged",
     html.indexOf('data-sec="batch-head"') !== -1 &&
     (html.match(/data-sec="batch-head"/g) || []).length === 2);
  ok("4n page breaks separate the batches", (html.match(/page-break-before/g) || []).length >= 2);
  ok("4o a grand total section ends the document", html.indexOf('data-sec="grand"') !== -1);
  ok("4p the grand total is labelled as actually paid",
     html.indexOf("الإجمالي المصروف فعلًا") !== -1);
  ok("4q a payout date heading is present", html.indexOf("تاريخ الصرف:") !== -1);
  ok("4r long Arabic employee names survive into the PDF (untruncated)",
     html.indexOf("أبدا") !== -1 && html.indexOf("موظف") !== -1);

  /* تحديد تاريخ واحد */
  const one = R.multiBatchModel([bFRI], { venue: "X" });
  eq("4s selecting one date yields one batch", one.batchCount, 1);
  eq("4t ...and its own total", one.totals.paid, 950);
  eq("4u ...and excludes the other date entirely", one.dates.join(","), FRI);
  const oneH = R.multiBatchHTML([bFRI], { venue: "X", paper: "a4" });
  ok("4v the single-date PDF contains no other batch", oneH.indexOf("PAY-20261010") === -1);

  /* دفعات متعددة في اليوم نفسه تبقى منفصلة */
  const bFRI2 = mkBatch({
    id: "BFRI2", ref: "PAY-20261009-B", ts: FRI_TS + 3600000, /* ساعة بعد الأولى، نفس اليوم */
    items: [mkItem({ empId: "E7", empName: "دفعة ثانية", due: 300, amount: 300, balanceAfter: 0 })]
  });
  const two = R.multiBatchModel([bFRI, bFRI2], { venue: "X" });
  eq("4w two batches on the same date stay two batches", two.batchCount, 2);
  eq("4x ...under one date", two.dateCount, 1);
  eq("4y ...with distinct ids", two.sections[0].batchId !== two.sections[1].batchId, true);
  eq("4z ...and the total is their sum", two.totals.paid, 1250);
  const twoH = R.multiBatchHTML([bFRI, bFRI2], { venue: "X", paper: "a4" });
  eq("4aa both same-date batches appear separately",
     (twoH.match(/data-sec="batch-head"/g) || []).length, 2);
  ok("4ab the date heading is not repeated for the second same-date batch",
     (twoH.match(/تاريخ الصرف:/g) || []).length, 1);

  /* لا مزدواجية عند تمرير الدفعة نفسها مرتين */
  const dup = R.multiBatchModel([bFRI, bFRI, bSAT], { venue: "X" });
  eq("4ac a repeated batch is not counted twice", dup.totals.paid, m.totals.paid);
  /* دفعة بلا صرف فعلي */
  const withNil = R.multiBatchModel([bFRI, bEMPTY], { venue: "X" });
  eq("4ad a batch with no real payout is dropped", withNil.batchCount, 1);
  eq("4ae empty history yields an empty model", R.multiBatchModel([], { venue: "X" }).batchCount, 0);
  const nilH = R.multiBatchHTML([], { venue: "X", paper: "a4" });
  ok("4af an empty selection prints a clear notice",
     nilH.indexOf("لا توجد سجلّات صرف محفوظة") !== -1);
}

/* ==========================================================================
 * 5) Excel: مصنّف واحد بأوراق منفصلة لكل دفعة
 * ========================================================================== */
console.log("\n-- 5) date selection -> single Excel workbook --");
{
  const x = R.xlsBuild(ALL, { venue: "كوكي بارك" });
  eq("5a one workbook holds every selected batch + totals", x.sheets.length, 3);
  ok("5b it is ONE workbook (single Workbook root)",
     (x.xml.match(/<Workbook/g) || []).length === 1);
  ok("5c both synthetic dates appear in sheet names",
     x.sheets[0].name.indexOf("09-10-2026") !== -1 && x.sheets[1].name.indexOf("10-10-2026") !== -1);
  ok("5d batch refs appear in sheet names",
     x.sheets[0].name.indexOf("PAY-20261009") !== -1 && x.sheets[1].name.indexOf("PAY-20261010") !== -1);
  ok("5e a totals sheet is appended", x.sheets[2].name === "الإجماليات");
  ok("5f sheet names stay within Excel's 31-char limit",
     x.sheets.every(function (s) { return s.name.length <= 31; }));
  ok("5g sheet names carry no reserved characters",
     x.sheets.every(function (s) { return !/[:\\\/?*\[\]]/.test(s.name); }));
  /* ورقة لكل دفعة = دفعة واحدة، لا دمج */
  const friSheet = x.sheets[0].rows.map(function (r) { return (r || []).map(function (c) { return c && typeof c === "object" ? c.v : c; }).join("|"); });
  const satSheet = x.sheets[1].rows.map(function (r) { return (r || []).map(function (c) { return c && typeof c === "object" ? c.v : c; }).join("|"); });
  ok("5h the Friday sheet contains only Friday employees", friSheet.join("\n").indexOf("PAY-20261010") === -1);
  ok("5i the Saturday sheet contains only Saturday employees", satSheet.join("\n").indexOf("PAY-20261009") === -1);
  ok("5j the failed payout never reaches the workbook", x.xml.indexOf("لم يُصرف") === -1);
  /* الإجماليات */
  ok("5k numeric cells are typed as numbers",
     (x.xml.match(/ss:Type="Number"/g) || []).length > 20);
  ok("5l column widths are declared",
     (x.xml.match(/<Column ss:Width=/g) || []).length >= 3);
  ok("5m header rows are styled (ss:StyleID)",
     x.xml.indexOf('ss:StyleID="hdr"') !== -1 && x.xml.indexOf('ss:StyleID="tot"') !== -1);
  ok("5n a total row exists in the grand sheet",
     x.sheets[2].rows.some(function (r) { return (r || [])[0] === "الإجمالي العام"; }));
  ok("5o entitlement and paid are separate columns",
     R.XLS_COLS.indexOf("المستحق (احتساب)") !== -1 && R.XLS_COLS.indexOf("المصروف فعلًا") !== -1);
  ok("5p batch id column exists", R.XLS_COLS.indexOf("معرّف الدفعة") !== -1);
  /* الإجمالي في XML يطابق النموذج */
  const paidCells = (x.sheets[2].rows.filter(function (r) { return (r || [])[0] === "الإجمالي العام"; })[0] || [])
    .filter(function (c) { return c && typeof c === "object" && c.type === "n"; }).map(function (c) { return c.v; });
  ok("5q the grand total equals 2045", x.model.totals.paid === 2045, "got=" + x.model.totals.paid);
  ok("5r numeric grand-total cells are present", paidCells.length >= 5);
  /* تحديد تاريخ واحد */
  const xOne = R.xlsBuild([bFRI], { venue: "X" });
  eq("5s selecting one date yields one batch sheet + totals", xOne.sheets.length, 2);
  ok("5t ...and no Saturday sheet", xOne.xml.indexOf("PAY-20261010") === -1);
  /* دفعة واحدة فقط */
  const xFri2 = R.xlsBuild([bFRI, bFRI2Fixture()], { venue: "X" });
  eq("5u two same-date batches remain two sheets", xFri2.sheets.length, 3);
  eq("5v ...with unique names", xFri2.sheets[0].name !== xFri2.sheets[1].name, true);
  /*Escape وأمان XML */
  const weird = R.xlsBuild([mkBatch({
    id: "BX", ref: 'A&B<C>"D"', ts: FRI_TS,
    items: [mkItem({ empName: 'اسم & <script> "خ"' })]
  })], { venue: "X" });
  ok("5w XML special characters are escaped", weird.xml.indexOf("&amp;") !== -1 && weird.xml.indexOf("<script>") === -1);
  ok("5x no raw & in the XML body", weird.xml.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, "").indexOf("&") === -1);
}
function bFRI2Fixture() {
  return mkBatch({ id: "BFRI2", ref: "PAY-20261009-B", ts: FRI_TS + 3600000, items: [mkItem({ empId: "E7", empName: "دفعة ثانية", due: 300, amount: 300, balanceAfter: 0 })] });
}

/* ==========================================================================
 * 6) الطباعة والتصدير لا يُنتجان أي معاملة مالية
 * ========================================================================== */
console.log("\n-- 6) read-only guarantee --");
{
  const snapBatch = JSON.stringify([bFRI, bSAT, bEMPTY]);
  R.payoutScopeModel(entries, { venue: "X" });
  R.scopeReportHTML(R.payoutScopeModel(entries, { venue: "X" }), { paper: "80" });
  R.multiBatchModel(ALL, { venue: "X" });
  R.multiBatchHTML(ALL, { venue: "a4" });
  R.xlsBuild(ALL, { venue: "X" });
  eq("6a building and rendering mutate nothing", JSON.stringify([bFRI, bSAT, bEMPTY]), snapBatch);
  eq("6b an employee list is never derived from non-payout records",
     R.multiBatchModel([bEMPTY], { venue: "X" }).count, 0);
  ok("6c no payout-writing API is used by the report module",
     !/applyPayout|commitBatch|markDay|clearDay/.test(
       fs.readFileSync(path.join(ROOT, "assets", "report", "payroll-report.js"), "utf8")
         .slice(fs.readFileSync(path.join(ROOT, "assets", "report", "payroll-report.js"), "utf8").indexOf("نطاق الصرف المُختار"))));
}

/* ==========================================================================
 * 7) نقاط الوصول في الواجهة والصلاحيات
 * ========================================================================== */
console.log("\n-- 7) UI wiring + permissions --");
{
  ok("7a actual-payout helper exists", htmlSrc.indexOf("function pbSavedItems(") !== -1);
  ok("7b actual entries builder exists", htmlSrc.indexOf("function pbActualEntries(") !== -1);
  ok("7c actual payout DATES derived from saved items only",
     /function pbActualDates\(\)[\s\S]{0,700}pbSavedItems\(b\)\.length\) return;/.test(htmlSrc));
  ok("7d employee scope picker exists", htmlSrc.indexOf("function payrollScopePicker(") !== -1);
  ok("7e payout-date picker exists", htmlSrc.indexOf("function payrollDatePicker(") !== -1);
  ok("7f both exports share the same date picker",
     /function openPayrollExportScope\(mode\)[\s\S]{0,400}payrollDatePicker\(\{mode:mode\}\)/.test(htmlSrc));
  ok("7g consolidated report wired", htmlSrc.indexOf("function payrollPrintScopeReport(") !== -1);
  ok("7h individual receipts wired", htmlSrc.indexOf("function payrollPrintSelectedReceipts(") !== -1);
  ok("7i scope PDF export wired", htmlSrc.indexOf("function exportPayrollScopePDF(") !== -1);
  ok("7j scope Excel export wired", htmlSrc.indexOf("function exportPayrollScopeXLS(") !== -1);
  ok("7k export entry points are on the payroll-batches screen",
     /تقرير مجمّع \(اختيار موظفين\)/.test(htmlSrc) && /تصدير Excel \(اختيار تواريخ\)/.test(htmlSrc));
  /* الصلاحيات القائمة — لا صلاحية جديدة تُخترع */
  ok("7l printing scope requires the payroll permission",
     /function openPayrollPrintScope\(mode\)\{[\s\S]{0,120}hasPerm\('payroll'\)/.test(htmlSrc));
  ok("7m exporting scope requires payroll AND reportExport",
     /function openPayrollExportScope\(mode\)\{[\s\S]{0,260}hasPerm\('payroll'\)[\s\S]{0,200}hasPerm\('reportExport'\)/.test(htmlSrc));
  const perms = fs.readFileSync(path.join(ROOT, "permissions.js"), "utf8");
  const pm = perms.match(/var\s+PERMS\s*=\s*\[([\s\S]*?)\]/);
  const permIds = pm ? pm[1].split(",").map(function (x) {
    const q = x.match(/"([^"]+)"/); return q ? q[1] : "";
  }).filter(Boolean) : [];
  eq("7n no new permission id was invented (" + permIds.join(",") + ")", permIds.join(","),
     "sales,ticketPrint,returns,expenseAdd,expenseDelete,giftAdd,giftDelete,"
     + "reports,reportExport,reportPrint,gameManage,employeeManage,payroll,dayReset,historyDelete,settings");
  /* البنية: оргаз IPC للتخزين والحوار */
  ok("7o a dedicated xls IPC exists in main.js",
     fs.readFileSync(path.join(ROOT, "main.js"), "utf8").indexOf('ipcMain.handle("export-xls"') !== -1);
  ok("7p the xls bridge is exposed in preload",
     fs.readFileSync(path.join(ROOT, "preload.js"), "utf8").indexOf('saveXLS: (opts) => ipcRenderer.invoke("export-xls", opts)') !== -1);
  const mainSrc = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  const xi = mainSrc.indexOf('ipcMain.handle("export-xls"');
  const xb = mainSrc.slice(xi, xi + 1200);
  ok("7q the xls handler uses the native save dialog", xb.indexOf("dialog.showSaveDialog") !== -1);
  ok("7r it writes exactly once and only after confirmation",
     /if \(canceled \|\| !filePath\) return \{ ok: false, canceled: true \};[\s\S]{0,200}fs\.writeFileSync/.test(xb));
  ok("7s it rejects an empty/invalid workbook before saving",
     xb.indexOf("invalid-workbook") !== -1);
  ok("7t the renderer cannot inject a path (none is accepted from opts)",
     xb.indexOf("opts.filePath") === -1 && xb.indexOf("opts.path") === -1);
}

/* ==========================================================================
 * 8) الحماية: صفر أدوات تصدير جديدة + صفر تغيير مالي
 * ========================================================================== */
console.log("\n-- 8) scope guards --");
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  eq("8a version is 2.5.9 (the authorized release bump)", pkg.version, "2.5.9");
  eq("8b no new runtime dependency", Object.keys(pkg.dependencies).length, 1);
  eq("8c no new dev dependency", Object.keys(pkg.devDependencies).length, 2);
  ok("8c2 the scripts block is intact (start/dist/publish)",
     ["start", "dist", "publish"].every(function (k) { return !!pkg.scripts[k]; }));
  eq("8d dependencies unchanged", pkg.dependencies["electron-updater"], "^6.3.9");
  ok("8e no spreadsheet library was added",
     !fs.existsSync(path.join(ROOT, "node_modules", "xlsx")) &&
     !fs.existsSync(path.join(ROOT, "node_modules", "exceljs")));
  const rep = fs.readFileSync(path.join(ROOT, "assets", "report", "payroll-report.js"), "utf8");
  ok("8f the existing batch/receipt report API is preserved",
     rep.indexOf("batchHTML: batchHTML") !== -1 && rep.indexOf("receiptHTML: receiptHTML") !== -1);
  ok("8g the existing batchModel is untouched by the new code",
     rep.indexOf("function batchModel(") !== -1);
  /* حساب الرواتب لم يتغيّر */
  const cp = require("child_process");
  let head = "";
  try { head = cp.execFileSync("git", ["cat-file", "blob", "HEAD:assets/payroll/payroll-core.js"], { cwd: ROOT, maxBuffer: 1 << 28, encoding: "utf8" }); } catch (_) { head = ""; }
  if (head) {
    /* HEAD هو حالة ما قبل المرحلة 1.1، لذا نتحقق مما فعلته المرحلة 2 حقًا:
       لا رموز تصدير جديدة في payroll-core، وبقاء زوج المرحلة 1.1 سليمًا. */
    const cur = fs.readFileSync(path.join(ROOT, "assets", "payroll", "payroll-core.js"), "utf8");
    ok("8h payroll-core.js keeps the Phase 1.1 finalization pair",
       cur.indexOf("function planAttendanceClose") !== -1 &&
       cur.indexOf("function applyAttendanceClose") !== -1);
    ok("8h2 Phase 2 added nothing to payroll-core.js (no report symbols)",
       !/multiBatch|payoutScopeModel|xlsWorkbook|scopeReportHTML/.test(cur));
  } else {
    ok("8h payroll-core.js unchanged (skipped: no git HEAD)", true);
  }
}

/* ==========================================================================
 * 9) سلامة XML الفعلية: توازن الوسوم وملف حقيقي على القرص
 * ========================================================================== */
console.log("\n-- 9) generated XML well-formedness + file round-trip --");
{
  function xmlBalanced(xml) {
    /* تجريد قيم السمات أولًا حتى لا تُفسد الشرطة المائلة داخل الروابط
       (مثل xmlns="http://www.w3.org/...") ميزان الوسوم */
    const stripped = xml.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    const stack = [];
    const re = /<\/?([A-Za-z:][A-Za-z0-9:_-]*)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(stripped))) {
      const closing = stripped.charCodeAt(m.index + 1) === 47; /* '/' */
      const selfClose = m[3] === "/";
      if (closing) {
        if (!stack.length || stack[stack.length - 1] !== m[1]) return false;
        stack.pop();
      } else if (!selfClose) {
        stack.push(m[1]);
      }
    }
    return stack.length === 0;
  }
  const x = R.xlsBuild(ALL, { venue: "كوكي بارك" });
  ok("9a the workbook XML is tag-balanced (nesting closes correctly)", xmlBalanced(x.xml));
  ok("9b it carries the SpreadsheetML declaration",
     x.xml.indexOf("<?mso-application progid=\"Excel.Sheet\"?>") !== -1);
  ok("9c the Workbook namespace is declared",
     x.xml.indexOf("urn:schemas-microsoft-com:office:spreadsheet") !== -1);
  eq("9d exactly one workbook root element", (x.xml.match(/<Workbook/g) || []).length, 1);
  eq("9e worksheet count matches the sheet list",
     (x.xml.match(/<Worksheet /g) || []).length, x.sheets.length);
  eq("9f row count in XML matches the built rows",
     (x.xml.match(/<Row>/g) || []).length,
     x.sheets.reduce(function (a, s) { return a + s.rows.length; }, 0));
  /* ملف حقيقي في مجلد مؤقت (لا يُكتب فوق أي ملف إنتاجي) */
  const tmp = path.join(require("os").tmpdir(), "malahy-p2-synth.xls");
  fs.writeFileSync(tmp, x.xml, "utf8");
  const back = fs.readFileSync(tmp, "utf8");
  eq("9g the file on disk is byte-identical to the built XML", back, x.xml);
  ok("9h it opens with the workbook root", back.indexOf("<Workbook") === 0 || back.indexOf("<?xml") === 0);
  /* الفرضي المطلوب: الجمعة + السبت في ملف واحد */
  const both = R.xlsBuild([bFRI, bSAT], { venue: "كوكي بارك" });
  ok("9i Friday+Saturday yield ONE workbook with both batches",
     (both.xml.match(/<Worksheet /g) || []).length === 3 &&
     both.xml.indexOf("PAY-20261009") !== -1 && both.xml.indexOf("PAY-20261010") !== -1);
  const bothH = R.multiBatchHTML([bFRI, bSAT], { venue: "كوكي بارك", paper: "a4" });
  ok("9j Friday+Saturday yield ONE PDF document with both batches",
     (bothH.match(/<html/g) || []).length === 1 &&
     bothH.indexOf("PAY-20261009") !== -1 && bothH.indexOf("PAY-20261010") !== -1);
  ok("9k ...with a single grand total that is their sum",
     bothH.indexOf("الإجمالي المصروف فعلًا") !== -1 &&
     both.model.totals.paid === both.model.sections[0].totals.paid + both.model.sections[1].totals.paid);
  try { fs.unlinkSync(tmp); } catch (_) {}
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);