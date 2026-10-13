/* payroll-core.js
 * ============================================================================
 * نواة نظام الرواتب المرن — مصدر الحقيقة الوحيد لحسابات الرواتب المرنة.
 *
 * مبدأ التصميم: النظام المرن لا يعتمد على الأسابيع إطلاقًا. الراتب يُحسب من
 * سجلّين فقط داخل كل موظف:
 *   1) سجل الحضور  days[]   : صف لكل يوم *مُسجَّل فعلًا* (حضور/غياب/إجازة).
 *      لا يُنشأ صف تلقائيًا أبدًا ⇒ لا نحترع حضورًا ولا غيابًا.
 *   2) سجل العمليات bonuses/penalties/deductions/advances[] : مكافآت، جزاءات،
 *      خصومات، سلف — كل واحدة منها تُحتسب مرة واحدة فقط.
 *   3) سجل الدفعات payouts[] : كل عملية صرف بمبلغها وتاريخها ومرجعها.
 *
 * المعادلة الوحيدة (Running Balance):
 *      الصافي = (أيام الحضور × الأجر اليومي المسجّل على اليوم)
 *              + مكافآت − جزاءات − خصومات − سلف
 *      المستحق = الصافي − إجمالي ما دُفع فعلًا
 * الرصيد لا يصبح سالبًا إلا إذا دفع المُصرَّف له أكثر مما استحق فعلًا.
 * لأن إجمالي المدفوعات يتراكم داخل الرصيد نفسه، يستحيل احتساب أي مبلغ
 * مرتين: لا يوجد "علامة مدفوع" منفصلة قد تتكرر.
 *
 * تغطية الفترة المصروفة (covered) تُحسب بقاعدة الرصيد التراكمي: كل بند يصبح
 * "مغطّى" عندما يكون الرصيد التراكمي حتى نهايةه ≤ إجمالي المدفوع. هذه القاعدة
 * تمنع تكرار الأجر بعد الصرف الجزئي وتسمح بالمتابعة التراكمية بشكل صحيح.
 *
 * النمط: UMD — يعمل داخل نافذة Electron (window.MalahyPayroll) ويُستدعى من
 * اختبارات Node مباشرةً (require). لا DOM ولا تخزين ولا مؤقتات.
 * ============================================================================ */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MalahyPayroll = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* إصدار مخطط بيانات الموظف الذي يكتبه هذا الملف (بيانات الإنتاج تُرفع بأمان) */
  var SCHEMA = 2;

  /* دورات الصرف المفضلة — للجدولة والتتبّع فقط، ولا تمنع الصرف أبدًا */
  var CYCLE_DAYS = { weekly: 7, biweekly: 15, monthly: 30, manual: 0 };
  var CYCLE_LABEL = { weekly: 'كل 7 أيام', biweekly: 'كل 15 يوم', monthly: 'شهري', manual: 'يدوي' };
  var CYCLE_ORDER = ['weekly', 'biweekly', 'monthly', 'manual'];

  var AR_DAYS_DEFAULT = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var _util = null;
  function setUtil(u) { _util = u || null; }
  function util() {
    var u = _util || {};
    return {
      esc: typeof u.esc === 'function' ? u.esc : function (s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
      fmtNum: typeof u.fmtNum === 'function' ? u.fmtNum : function (n) {
        var r = Math.round((Number(n) || 0) * 100) / 100;
        return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
      },
      dayNames: Array.isArray(u.dayNames) ? u.dayNames : AR_DAYS_DEFAULT
    };
  }

  /* ============================ أدوات رقمية ============================ */
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function sum(a) { var t = 0; for (var i = 0; i < (a || []).length; i++) t += num(a[i] && a[i].amount); return r2(t); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ============================ أدوات التواريخ ============================ */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dayKeyOfTs(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  /* noon من اليوم ⇒ لا تتأثر المقارنة بفرق التوقيت الصيفي */
  function tsOfDayKey(key) {
    var p = String(key || '').split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return NaN;
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0).getTime();
  }
  function addDaysTs(ts, n) { var d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
  function startOfDayTs(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  /* نهاية اليوم المختار: آخر مللي ثانية منه — أي سجل في ذلك اليوم محسوب */
  function endOfDayTs(ts) { var d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); }
  function fmtDMY(ts) {
    var d = new Date(ts);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function fmtDMYKey(key) { var t = tsOfDayKey(key); return isNaN(t) ? String(key || '') : fmtDMY(t); }
  function dayNameOf(ts) { return util().dayNames[new Date(ts).getDay()]; }

  /* ==================== تهيئة سجل الموظف (آمنة/idempotent) ==================== */
  /* تضمن وجود كل الحقول الجديدة دون لمس أي حقل قديم. تُرجع true إن تغيّر شيء. */
  function ensureLedger(e) {
    var changed = false;
    if (!e || typeof e !== 'object') return false;
    if (typeof e.payCycle !== 'string' || CYCLE_DAYS[e.payCycle] === undefined) {
      e.payCycle = 'weekly'; changed = true;
    }
    var a = num(e.cycleAnchorDay, 1);
    if (!(a >= 1 && a <= 31)) { e.cycleAnchorDay = 1; changed = true; }
    ['days', 'payouts', 'bonuses', 'penalties', 'advances', 'deductions', 'reviewFlags'].forEach(function (k) {
      if (!Array.isArray(e[k])) { e[k] = []; changed = true; }
    });
    if (!Array.isArray(e.weeks)) { e.weeks = []; changed = true; }
    return changed;
  }

  /* الأجر اليومي = مصدر الحقيقة الوحيد: سجل الموظف (EMP_JOBS مجرد اقتراح واجهة) */
  function wageOf(e) { return r2(num(e && e.dailyWage)); }

  /* ============================ سجل الحضور ============================ */
  /* صف الحضور ليوم معيّن (بدون إنشاء) */
  function dayRec(e, dayKey) {
    var l = arr(e && e.days);
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].key === dayKey) return l[i];
    return null;
  }
  /* تسجيل/تحديث حضور يوم. هذه هي الطريقة الوحيدة التي ينشئ بها النظام صف حضور
     ⇒ لا يُحترع حضور ولا غياب.
     الأجر يُجمَّد على اليوم لحظة تسجيله فلا تُعاد كتابة أرباح الماضي عند تغيير
     أجر الموظف لاحقًا. ويمكن تمرير meta.wage بأجر تاريخي معروف (مثل أجر الأسبوع
     القديم عند الترحيل) فيُستخدم هو بدل أجر الموظف الحالي — لأن الأجر الحالي
     ليس مرجعًا صحيحًا لتاريخ سابق. */
  function markDay(e, dayKey, status, meta) {
    ensureLedger(e);
    meta = meta || {};
    var t = tsOfDayKey(dayKey);
    if (isNaN(t)) return null;
    var rec = dayRec(e, dayKey);
    var isNew = !rec;
    if (isNew) {
      /* الأجر التاريخي المُمرَّر يتقدّم على الأجر الحالي، ولا يُقبل إلا إذا كان
         رقمًا موجبًا — فلا نُجمِّد صفرًا ولا قيمة ناقصة. */
      var mw = r2(num(meta.wage, 0));
      rec = { key: dayKey, ts: t, status: status, src: meta.src || 'manual', note: '',
              wage: mw > 0 ? mw : wageOf(e) };
      e.days.push(rec);
    } else {
      if (rec.status !== status) { rec.status = status; }
      if (meta.src) rec.src = meta.src;
    }
    if (meta.note !== undefined) rec.note = meta.note;
    if (meta.dregId) rec.dregId = meta.dregId;
    if (rec.wage === undefined || rec.wage === null) rec.wage = wageOf(e);
    e.days.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    return rec;
  }
  /* حذف صف حضور (تراجع يدوي عن تسجيل خاطئ) */
  function clearDay(e, dayKey) {
    ensureLedger(e);
    var before = arr(e.days).length;
    e.days = arr(e.days).filter(function (d) { return !d || d.key !== dayKey; });
    return e.days.length !== before;
  }

  /* ================== خطة إغلاق يوم الحضور ==================
     القاعدة المعتمدة في هذا النشاط: **كل يوم تقويمي يوم عمل** — لا يوم
     راحة أسبوعي ولا أعياد ولا جدول عمل خاص بالموظف. لذلك «يوم العمل
     المؤهَّل» هو كل يومٍ سابق انتهى **بعد تاريخ تعيين** الموظف، ولا شيء
     غير ذلك. ولا تُخترع هنا أي قاعدة راحة أو تقويم أعياد.

     planAttendanceClose **نقيّة تمامًا**: لا تكتب ولا تغيّر شيئًا، بل تُرجع
     ما *سيحدث* لو نُفِّذ. وapplyAttendanceClose يأخذ هذه الخطة نفسها
     فينفّذها، فالمعاينة والنتيجة لا تفترقان بحكم البنية لا بالمصادفة.

     dayKey هو مفتاح يوم العمل نفسه (businessDayKey)، فيُحسب نهار وردية
     الليل ليومه الصحيح بلا ازدواج مع يومه التقويمي. */
  function planAttendanceClose(list, dayKey, opts) {
    opts = opts || {};
    var plan = { ok: false, reason: '', dayKey: String(dayKey || ''), todayKey: '',
                 total: 0, mark: [], recorded: [], notHired: [], noHire: [] };
    var t = tsOfDayKey(dayKey);
    if (isNaN(t)) { plan.reason = 'bad-day'; return plan; }
    var todayKey = String(opts.todayKey || dayKeyOfTs(opts.nowTs != null ? opts.nowTs : Date.now()));
    plan.todayKey = todayKey;
    var todayTs = tsOfDayKey(todayKey);
    if (isNaN(todayTs) || !(t < todayTs)) { plan.reason = 'not-finished'; return plan; }
    plan.ok = true;
    var dayEnd = endOfDayTs(t);
    arr(list).forEach(function (e) {
      if (!e || !e.id) return;
      plan.total++;
      var rec = dayRec(e, dayKey);
      if (rec) {                                   /* حالة قائمة: لا تُطمس أبدًا */
        plan.recorded.push({ id: e.id, name: e.name || '', status: rec.status || 'work' });
        return;
      }
      var hired = num(e.hiredAt, 0);
      if (!hired) { plan.noHire.push({ id: e.id, name: e.name || '' }); return; }   /* لا نخمّن */
      if (hired > dayEnd) { plan.notHired.push({ id: e.id, name: e.name || '' }); return; }
      plan.mark.push({ id: e.id, name: e.name || '' });
    });
    return plan;
  }

  /* تنفيذ خطة مُعدّة مسبقًا — لا يُخطّط من جديد ولا يقرّر شيئًا من نفسه،
     فيضمان تطابق المعاينة مع النتيجة. مع حارس أخير: لو ظهر صف بين
     المعاينة والتنفيذ (تعديل متزامن) فلا يُكتب فوقه. */
  function applyAttendanceClose(list, plan) {
    var res = { ok: false, dayKey: '', marked: [], alreadySkipped: 0 };
    if (!plan || !plan.ok) { res.reason = (plan && plan.reason) || 'no-plan'; return res; }
    res.dayKey = plan.dayKey;
    var byId = {};
    arr(list).forEach(function (e) { if (e && e.id) byId[e.id] = e; });
    arr(plan.mark).forEach(function (m) {
      if (!m) return;
      var e = byId[m.id];
      if (!e) { res.alreadySkipped++; return; }
      if (dayRec(e, plan.dayKey)) { res.alreadySkipped++; return; }
      markDay(e, plan.dayKey, 'absent', { src: 'close', note: 'إغلاق يوم الحضور' });
      res.marked.push(m.id);
    });
    res.ok = true;
    return res;
  }

  /* قائمة أيام الحضور حتى لحظة معيّنة (مرتّبة) */
  function daysUpTo(e, cutoffTs) {
    return arr(e && e.days).filter(function (d) {
      if (!d || !d.key) return false;
      var t = d.ts || tsOfDayKey(d.key);
      return isNaN(t) ? false : (cutoffTs == null || t <= cutoffTs);
    }).sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
  }

  /* ============================ العمليات المالية ============================ */
  /* كل العمليات تُرجَّع بالقيمة المطلقة موجبة؛ الإشارة من نوعها:
     bonus موجب، penalty/advance/deduction سالب. */
  function opsUpTo(e, cutoffTs) {
    var f = function (key) {
      return arr(e && e[key]).filter(function (x) {
        if (!x) return false;
        var t = num(x.ts);
        return cutoffTs == null || t <= cutoffTs;
      }).sort(function (a, b) { return num(a.ts) - num(b.ts); });
    };
    return { bonuses: f('bonuses'), penalties: f('penalties'), advances: f('advances'), deductions: f('deductions') };
  }
  function payoutsUpTo(e, cutoffTs) {
    return arr(e && e.payouts).filter(function (p) {
      if (!p) return false;
      var t = num(p.ts);
      return cutoffTs == null || t <= cutoffTs;
    }).sort(function (a, b) { return num(a.ts) - num(b.ts); });
  }

  /* ================== التصنيف والتعداد اليومي — مصدر الحقيقة الوحيد ==================
     أي رقم يخص الأيام في هذا الملف لا يُحسب إلا من هنا، سواء من لوحة
     الموظف أو من شاشة المراجعة أو من التقرير المطبوع أو من الإيصال. القاعدة
     الوحيدة:
       - صف بحالة 'work'      ⇒ يوم حضور  ⇒ يُحتسب أجره (الأجر المجمَّد عليه).
       - صف بحالة 'absent'    ⇒ يوم غياب  ⇒ لا أجر إطلاقًا.
       - صف بحالة 'vacation'  ⇒ يوم إجازة ⇒ لا أجر إطلاقًا.
       - لا صف أصلًا          ⇒ يوم غير مسجَّل ⇒ لا حضور ولا غياب ولا أجر.
     الغياب والإجازة أحداث غير مالية: لا تغيّر الرصيد، ولذلك لا يمكن أن
     "تُغطَّى" بقاعدة الرصيد التراكمي، بل تُنسب إلى دفعة واحدة عبر نافذة
     الفترة (انظر settleOf). */
  function dayClass(d) {
    if (!d || !d.key) return 'unrecorded';
    var s = d.status;
    if (s === 'work' || s === 'absent' || s === 'vacation') return s;
    return 'unrecorded';
  }
  function tallyDays(rows, wageFallback) {
    var w = num(wageFallback);
    var t = {
      work: 0, absent: 0, vacation: 0, unrecorded: 0, dayCount: 0, gross: 0,
      keys: { work: [], absent: [], vacation: [], unrecorded: [] }
    };
    (rows || []).forEach(function (d) {
      var k = dayClass(d);
      t.dayCount++;
      /* الأجر يأتي من لقطة اليوم المجمَّدة، لا من أجر اليوم الحالي، فتغيير
         أجر الموظف لاحقًا لا يعيد كتابة أرباح أي فترة سابقة. */
      if (k === 'work') { t.work++; t.gross = r2(t.gross + num(d && d.wage, w)); }
      else if (k === 'absent') t.absent++;
      else if (k === 'vacation') t.vacation++;
      else t.unrecorded++;
      if (d && d.key) t.keys[k].push(d.key);
    });
    return t;
  }

  /* ============================ الإحصاء ============================ */
  /* كل أرقام الموظف حتى لحظة معيّنة. هذه هي الشاشة الوحيدة للحساب.
     ملاحظة اتفاق مع الواجهة: نقطة القطع تُمرَّر دائمًا كـ "نهاية اليوم"
     (endOfDayTs) لأن يوم العمل كاملة يُحتسب لو تم تسجيله، والواجهة تفعل
     ذلك في كل الاستدعاءات (لوحة الموظفين، المراجعة، التقرير). */
  function statsUpTo(e, cutoffTs) {
    ensureLedger(e);
    var days = daysUpTo(e, cutoffTs);
    var t = tallyDays(days, wageOf(e));           /* نفس مُصنِّف الأيام */
    var ops = opsUpTo(e, cutoffTs);
    var bonus = sum(ops.bonuses), pen = sum(ops.penalties), adv = sum(ops.advances), ded = sum(ops.deductions);
    var gross = t.gross;
    var net = r2(gross + bonus - pen - adv - ded);
    var paid = sum(payoutsUpTo(e, cutoffTs));
    var outstanding = r2(net - paid);
    return {
      days: days, work: t.work, abs: t.absent, vac: t.vacation, unrecorded: t.unrecorded,
      dayCount: days.length,
      gross: gross, bonus: bonus, pen: pen, adv: adv, ded: ded,
      net: net, paid: paid, outstanding: outstanding,
      due: outstanding > 0 ? outstanding : 0,
      credit: outstanding < 0 ? r2(-outstanding) : 0,
      ops: ops, payouts: payoutsUpTo(e, cutoffTs)
    };
  }
  /* اختصار: كل السجل بلا cutoff */
  function stats(e) { return statsUpTo(e, null); }

  /* ================== تغطية الفترة بالمدفوعات (Prevent double pay) ================== */
  /* أحداث الموظف مرتّبة زمنيًا؛ الرصيد التراكمي بعد كل بند. البند "مغطّى"
     عندما لا يتجاوز الرصيد التراكمي حتى نهايته إجمالي المدفوع. */
  function ledgerRun(e, cutoffTs) {
    var s = statsUpTo(e, cutoffTs);
    var w = wageOf(e);
    var ev = [];
    s.days.forEach(function (d) {
      if (d.status !== 'work') return;
      ev.push({ kind: 'day', id: d.key, ts: num(d.ts) || tsOfDayKey(d.key), amount: r2(num(d.wage, w)), ref: d });
    });
    ['bonuses', 'penalties', 'advances', 'deductions'].forEach(function (k) {
      s.ops[k].forEach(function (x) {
        var sign = (k === 'bonuses') ? 1 : -1;
        ev.push({ kind: k, id: x.id, ts: num(x.ts), amount: r2(sign * num(x.amount)), ref: x });
      });
    });
    var ord = { day: 0, deductions: 1, penalties: 2, advances: 3, bonuses: 4 };
    ev.sort(function (a, b) { return (a.ts - b.ts) || ((ord[a.kind] || 0) - (ord[b.kind] || 0)); });
    var bal = 0;
    ev.forEach(function (x) { bal = r2(bal + x.amount); x.balAfter = bal; });
    return { s: s, events: ev };
  }

/* العمليات التي تُغطّيها دفعة جديدة بقيمة alreadyPaid.
     القاعدة: المسار التراكمي — البند مُغطّى إذا كان الرصيد التراكمي حتى
     نهايته ≤ إجمالي المدفوع (المدفوع سابقًا + مبلغ هذه الدفعة). الضمانتان:
       1) كل بند يُذكر في تقرير دفعة هو بند *مُسدَّد بالكامل* فعلًا.
       2) لا يُذكر أي بند مرتين (البند المختوم settledBy يُستبعد من العرض).
     لأن المدفوعات تتراكم داخل الرصيد نفسه، لا يمكن دفع أي مبلغ مرتين.

     ملاحظة معروضة بصراحة (وليست خللًا ماليًا): إذا سُجِّلت سلفة/خصم بتاريخ
     *بعد* آخر بند موجب (مكافأة مثلًا)، فإن الرصيد التراكمي يبلغ ذروته قبل أن
     ينخفض بسبب تلك العملية، فيخرج ذروة البند من التسمية. النتيجة: المبلغ
     المصروف صحيح (الرصيد كله)، لكن بنود الإيصال لا تغطيه كاملة. لذلك نحسب
     الفرق صراحةً كـ unattributed ونطبعه في سطر مستقل، فيبقى المستند مطابقًا
     لنفسه:  صافي البنود المُسمّاة + بنود غير مُفصَّلة = المصروف.

     الغياب والإجازة ليست أحداثًا مالية، فلا تدخل هذه القاعدة؛ تُنسب إلى
     الدفعة عبر نافذة الفترة [آخر دفعة .. تاريخ الصرف] مرة واحدة فقط، وتُختم
     بـ settledBy عند التنفيذ فلا تُعدّ في أي دفعة لاحقة. */
  function settleOf(e, cutoffTs, alreadyPaid, periodToTs) {
    var run = ledgerRun(e, cutoffTs);
    var w0 = wageOf(e);
    var res = {
      fromTs: null, toTs: null, fromKey: null, toKey: null,
      dayKeys: [], absKeys: [], vacKeys: [],
      work: 0, abs: 0, vac: 0, unrecorded: 0, days: 0, gross: 0,
      bonuses: [], penalties: [], advances: [], deductions: []
    };
    var paid = r2(num(alreadyPaid, 0));
    var coveredRows = [];
    run.events.forEach(function (x) {
      if (Math.max(0, x.balAfter) > paid + 1e-9) return;       /* لم يُغطَّ بعد */
      if (res.fromTs == null) res.fromTs = x.ts;
      if (x.kind === 'day') {
        /* يوم عمل سبق أن نُسب إلى دفعة ⇒ لا يُعاد عرضه في تقرير دفعة أخرى
           (اليوم يُذكر مرة واحدة فقط). الحساب المالي نفسه لا يتأثر لأن
           ledgerRun يبني أحداثه من كل الأيام دون هذا الاستثناء. */
        if (x.ref && x.ref.settledBy) return;
        coveredRows.push(x.ref);            /* صف اليوم نفسه */
      }
      else if (res[x.kind]) {
        res[x.kind].push({
          id: x.id, amount: r2(Math.abs(x.amount)), ts: x.ts,
          reason: (x.ref && x.ref.reason) || '', note: (x.ref && x.ref.note) || ''
        });
      }
    });
    /* أيام العمل المُغطّاة: نفس مُصنِّف الأيام ⇒ الأجر من اللقطة المجمَّدة */
    var cw = tallyDays(coveredRows, w0);
    res.dayKeys = cw.keys.work.sort();       /* ترتيب زمني ثابت للعرض والطباعة */
    res.work = cw.work;
    res.gross = cw.gross;

    /* نافذة الفترة: من آخر دفعة سابقة (أو من بداية السجل لأول دفعة) حتى تاريخ الصرف.
       الحدّ الأدنى لا يعتمد على أول يوم عمل مُغطّى، وإلا ضاع غيابٌ وقع قبله.
       و«مرة واحدة فقط» مضمونة بختم settledBy لا بالحدّ الأدنى. */
    var winTo = (periodToTs != null) ? num(periodToTs) : cutoffTs;
    var lastPayoutTs = 0;
    arr(e && e.payouts).forEach(function (p) {
      var pt = num(p && p.ts);
      if (pt > lastPayoutTs) lastPayoutTs = pt;
    });
    var all = daysUpTo(e, cutoffTs);
    var markers = [];
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      var k = dayClass(d);
      if (k !== 'absent' && k !== 'vacation') continue;   /* حضور أو غير مسجَّل */
      if (d.settledBy) continue;                           /* حُسبت في دفعة سابقة */
      var t = num(d.ts) || tsOfDayKey(d.key);
      if (isNaN(t) || t > cutoffTs) continue;
      if (t <= lastPayoutTs) continue;                      /* قبل آخر دفعة */
      if (t > winTo) continue;
      markers.push(d);
      if (res.fromTs == null || t < res.fromTs) res.fromTs = t;
    }
    var mk = tallyDays(markers, w0);
    res.abs = mk.absent; res.vac = mk.vacation; res.unrecorded = mk.unrecorded;
    res.absKeys = mk.keys.absent;
    res.vacKeys = mk.keys.vacation;
    res.days = res.dayKeys.length + res.absKeys.length + res.vacKeys.length;
    res.toTs = winTo;
    res.fromKey = res.fromTs != null ? dayKeyOfTs(res.fromTs) : null;
    res.toKey = res.toTs != null ? dayKeyOfTs(res.toTs) : null;
    return res;
  }

  /* ============================ دورة الصرف المفضلة ============================ */
  function cycleOf(e) {
    var c = (e && typeof e.payCycle === 'string' && CYCLE_DAYS[e.payCycle] !== undefined) ? e.payCycle : 'weekly';
    return { id: c, days: CYCLE_DAYS[c], label: CYCLE_LABEL[c] };
  }
  /* موعد الاستحقاق التالي — إرشادي فقط ولا يمنع الصرف أبدًا.
     manual ⇒ لا موعد. مبني على آخر عملية صرف فعلية (أو تاريخ التعيين). */
  function cycleInfo(e, nowTs) {
    var c = cycleOf(e);
    var ps = arr(e && e.payouts);
    var last = null;
    ps.forEach(function (p) { var t = num(p && p.ts); if (t && (!last || t > num(last.ts))) last = p; });
    var anchor = last ? num(last.ts) : num(e && e.hiredAt, 0);
    var dueTs = null;
    if (c.days > 0 && anchor) {
      dueTs = anchor + c.days * 86400000;
      if (c.id === 'monthly') {
        var d = new Date(anchor); var day = Math.min(Math.max(1, num(e.cycleAnchorDay, 1)), 28);
        d.setDate(day); d.setHours(12, 0, 0, 0);
        var cur = new Date(anchor); cur.setDate(day); cur.setHours(12, 0, 0, 0);
        dueTs = cur.getTime();
        while (dueTs <= anchor) { var nd = new Date(dueTs); nd.setMonth(nd.getMonth() + 1); dueTs = nd.getTime(); }
        d = null;
      }
    }
    var over = 0;
    if (dueTs && num(nowTs) > dueTs) over = Math.floor((num(nowTs) - dueTs) / 86400000);
    return {
      id: c.id, days: c.days, label: c.label,
      anchorTs: anchor || null,
      dueTs: dueTs, overdueDays: over > 0 ? over : 0,
      due: !!(dueTs && num(nowTs) >= dueTs)
    };
  }

  /* ============================ خطة الصرف ============================ */
  /* تبني وصفًا كاملًا للصرف *قبل* تنفيذه — تُستخدم لشاشة المراجعة والتقرير
     والإيصال، فالمصدر واحد ولا تختلف الأرقام بين الشاشات. */
  function planPayout(e, opts) {
    opts = opts || {};
    ensureLedger(e);
    var nowTs = num(opts.nowTs, Date.now());
    var dateTs = opts.dateTs != null ? num(opts.dateTs, nowTs) : nowTs;
    var cutoff = endOfDayTs(dateTs);
    var s = statsUpTo(e, cutoff);
    var paidBefore = s.paid;                       /* كل ما دُفع فعلًا حتى الآن */
    var outstandingBefore = s.outstanding;
    var due = outstandingBefore > 0 ? outstandingBefore : 0;
    var amount = (opts.amount != null && opts.amount !== '') ? r2(num(opts.amount)) : due;
    if (amount < 0) amount = 0;
    if (amount > due) amount = due;
    amount = r2(amount);
    /* الفترة المغطّاة = ما ستغطّيه هذه الدفعة تحديدًا: نمرّر المدفوع السابق
       + مبلغ هذه الدفعة، فتشمل التغطية الأيام التي تُسدَّد الآن بالضبط،
       ولا تتضمّن أبدًا الأيام التي دُفعت في دفعة سابقة. */
    var covered = settleOf(e, cutoff, r2(paidBefore + amount), dateTs);
    /* فترة الصرف: من أول يوم مُغطّى (أو أقدم غياب/إجازة غير محسوبة) حتى تاريخ
       الصرف — وهي نفس الفترة التي يطبعها التقرير حرفيًا.
       إن لم يُغطَّ أي يوم بعد فالفترة من آخر صرف فعلي حتى تاريخ الصرف. */
    var fromTs = covered.fromTs;
    var toTs = dateTs;
    if (fromTs == null) {
      var lastP = s.payouts.length ? num(s.payouts[s.payouts.length - 1].ts) : 0;
      fromTs = lastP || (covered.dayKeys.length ? tsOfDayKey(covered.dayKeys[0]) : toTs);
    }
    var grossV = covered.gross;
    var bonusV = sum(covered.bonuses), penV = sum(covered.penalties);
    var advV = sum(covered.advances), dedV = sum(covered.deductions);
    /* صافي البنود المذكورة في هذه الدفعة تحديدًا. */
    var coveredNet = r2(grossV + bonusV - penV - advV - dedV);
    /* فرق البنود — مُوقَّع عمدًا، ويجعل المعادلة التالية صحيحة دائمًا:
               صافي بنود هذه الدفعة + فرق البنود = المبلغ المصروف
           وهو ليس خطأً في الحساب، بل أثر ترتيب زمني لقاعدة التغطية:
             · موجب  ⇒ جزء من المبلغ يُسدِّد بندًا لم يمكن إدراجه ضمن بنود
                         الدفعة، لأن رصيده التراكمي بلغ ذروته قبل خصم لاحق.
             · سالب  ⇒ البنود المُسمّاة تشمل جزءًا سدَّدته دفعة سابقة؛ سطر
                         «مسدَّد سابقًا» يوضّح مقداره، والباقي هو المصروف الآن.
           المال صحيح في الحالتين؛ وهذا السطر هو ما يجعل المستند مطابقًا لنفسه. */
    var itemsDiff = r2(amount - coveredNet);
    return {
      empId: e.id, name: e.name, job: e.job || '',
      dailyWage: wageOf(e), payCycle: cycleOf(e).id,
      dateTs: dateTs, cutoffTs: cutoff,
      period: { fromTs: fromTs, toTs: toTs, fromKey: dayKeyOfTs(fromTs), toKey: dayKeyOfTs(toTs) },
      covered: covered,
      work: covered.work, abs: covered.abs, vac: covered.vac,
      gross: grossV,
      bonus: bonusV, pen: penV, adv: advV, ded: dedV,
      coveredNet: coveredNet,
      itemsDiff: itemsDiff,
      paidBefore: paidBefore,
      outstandingBefore: outstandingBefore,
      due: due,
      amount: amount,
      balanceAfter: r2(outstandingBefore - amount),
      ok: amount > 0,
      reason: amount > 0 ? '' : (due <= 0 ? 'no-due' : 'zero-amount')
    };
  }

  /* تنفيذ الصرف فعليًا على سجل الموظف. ينشئ سجل دفع مستقل (لا علامة "مدفوع").
     id ثابت يُولَّد قبل الحفظ ⇒ إعادة المحاولة لا تُنتج عملية مكررة. */
  function applyPayout(e, plan, meta) {
    ensureLedger(e);
    meta = meta || {};
    if (!plan || !plan.ok) return { ok: false, reason: (plan && plan.reason) || 'invalid' };
    var payoutId = meta.payoutId || ('p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    /* حماية إضافية من التكرار على مستوى نفس السجل */
    for (var i = 0; i < e.payouts.length; i++) if (e.payouts[i] && e.payouts[i].id === payoutId) return { ok: false, reason: 'duplicate', payoutId: payoutId };
    var rec = {
      id: payoutId,
      ts: num(meta.ts, Date.now()),
      dateKey: dayKeyOfTs(plan.dateTs),
      amount: r2(plan.amount),
      batchId: meta.batchId || null,
      ref: meta.ref || null,
      covered: {
        fromKey: plan.period.fromKey, toKey: plan.period.toKey,
        days: plan.covered.dayKeys.slice(),
        absKeys: plan.covered.absKeys.slice(),
        vacKeys: plan.covered.vacKeys.slice(),
        work: plan.work, abs: plan.abs, vac: plan.vac,
        gross: plan.gross, bonus: plan.bonus, pen: plan.pen, adv: plan.adv, ded: plan.ded,
        coveredNet: plan.coveredNet, itemsDiff: plan.itemsDiff
      },
      applied: {
        bonuses: plan.covered.bonuses.map(function (x) { return x.id; }),
        penalties: plan.covered.penalties.map(function (x) { return x.id; }),
        advances: plan.covered.advances.map(function (x) { return x.id; }),
        deductions: plan.covered.deductions.map(function (x) { return x.id; })
      },
      paidBefore: plan.paidBefore,
      balanceAfter: plan.balanceAfter,
      note: meta.note || '',
      kind: plan.amount >= plan.due - 1e-9 && plan.due > 0 ? 'full' : 'partial'
    };
    e.payouts.push(rec);
    /* ختم العمليات المُغطَّاة بهذه الدفعة (تدقيق: لا تُخصم مرتين) */
    ['bonuses', 'penalties', 'advances', 'deductions'].forEach(function (k) {
      var ids = {}; rec.applied[k].forEach(function (id) { ids[id] = 1; });
      arr(e[k]).forEach(function (x) { if (x && ids[x.id]) x.settledBy = payoutId; });
    });
    /* ختم أيام الحضور والغياب والإجازة المنسوبة لهذه الدفعة ⇒ كل يوم يُذكر مرة
       واحدة فقط في كل التقارير والإيصالات، ولا يُعاد عرضه في دفعة لاحقة. */
    var dayIds = {};
    rec.covered.days.concat(rec.covered.absKeys, rec.covered.vacKeys)
      .forEach(function (k) { dayIds[k] = 1; });
    arr(e.days).forEach(function (d) {
      if (d && d.key && dayIds[d.key] && !d.settledBy) d.settledBy = payoutId;
    });
    e.payouts.sort(function (a, b) { return num(a.ts) - num(b.ts); });
    return { ok: true, payoutId: payoutId, record: rec };
  }

  /* ============================ دفعة مجمّعة (Batch) ============================ */
  /* تبني مستند الدفعة من قائمة خطط — لا تكتب شيئًا، فقط تُنسّق. */
  function buildBatch(plans, opts) {
    opts = opts || {};
    var items = [], t = { gross: 0, bonus: 0, pen: 0, adv: 0, ded: 0, paidBefore: 0, amount: 0, count: 0 };
    plans.forEach(function (p) {
      items.push({
        empId: p.empId, empName: p.name, job: p.job, dailyWage: p.dailyWage, payCycle: p.payCycle,
        work: p.work, abs: p.abs, vac: p.vac, gross: p.gross,
        bonus: p.bonus, pen: p.pen, adv: p.adv, ded: p.ded,
        coveredNet: r2(p.gross + p.bonus - p.pen - p.adv - p.ded),
        itemsDiff: r2(p.amount - (p.gross + p.bonus - p.pen - p.adv - p.ded)),
        period: p.period, covered: p.covered,
        paidBefore: p.paidBefore, due: p.due, amount: p.amount, balanceAfter: p.balanceAfter,
        status: p.ok ? 'pending' : 'skipped', reason: p.reason || '', error: ''
      });
      t.gross = r2(t.gross + p.gross); t.bonus = r2(t.bonus + p.bonus); t.pen = r2(t.pen + p.pen);
      t.adv = r2(t.adv + p.adv); t.ded = r2(t.ded + p.ded);
      t.paidBefore = r2(t.paidBefore + p.paidBefore); t.amount = r2(t.amount + p.amount);
      if (p.ok) t.count++;
    });
    var ts = num(opts.ts, Date.now());
    return {
      id: opts.id || ('B' + ts.toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()),
      ref: opts.ref || ('PAY-' + dayKeyOfTs(ts).replace(/-/g, '')),
      ts: ts, dateKey: dayKeyOfTs(num(opts.dateTs, ts)),
      note: opts.note || '',
      items: items, totals: t
    };
  }

  /* ============================ تنفيذ دفعة مجمّعة ============================ */
  /* تنفيذ حقيقي لكل موظف على حدة: نطبّق الصرف، ثم نحفظ، فإن فشل الحفظ نتراجع
     تمامًا عن ذلك الموظف وحده ولا يُعلَّم كمدفوع. الإجماليات تُحسب من الذين
     نجحت عملياتهم فقط، فلا يُعرض ولا يُطبع مبلغ لم يُحفظ فعلًا. */
  function restoreEmployee(e, backup) {
    Object.keys(e).forEach(function (k) { delete e[k]; });
    Object.keys(backup).forEach(function (k) { e[k] = backup[k]; });
  }
  function retotal(items) {
    var t = { gross: 0, bonus: 0, pen: 0, adv: 0, ded: 0, paidBefore: 0, amount: 0, balanceAfter: 0, count: 0 };
    items.forEach(function (it) {
      if (it.status !== 'saved') return;
      t.gross = r2(t.gross + num(it.gross)); t.bonus = r2(t.bonus + num(it.bonus));
      t.pen = r2(t.pen + num(it.pen)); t.adv = r2(t.adv + num(it.adv)); t.ded = r2(t.ded + num(it.ded));
      t.paidBefore = r2(t.paidBefore + num(it.paidBefore));
      t.amount = r2(t.amount + num(it.amount)); t.balanceAfter = r2(t.balanceAfter + num(it.balanceAfter));
      t.count++;
    });
    return t;
  }
  /* store: قائمة الموظفين الحيّة · plans: خطط الصرف المراجَعة
     saveEmployee(e): دالة الحفظ تُرجع true/false — تُستدعى بعد كل موظف */
  function commitBatch(store, plans, opts, saveEmployee) {
    opts = opts || {};
    var ts = num(opts.ts, Date.now());
    var batch = buildBatch(plans, {
      ts: ts, dateTs: num(opts.dateTs, ts), ref: opts.ref, id: opts.id, note: opts.note
    });
    var planById = {};
    (plans || []).forEach(function (p) { if (p && p.empId) planById[p.empId] = p; });
    var results = [];
    batch.items.forEach(function (item) {
      if (item.status === 'skipped') {           /* لا يوجد مستحق — ليس فشلًا */
        results.push({ empId: item.empId, ok: false, skipped: true, reason: item.reason });
        return;
      }
      var plan = planById[item.empId];
      var e = null;
      for (var i = 0; i < (store || []).length; i++) if (store[i] && store[i].id === item.empId) { e = store[i]; break; }
      if (!e || !plan) {
        item.status = 'failed'; item.error = 'employee-missing'; item.amount = 0;
        results.push({ empId: item.empId, ok: false, reason: 'employee-missing' });
        return;
      }
      var intended = item.amount;
      var backup = JSON.parse(JSON.stringify(e));
      var res = applyPayout(e, plan, { ts: ts, batchId: batch.id, ref: batch.ref, note: opts.note });
      if (!res.ok) {                                 /* صرف مكرر/مرفوض ⇒ تراجع كامل */
        restoreEmployee(e, backup);
        item.status = 'failed'; item.error = res.reason || 'payout-failed'; item.amount = 0; item.intendedAmount = intended;
        results.push({ empId: item.empId, ok: false, reason: res.reason || 'payout-failed' });
        return;
      }
      var saved = false;
      try { saved = saveEmployee ? !!saveEmployee(e) : true; } catch (_) { saved = false; }
      if (!saved) {
        restoreEmployee(e, backup);
        item.status = 'failed'; item.error = 'save-failed'; item.amount = 0; item.intendedAmount = intended;
        results.push({ empId: item.empId, ok: false, reason: 'save-failed' });
        return;
      }
      item.payoutId = res.payoutId;
      item.status = 'saved'; item.error = '';
      results.push({ empId: item.empId, ok: true, payoutId: res.payoutId, amount: item.amount });
    });
    batch.totals = retotal(batch.items);
    batch.okCount = batch.totals.count;
    batch.failCount = batch.items.filter(function (i) { return i.status === 'failed'; }).length;
    return { ok: batch.totals.count > 0, batch: batch, results: results, saved: batch.totals.count, failed: batch.failCount };
  }

  /* رقم مرجع متسلسل لكل يوم (عدّاد مخزَّن ⇒ لا تتكرر الأرقام بعد إعادة التشغيل) */
  function nextRef(store, ts) {
    var key = dayKeyOfTs(ts).replace(/-/g, '');
    store = store || {};
    var cur = store['_seq_' + key];
    var n = (cur === undefined || cur === null) ? 0 : Number(cur);
    if (!isFinite(n) || n < 0) n = 0;
    n = Math.floor(n) + 1;
    store['_seq_' + key] = n;
    return 'PAY-' + key + '-' + (n < 10 ? ('0' + n) : ('' + n));
  }

  /* ============================ الترحيل من النظام الأسبوعي ============================ */
  /* يقرأ أسابيع الرواتب القديمة (سبت←جمعة) ويحوّلها للنموذج المرن *دون حذف
     أي سجل*. الأسابيع المصروفة تُوسم كتسويجية (مدفوعة أصلًا ⇒ لا تدخل الحساب
     الجديد). الأسابيع غير المصروفة: تُستورد أيامها المنتهية فقط (حتى اليوم)
     إلى سجل الحضور المرن، حتى لا نحترع حضورًا لأيام لم تحن بعد. */
  function legacyWeekStart(w) {
    var k = w && w.key ? String(w.key).split('-').map(Number) : null;
    if (k && k.length === 3 && k[0] && k[1] && k[2]) return new Date(k[0], k[1] - 1, k[2], 12, 0, 0, 0).getTime();
    if (w && num(w.startTs)) return num(w.startTs);
    return NaN;
  }
  function legacyNet(w) {
    if (w && w.snapshot && w.snapshot.net != null) return r2(num(w.snapshot.net));
    var work = 0;
    arr(w && w.days).forEach(function (d) { if (d && (d.status || 'work') === 'work') work++; });
    var g = r2(work * num(w && w.dailyWage));
    return r2(g + sum(w && w.bonuses) - sum(w && w.penalties) - sum(w && w.advances) - sum(w && w.deductions));
  }
  /* سجل تدقيق الترحيل: ما استُورد بالضبط ومن أي أسابيع.
     يُحفظ على الموظف فيبقى معروضًا بعد ختم المخطط (legacySchema)، لأن
     التشغيل الثاني لا يُعيد العدّ. لا يُعاد احتساب أي رصيد ولا يوم مدفوع. */
  function legacyAuditOf(e) {
    var a = e && e.legacyImport;
    if (!a || typeof a !== 'object') return null;
    return {
      at: num(a.at),
      days: num(a.days), work: num(a.work), abs: num(a.abs), vac: num(a.vac),
      ops: num(a.ops),
      weeksPaid: num(a.weeksPaid),
      weeksUnpaid: num(a.weeksUnpaid),
      weeksUnreadable: num(a.weeksUnreadable),
      weeksNoWage: num(a.weeksNoWage)
    };
  }
  /* إجماليات تدقيق الترحيل لكل الموظفين — للعرض والتقرير فقط،
     لا تُعدّل أي رصيد ولا تعيد حساب أي يوم. */
  function migrationAudit(list) {
    var out = { at: 0, employees: 0, migrated: 0, days: 0, work: 0, abs: 0, vac: 0, ops: 0,
      weeksPaid: 0, weeksUnpaid: 0, weeksUnreadable: 0, flags: 0, rows: [] };
    arr(list).forEach(function (e) {
      if (!e) return;
      out.employees++;
      var a = legacyAuditOf(e);
      var fl = arr(e.reviewFlags).length;
      out.flags += fl;
      if (!a) return;
      if (a.at > out.at) out.at = a.at;
      if (a.days || a.ops || a.weeksUnpaid) out.migrated++;
      out.days += a.days; out.work += a.work; out.abs += a.abs; out.vac += a.vac;
      out.ops += a.ops;
      out.weeksPaid += a.weeksPaid; out.weeksUnpaid += a.weeksUnpaid;
      out.weeksUnreadable += a.weeksUnreadable;
      out.rows.push({ empId: e.id, name: e.name || '', job: e.job || '',
        days: a.days, work: a.work, abs: a.abs, vac: a.vac, ops: a.ops,
        weeksPaid: a.weeksPaid,
        weeksUnpaid: a.weeksUnpaid, weeksUnreadable: a.weeksUnreadable, flags: fl, at: a.at });
    });
    out.rows.sort(function (x, y) { return (x.name || '') < (y.name || '') ? -1 : ((x.name || '') > (y.name || '') ? 1 : 0); });
    return out;
  }
  function migrateEmployee(e, opts) {
    opts = opts || {};
    var changed = ensureLedger(e);
    var nowTs = num(opts.nowTs, Date.now());
    var cutoff = endOfDayTs(nowTs);
    if (num(e.legacySchema) >= SCHEMA) {
      return { changed: changed, migrated: false, imported: 0, importedDays: 0, importedOps: 0,
        audit: legacyAuditOf(e), flags: arr(e.reviewFlags) };
    }
    var imported = 0, importedDays = 0, importedOps = 0;
    var daysWork = 0, daysAbsent = 0, daysVac = 0;
    var weeksPaid = 0, weeksUnpaid = 0, weeksUnreadable = 0, weeksNoWage = 0;
    arr(e.weeks).forEach(function (w) {
      if (!w || typeof w !== 'object') return;
      if (w.legacyHandled) return;
      /* الختم (legacyHandled) يأتي بعد اكتمال المعالجة لا قبلها:
         لو انقطع التنفيذ في منتصف هذا الأسبوع فلا يُختم، فتُعاد معالجته في
         التشغيل التالي. وحارس dayKey يمنع تكرار أي يوم استُورد فعلًا. */
      var start = legacyWeekStart(w);
      if (isNaN(start)) {
        weeksUnreadable++;
        e.reviewFlags.push({ ts: nowTs, kind: 'week-unreadable', ref: w.key || '?', why: 'تعذّر تحديد بداية الأسبوع — لم تتغيّر أي قيمة مالية' });
        w.legacyHandled = true; changed = true;   /* قرار نهائي: غير قابل للقراءة */
        return;
      }
      /* الأسبوع المصروف: محفوظ كما هو ولا يدخل الرصيد الجديد (مُسدَّد أصلًا).
         ملاحظة أساسية: لا يُستورد أي يوم منه — فلا يُعاد احتساب يوم مدفوع. */
      if (w.paid) {
        weeksPaid++;
        if (!w.snapshot) {
          e.reviewFlags.push({ ts: nowTs, kind: 'paid-week-no-snapshot', ref: w.key, why: 'أسبوع مصروف بدون لقطة محفوظة — يحتاج مراجعة يدوية' });
        }
        if (!w.paidAt) {
          e.reviewFlags.push({ ts: nowTs, kind: 'paid-week-no-date', ref: w.key, why: 'أسبوع مصروف بدون تاريخ صرف — لا تتغيّر أي قيمة مالية' });
        }
        w.legacySettled = true;
        /* إضافة فقط: لا نكتب فوق أي قيمة legacyNet موجودة مسبقًا */
        if (w.legacyNet === undefined || w.legacyNet === null) w.legacyNet = legacyNet(w);
        w.legacyHandled = true; changed = true;
        return;
      }
      weeksUnpaid++;
      /* الأجر المرجعي هو أجر هذا الأسبوع نفسه لا أجر الموظف الحالي: تغيير
         الأجر لاحقًا يجب ألّا يجعل الأسابيع القديمة تستحق أكثر (ولا أقل). */
      var weekWage = r2(num(w.dailyWage, 0));
      if (!(weekWage > 0)) {
        /* لا أجر محفوظ ⇒ لا نخمّن. نُعلّم الأسبوع للمراجعة ولا نستورد منه شيئًا. */
        weeksNoWage++;
        e.reviewFlags.push({ ts: nowTs, kind: 'week-no-wage', ref: w.key || '?',
          why: 'لا يوجد أجر محفوظ لهذا الأسبوع — لم يُستورد أي يوم ولم تُخترع أي أرباح' });
        w.legacyHandled = true; changed = true;
        return;
      }
      /* الأسبوع غير المصروف: استيراد الأيام *المنتهية* فقط + العمليات */
      arr(w.days).forEach(function (d, i) {
        var dayTs = addDaysTs(start, i);
        if (dayTs > cutoff) return;                       /* يوم مستقبلي: لا نحترعه */
        var key = dayKeyOfTs(dayTs);
        if (dayRec(e, key)) return;                       /* لا تكرار */
        markDay(e, key, (d && d.status) || 'work', { src: 'legacy', note: (d && d.note) || '', wage: weekWage });
        if (d) d.legacyKey = key;
        imported++; importedDays++;
        var dst = (d && d.status) || 'work';
        if (dst === 'work') daysWork++;
        else if (dst === 'vacation') daysVac++;
        else daysAbsent++;
      });
      ['bonuses', 'penalties', 'advances', 'deductions'].forEach(function (k) {
        arr(w[k]).forEach(function (x) {
          if (!x) return;
          var dup = false;
          for (var q = 0; q < e[k].length; q++) { if (e[k][q] && e[k][q].legacyId === x.id) { dup = true; break; } }
          if (dup) return;
          var opTs = num(x.ts, addDaysTs(start, num(x.day, 0)));
          var cp = {
            id: 'lg_' + x.id, legacyId: x.id, ts: opTs,
            amount: r2(num(x.amount)), reason: x.reason || '', note: x.note || '',
            dayKey: dayKeyOfTs(opTs)
          };
          if (x.expenseId) cp.expenseId = x.expenseId;
          if (x.dregId) cp.dregId = x.dregId;
          if (x.settledBy) cp.settledBy = x.settledBy;
          e[k].push(cp);
          imported++; importedOps++;
        });
      });
      w.legacyMigrated = true;
      w.legacyHandled = true; changed = true;   /* الختم بعد اكتمال الاستيراد */
    });
    /* سجل تدقيق ثابت: يبقى معروضًا بعد ختم المخطط ولا يُعاد احتسابه */
    e.legacyImport = { at: nowTs, days: importedDays, work: daysWork,
      abs: daysAbsent, vac: daysVac, ops: importedOps,
      weeksPaid: weeksPaid, weeksUnpaid: weeksUnpaid, weeksUnreadable: weeksUnreadable,
      weeksNoWage: weeksNoWage };
    /* ختم المخطط = إعلان «انتهى الترحيل». لا يُكتب إلا إذا عولج كل أسبوع فعلًا.
       لو بقي أسبوع غير مُعالَج (انقطاع سابق، أو ختم كُتب يدويًا قبل الاستيراد)
       فلا ختم —ف فيُعاد معالجته في التشغيل التالي بدل تخطّيه إلى الأبد.
      أماDays المستوردة فعلًا فحارس dayKey يمنع تكرارها. */
    var allHandled = arr(e.weeks).every(function (w) {
      return !w || typeof w !== 'object' || w.legacyHandled;
    });
    if (allHandled) {
      e.legacySchema = SCHEMA;
      e.legacyMigratedAt = nowTs;
    }
    return { changed: changed || allHandled, migrated: true, imported: imported,
      importedDays: importedDays, importedOps: importedOps, pending: !allHandled,
      audit: legacyAuditOf(e), flags: arr(e.reviewFlags) };
  }

/* ============ تراجع محدود عن الترحيل (محمي) ============
     كل ما أنشأه الترحيل مُوسوم: الأيام بـ src==='legacy'، العمليات بـ legacyId،
     والأسابيع بعلاماتها. فيُحذف هذا النطاق وحده ولا يمسّ شيئًا آخر.
     حارس قاطع: إن تحرّكت أموال بعد الترحيل (دفعة أو عملية مُسدَّدة) فالتراجع
     يُرفَض ويُترك كل شيء كما هو — لأن فكّ الترحيل سيُفسد الرصيد الجاري
     outstanding = net − paid ويربط دفعاتِ حِقةً بأيام محذوفة. */
  function rollbackMigration(e, opts) {
    opts = opts || {};
    if (!e || typeof e !== 'object') return { ok: false, refused: true, reason: 'لا يوجد سجل موظف', changed: false };
    var migratedAt = num(e.legacyMigratedAt, 0);
    if (!(migratedAt > 0)) {
      return { ok: false, refused: true, reason: 'لم يُرحَّل هذا الموظف بعد — لا يوجد ما يُتراجَع عنه', changed: false };
    }
    /* حارس 1: أي دفعة بعد الترحيل */
    var late = arr(e.payouts).filter(function (p) { return p && num(p.ts, 0) >= migratedAt; });
    if (late.length) {
      return { ok: false, refused: true, changed: false, latePayouts: late.length,
        reason: 'توجد ' + late.length + ' دفعة بعد الترحيل — التراجع سيربك تاريخ الصرف' };
    }
    /* حارس 2: أي عملية مالية مُسدَّدة (مرتبطة بدفعة) */
    var settledOps = 0;
    ['bonuses', 'penalties', 'advances', 'deductions'].forEach(function (k) {
      arr(e[k]).forEach(function (x) { if (x && x.settledBy) settledOps++; });
    });
    if (settledOps) {
      return { ok: false, refused: true, changed: false, settledOps: settledOps,
        reason: 'توجد عمليات مالية مُسدَّدة بعد الترحيل — التراجع سيُفسد توزيع المصروف' };
    }

    /* الحذف: النطاق المُوسوم فقط */
    var before = arr(e.days).length;
    e.days = arr(e.days).filter(function (d) { return !d || d.src !== 'legacy'; });
    var removedDays = before - e.days.length;
    var removedOps = 0;
    ['bonuses', 'penalties', 'advances', 'deductions'].forEach(function (k) {
      var n = e[k] ? e[k].length : 0;
      e[k] = arr(e[k]).filter(function (x) { return !x || (x.legacyId === undefined && String(x.id || '').indexOf('lg_') !== 0); });
      removedOps += n - e[k].length;
    });
    /* فكّ العلامات — أسبوع واحد يبقى Weeks كما هو (مصدر الحقيقة) بلا أي تعديل */
    arr(e.weeks).forEach(function (w) {
      if (!w || typeof w !== 'object') return;
      delete w.legacyHandled; delete w.legacySettled; delete w.legacyMigrated;
    });
    arr(e.days).forEach(function (d) { if (d) delete d.legacyKey; });
    delete e.legacySchema; delete e.legacyImport; delete e.legacyMigratedAt;
    e.days.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    return { ok: true, refused: false, changed: true, removedDays: removedDays, removedOps: removedOps };
  }
  /* ============================ سجل السلف ((expenses) ============================ */
  /* تسجيل سلفة موظف — يبقى مرتبطًا برقم المصروف واسمه كما كان (تدقيق كامل). */
  function addAdvance(e, o) {
    ensureLedger(e);
    o = o || {};
    var ts = num(o.ts, Date.now());
    var adv = {
      id: o.id || ('adv_' + ts.toString(36) + Math.random().toString(36).slice(2, 6)),
      ts: ts, dayKey: dayKeyOfTs(ts), amount: r2(Math.max(0, num(o.amount))),
      reason: o.reason || 'سلفة من المصروفات', note: o.note || '',
      expenseId: o.expenseId || null
    };
    if (adv.amount > 0) e.advances.push(adv);
    return adv;
  }
  /* حذف السلفة المرتبطة بمصروف (عند حذف المصروف من شاشة المصروفات) */
  function removeAdvanceByExpense(e, expenseId) {
    if (!e || !expenseId) return 0;
    ensureLedger(e);
    var before = e.advances.length;
    e.advances = e.advances.filter(function (a) { return !(a && a.expenseId === expenseId); });
    return before - e.advances.length;
  }

  /* ============================ التصدير ============================ */
  return {
    SCHEMA: SCHEMA,
    CYCLE_DAYS: CYCLE_DAYS, CYCLE_LABEL: CYCLE_LABEL, CYCLE_ORDER: CYCLE_ORDER,
    setUtil: setUtil, util: util,
    num: num, r2: r2, sum: sum,
    dayKeyOfTs: dayKeyOfTs, tsOfDayKey: tsOfDayKey, addDaysTs: addDaysTs,
    startOfDayTs: startOfDayTs, endOfDayTs: endOfDayTs,
    fmtDMY: fmtDMY, fmtDMYKey: fmtDMYKey, dayNameOf: dayNameOf,
    ensureLedger: ensureLedger, wageOf: wageOf,
    dayClass: dayClass, tallyDays: tallyDays,
    dayRec: dayRec, markDay: markDay, clearDay: clearDay, daysUpTo: daysUpTo,
    planAttendanceClose: planAttendanceClose, applyAttendanceClose: applyAttendanceClose,
    opsUpTo: opsUpTo, payoutsUpTo: payoutsUpTo,
    statsUpTo: statsUpTo, stats: stats,
    ledgerRun: ledgerRun, settleOf: settleOf,
    cycleOf: cycleOf, cycleInfo: cycleInfo,
    planPayout: planPayout, applyPayout: applyPayout, buildBatch: buildBatch,
    commitBatch: commitBatch, retotal: retotal, nextRef: nextRef,
    migrateEmployee: migrateEmployee, legacyNet: legacyNet,
    rollbackMigration: rollbackMigration,
    legacyAuditOf: legacyAuditOf, migrationAudit: migrationAudit,
    addAdvance: addAdvance, removeAdvanceByExpense: removeAdvanceByExpense
  };
});
