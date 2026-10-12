// tests/payroll-migration.test.js
// ترحيل بيانات الموظفين من النموذج الأسبوعي القديم (سبت←جمعة) إلى النموذج
// المرن — دون حذف أي سجل أو تغيير أي معنى مالي.
//
// كل البيانات هنا اصطناعية (Synthetic). لا تُلمَس بيانات الإنتاج إطلاقًا.

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
function D(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
const NOW = D(2026, 10, 12);       /* الاثنين 12 أكتوبر 2026 */

/* مصنع أسبوع قديم بالشكل الحقيقي المحفوظ على الجهاز */
function oldWeek(key, o) {
  o = o || {};
  const start = (function () { const p = key.split("-").map(Number); return D(p[0], p[1], p[2]); })();
  return Object.assign({
    key: key, startTs: start, endTs: start + 6 * 86400000, dailyWage: 100,
    days: [{ status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" },
           { status: "work", penalty: 0, bonus: 0, note: "" }],
    bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
    paid: false, paidAt: null, snapshot: null
  }, o);
}
/* موظف إنتاجي قديم كما هو تمامًا */
function oldEmp(weeks) {
  return {
    id: "E1", name: "أحمد محمود", job: "كاشير", dailyWage: 100, phone: "0100",
    hiredAt: D(2026, 1, 1), notes: "موظف قديم", weeks: weeks
  };
}

console.log("PAYROLL MIGRATION — weekly (Sat→Fri) records → flexible model");

/* ==========================================================================
 * 1) الأسبوع المصروف = تاريخ مدفوع، لا يدخل الرصيد الجديد ولا يُلمس
 * ========================================================================== */
{
  const paidWeek = oldWeek("2026-09-26", {
    paid: true, paidAt: D(2026, 10, 2),
    snapshot: { work: 7, vac: 0, abs: 0, bonus: 0, pen: 0, adv: 0, ded: 0, gross: 700, net: 700 }
  });
  const e = oldEmp([paidWeek]);
  const before = clone(e);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("1a no attendance imported from a paid week", e.days.length, 0);
  eq("1b paid week preserved verbatim", JSON.stringify(e.weeks[0].days), JSON.stringify(before.weeks[0].days));
  eq("1c paid week snapshot preserved", e.weeks[0].snapshot.net, 700);
  eq("1d paid week still marked paid", e.weeks[0].paid, true);
  ok("1e paid week explicitly flagged as settled", e.weeks[0].legacySettled === true);
  eq("1f nothing is owed from the paid week", P.statsUpTo(e, NOW).outstanding, 0);
  eq("1g name / phone / notes / hiredAt untouched", e.name + "|" + e.phone + "|" + e.notes, "أحمد محمود|0100|موظف قديم");
}

/* ==========================================================================
 * 2) الأسبوع غير المصروف: تُستورد أيامه المنتهية فقط
 * ========================================================================== */
{
  const e = oldEmp([oldWeek("2026-10-03")]);   /* 3..9 أكتوبر — كلها منتهية */
  P.migrateEmployee(e, { nowTs: NOW });
  eq("2a all seven elapsed days imported", e.days.length, 7);
  eq("2b first imported day", e.days[0].key, K(2026, 10, 3));
  eq("2c last imported day", e.days[6].key, K(2026, 10, 9));
  ok("2d imported days are tagged as legacy", e.days.every(function (d) { return d.src === "legacy"; }));
  const s = P.statsUpTo(e, NOW);
  eq("2e unpaid week still owed (7 x 100)", s.outstanding, 700);
  eq("2f work counted from the legacy grid", s.work, 7);
}

/* ==========================================================================
 * 3) الأيام المستقبلية لا تُستورد — لا نحترع حضورًا
 * ========================================================================== */
{
  const e = oldEmp([oldWeek("2026-10-10")]);   /* 10..16 أكتوبر — 10/11/12 منتهية فقط */
  P.migrateEmployee(e, { nowTs: NOW });
  eq("3a only elapsed days imported", e.days.length, 3);
  eq("3b last imported day is today", e.days[2].key, K(2026, 10, 12));
  ok("3c no future day imported", e.days.every(function (d) { return d.key <= K(2026, 10, 12); }));
  eq("3d future days still exist in the legacy week (not deleted)", e.weeks[0].days.length, 7);
  eq("3e owed = 3 days only", P.statsUpTo(e, NOW).outstanding, 300);
}

/* ==========================================================================
 * 4) الغياب والإجازة المسجَّلان في الأسبوع القديم ينتقلان كما هما
 * ========================================================================== */
{
  const w = oldWeek("2026-10-03");
  w.days[2].status = "absent"; w.days[3].status = "vacation"; w.days[3].note = "إجازة مرضية";
  const e = oldEmp([w]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("4a absence preserved", e.days[2].status, "absent");
  eq("4b vacation preserved", e.days[3].status, "vacation");
  eq("4c note preserved", e.days[3].note, "إجازة مرضية");
  const s = P.statsUpTo(e, NOW);
  eq("4d absence counted", s.abs, 1);
  eq("4e vacation counted", s.vac, 1);
  eq("4f work = 5", s.work, 5);
  eq("4g owed = 5 x 100", s.outstanding, 500);
}

/* ==========================================================================
 * 5) العمليات: مكافآت/جزاءات/سلف/خصومات من الأسبوع غير المصروف
 * ========================================================================== */
{
  const w = oldWeek("2026-10-03");
  w.bonuses = [{ id: "b1", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "مكافأة", note: "" }];
  w.penalties = [{ id: "p1", day: 1, ts: D(2026, 10, 4), amount: 20, reason: "جزاء", note: "" }];
  w.advances = [{ id: "a1", day: 2, ts: D(2026, 10, 5), amount: 100, reason: "سلفة", note: "ضروورية", expenseId: "EXP1" }];
  w.deductions = [{ id: "d1", day: 3, ts: D(2026, 10, 6), amount: 30, reason: "خصم", note: "" }];
  const e = oldEmp([w]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("5a bonus imported", e.bonuses.length, 1);
  eq("5b penalty imported", e.penalties.length, 1);
  eq("5c advance imported", e.advances.length, 1);
  eq("5d deduction imported", e.deductions.length, 1);
  eq("5e advance keeps its expense link (audit trail)", e.advances[0].expenseId, "EXP1");
  eq("5f advance keeps its note", e.advances[0].note, "ضروورية");
  eq("5g legacy origin id kept for dedup", e.advances[0].legacyId, "a1");
  const s = P.statsUpTo(e, NOW);
  eq("5h owed = 700 +50 -20 -100 -30", s.outstanding, 600);
  /* الصرف يستهلك السلفة مرة واحدة فقط */
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  P.applyPayout(e, plan, { ts: NOW, ref: "PAY-MIG" });
  eq("5i settled after payout", P.statsUpTo(e, NOW).outstanding, 0);
  eq("5j advance still in the record (auditable)", e.advances.length, 1);
  ok("5k advance stamped with the settling payout", !!e.advances[0].settledBy);
}

/* ==========================================================================
 * 6) سجل مصروفات سلفة مرتبط — حذف المصروف يحذف السلفة (من النظام الجديد)
 * ========================================================================== */
{
  const e = oldEmp([]);
  P.migrateEmployee(e, { nowTs: NOW });
  P.addAdvance(e, { id: "aX", ts: NOW, amount: 75, reason: "سلفة", expenseId: "EXP9" });
  eq("6a advance linked", e.advances.length, 1);
  eq("6b deleting the expense removes the advance", P.removeAdvanceByExpense(e, "EXP9"), 1);
  eq("6c advance gone from payroll", e.advances.length, 0);
}

/* ==========================================================================
 * 7) الترحيل آمن ومُتكرّر بلا أثر (idempotent) — لا ازدواج ولا فقدان
 * ========================================================================== */
{
  const e = oldEmp([oldWeek("2026-10-03"), oldWeek("2026-10-10")]);
  const r1 = P.migrateEmployee(e, { nowTs: NOW });
  ok("7a first run reports a migration", r1.migrated === true);
  const snap = clone(e);
  const r2 = P.migrateEmployee(e, { nowTs: NOW });
  eq("7b second run is a no-op", JSON.stringify(e), JSON.stringify(snap));
  eq("7c second run does not re-import", r2.imported, 0);
  eq("7d days not duplicated", e.days.length, 10);
}

/* ==========================================================================
 * 8) سجل لا يمكن تفسيره بأمان ⇒ يُعلَّم للمراجعة ولا تتغير قيمته المالية
 * ========================================================================== */
{
  const bad = oldWeek("2026-10-03", { paid: true, paidAt: D(2026, 10, 3), snapshot: null });
  const e = oldEmp([bad]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("8a flagged for review", e.reviewFlags.length, 1);
  eq("8b flag names the record", e.reviewFlags[0].ref, "2026-10-03");
  eq("8c flag type", e.reviewFlags[0].kind, "paid-week-no-snapshot");
  ok("8d the record itself is not modified", e.weeks[0].snapshot === null && e.weeks[0].paid === true);
  eq("8e no earnings invented from an unreadable record", P.statsUpTo(e, NOW).outstanding, 0);
}

/* ==========================================================================
 * 9) بعد الترحيل: الدفع المرن يعمل والبيانات القديمة ما زالت قابلة للقراءة
 * ========================================================================== */
{
  const w = oldWeek("2026-10-03");
  w.days[3].status = "absent";
  const e = oldEmp([w]);
  P.migrateEmployee(e, { nowTs: NOW });
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("9a payout after migration = 6 x 100", plan.amount, 600);
  /* تغطية مالية: أيام العمل المغطاة هي أيام العمل فعلًا من الأسبوع القديم،
     مع استثناء يوم الغياب (6 أكتوبر) الذي هُرم مستوردًا من الشبكة القديمة. */
  eq("9b covered work days exclude the migrated absence",
    plan.covered.dayKeys.join(","),
    [3, 4, 5, 7, 8, 9].map(function (d) { return K(2026, 10, d); }).join(","));
  eq("9b-2 covered work count = 6", plan.work, 6);
  eq("9b-3 covered gross = 600", plan.gross, 600);
  eq("9b-3b migrated absence is counted in the payout", plan.abs, 1);
  eq("9b-3c absence is attributed to that payout",
    plan.covered.absKeys.join(","), K(2026, 10, 6));
  /* الفترة المُعلَنة تمتد حتى تاريخ الصرف — وهو ما يطبعه التقرير حرفيًا؛
    وانتهى عند آخر يوم مُغطّى ماليًا فقط. */
  eq("9b-4 period starts at the first covered day", plan.period.fromKey, K(2026, 10, 3));
  eq("9b-5 period ends at the payout date", plan.period.toKey, K(2026, 10, 12));
  P.applyPayout(e, plan, { ts: NOW, ref: "PAY-1" });
  eq("9c settled", P.statsUpTo(e, NOW).outstanding, 0);
  eq("9d legacy week still readable (statement/history)", e.weeks.length, 1);
  eq("9e legacy weekly net preserved", P.legacyNet(e.weeks[0]), 600);
  /* حضور جديد بعد الترحيل يستمر بشكل طبيعي */
  P.markDay(e, K(2026, 10, 13), "work");
  eq("9f new attendance accrues after migration", P.statsUpTo(e, D(2026, 10, 13)).outstanding, 100);
}

/* ==========================================================================
 * 10) الأجر الجديد لا يعيد كتابة سجل الترحيل
 * ========================================================================== */
{
  const e = oldEmp([oldWeek("2026-10-10")]);   /* 3 أيام منتهية بأجر 100 */
  P.migrateEmployee(e, { nowTs: NOW });
  eq("10a imported at the historical wage", P.statsUpTo(e, NOW).gross, 300);
  e.dailyWage = 150;                            /* تغيّر أجر الموظف */
  eq("10b past earnings unchanged after a wage change", P.statsUpTo(e, NOW).gross, 300);
  P.markDay(e, K(2026, 10, 13), "work");
  eq("10c new days use the new wage", P.statsUpTo(e, D(2026, 10, 13)).gross, 450);
}

/* ==========================================================================
 * 11) موظف بلا سجلات قديمة يُهيَّأ بأمان (دورة افتراضية = كل 7 أيام)
 * ========================================================================== */
{
  const e = oldEmp([]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("11a default preferred cycle", e.payCycle, "weekly");
  ok("11b ledger arrays initialised", Array.isArray(e.days) && Array.isArray(e.payouts)
    && Array.isArray(e.advances) && Array.isArray(e.bonuses));
  eq("11c schema stamp written", e.legacySchema, P.SCHEMA);
  const e2 = { id: "X", name: "جديد", dailyWage: 85, weeks: [] };
  P.migrateEmployee(e2, { nowTs: NOW });
  ok("11d a brand-new employee migrates cleanly", e2.days.length === 0 && e2.payCycle === "weekly");
}

/* ==========================================================================
 * 12) ضمانات إضافية: لا كتابة فوق أي قيمة قائمة + مفتاح مفقود يُسترجع
 * ========================================================================== */
{
  /* قيمة legacyNet موجودة مسبقًا يجب ألا تُكتب فوقها أبدًا */
  const w = oldWeek("2026-09-26", { paid: true, paidAt: D(2026, 10, 2), snapshot: { net: 700 }, legacyNet: 12345 });
  const e = oldEmp([w]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("12a an existing legacyNet is never overwritten", e.weeks[0].legacyNet, 12345);

  /* مفتاح مفقود لكن startTs صالح ⇒ يُسترجع ولا يُرفع إنذار كاذب */
  const w2 = oldWeek("2026-10-03"); delete w2.key;
  const e2 = oldEmp([w2]);
  P.migrateEmployee(e2, { nowTs: NOW });
  eq("12b missing key recovered from startTs (no false warning)", e2.reviewFlags.length, 0);
  eq("12c ...and the week is still migrated", e2.days.length, 7);

  /* لا مفتاح ولا startTs ⇒ إنذار حقيقي بلا اختراع أرباح */
  const w3 = oldWeek("2026-10-03"); delete w3.key; w3.startTs = 0;
  const e3 = oldEmp([w3]);
  P.migrateEmployee(e3, { nowTs: NOW });
  eq("12d a week with neither key nor startTs is flagged", e3.reviewFlags.length, 1);
  eq("12e flag kind", e3.reviewFlags[0].kind, "week-unreadable");
  eq("12f no earnings invented from it", P.statsUpTo(e3, P.endOfDayTs(NOW)).outstanding, 0);
}

/* ==========================================================================
 * 13) أدلة الترحيل — كل بند مشروح في تقرير الجاهزية كـ NOT VERIFIED
 *     (بيانات الإنتاج) يُغطّى هنا ببيانات اصطناعية فقط.
 * ========================================================================== */
{
  const finOf = (w) => JSON.stringify({
    key: w.key, startTs: w.startTs, endTs: w.endTs, dailyWage: w.dailyWage, weekNote: w.weekNote,
    paid: w.paid, paidAt: w.paidAt, snapshot: w.snapshot,
    days: w.days.map((d) => [d.status, d.penalty, d.bonus, d.note]),
    bonuses: w.bonuses, penalties: w.penalties, advances: w.advances, deductions: w.deductions
  });

  /* (أ) الأجور المدفوعة تاريخًا لا تُدفع مرتين — عبر عدة أسابيع مختلطة */
  const e = oldEmp([
    oldWeek("2026-09-12", { paid: true, paidAt: D(2026, 9, 18), snapshot: { work: 7, gross: 700, net: 700 } }),
    oldWeek("2026-09-19", { paid: true, paidAt: D(2026, 9, 25), snapshot: { work: 7, gross: 700, net: 700 } }),
    oldWeek("2026-09-26", { paid: true, paidAt: D(2026, 10, 2), snapshot: { work: 7, gross: 700, net: 700 } }),
    oldWeek("2026-10-03")
  ]);
  const finBefore = e.weeks.map(finOf);
  P.migrateEmployee(e, { nowTs: NOW });
  const cut = P.endOfDayTs(NOW);
  eq("13a only the unpaid week is owed", P.statsUpTo(e, cut).outstanding, 700);
  eq("13b no attendance imported from the three paid weeks", e.days.length, 7);
  const p1 = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  eq("13c exactly one week's wages are payable", p1.amount, 700);
  P.applyPayout(e, p1, { ts: NOW, ref: "PAY-1" });
  eq("13d fully settled", P.statsUpTo(e, cut).outstanding, 0);
  ok("13e a second payout is refused", P.planPayout(e, { nowTs: NOW, dateTs: NOW }).ok === false);
  eq("13f all four weeks still present", e.weeks.length, 4);
  eq("13g the paid weeks' financial content is byte-identical",
    JSON.stringify(e.weeks.slice(0, 3).map(finOf)), JSON.stringify(finBefore.slice(0, 3)));

  /* (ب) الأجور المكتسبة غير المدفوعة لا تُفقد — مع غياب وإجازة وسلف وخصم */
  const w = oldWeek("2026-10-03");
  w.days[1].status = "absent"; w.days[3].status = "vacation";
  w.advances = [{ id: "a1", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "سلفة", note: "", expenseId: "X" }];
  w.bonuses = [{ id: "b1", day: 1, ts: D(2026, 10, 4), amount: 30, reason: "مكافأة", note: "" }];
  w.deductions = [{ id: "d1", day: 2, ts: D(2026, 10, 5), amount: 15, reason: "خصم", note: "" }];
  const e2 = oldEmp([w]);
  P.migrateEmployee(e2, { nowTs: NOW });
  const s2 = P.statsUpTo(e2, cut);
  eq("13h workdays imported", s2.work, 5);
  eq("13i absence imported", s2.abs, 1);
  eq("13j vacation imported", s2.vac, 1);
  eq("13k advance imported", s2.adv, 50);
  eq("13l bonus imported", s2.bonus, 30);
  eq("13m deduction imported", s2.ded, 15);
  eq("13n nothing lost: outstanding = 500+30-50-15", s2.outstanding, 465);
  const p2 = P.planPayout(e2, { nowTs: NOW, dateTs: NOW });
  eq("13o the whole unpaid balance is payable", p2.amount, 465);
  eq("13p the absence reaches the payout", p2.abs, 1);
  P.applyPayout(e2, p2, { ts: NOW });
  eq("13q settled", P.statsUpTo(e2, cut).outstanding, 0);
  ok("13r advance settled once and preserved", !!e2.advances[0].settledBy && e2.advances.length === 1);
  eq("13s attendance records still on file", e2.days.length, 7);

  /* (ج) الأسابيع الغامضة تُعلَّم للمراجعة ولا تُغيَّر ماليًا */
  const bad1 = oldWeek("2026-10-03", { paid: true, paidAt: NOW, snapshot: null });
  const e3 = oldEmp([bad1]);
  P.migrateEmployee(e3, { nowTs: NOW });
  eq("13t paid week without a snapshot is flagged", e3.reviewFlags.length, 1);
  eq("13u flag kind", e3.reviewFlags[0].kind, "paid-week-no-snapshot");
  eq("13v no earnings invented from it", P.statsUpTo(e3, cut).outstanding, 0);
  eq("13w the ambiguous record itself is untouched", finOf(e3.weeks[0]), finOf(bad1));

  /* (د) إعادة الترحيل مُتكرّرة بلا أثر */
  const e4 = oldEmp([oldWeek("2026-10-03"), oldWeek("2026-09-26", { paid: true, snapshot: { net: 700 } })]);
  P.migrateEmployee(e4, { nowTs: NOW });
  const snap = JSON.stringify(e4);
  const r = P.migrateEmployee(e4, { nowTs: NOW });
  ok("13x a second migration run changes nothing", JSON.stringify(e4) === snap);
  eq("13y ...and imports nothing more", r.imported, 0);
  eq("13z weeks are never deleted", e4.weeks.length, 2);
}

/* ==========================================================================
 * 14) إظهار عدد أيام الحضور المُرحَّلة — قرار المستخدم رقم 2.
 *     الشرط الحاكم: إظهار العدد **دون** تغيير أي رصيد تاريخي و**دون**
 *     إعادة احتساب أي يوم كان مدفوعًا.
 * ========================================================================== */
{
  /* (أ) فصل عدّ الأيام عن عدّ العمليات + حفظ سجل تدقيق ثابت */
  const w2 = oldWeek("2026-10-03");
  w2.days[1].status = "absent"; w2.days[3].status = "vacation";
  w2.advances = [{ id: "a2", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "سلفة", note: "", expenseId: "X" }];
  w2.deductions = [{ id: "d2", day: 2, ts: D(2026, 10, 5), amount: 15, reason: "خصم", note: "" }];
  const e = oldEmp([oldWeek("2026-09-26", { paid: true, paidAt: D(2026, 10, 2), snapshot: { net: 700 } }), w2]);
  const r = P.migrateEmployee(e, { nowTs: NOW });

  eq("14a every day of the unpaid week is imported (7: 5 work + 1 absent + 1 vacation)", r.importedDays, 7);
  eq("14b migrated operations are counted separately", r.importedOps, 2);
  eq("14c the legacy total stays days + ops", r.imported, r.importedDays + r.importedOps);
  ok("14d a persistent audit record is stored", !!e.legacyImport);
  eq("14e ...with the same day count", e.legacyImport.days, 7);
  eq("14e2 ...broken down: work", e.legacyImport.work, 5);
  eq("14e3 ...broken down: absent", e.legacyImport.abs, 1);
  eq("14e4 ...broken down: vacation", e.legacyImport.vac, 1);
  eq("14e5 work + absent + vacation == days", e.legacyImport.work + e.legacyImport.abs + e.legacyImport.vac, 7);
  eq("14f ...and the op count", e.legacyImport.ops, 2);
  eq("14g ...and the paid-week count", e.legacyImport.weeksPaid, 1);
  eq("14h ...and the unpaid-week count", e.legacyImport.weeksUnpaid, 1);
  eq("14i ...and the unreadable-week count", e.legacyImport.weeksUnreadable, 0);
  eq("14j the migration timestamp is stored", e.legacyImport.at, NOW);

  /* (ب) إعادة التشغيل لا تعيد العدّ ولا تغيّر شيئًا */
  const before = JSON.stringify(e);
  const r2 = P.migrateEmployee(e, { nowTs: NOW + 9999 });
  eq("14k a second run imports no days", r2.importedDays, 0);
  eq("14l ...and no operations", r2.importedOps, 0);
  eq("14m ...and reports migrated=false", r2.migrated, false);
  eq("14n the employee record is byte-identical", JSON.stringify(e), before);
  ok("14o ...but the audit record is still readable", !!r2.audit && r2.audit.days === 7);

  /* (ج) قيد المستخدم: الأسابيع المدفوعة لا تُعاد احتسابها ولا تدخل الرصيد */
  eq("14p only the unpaid week's days entered the ledger", e.days.length, 7);
  const s = P.statsUpTo(e, P.endOfDayTs(NOW));
  eq("14q lifetime gross comes only from the unpaid week (5 work days x 100)", s.gross, 500);
  eq("14r ...and no day from the paid week leaked in", s.net, 500 - 50 - 15);
  eq("14r2 the paid week never entered the new ledger", s.work, 5);
  const keys = e.days.map(d => d.key).sort();
  ok("14s no attendance day predates the unpaid week start",
    keys.every(k => k >= "2026-10-03"), JSON.stringify(keys));

  /* (د) الإجماليات العامة تتطابق مع مجموع الصفوف */
  const list = [e, oldEmp([oldWeek("2026-09-19", { paid: true, snapshot: { net: 700 } })])];
  P.migrateEmployee(list[1], { nowTs: NOW });
  const aud = P.migrationAudit(list);
  eq("14t audit counts both employees", aud.employees, 2);
  eq("14u audit totals the imported days", aud.days, 7);
  eq("14v audit totals the imported operations", aud.ops, 2);
  eq("14w audit counts paid weeks (never re-counted)", aud.weeksPaid, 2);
  eq("14x audit counts migrated employees", aud.migrated, 1);
  ok("14y audit rows sum to the total days",
    aud.rows.reduce((a, r) => a + r.days, 0) === aud.days);
  ok("14z audit rows sum to the total operations",
    aud.rows.reduce((a, r) => a + r.ops, 0) === aud.ops);

  /* (هـ) موظف بلا سجل ترحيل لا يظهر كمرحَّل */
  const empty = P.migrationAudit([{ id: "NEW", name: "جديد", weeks: [] }]);
  eq("14aa a fresh employee has no audit record", empty.days, 0);
  eq("14ab ...and is not counted as migrated", empty.migrated, 0);
  eq("14ac ...but is still counted as an employee", empty.employees, 1);

  /* (و) الأسابيع غير المقروءة تُعلَّم ولا تُحتسب أيامًا */
  const bad = oldEmp([oldWeek("2026-10-03", { startTs: "غير-رقم", key: "لَيست-مفتاحًا" })]);
  P.migrateEmployee(bad, { nowTs: NOW });
  const audBad = P.migrationAudit([bad]);
  eq("14ad unreadable week is counted separately", audBad.weeksUnreadable, 1);
  eq("14ae ...and contributes zero imported days", audBad.days, 0);
  eq("14ae2 ...and zero work days", audBad.work, 0);
  eq("14af ...and raises a review flag", audBad.flags, 1);

  /* (ز) الإظهار لا يغيّر الرصيد: نفس الدالة مرّتين = نفس الأرقام */
  const balBefore = P.statsUpTo(e, P.endOfDayTs(NOW));
  P.migrationAudit(list); P.migrationAudit(list);
  const balAfter = P.statsUpTo(e, P.endOfDayTs(NOW));
  eq("14ag reading the audit does not move the balance", balAfter.outstanding, balBefore.outstanding);
  eq("14ah ...nor the gross", balAfter.gross, balBefore.gross);
}
console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
