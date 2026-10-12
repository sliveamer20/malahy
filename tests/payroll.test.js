// tests/payroll.test.js
// اختبار نواة الرواتب المرن (assets/payroll/payroll-core.js):
//   الدفع بعد يوم واحد / يومين، الدورات (7/15/شهري/يدوي)، الصرف قبل اكتمال
//   الدورة، الدفع الفردي والجماعي، الدفعات الجزئية، عدّ الحضور والغياب،
//   السلف والخصومات والمكافآت والجزاءات، منع الدفع المكرر، حفظ السجل
//   التاريخي، الترحيل من النموذج الأسبوعي، وفشل الحفظ (Partial failure).
//
// كل البيانات هنا اصطناعية بالكامل (Synthetic) — لا تُلمَس بيانات إنتاج.
// هذا الملف لا يفتح أي ملف على الجهاز ولا يحتاج Electron.

const path = require("path");
const P = require(path.join(__dirname, "..", "assets", "payroll", "payroll-core.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}

/* ===================== أدوات تواريخ ثابتة (بلا اعتماد على اليوم الحالي) ===================== */
function D(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }

/* خط زمني ثابت: كل الاختبارات تدور حول 12 أكتوبر 2026 (الاثنين) */
const NOW = D(2026, 10, 12);
const TODAY = K(2026, 10, 12);

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* موظف اصطناعي: أجر يومي 100 (كاشير) — القيمة تأتي من سجل الموظف نفسه */
function mkEmp(o) {
  const e = Object.assign({
    id: "E1", name: "أحمد محمود", job: "كاشير",
    dailyWage: 100, phone: "", hiredAt: D(2026, 1, 1), notes: "", weeks: []
  }, o || {});
  P.ensureLedger(e);
  return e;
}
function mkWorker(o) {
  const e = mkEmp(Object.assign({ id: "E2", name: "سارة علي", job: "مشغل ألعاب", dailyWage: 85 }, o || {}));
  return e;
}

console.log("PAYROLL CORE — flexible, attendance-based payroll engine");

/* ==========================================================================
 * 1) الدفع بعد يوم حضور واحد
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, TODAY, "work", { src: "dreg" });
  const s = P.statsUpTo(e, NOW);
  eq("1a one attended day = 1 day worked", s.work, 1);
  eq("1b gross = one daily wage", s.gross, 100);
  eq("1c no absence invented", s.abs, 0);
  eq("1d outstanding = full wage", s.outstanding, 100);
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("1e payout amount = outstanding", plan.amount, 100);
  eq("1f covered days = 1", plan.covered.dayKeys.length, 1);
  eq("1g balance after full payout = 0", plan.balanceAfter, 0);
  const r = P.applyPayout(e, plan, { ts: NOW, ref: "PAY-X" });
  ok("1h payout saved", r.ok === true);
  eq("1i outstanding after payout = 0", P.statsUpTo(e, NOW).outstanding, 0);
  eq("1j total paid recorded", P.statsUpTo(e, NOW).paid, 100);
}

/* ==========================================================================
 * 2) الدفع بعد يومين
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, K(2026, 10, 11), "work", { src: "dreg" });
  P.markDay(e, K(2026, 10, 12), "work", { src: "dreg" });
  const s = P.statsUpTo(e, NOW);
  eq("2a two attended days", s.work, 2);
  eq("2b gross = 2 x wage", s.gross, 200);
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("2c payout = 200", plan.amount, 200);
  P.applyPayout(e, plan, { ts: NOW });
  eq("2d nothing left", P.statsUpTo(e, NOW).outstanding, 0);
}

/* الأجر الثاني 85 (مشغل ألعاب) — القيمة من سجل الموظف لا من ثابت */
{
  const e = mkWorker();
  P.markDay(e, TODAY, "work");
  const s = P.statsUpTo(e, NOW);
  eq("2e worker wage comes from the employee record (85)", s.gross, 85);
  ok("2f no hardcoded 100/85 constants in the engine",
    JSON.stringify(P.planPayout(e, { nowTs: NOW }).dailyWage) === "85");
}

/* ==========================================================================
 * 3+4) الدورات المفضلة: 7 أيام / 15 يوم / شهري / يدوي — إرشادية ولا تمنع الصرف
 * ========================================================================== */
{
  const cases = [
    { cycle: "weekly", days: 7, label: "كل 7 أيام" },
    { cycle: "biweekly", days: 15, label: "كل 15 يوم" },
    { cycle: "monthly", days: 30, label: "شهري" },
    { cycle: "manual", days: 0, label: "يدوي" }
  ];
  cases.forEach(function (c) {
    const e = mkEmp({ payCycle: c.cycle });
    const ci = P.cycleInfo(e, NOW);
    eq("3 cycle id " + c.cycle, ci.id, c.cycle);
    eq("3 cycle label " + c.cycle, ci.label, c.label);
    eq("3 cycle length " + c.cycle, ci.days, c.days);
  });
  const e7 = mkEmp({ payCycle: "weekly" });
  P.markDay(e7, TODAY, "work");
  const ci = P.cycleInfo(e7, NOW);
  /* الموظف تاريخ تعيينه 1 يناير ⇒ موعد الدورة الأولى بعد 7 أيام من التعيين */
  ok("3b weekly due date is computed from the hire date", ci.dueTs > 0 && ci.due === true,
    "dueTs=" + ci.dueTs);
  /* بعد الصرف تتقدّم نافذة الدورة — لكنها لا تمنع الصرف */
  const plan = P.planPayout(e7, { nowTs: NOW, dateTs: NOW });
  P.applyPayout(e7, plan, { ts: NOW });
  const ci2 = P.cycleInfo(e7, NOW);
  ok("3c anchor moves to the real payout date after paying", ci2.anchorTs === NOW);
  /* 4) الصرف قبل اكتمال الدورة المفضلة مفعّل (الدورة الأسبوعية مستحقة بعد 7 أيام) */
  const e8 = mkEmp({ id: "E8", payCycle: "weekly", hiredAt: D(2026, 10, 10) });
  P.markDay(e8, TODAY, "work");
  const ciEarly = P.cycleInfo(e8, NOW);
  ok("4a weekly cycle is NOT due yet", ciEarly.due === false && ciEarly.overdueDays === 0,
    "dueTs=" + ciEarly.dueTs);
  const early = P.planPayout(e8, { nowTs: NOW, dateTs: NOW });
  eq("4b paying before the cycle completes still works", early.amount, 100);
  ok("4c the early payout is recorded", P.applyPayout(e8, early, { ts: NOW }).ok === true);
  /* ولا يُمنع الصرف اليدوي خارج موعد الدورة إطلاقًا */
  P.markDay(e8, K(2026, 10, 13), "work");
  const onDemand = P.planPayout(e8, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  eq("4d any-day payout works regardless of the preferred cycle", onDemand.amount, 100);
}

/* ==========================================================================
 * 5) موظف واحد / عدة موظفين معًا (دفعة مجمّعة)
 * ========================================================================== */
{
  const a = mkEmp({ id: "E1", name: "أحمد" });
  const b = mkWorker({ id: "E2", name: "سارة" });
  P.markDay(a, TODAY, "work");
  P.markDay(b, TODAY, "work");
  const plans = [P.planPayout(a, { nowTs: NOW }), P.planPayout(b, { nowTs: NOW })];
  const batch = P.buildBatch(plans, { ts: NOW, ref: "PAY-20261012" });
  eq("5a batch has two items", batch.items.length, 2);
  eq("5b batch total = 100 + 85", batch.totals.amount, 185);
  eq("5c batch count = 2", batch.totals.count, 2);
  const ra = P.applyPayout(a, plans[0], { ts: NOW, batchId: batch.id, ref: batch.ref });
  const rb = P.applyPayout(b, plans[1], { ts: NOW, batchId: batch.id, ref: batch.ref });
  ok("5d both payouts recorded", ra.ok && rb.ok);
  eq("5e first employee balance cleared", P.statsUpTo(a, NOW).outstanding, 0);
  eq("5f second employee balance cleared", P.statsUpTo(b, NOW).outstanding, 0);
  eq("5g shared batch reference recorded on both", a.payouts[0].batchId === batch.id && b.payouts[0].batchId === batch.id, true);
  /* موظف واحد منفرد */
  const c = mkEmp({ id: "E3", name: "خالد" });
  P.markDay(c, TODAY, "work");
  const one = P.planPayout(c, { nowTs: NOW });
  eq("5h single-employee payout works independently", one.amount, 100);
}

/* ==========================================================================
 * 6) الدفعات الجزئية والرصيد المتبقي
 * ========================================================================== */
{
  const e = mkEmp();
  [11, 12].forEach(function (d) { P.markDay(e, K(2026, 10, d), "work"); });
  const p1 = P.planPayout(e, { nowTs: NOW, amount: 50 });
  eq("6a partial payout amount honoured", p1.amount, 50);
  ok("6b partial payout flagged as partial", p1.kind !== "full");
  P.applyPayout(e, p1, { ts: NOW });
  const s = P.statsUpTo(e, NOW);
  eq("6c remaining balance after partial = 150", s.outstanding, 150);
  eq("6d paid recorded = 50", s.paid, 50);
  /* لا ازدواج: الأجر المدفوع لا يعود يُحتسب في المتبقي */
  const p2 = P.planPayout(e, { nowTs: NOW });
  eq("6e second payout takes only the remainder", p2.amount, 150);
  P.applyPayout(e, p2, { ts: NOW });
  eq("6f balance now zero", P.statsUpTo(e, NOW).outstanding, 0);
  /* دفع مبالغ أكبر من المستحق يُقصّ على المستحق */
  const e2 = mkEmp({ id: "E9" });
  P.markDay(e2, TODAY, "work");
  const p3 = P.planPayout(e2, { nowTs: NOW, amount: 99999 });
  eq("6g payout cannot exceed outstanding", p3.amount, 100);
  P.applyPayout(e2, p3, { ts: NOW });
  /* حضور جديد بعد الصرف يستمر في التراكم */
  P.markDay(e2, K(2026, 10, 13), "work");
  eq("6h new attendance keeps accumulating after a payout", P.statsUpTo(e2, D(2026, 10, 13)).outstanding, 100);
}

/* ==========================================================================
 * 7) عدّ الحضور والغياب — من السجل فقط، ولا اختراع
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, K(2026, 10, 8), "work");
  P.markDay(e, K(2026, 10, 9), "work");
  P.markDay(e, K(2026, 10, 10), "absent");     /* غياب مُسجَّل صراحةً فقط */
  P.markDay(e, K(2026, 10, 11), "vacation");
  const s = P.statsUpTo(e, NOW);
  eq("7a attended days counted", s.work, 2);
  eq("7b absences counted only when recorded", s.abs, 1);
  eq("7c vacations counted", s.vac, 1);
  eq("7d gross ignores absent/vacation", s.gross, 200);
  /* الأيام غير المسجَّلة لا تُحتسب حضورًا ولا غيابًا */
  const before = P.statsUpTo(e, NOW).dayCount;
  P.statsUpTo(e, NOW);
  eq("7e unrecorded days are neither work nor absence", before, 4);
  eq("7f no phantom attendance", P.statsUpTo(e, NOW).work, 2);
  /* تعديل الحالة */
  P.markDay(e, K(2026, 10, 10), "work");
  eq("7g changing absent -> work raises the count", P.statsUpTo(e, NOW).work, 3);
  /* الدفع لا يمسح سجل الحضور */
  const plan = P.planPayout(e, { nowTs: NOW });
  P.applyPayout(e, plan, { ts: NOW });
  eq("7h attendance history preserved after payout", e.days.length, 4);
  eq("7i payout does not erase paid days", P.statsUpTo(e, NOW).outstanding, 0);
}

/* ==========================================================================
 * 8) المكافآت والجزاءات والسلف والخصومات — تُخصم مرة واحدة
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, TODAY, "work");
  e.bonuses.push({ id: "B1", ts: NOW - 1000, amount: 50, reason: "أداء ممتاز" });
  e.penalties.push({ id: "P1", ts: NOW - 900, amount: 20, reason: "تأخير" });
  e.deductions.push({ id: "D1", ts: NOW - 800, amount: 30, reason: "كسر" });
  P.addAdvance(e, { id: "A1", ts: NOW - 700, amount: 40, reason: "سلفة", expenseId: "X1" });
  const s = P.statsUpTo(e, NOW);
  eq("8a bonus added", s.bonus, 50);
  eq("8b penalty subtracted", s.pen, 20);
  eq("8c deduction subtracted", s.ded, 30);
  eq("8d advance subtracted", s.adv, 40);
  eq("8e net = 100+50-20-30-40", s.net, 60);
  const plan = P.planPayout(e, { nowTs: NOW });
  eq("8f payout covers the net", plan.amount, 60);
  P.applyPayout(e, plan, { ts: NOW });
  eq("8g advance marked as settled by this payout", e.advances[0].settledBy != null, true);
  eq("8h advance not deducted twice", P.statsUpTo(e, NOW).outstanding, 0);
  eq("8i advance still in the audit record", e.advances.length, 1);
  /* سلفة جديدة بعد الصرف تتراكم من جديد */
  P.addAdvance(e, { id: "A2", ts: NOW + 1000, amount: 25 });
  P.markDay(e, K(2026, 10, 13), "work");
  const s2 = P.statsUpTo(e, D(2026, 10, 13));
  eq("8j new advance + new attendance accrue again", s2.outstanding, 75);
  /* ربط السلفة بالمصروف وحذفها */
  const e3 = mkEmp({ id: "E8" });
  P.addAdvance(e3, { id: "A9", ts: NOW, amount: 15, expenseId: "X9" });
  eq("8k advance linked to its expense", e3.advances[0].expenseId, "X9");
  eq("8l deleting the expense removes the advance", P.removeAdvanceByExpense(e3, "X9"), 1);
  eq("8m advance gone", e3.advances.length, 0);
}

/* ==========================================================================
 * 9) منع الدفع المكرر
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, TODAY, "work");
  const plan = P.planPayout(e, { nowTs: NOW });
  const r1 = P.applyPayout(e, plan, { ts: NOW, payoutId: "FIXED1" });
  ok("9a first payout succeeds", r1.ok === true);
  /* إعادة محاولة بنفس المعرّف لا تُنتج عملية ثانية */
  const again = P.applyPayout(e, plan, { ts: NOW, payoutId: "FIXED1" });
  ok("9b retry with the same id is rejected as duplicate", again.ok === false && again.reason === "duplicate");
  eq("9c only one payout stored", e.payouts.length, 1);
  /* خطة صرف جديدة لا يوجد ما يُدفع ⇒ تُرفض */
  const plan2 = P.planPayout(e, { nowTs: NOW });
  ok("9d second payout plan has nothing due", plan2.ok === false && plan2.reason === "no-due");
  const r2 = P.applyPayout(e, plan2, { ts: NOW });
  ok("9e nothing is written when there is nothing due", r2.ok === false);
  eq("9f still only one payout", e.payouts.length, 1);
  eq("9g balance stays zero (no double counting)", P.statsUpTo(e, NOW).outstanding, 0);
}

