// tests/payroll-integrity.test.js
// سلامة مالية: صحّة الأجر التاريخي (G-1)، و أمان الترحيل تحت الانقطاع (G-2)،
// و التراجع المحمي عن الترحيل (Phase C)، و السجلات الغامضة (Phase D).
//
// كل البيانات اصطناعية بالكامل، في الذاكرة. لا Electron ولا إنتاج.

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
function D(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
const NOW = D(2026, 10, 12);
function EOD() { return P.endOfDayTs(NOW); }

function oldWeek(key, o) {
  o = o || {};
  const p = key.split("-").map(Number);
  const start = D(p[0], p[1], p[2]);
  const wk = {
    key: key, startTs: start, endTs: start + 6 * 86400000, dailyWage: 100,
    days: [0, 1, 2, 3, 4, 5, 6].map(function () { return { status: "work", penalty: 0, bonus: 0, note: "" }; }),
    bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
    paid: false, paidAt: null, snapshot: null
  };
  Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete wk[k]; else wk[k] = o[k]; });
  return wk;
}
function oldEmp(weeks, o) {
  return Object.assign({
    id: "E1", name: "أحمد محمود", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), notes: "موظف قديم", weeks: weeks
  }, o || {});
}
function kindsOf(e) { return (e.reviewFlags || []).map(function (f) { return f.kind; }); }

console.log("PAYROLL INTEGRITY - historical wage, crash-safe migration, guarded rollback");

