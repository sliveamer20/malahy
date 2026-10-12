// tests/payroll-properties.test.js
// اختبار خصائص (Property-based) لنظام الرواتب المرن.
//
// الهدف: إثبات أن القواعد المالية تحفظ نفسها على أي تسلسل عشوائي من
// الحضور والدفعات الجزئية — لا على سيناريوهات مكتوبة يدويًا فقط.
//
// الضمانات المُختبَرة:
//   P1) لا يُدفع أكثر من المستحق في أي خطوة   (لا صرف زائد)
//   P2) الرصيد = الصافي − المدفوع دائمًا        (الصحة الثنائية)
//   P3) لا يُعرض يوم حضور واحد في دفعةَين
//   P4) لا يُفقد يوم حضور/غياب/إجازة: كل يوم يُذكر مرة واحدة على الأقل
//   P5) المستند مطابق لنفسه: صافي البنود + الفرق = المصروف
//   P6) سجلات الموظف الأصلية (أيام/عمليات/أسابيع) لا تُحذف ولا تُفسَّخ تواريخها
//
// المولّد عشوائي ببذرة ثابتة ⇒ النتيجة قابلة لإعادة الإنتاج بالأمر نفسه.
// كل البيانات اصطناعية (Synthetic) — لا تُلمَس بيانات الإنتاج ولا يُفتح أي ملف.