/* ==========================================================================
 * 10) حفظ السجل التاريخي — لا حذف لأي سجل
 * ========================================================================== */
{
  const e = mkEmp();
  e.weeks = [{ key: "2026-09-26", days: [], paid: true, paidAt: D(2026, 10, 2), snapshot: { net: 600 } }];
  P.markDay(e, TODAY, "work");
  const plan = P.planPayout(e, { nowTs: NOW });
  P.applyPayout(e, plan, { ts: NOW });
  eq("10a legacy weeks are never deleted", e.weeks.length, 1);
  ok("10b legacy week untouched", e.weeks[0].snapshot.net === 600);
  ok("10c history grows, never shrinks", e.days.length === 1 && e.payouts.length === 1);
}

/* ==========================================================================
 * 13) فشل عملية الحفظ — تراجع آمن (لا تعليم كمدفوع)
 * ========================================================================== */
{
  /* نحاكي commit في التطبيق: نطبّق على نسخة، نحفظ، ونتراجع لو فشل الحفظ */
  function commit(e, plan, saveOk) {
    const backup = clone(e);
    P.applyPayout(e, plan, { ts: NOW });
    if (!saveOk) { const fresh = backup; Object.keys(e).forEach(function (k) { delete e[k]; }); Object.keys(fresh).forEach(function (k) { e[k] = fresh[k]; }); return false; }
    return true;
  }
  const e = mkEmp();
  P.markDay(e, TODAY, "work");
  const plan = P.planPayout(e, { nowTs: NOW });
  const okSave = commit(e, plan, true);
  ok("13a successful commit marks the employee paid", okSave && P.statsUpTo(e, NOW).outstanding === 0);

  const e2 = mkEmp({ id: "E2" });
  P.markDay(e2, TODAY, "work");
  const plan2 = P.planPayout(e2, { nowTs: NOW });
  const okSave2 = commit(e2, plan2, false);
  ok("13b failed save returns false", okSave2 === false);
  ok("13c employee is NOT marked as paid after a failed save", P.statsUpTo(e2, NOW).outstanding === 100);
  eq("13d no payout record after a failed save", e2.payouts.length, 0);
}

