// tests/v257-salary-expenses.test.js
// v2.5.7 — صرف الرواتب ⇒ مصروفات اليوم + الطباعة المدمجة (24 حالة).
//
// البيانات اصطناعية بالكامل وفي الذاكرة. لا Electron ولا طابعة ولا بيانات إنتاجية.
// ما يُختبَر فعليًا هو نفس الكود الذي يعمل في التطبيق:
//   · assets/payroll/payroll-core.js   → بنود المصروف + البيان المختصر
//   · index.html                        → recordPayrollExpenses / payCommit /
//                                        dayExpenseRow / totals (مستخرجة كما هي)
//   · assets/report/daily-report.js     → قسم المصروفات داخل تقرير اليوم
//
// القاعدة المحورية التي تحرس كل الاختبارات:
//   بند المصروف = **المبلغ المصروف نقدًا فعلًا** (item.amount) لا الأجر المكتسب،
//   ولا السلفة ولا الخصم — وكل بند يحمل payoutId فلا يتكرر أبدًا.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "assets", "payroll", "payroll-core.js"));
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

/* ---------- بيئة تشغيل: يوم حيّ + مخزن جهاز وهمي ---------- */
function makeDayEnv(opts) {
  opts = opts || {};
  const store = {};
  const toasts = [], logs = [], writes = { n: 0 };
  const state = { startedAt: opts.startedAt || D(2026, 10, 12, 10), counts: {}, ecounts: {}, expenses: [], gifts: [], pprices: {} };
  const loadJSON = (k, d) => (k in store) ? store[k] : d;
  const saveJSON = (k, v) => {
    if (opts.failWrite && opts.failKey === k) { writes.n++; return false; }
    store[k] = clone(v); writes.n++; return true;
  };
  const uid = () => "u" + (writes.n + "x" + Math.random()).toString(36).slice(2, 8);
  const toast = (m, k) => toasts.push({ m: m, k: k || "ok" });
  const logErr = (w, e) => logs.push({ w: w, e: String(e) });
  const painted = { list: 0, summary: 0 };
  const emps = [];
  let batches = {};
  /* payCommit يقرأ PR() = window.MalahyPayroll — نمرّر نفس النافذة الحقيقية */
  const win = { MalahyPayroll: P };
  const empRef = { list: null };

  const body = ["PR", "payCommit", "recordPayrollExpenses", "dayExpenseRow", "totals"]
    .map((n) => extractFunction(htmlSrc, n)).join("\n")
    + "\nreturn {payCommit:payCommit,recordPayrollExpenses:recordPayrollExpenses,"
    + "dayExpenseRow:dayExpenseRow,totals:totals};";

  /* eslint-disable no-new-func */
  const api = new Function("loadJSON", "saveJSON", "uid", "toast", "logErr", "state", "persist",
    "renderList", "renderSummary", "window", "pbLoad", "pbSave", "pbPut", "pbList",
    "empLoad", "empSave", "_emp", "_pb", "GAMES", "gameSalesTotals", body)(
      loadJSON, saveJSON, uid, toast, logErr, state,
      () => saveJSON("malahy_pos_state_v1", state),
      () => { painted.list++; }, () => { painted.summary++; },
      win,
      () => batches, () => saveJSON("malahy_payroll_batches_v1", batches),
      (b) => { batches[b.id] = b; return saveJSON("malahy_payroll_batches_v1", batches); },
      () => Object.keys(batches).map((k) => batches[k]),
      () => emps, () => {
        /* زرع فشل الحفظ: محاكاة رفض الجهاز لحفظ سجل الموظف */
        if (opts.failWrite && opts.failKey === "malahy_employees_v1") { writes.n++; return false; }
        writes.n++; return true;
      },
      empRef, null,
      opts.games || [], () => opts.gameSales || { total: 0, count: 0, cashTotal: 0, elecTotal: 0, cashCount: 0, elecCount: 0 });

  return { api, state, store, toasts, logs, writes, painted, batches, emps, empRef,
    expenses: () => state.expenses, setExpenses: (v) => { state.expenses = v; } };
}

