// tests/v259-electronic-cash.test.js
// v2.5.9 — استبعاد التحصيل الإلكتروني من الإجمالي النهائي النقدي (تقرير اليوم).
//
// القاعدة المحورية التي تحرس كل الاختبارات:
//   الإجمالي النهائي النقدي = (مبيعات الألعاب − المصروفات + الهدايا) − الدفع الإلكتروني
//   * الدفع الإلكتروني يُخصم **مرة واحدة** من الرصيد النهائي فقط، ولا يُخصم أبدًا من المبيعات.
//   * يبقى ضمن «مبيعات الألعاب» وإحصاءاتها كما هو — لا يُشطب ولا يُعاد تصنيفه.
//   * لا مصروف جديد، ولا تعديل على الرواتب أو سجل المرتجعات أو بيانات المؤرشف.
//
// البيانات اصطناعية بالكامل وفي الذاكرة. لا Electron ولا طابعة ولا بيانات إنتاجية.
// ما يُختبَر فعليًا هو نفس الكود الذي يعمل في التطبيق:
//   · index.html                   → totals / gameSalesTotals / addTicket / deduct* /
//                                    archiveDay / gameBreakdown / renderSummary (مستخرجة كما هي)
//   · assets/report/daily-report.js → نموذج الحساب وHTML تقرير اليوم (58/80/A4)
//   · dayReviewAppendHTML          → سجل المرتجعات المُلحق بالتقرير

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "assets", "report", "daily-report.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) { ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); }
function D(y, m, d, h) { return new Date(y, m - 1, d, h === undefined ? 12 : h, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- استخراج دوال حقيقية من index.html (نفس آلية بقية اختبارات المشروع) ---------- */
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

/* ألعاب اصطناعية بأسعار تسمح بإعادة إنتاج سيناريو المرجع من سجلات حقيقية:
   6 تذاكر كاش × 50 = 300 · 4 تذاكر إلكترونية × 25 = 100 · 4 × 30 = 120 ⇒ إلكتروني 220 */
const GAMES = [
  { id: "G1", name: "القاء", price: 25, color: "#f00", active: true },
  { id: "G2", name: "السكوتر", price: 110, color: "#0f0", active: true },
  { id: "G3", name: "دوران", price: 50, color: "#00f", active: true },
  { id: "G4", name: "قفز", price: 30, color: "#ff0", active: true }
];

/* ---------- بيئة تشغيل: يوم حيّ + مخزن جهاز وهمي ---------- */
function makeEnv(opts) {
  opts = opts || {};
  const store = {};
  const nodes = {};
  const toasts = [], logs = [], writes = { n: 0 }, reviews = [];
  const state = {
    startedAt: opts.startedAt || D(2026, 10, 12, 10),
    counts: { G1: 0, G2: 0, G3: 0, G4: 0 }, ecounts: { G1: 0, G2: 0, G3: 0, G4: 0 },
    expenses: [], gifts: [], pprices: {}
  };

  const loadJSON = (k, d) => (k in store) ? store[k] : d;
  const saveJSON = (k, v) => { store[k] = clone(v); writes.n++; return true; };
  const uid = () => "u" + (writes.n + "x" + Math.random()).toString(36).slice(2, 8);
  const toast = (m, k) => toasts.push({ m: m, k: k || "ok" });
  const logErr = (w, e) => logs.push({ w: w, e: String(e) });
  const alert_ = () => { throw new Error("alert() في بيئة الاختبار — Flow رما خطأ غير متوقع"); };
  const fmtNum = (n) => { const r = Math.round((Number(n) || 0) * 100) / 100; return r.toLocaleString("en-US", { maximumFractionDigits: 2 }); };

  function mkNode(v) {
    return { value: v === undefined ? "" : v, textContent: "", innerHTML: "", closest: () => null, focus() { }, select() { } };
  }
  function $(sel) {
    const m = /^#([A-Za-z0-9_-]+)$/.exec(sel);
    if (!m) return null;
    if (!nodes[m[1]]) nodes[m[1]] = mkNode("");
    return nodes[m[1]];
  }
  function setInput(id, v) { if (!nodes[id]) nodes[id] = mkNode(""); nodes[id].value = String(v); }

  const MalahyPerm = {
    hasPerm() { return true; },
    deny() { throw new Error("deny() — الصلاحية مرفوضة في بيئة الاختبار"); },
    requirePerm(perm, cfg) { if (typeof cfg.onOk === "function") cfg.onOk(""); }
  };

  /* سجل المرتجعات الحقيقي كما يكتبه index.html:logReview */
  const logReview = function (entry) {
    reviews.unshift({
      id: uid(), ts: entry.ts || Date.now(), gameId: entry.gameId || "", game: entry.game || "",
      qty: Number(entry.qty) || 0, price: Number(entry.price) || 0,
      total: (Number(entry.qty) || 0) * (Number(entry.price) || 0),
      type: entry.type || "خصم", method: entry.method || "",
      reason: (entry.reason || "").trim(), shift: "وردية"
    });
  };

  const FNS = ["gameFind", "gameIsActive", "activeGames", "txPrices", "txPricesPush", "txPricesPop",
    "gameSalesTotals", "totals", "addTicket", "addBatch", "deductBatch", "deductOne",
    "gameBreakdown", "appendTxLog", "dayExpenseRow", "archiveDay", "renderSummary", "dayReviewAppendHTML"];
  const body = FNS.map((n) => extractFunction(htmlSrc, n)).join("\n")
    + "\nreturn {" + FNS.map((n) => n + ":" + n).join(",") + "};";

  /* eslint-disable no-new-func */
  const api = new Function("loadJSON", "saveJSON", "uid", "toast", "logErr", "alert",
    "state", "persist", "refreshCounts", "printTicket", "$", "fmtNum", "GAMES",
    "MalahyPerm", "MalahyDailyReport", "shiftOfDate", "businessDateLabel", "businessDayKey",
    "loadReview", "methodText", "shiftBadgeText", "esc", "fmtTime12", "paperKind",
    "logReview", "K_HIST", "K_TXLOG", body)(
      loadJSON, saveJSON, uid, toast, logErr, alert_,
      state, () => saveJSON("malahy_pos_state_v1", state),
      () => { }, () => { },
      $, fmtNum, GAMES,
      MalahyPerm, R,
      () => "وردية", () => "اليوم",
      (ts) => K(new Date(ts).getFullYear(), new Date(ts).getMonth() + 1, new Date(ts).getDate()),
      () => reviews,
      (m) => (m === "elec" ? "إلكتروني" : m === "cash" ? "كاش" : m === "mixed" ? "مختلط" : "—"),
      (s) => String(s || "—"), (s) => String(s == null ? "" : s),
      () => "12:00 م", () => "80", logReview,
      "malahy_pos_history_v1", "malahy_txlog_v1");

  return {
    api, state, store, nodes, toasts, logs, writes, reviews,
    setInput,
    expenses: () => state.expenses,
    gifts: () => state.gifts,
    addExpense(amount, desc, extra) {
      state.expenses.push(Object.assign({ id: uid(), desc: desc || "مصروف", amount: amount }, extra || {}));
      return state.expenses[state.expenses.length - 1];
    },
    addGift(amount, desc) {
      state.gifts.push({ id: uid(), desc: desc || "هدية", amount: amount, seq: state.gifts.length + 1, at: D(2026, 10, 12, 14) });
      return state.gifts[state.gifts.length - 1];
    }
  };
}

/* sells the reference day from real ticket records: 300 cash · 220 electronic · 520 total */
function sellRefDay(env) {
  for (let i = 0; i < 6; i++) env.api.addTicket("G3", "cash");   /* 6 × 50 = 300 */
  for (let i = 0; i < 4; i++) env.api.addTicket("G1", "elec");   /* 4 × 25 = 100 */
  for (let i = 0; i < 4; i++) env.api.addTicket("G4", "elec");   /* 4 × 30 = 120 */
  env.addExpense(90, "كهرباء");
  env.addGift(25, "هدية طفل");
  return env.api.totals();
}

/* يوم مرجعي مطابق لشكل archiveDay/printTodayReport */
function refDay(extra) {
  return Object.assign({
    id: "d1", startedAt: D(2026, 10, 12, 18), endedAt: D(2026, 10, 12, 23),
    dateLabel: "اليوم",
    revenue: 520, cashRevenue: 300, elecRevenue: 220, expenses: 90, gifts: 25,
    net: 430, finalNet: 455,
    tickets: 14, cashTickets: 6, elecTickets: 8,
    breakdown: [
      { name: "دوران", price: 50, count: 6, cashCount: 6, elecCount: 0, total: 300, cashTotal: 300, elecTotal: 0 },
      { name: "القاء", price: 25, count: 4, cashCount: 0, elecCount: 4, total: 100, cashTotal: 0, elecTotal: 100 },
      { name: "قفز", price: 30, count: 4, cashCount: 0, elecCount: 4, total: 120, cashTotal: 0, elecTotal: 120 }
    ],
    expenseList: [{ desc: "كهرباء", amount: 90 }],
    giftList: [{ desc: "هدية طفل", amount: 25, seq: 7, at: D(2026, 10, 12, 20) }]
  }, extra || {});
}

/* =====================================================================
   (1..12) نموذج الحساب — daily-report.js (مصدر حساب تقرير اليوم الوحيد)
   ===================================================================== */
console.log("v2.5.9 — A) daily report model: payment breakdown + final physical cash");
{
  const m = R.dailyReportModel(refDay(), { venue: "V" });

  /* (1) كاش + إلكتروني = مبيعات الألعاب */
  eq("1a game sales keep both payment methods", m.summary.gameSales, 520);
  eq("1b cash payments read from the day record", m.summary.cashSales, 300);
  eq("1c electronic payments read from the day record", m.summary.elecSales, 220);
  eq("1d cash + electronic reconcile with game sales", m.summary.cashSales + m.summary.elecSales, m.summary.gameSales);

  /* (2) مصروفات 90 ⇒ صافي قبل الهدايا/الإلكتروني = 430 */
  eq("2a expenses total", m.summary.expenses, 90);
  eq("2b net before gifts and electronic deduction", m.summary.netBeforeElec, 430);
  eq("2c net equals the application formula revenue - expenses", m.summary.netBeforeElec, 520 - 90);

  /* (3) الهدايا تُضاف (قاعدة النظام القائمة) */
  eq("3a gift sales", m.summary.giftSales, 25);
  eq("3b gifts are added to the pre-electronic final", m.summary.final, 455);
  eq("3c pre-electronic final = net + gifts (existing convention)", m.summary.final, m.summary.netBeforeElec + m.summary.giftSales);

  /* (4) النتيجة المرجعية 235 */
  eq("4a electronic deduction", m.summary.elecDeduction, 220);
  eq("4b FINAL PHYSICAL CASH = 235 for the reference scenario", m.summary.finalCash, 235);
  eq("4c exactly the spec example: (520 - 90 + 25) - 220", m.summary.finalCash, (520 - 90 + 25) - 220);

  /* (5) الخصم مرة واحدة فقط */
  eq("5a final cash = pre-electronic final - one electronic deduction", m.summary.finalCash, m.summary.final - m.summary.elecDeduction);
  ok("5b electronic is NOT deducted twice", m.summary.finalCash !== m.summary.final - 2 * m.summary.elecSales, String(m.summary.finalCash));
  ok("5c electronic is NOT left in the final balance", m.summary.finalCash !== m.summary.final && m.summary.elecSales > 0);
  ok("5d electronic is NOT deducted from game sales", m.summary.gameSales === 520 && m.summary.gameSales !== 300);
  ok("5e total sales still include the electronic amount",
    m.summary.totalSales === 545 && m.summary.totalSales === m.summary.gameSales + m.summary.giftSales);

  /* (6) مبيعات الألعاب لم تتحول إلى كاش فقط */
  ok("6a game sales unchanged by the change", m.summary.gameSales === 520);
  ok("6b electronic tickets still count toward the total ticket statistics",
    m.tickets.total === 14 && m.tickets.cash + m.tickets.elec === m.tickets.total);

  /* (7/8) التذاكر الإلكترونية من السجلات لا من المبلغ */
  eq("7a electronic ticket count from the records", m.tickets.elec, 8);
  eq("7b cash ticket count from the records", m.tickets.cash, 6);
  eq("7c per-game electronic counts are carried through", m.games.filter((g) => g.elecCount > 0).length, 2);
  ok("7d electronic tickets are NOT inferred from the amount (220 / 25 = 8.8 ≠ 8)",
    m.tickets.elec === 8 && Math.round(m.summary.elecSales / 25) === 9);

  /* (9) يوم بلا دفع إلكتروني يحتفظ بإجماليه النهائي */
  const zero = R.dailyReportModel(refDay({ cashRevenue: 520, elecRevenue: 0, elecTickets: 0 }), {});
  eq("9a zero-electronic day keeps its pre-electronic final", zero.summary.final, 455);
  eq("9b zero-electronic day keeps its final physical cash identical", zero.summary.finalCash, 455);
  eq("9c zero electronic deduction is zero", zero.summary.elecDeduction, 0);
  ok("9d a record with no elecRevenue field at all behaves identically",
    R.dailyReportModel(refDay({ elecRevenue: undefined, cashRevenue: undefined }), {}).summary.finalCash === 455);
  const legacy = R.dailyReportModel({ revenue: 500, expenses: 700, gifts: 0, tickets: 3 }, {});
  eq("9e legacy record without any payment split is untouched", legacy.summary.finalCash, legacy.summary.final);

  /* (10) عدة عمليات إلكترونية تُجمع صحيحًا */
  const multi = R.dailyReportModel(refDay({ cashRevenue: 100, elecRevenue: 80 + 60 + 20, elecTickets: 4 + 3 + 1 }), {});
  eq("10a multiple electronic transactions are summed", multi.summary.elecSales, 160);
  eq("10b their final cash", multi.summary.finalCash, 455 - 160);
  eq("10c electronic tickets summed across those transactions", multi.tickets.elec, 8);

  /* (11) كسور عشرية — تقريب مرّة واحدة لكل حقل */
  const frac = R.dailyReportModel({ revenue: 100.005, expenses: 0.005, gifts: 0, elecRevenue: 0.01 }, {});
  eq("11a each amount rounded to 2 decimals once", frac.summary.gameSales, 100.01);
  eq("11b net before electronic", frac.summary.netBeforeElec, 100);
  eq("11c final cash = 100 - 0.01 (deduction applied once)", frac.summary.finalCash, 99.99);

  /* (12) الأرشيف لا يُعاد حسابه/كتابته داخل النموذج */
  eq("12a pre-electronic final preserved", m.summary.final, 455);
  eq("12b net preserved", m.summary.netBeforeElec, 430);
  eq("12c salary total still comes from the salary expense rows", m.summary.salaryTotal, 0);
}

/* =====================================================================
   (13..18) totals() الحقيقية من index.html على سجلات تذاكر حقيقية
   ===================================================================== */
console.log("\nv2.5.9 — B) index.html totals(): real ticket/price records");
{
  const env = makeEnv();
  const t = sellRefDay(env);

  /* (13) أرقام سيناريو المرجع من سجلات حقيقية */
  eq("13a game sales = 520 from the real records", t.revenue, 520);
  eq("13b cash revenue = 300", t.cashRevenue, 300);
  eq("13c electronic revenue = 220", t.elecRevenue, 220);
  eq("13d cash + electronic = game sales", t.cashRevenue + t.elecRevenue, t.revenue);
  eq("13e ticket statistics unchanged (14 = 6 cash + 8 elec)", t.tickets, 14);
  eq("13f electronic ticket count = 8 (actual records)", t.elecTickets, 8);
  eq("13g cash ticket count unchanged = 6", t.cashTickets, 6);
  eq("13h expenses counted", t.expenses, 90);
  eq("13i gifts convention: net + gifts", t.finalNet, (520 - 90) + 25);
  eq("13j electronic deduction is exactly the electronic revenue", t.elecDeduction, 220);
  eq("13k FINAL PHYSICAL CASH = 235", t.finalCash, 235);
  eq("13l finalNet itself is untouched (still the pre-electronic balance)", t.finalNet, 455);

  /* (14) العدد يأتي من السجلات، لا من قسمة المبلغ على السعر */
  eq("14a every electronic ticket has its own price record", env.state.pprices.G1.elec.length, 4);
  ok("14b electronic count is NOT (elecRevenue / one price)",
    t.elecTickets === 8 && Math.round(t.elecRevenue / 25) === 9);
  ok("14c the per-game split sums back to the day totals",
    env.api.gameBreakdown().every((b) => b.cashCount + b.elecCount === b.count && b.cashTotal + b.elecTotal === b.total));

  /* (15) مرتجع إلكتروني: يقلّل المبيعات والعدد معًا ⇒ النقد الفيزيائي لا يتغيّر */
  const before = env.api.totals();
  env.api.deductOne("G1");                       /* تذكرة إلكترونية × 25 */
  const after = env.api.totals();
  eq("15a electronic revenue drops by the refunded price", after.elecRevenue, before.elecRevenue - 25);
  eq("15b electronic ticket count drops by one", after.elecTickets, before.elecTickets - 1);
  eq("15c total tickets drop by one", after.tickets, before.tickets - 1);
  eq("15d FINAL CASH UNCHANGED by an electronic refund (it never entered the drawer)",
    after.finalCash, before.finalCash);
  eq("15e the deduction fell with it (no double effect)", after.elecDeduction, before.elecDeduction - 25);
  ok("15f the refund is not also booked as a gift or an expense",
    env.state.expenses.length === 1 && env.state.gifts.length === 1);
  eq("15g the returns log recorded it once", env.reviews.length, 1);
  eq("15h the log entry is electronic", env.reviews[0].method, "elec");

  /* (16) خصم كاش: النقد الفيزيائي ينخفض بقيمة المرتجع النقدي */
  const b2 = env.api.totals();
  env.setInput("ded-G3", "2"); env.api.deductBatch("G3");   /* 2 × 50 كاش */
  const a2 = env.api.totals();
  eq("16a batch of 2 cash tickets deducted", a2.cashTickets, b2.cashTickets - 2);
  eq("16b electronic untouched by a cash-only batch", a2.elecTickets, b2.elecTickets);
  eq("16c physical cash falls by exactly the refunded cash (100)", a2.finalCash, b2.finalCash - 100);
  env.setInput("ded-G3", "99"); env.api.deductBatch("G3");  /* 99 مطلوب، المتاح أقل */
  const a3 = env.api.totals();
  eq("16d over-deduction clamps to what exists (no negative tickets)", a3.tickets, a3.cashTickets + a3.elecTickets);
  ok("16e no ticket counter went negative", a3.cashTickets >= 0 && a3.elecTickets >= 0);
  ok("16f cash tickets are never counted as electronic", a3.cashTickets >= 0 && a3.elecTickets === b2.elecTickets);

  /* (17) خصم مختلط في عملية واحدة: الكاش أولًا ثم الإلكتروني */
  const env2 = makeEnv();
  for (let i = 0; i < 3; i++) env2.api.addTicket("G1", "cash");
  for (let i = 0; i < 3; i++) env2.api.addTicket("G1", "elec");
  const b4 = env2.api.totals();
  eq("17a a mixed day holds physical cash equal to the cash half only", b4.finalCash, 75);
  env2.setInput("ded-G1", "4"); env2.api.deductBatch("G1");   /* 3 كاش + 1 إلكتروني */
  const a4 = env2.api.totals();
  eq("17b mixed batch: 3 cash removed", a4.cashTickets, 0);
  eq("17c mixed batch: 1 electronic removed", a4.elecTickets, 2);
  eq("17d mixed batch recorded once as 'mixed'", env2.reviews.length, 1);
  eq("17e mixed batch method label", env2.reviews[0].method, "mixed");
  eq("17f physical cash falls only by the 3 refunded cash tickets (75)", a4.finalCash, b4.finalCash - 75);
  eq("17g nothing counted twice", a4.tickets, 2);

  /* (18) يوم إلكتروني خالص مع مصروفات ⇒ رصيد نقدي سالب بلا قصّ أو تعويض */
  const env3 = makeEnv();
  env3.api.addTicket("G2", "elec");                 /* 110 إلكتروني */
  env3.addExpense(500, "صيانة");
  const t3 = env3.api.totals();
  eq("18a no physical cash at all on an electronic-only day", t3.finalCash, -500);
  eq("18b the deduction was still applied once", t3.elecDeduction, 110);
  eq("18c sales are still recorded", t3.revenue, 110);
  ok("18d the value is never clamped to zero", t3.finalCash < 0);
}

/* =====================================================================
   (19..26) تقرير اليوم المطبوع: الخصم في الملخص + التذاكر الإلكترونية
   ===================================================================== */
console.log("\nv2.5.9 — C) printed daily report");
{
  const day = refDay();
  const html58 = R.dayReportHTML(day, { venue: "V", paper: "58" });
  const m = R.dailyReportModel(day, {});

  /* (19) كل بنود التفصيل المطلوبة موجودة بالمبالغ الصحيحة */
  [
    ["مبيعات الألعاب", "520 ج"],
    ["الدفع النقدي", "300 ج"],
    ["الدفع الإلكتروني", "220 ج"],
    ["التذاكر الإلكترونية", "8"],
    ["المصروفات", "90 ج"],
    ["الصافي قبل خصم الإلكتروني", "430 ج"],
    ["الهدايا", "25 ج"],
    ["خصم المبيعات الإلكترونية", "220 ج"],
    ["الإجمالي النهائي النقدي", "235 ج"]
  ].forEach(function (r) {
    ok("19 " + r[0] + " = " + r[1], html58.indexOf(r[0]) !== -1 && html58.indexOf(r[1]) !== -1);
  });
  ok("19x the pre-electronic balance is still shown explicitly", html58.indexOf("الإجمالي قبل خصم الإلكتروني") !== -1);
  eq("19y the printed electronic amount is not the game-sales amount", m.summary.elecSales, 220);

  /* (20) شاشة = مطبوع لنفس اليوم */
  const env4 = makeEnv();
  const scr = sellRefDay(env4);
  ok("20a the on-screen totals reproduce the reference scenario exactly",
    scr.revenue === 520 && scr.cashRevenue === 300 && scr.elecRevenue === 220
    && scr.expenses === 90 && scr.gifts === 25 && scr.tickets === 14
    && scr.cashTickets === 6 && scr.elecTickets === 8 && scr.finalCash === 235, JSON.stringify(scr));
  const printed = R.dailyReportModel({
    revenue: scr.revenue, expenses: scr.expenses, gifts: scr.gifts,
    cashRevenue: scr.cashRevenue, elecRevenue: scr.elecRevenue,
    tickets: scr.tickets, cashTickets: scr.cashTickets, elecTickets: scr.elecTickets
  }, {}).summary.finalCash;
  eq("20b SCREEN AND PRINTED REPORT AGREE on the final cash", printed, scr.finalCash);
  const scrHtml = R.dayReportHTML({
    id: "__today__", startedAt: env4.state.startedAt, endedAt: 0,
    revenue: scr.revenue, expenses: scr.expenses, gifts: scr.gifts,
    cashRevenue: scr.cashRevenue, elecRevenue: scr.elecRevenue,
    tickets: scr.tickets, cashTickets: scr.cashTickets, elecTickets: scr.elecTickets,
    breakdown: env4.api.gameBreakdown(), expenseList: [], giftList: []
  }, { venue: "V", paper: "58" });
  ok("20c the same 235 is printed for the live day", scrHtml.indexOf("الإجمالي النهائي النقدي") !== -1 && scrHtml.indexOf("235 ج") !== -1);

  /* (21) الطباعة/التصدير لا تنشئان عمليات ولا مصروفات */
  const env5 = makeEnv();
  sellRefDay(env5);
  const t5 = env5.api.totals();
  const beforeState = clone(env5.state), beforeWrites = env5.writes.n, beforeStore = clone(env5.store);
  const day5 = Object.assign({ id: "d1", startedAt: env5.state.startedAt, endedAt: 0 },
    { revenue: t5.revenue, expenses: t5.expenses, gifts: t5.gifts, cashRevenue: t5.cashRevenue, elecRevenue: t5.elecRevenue, tickets: t5.tickets, cashTickets: t5.cashTickets, elecTickets: t5.elecTickets },
    { breakdown: env5.api.gameBreakdown(), expenseList: env5.state.expenses.map(env5.api.dayExpenseRow), giftList: [] });
  ["58", "80", "a4"].forEach((p) => R.dayReportHTML(day5, { venue: "V", paper: p }));
  R.dailyReportModel(day5, {});
  env5.api.dayReviewAppendHTML(day5);
  ok("21a printing changed no ticket/expense/gift state", JSON.stringify(env5.state) === JSON.stringify(beforeState));
  ok("21b printing wrote nothing to storage", env5.writes.n === beforeWrites && JSON.stringify(env5.store) === JSON.stringify(beforeStore));
  eq("21c no expense record was created for the electronic payment", env5.state.expenses.length, 1);
  ok("21d the real expenses list is untouched (not simulated)",
    env5.state.expenses.length === 1 && env5.state.expenses[0].desc === "كهرباء");

  /* (22) العروض 58mm و80mm وA4 تبقى مقروءة وضمن عرضها */
  function stripHtml(s) { return String(s).replace(/<[^>]*>/g, ""); }
  function rowsOf(h) {
    const out = [];
    const re = /<div class="r(?: b| big b)?"><span class="l">([\s\S]*?)<\/span><span class="v num">([\s\S]*?)<\/span><\/div>/g;
    let m2;
    while ((m2 = re.exec(h))) out.push({ lab: stripHtml(m2[1]), val: stripHtml(m2[2]) });
    return out;
  }
  const PAPERS = { "58": { bodyWmm: 48, fs: 11 }, "80": { bodyWmm: 72, fs: 12 } };
  Object.keys(PAPERS).forEach(function (p) {
    const cfg = PAPERS[p];
    const h = R.dayReportHTML(day, { venue: "V", paper: p });
    const css = R.paperCSS(p);
    ok(p + ": body width unchanged (" + cfg.bodyWmm + "mm)", css.indexOf("width:" + cfg.bodyWmm + "mm") !== -1);
    ok(p + ": font size unchanged (" + cfg.fs + "px)", css.indexOf("font-size:" + cfg.fs + "px") !== -1);
    ok(p + ": values stay on one line (nowrap) while labels may wrap (min-width:0)",
      css.indexOf("white-space:nowrap") !== -1 && css.indexOf("min-width:0") !== -1);
    const availPx = (cfg.bodyWmm - 4) / 25.4 * 96;             /* عرض المحتوى بالبكسل */
    const perChar = cfg.fs * 0.62;                              /* تقدير متحفّظ لعرض المحرف */
    const worst = rowsOf(h).reduce(function (acc, r) {
      const chars = r.lab.length + r.val.length + 2;
      return Math.max(acc, perChar * chars);                    /* الأسوأ ضمن صفّ بخط عادي */
    }, 0);
    ok(p + ": no row overflows its paper (" + Math.round(worst) + "px <= " + Math.round(2 * availPx) + "px for <=2 lines)",
      worst <= 2 * availPx, String(Math.round(worst)));
    ok(p + ": no table / no inline width (thermal overflow risk)", h.indexOf("<table") === -1 && !/style\s*=\s*"[^"]*width/.test(h));
    ok(p + ": RTL Arabic document", h.indexOf('lang="ar" dir="rtl"') !== -1);
    ok(p + ": numbers are LTR-isolated", h.indexOf('class="v num"') !== -1 && css.indexOf("unicode-bidi:embed") !== -1);
    ok(p + ": balanced div tags", (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length);
  });
  const a4h = R.dayReportHTML(day, { venue: "V", paper: "a4" });
  ok("a4: page size/margins unchanged", R.paperCSS("a4").indexOf("@page{size:A4;margin:12mm;}") !== -1);
  ok("a4: same calculations as thermal", a4h.indexOf("235 ج") !== -1 && a4h.indexOf("520 ج") !== -1);
  ok("a4: no page-break rule introduced", !/page-break|break-after|break-before/.test(R.paperCSS("a4")));

  /* (23) أقسام التقرير وترتيبها كما هي + سجل المرتجعات في النهاية */
  const review = '<div class="hr"></div><div class="c b" data-sec="review">🧾 سجل المرتجعات</div><div class="hr"></div>';
  const hR = R.dayReportHTML(day, { venue: "V", paper: "58", reviewHTML: review });
  const idx = {};
  R.SECTION_ORDER.forEach(function (s) { idx[s] = hR.indexOf('data-sec="' + s + '"'); });
  ok("23a all established sections still present", R.SECTION_ORDER.every(function (s) { return idx[s] !== -1; }));
  ok("23b section order preserved",
    R.SECTION_ORDER.slice(0, -1).every(function (s, i) { return idx[s] < idx[R.SECTION_ORDER[i + 1]]; }));
  ok("23c returns log still last, after tickets and the footer",
    idx.tickets < idx.review && hR.indexOf("© نظام الحسابات") < idx.review);

  /* (24) سجل المرتجعات سليم ولا يتكرر ولا يكتب */
  const env6 = makeEnv();
  env6.api.addTicket("G1", "elec");
  env6.api.deductOne("G1");
  env6.reviews.push({ id: "r1", ts: D(2026, 10, 12, 15), game: "القاء", qty: 1, price: 25, total: 25, type: "خصم", method: "elec", shift: "الوردية الأولى", reason: "تذكرة تالفة" });
  const writesBefore = env6.writes.n, stateBefore = clone(env6.state);
  const rhtml = env6.api.dayReviewAppendHTML({ startedAt: D(2026, 10, 12, 10) });
  ok("24a returns log rendered with its entries", rhtml.indexOf('data-sec="review"') !== -1 && rhtml.indexOf("تذكرة تالفة") !== -1);
  ok("24b returns log keeps its totals", rhtml.indexOf("عدد العمليات") !== -1 && rhtml.indexOf("إجمالي القيمة") !== -1);
  ok("24c rendering the returns log wrote nothing", env6.writes.n === writesBefore && JSON.stringify(env6.state) === JSON.stringify(stateBefore));

  /* (25) مصروفات الرواتب: البنود والإجمالي الفرعي كما هي */
  const payDay = refDay({
    expenses: 1770,
    expenseList: [
      { desc: "راتب طه | المصروف 250 ج", amount: 250, isSalary: true },
      { desc: "راتب أسماء | المصروف 425 ج", amount: 425, isSalary: true },
      { desc: "راتب محمود | المصروف 495 ج", amount: 495, isSalary: true },
      { desc: "كهرباء", amount: 600 }
    ]
  });
  const mp = R.dailyReportModel(payDay, {});
  const hp = R.dayReportHTML(payDay, { venue: "V", paper: "58" });
  /* نفس اليوم بلا بنود الرواتب ⇒ المرجع لمقارنة عدد الأقسام */
  const baseP = R.dayReportHTML(refDay({
    expenses: 1770,
    expenseList: [{ desc: "رواتب", amount: 1170 }, { desc: "كهرباء", amount: 600 }]
  }), { venue: "V", paper: "58" });
  eq("25a salary subtotal = sum of the actual salary rows", mp.summary.salaryTotal, 1170);
  eq("25b general expenses total still includes salaries", mp.summary.expenses, 1770);
  eq("25c salary expenses are counted once in the final cash", mp.summary.finalCash, (520 - 1770 + 25) - 220);
  ok("25d the salary subtotal is printed once", (hp.match(/إجمالي الرواتب المصروفة/g) || []).length === 1);
  ok("25e one compact line per employee", (hp.match(/class="pw/g) || []).length === 4);
  ok("25f the payroll block adds no section of its own",
    (hp.match(/data-sec="/g) || []).join("|") === (baseP.match(/data-sec="/g) || []).join("|"));
  ok("25g the compact line never glues the label to the number", !/المصروف\d/.test(hp));

  /* (26) لا صفحة/فاصل إضافي — الفرق 5 سطور فقط داخل قسم الملخّص */
  const sumRows = function (h) { return (h.slice(h.indexOf('data-sec="summary"'), h.indexOf('data-sec="tickets"')).match(/class="r/g) || []).length; };
  eq("26a summary grew by exactly 5 rows (3 payment + deduction + final cash)", sumRows(hR), 11);
  eq("26b the returns log is the only source of extra separators",
    (hR.match(/class="hr"/g) || []).length - (R.dayReportHTML(day, { venue: "V", paper: "58" }).match(/class="hr"/g) || []).length, 2);
  ok("26c no page-break rule was introduced anywhere",
    ["58", "80", "a4"].every((p) => !/page-break|break-after|break-before/.test(R.paperCSS(p))));
}

/* =====================================================================
   (27..31) الأرشيف والتقرير التاريخي — بيانات محفوظة بلا إعادة كتابة
   ===================================================================== */
console.log("\nv2.5.9 — D) history: archived + legacy days");
{
  const env = makeEnv();
  const t = sellRefDay(env);

  /* يوم قديم محفوظ قبل v2.5.9 (بلا حقول الدفع) */
  env.store.malahy_pos_history_v1 = [
    { id: "old1", startedAt: D(2026, 10, 10, 10), endedAt: D(2026, 10, 10, 22), dateLabel: "الأحد 10 أكتوبر 2026",
      revenue: 800, expenses: 200, gifts: 0, net: 600, finalNet: 600, tickets: 20,
      breakdown: [{ name: "القاء", price: 40, count: 20, cashCount: 20, elecCount: 0, total: 800 }], expenseList: [], giftList: [] }
  ];
  const histBefore = clone(env.store.malahy_pos_history_v1);

  /* (27) الأرشفة تحفظ كل الحقول اللازمة */
  const okArch = env.api.archiveDay(t);
  ok("27a archiving succeeded", okArch !== false);
  const rec = env.store.malahy_pos_history_v1[0];
  eq("27b archived revenue unchanged (electronic still counts as sales)", rec.revenue, 520);
  eq("27c archived cashRevenue saved", rec.cashRevenue, 300);
  eq("27d archived elecRevenue saved", rec.elecRevenue, 220);
  eq("27e archived electronic ticket count saved", rec.elecTickets, 8);
  eq("27f archived finalNet still the pre-electronic balance", rec.finalNet, 455);

  /* (28) التقرير التاريخي يُحسب من بياناته المحفوظة */
  const hm = R.dailyReportModel(rec, {});
  eq("28a the historical day prints the correct physical cash", hm.summary.finalCash, 235);
  eq("28b historical electronic deduction", hm.summary.elecDeduction, 220);
  ok("28c the historical printed report shows 235",
    R.dayReportHTML(rec, { venue: "V", paper: "80" }).indexOf("الإجمالي النهائي النقدي") !== -1
    && R.dayReportHTML(rec, { venue: "V", paper: "80" }).indexOf("235 ج") !== -1);

  /* (29) السجل القديم بلا بيانات دفع يبقى كما هو تمامًا */
  const oldRec = env.store.malahy_pos_history_v1[1];
  const om = R.dailyReportModel(oldRec, {});
  eq("29a the legacy day keeps its old final total", om.summary.finalCash, 600);
  eq("29b the legacy day deduction is zero", om.summary.elecDeduction, 0);
  eq("29c the legacy day cash falls back to the whole revenue", om.summary.cashSales, 800);
  eq("29d the legacy day electronic defaults to zero", om.summary.elecSales, 0);
  ok("29e the legacy printed report keeps its old final total", R.dayReportHTML(oldRec, { venue: "V", paper: "58" }).indexOf("600 ج") !== -1);

  /* (30) لا إعادة كتابة لسجل التاريخ */
  R.dayReportHTML(rec, { venue: "V", paper: "80" });
  ok("30a the pre-existing history entry was never rewritten",
    JSON.stringify(env.store.malahy_pos_history_v1[1]) === JSON.stringify(histBefore[0]));
  eq("30b the new entry was only prepended", env.store.malahy_pos_history_v1.length, 2);

  /* (31) تفصيل الألعاب الإلكترونية يبقى متسقًا */
  const bd = env.api.gameBreakdown();
  eq("31a per-game electronic revenue sums to the day total", bd.reduce((s, b) => s + b.elecTotal, 0), 220);
  eq("31b per-game electronic counts sum to the day total", bd.reduce((s, b) => s + b.elecCount, 0), 8);
  ok("31c per-game cash + electronic = per-game total", bd.every((b) => b.cashTotal + b.elecTotal === b.total));
}

/* =====================================================================
   (32..34) شاشة «ملخص حساب اليوم»
   ===================================================================== */
console.log("\nv2.5.9 — E) on-screen Daily Account Summary");
{
  function srow(id) {
    const m = new RegExp('id="' + id + '"').exec(htmlSrc);
    if (!m) return null;
    return htmlSrc.slice(htmlSrc.lastIndexOf('<div class="srow', m.index), m.index + 260);
  }

  /* (32) بنود الملخص موجودة بالمعرّفات والعناوين المطلوبة */
  ok("32a game sales row", /id="sumRevenue"/.test(htmlSrc) && /مبيعات الألعاب/.test(srow("sumRevenue")));
  ok("32b cash payments row", /id="sumCash"/.test(htmlSrc) && /كاش/.test(srow("sumCash")));
  ok("32c electronic payments row", /id="sumElec"/.test(htmlSrc) && /إلكتروني/.test(srow("sumElec")));
  ok("32d electronic ticket count row", /id="sumElecTickets"/.test(htmlSrc) && /التذاكر الإلكترونية/.test(srow("sumElecTickets")));
  ok("32e expenses row", /id="sumExpenses"/.test(htmlSrc) && /المصروفات/.test(srow("sumExpenses")));
  ok("32f net-before-electronic row", /id="sumNet"/.test(htmlSrc) && /الصافي قبل خصم الإلكتروني/.test(srow("sumNet")));
  ok("32g gifts row", /id="sumGifts"/.test(htmlSrc) && /الهدايا/.test(srow("sumGifts")));
  ok("32h pre-electronic balance row", /id="sumBeforeElec"/.test(htmlSrc) && /الإجمالي قبل خصم الإلكتروني/.test(srow("sumBeforeElec")));
  ok("32i electronic deduction row", /id="sumElecDeduct"/.test(htmlSrc) && /خصم المبيعات الإلكترونية/.test(srow("sumElecDeduct")));
  ok("32j final physical cash row", /id="sumFinalCash"/.test(htmlSrc) && /الإجمالي النهائي النقدي/.test(srow("sumFinalCash")));
  ok("32k the ambiguous old final-row id is gone", htmlSrc.indexOf('id="sumFinal"') === -1);
  ok("32l the scoreboard final cell is labelled physical cash",
    /الإجمالي النهائي النقدي[\s\S]{0,140}id="scFinal"/.test(htmlSrc));

  /* (33) renderSummary يكتب الأرقام الصحيحة في الخلايا الصحيحة */
  const env = makeEnv();
  sellRefDay(env);
  env.api.renderSummary();
  const v = (id) => (env.nodes[id] ? env.nodes[id].textContent : null);
  const h = (id) => (env.nodes[id] ? env.nodes[id].innerHTML : null);
  eq("33a screen shows game sales 520", v("sumRevenue"), "520");
  eq("33b screen shows cash 300", v("sumCash"), "300");
  eq("33c screen shows electronic 220", v("sumElec"), "220");
  eq("33d screen shows 8 electronic tickets", v("sumElecTickets"), "8");
  eq("33e screen shows expenses 90", v("sumExpenses"), "90");
  eq("33f screen shows net 430", v("sumNet"), "430");
  eq("33g screen shows gifts 25", v("sumGifts"), "25");
  eq("33h screen shows the pre-electronic balance 455", v("sumBeforeElec"), "455");
  eq("33i screen shows the electronic deduction 220", v("sumElecDeduct"), "220");
  eq("33j SCREEN FINAL PHYSICAL CASH = 235", v("sumFinalCash"), "235");
  ok("33k the scoreboard shows the same 235", /235/.test(h("scFinal")));
  eq("33l the scoreboard revenue is still 520", v("scRevenue"), "520");
  eq("33m the scoreboard ticket total is still 14", v("scTickets"), "14");
  eq("33n the scoreboard net is still 430", h("scNet"), "430 <span class=\"u\">ج</span>");
  ok("33o nothing was written into the removed id", env.nodes.sumFinal === undefined);

  /* (34) إعادة الرسم عملية عرض فقط */
  const writes0 = env.writes.n, toasts0 = env.toasts.length;
  env.api.renderSummary();
  eq("34a re-rendering the summary writes nothing to storage", env.writes.n, writes0);
  eq("34b re-rendering raises no toast", env.toasts.length, toasts0);
}

/* =====================================================================
   (35..36) ثوابت المحاسبة غير القابلة للتفاوض
   ===================================================================== */
console.log("\nv2.5.9 — F) non-negotiable invariants");
{
  const env = makeEnv();
  const snap = clone(env.state);
  env.api.addTicket("G1", "cash"); env.api.addTicket("G1", "elec");
  ok("35a a ticket sale creates NO expense record", env.state.expenses.length === 0);
  ok("35b a ticket sale creates NO gift record", env.state.gifts.length === 0);
  ok("35c a ticket sale only touches counts/prices",
    env.state.counts.G1 === 1 && env.state.ecounts.G1 === 1 && env.state.pprices.G1.elec.length === 1);
  ok("35d the state before the sale had no expenses", snap.expenses.length === 0);
  eq("35e the real expenses list is still empty", env.expenses().length, 0);

  const t = env.api.totals();
  eq("36a electronic revenue is still part of revenue", t.revenue, 50);
  eq("36b electronic revenue reported separately", t.elecRevenue, 25);
  eq("36c ticket statistics unchanged", t.tickets, 2);
  eq("36d final physical cash = cash half only", t.finalCash, 25);
  eq("36e identity: finalCash = revenue - expenses + gifts - elec", t.finalCash, t.revenue - t.expenses + t.gifts - t.elecRevenue);
  ok("36f applied exactly once (a second deduction would give 0)", t.finalCash === 25);

  /* مصدر واحد للحساب: totals() وdaily-report.js متطابقان على نفس اليوم */
  const agree = R.dailyReportModel({
    revenue: t.revenue, expenses: t.expenses, gifts: t.gifts,
    cashRevenue: t.cashRevenue, elecRevenue: t.elecRevenue,
    tickets: t.tickets, cashTickets: t.cashTickets, elecTickets: t.elecTickets
  }, {}).summary;
  eq("36g the report model agrees with the app totals", agree.finalCash, t.finalCash);
  eq("36h the report model agrees on the pre-electronic balance", agree.final, t.finalNet);
  eq("36i the report model agrees on the deduction", agree.elecDeduction, t.elecDeduction);
  ok("36j only the final physical cash differs from the old figure",
    agree.finalCash === t.finalNet - t.elecRevenue && t.finalNet === 50);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);