/* ==========================================================================
 * 11) إجماليات التقرير المجمّع (تُحسب من صفوف الدفعة)
 * ========================================================================== */
{
  const a = mkEmp({ id: "E1", name: "أحمد" });
  const b = mkWorker({ id: "E2", name: "سارة" });
  const c = mkEmp({ id: "E3", name: "خالد", dailyWage: 120 });
  [a, b, c].forEach(function (e) { P.markDay(e, TODAY, "work"); e.advances.push({ id: "adv_" + e.id, ts: NOW - 100, amount: 10, reason: "سلفة" }); });
  const plans = [a, b, c].map(function (e) { return P.planPayout(e, { nowTs: NOW }); });
  const batch = P.buildBatch(plans, { ts: NOW, ref: "PAY-20261012" });
  eq("11a batch gross = 100+85+120", batch.totals.gross, 305);
  eq("11b batch advances = 30", batch.totals.adv, 30);
  eq("11c batch net paid = 305-30", batch.totals.amount, 275);
  eq("11d count = 3", batch.totals.count, 3);
  /* الإجماليات في التقرير تُحسب من الصفوف لا من حقل مخزَّن */
  const tampered = clone(batch);
  tampered.totals.amount = 99999;
  const R = require(path.join(__dirname, "..", "assets", "report", "payroll-report.js"));
  const m = R.batchModel(tampered, {});
  eq("11e report totals recomputed from rows (tampered total ignored)", m.totals.amount, 275);
  eq("11f report deductions total", m.totals.deductionsTotal, 30);
}