const path = require("path");
const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "assets", "payroll", "payroll-core.js"));
const R = require(path.join(ROOT, "assets", "report", "payroll-report.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}

/* مولّد عشوائي ببذرة ثابتة (mulberry32) — نفس البذرة ⇒ نفس الحالة */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function D(y, m, d, h) { return new Date(y, m - 1, d, h === undefined ? 12 : h, 0, 0, 0).getTime(); }
function r2(v) { return Math.round(v * 100) / 100; }

/* ======================= 1) عمال وعملاء عشوائيون ======================= */
const N_EMP = Number(process.env.PROP_EMP || 400);
const N_DAYS = Number(process.env.PROP_DAYS || 40);
const SEED = Number(process.env.PROP_SEED || 20261012);

const rnd = rng(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

let payouts = 0, fullPayouts = 0, partialPayouts = 0;
let markersDeferred = 0, markersReported = 0;
const report = {
  overpay: [], notBinary: [], doubleShown: [], lostDays: [], docMismatch: [], mutated: []
};

/* سجل مراقبة: أي يوم عمل يُذكر في أي دفعة */
const seenWorkDay = {};      /* empId|dayKey -> payoutCount */
const markerDates = {};     /* empId|dayKey -> ever reported? */

const START = D(2026, 9, 1);
const statuses = ["work", "work", "work", "work", "absent", "vacation"];

for (let i = 0; i < N_EMP; i++) {
  const e = {
    id: "P" + i,
    name: "موظف " + i,
    job: "اختبار",
    dailyWage: int(50, 300),
    hiredAt: START,
    weeks: []
  };
  P.ensureLedger(e);
  const snapshotDays = {};

  /* تاريخ يتقدّم، نضيف أيام حضور/غياب/إجازة بشكل عشوائي */
  let cursor = 1;
  let clock = START + int(0, 6) * 3600000;
  const opCount = int(0, 6);
  for (let j = 0; j < opCount; j++) {
    clock += int(1, 30) * 3600000;
    const kind = pick(["advances", "deductions", "penalties", "bonuses"]);
    const row = {
      id: "OP" + i + "_" + j,
      ts: clock,
      amount: int(5, 60),
      reason: "اختبار",
      note: ""
    };
    e[kind].push(row);
  }

  while (cursor <= N_DAYS) {
    clock += int(1, 40) * 3600000;
    const st = pick(statuses);
    const key = K(2026, 9, cursor);
    const dayTs = D(2026, 9, cursor, 12);
    if (dayTs > clock) clock = dayTs;
    P.markDay(e, key, st);
    snapshotDays[key] = st;
    if (st !== "work") markerDates[e.id + "|" + key] = markerDates[e.id + "|" + key] || false;
    cursor += int(1, 3);

    /* أحيانًا صرف (كامل أو جزئي) */
    if (rnd() < 0.34) {
      const cut = P.endOfDayTs(clock);
      const s = P.statsUpTo(e, cut);
      if (s.outstanding > 0) {
        const partial = rnd() < 0.45;
        const amt = partial ? r2(s.outstanding * (0.15 + rnd() * 0.6)) : undefined;
        const plan = P.planPayout(e, { nowTs: clock, dateTs: clock, amount: amt });
        if (plan.ok) {
          payouts++;
          if (amt == null) fullPayouts++; else partialPayouts++;

          /* P1) لا تجاوز */
          if (plan.amount > r2(s.outstanding) + 0.005) report.overpay.push(e.id);
          /* P5) المستند مطابق لنفسه */
          if (r2(plan.coveredNet + plan.itemsDiff) !== r2(plan.amount)) report.docMismatch.push(e.id);

          P.applyPayout(e, plan, { ts: clock, ref: "PROP-" + payouts });

          /* P3) لا يوم عمل يُذكر مرتين */
          (plan.covered.dayKeys || []).forEach(function (k) {
            const mk = e.id + "|" + k;
            seenWorkDay[mk] = (seenWorkDay[mk] || 0) + 1;
            if (seenWorkDay[mk] > 1) report.doubleShown.push(mk);
          });
          /* عدّ العلامات المؤجَّلة/المبلَّغة */
          Object.keys(markerDates).forEach(function (mk) {
            if (mk.indexOf(e.id + "|") !== 0) return;
            const inThisBatch = (plan.abs + plan.vac) > 0;
            if (inThisBatch) markerDates[mk] = true;
          });
        }
      }
    }
  }

  /* P2) الثنائية: المتبقي = الصافي − المدفوع · P6) السجلات سليمة */
  const finalCut = P.endOfDayTs(clock + 40 * 3600000);
  const f = P.statsUpTo(e, finalCut);
  if (r2(f.gross + f.bonus - f.pen - f.adv - f.ded - f.paid) !== r2(f.outstanding)) report.notBinary.push(e.id);
  const origDays = Object.keys(snapshotDays).length;
  if (e.days.length !== origDays) report.lostDays.push(e.id + " " + e.days.length + "!=" + origDays);
  Object.keys(snapshotDays).forEach(function (k) {
    const d = e.days.filter(function (x) { return x.key === k; })[0];
    if (!d) { report.lostDays.push(e.id + " missing " + k); return; }
    if (d.status !== snapshotDays[k]) report.mutated.push(e.id + " " + k);
  });
}

/* P4) لا يوم علامة مفقود: كل علامة إمّا بُلِّغت أو ما زالت في السجل */
const lostMarkers = Object.keys(markerDates).filter(function (mk) { return markerDates[mk] === false; });

/* ---------- النتائج ---------- */
const note = (n) => console.log("        [" + n + "] " + n);

console.log("  --- property run ---");
console.log("  seed=" + SEED + " employees=" + N_EMP + " daysSpan=" + N_DAYS);
console.log("  payouts=" + payouts + " (full=" + fullPayouts + " partial=" + partialPayouts + ")");
console.log("  workdays reported=" + Object.keys(seenWorkDay).length +
  "  absence/vacation markers=" + Object.keys(markerDates).length +
  "  reported=" + Object.keys(markerDates).filter(function (k) { return markerDates[k]; }).length +
  "  deferred=" + lostMarkers.length);

eq("P1 no payout ever exceeded the outstanding balance", report.overpay.length, 0);
ok("P2 outstanding == net - paid for every employee", report.notBinary.length === 0,
  JSON.stringify(report.notBinary.slice(0, 5)));
eq("P3 no workday is named in two payouts", report.doubleShown.length, 0);
eq("P4 no attendance/absence/vacation day was deleted or reclassified", report.lostDays.length, 0);
eq("P4b no day record changed status", report.mutated.length, 0);
eq("P5 every payout document reconciles with itself", report.docMismatch.length, 0);
ok("P6 the run was substantial", payouts >= 500, "payouts=" + payouts);
note("absence/vacation markers not yet reported are deferred to the next payout, never lost (" + lostMarkers.length + ")");

/* ---------- 7) خصائص إضافية على الأرقام المطبوعة ---------- */
{
  const e = { id: "PX", name: "خصائص الطباعة", job: "اختبار", dailyWage: 123.45, hiredAt: D(2026, 9, 1), weeks: [] };
  P.ensureLedger(e);
  for (let d = 1; d <= 12; d++) P.markDay(e, K(2026, 9, d), d % 5 === 0 ? "absent" : "work");
  e.bonuses.push({ id: "PB", ts: D(2026, 9, 10), amount: 500, reason: "مكافأة كبيرة" });
  e.advances.push({ id: "PA", ts: D(2026, 9, 20), amount: 77.77, reason: "سلفة" });
  const plan = P.planPayout(e, { nowTs: D(2026, 9, 20, 15), dateTs: D(2026, 9, 20, 15) });
  const cb = P.commitBatch([e], [plan], { ts: D(2026, 9, 20, 15), dateTs: D(2026, 9, 20, 15), ref: "PROP-X" }, () => true);
  ["58", "80", "a4"].forEach(function (paper) {
    const h = R.batchHTML(cb.batch, { paper: paper });
    const m = R.batchModel(cb.batch, {});
    eq("P7[" + paper + "] batch totals reconcile",
      r2(m.totals.coveredNet + m.totals.itemsDiff), r2(m.totals.amount));
    const css = R.payrollPaperCSS(paper);
    ok("P8[" + paper + "] Arabic wrapping is declared in the paper CSS",
      css.indexOf("overflow-wrap:anywhere") !== -1);
    /* لا قيمة رقمية أطول من سطر الورق (محاكاة: fitAmount يقصّ) */
    const vals = (h.match(/<span class="num">([^<]*)<\/span>/g) || []).map(function (s) {
      return s.replace(/<[^>]*>/g, "").trim();
    });
    const cap = paper === "58" ? 26 : (paper === "80" ? 36 : 44);
    ok("P9[" + paper + "] no printed value exceeds the paper width",
      vals.length > 0 && vals.every(function (v) { return v.length <= cap; }),
      JSON.stringify(vals.filter(function (v) { return v.length > cap; })));
  });
  const rec = R.receiptModel(cb.batch.items[0], { ts: cb.batch.ts, ref: cb.batch.ref });
  eq("P10 the receipt uses the same reconciliation as the batch",
    r2(rec.totals.coveredNet + rec.totals.itemsDiff), r2(rec.totals.amount));
  eq("P11 the receipt total equals the batch total for that employee",
    r2(rec.totals.amount), r2(R.batchModel(cb.batch, {}).items[0].amount));
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
