// tests/phase4-daily-report.test.js
// اختبار تقرير حساب اليوم (المرحلة 4): الترتيب، الحسابات، قسم التذاكر،
// سجل المرتجعات، وتكيّف التنسيق مع 58mm/80mm/A4.
// المصدر الوحيد المُختبَر هو daily-report.js (نفس ما تستخدمه index.html).

const path = require("path");
const R = require(path.join(__dirname, "..", "assets", "report", "daily-report.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) { ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); }

/* ================= تجهيز بيانات يوم وهمية (نفس شكل archiveDay/totals) ================= */
const STARTED = new Date("2026-10-02T18:00:00").getTime();   /* جمعة 2 أكتوبر 2026 */
const ENDED = new Date("2026-10-02T23:30:00").getTime();
const day = {
  id: "d1",
  startedAt: STARTED,
  endedAt: ENDED,
  dateLabel: "الجمعة 2 أكتوبر 2026",
  revenue: 1820, expenses: 400, gifts: 100, net: 1420, finalNet: 1520,
  cashRevenue: 1100, elecRevenue: 720,
  tickets: 10, cashTickets: 6, elecTickets: 4,
  breakdown: [
    { name: "القاء", price: 100, count: 5, cashCount: 3, elecCount: 2, total: 500, cashTotal: 300, elecTotal: 200 },
    { name: "السكوتر", price: 220, count: 6, cashCount: 3, elecCount: 3, total: 1320, cashTotal: 660, elecTotal: 660 }
  ],
  expenseList: [
    { desc: "كهرباء", amount: 250 },
    { desc: "صيانة", amount: 150 }
  ],
  giftList: [
    { desc: "هدية طفل", amount: 100, seq: 7, at: new Date("2026-10-02T20:10:00").getTime() }
  ]
};

/* قيم الترويسة المتوقّعة (18:00 بعد بداية الوردية → نفس اليوم التقويمي) */
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const expDayName = AR_DAYS[new Date(STARTED).getDay()];
const expDate = new Date(STARTED).getDate() + " " + AR_MONTHS[new Date(STARTED).getMonth()] + " " + new Date(STARTED).getFullYear();
const expTime = "11:30 م";
const VENUE = "كوكي بارك";

/* HTML سجل مرتجعات مبسّط (نفس بنية dayReviewAppendHTML: قسم data-sec="review") */
function reviewHTML(rowsMark) {
  return '<div class="hr"></div><div class="c b" data-sec="review">🧾 سجل المرتجعات</div>'
    + '<div class="hr"></div>' + rowsMark
    + '<div class="hr"></div><div class="r"><span class="l">عدد العمليات</span><span class="v num">1</span></div>';
}

function build(paper, review) {
  return R.dayReportHTML(day, {
    venue: VENUE,
    paper: paper,
    reviewHTML: review ? reviewHTML('<div class="rr">مرتجع</div>') : ""
  });
}

/* مواضع الأقسام للتحقق من الترتيب */
function pos(html, sec) { return html.indexOf('data-sec="' + sec + '"'); }

(function () {
  console.log("PHASE 4 — Daily Account Report: order, calculations, payment breakdown, print formats");

  /* ---- 1) الترويسة ---- */
  const html58 = build("58", true);
  ok("header contains venue name", html58.indexOf(VENUE) !== -1);
  ok("header contains report title", html58.indexOf("تقرير حساب اليوم") !== -1);
  ok("header contains day", html58.indexOf("اليوم: " + expDayName) !== -1, expDayName);
  ok("header contains date", html58.indexOf("التاريخ: " + expDate) !== -1, expDate);
  ok("header contains time", html58.indexOf("الساعة: " + expTime) !== -1, expTime);
  ok("venue is the configurable brand (not hardcoded in module)", R.dayReportHTML(day, { venue: "بيت المرح", paper: "58" }).indexOf("بيت المرح") !== -1);

  /* ---- 2-5) ترتيب الأقسام ---- */
  const order = R.SECTION_ORDER;
  let ordered = true, reason = "";
  const idx = {};
  order.forEach(function (s) { idx[s] = pos(html58, s); });
  for (let i = 0; i < order.length - 1; i++) {
    if (idx[order[i]] === -1) { ordered = false; reason = "missing " + order[i]; break; }
    if (idx[order[i]] >= idx[order[i + 1]]) { ordered = false; reason = order[i] + " after " + order[i + 1]; break; }
  }
  ok("all sections present", order.every(function (s) { return idx[s] !== -1; }), reason);
  ok("section order: header→games→gifts→expenses→summary→tickets→review", ordered, reason);
  ok("game details appear before gifts", idx.games < idx.gifts);
  ok("gifts appear before expenses", idx.gifts < idx.expenses);
  ok("expenses appear before sales summary", idx.expenses < idx.summary);
  ok("returns log appears at the very end (after tickets + footer)", idx.tickets < idx.review && html58.indexOf("© نظام الحسابات") < idx.review);

  /* ---- 5-10) الحسابات ---- */
  const m = R.dailyReportModel(day, { venue: VENUE });
  eq("game sales = revenue", m.summary.gameSales, 1820);
  eq("gift sales = gifts", m.summary.giftSales, 100);
  eq("total sales = game sales + gift sales", m.summary.totalSales, 1920);
  eq("expenses total", m.summary.expenses, 400);
  eq("final total = total sales - expenses", m.summary.final, 1520);
  ok("summary rows rendered in report", html58.indexOf("مبيعات الألعاب") !== -1 && html58.indexOf("مبيعات الهدايا") !== -1
    && html58.indexOf("إجمالي المبيعات") !== -1 && html58.indexOf("إجمالي المصروفات") !== -1 && html58.indexOf("الإجمالي النهائي") !== -1);
  ok("money values rendered", html58.indexOf("1,820 ج") !== -1 && html58.indexOf("1,920 ج") !== -1 && html58.indexOf("1,520 ج") !== -1);
  /* الهدايا تُحسب مرة واحدة: الإجمالي النهائي = (مبيعات+هدايا) − مصروفات وليس ×2 */
  eq("gifts counted once (final unchanged if gifts zeroed)", R.dailyReportModel(Object.assign({}, day, { gifts: 0 }), {}).summary.final, 1420);
  eq("gifts counted once (giftSales equals gift total exactly)", m.summary.totalSales, m.summary.gameSales + m.summary.giftSales);
  /* المصروفات تُخصم مرة واحدة: 1920 − 400 = 1520 وليس 1120 */
  ok("expenses not subtracted twice", m.summary.final === 1520 && m.summary.final !== m.summary.totalSales - m.summary.expenses - m.summary.expenses);
  eq("final equals legacy formula revenue-expenses+gifts", m.summary.final, day.revenue - day.expenses + day.gifts);

  /* ---- 11-13) التذاكر / طرق الدفع ---- */
  eq("total ticket count", m.tickets.total, 10);
  eq("cash ticket count", m.tickets.cash, 6);
  eq("electronic ticket count", m.tickets.elec, 4);
  ok("ticket rows rendered after summary", html58.indexOf("عدد التذاكر") !== -1 && idx.summary < html58.indexOf("عدد التذاكر"));
  ok("cash/elec ticket rows rendered", html58.indexOf("منها كاش") !== -1 && html58.indexOf("منها إلكتروني") !== -1);

  /* ---- 14-15) سجل المرتجعات ---- */
  ok("returns log rendered when provided", pos(html58, "review") !== -1);
  ok("no-return state works", R.dayReportHTML(day, { venue: VENUE, paper: "58", reviewHTML: reviewHTML('<div class="c s">لا توجد عمليات مرتجعات</div>') }).indexOf("لا توجد عمليات مرتجعات") !== -1);
  ok("report without review has no returns section", pos(build("58", false), "review") === -1);

  /* ---- السجلات القديمة (انحدار) ---- */
  const legacy = R.dailyReportModel({ revenue: 500, expenses: 700, gifts: 0, tickets: 3 }, {});
  eq("legacy record: total sales", legacy.summary.totalSales, 500);
  eq("legacy record: final (negative net)", legacy.summary.final, -200);
  eq("legacy record: tickets default counts", legacy.tickets.cash + legacy.tickets.elec, 0);
  ok("legacy record: no games/gifts/expenses sections gracefully", legacy.games.length === 0 && legacy.gifts.length === 0 && legacy.expenses.length === 0);

  /* ---- 16-19) تنسيقات الطباعة الثلاثة ---- */
  /* سيناريو أطول اسم لعبة: التحقق من أن الصفوف تتكيّف ولا تخرج عن عرض الورق */
  const longDay = Object.assign({}, day, {
    breakdown: [{ name: 'بيت الكور والهوكي', price: 40, count: 12, cashCount: 12, elecCount: 0, total: 480 }]
  });
  const longHtml = R.dayReportHTML(longDay, { venue: VENUE, paper: "58" });
  ok("58mm: longest game name rendered (no truncation)", longHtml.indexOf("بيت الكور والهوكي (12×40)") !== -1);
  ok("58mm: long row uses wrap-capable classes (flex, min-width:0 label)",
    longHtml.indexOf('class="r"') !== -1 && R.paperCSS("58").indexOf("min-width:0") !== -1);
  ok("58mm: long-row document still well-formed", (longHtml.match(/<div/g) || []).length === (longHtml.match(/<\/div>/g) || []).length);

  ["58", "80", "a4"].forEach(function (paper) {
    const h = build(paper, true);
    const css = R.paperCSS(paper);
    ok(paper + ": valid html document", h.indexOf("<!DOCTYPE html>") === 0 && h.indexOf("</body></html>") !== -1);
    ok(paper + ": no <table> (thermal overflow risk)", h.indexOf("<table") === -1);
    ok(paper + ": no inline width styles", !/style\s*=\s*"[^"]*width/.test(h));
    ok(paper + ": all hr separators use shared class", (h.match(/class="hr"/g) || []).length >= 5);
    if (paper === "58") {
      ok("58mm: body width 48mm", css.indexOf("width:48mm") !== -1, css.slice(0, 120));
      ok("58mm: page margin 0 for thermal", css.indexOf("@page{margin:0;}") !== -1);
      ok("58mm: compact font 11px", css.indexOf("font-size:11px") !== -1);
      ok("58mm: values kept on one line (no wrap)", css.indexOf(".r .v{text-align:left;white-space:nowrap") !== -1);
      ok("58mm: labels can shrink (min-width:0)", css.indexOf("min-width:0") !== -1);
      ok("58mm: thermal rule renders visible separator", h.indexOf("------------------------------") !== -1);
    } else if (paper === "80") {
      ok("80mm: body width 72mm", css.indexOf("width:72mm") !== -1, css.slice(0, 120));
      ok("80mm: page margin 0 for thermal", css.indexOf("@page{margin:0;}") !== -1);
      ok("80mm: readable font 12px", css.indexOf("font-size:12px") !== -1);
    } else {
      ok("A4: page size declared with 12mm margins", css.indexOf("@page{size:A4;margin:12mm;}") !== -1);
      ok("A4: hr uses border-top (no duplicated dash text)", css.indexOf(".hr{border-top:1px dashed #000") !== -1);
      ok("A4: readable font 13px", css.indexOf("font-size:13px") !== -1);
      ok("A4: no fixed narrow body width", css.indexOf("width:48mm") === -1 && css.indexOf("width:72mm") === -1);
    }
    ok(paper + ": same calculations in every format",
      R.dailyReportModel(day, {}).summary.final === 1520
      && h.indexOf("1,520 ج") !== -1 && h.indexOf("1,920 ج") !== -1);
    ok(paper + ": all sections present in this format too",
      ["header", "games", "gifts", "expenses", "summary", "tickets", "review"].every(function (s) { return pos(h, s) !== -1; }));
  });

  /* ---- حقن مساعدي التطبيق (التوصيل بين index.html والوحدة) ---- */
  R.setUtil({
    fmtNum: function (n) { return "F" + Number(n); },
    esc: function (s) { return String(s); },
    fmtDMY: function () { return "D"; },
    fmtTime12: function () { return "T"; },
    dayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    dayStartMin: function () { return 600; }
  });
  const injected = R.dayReportHTML(day, { venue: "V", paper: "58" });
  ok("setUtil injection drives header day name", injected.indexOf("اليوم: Fr") !== -1);
  ok("setUtil injection drives money formatting", injected.indexOf("F1820") !== -1);
  R.setUtil({}); /* إعادة للقيم الافتراضية */

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