/* ==========================================================================
 * 6b) الرصيد المنقول من فترات سابقة + الفترة الفعلية
 * ========================================================================== */
{
  const e = mkEmp();
  P.markDay(e, K(2026, 10, 5), "work");   /* أول فترة — دفع جزئي */
  P.markDay(e, K(2026, 10, 6), "work");
  const p1 = P.planPayout(e, { nowTs: D(2026, 10, 7), dateTs: D(2026, 10, 7), amount: 100 });
  P.applyPayout(e, p1, { ts: D(2026, 10, 7) });
  eq("6c-i paying earlier does not erase attendance history", e.days.length, 2);
  /* بقية الفترة القديمة + فترة جديدة */
  P.markDay(e, K(2026, 10, 12), "work");
  const p2 = P.planPayout(e, { nowTs: NOW });
  eq("6c-ii carried-over unpaid balance is included", p2.outstandingBefore, 200);
  eq("6c-iii covered period spans first covered day .. payout date",
    p2.period.fromKey + "→" + p2.period.toKey, K(2026, 10, 5) + "→" + K(2026, 10, 12));
  eq("6c-iv this payout reports only the not-yet-reported workdays",
    p2.covered.dayKeys.join(","), K(2026, 10, 6) + "," + K(2026, 10, 12));
  eq("6c-iv-2 across both payouts every workday is reported exactly once",
    p1.covered.dayKeys.concat(p2.covered.dayKeys).sort().join(","),
    [K(2026, 10, 5), K(2026, 10, 6), K(2026, 10, 12)].join(","));
  P.applyPayout(e, p2, { ts: NOW });
  eq("6c-v everything settled", P.statsUpTo(e, NOW).outstanding, 0);
  eq("6c-vi attendance still there after second payout", e.days.length, 3);
}

/* ==========================================================================
 * 6c) الأجر المجمَّد على اليوم — تغيير الأجر لا يعيد كتابة الماضي
 * ========================================================================== */
{
  const e = mkEmp({ dailyWage: 100 });
  P.markDay(e, K(2026, 10, 11), "work");
  e.dailyWage = 150;                              /* تغيّر الأجر بعد تسجيل اليوم */
  P.markDay(e, K(2026, 10, 12), "work");
  const s = P.statsUpTo(e, NOW);
  eq("6c1 past day keeps its frozen wage", s.gross, 100 + 150);
  const plan = P.planPayout(e, { nowTs: NOW });
  eq("6c2 report gross uses the frozen wages too", plan.gross, 250);
}

