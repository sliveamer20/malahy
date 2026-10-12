// tests/payroll-e2e.test.js
// تحقّق تكاملي طرف-إلى-طرف: حضور ← سجل ← سلف/خصومات/مكافآت ← رصيد
// ← دفع كامل/جزئي ← إجماليات الدفعة ← الإيصال/التقرير.
//
// كل البيانات اصطناعية بالكامل. لا Electron، لا إنتاج، لا شبكة.

const path = require("path");
const P = require(path.join(__dirname, "..", "assets", "payroll", "payroll-core.js"));
const R = require(path.join(__dirname, "..", "assets", "report", "payroll-report.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
function D(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
const NOW = D(2026, 10, 12);
function EOD(ts) { return P.endOfDayTs(ts === undefined ? NOW : ts); }

/* الثنائية المحورية: outstanding = net − paid */
function binary(name, e, cut) {
  const s = P.statsUpTo(e, cut);
  eq(name, s.outstanding, P.r2(s.gross + s.bonus - s.pen - s.adv - s.ded - s.paid));
  return s;
}
/* محاكاة payCommit في index.html عبر commitBatch الحقيقي */
function makeEnv(employees) {
  const env = { list: employees, writes: 0, failNext: false, refs: 0 };
  env.save = function (e) {
    env.writes++;
    if (env.failNext) return false;
    const i = env.list.indexOf(e);
    if (i >= 0) env.list[i] = clone(e);
    return true;
  };
  env.commit = function (list, ref) {
    const plans = list.map(function (x) { return P.planPayout(x, { nowTs: NOW, dateTs: NOW }); });
    env.refs++;
    return P.commitBatch(env.list, plans, { ts: NOW, ref: ref || ("E2E-" + env.refs) }, env.save);
  };
  env.plan = function (x) { return P.planPayout(x, { nowTs: NOW, dateTs: NOW }); };
  return env;
}
function emp(o) {
  return Object.assign({
    id: "E1", name: "أحمد محمود", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [], days: [], payouts: [], bonuses: [],
    penalties: [], advances: [], deductions: [], reviewFlags: []
  }, o || {});
}
function work(e, from, count) { for (let i = 0; i < count; i++) P.markDay(e, K(2026, 10, from + i), "work"); }

console.log("PAYROLL E2E - attendance → ledger → payout → batch → receipt (synthetic only)");

/* ==========================================================================
 * 1) مسار كامل لموظف واحد: حضور ← رصيد ← صرف كامل ← إيصال
 * ========================================================================== */
{
  const e = emp({ id: "A", name: "أحمد" });
  work(e, 1, 5);
  P.markDay(e, K(2026, 10, 6), "absent", { src: "dreg" });
  P.markDay(e, K(2026, 10, 7), "vacation", { src: "dreg" });
  const s = binary("1a the running balance is binary", e, EOD());
  eq("1b five workdays", s.work, 5);
  eq("1c one absence", s.abs, 1);
  eq("1d one vacation", s.vac, 1);
  eq("1e gross = 5 x 100", s.gross, 500);
  eq("1f outstanding before payout", s.outstanding, 500);
  const env = makeEnv([e]);
  const res = env.commit([e]);
  eq("1g the batch holds one item", res.batch.items.length, 1);
  eq("1h the batch total is the full balance", res.batch.totals.amount, 500);
  eq("1i settled", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("1j paid equals net", P.statsUpTo(e, EOD()).paid, 500);
  /* محاولة صرف ثانية */
  const res2 = env.commit([e]);
  eq("1k a retry pays nobody", res2.saved, 0);
  eq("1l ...and it is a skip, not a failure", res2.failed, 0);
  eq("1m the balance is untouched", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("1n never double-paid", P.statsUpTo(e, EOD()).paid, 500);
  /* الإيصال: من واقع الدفعة المُخزَّنة */
  const item = res.batch.items[0];
  const rm = R.receiptModel(item, { paper: "80", venue: "counter", ts: NOW });
  eq("1o the receipt prints the paid amount", rm.totals.amount, 500);
  eq("1p the receipt reconciles on itself", item.coveredNet + item.itemsDiff, item.amount);
  eq("1q the receipt balance-after is zero", item.balanceAfter, 0);
}

/* ==========================================================================
 * 2) صرف جزئي متكرر — لا تجاوز ولا ازدواج
 * ========================================================================== */
{
  const e = emp({ id: "B", name: "سارة" });
  work(e, 1, 5);                                   /* 1..5 أكتوبر = 500 */
  /* دفعة أولى حقيقية وقت 3 أكتوبر: تغطّي 3 أيام فقط ⇒ 300 */
  const midTs = D(2026, 10, 3);
  const plan1 = P.planPayout(e, { nowTs: midTs, dateTs: midTs });
  eq("2a the first payout covers the first three days", plan1.work, 3);
  eq("2b ...and their wages", plan1.amount, 300);
  P.applyPayout(e, plan1, { ts: D(2026, 10, 3, 18), ref: "P1" });
  eq("2c paid = 300", P.statsUpTo(e, EOD()).paid, 300);
  eq("2d the rest is still owed", P.statsUpTo(e, EOD()).outstanding, 200);
  /* الدفعة الثانية تغطّي اليومين المتبقيين فقط — لا تعيد تغطية الأولين */
  const env = makeEnv([e]);
  const r2 = env.commit([e]);
  eq("2e the second payout covers exactly the remaining two days", r2.batch.totals.amount, 200);
  eq("2f ...and its work count is two", r2.batch.items[0].work, 2);
  const s2 = binary("2g binary after the second payout", e, EOD());
  eq("2h fully settled", s2.outstanding, 0);
  eq("2i paid equals net, never more", s2.paid, 500);
  const r3 = env.commit([e]);
  eq("2j a third payout pays nobody", r3.saved, 0);
  eq("2k ...and the paid total is still 500", P.statsUpTo(e, EOD()).paid, 500);
}

/* ==========================================================================
 * 3) سلف وخصومات ومكافآت عبر المسار كامل
 * ========================================================================== */
{
  const e = emp({ id: "C", name: "خالد" });
  work(e, 1, 4);
  eq("3a gross 400", P.statsUpTo(e, EOD()).gross, 400);
  e.bonuses.push({ id: "b1", ts: D(2026, 10, 4), amount: 50, reason: "مكافأة", note: "" });
  e.penalties.push({ id: "p1", ts: D(2026, 10, 4), amount: 20, reason: "جزاء", note: "" });
  e.deductions.push({ id: "d1", ts: D(2026, 10, 4), amount: 30, reason: "خصم", note: "" });
  P.addAdvance(e, { id: "a1", ts: D(2026, 10, 5), amount: 100, reason: "سلفة", expenseId: "EXP1" });
  const s = binary("3b binary with every operation kind", e, EOD());
  eq("3c net = 400 + 50 - 20 - 100 - 30", s.outstanding, 300);
  const env = makeEnv([e]);
  const res = env.commit([e]);
  eq("3d the payout equals net", res.batch.totals.amount, 300);
  eq("3e settled", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("3f the advance is kept for audit", e.advances.length, 1);
  ok("3g ...and stamped with the settling payout", !!e.advances[0].settledBy);
  const again = env.commit([e]);
  eq("3h a retry pays nobody", again.saved, 0);
  eq("3i the advance is not counted twice", P.statsUpTo(e, EOD()).paid, 300);
  /* حذف المصروف المرتبط يحذف السلفة */
  const e2 = emp({ id: "C2" });
  P.ensureLedger(e2);
  P.addAdvance(e2, { id: "aX", ts: NOW, amount: 75, reason: "سلفة", expenseId: "EXP9" });
  eq("3j deleting the expense removes the advance", P.removeAdvanceByExpense(e2, "EXP9"), 1);
  eq("3k ...and it is gone from the payroll ledger", e2.advances.length, 0);
}

/* ==========================================================================
 * 4) عدة موظفين: دفعة واحدة، ولا_cross-talk
 * ========================================================================== */
{
  const A = emp({ id: "A", name: "أحمد", dailyWage: 100 });
  const B = emp({ id: "B", name: "سارة", dailyWage: 80 });
  const C = emp({ id: "C", name: "خالد", dailyWage: 120 });
  work(A, 1, 5);   /* 500 */
  work(B, 1, 5);   /* 400 */
  work(C, 1, 5);   /* 600 */
  eq("4a A owed 500", P.statsUpTo(A, EOD()).outstanding, 500);
  eq("4b B owed 400", P.statsUpTo(B, EOD()).outstanding, 400);
  eq("4c C owed 600", P.statsUpTo(C, EOD()).outstanding, 600);
  const env = makeEnv([A, B, C]);
  const res = env.commit([A, B, C]);
  eq("4d all three paid in one batch", res.saved, 3);
  eq("4e the batch total is the sum", res.batch.totals.amount, 1500);
  eq("4f A settled", P.statsUpTo(A, EOD()).outstanding, 0);
  eq("4g B settled", P.statsUpTo(B, EOD()).outstanding, 0);
  eq("4h C settled", P.statsUpTo(C, EOD()).outstanding, 0);
  eq("4i a retry pays nobody", env.commit([A, B, C]).saved, 0);
  /* دفعة جزئية بموظف واحد لا تمسّ الآخرين (الموظف D ليومين فقط) */
  const Dd = emp({ id: "D", name: "ديانا", dailyWage: 90 });
  work(Dd, 1, 2);                                  /* يومان فقط = 180 */
  const env2 = makeEnv([A, B, C, Dd]);
  const rPart = env2.commit([Dd]);
  eq("4j D paid for exactly the two recorded days", rPart.batch.totals.amount, 180);
  eq("4k D settled for those two days", P.statsUpTo(Dd, EOD()).outstanding, 0);
  eq("4l A unaffected by D's batch", P.statsUpTo(A, EOD()).paid, 500);
  eq("4m B unaffected", P.statsUpTo(B, EOD()).paid, 400);
  eq("4n C unaffected", P.statsUpTo(C, EOD()).paid, 600);
  /* التقرير يطابق المحرك */
  const bm = R.batchModel(res.batch, { paper: "80", venue: "counter", ts: NOW });
  eq("4o the printed batch total matches the engine", bm.totals.amount, 1500);
  eq("4p the printed item count matches", res.batch.totals.count, bm.count);
}

/* ==========================================================================
 * 5) فشل الحفظ: تراجع كامل ولا تعليم كمدفوع
 * ========================================================================== */
{
  const A = emp({ id: "A", name: "أحمد" });
  const B = emp({ id: "B", name: "سارة", dailyWage: 80 });
  work(A, 1, 5); work(B, 1, 3);
  const env = makeEnv([A, B]);
  const beforeA = JSON.stringify(A), beforeB = JSON.stringify(B);
  env.failNext = true;
  const res = env.commit([A, B]);
  eq("5a nobody was saved", res.saved, 0);
  ok("5b the failures are reported", res.failed >= 1, "failed=" + res.failed);
  eq("5c employee A rolled back in memory", JSON.stringify(A), beforeA);
  eq("5d employee B rolled back in memory", JSON.stringify(B), beforeB);
  eq("5e A is not marked paid", A.payouts.length, 0);
  eq("5f B is not marked paid", B.payouts.length, 0);
  eq("5g A is still owed in full", P.statsUpTo(A, EOD()).outstanding, 500);
  eq("5h B is still owed in full", P.statsUpTo(B, EOD()).outstanding, 240);
  eq("5i the failed batch records the intended amount",
     res.batch.items.filter(function (i) { return i.status === "failed"; }).every(function (i) { return i.amount === 0; }), true);
  env.failNext = false;
  const res2 = env.commit([A, B]);
  eq("5j retry succeeds for both", res2.saved, 2);
  eq("5k A settled exactly once", A.payouts.length, 1);
  eq("5l B settled exactly once", B.payouts.length, 1);
  eq("5m A balance zero", P.statsUpTo(A, EOD()).outstanding, 0);
  eq("5n B balance zero", P.statsUpTo(B, EOD()).outstanding, 0);
  eq("5o nothing is double-paid for A", P.statsUpTo(A, EOD()).paid, 500);
}

/* ==========================================================================
 * 6) ترحيل ← صرف: الأجر التاريخي يبقى والأرصدة تُطابق
 * ========================================================================== */
{
  function oldWeek(key, dailyWage, o) {
    o = o || {};
    const p = key.split("-").map(Number);
    const start = D(p[0], p[1], p[2]);
    const w = {
      key: key, startTs: start, endTs: start + 6 * 86400000, dailyWage: dailyWage,
      days: [0, 1, 2, 3, 4, 5, 6].map(function () { return { status: "work", penalty: 0, bonus: 0, note: "" }; }),
      bonuses: [], penalties: [], advances: [], deductions: [],
      paid: false, paidAt: null, snapshot: null
    };
    Object.keys(o).forEach(function (k) { w[k] = o[k]; });
    return w;
  }
  /* موظف أُرفع أجره من 80 إلى 150 */
  const e = emp({ id: "M", name: "مهاجر", dailyWage: 150, weeks: [oldWeek("2026-10-03", 80)] });
  P.migrateEmployee(e, { nowTs: NOW });
  eq("6a the legacy week imported at its own wage",
     e.days.filter(function (d) { return d.wage === 80; }).length, 7);
  eq("6b outstanding = 7 x 80", binary("6c binary after migration", e, EOD()).outstanding, 560);
  P.markDay(e, K(2026, 10, 12), "work", { src: "dreg" });
  eq("6d a new day uses the current wage", e.days[7].wage, 150);
  eq("6e outstanding = 560 + 150", binary("6f binary", e, EOD()).outstanding, 710);
  const env = makeEnv([e]);
  const res = env.commit([e]);
  eq("6g the payout covers the mixed wages", res.batch.totals.amount, 710);
  eq("6h settled", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("6i no retry pays anybody", env.commit([e]).saved, 0);
  eq("6j the report total matches the engine", res.batch.totals.amount, 710);
  const bm = R.batchModel(res.batch, { paper: "58", venue: "counter", ts: NOW });
  eq("6k the 58mm model carries the same total", bm.totals.amount, 710);
  eq("6l every receipt item reconciles",
     bm.items.every(function (i) { return P.r2(i.coveredNet + i.itemsDiff) === i.amount; }), true);
}

/* ==========================================================================
 * 7) الأجر يُغيَّر بعد الصرف — الماضي لا يُعاد كتابته
 * ========================================================================== */
{
  const e = emp({ id: "W", name: "وائل", dailyWage: 100 });
  work(e, 1, 5);
  const env = makeEnv([e]);
  env.commit([e]);
  eq("7a paid at the old wage", P.statsUpTo(e, EOD()).paid, 500);
  e.dailyWage = 300;
  eq("7b the historical paid total is unchanged", P.statsUpTo(e, EOD()).paid, 500);
  eq("7c the gross is unchanged", P.statsUpTo(e, EOD()).gross, 500);
  P.markDay(e, K(2026, 10, 11), "work");
  eq("7d only the new day uses the new wage", P.statsUpTo(e, EOD()).outstanding, 300);
  eq("7e ...and the binary still holds", binary("7f binary", e, EOD()).outstanding, 300);
  eq("7g never overpaid", P.statsUpTo(e, EOD()).paid, 500);
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);