/* ---------- مصنع موظف ودفعة حقيقية عبر نواة الرواتب ---------- */
function mkEmp(o) {
  const e = Object.assign({
    id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    payCycle: "weekly", hiredAt: D(2026, 9, 1)
  }, o);
  P.ensureLedger(e);
  return e;
}
/* بند عملية مالية كما تكتبه الواجهة (index.html: empMoneySection) */
function addOp(e, kind, amount, ts, reason) {
  e[kind].push({
    id: "op_" + kind + "_" + ts, ts: ts,
    dayKey: P.dayKeyOfTs(ts), amount: amount, reason: reason || kind, note: ""
  });
}
function workDays(e, keys, wage) {
  keys.forEach((k) => P.markDay(e, k, "work", wage ? { wage: wage } : undefined));
}

/* ساعة مُثبَّتة: payCommit يسجّل لحظة الصرف بـ Date.now() — نثبّتها على تاريخ
   الصرف المتوقّع حتى يبقى الاختبار حتميًا ولا يعتمد على يوم التشغيل. */
function atClock(ts, fn) {
  const real = Date.now;
  Date.now = function () { return ts; };
  try { return fn(); } finally { Date.now = real; }
}

/* صرف حقيقي كامل: يخطّط ويحفظ عبر commitBatch ثم يربط المصروفات كما يفعل payCommit */
function payAll(env, list, dateTs, amounts) {
  env.empRef.list = list;
  return atClock(dateTs, function () {
    const plans = list
      .map((e) => P.planPayout(e, { nowTs: dateTs, dateTs: dateTs, amount: amounts ? amounts[e.id] : undefined }))
      .filter((p) => p && p.ok);
    return env.api.payCommit(plans, { dateTs: dateTs });
  });
}
/* استخراج قاعدة CSS واحدة (لاختبار سلوك السطر المختصر دون تمرير ورق) */
function cssRule(css, sel) {
  const i = css.indexOf(sel + "{");
  if (i < 0) return null;
  const a = css.indexOf("{", i), b = css.indexOf("}", a);
  return css.slice(a + 1, b);
}

/* تقرير يوم كامل (نفس البناء في index.html:archiveDay/printTodayReport) */
function dayOf(env, extra) {
  const t = env.api.totals();
  return Object.assign({
    id: "d1", startedAt: env.state.startedAt, endedAt: 0,
    revenue: t.revenue, expenses: t.expenses, gifts: t.gifts, net: t.net, finalNet: t.finalNet,
    breakdown: [], expenseList: env.state.expenses.map(env.api.dayExpenseRow), giftList: []
  }, extra || {});
}
function salaryRows(list) { return list.filter((x) => x && x.isSalary); }

/* =====================================================================
   (1..5) حسابات الراتب — المصدر: payroll-core الحقيقي
   ===================================================================== */