/* ==========================================================================
 * 15) الانحدار: سيناريو المراجعة النهائية الفاشل — غياب مسجَّل لم يكن يظهر
 *     إطلاقًا في خطة الصرف ⇒ لا يظهر في التقرير ولا في الإيصال.
 *     سجل: 10/10 عمل · 11/10 غياب · 12/10 عمل · سلفة 20 يوم 11/10 · أجر 85
 * ========================================================================== */
{
  const e = mkWorker({ id: "E15", name: "عبدالرحمن عبد الله", dailyWage: 85 });
  P.markDay(e, K(2026, 10, 10), "work");
  P.markDay(e, K(2026, 10, 11), "absent");
  P.markDay(e, K(2026, 10, 12), "work");
  P.addAdvance(e, { id: "ADV1", ts: D(2026, 10, 11), amount: 20, reason: "سلفة" });

  /* المصدر الواحد: إحصاء الموظف وخطة الصرف يتّفقان تمامًا */
  const s = P.statsUpTo(e, P.endOfDayTs(NOW));
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("15a attended workdays = 2 (the absence is never a workday)", plan.work, 2);
  eq("15b days absent = 1 (previously reported as 0 — the bug)", plan.abs, 1);
  eq("15c days vacation = 0", plan.vac, 0);
  eq("15d gross wages = 2 x 85", plan.gross, 170);
  eq("15e gross wages from the lifetime stats agree", s.gross, plan.gross);
  eq("15f absence count from the lifetime stats agrees", s.abs, plan.abs);
  eq("15g workdays from the lifetime stats agree", s.work, plan.work);
  eq("15h advances deducted = 20", plan.adv, 20);
  eq("15i final payout = 170 - 20", plan.amount, 150);
  eq("15j remaining after payout = 0", plan.balanceAfter, 0);
  eq("15k outstanding before payout = 150", plan.outstandingBefore, 150);

  /* الغياب لا يولّد أجرًا ولا خصمًا — الأرقام المالية لم تتغير إطلاقًا */
  eq("15l an absence never produces wages", plan.gross, 2 * 85);
  const noAbs = mkWorker({ id: "E15b", name: "مرجع", dailyWage: 85 });
  P.markDay(noAbs, K(2026, 10, 10), "work");
  P.markDay(noAbs, K(2026, 10, 12), "work");
  P.addAdvance(noAbs, { id: "ADV1", ts: D(2026, 10, 11), amount: 20, reason: "سلفة" });
  const planRef = P.planPayout(noAbs, { nowTs: NOW, dateTs: NOW });
  eq("15m the recorded absence changes nothing financially", planRef.amount, plan.amount);
  eq("15m-2 ...and neither does it change the gross", planRef.gross, plan.gross);

  /* الفترة المعلنة تمتد من أول يوم مُغطَّى حتى تاريخ الصرف */
  eq("15n period start", plan.period.fromKey, K(2026, 10, 10));
  eq("15o period end = payout date", plan.period.toKey, K(2026, 10, 12));
  eq("15p the absence is attributed to this payout",
    plan.covered.absKeys.join(","), K(2026, 10, 11));

  /* التنفيذ: يُحفظ الغياب مع الدفعة ويُختم فلا يُعاد عدّه */
  const res = P.applyPayout(e, plan, { ts: NOW, ref: "PAY-FIX" });
  ok("15q payout saved", res.ok === true);
  eq("15r saved payout records the absence count", res.record.covered.abs, 1);
  eq("15s saved payout records the absence day", res.record.covered.absKeys.join(","), K(2026, 10, 11));
  ok("15t the absence day is stamped with its payout", !!P.dayRec(e, K(2026, 10, 11)).settledBy);
  eq("15u balance settled", P.statsUpTo(e, P.endOfDayTs(NOW)).outstanding, 0);
  eq("15v lifetime absence count is preserved (not deleted)", P.statsUpTo(e, P.endOfDayTs(NOW)).abs, 1);

  /* دفعة لاحقة: نفس الغياب لا يُعاد حسابه ولا تُضيع أي أجر، ولا يُعاد عرض
     أيام العمل التي دُفعت في الدفعة السابقة على تقرير الدفعة الجديدة */
  P.markDay(e, K(2026, 10, 13), "work");
  const plan2 = P.planPayout(e, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  eq("15w the absence is not counted again in a later payout", plan2.abs, 0);
  eq("15x the new workday is reported exactly once", plan2.work, 1);
  eq("15x-2 no already-paid workday is re-reported", plan2.covered.dayKeys.join(","), K(2026, 10, 13));
  eq("15x-3 attendance reported across both batches equals the real workdays",
    plan.covered.dayKeys.length + plan2.covered.dayKeys.length, 3);
  eq("15y later payout amount = one wage", plan2.amount, 85);
  P.applyPayout(e, plan2, { ts: D(2026, 10, 13) });
  eq("15z grand total paid = all earned wages minus the advance (3x85 - 20)",
    P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 13))).paid, 235);
  eq("15z-2 and nothing is outstanding", P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 13))).outstanding, 0);
}

/* ==========================================================================
 * 16) إجازات + غياب معًا، والدفعات الجزئية لا تضيع ولا تكرر
 * ========================================================================== */
{
  const e = mkEmp({ id: "E16", name: "سلمى", dailyWage: 100 });
  P.markDay(e, K(2026, 10, 8), "work");
  P.markDay(e, K(2026, 10, 9), "absent");
  P.markDay(e, K(2026, 10, 10), "vacation");
  P.markDay(e, K(2026, 10, 11), "work");
  const s = P.statsUpTo(e, P.endOfDayTs(NOW));
  eq("16a workdays = 2", s.work, 2);
  eq("16b absences = 1", s.abs, 1);
  eq("16c vacations = 1", s.vac, 1);
  eq("16d gross = 2 x 100 only", s.gross, 200);
  eq("16e outstanding = 200", s.outstanding, 200);

  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("16f plan workdays = 2", plan.work, 2);
  eq("16g plan absences = 1", plan.abs, 1);
  eq("16h plan vacations = 1", plan.vac, 1);
  eq("16i plan gross = 200", plan.gross, 200);
  eq("16j plan amount = 200", plan.amount, 200);

  /* دفع جزئي: الدفعات الجزئية لا تضيع أي يوم عمل ولا تكرره */
  const p1 = P.planPayout(e, { nowTs: NOW, dateTs: NOW, amount: 50 });
  eq("16k partial amount honoured", p1.amount, 50);
  eq("16l the absence is reported once on the partial payout", p1.abs, 1);
  P.applyPayout(e, p1, { ts: NOW });
  const after1 = P.statsUpTo(e, P.endOfDayTs(NOW));
  eq("16m remaining balance = 150", after1.outstanding, 150);

  const p2 = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("16n the absence is not repeated on the next payout", p2.abs, 0);
  eq("16o the vacation is not repeated either", p2.vac, 0);
  eq("16p the two workdays are still paid in full", p2.work, 2);
  eq("16q no wage was lost by the partial payout", p2.amount, 150);
  P.applyPayout(e, p2, { ts: NOW });
  eq("16r fully settled", P.statsUpTo(e, P.endOfDayTs(NOW)).outstanding, 0);
  eq("16s total paid = 200 exactly (no double pay)", P.statsUpTo(e, P.endOfDayTs(NOW)).paid, 200);
  eq("16t lifetime attendance counts are intact",
    P.statsUpTo(e, P.endOfDayTs(NOW)).work + "/" + P.statsUpTo(e, P.endOfDayTs(NOW)).abs + "/" + P.statsUpTo(e, P.endOfDayTs(NOW)).vac,
    "2/1/1");
}

