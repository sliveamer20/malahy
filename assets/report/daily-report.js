/* daily-report.js
 * ============================================================================
 * تقرير حساب اليوم (Daily Account Report) — مصدر الحقيقة الوحيد لبيانات
 * وحسابات وتنسيق تقرير اليوم المطبوع.
 *
 * القواعد:
 *  - حساب واحد فقط للملخّص المالي:
 *        مبيعات الألعاب = revenue
 *        مبيعات الهدايا = gifts
 *        إجمالي المبيعات = مبيعات الألعاب + مبيعات الهدايا
 *        الصافي قبل خصم الإلكتروني = مبيعات الألعاب − المصروفات
 *        الإجمالي قبل خصم الإلكتروني = إجمالي المبيعات − المصروفات
 *        الإجمالي النهائي النقدي = الإجمالي قبل خصم الإلكتروني − الدفع الإلكتروني
 *    (نفس نتيجة revenue − expenses + gifts القديمة تمامًا للإجمالي قبل خصم
 *     الإلكتروني — الهدايا تُضاف مرة واحدة، والمصروفات تُخصم مرة واحدة، ولا
 *     يوجد أي حساب مكرّر.)
 *
 *  - **الدفع الإلكتروني يُخصم مرة واحدة فقط** من الرصيد النهائي (لا من المبيعات):
 *        الصافي قبل خصم الإلكتروني = revenue − expenses          (gameSales − expenses)
 *        الإجمالي قبل خصم الإلكتروني = الصافي + الهدايا          (net + gifts)
 *        الإجمالي النهائي النقدي = الإجمالي قبل خصم − إلكتروني   (net + gifts − elecRevenue)
 *    التحصيل الإلكتروني يبقى ضمن مبيعات الألعاب وإحصاءاتها كما هو (لا يُشطب ولا
 *    يُعاد تصنيفه) — هو فقط مستثنى من رصيد النقد الفعلي في الدرج.
 *  - ترتيب الأقسام: الترويسة ← تفصيل الألعاب ← الهدايا ← المصروفات ←
 *    ملخص المبيعات ← عدد التذاكر/الدفع ← سجل المرتجعات.
 *  - نفس بيانات التقرير تتكيّف مع ورق الطباعة المختار (58mm / 80mm / A4)
 *    عبر CSS واحد لكل نوع — لا توجد ثلاثة تنفيذات للحسابات.
 *
 * التحميل: سكربت عادي في index.html (مثل qrcode.js و ticket-template.js)
 * يُ expoّز الكائن على window.MalahyDailyReport. ويمكن أيضًا require من
 * اختبارات Node (UMD) لاختبار الحسابات والترتيب مباشرةً.
 * ============================================================================ */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MalahyDailyReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ثوابت الترويسة (قوائم الأيام/الشهور) — تُستخدم كقيم افتراضية فقط؛
     الواجهة تُمرّر قوائم التطبيق الحقيقية عبر setUtil فيظل مصدر واحد. */
  const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                     'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const REPORT_TITLE = 'تقرير حساب اليوم';
  const THERMAL_RULE = '------------------------------'; /* فاصل حراري ثابت العرض */

  /* الترتيب الرسمي لأقسام التقرير — يُستخدم في الاختبارات وفي أي تحقق خارجي */
  const SECTION_ORDER = ['header', 'games', 'gifts', 'expenses', 'summary', 'tickets', 'review'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function padN(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* مساعدون افتراضيون (للاختبارات المستقلة) — الواجهة تستبدلهم بنسخ التطبيق */
  function dfltFmtNum(n) {
    const r = Math.round((Number(n) || 0) * 100) / 100;
    return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function dfltEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dfltFmtDMY(d) { return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function dfltFmtTime12(d) {
    let h = d.getHours(); const m = d.getMinutes();
    const ampm = h < 12 ? 'ص' : 'م';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + pad2(m) + ' ' + ampm;
  }

  let _util = null;
  /* حقن مساعدي التطبيق (مصدر واحد للحرقمة/التاريخ/أوقات الورديات) */
  function setUtil(u) { _util = u || {}; }
  function util() {
    const u = _util || {};
    const dn = u.dayNames, mn = u.monthNames;
    return {
      fmtNum: typeof u.fmtNum === 'function' ? u.fmtNum : dfltFmtNum,
      esc: typeof u.esc === 'function' ? u.esc : dfltEsc,
      fmtDMY: typeof u.fmtDMY === 'function' ? u.fmtDMY : dfltFmtDMY,
      fmtTime12: typeof u.fmtTime12 === 'function' ? u.fmtTime12 : dfltFmtTime12,
      dayNames: Array.isArray(dn) ? dn : (typeof dn === 'function' ? dn() : AR_DAYS),
      monthNames: Array.isArray(mn) ? mn : (typeof mn === 'function' ? mn() : AR_MONTHS),
      dayStartMin: typeof u.dayStartMin === 'function' ? u.dayStartMin : function () { return 600; }
    };
  }

  /* يوم العمل يبدأ مع بداية الوردية الأولى (نفس قاعدة businessDateLabel) */
  function businessDateOf(ts, t) {
    const d = new Date(ts);
    if (d.getHours() * 60 + d.getMinutes() < t.dayStartMin()) d.setDate(d.getDate() - 1);
    return d;
  }

  /* ============================================================================
   * النموذج: حسابات وأقسام التقرير (نقي — لا DOM ولا تخزين).
   * المدخلات: كائن اليوم كما يُبنى من totals()/archiveDay() (مبيعات/هدايا/
   * مصروفات/تذاكر/تفصيل/قوائم). الخرج: نموذج مرتّب جاهز لأي تنسيق طباعة.
   * ============================================================================ */
  function dailyReportModel(day, opts) {
    day = day || {};
    opts = opts || {};
    const t = util();

    /* ---- الملخّص المالي (الحساب الوحيد) ---- */
    const gameSales  = round2(num(day.revenue));                 /* مبيعات الألعاب (كاش + إلكتروني) */
    const giftSales  = round2(num(day.gifts));                   /* مبيعات الهدايا */
    const expenses   = round2(num(day.expenses));                /* إجمالي المصروفات */
    const totalSales = round2(gameSales + giftSales);            /* إجمالي المبيعات */
    const finalTotal = round2(totalSales - expenses);            /* الإجمالي قبل خصم الإلكتروني */
    /* ---- الدفع الإلكتروني (يُخصم مرة واحدة من الرصيد النهائي فقط) ----
       المصدر الرسمي: day.elecRevenue المحفوظ أصلًا مع اليوم (archiveDay/printTodayReport).
       السجلات القديمة التي لا تحمل الحقل تُعامل كصفر ⇒ لا يتغيّر إجماليها إطلاقًا. */
    const elecSales     = round2(num(day.elecRevenue));
    /* السجلات القديمة بلا cashRevenue: الكاش = المبيعات − الإلكتروني (نفسها النتيجة) */
    const cashSales     = (day.cashRevenue != null) ? round2(num(day.cashRevenue))
                                                    : round2(gameSales - elecSales);
    const netBeforeElec = round2(gameSales - expenses);          /* الصافي قبل خصم الإلكتروني */
    const elecDeduction = elecSales;                             /* خصم المبيعات الإلكترونية */
    const finalCash     = round2(finalTotal - elecDeduction);    /* الإجمالي النهائي النقدي */

    /* ---- الترويسة ---- */
    const bd = businessDateOf(day.startedAt || day.endedAt || Date.now(), t);
    const header = {
      venue: (opts.venue != null) ? String(opts.venue) : '',
      title: REPORT_TITLE,
      day: t.dayNames[bd.getDay()],
      date: bd.getDate() + ' ' + t.monthNames[bd.getMonth()] + ' ' + bd.getFullYear(),
      /* ساعة إصدار التقرير: نهاية اليوم المؤرشف، أو وقت الطباعة لليوم الحي */
      time: t.fmtTime12(new Date(day.endedAt || Date.now()))
    };

    /* ---- تفصيل الألعاب (البيانات التاريخية كما هي) ---- */
    const games = (day.breakdown || [])
      .filter(function (b) { return num(b.count) > 0; })
      .map(function (b) {
        return {
          name: b.name || '',
          count: num(b.count),
          price: round2(num(b.price)),
          total: round2(num(b.total)),
          cashCount: num(b.cashCount),
          elecCount: num(b.elecCount)
        };
      });

    /* ---- الهدايا (تُعرض كل العمليات كما سُجّلت — دون تغيير البيانات التاريخية) ---- */
    const gifts = (day.giftList || [])
      .map(function (x) {
        return {
          label: (x.desc || 'هدية') + (x.seq ? (' #' + padN(x.seq, 6)) : ''),
          amount: round2(num(x.amount)),
          at: x.at || null
        };
      });

    /* ---- المصروفات ----
       فصل **مجرد للتعرض فقط**: بنود الرواتب (isSalary) تُطبع أولًا في سطر
       مختصر لكل موظف مع سطر إجمالي واحد، وبقية المصروفات كما هي. لا يتغيّر
       أي حساب: m.summary.expenses يبقى واحدًا من day.expenses (المصدر
       الرسمي)، وإجمالي الرواتب مجموع فعلي من بنود الرواتب نفسها فقط. */
    const expensesList = (day.expenseList || [])
      .map(function (x) {
        return {
          desc: x.desc || 'مصروف',
          amount: round2(num(x.amount)),
          salary: !!x.isSalary
        };
      });
    const salaryExpenses = expensesList.filter(function (x) { return x.salary; });
    const otherExpenses  = expensesList.filter(function (x) { return !x.salary; });
    /* المجموع يُبنى من البنود المحفوظة نفسها — لا من رقم مخزَّن منفصل. */
    const salaryTotal = round2(salaryExpenses.reduce(function (s, x) { return s + x.amount; }, 0));

    /* ---- التذاكر / طرق الدفع ---- */
    const tickets = {
      total: num(day.tickets),
      cash: day.cashTickets != null ? num(day.cashTickets) : 0,
      elec: day.elecTickets != null ? num(day.elecTickets) : 0
    };

    return {
      header: header,
      games: games,
      gifts: gifts,
      expenses: expensesList,
      salaryExpenses: salaryExpenses,
      otherExpenses: otherExpenses,
      summary: {
        gameSales: gameSales,
        giftSales: giftSales,
        totalSales: totalSales,
        expenses: expenses,
        salaryTotal: salaryTotal,
        cashSales: cashSales,
        elecSales: elecSales,
        netBeforeElec: netBeforeElec,
        final: finalTotal,
        elecDeduction: elecDeduction,
        finalCash: finalCash
      },
      tickets: tickets
    };
  }

  /* ============================================================================
   * CSS الطباعة — تنسيق واحد لكل نوع ورق (58mm حراري / 80mm حراري / A4).
   * أسود وأبيض فقط، بخطوط قوية وفواصل واضحة (مُحسَّن للطباعة الحرارية).
   * ============================================================================ */
  function thermalReportCSS(bodyW, fs) {
    return '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '@page{margin:0;}'
      + 'body{width:' + bodyW + 'mm;padding:3mm 2mm;color:#000;background:#fff;'
      + 'font-family:"Consolas","Courier New",monospace;font-size:' + fs + 'px;line-height:1.45;font-weight:700;}'
      + '.c{text-align:center;} .b{font-weight:800;} .big{font-size:' + (fs + 2) + 'px;}'
      + '.s{font-size:' + (fs - 2) + 'px;font-weight:700;margin-top:1px;}'
      + '.num{direction:ltr;unicode-bidi:embed;}'
      + '.hr{white-space:nowrap;overflow:hidden;font-size:' + fs + 'px;letter-spacing:0;margin:3px 0;}'
      + '.r{display:flex;justify-content:space-between;gap:6px;margin:2px 0;}'
      + '.r .l{text-align:right;min-width:0;} .r .v{text-align:left;white-space:nowrap;font-weight:800;}'
      /* سطر راتب مختصر: نص متصل يلتفّ عند الحاجة (اسم عربي طويل أو مبلغ كبير)
         بدل صفّ عمودين — لا قصّ ولا تجاوز لحدود الورق ولا تمديد للتقرير. */
      + '.pw{margin:1px 0;overflow-wrap:anywhere;word-break:break-word;line-height:1.4;}'
      + '.sub2{font-size:' + (fs - 2) + 'px;font-weight:700;color:#000;margin:0 0 2px 4px;}'
      + '.rr{border-bottom:1px dashed #000;padding:3px 0;}'
      + '.rl{display:flex;justify-content:space-between;gap:6px;}'
      + '.tp{font-weight:800;}'
      + '.r2{display:flex;justify-content:space-between;gap:6px;font-size:' + (fs - 2) + 'px;margin-top:1px;}'
      + '.tot{display:flex;justify-content:space-between;margin-top:5px;font-weight:800;}';
  }
  function a4ReportCSS(fs) {
    return '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '@page{size:A4;margin:12mm;}'
      + 'body{color:#000;background:#fff;font-family:"Consolas","Courier New",monospace;'
      + 'font-size:' + fs + 'px;line-height:1.6;font-weight:700;}'
      + '.c{text-align:center;} .b{font-weight:800;} .big{font-size:' + (fs + 3) + 'px;}'
      + '.s{font-size:' + (fs - 1) + 'px;font-weight:700;margin-top:2px;}'
      + '.num{direction:ltr;unicode-bidi:embed;}'
      + '.hr{border-top:1px dashed #000;margin:7px 0;}'
      + '.r{display:flex;justify-content:space-between;gap:12px;margin:3px 0;}'
      + '.r .l{text-align:right;min-width:0;} .r .v{text-align:left;white-space:nowrap;font-weight:800;}'
      + '.pw{margin:1px 0;overflow-wrap:anywhere;word-break:break-word;line-height:1.5;}'
      + '.sub2{font-size:' + (fs - 1) + 'px;font-weight:700;color:#000;margin:0 0 3px 6px;}'
      + '.rr{border-bottom:1px dashed #000;padding:5px 0;}'
      + '.rl{display:flex;justify-content:space-between;gap:12px;}'
      + '.tp{font-weight:800;}'
      + '.r2{display:flex;justify-content:space-between;gap:12px;font-size:' + (fs - 1) + 'px;margin-top:2px;}'
      + '.tot{display:flex;justify-content:space-between;margin-top:8px;font-weight:800;}';
  }
  /* CSS التقرير حسب نوع الورق: a4 → صفحة A4 بم هوامش، غير ذلك حراري 58/80مم */
  function paperCSS(paper) {
    if (paper === 'a4') return a4ReportCSS(13);
    return thermalReportCSS(paper === '58' ? 48 : 72, paper === '58' ? 11 : 12);
  }
  /* فاصل أفقي حسب نوع الورق: الحراري يعتمد على أحلام الشرطة الطرفية،
     أما A4 فقاعدته تعتمد على border-top (فلا نضيف نصًا زائدًا) */
  function hrHTML(paper) {
    if (paper === 'a4') return '<div class="hr"></div>';
    return '<div class="hr">' + THERMAL_RULE + '</div>';
  }

  /* ============================================================================
   * بناء HTML التقرير — قسم واحد لكل نوع ورق، يختلف فقط شكل الفاصل.
   * ============================================================================ */
  function dayReportHTML(day, opts) {
    opts = opts || {};
    const t = util();
    const m = dailyReportModel(day, opts);
    const paper = opts.paper || '80';
    const esc = t.esc, fmtNum = t.fmtNum;
    const money = function (v) { return fmtNum(v) + ' ج'; };
    const row = function (lab, val) {
      return '<div class="r"><span class="l">' + esc(lab) + '</span><span class="v num">' + esc(val) + '</span></div>';
    };
    const hr = function () { return hrHTML(paper); };
    let h = '';

    /* ---- 1) الترويسة ---- */
    h += '<div class="c b big">' + esc(m.header.venue) + '</div>';
    h += '<div class="c b">' + esc(m.header.title) + '</div>';
    h += hr();
    h += '<div data-sec="header">';
    h += '<div class="c">اليوم: ' + esc(m.header.day) + '</div>';
    h += '<div class="c">التاريخ: ' + esc(m.header.date) + '</div>';
    h += '<div class="c">الساعة: ' + esc(m.header.time) + '</div>';
    h += '</div>';
    h += hr();

    /* ---- 2) تفصيل الألعاب ---- */
    if (m.games.length) {
      h += '<div class="b" data-sec="games">تفصيل الألعاب:</div>';
      m.games.forEach(function (b) {
        h += row(b.name + ' (' + fmtNum(b.count) + '×' + fmtNum(b.price) + ')', money(b.total));
        h += '<div class="sub2">كاش ' + fmtNum(b.cashCount) + ' · إلكتروني ' + fmtNum(b.elecCount) + '</div>';
      });
      h += hr();
    }

    /* ---- 3) الهدايا ---- */
    if (m.gifts.length) {
      h += '<div class="b" data-sec="gifts">الهدايا:</div>';
      m.gifts.forEach(function (x) {
        h += row(x.label, money(x.amount));
        if (x.at) h += '<div class="sub2">' + esc(t.fmtDMY(new Date(x.at))) + ' · ' + esc(t.fmtTime12(new Date(x.at))) + '</div>';
      });
      h += row('إجمالي الهدايا', money(m.summary.giftSales));
      h += hr();
    }

    /* ---- 4) المصروفات ---- */
    if (m.expenses.length) {
      h += '<div class="b" data-sec="expenses">المصروفات:</div>';
      /* بنود الرواتب: سطر مختصر واحد لكل موظف دُفع فعلًا في هذا اليوم،
         يليه سطر إجمالي الرواتب. لا عنوان إضافي ولا فاصل إضافي ولا صفحة.
         المسافة قبل المبلغ مقصودة: بدونها يلتصق الرقم بالكلمة في الاتجاه
         من اليمين لليسار («المصروف250 ج» بدل «المصروف 250 ج»). */
      m.salaryExpenses.forEach(function (x) {
        h += '<div class="pw">' + esc(x.desc) + ' <span class="num">' + esc(money(x.amount)) + '</span></div>';
      });
      if (m.salaryExpenses.length) {
        h += '<div class="pw b">إجمالي الرواتب المصروفة: <span class="num">' + esc(money(m.summary.salaryTotal)) + '</span></div>';
      }
      m.otherExpenses.forEach(function (x) { h += row(x.desc, money(x.amount)); });
      h += row('إجمالي المصروفات', money(m.summary.expenses));
      h += hr();
    }

    /* ---- 5) ملخص المبيعات (فصل التفاصيل عن الملخص المالي) ----
       تفصيل الدفع النقدي/الإلكتروني أولاً (المصدر: day.cashRevenue/day.elecRevenue)،
       ثم الخصم الإلكتروني والإجمالي النهائي النقدي. لا تُلمس أرقام أخرى. */
    h += '<div class="b" data-sec="summary">ملخص المبيعات:</div>';
    h += row('مبيعات الألعاب', money(m.summary.gameSales));
    h += row('↳ الدفع النقدي', money(m.summary.cashSales));
    h += row('↳ الدفع الإلكتروني', money(m.summary.elecSales));
    h += row('↳ التذاكر الإلكترونية', fmtNum(m.tickets.elec));
    h += row('مبيعات الهدايا', money(m.summary.giftSales));
    h += row('إجمالي المبيعات', money(m.summary.totalSales));
    h += row('إجمالي المصروفات', money(m.summary.expenses));
    h += row('الصافي قبل خصم الإلكتروني', money(m.summary.netBeforeElec));
    h += row('الإجمالي قبل خصم الإلكتروني', money(m.summary.final));
    h += row('خصم المبيعات الإلكترونية', money(m.summary.elecDeduction));
    h += '<div class="r big b"><span class="l">الإجمالي النهائي النقدي</span><span class="v num">' + esc(money(m.summary.finalCash)) + '</span></div>';
    h += hr();

    /* ---- 6) عدد التذاكر / طرق الدفع ---- */
    h += '<div class="b" data-sec="tickets">التذاكر:</div>';
    h += row('عدد التذاكر', fmtNum(m.tickets.total));
    h += row('منها كاش', fmtNum(m.tickets.cash));
    h += row('منها إلكتروني', fmtNum(m.tickets.elec));
    h += hr();

    /* ---- التذييل ---- */
    h += '<div class="c s">' + esc(m.header.venue) + '</div>';
    h += '<div class="c s">© نظام الحسابات</div>';

    /* ---- 7) سجل المرتجعات (في النهاية دائمًا — يُمرّر جاهزًا) ---- */
    if (opts.reviewHTML) h += String(opts.reviewHTML);

    return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>'
      + (opts.paperCSS != null ? opts.paperCSS : paperCSS(paper))
      + '</style></head><body>' + h + '</body></html>';
  }

  return {
    SECTION_ORDER: SECTION_ORDER,
    setUtil: setUtil,
    util: util,
    num: num,
    round2: round2,
    dailyReportModel: dailyReportModel,
    dayReportHTML: dayReportHTML,
    paperCSS: paperCSS,
    thermalReportCSS: thermalReportCSS,
    a4ReportCSS: a4ReportCSS,
    hrHTML: hrHTML,
    REPORT_TITLE: REPORT_TITLE
  };
});