/* ==========================================================================
 * 1) G-1: الأجر التاريخي صحيح — لا يُستبدل بأجر الموظف الحالي
 * ========================================================================== */
{
  /* (أ) تغيير الأجر بعد تسجيل أيام: الأيام السابقة تحتفظ بأجرها */
  const e = oldEmp([]);
  P.markDay(e, K(2026, 10, 1), "work");
  P.markDay(e, K(2026, 10, 2), "work");
  P.markDay(e, K(2026, 10, 3), "work");
  eq("1a three days at 100", P.statsUpTo(e, EOD()).gross, 300);
  e.dailyWage = 200;                                  /* مضاعفة الأجر */
  eq("1b past earnings unchanged after the raise", P.statsUpTo(e, EOD()).gross, 300);
  eq("1c the frozen wage on an old day is untouched", e.days[0].wage, 100);
  P.markDay(e, K(2026, 10, 4), "work");
  eq("1d a new day uses the new wage", e.days[3].wage, 200);
  eq("1e lifetime gross = 3x100 + 1x200", P.statsUpTo(e, EOD()).gross, 500);
  const outBefore = P.statsUpTo(e, EOD()).outstanding;
  eq("1f outstanding follows the same arithmetic", outBefore, 500);
}
{
  /* (ب) الترحيل: أيام الأسبوع القديم تُرحَّل بأجر ذلك الأسبوع لا بأجر الموظف */
  const w = oldWeek("2026-10-03", { dailyWage: 80 });   /* الأسبوع بأجر 80 */
  const e = oldEmp([w], { dailyWage: 150 });             /* الموظف الآن بأجر 150 */
  P.migrateEmployee(e, { nowTs: NOW });
  eq("1g the historical week imported all seven days", e.days.length, 7);
  ok("1h every imported day carries the week's own wage",
     e.days.every(function (d) { return d.wage === 80; }),
     JSON.stringify(e.days.map(function (d) { return d.wage; })));
  eq("1i outstanding = 7 x 80, NOT 7 x 150", P.statsUpTo(e, EOD()).outstanding, 560);
  eq("1j gross likewise uses the historical wage", P.statsUpTo(e, EOD()).gross, 560);
  eq("1k the raising to 150 must not inflate the legacy week", P.statsUpTo(e, EOD()).outstanding === 1050, false);
  /*LegacyNet يبقى محسوبًا بأجر الأسبوع */
  eq("1l legacyNet still derives from the week's wage", P.legacyNet(e.weeks[0]), 560);
  /* يوم جديد بعد الترحيل يأخذ الأجر الحالي */
  P.markDay(e, K(2026, 10, 13), "work");
  eq("1m a new day after migration uses the current wage", e.days[7].wage, 150);
  eq("1n ...and adds to the balance", P.statsUpTo(e, P.endOfDayTs(D(2026, 10, 13))).outstanding, 710);
}
{
  /* (ج) لا أجر محفوظ ⇒ نُعلّم ولا نخمّن ولا نخترع أرباحًا */
  const w = oldWeek("2026-10-03", { dailyWage: undefined });   /* الأجر مفقود */
  const e = oldEmp([w], { dailyWage: 150 });
  P.migrateEmployee(e, { nowTs: NOW });
  ok("1o a week with no saved wage is flagged for review",
     kindsOf(e).indexOf("week-no-wage") !== -1, JSON.stringify(kindsOf(e)));
  eq("1p ...and nothing is imported from it", e.days.length, 0);
  eq("1q ...and no earnings are invented", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("1r the audit records the count", e.legacyImport.weeksNoWage, 1);
  /* سجل الأجر صفر أو سالب ⇒ لا يُقبل كذلك */
  const w2 = oldWeek("2026-09-26", { dailyWage: 0 });
  const e2 = oldEmp([w2], { dailyWage: 150 });
  P.migrateEmployee(e2, { nowTs: NOW });
  ok("1s a zero wage is also treated as unknown", kindsOf(e2).indexOf("week-no-wage") !== -1);
  eq("1t ...and imports nothing", e2.days.length, 0);
}
{
  /* (د) الدفعات والسلف القائمة لا تتغيّر بسبب إصلاح الأجر */
  const w = oldWeek("2026-10-03", { dailyWage: 80 });
  w.advances = [{ id: "a1", day: 0, ts: D(2026, 10, 3), amount: 100, reason: "سلفة", note: "" }];
  const e = oldEmp([w], { dailyWage: 150 });
  P.migrateEmployee(e, { nowTs: NOW });
  eq("1u the advance migrated once", e.advances.length, 1);
  eq("1v outstanding = 560 - 100", P.statsUpTo(e, EOD()).outstanding, 460);
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  P.applyPayout(e, plan, { ts: NOW, ref: "PAY-1" });
  eq("1w settled exactly", P.statsUpTo(e, EOD()).outstanding, 0);
  const advBefore = JSON.stringify(e.advances);
  /* إعادة الترحيل لا تمسّ الدفعات ولا السلف */
  P.migrateEmployee(e, { nowTs: NOW });
  eq("1x re-migration leaves payouts untouched", e.payouts.length, 1);
  eq("1y ...and leaves the advance untouched", JSON.stringify(e.advances), advBefore);
  eq("1z ...and keeps the balance settled", P.statsUpTo(e, EOD()).outstanding, 0);
}

/* ==========================================================================
 * 2) G-2: الترحيل آمن تحت الانقطاع — لا يُتخطّى ولا يُكرَّر
 * ========================================================================== */
{
  /* (أ) انقطاع بعد ختم legacyHandled وقبل الاستيراد — الحالة القديمة الخفيفة */
  const w = oldWeek("2026-10-03", { dailyWage: 100 });
  const e = oldEmp([w]);
  P.migrateEmployee(e, { nowTs: NOW });
  eq("2a baseline: seven days imported", e.days.length, 7);
  /* نحاكي انقطاعًا: نُعيد الختم إلى false ونحذف بعض الأيام كأن الحفظ لم يكتمل */
  e.weeks[0].legacyHandled = false;
  e.weeks[0].legacyMigrated = false;
  e.days = e.days.slice(0, 3);
  delete e.legacySchema; delete e.legacyImport; delete e.legacyMigratedAt;
  const r = P.migrateEmployee(e, { nowTs: NOW });
  eq("2b re-running recovers the un-imported days", e.days.length, 7);
  eq("2c and reports them as newly imported", r.importedDays, 4);
  ok("2d no duplicate day keys", (function () {
    var s = {}; return e.days.every(function (d) { if (s[d.key]) return false; s[d.key] = 1; return true; });
  })());
  eq("2e the balance is correct after recovery", P.statsUpTo(e, EOD()).outstanding, 700);
}
{
  /* (ب) انقطاع حقيقي بعد استيراد جزئي: 3 أيام فقط، بلا ختم مخطط */
  const w = oldWeek("2026-10-03", { dailyWage: 100 });
  w.advances = [{ id: "a9", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "سلفة", note: "" }];
  const e = oldEmp([w]);
  P.ensureLedger(e);
  [0, 1, 2].forEach(function (i) { P.markDay(e, K(2026, 10, 3 + i), "work", { src: "legacy", wage: 100 }); });
  eq("2f the interrupted state holds only the days already imported", e.days.length, 3);
  eq("2g ...and no schema stamp was written yet", e.legacySchema, undefined);
  const r = P.migrateEmployee(e, { nowTs: NOW });
  eq("2h re-running completes the remaining days", r.importedDays, 4);
  eq("2i the ledger now holds the full week", e.days.length, 7);
  eq("2j the advance landed exactly once", e.advances.length, 1);
  eq("2k the schema stamp is written only after full completion", e.legacySchema, P.SCHEMA);
  eq("2l and the balance reconciles", P.statsUpTo(e, EOD()).outstanding, 650);
  const again = P.migrateEmployee(e, { nowTs: NOW });
  eq("2m a further run imports nothing", again.importedDays, 0);
  eq("2n ...still exactly seven days", e.days.length, 7);
  eq("2o ...and still one advance", e.advances.length, 1);
}
{
  /* (ب2) انقطاع تام: أسبوع عولج وآخر لم يُلمس إطلاقًا، وبلا ختم مخطط */
  const e = oldEmp([oldWeek("2026-10-03", { dailyWage: 100 }), oldWeek("2026-09-26", { dailyWage: 100 })]);
  P.ensureLedger(e);
  /* الحالة التي يتركها انقطاع حقيقي: أول أسبوع اكتمل بالكامل، والثاني لم يبدأ */
  for (let i = 0; i < 7; i++) P.markDay(e, K(2026, 10, 3 + i), "work", { src: "legacy", wage: 100 });
  e.weeks[0].legacyHandled = true; e.weeks[0].legacyMigrated = true;
  eq("2p the interrupted state holds only the completed week", e.days.length, 7);
  eq("2q ...and carries no schema stamp", e.legacySchema, undefined);

  const r = P.migrateEmployee(e, { nowTs: NOW });
  eq("2r the untouched week is imported on the next run", r.importedDays, 7);
  eq("2s the ledger now holds both weeks", e.days.length, 14);
  ok("2t no duplicated day keys", (function () {
    var seen = {}; return e.days.every(function (d) { if (seen[d.key]) return false; seen[d.key] = 1; return true; });
  })());
  eq("2u the schema stamp appears once everything is handled", e.legacySchema, P.SCHEMA);
  eq("2v the balance reconciles across both weeks", P.statsUpTo(e, EOD()).outstanding, 1400);
  const r2 = P.migrateEmployee(e, { nowTs: NOW });
  eq("2w a further run imports nothing", r2.importedDays, 0);
  eq("2x ...still fourteen days, no duplication", e.days.length, 14);
}
{
  /* (ب3) شبكة أمان: ختم المخطط لا يُكتب ما دام هناك أسبوع غير مُعالَج.
     حارس دفاعي في الكود — لا نُبقيه بلا اختبار. */
  const src = require("fs").readFileSync(
    path.join(__dirname, "..", "assets", "payroll", "payroll-core.js"), "utf8");
  ok("2y the completion stamp is guarded by an all-handled check",
     /var allHandled = arr\(e\.weeks\)\.every/.test(src) && /if \(allHandled\)\s*\{\s*e\.legacySchema = SCHEMA/.test(src));
  ok("2z the week stamp is written only after the import loop",
     /w\.legacyMigrated = true;\s*\n\s*w\.legacyHandled = true;/.test(src));
}
{
  /* (ج) الختم لا يسبق الاستيراد: أسبوع بلا ختم بعد استيراد كامل */
  const e = oldEmp([oldWeek("2026-10-03"), oldWeek("2026-09-26", { paid: true, snapshot: { net: 700 } })]);
  P.migrateEmployee(e, { nowTs: NOW });
  ok("2n every handled week is stamped after processing",
     e.weeks.every(function (w) { return w.legacyHandled === true; }));
  ok("2o the paid week is marked settled, not migrated",
     e.weeks[1].legacySettled === true && e.weeks[1].legacyMigrated === undefined);
  eq("2o2 ...and the unpaid one is fully migrated", e.weeks[0].legacyMigrated, true);
  eq("2o3 the schema stamp is written only when every week is handled", e.legacySchema, P.SCHEMA);
}
{
  /* (د) الأسابيع الأصلية وسجل التدقيق محفوظان عبر الانقطاع */
  const weeksSnapshot = [oldWeek("2026-10-03"), oldWeek("2026-09-26", { paid: true, snapshot: { net: 700 } })];
  const e = oldEmp(clone(weeksSnapshot));
  const before = JSON.stringify(weeksSnapshot);
  P.migrateEmployee(e, { nowTs: NOW });
  /* نحاكي انقطاعًا ثم استعادة كما في الاسترجاع من نسخة أقدم */
  delete e.weeks[0].legacyHandled; delete e.weeks[1].legacyHandled;
  delete e.legacySchema;
  P.migrateEmployee(e, { nowTs: NOW });
  ok("2p the original legacy weeks survive unchanged",
     JSON.stringify(e.weeks.map(function (w) {
       return { key: w.key, startTs: w.startTs, endTs: w.endTs, dailyWage: w.dailyWage,
                paid: w.paid, snapshot: w.snapshot, n: w.days.length };
     })) === JSON.stringify(weeksSnapshot.map(function (w) {
       return { key: w.key, startTs: w.startTs, endTs: w.endTs, dailyWage: w.dailyWage,
                paid: w.paid, snapshot: w.snapshot, n: w.days.length };
     })));
  eq("2q still exactly seven days after the cycle", e.days.length, 7);
}

/* ==========================================================================
 * 3) التراجع المحمي
 * ========================================================================== */
{
  /* (أ) تراجع ناجح: يُحذف ما أنشأه الترحيل وحده */
  const w = oldWeek("2026-10-03", { dailyWage: 100 });
  w.advances = [{ id: "a1", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "سلفة", note: "" }];
  w.bonuses = [{ id: "b1", day: 1, ts: D(2026, 10, 4), amount: 30, reason: "مكافأة", note: "" }];
  const e = oldEmp([w]);
  P.markDay(e, K(2026, 10, 11), "work");              /* يوم غير مُرحَّل */
  P.addAdvance(e, { id: "own1", ts: D(2026, 10, 11), amount: 25, reason: "سلفة جديدة" });
  P.migrateEmployee(e, { nowTs: NOW });
  eq("3a seven legacy days plus one own day", e.days.length, 8);
  eq("3b two advances (one migrated, one own)", e.advances.length, 2);
  const weeksBefore = clone(e.weeks);
  const ownDayBefore = clone(e.days.filter(function (d) { return d.src !== "legacy"; }));
  const ownAdvBefore = clone(e.advances.filter(function (x) { return !x.legacyId; }));

  const r = P.rollbackMigration(e, {});
  ok("3c rollback is permitted here", r.ok === true && r.refused === false);
  eq("3d exactly the seven legacy days were removed", r.removedDays, 7);
  ok("3e two migrated operations were removed", r.removedOps === 2, "removedOps=" + r.removedOps);
  eq("3f only the own day remains", e.days.length, 1);
  eq("3g ...and it is untouched", JSON.stringify(e.days), JSON.stringify(ownDayBefore));
  eq("3h only the own advance remains", e.advances.length, 1);
  eq("3i ...untouched", JSON.stringify(e.advances), JSON.stringify(ownAdvBefore));
  ok("3j the legacy week is byte-identical after rollback",
     JSON.stringify(e.weeks.map(function (w2) { var c = clone(w2); ["legacyHandled", "legacySettled", "legacyMigrated", "legacyNet"].forEach(function (k) { delete c[k]; }); return c; })) ===
     JSON.stringify(weeksBefore.map(function (w2) { var c = clone(w2); ["legacyHandled", "legacySettled", "legacyMigrated", "legacyNet"].forEach(function (k) { delete c[k]; }); return c; })));
  eq("3k the schema stamp is cleared", e.legacySchema, undefined);
  eq("3l the audit record is cleared", e.legacyImport, undefined);
  eq("3m the remaining own day nets against the own advance", P.statsUpTo(e, EOD()).outstanding, 75);
}
{
  /* (ب) إعادة الترحيل بعد التراجع تُنتج الحالة نفسها */
  const w = oldWeek("2026-10-03", { dailyWage: 100 });
  w.advances = [{ id: "a1", day: 0, ts: D(2026, 10, 3), amount: 50, reason: "سلفة", note: "" }];
  const e1 = oldEmp([clone(w)]);
  P.migrateEmployee(e1, { nowTs: NOW });
  const snapOf = function (e) {
    return JSON.stringify({
      days: e.days, audit: e.legacyImport,
      advances: e.advances, outstanding: P.statsUpTo(e, EOD()).outstanding
    });
  };
  const before1 = snapOf(e1);
  ok("3n a rollback is permitted before any payout", P.rollbackMigration(e1, {}).ok === true);
  const midRollback = JSON.stringify(e1.days);
  ok("3o ...and the ledger is empty again", midRollback === "[]", midRollback);
  P.migrateEmployee(e1, { nowTs: NOW });
  eq("3p rollback + re-migration reproduces the exact original state", snapOf(e1), before1);
  eq("3q ...and the balance is identical", P.statsUpTo(e1, EOD()).outstanding, 650);
  eq("3r ...with the advance back exactly once", e1.advances.length, 1);
}
{
  /* (ج) تراجع مرفوض بعد دفعة — ولا يتغيّر شيء */
  const e = oldEmp([oldWeek("2026-10-03")]);
  P.migrateEmployee(e, { nowTs: NOW });
  const plan = P.planPayout(e, { nowTs: NOW, dateTs: NOW });
  P.applyPayout(e, plan, { ts: D(2026, 10, 12, 15), ref: "PAY-LATE" });
  const before = JSON.stringify(e);
  const r = P.rollbackMigration(e, {});
  ok("3t rollback is refused after a payout", r.refused === true && r.ok === false);
  ok("3u the refusal explains itself", typeof r.reason === "string" && r.reason.length > 0);
  eq("3v nothing changed at all", JSON.stringify(e), before);
  eq("3w the payout is still there", e.payouts.length, 1);
}
{
  /* (د) تراجع مرفوض بسبب عملية مُسدَّدة */
  const e = oldEmp([oldWeek("2026-10-03")]);
  P.migrateEmployee(e, { nowTs: NOW });
  e.advances = e.advances || [];
  e.advances.push({ id: "x1", ts: D(2026, 10, 4), amount: 10, settledBy: "PAY-9", legacyId: "zz" });
  const before = JSON.stringify(e);
  const r = P.rollbackMigration(e, {});
  ok("3x rollback is refused when an operation was settled", r.refused === true);
  eq("3y nothing changed", JSON.stringify(e), before);
}
{
  /* (هـ) رفض التراجع لموظف لم يُرحَّل + التكرار */
  const e = oldEmp([]);
  P.ensureLedger(e);
  const r0 = P.rollbackMigration(e, {});
  ok("3z rollback on a never-migrated employee is refused", r0.refused === true);
  eq("3zz ...and changes nothing", e.legacySchema, undefined);
  /* تكرار التراجع */
  const e2 = oldEmp([oldWeek("2026-10-03")]);
  P.migrateEmployee(e2, { nowTs: NOW });
  P.rollbackMigration(e2, {});
  const after1 = JSON.stringify(e2);
  const r2 = P.rollbackMigration(e2, {});
  ok("3aa a second rollback is refused (nothing left to undo)", r2.refused === true);
  eq("3ab ...and changes nothing", JSON.stringify(e2), after1);
}

/* ==========================================================================
 * 4) السجلات الغامضة — رايات لا تخمين
 * ========================================================================== */
{
  /* أسبوع مصروف بلا تاريخ صرف */
  const e = oldEmp([oldWeek("2026-09-26", { paid: true, paidAt: null, snapshot: { net: 700 } })]);
  P.migrateEmployee(e, { nowTs: NOW });
  ok("4a a paid week without a date is flagged", kindsOf(e).indexOf("paid-week-no-date") !== -1, JSON.stringify(kindsOf(e)));
  eq("4b ...and nothing is owed from it", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("4c ...and no days were invented", e.days.length, 0);
}
{
  /* أسبوع مصروف بلا لقطة محفوظة */
  const e = oldEmp([oldWeek("2026-09-26", { paid: true, paidAt: D(2026, 10, 2), snapshot: null })]);
  P.migrateEmployee(e, { nowTs: NOW });
  ok("4d a paid week without a snapshot is flagged", kindsOf(e).indexOf("paid-week-no-snapshot") !== -1);
  eq("4e ...without inventing earnings", P.statsUpTo(e, EOD()).outstanding, 0);
}
{
  /* أسبوع غير قابل للقراءة */
  const e = oldEmp([{ key: "ليس-مفتاحًا", startTs: "غير-رقم", dailyWage: 100, days: [], paid: false }]);
  P.migrateEmployee(e, { nowTs: NOW });
  ok("4f an unreadable week is flagged", kindsOf(e).indexOf("week-unreadable") !== -1);
  eq("4g ...and contributes nothing", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("4h ...and the audit counts it separately", e.legacyImport.weeksUnreadable, 1);
}
{
  /* سجل ناقص: لا أيام ولا أجر ولا مفتاح */
  const e = oldEmp([{ days: null, bonuses: null }]);
  P.migrateEmployee(e, { nowTs: NOW });
  ok("4i an empty legacy record does not crash the migration", true);
  eq("4j ...and produces no balance", P.statsUpTo(e, EOD()).outstanding, 0);
  eq("4k ...and no days", e.days.length, 0);
}
{
  /* رايات غير محسولة تبقى ولا تؤثر على الأرصدة */
  const e = oldEmp([oldWeek("2026-10-03", { dailyWage: undefined }),
                     oldWeek("2026-09-26", { paid: true, paidAt: null, snapshot: { net: 700 } })]);
  P.migrateEmployee(e, { nowTs: NOW });
  const flags = e.reviewFlags.length;
  ok("4l both problems produced flags", flags >= 2, "flags=" + flags);
  const balBefore = P.statsUpTo(e, EOD()).outstanding;
  /* العرض والتكرار لا يغيّران شيئًا */
  P.migrateEmployee(e, { nowTs: NOW });
  P.migrationAudit([e]);
  P.migrationAudit([e]);
  eq("4m re-reading the audit moves no balance", P.statsUpTo(e, EOD()).outstanding, balBefore);
  eq("4n flags are never silently cleared", e.reviewFlags.length, flags);
  ok("4o unresolved flags never settle an ambiguous balance", balBefore === 0);
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);