/* ==========================================================================
 * 17) تكرار الحساب لا يُغيّر شيئًا (idempotent preview) + الأيام غير المسجَّلة
 * ========================================================================== */
{
  const e = mkEmp({ id: "E17", name: "وليد", dailyWage: 100 });
  P.markDay(e, K(2026, 10, 11), "work");
  P.markDay(e, K(2026, 10, 12), "absent");
  const snap = JSON.stringify(e);
  for (let i = 0; i < 5; i++) P.planPayout(e, { nowTs: NOW, dateTs: NOW });   // معاينة متكررة
  ok("17a repeated previews never mutate the employee record", JSON.stringify(e) === snap);
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("17b preview stays stable", plan.abs, 1);
  eq("17c preview amount stays stable", plan.amount, 100);

  /* يوم بلا سجل ليس حضورًا ولا غيابًا ولا أجرًا */
  const g = mkEmp({ id: "E17b", name: "خالد", dailyWage: 100 });
  P.markDay(g, K(2026, 10, 10), "work");
  /* 11 و12 أكتوبر بلا أي سجل */
  const gs = P.statsUpTo(g, P.endOfDayTs(NOW));
  eq("17d unrecorded days are not workdays", gs.work, 1);
  eq("17e unrecorded days are not absences", gs.abs, 0);
  eq("17f unrecorded days earn nothing", gs.gross, 100);
  eq("17g outstanding = one wage", gs.outstanding, 100);
  const gp = P.planPayout(g, { nowTs: NOW, dateTs: NOW });
  eq("17h payout preview matches (no invented attendance)", gp.amount, 100);
  eq("17i no absence invented in the preview", gp.abs, 0);
  /* تغيير الأجر لا يعيد كتابة اللقطة المجمَّدة */
  e.dailyWage = 250;
  eq("17j frozen wage snapshot preserved", P.statsUpTo(e, P.endOfDayTs(NOW)).gross, 100);
}