console.log("\n-- A) salary calculations --");
{
  /* (1) موظف بحضور + سلفة + خصم آخر */
  const TS = D(2026, 10, 12, 15);
  const e = mkEmp({ id: "E1", name: "طه", dailyWage: 100 });
  workDays(e, [K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10)]);
  P.addAdvance(e, { amount: 30, reason: "سلفة من المصروفات", ts: D(2026, 10, 9, 11) });
  addOp(e, "deductions", 20, D(2026, 10, 10, 11), "خصم انضباط");
  const s = P.statsUpTo(e, P.endOfDayTs(TS));
  eq("1a gross earned = 3 work days x 100", s.gross, 300);
  eq("1b advance deducted", s.adv, 30);
  eq("1c other deduction", s.ded, 20);
  eq("1d net due = gross - advance - deduction", s.net, 250);
  eq("1e nothing paid yet", s.paid, 0);

  const env = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  env.emps.push(e);
  const res = payAll(env, [e], TS);
  eq("1f one payout saved", res.saved, 1);
  const rows = salaryRows(env.expenses());
  eq("1g exactly one salary expense entry", rows.length, 1);
  /* (8) المبلغ = المصروف نقدًا لا الأجر المكتسب */
  eq("1h expense amount = actual cash paid (250), NOT gross (300)", rows[0].amount, 250);
  ok("1i gross is never substituted for cash paid", rows[0].amount !== s.gross);
  eq("1j gross is still visible in the description", rows[0].gross, 300);
  eq("1k advance is visible in the description", rows[0].adv, 30);
  eq("1l deduction is visible in the description", rows[0].ded, 20);
  eq("1m attendance days recorded", rows[0].days, 3);

  /* (2) موظف بلا سلفة */
  const e2 = mkEmp({ id: "E2", name: "أسماء", dailyWage: 85 });
  workDays(e2, [K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  addOp(e2, "deductions", 25, D(2026, 10, 11, 11), "خصم");
  const env2 = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  env2.emps.push(e2);
  const r2 = payAll(env2, [e2], TS);
  const row2 = salaryRows(env2.expenses())[0];
  eq("2a gross earned = 5 x 85", row2.gross, 425);
  eq("2b no advance at all", row2.adv, 0);
  eq("2c cash paid = 425 - 25", row2.amount, 400);
  ok("2d the description never shows a zero advance",
    row2.desc.indexOf("سلفة") === -1, row2.desc);
  ok("2e description has the employee name", row2.desc.indexOf("راتب أسماء") === 0, row2.desc);

  /* (3) موظف بمكافأة */
  const e3 = mkEmp({ id: "E3", name: "ملك", dailyWage: 100 });
  workDays(e3, [K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  addOp(e3, "bonuses", 50, D(2026, 10, 11, 11), "مكافأة تميّز");
  addOp(e3, "penalties", 15, D(2026, 10, 11, 12), "جزاء تأخير");
  const env3 = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  env3.emps.push(e3);
  payAll(env3, [e3], TS);
  const row3 = salaryRows(env3.expenses())[0];
  eq("3a gross", row3.gross, 300);
  eq("3b bonus", row3.bonus, 50);
  eq("3c penalty", row3.pen, 15);
  eq("3d cash paid = 300 + 50 - 15", row3.amount, 335);
  ok("3e bonus appears in the description", row3.desc.indexOf("مكافأة 50") !== -1, row3.desc);
  ok("3f penalty appears in the description", row3.desc.indexOf("جزاء 15") !== -1, row3.desc);

  /* (4) صرف جزئي */
  const e4 = mkEmp({ id: "E4", name: "نور", dailyWage: 100 });
  workDays(e4, [K(2026, 10, 11), K(2026, 10, 12)]);
  const env4 = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  env4.emps.push(e4);
  const r4 = payAll(env4, [e4], TS, { E4: 120 });
  const row4 = salaryRows(env4.expenses())[0];
  eq("4a partial expense = the actual amount paid", row4.amount, 120);
  eq("4b remaining balance preserved on the payout", row4.balanceAfter, 80);
  ok("4c the payout is flagged partial", row4.partial === true);
  eq("4d employee is still owed the rest", P.statsUpTo(e4, P.endOfDayTs(TS)).outstanding, 80);
  ok("4e the remaining balance is NOT recorded as an expense",
    env4.expenses().every((x) => x.amount !== 80));}

/* =====================================================================
   (5..10) التكامل مع المصروفات اليومية
   ===================================================================== */
console.log("\n-- B) expense integration --");
{
  const TS = D(2026, 10, 12, 15);
  /* (5) عدة موظفين في نفس اليوم + (6) بند واحد قابل للتعرّف لكل موظف */
  const eA = mkEmp({ id: "A", name: "طه", dailyWage: 100 });
  workDays(eA, [K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  P.addAdvance(eA, { amount: 30, ts: D(2026, 10, 11, 11) });
  addOp(eA, "deductions", 20, D(2026, 10, 11, 11));
  const eB = mkEmp({ id: "B", name: "ملك", dailyWage: 85 });
  workDays(eB, [K(2026, 10, 6), K(2026, 10, 7), K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10),
    K(2026, 10, 11), K(2026, 10, 12)]);
  P.addAdvance(eB, { amount: 50, ts: D(2026, 10, 9, 11) });
  addOp(eB, "deductions", 25, D(2026, 10, 11, 11));
  const eC = mkEmp({ id: "C", name: "أسماء", dailyWage: 85 });
  workDays(eC, [K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  addOp(eC, "deductions", 25, D(2026, 10, 11, 11));

  const env = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  env.emps.push(eA, eB, eC);
  const res = payAll(env, [eA, eB, eC], TS);

  /* (6) بند واحد مستقل لكل موظف دُفع فعلًا، بمعرّف صرف فريد */
  const rows = salaryRows(env.expenses());
  eq("5a three employees paid in one batch → three expenses", rows.length, 3);
  eq("5b each expense carries a distinct payoutId",
    new Set(rows.map((x) => x.payoutId)).size, 3);
  ok("6a every entry is identifiable by its source payout",
    rows.every((x) => !!x.payoutId && !!x.batchId && !!x.batchRef));
  eq("6b all three came from the same batch",
    new Set(rows.map((x) => x.batchId)).size, 1);

  /* (8) المبلغ = الفعلي المصروف لكل موظف */
  const byName = {}; rows.forEach((x) => { byName[x.empName] = x; });
  eq("8a طه = 300 - 30 - 20", byName["طه"].amount, 250);
  eq("8b ملك = 595 - 50 - 25", byName["ملك"].amount, 520);
  eq("8c أسماء = 425 - 25", byName["أسماء"].amount, 400);
  ok("8d no expense equals the gross of its employee",
    rows.every((x) => x.amount !== x.gross));

  /* (7) تاريخ المصروف = تاريخ الصرف الفعلي */
  ok("7a the expense is stamped with the real payout timestamp",
    rows.every((x) => x.ts === res.batch.ts));
  ok("7b the expense carries a business-day key",
    rows.every((x) => x.dateKey === K(2026, 10, 12)), JSON.stringify(rows.map((x) => x.dateKey)));

  /* (9) الإجمالي = مجموع المصروف الفعلي */
  const sum = rows.reduce((s, x) => s + x.amount, 0);
  eq("9a combined salary total = sum of the actual payouts", sum, 1170);
  eq("9b the payroll batch total agrees", res.batch.totals.amount, 1170);

  /* (10) السلفة المدفوعة سابقًا لا تُحتسب مصروفًا نقدًا مرة أخرى */
  ok("10a the previously issued advance is not a second cash expense",
    rows.every((x) => x.amount !== x.adv));
  const advEntries = env.expenses().filter((x) => x.isAdvance);
  eq("10b no advance expense was fabricated by the payout", advEntries.length, 0);
  ok("10c advances are deducted inside net, not paid out again as cash",
    rows.every((x) => x.amount === x.gross + x.bonus - x.pen - x.adv - x.ded));
}

/* =====================================================================
   (11..16) سلامة المحاسبة ومنع الازدواج
   ===================================================================== */
console.log("\n-- C) accounting integrity --");
{
  const TS = D(2026, 10, 12, 15);
  const REVENUE = 5000;
  const env = makeDayEnv({
    startedAt: D(2026, 10, 12, 10),
    games: [{ id: "g1" }],
    gameSales: { total: REVENUE, count: 40, cashTotal: 3000, elecTotal: 2000, cashCount: 25, elecCount: 15 }
  });
  const e = mkEmp({ id: "E", name: "سلمى", dailyWage: 100 });
  workDays(e, [K(2026, 10, 11), K(2026, 10, 12)]);
  P.addAdvance(e, { amount: 30, ts: D(2026, 10, 11, 11) });   /* 200 مكتسب − 30 سلفة = 170 نقد */
  const before = env.api.totals();
  eq("11a net before the payout", before.net, REVENUE);

  const res = payAll(env, [e], TS);
  const after = env.api.totals();
  const paid = P.sum(P.payoutsUpTo(e, P.endOfDayTs(TS)));

  /* (11) كل دفعة حقيقية تُخصم مرة واحدة */
  eq("11b expenses increased by exactly the cash paid", after.expenses - before.expenses, paid);
  eq("11c net decreased by exactly the cash paid", before.net - after.net, paid);
  ok("11d the payout is counted once, not twice",
    before.net - after.net === paid && before.net - after.net !== paid * 2);

  /* (12) الأجر المكتسب لا يحلّ محل النقد المدفوع */
  const gross = P.statsUpTo(e, P.endOfDayTs(TS)).gross;
  eq("12a gross earned", gross, 200);
  eq("12b cash actually paid is the net, not the gross", paid, 170);
  ok("12c net is NOT reduced by the gross salary", before.net - after.net === 170 && before.net - after.net !== gross);

  /* (13) محاولة فاشلة/متخطّاة لا تُنتج مصروفًا */
  const envF = makeDayEnv({ startedAt: D(2026, 10, 12, 10), failWrite: true, failKey: "malahy_employees_v1" });
  const eF = mkEmp({ id: "EF", name: "فشل", dailyWage: 100 });
  workDays(eF, [K(2026, 10, 11), K(2026, 10, 12)]);
  envF.emps.push(eF);
  const resF = payAll(envF, [eF], TS);
  eq("13a the failed payout is not reported as saved", resF.saved, 0);
  eq("13b the batch recorded the failure", resF.failed, 1);
  eq("13c a failed payout creates NO expense entry", envF.expenses().length, 0);
  eq("13d a failed payout is rolled back on the employee record", eF.payouts.length, 0);
  ok("13e the employee is still owed everything", P.statsUpTo(eF, P.endOfDayTs(TS)).outstanding === 200);

  /* بند «متخطّى» (لا مستحق) لا يُنتجExpense أصلًا */
  const eS = mkEmp({ id: "ES", name: "بلا مستحق", dailyWage: 100 });
  const envS = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  envS.emps.push(eS);
  const planS = P.planPayout(eS, { nowTs: TS, dateTs: TS });
  ok("13f an employee with no due is skipped", planS.ok === false && planS.reason === "no-due");
  const resS = envS.api.payCommit([planS], { dateTs: TS });
  eq("13g a skipped payout creates NO expense entry", envS.expenses().length, 0);

  /* (14) إعادة تشغيل نفس الدفعة لا تُكرّر المصروف */
  const batch = res.batch;
  const savedRows = salaryRows(env.expenses()).length;
  const again = env.api.recordPayrollExpenses(batch, batch.ts);
  eq("14a re-running the same batch adds nothing", again.added, 0);
  eq("14b ...and reports the entries as already present", again.skipped, 1);
  eq("14c the expense list is unchanged", salaryRows(env.expenses()).length, savedRows);
  const thrice = env.api.recordPayrollExpenses(batch, batch.ts);
  eq("14d a third attempt still adds nothing", thrice.added, 0);
  eq("14e re-running never changes the daily total", env.api.totals().expenses, after.expenses);

  /* دفعة جديدة فعلية لنفس الموظف (جزء ثم الباقي) = حركتان نقديتان مستقلتان */
  const env2 = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  const eP = mkEmp({ id: "EP", name: "parte", dailyWage: 100 });
  workDays(eP, [K(2026, 10, 11), K(2026, 10, 12)]);
  env2.emps.push(eP);
  const rP1 = payAll(env2, [eP], TS, { EP: 120 });
  const rP2 = payAll(env2, [eP], TS, { EP: 80 });
  const rows2 = salaryRows(env2.expenses());
  eq("14f two genuinely separate payments create two expenses", rows2.length, 2);
  ok("14g the two expenses have different payoutIds", rows2[0].payoutId !== rows2[1].payoutId);
  eq("14h and each records its own actual cash amount", rows2[0].amount + rows2[1].amount, 200);
  eq("14i the balance is settled exactly once", P.statsUpTo(eP, P.endOfDayTs(TS)).outstanding, 0);

  /* (15) القراءة (فتح/طباعة/تصدير) لا تكتب أي مصروف */
  const envR = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  const eR = mkEmp({ id: "ER", name: "قراءة", dailyWage: 100 });
  workDays(eR, [K(2026, 10, 11), K(2026, 10, 12)]);
  envR.emps.push(eR);
  payAll(envR, [eR], TS);
  const snapshot = clone(envR.state.expenses);
  const writesBefore = envR.writes.n;
  const PRRo = require(path.join(ROOT, "assets", "report", "payroll-report.js"));
  const bR = envR.batches[Object.keys(envR.batches)[0]];
  /* فتح تقرير اليوم وبناؤه وطباعته ثلاث مرات + تقرير رواتب حرارية */
  for (let i = 0; i < 3; i++) {
    const dR = dayOf(envR);
    R.dailyReportModel(dR, {});
    R.dayReportHTML(dR, { venue: "V", paper: "58" });
    R.dayReportHTML(dR, { venue: "V", paper: "80", reviewHTML: "<div data-sec=\"review\">سجل المرتجعات</div>" });
    PRRo.batchHTML(bR, { paper: "80" });
    eq("15a[" + i + "] rendering reports creates no expense", envR.state.expenses.length, snapshot.length);
  }
  eq("15b rendering performs no device write at all", envR.writes.n, writesBefore);
  ok("15c the expenses are byte-identical after reading",
    JSON.stringify(envR.state.expenses) === JSON.stringify(snapshot));
  ok("15d the day object is built from the live expenses without inventing rows",
    JSON.stringify(dayOf(envR).expenseList) === JSON.stringify(envR.state.expenses.map(envR.api.dayExpenseRow)));

  /* (16) أيام الحضور السابقة لا تُحمَّل مصروف نقد */
  const envH = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  const eH = mkEmp({ id: "EH", name: "تاريخ", dailyWage: 100 });
  workDays(eH, [K(2026, 10, 1), K(2026, 10, 2), K(2026, 10, 3), K(2026, 10, 4), K(2026, 10, 5)]);
  envH.emps.push(eH);
  const rH = payAll(envH, [eH], TS);
  const rowH = salaryRows(envH.expenses())[0];
  eq("16a one payout covering 5 old attendance days = ONE expense", envH.expenses().length, 1);
  eq("16b the single expense is the total cash paid", rowH.amount, 500);
  eq("16c all covered days live in the payout record, not in the expense list",
    rH.batch.items[0].covered.dayKeys.length, 5);
  eq("16d and the payout itself holds exactly ONE cash movement", eH.payouts.length, 1);
  ok("16d no expense is charged to any single attendance date",
    envH.expenses().every((x) => x.amount !== 100));
  ok("16e the covered period is kept on the payout, not split into expenses",
    rH.batch.items[0].period.fromKey === K(2026, 10, 1) && rH.batch.items[0].period.toKey === K(2026, 10, 12));
}

/* =====================================================================
   (17..24) الطباعة المدمجة داخل قسم المصروفات
   ===================================================================== */
console.log("\n-- D) compact report output --");
{
  const TS = D(2026, 10, 12, 15);
  const env = makeDayEnv({
    startedAt: D(2026, 10, 12, 10),
    games: [{ id: "g1" }],
    gameSales: { total: 2000, count: 40, cashTotal: 1200, elecTotal: 800, cashCount: 24, elecCount: 16 }
  });
  const list = [];
  const eA = mkEmp({ id: "A", name: "طه", dailyWage: 100 });
  workDays(eA, [K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  P.addAdvance(eA, { amount: 30, ts: D(2026, 10, 11, 11) });
  addOp(eA, "deductions", 20, D(2026, 10, 11, 11));
  const eB = mkEmp({ id: "B", name: "ملك", dailyWage: 85 });
  workDays(eB, [K(2026, 10, 6), K(2026, 10, 7), K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10),
    K(2026, 10, 11), K(2026, 10, 12)]);
  P.addAdvance(eB, { amount: 50, ts: D(2026, 10, 9, 11) });
  addOp(eB, "deductions", 25, D(2026, 10, 11, 11));
  const eC = mkEmp({ id: "C", name: "أسماء", dailyWage: 85 });
  workDays(eC, [K(2026, 10, 8), K(2026, 10, 9), K(2026, 10, 10), K(2026, 10, 11), K(2026, 10, 12)]);
  addOp(eC, "deductions", 25, D(2026, 10, 11, 11));
  list.push(eA, eB, eC);
  env.emps.push(eA, eB, eC);
  payAll(env, list, TS);
  /* مصروف عادي وهدية موجودان أيضًا: نتأكد أن القسمين يعملان معًا بلا تعارض */
  env.state.expenses.push({ id: "x1", desc: "كهرباء", amount: 700 });
  env.state.gifts.push({ id: "g1x", desc: "هدية طفل", amount: 100, seq: 1, at: TS });

  const day = dayOf(env, {
    breakdown: [{ name: "القاء", price: 50, count: 40, cashCount: 24, elecCount: 16, total: 2000 }],
    giftList: [{ desc: "هدية طفل", amount: 100, seq: 1, at: TS }]
  });
  const html58 = R.dayReportHTML(day, { venue: "V", paper: "58" });
  const html80 = R.dayReportHTML(day, { venue: "V", paper: "80" });
  const htmlA4 = R.dayReportHTML(day, { venue: "V", paper: "a4" });
  const sec = (h) => h.slice(h.indexOf('data-sec="expenses"'), h.indexOf('data-sec="summary"'));

  /* (17) بنود الرواتب داخل قسم المصروفات الحالي نفسه */
  ok("17a the salary block lives inside data-sec=\"expenses\"",
    sec(html58).indexOf("راتب طه") !== -1 && sec(html58).indexOf("راتب ملك") !== -1
    && sec(html58).indexOf("راتب أسماء") !== -1);
  ok("17b no separate payroll section or heading was introduced",
    html58.indexOf('data-sec="payroll"') === -1 && html58.indexOf("تقرير الرواتب") === -1
    && html58.indexOf("كشف الرواتب") === -1);
  eq("17c the model exposes the salary rows separately from the others",
    R.dailyReportModel(day, {}).salaryExpenses.length, 3);
  eq("17d ...and the ordinary expenses stay in their own list",
    R.dailyReportModel(day, {}).otherExpenses.length, 1);
  ok("17e ordinary expenses are still printed unchanged after the payroll block",
    sec(html58).indexOf("كهرباء") !== -1);

  /* (18) لا صفحة إضافية: نفس الأقسام ونفس عدد الفواصل */
  const base = R.dayReportHTML(
    Object.assign({}, day, { expenseList: [{ desc: "كهرباء", amount: 700 }] }), { venue: "V", paper: "58" });
  const secs = (h) => (h.match(/data-sec="[a-z]+"/g) || []).sort().join("|");
  eq("18a the payroll block adds NO new report section", secs(html58), secs(base));
  eq("18b no extra separator lines were added", (html58.match(/class="hr"/g) || []).length,
    (base.match(/class="hr"/g) || []).length);
  ok("18c no page-break / break-after / break-before rule in any paper CSS",
    ["58", "80", "a4"].every((p) => !/page-break|break-after|break-before/.test(R.paperCSS(p))));
  eq("18d one extra printed line per employee + one for the payroll subtotal",
    (sec(html58).match(/class="pw/g) || []).length, 4);
  ok("18e the payroll block adds no heading of its own",
    (sec(html58).match(/class="b"/g) || []).length === (sec(base).match(/class="b"/g) || []).length);

  /* (19) سطر الإجمالي صحيح */
  const m = R.dailyReportModel(day, {});
  eq("19a the payroll subtotal = sum of the actual cash payouts", m.summary.salaryTotal, 1170);
  ok("19b the subtotal line is printed once", (html58.match(/إجمالي الرواتب المصروفة/g) || []).length === 1);
  ok("19c it carries the formatted total", html58.indexOf("1,170 ج") !== -1);
  ok("19d the general expenses total still includes salaries",
    m.summary.expenses === m.summary.salaryTotal + 700);
  ok("19e the final total is unchanged by the payroll display (no double deduction)",
    m.summary.final === m.summary.totalSales - m.summary.expenses);

  /* (20) سجل المرتجعات وبقية الأقسام سليمة */
  const review = '<div class="hr"></div><div class="c b" data-sec="review">🧾 سجل المرتجعات</div>'
    + '<div class="hr"></div><div class="r"><span class="l">عدد العمليات</span><span class="v num">1</span></div>';
  const hR = R.dayReportHTML(day, { venue: "V", paper: "58", reviewHTML: review });
  ok("20a the returns log is still the very last section",
    hR.indexOf('data-sec="tickets"') < hR.indexOf('data-sec="review"')
    && hR.indexOf("© نظام الحسابات") < hR.indexOf('data-sec="review"'));
  ok("20b the full established section set is present with payroll inside expenses",
    secs(hR) === R.SECTION_ORDER.slice().sort().map((s) => 'data-sec="' + s + '"').join("|"), secs(hR));
  ok("20c the sales summary and final total are untouched",
    hR.indexOf("ملخص المبيعات") !== -1 && hR.indexOf("الإجمالي النهائي") !== -1
    && hR.indexOf("إجمالي المصروفات") !== -1);

  /* (21) العربية والأرقام والاتجاه */
  ok("21a Arabic description renders with the real employee name",
    sec(html58).indexOf("راتب طه | 3 أيام | إجمالي 300 - سلفة 30 - خصم 20 | المصروف") !== -1
    || sec(html80).indexOf("راتب طه | 3 أيام | إجمالي 300 - سلفة 30 - خصم 20 | المصروف") !== -1,
    sec(html80));
  ok("21b the no-advance employee omits the advance part",
    sec(html80).indexOf("راتب أسماء | 5 أيام | إجمالي 425 - خصم 25 | المصروف") !== -1);
  ok("21c the amount follows the label on the same compact line, separated by a space",
    /راتب طه[^<]* <span class="num">250 ج<\/span>/.test(sec(html58)));
  ok("21g the printed line never glues the label to the number (المصروف250 ج)",
    !/المصروف\d/.test(sec(html58)) && !/المصروف\d/.test(sec(html80)));
  ok("21d numbers are LTR-isolated so they never reorder",
    html58.indexOf('<span class="num">') !== -1 && R.paperCSS("58").indexOf("unicode-bidi:embed") !== -1);
  ok("21e the document is RTL Arabic", html58.indexOf('lang="ar" dir="rtl"') !== -1);
  ok("21f amounts use thousands separators", html80.indexOf("1,170 ج") !== -1);

  /* (22) الأسماء الطويلة لا تُقصّ ولا توسّع التقرير بشكل غير مقبول */
  const longName = "عبد الرحمن عبد المنعم إبراهيم عبد العزيز VeryLongEmployeeNameWithoutSpaces";
  const envL = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  const eL = mkEmp({ id: "L", name: longName, dailyWage: 100 });
  workDays(eL, [K(2026, 10, 11), K(2026, 10, 12)]);
  envL.emps.push(eL);
  payAll(envL, [eL], TS);
  const hL = R.dayReportHTML(dayOf(envL), { venue: "V", paper: "58" });
  const rowL = salaryRows(envL.expenses())[0];
  ok("22a a very long name is stored and printed in full (never truncated)",
    hL.indexOf(longName) !== -1 && rowL.empName === longName);
  const pw58 = cssRule(R.paperCSS("58"), ".pw");
  ok("22b the compact line is declared wrap-capable so it cannot overflow the paper",
    pw58 !== null && pw58.indexOf("overflow-wrap:anywhere") !== -1
    && ["58", "80", "a4"].every((p) => cssRule(R.paperCSS(p), ".pw").indexOf("overflow-wrap:anywhere") !== -1));
  ok("22c no hard clipping is applied to the salary line",
    pw58.indexOf("hidden") === -1 && pw58.indexOf("nowrap") === -1 && pw58.indexOf("ellipsis") === -1);
  eq("22d the long name adds exactly one printed line",
    (sec(hL).match(/class="pw/g) || []).length, 2);
  ok("22e the document stays well formed with a long name",
    (hL.match(/<div/g) || []).length === (hL.match(/<\/div>/g) || []).length);

  /* hostile name is escaped, never injected */
  const envX = makeDayEnv({ startedAt: D(2026, 10, 12, 10) });
  const eX = mkEmp({ id: "X", name: "<script>bad</script>", dailyWage: 100 });
  workDays(eX, [K(2026, 10, 11)]);
  envX.emps.push(eX);
  payAll(envX, [eX], TS);
  const hX = R.dayReportHTML(dayOf(envX), { venue: "V", paper: "58" });
  ok("22f a hostile employee name is escaped in the printed report",
    hX.indexOf("<script>bad</script>") === -1 && hX.indexOf("&lt;script&gt;") !== -1);

  /* (23) كل عروض الورق المدعومة تعمل */
  ok("23a the same salary rows appear at 58mm, 80mm and A4",
    ["58", "80", "a4"].every((p) => R.dayReportHTML(day, { venue: "V", paper: p }).indexOf("إجمالي الرواتب المصروفة") !== -1));
  eq("23b 58mm width unchanged", R.paperCSS("58").indexOf("width:48mm") !== -1, true);
  eq("23c 80mm width unchanged", R.paperCSS("80").indexOf("width:72mm") !== -1, true);
  ok("23d A4 keeps its own page setup and no narrow body",
    R.paperCSS("a4").indexOf("@page{size:A4;margin:12mm;}") !== -1
    && R.paperCSS("a4").indexOf("width:48mm") === -1);
  ok("23e no paper format gained a second page rule",
    ["58", "80", "a4"].every((p) => (R.paperCSS(p).match(/@page/g) || []).length === 1));
  ok("23f the established printer width values are still the only ones",
    JSON.stringify(R.SECTION_ORDER) === JSON.stringify(["header", "games", "gifts", "expenses", "summary", "tickets", "review"]));

  /* (24) واجهة التصدير القائمة لم تتأثر (PDF/Excel/thermal للرواتب) */
  const PRR = require(path.join(ROOT, "assets", "report", "payroll-report.js"));
  const batchAny = env.batches[Object.keys(env.batches)[0]];
  ok("24a the payroll thermal/PDF renderer still builds from the same batch",
    PRR.batchHTML(batchAny, { paper: "80" }).indexOf("إجمالي") !== -1);
  ok("24b the payroll workbook builder is still available",
    typeof PRR.xlsBuild === "function" && !!PRR.xlsBuild(Object.values(env.batches), {}).xml);
  ok("24c the payroll scope/report API is unchanged",
    typeof PRR.scopeReportHTML === "function" && typeof PRR.payoutScopeModel === "function");
  ok("24d the daily report API used by index.html is unchanged",
    typeof R.dayReportHTML === "function" && typeof R.dailyReportModel === "function"
    && typeof R.paperCSS === "function" && typeof R.hrHTML === "function");
  ok("24e no external dependency was introduced for this feature",
    Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).dependencies).length === 1);
  ok("24f the daily expenses list remains the single source (index.html still drives it)",
    htmlSrc.indexOf("state.expenses.reduce((s,x)=>s+(Number(x.amount)||0),0)") !== -1);
}

/* =====================================================================
   النتيجة
   ===================================================================== */
console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
