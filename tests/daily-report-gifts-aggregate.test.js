// tests/daily-report-gifts-aggregate.test.js
// تقرير اليوم: عرض الهدايا كسطر إجمالي واحد فقط (بدون العمليات الفردية).
//
// المصدر المُختبَر هو نفس مصدر التطبيق: assets/report/daily-report.js
// (dayReportHTML + dailyReportModel). لا يُقرأ أي بيانات إنتاجية ولا يُكتب
// شيء على القرص: كل الأيام هنا اصطناعية.

const path = require("path");
const R = require(path.join(__dirname, "..", "assets", "report", "daily-report.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
function count(h, needle) { return String(h).split(needle).length - 1; }

/* يوم واحد اصطناعي — أربع هدايا 10 + 20 + 30 + 40 = 100 */
const TS = new Date(2026, 9, 2, 20, 10, 0).getTime(); // 2026-10-02 20:10
function giftDay(over) {
  return Object.assign({
    id: "g-day-1",
    startedAt: new Date(2026, 9, 2, 18, 0, 0).getTime(),
    endedAt: new Date(2026, 9, 2, 23, 30, 0).getTime(),
    dateLabel: "الجمعة 2 أكتوبر 2026",
    revenue: 1000, expenses: 200, gifts: 100,
    cashRevenue: 900, elecRevenue: 100,
    tickets: 12, cashTickets: 10, elecTickets: 2,
    breakdown: [
      { name: "القاء", price: 100, count: 10, cashCount: 9, elecCount: 1, total: 1000 }
    ],
    expenseList: [{ desc: "كهرباء", amount: 200 }],
    giftList: [
      { desc: "بالون أزرق", amount: 10, seq: 1, at: TS },
      { desc: "دبدوب", amount: 20, seq: 2, at: TS + 60000 },
      { desc: "كرة قدم", amount: 30, seq: 3, at: TS + 120000 },
      { desc: "ساعة يد", amount: 40, seq: 4, at: TS + 180000 }
    ]
  }, over || {});
}

function build(day, paper, reviewHTML) {
  return R.dayReportHTML(day, { venue: "كوكي بارك", paper: paper || "58", reviewHTML: reviewHTML || "" });
}
function secOf(html, name) {
  const marker = 'data-sec="' + name + '"';
  const i = html.indexOf(marker);
  if (i === -1) return "";
  const start = html.lastIndexOf("<div", i);
  const next = html.indexOf('data-sec="', i + marker.length);
  const end = next === -1 ? html.indexOf("© نظام الحسابات", start) : html.lastIndexOf("<div", next);
  return html.slice(start < 0 ? i : start, end === -1 ? html.length : end);
}

console.log("DAILY REPORT — GIFTS AS ONE AGGREGATE LINE");

/* =====================================================================
 * 1) أربع هدايا 10/20/30/40 ⇒ سطر واحد بمجموع 100 جنيه
 * ===================================================================== */
{
  const day = giftDay();
  const html = build(day, "58");
  ok("1a the report shows the aggregated gift line",
    html.indexOf("إجمالي الهدايا:") !== -1 && html.indexOf("100 جنيه") !== -1);
  ok("1b the exact required text appears (label + amount + currency unit)",
    html.indexOf('<span class="l">إجمالي الهدايا:</span>') !== -1 && html.indexOf('100 جنيه') !== -1);
  eq("1c the total is the authoritative day.gifts value", R.dailyReportModel(day, {}).summary.giftSales, 100);
  ok("1d the gift section is a single row", count(html, 'data-sec="gifts"') === 1);
}

/* =====================================================================
 * 2) سطر إجمالي واحد فقط — لا صفوف ولا عناوين هدايا متعددة
 * ===================================================================== */
{
  const html = build(giftDay(), "58");
  eq("2a exactly one gift-total label in the whole report", count(html, "إجمالي الهدايا"), 1);
  eq("2b exactly one gifts section", count(html, 'data-sec="gifts"'), 1);
  ok("2c the old per-gift section header is gone", html.indexOf(">الهدايا:<") === -1);
  eq("2d the gift section contains exactly one line/row",
    count(secOf(html, "gifts"), '<div class="r"'), 1);
  eq("2e and exactly one separator after the section",
    count(secOf(html, "gifts"), 'class="hr"'), 1);
}

/* =====================================================================
 * 3) أسماء/مبالغ/أزمنة الهدايا الفردية لا تظهر في التقرير
 * ===================================================================== */
{
  const day = giftDay();
  const html = build(day, "58");
  ["بالون أزرق", "دبدوب", "كرة قدم", "ساعة يد"].forEach(function (desc, i) {
    ok("3." + (i + 1) + " individual gift description is not printed: " + desc,
      html.indexOf(desc) === -1);
  });
  ["#000001", "#000002", "#000003", "#000004"].forEach(function (seq, i) {
    ok("3." + (i + 5) + " individual gift sequence is not printed: " + seq,
      html.indexOf(seq) === -1);
  });
  ["10 ج", "20 ج", "30 ج", "40 ج"].forEach(function (amount, i) {
    ok("3." + (i + 9) + " individual gift amount is not printed: " + amount,
      html.indexOf(amount) === -1);
  });
  ok("3.13 no per-gift timestamp line is printed", html.indexOf("8:10 م") === -1 && html.indexOf("8:11 م") === -1);
  ok("3.14 the only gifts mention is the aggregate total + the summary row",
    count(html, "الهدايا") === 2, "count=" + count(html, "الهدايا"));
}

/* =====================================================================
 * 4) لا هدايا ⇒ لا سطر هدايا (صفر) بنفس عُرف التقرير القائم
 * ===================================================================== */
{
  const noGifts = giftDay({ gifts: 0, giftList: [] });
  const html = build(noGifts, "58");
  ok("4a no gift total line when there are no gifts", html.indexOf("إجمالي الهدايا") === -1);
  eq("4b no gifts section is rendered", count(html, 'data-sec="gifts"'), 0);
  ok("4c the sales summary still reports zero gift sales", html.indexOf("مبيعات الهدايا") !== -1 && html.indexOf("0 ج") !== -1);
  eq("4d total sales equal game sales", R.dailyReportModel(noGifts, {}).summary.totalSales, 1000);
  eq("4e final total unchanged by zero gifts", R.dailyReportModel(noGifts, {}).summary.final, 800);
}

/* =====================================================================
 * 5) عدة هدايا تُجمع جمعًا صحيحًا (مع كسور وتنسيق الأرقام)
 * ===================================================================== */
{
  const many = giftDay({
    gifts: 50,
    giftList: [
      { desc: "أ", amount: 5.5, seq: 10, at: TS },
      { desc: "ب", amount: 10.25, seq: 11, at: TS },
      { desc: "ج", amount: 0.25, seq: 12, at: TS },
      { desc: "د", amount: 33, seq: 13, at: TS },
      { desc: "ه", amount: 1, seq: 14, at: TS }
    ]
  });
  const html = build(many, "80");
  ok("5a five gifts are aggregated to one total", html.indexOf("50 جنيه") !== -1);
  eq("5b only one gift line", count(html, "إجمالي الهدايا"), 1);
  eq("5c the model still exposes all five rows", R.dailyReportModel(many, {}).gifts.length, 5);

  const big = giftDay({ gifts: 1234.5 });
  ok("5d the aggregate uses the report's number formatting", build(big, "58").indexOf("1,234.5 جنيه") !== -1);
}

/* =====================================================================
 * 6) هدايا يوم آخر لا تظهر ولا تُجمع
 * ===================================================================== */
{
  const otherDay = giftDay({
    id: "g-day-2",
    startedAt: new Date(2026, 9, 3, 18, 0, 0).getTime(),
    endedAt: new Date(2026, 9, 3, 23, 0, 0).getTime(),
    dateLabel: "السبت 3 أكتوبر 2026",
    gifts: 900,
    giftList: [
      { desc: "هدية اليوم الآخر", amount: 400, seq: 90, at: TS + 86400000 },
      { desc: "هدية أخرى", amount: 500, seq: 91, at: TS + 86400000 }
    ]
  });
  const htmlA = build(giftDay(), "58");
  const htmlB = build(otherDay, "58");
  ok("6a day A shows only its own total", htmlA.indexOf("100 جنيه") !== -1);
  ok("6b day A does not contain the other day's gift total", htmlA.indexOf("900 جنيه") === -1);
  ok("6c day A does not contain the other day's gift names", htmlA.indexOf("هدية اليوم الآخر") === -1 && htmlA.indexOf("هدية أخرى") === -1);
  ok("6d day B shows only its own total", htmlB.indexOf("900 جنيه") !== -1 && htmlB.indexOf("100 جنيه") === -1);
  eq("6e day B model total is its own", R.dailyReportModel(otherDay, {}).summary.giftSales, 900);
}

/* =====================================================================
 * 7) الهدايا لا تُحسب مرتين
 * ===================================================================== */
{
  const day = giftDay();
  const m = R.dailyReportModel(day, {});
  eq("7a gift sales enter total sales exactly once", m.summary.totalSales, m.summary.gameSales + m.summary.giftSales);
  eq("7b final total = total sales - expenses", m.summary.final, 900);
  eq("7c gift contribution to the final total is exactly the gift amount once",
    m.summary.final - (m.summary.gameSales - m.summary.expenses), 100);
  eq("7d final is unchanged if gifts are zeroed", R.dailyReportModel(giftDay({ gifts: 0 }), {}).summary.final, 800);
  eq("7e final cash deducts the electronic amount once", m.summary.finalCash, 800);
  eq("7f the gift total appears once in the gifts section", count(build(day, "58"), "إجمالي الهدايا"), 1);
  eq("7g and once as a sales-summary row (different label)",
    count(build(day, "58"), "مبيعات الهدايا"), 1);
}

/* =====================================================================
 * 8) إجماليات التقرير والرصيد النهائي لم تتغيّر
 * ===================================================================== */
{
  const day = giftDay();
  const m = R.dailyReportModel(day, {});
  eq("8a game sales", m.summary.gameSales, 1000);
  eq("8b gift sales", m.summary.giftSales, 100);
  eq("8c total sales", m.summary.totalSales, 1100);
  eq("8d expenses", m.summary.expenses, 200);
  eq("8e net before electronic", m.summary.netBeforeElec, 800);
  eq("8f total before electronic", m.summary.final, 900);
  eq("8g electronic deduction", m.summary.elecDeduction, 100);
  eq("8h final cash", m.summary.finalCash, 800);
  eq("8i parity with the legacy formula revenue - expenses + gifts",
    m.summary.final, day.revenue - day.expenses + day.gifts);
  eq("8j final cash is unchanged whether the gift list is present or not",
    R.dailyReportModel(Object.assign({}, day, { giftList: undefined }), {}).summary.finalCash,
    m.summary.finalCash);
  ok("8k the printed report still shows all financial summary rows",
    ["مبيعات الألعاب", "مبيعات الهدايا", "إجمالي المبيعات", "إجمالي المصروفات",
      "الصافي قبل خصم الإلكتروني", "الإجمالي قبل خصم الإلكتروني",
      "خصم المبيعات الإلكترونية", "الإجمالي النهائي النقدي"].every(function (l) {
        return build(day, "58").indexOf(l) !== -1;
      }));
}

/* =====================================================================
 * 9) سجلات الهدايا الفردية تبقى كما هي (عرض فقط)
 * ===================================================================== */
{
  const day = giftDay();
  const before = JSON.stringify(day);
  const model = R.dailyReportModel(day, {});
  build(day, "58");
  build(day, "80");
  build(day, "a4");
  eq("9a the day object is not mutated by building the report", JSON.stringify(day), before);
  eq("9b the model still exposes every gift row", model.gifts.length, 4);
  ok("9c descriptions survive in the model",
    model.gifts.map(function (x) { return x.label; }).join("|").indexOf("بالون أزرق") !== -1 &&
    model.gifts.map(function (x) { return x.label; }).join("|").indexOf("دبدوب") !== -1);
  ok("9d amounts survive in the model",
    model.gifts.map(function (x) { return x.amount; }).join(",") === "10,20,30,40");
  ok("9e timestamps survive in the model", model.gifts.every(function (x) { return typeof x.at === "number"; }));
  eq("9f the underlying gift list length is unchanged", day.giftList.length, 4);
}

/* =====================================================================
 * 10) التنسيق والأقسام الأخرى كما هي (58/80/A4)
 * ===================================================================== */
{
  const day = giftDay();
  ["58", "80", "a4"].forEach(function (paper) {
    const html = build(day, paper, '<div class="hr"></div><div class="c b" data-sec="review">🧾 سجل المرتجعات</div>');
    const css = R.paperCSS(paper);
    ok(paper + ": valid document", html.indexOf("<!DOCTYPE html>") === 0 && html.indexOf("</body></html>") !== -1);
    ok(paper + ": no table (thermal overflow risk)", html.indexOf("<table") === -1);
    ok(paper + ": balanced divs", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length);
    ok(paper + ": all standard sections still present",
      R.SECTION_ORDER.every(function (s) { return html.indexOf('data-sec="' + s + '"') !== -1; }));
    if (paper === "58") ok("58mm: body width unchanged (48mm)", css.indexOf("width:48mm") !== -1);
    if (paper === "80") ok("80mm: body width unchanged (72mm)", css.indexOf("width:72mm") !== -1);
    if (paper === "a4") ok("A4: page size/margins unchanged", css.indexOf("@page{size:A4;margin:12mm;}") !== -1);
  });

  const html = build(day, "58");
  ok("10a section order preserved: games before gifts before expenses",
    html.indexOf('data-sec="games"') < html.indexOf('data-sec="gifts"') &&
    html.indexOf('data-sec="gifts"') < html.indexOf('data-sec="expenses"'));
  ok("10b games details are still intact",
    html.indexOf("تفصيل الألعاب:") !== -1 && html.indexOf("القاء (10×100)") !== -1);
  ok("10c expenses details are still intact",
    html.indexOf("المصروفات:") !== -1 && html.indexOf("كهرباء") !== -1 && html.indexOf("200 ج") !== -1);
  ok("10d ticket section is still intact",
    html.indexOf("عدد التذاكر") !== -1 && html.indexOf("منها كاش") !== -1 && html.indexOf("منها إلكتروني") !== -1);
  eq("10e the gift block uses the same row/label/value layout as other totals",
    count(secOf(html, "gifts"), '<div class="r" data-sec="gifts">') === 1 &&
    count(secOf(html, "gifts"), '<span class="l">') === 1 &&
    count(secOf(html, "gifts"), '<span class="v num">') === 1, true);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