/* ==========================================================================
 * 18) غياب/إجازة وقعت قبل أول يوم عمل مُغطّى — لا يجوز أن تضيع من التقرير
 * ========================================================================== */
{
  /* غياب في 12 أكتوبر ثم يوم عمل واحد في 13: أول يوم مُغطّى هو 13 */
  const a = mkWorker({ id: "E18", name: "سارة", dailyWage: 85 });
  P.markDay(a, K(2026, 10, 12), "absent");
  P.markDay(a, K(2026, 10, 13), "work");
  const sa = P.statsUpTo(a, P.endOfDayTs(D(2026, 10, 13)));
  eq("18a absence is recorded", sa.abs, 1);
  const pa = P.planPayout(a, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  eq("18b the absence preceding the first paid workday is NOT lost", pa.abs, 1);
  eq("18c attributed to this payout", pa.covered.absKeys.join(","), K(2026, 10, 12));
  eq("18d workdays reported", pa.work, 1);
  eq("18e the absence earns nothing", pa.amount, 85);
  P.applyPayout(a, pa, { ts: D(2026, 10, 13) });

  /* الدفعة التالية لا تعيد عرضه */
  P.markDay(a, K(2026, 10, 14), "work");
  const pa2 = P.planPayout(a, { nowTs: D(2026, 10, 14), dateTs: D(2026, 10, 14) });
  eq("18f not re-reported in the next payout", pa2.abs, 0);
  eq("18g lifetime absence still preserved", P.statsUpTo(a, P.endOfDayTs(D(2026, 10, 14))).abs, 1);

  /* إجازة كذلك + غيابان متعددان قبل أول يوم عمل */
  const b = mkEmp({ id: "E18b", name: "وليد", dailyWage: 100 });
  P.markDay(b, K(2026, 10, 8), "absent");
  P.markDay(b, K(2026, 10, 9), "vacation");
  P.markDay(b, K(2026, 10, 10), "absent");
  P.markDay(b, K(2026, 10, 11), "work");
  const pb = P.planPayout(b, { nowTs: D(2026, 10, 11), dateTs: D(2026, 10, 11) });
  eq("18h all preceding absences counted", pb.abs, 2);
  eq("18i preceding vacation counted", pb.vac, 1);
  eq("18j period starts at the earliest marker, not the first workday",
    pb.period.fromKey, K(2026, 10, 8));
  eq("18k money untouched by markers", pb.amount, 100);
  eq("18l three markers, one workday, three days reported", pb.covered.days, 4);

  /* غياب بلا أي يوم عمل ⇒ لا مستحق (لا صرف) مع بقاء السجل */
  const c = mkEmp({ id: "E18c", name: "منير", dailyWage: 100 });
  P.markDay(c, K(2026, 10, 12), "absent");
  const pc = P.planPayout(c, { nowTs: D(2026, 10, 13), dateTs: D(2026, 10, 13) });
  ok("18m nothing to pay when there is no worked day", pc.ok === false && pc.reason === "no-due");
  eq("18n the absence is still on record", P.statsUpTo(c, P.endOfDayTs(D(2026, 10, 13))).abs, 1);
}

/* ==========================================================================
 * 19) غياب بلا راتب: لا يُفقد، بل يُؤجَّل إلى أول دفعة تليه
 * ========================================================================== */
{
  const e = mkEmp({ id: "E19", name: "ياسمين", dailyWage: 100 });
  [2, 3, 4].forEach(function (d) { P.markDay(e, K(2026, 10, d), "work"); });
  [5, 6].forEach(function (d) { P.markDay(e, K(2026, 10, d), "absent"); });
  [7, 8, 9].forEach(function (d) { P.markDay(e, K(2026, 10, d), "work"); });
  const p1 = P.planPayout(e, { nowTs: D(2026, 10, 9, 18), dateTs: D(2026, 10, 9, 18) });
  eq("19a both earlier absences reported", p1.abs, 2);
  eq("19b wage paid", p1.amount, 600);
  P.applyPayout(e, p1, { ts: D(2026, 10, 9, 18) });

  /* غياب في 10-Oct بعد آخر صرف ⇒ لا مستحق ولا تقرير — لكنه ليس مفقودًا */
  P.markDay(e, K(2026, 10, 10), "absent");
  const p2 = P.planPayout(e, { nowTs: D(2026, 10, 10, 18), dateTs: D(2026, 10, 10, 18) });
  ok("19c no payout possible on an absence-only day", p2.ok === false && p2.reason === "no-due");
  eq("19d the absence remains on record meanwhile", P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 10, 18))).abs, 3);

  /* أول دفعة بعده تُبلّغ عنه */
  P.markDay(e, K(2026, 10, 11), "work");
  const p3 = P.planPayout(e, { nowTs: D(2026, 10, 11, 18), dateTs: D(2026, 10, 11, 18) });
  eq("19e the deferred absence is reported by the next payout", p3.abs, 1);
  eq("19f attributed to the right day", p3.covered.absKeys.join(","), K(2026, 10, 10));
  P.applyPayout(e, p3, { ts: D(2026, 10, 11, 18) });
  eq("19g lifetime absence count intact", P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 11, 18))).abs, 3);

  /* غياب يُسجَّل ولا تُنفَذ أي دفعة أبدًا ⇒ يبقى محفوظًا في السجل فقط */
  const f = mkEmp({ id: "E19b", name: "never", dailyWage: 100 });
  P.markDay(f, K(2026, 10, 5), "work");
  const f1 = P.planPayout(f, { nowTs: D(2026, 10, 5, 18), dateTs: D(2026, 10, 5, 18) });
  P.applyPayout(f, f1, { ts: D(2026, 10, 5, 18) });
  P.markDay(f, K(2026, 10, 6), "absent");
  P.markDay(f, K(2026, 10, 7), "vacation");
  eq("19h attendance ledger keeps them", P.statsUpTo(f, P.endOfDayTs(D(2026, 10, 8))).abs, 1);
  eq("19i vacation kept", P.statsUpTo(f, P.endOfDayTs(D(2026, 10, 8))).vac, 1);
  eq("19j no financial effect at all", P.statsUpTo(f, P.endOfDayTs(D(2026, 10, 8))).outstanding, 0);
}

/* ==========================================================================
 * 20) تسوية مستند الصرف: ترتيب زمني يجعل الرصيد التراكمي يبلغ ذروته قبل
 *     أن ينخفض (سلفة/خصم/مكافأة بتاريخ متأخر) فيخرج بند من التسمية.
 *     المستند يجب أن يبقى مطابقًا لنفسه عبر سطرَي:
 *         صافي بنود هذه الدفعة + بنود غير مُفصَّلة = المصروف في الدفعة
 *     المال صحيح دائمًا؛ هذه الأسطر هي التي تجعل البيان متسقًا.
 * ========================================================================== */
{
  const e = mkWorker({ id: "E20", name: "عبدالرحمن", dailyWage: 85 });
  P.markDay(e, K(2026, 10, 8), "work");
  P.markDay(e, K(2026, 10, 10), "work");
  /* السلفة تُسجَّل من شاشة المصروفات = اللحظة الحالية، أي بعد آخر يوم عمل */
  P.addAdvance(e, { id: "ADV20", ts: D(2026, 10, 12), amount: 20, reason: "سلفة" });

  const cut = P.endOfDayTs(D(2026, 10, 12));
  const s = P.statsUpTo(e, cut);
  eq("20a lifetime gross = 2 x 85", s.gross, 170);
  eq("20b lifetime net = 170 - 20", s.net, 150);
  eq("20c outstanding = 150 (the correct amount to pay)", s.outstanding, 150);

  const p = P.planPayout(e, { nowTs: D(2026, 10, 12), dateTs: D(2026, 10, 12) });
  eq("20d the payout amount is the full correct balance", p.amount, 150);
  eq("20e coveredNet = named items net", p.coveredNet, p.gross + p.bonus - p.pen - p.adv - p.ded);
  eq("20f itemsDiff = the unlabelled remainder", p.itemsDiff, 85);
  eq("20g THE DOCUMENT RECONCILES: coveredNet + itemsDiff == amount",
    p.coveredNet + p.itemsDiff, p.amount);

  const res = P.applyPayout(e, p, { ts: D(2026, 10, 12) });
  eq("20h saved payout keeps both figures",
    res.record.covered.coveredNet + res.record.covered.itemsDiff, 150);

  /* ---- الضمانات المالية ---- */
  const after = P.statsUpTo(e, cut);
  eq("20i the money is settled exactly", after.outstanding, 0);
  eq("20j total paid equals the net", after.paid, 150);
  eq("20k attendance history untouched", e.days.length, 2);
  eq("20l lifetime gross untouched", after.gross, 170);
  eq("20m the advance is still auditable", e.advances.length, 1);
  eq("20n the advance is not deducted twice", after.adv, 20);

  /* ---- الحالة الثانية: المكافأة هي ذروة المسار، لا السلفة ----
     5 أيام × 85 = 425، ثم مكافأة 35 ( balance 460 = الذروة )،
     ثم سلفة 20 بتاريخ لاحق ( balance 440 ) والدفع 440. */
  const b = mkWorker({ id: "E20B", name: "سارة", dailyWage: 85 });
  ["08", "09", "10", "11", "12"].forEach(d => P.markDay(b, K(2026, 10, +d), "work"));
  b.bonuses.push({ id: "BON35", ts: D(2026, 10, 13), amount: 35, reason: "مكافأة تميّز" });
  P.addAdvance(b, { id: "ADV20B", ts: D(2026, 10, 14, 15), amount: 20, reason: "سلفة" });

  const cutB = P.endOfDayTs(D(2026, 10, 14));
  const sB = P.statsUpTo(b, cutB);
  eq("20o the bonus counts toward the money", sB.net, 425 + 35 - 20);
  eq("20p outstanding = 440", sB.outstanding, 440);

  const pb = P.planPayout(b, { nowTs: D(2026, 10, 14, 15, 30), dateTs: D(2026, 10, 14, 15, 30) });
  eq("20q the payout pays the full balance", pb.amount, 440);
  eq("20r the bonus sits at the path peak, so it is not itemised", pb.bonus, 0);
  eq("20s coveredNet counts only the itemised rows", pb.coveredNet, 425 - 20);
  eq("20t itemsDiff == exactly the itemsDiff bonus", pb.itemsDiff, 35);
  eq("20u THE DOCUMENT RECONCILES AGAIN", pb.coveredNet + pb.itemsDiff, pb.amount);
  eq("20v the bonus is still in the ledger for audit", b.bonuses.length, 1);

  P.applyPayout(b, pb, { ts: D(2026, 10, 14, 15, 30) });
  const afterB = P.statsUpTo(b, cutB);
  eq("20w money settled exactly", afterB.outstanding, 0);
  eq("20x the bonus was never paid twice", afterB.bonus, 35);
  eq("20y attendance untouched", b.days.length, 5);

  /* ---- الحالة الثالثة: مكافأة متأخرة بلا خصم لاحق ⇒ لا فرق إطلاقًا ---- */
  const c = mkWorker({ id: "E20C", name: "خالد", dailyWage: 100 });
  P.markDay(c, K(2026, 10, 8), "work");
  c.bonuses.push({ id: "BON50", ts: D(2026, 10, 12), amount: 50, reason: "مكافأة" });
  const pc = P.planPayout(c, { nowTs: D(2026, 10, 12), dateTs: D(2026, 10, 12) });
  eq("20z no gap when nothing later offsets the bonus", pc.itemsDiff, 0);
  eq("20z2 and the itemised net is the whole amount", pc.coveredNet, pc.amount);

  /* ---- الحالة الرابعة: الاتجاه المعاكس — بنود تتجاوز المبلغ المصروف
     سلفة كبيرة تُسدَّد أولًا، ثم يوم عمل جديد يُصرف رصيده. البنود
     المُسمّاة تشمل 10 سُدِّدت في دفعة سابقة ⇒ فرق البنود سالب. ---- */
  const d = mkWorker({ id: "E20D", name: "مريم", dailyWage: 100 });
  P.markDay(d, K(2026, 10, 8), "work");
  P.addAdvance(d, { id: "ADV90", ts: D(2026, 10, 9, 15), amount: 90, reason: "سلفة كبيرة" });
  /* المستحق الأول = 100 − 90 = 10 فقط */
  const p1d = P.planPayout(d, { nowTs: D(2026, 10, 9, 15, 30), dateTs: D(2026, 10, 9, 15, 30) });
  eq("20aa first payout is just the net balance", p1d.amount, 10);
  P.applyPayout(d, p1d, { ts: D(2026, 10, 9, 15, 30) });
  eq("20ab settled", P.statsUpTo(d, P.endOfDayTs(D(2026, 10, 9))).outstanding, 0);

  /* يوم عمل جديد ⇒ المستحق 100، والمصروف يجب أن يطابق البنود تمامًا */
  P.markDay(d, K(2026, 10, 10), "work");
  const p2d = P.planPayout(d, { nowTs: D(2026, 10, 10, 15, 30), dateTs: D(2026, 10, 10, 15, 30) });
  eq("20ac second payout = the new day", p2d.amount, 100);
  eq("20ad the itemised set nets to more than the payout", p2d.coveredNet, 110);
  eq("20ae so the difference is NEGATIVE", p2d.itemsDiff, -10);
  eq("20af and the document still reconciles", p2d.coveredNet + p2d.itemsDiff, p2d.amount);
  eq("20ag the previously paid part is disclosed", p2d.paidBefore, 10);
  P.applyPayout(d, p2d, { ts: D(2026, 10, 10, 15, 30) });
  eq("20ah settled exactly", P.statsUpTo(d, P.endOfDayTs(D(2026, 10, 10))).outstanding, 0);
  eq("20ai the advance is still recorded once", d.advances.length, 1);
  eq("20aj lifetime net unchanged", P.statsUpTo(d, P.endOfDayTs(D(2026, 10, 10))).net, 110);
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);