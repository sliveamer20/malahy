/* payroll-report.js
 * ============================================================================
 * تقرير صرف رواتب الموظفين — مصدر الحقيقة الوحيد لتنسيق التقرير المطبوع
 * (التقرير المجمّع + إيصال الصرف الفردي) على الطابعة الحرارية.
 *
 * القواعد:
 *  - كل رقم يأتي من سجل الدفعة الفعلي (batch.items) - لا يُقدَّر أي رقم ولا
 *    يُشتق من بيانات غير محفوظة. الحقول غير الموجودة تُحذف ولا تُخترع.
 *  - لا تُطبع أي تسمية أسبوع ثابتة (سبت-الجمعة): الفترة تُطبع كما هي فعلًا
 *    بصيغة "من <أول يوم مغطى> إلى <تاريخ الصرف>".
 *  - تخطيط لكل موظف على حدة (بطاقة) لا جدول أعمدة — هذا هو التخطيط الوحيد
 *    الذي يناسب عرض 48مم (58مم حراري) دون قصٍّ أو تصغير الخط.
 *  - أبيض/أسود فقط، تباين عالٍ، فواصل واضحة، وأنماط LTR للأرقام.
 *
 * التحميل: UMD — يُحمَّل كسكربت عادي في index.html (window.MalahyPayrollReport)
 * أو يُستدعى من اختبارات Node مباشرةً. لا DOM ولا تخزين.
 * ============================================================================ */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MalahyPayrollReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var DEFAULT_VENUE = 'ملاهي كوكو بارك';          /* اسم النشاط المطلوب في التقرير */
  var REPORT_TITLE = 'تقرير صرف رواتب الموظفين';
  var RECEIPT_TITLE = 'إيصال صرف راتب';
  var REPORT_FOOT = 'تم إصدار هذا التقرير من نظام ملاهي كوكو بارك';
  var THERMAL_RULE = '------------------------------';
  /* أقسام التقرير — ترتيبها الرسمي ويُستخدم في الاختبارات */
  var SECTION_ORDER = ['header', 'meta', 'employees', 'totals', 'footer'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function dfltEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dfltFmtNum(n) {
    var r = Math.round((Number(n) || 0) * 100) / 100;
    return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function dfltFmtDMY(d) { return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function dfltFmtTime12(d) {
    var h = d.getHours(), m = pad2(d.getMinutes());
    var ap = h < 12 ? 'ص' : 'م';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  var _util = null;
  function setUtil(u) { _util = u || null; }
  function util() {
    var u = _util || {};
    return {
      esc: typeof u.esc === 'function' ? u.esc : dfltEsc,
      fmtNum: typeof u.fmtNum === 'function' ? u.fmtNum : dfltFmtNum,
      fmtDMY: typeof u.fmtDMY === 'function' ? u.fmtDMY : dfltFmtDMY,
      fmtTime12: typeof u.fmtTime12 === 'function' ? u.fmtTime12 : dfltFmtTime12,
      dayNames: Array.isArray(u.dayNames) ? u.dayNames
        : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    };
  }

  /* ============================ التفاف النص العربي ============================ */
  /* الحروف العربية تتصل، فلا يوجد كسر سطر طبيعي داخل الكلمة. نُقطّع النص على
     المسافات ( rehjaًا ) ونحدّ عدد الأسطر حتى لا يفيض النص عن عرض الورق.
     إن كانت الكلمة الواحدة أطول من عرض السطر نُقصّها بنقاط. */
  function ellipsis(s, max) {
    s = String(s == null ? '' : s);
    if (max <= 0) return '';
    return (s.length <= max) ? s : s.slice(0, Math.max(0, max - 1)) + '…';
  }
  function wrapArabic(text, perLine, maxLines) {
    var words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      while (w.length > perLine) {            /* كلمة أطول من السطر ⇒ تُقصّ */
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, perLine));
        w = w.slice(perLine);
      }
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      /* نحجز حرفًا واحدًا للنقاط حتى لا يتجاوز السطر عرضه */
      lines[maxLines - 1] = ellipsis(lines[maxLines - 1], Math.max(1, perLine - 1));
    }
    return lines;
  }
  /* أسطر HTML جاهزة (كل سطر في <div>) */
  function wrapHTML(text, perLine, maxLines) {
    return wrapArabic(text, perLine, maxLines).map(function (l) {
      return '<div>' + util().esc(l) + '</div>';
    }).join('');
  }
  /* اختصار يضمن ألا يفيض أي مبلغ عن عرض الورق */
  function fitAmount(v, maxChars) {
    var s = util().fmtNum(r2(num(v)));
    return ellipsis(s, maxChars || 14);
  }

  /* ============================ نموذج التقرير ============================ */
  /* يحوّي مستند الدفعة المحفوظ إلى نموذج عرض نقي — نفس الكائن يغذّي
     التقرير المجمّع والإيصالات الفردية، فلا تختلف الأرقام بين الطباعتين. */
  function batchModel(batch, opts) {
    opts = opts || {};
    var t = util();
    batch = batch || {};
    var when = num(batch.ts) ? new Date(num(batch.ts)) : new Date();
    var items = (Array.isArray(batch.items) ? batch.items : [])
      .filter(function (it) { return it && it.status !== 'skipped' && num(it.amount) !== 0; })
      .map(function (it) {
        var p = it.period || {};
        return {
          empId: it.empId, name: it.empName || '', job: it.job || '',
          dailyWage: r2(num(it.dailyWage)),
          work: num(it.work), abs: num(it.abs), vac: num(it.vac),
          gross: r2(num(it.gross)),
          bonus: r2(num(it.bonus)), pen: r2(num(it.pen)),
          adv: r2(num(it.adv)), ded: r2(num(it.ded)),
          paidBefore: r2(num(it.paidBefore)),
          due: r2(num(it.due)),
          amount: r2(num(it.amount)),
          balanceAfter: r2(num(it.balanceAfter)),
          /* صافي بنود هذه الدفعة + فرق التغطية = المبلغ المصروف (دائمًا) */
          coveredNet: r2(num(it.coveredNet)),
          itemsDiff: r2(num(it.itemsDiff)),
          period: { fromKey: p.fromKey || null, toKey: p.toKey || null },
          status: it.status || 'saved', error: it.error || ''
        };
      });
    /* الإجماليات تُحسب من صفوف الدفعة نفسها (لا من حقل مخزَّن قد يتعارض) */
    var g = { gross: 0, bonus: 0, pen: 0, adv: 0, ded: 0, paidBefore: 0, amount: 0, balanceAfter: 0, work: 0, abs: 0, coveredNet: 0, itemsDiff: 0 };
    items.forEach(function (x) {
      g.gross = r2(g.gross + x.gross); g.bonus = r2(g.bonus + x.bonus); g.pen = r2(g.pen + x.pen);
      g.adv = r2(g.adv + x.adv); g.ded = r2(g.ded + x.ded);
      g.paidBefore = r2(g.paidBefore + x.paidBefore); g.amount = r2(g.amount + x.amount);
      g.balanceAfter = r2(g.balanceAfter + x.balanceAfter);
      g.coveredNet = r2(g.coveredNet + x.coveredNet); g.itemsDiff = r2(g.itemsDiff + x.itemsDiff);
      g.work += x.work; g.abs += x.abs;
    });
    g.deductionsTotal = r2(g.adv + g.pen + g.ded);
    return {
      venue: (opts.venue != null && opts.venue !== '') ? String(opts.venue) : DEFAULT_VENUE,
      title: REPORT_TITLE,
      receiptTitle: RECEIPT_TITLE,
      ref: batch.ref || '',
      batchId: batch.id || '',
      when: when,
      dateText: t.fmtDMY(when),
      timeText: t.fmtTime12(when),
      dateKey: batch.dateKey || '',
      note: batch.note || '',
      items: items,
      totals: g,
      count: items.length
    };
  }
  function receiptModel(item, opts) {
    opts = opts || {};
    var t = util();
    var b = batchModel({ ts: num(opts.ts, Date.now()), ref: opts.ref || '', id: opts.batchId || '', items: [item] }, opts);
    b.title = RECEIPT_TITLE;
    b.items = (b.items.length === 1) ? b.items : [{
      empId: item.empId, name: item.empName || '', job: item.job || '',
      dailyWage: r2(num(item.dailyWage)), work: num(item.work), abs: num(item.abs), vac: num(item.vac),
      gross: r2(num(item.gross)), bonus: r2(num(item.bonus)), pen: r2(num(item.pen)),
      adv: r2(num(item.adv)), ded: r2(num(item.ded)), paidBefore: r2(num(item.paidBefore)),
      due: r2(num(item.due)), amount: r2(num(item.amount)), balanceAfter: r2(num(item.balanceAfter)),
      period: item.period || {}, status: item.status || 'saved'
    }];
    var g = b.totals;
    g.gross = b.items[0].gross; g.bonus = b.items[0].bonus; g.pen = b.items[0].pen;
    g.adv = b.items[0].adv; g.ded = b.items[0].ded; g.deductionsTotal = r2(g.adv + g.pen + g.ded);
    g.paidBefore = b.items[0].paidBefore; g.amount = b.items[0].amount; g.balanceAfter = b.items[0].balanceAfter;
    g.work = b.items[0].work; g.abs = b.items[0].abs;
    b.count = 1;
    return b;
  }

  /* ============================ CSS حسب نوع الورق ============================ */
  function thermalCSS(bodyW, fs) {
    var compact = bodyW <= 50;
    return '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '@page{margin:0;}'
      + 'body{width:' + bodyW + 'mm;padding:' + (compact ? '2mm 1.5mm' : '3mm 2mm') + ';color:#000;background:#fff;'
      + 'font-family:"Cairo","Tajawal","Segoe UI",Tahoma,sans-serif;font-size:' + fs + 'px;line-height:1.35;font-weight:600;}'
      + '.c{text-align:center;}'
      + '.num{direction:ltr;unicode-bidi:embed;}'
      + /* فاصل حراري ثابت العرض — لا يعتمد على الحروف العربية */
      + '.hr{white-space:nowrap;overflow:hidden;font-size:' + Math.max(8, fs - 1) + 'px;letter-spacing:0;margin:3px 0;font-weight:900;}'
      /* ---- الترويسة ---- */
      + '.venue{display:block;background:#000;color:#fff;padding:' + (compact ? '2.5px 4px' : '4px 6px') + ';text-align:center;'
      + 'font-size:' + (fs + (compact ? 2 : 4)) + 'px;font-weight:900;line-height:1.2;word-break:break-word;overflow-wrap:anywhere;}'
      + '.ttl{text-align:center;font-size:' + (fs + 1) + 'px;font-weight:900;margin:3px 0 2px;line-height:1.25;}'
      + '.s{font-size:' + (fs - 1) + 'px;font-weight:700;line-height:1.3;}'
      /* ---- صف بيانات: التسمية يمينًا والقيمة يسارًا ---- */
      + '.r{display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin:1.5px 0;}'
      + '.r .l{flex:1 1 auto;text-align:right;min-width:0;overflow-wrap:anywhere;word-break:break-word;}'
      + '.r .v{flex:0 0 auto;text-align:left;white-space:nowrap;font-weight:900;direction:ltr;unicode-bidi:embed;}'
      /* ---- بطاقة الموظف ---- */
      + '.emp{border:1.5px solid #000;border-radius:' + (compact ? '3px' : '5px') + ';padding:' + (compact ? '3px 4px' : '4px 6px') + ';margin:4px 0;break-inside:avoid;page-break-inside:avoid;}'
      + '.emp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:4px;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:2px;}'
      + '.emp-n{font-weight:900;font-size:' + (fs + 1) + 'px;line-height:1.2;min-width:0;overflow-wrap:anywhere;word-break:break-word;}'
      + '.emp-j{font-weight:800;font-size:' + fs + 'px;line-height:1.2;overflow-wrap:anywhere;word-break:break-word;}'
      + '.emp-i{font-weight:900;font-size:' + (fs - 1) + 'px;white-space:nowrap;flex:0 0 auto;direction:ltr;unicode-bidi:embed;}'
      + '.per{font-size:' + (fs - 1) + 'px;font-weight:700;line-height:1.25;margin:0 0 2px;overflow-wrap:anywhere;word-break:break-word;}'
      /* -----money lines ---- */
      + '.ln{display:flex;justify-content:space-between;align-items:baseline;gap:4px;font-size:' + fs + 'px;line-height:1.3;margin:1px 0;}'
      + '.ln .l{min-width:0;overflow-wrap:anywhere;word-break:break-word;}'
      + '.ln .v{white-space:nowrap;font-weight:900;direction:ltr;unicode-bidi:embed;}'
      /* ---- الإجماليات ---- */
      + '.tot{border:2px solid #000;border-radius:' + (compact ? '3px' : '5px') + ';padding:' + (compact ? '3px 4px' : '4px 6px') + ';margin:4px 0;break-inside:avoid;}'
      + '.tot .ln{font-size:' + (fs + (compact ? 0 : 1)) + 'px;font-weight:800;}'
      + '.tot .big .v{font-size:' + (fs + (compact ? 3 : 5)) + 'px;}'
      + '.cnt{text-align:center;font-weight:900;font-size:' + fs + 'px;margin:3px 0;}'
      + '.foot{text-align:center;font-size:' + (fs - 1) + 'px;font-weight:700;margin-top:3px;line-height:1.3;}';
  }
  function a4CSS(fs) {
    return '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '@page{size:A4;margin:12mm;}'
      + 'body{color:#000;background:#fff;font-family:"Cairo","Tajawal","Segoe UI",Tahoma,sans-serif;'
      + 'font-size:' + fs + 'px;line-height:1.5;font-weight:600;}'
      + '.c{text-align:center;} .num{direction:ltr;unicode-bidi:embed;}'
      + '.hr{border-top:1.5px dashed #000;margin:8px 0;}'
      + '.venue{display:block;background:#000;color:#fff;padding:7px;text-align:center;font-size:' + (fs + 8) + 'px;font-weight:900;line-height:1.2;}'
      + '.ttl{text-align:center;font-size:' + (fs + 5) + 'px;font-weight:900;margin:6px 0 4px;}'
      + '.s{font-size:' + fs + 'px;font-weight:700;}'
      + '.r{display:flex;justify-content:space-between;gap:8px;margin:2px 0;}'
      + '.r .l{min-width:0;overflow-wrap:anywhere;} .r .v{white-space:nowrap;font-weight:900;direction:ltr;unicode-bidi:embed;}'
      + '.emp{border:1.5px solid #000;border-radius:8px;padding:8px 10px;margin:8px 0;break-inside:avoid;page-break-inside:avoid;}'
      + '.emp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:4px;}'
      + '.emp-n{font-weight:900;font-size:' + (fs + 3) + 'px;line-height:1.25;min-width:0;overflow-wrap:anywhere;}'
      + '.emp-j{font-weight:800;font-size:' + fs + 'px;overflow-wrap:anywhere;}'
      + '.emp-i{font-weight:900;white-space:nowrap;direction:ltr;unicode-bidi:embed;}'
      + '.per{font-size:' + fs + 'px;font-weight:700;margin:0 0 4px;overflow-wrap:anywhere;}'
      + '.ln{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:' + fs + 'px;margin:2px 0;}'
      + '.ln .l{min-width:0;overflow-wrap:anywhere;} .ln .v{white-space:nowrap;font-weight:900;direction:ltr;unicode-bidi:embed;}'
      + '.tot{border:2px solid #000;border-radius:8px;padding:9px 11px;margin:9px 0;break-inside:avoid;}'
      + '.tot .ln{font-size:' + (fs + 2) + 'px;font-weight:800;}'
      + '.tot .big .v{font-size:' + (fs + 9) + 'px;}'
      + '.cnt{text-align:center;font-weight:900;font-size:' + (fs + 2) + 'px;margin:5px 0;}'
      + '.foot{text-align:center;font-size:' + fs + 'px;font-weight:700;margin-top:6px;}';
  }
  /* عرض الجسم بالملّيمتر لكل نوع ورق: 58مم ⇒ 48، 80مم ⇒ 72، A4 ⇒ بلا حد */
  function payrollPaperCSS(paper) {
    if (paper === 'a4') return a4CSS(13);
    return thermalCSS(paper === '58' ? 48 : 72, paper === '58' ? 10.5 : 11.5);
  }
  function hrHTML(paper) {
    if (paper === 'a4') return '<div class="hr"></div>';
    return '<div class="hr">' + THERMAL_RULE + '</div>';
  }
  /* أقصى عدد حروف fit آمن قبل القص، حسب عرض الورق */
  function charWidth(paper) {
    if (paper === 'a4') return 64;
    return paper === '58' ? 15 : 24;
  }

  /* ============================ بناء HTML ============================ */
  function row(label, value, cls) {
    return '<div class="' + (cls || 'ln') + '"><span class="l">' + label + '</span>'
      + '<span class="v">' + value + '</span></div>';
  }
  function employeeBlock(x, paper) {
    var t = util(), esc = t.esc, fmtNum = t.fmtNum, w = charWidth(paper);
    var h = '<div class="emp" data-emp="' + esc(x.empId == null ? '' : x.empId) + '">';
    h += '<div class="emp-h"><div style="min-width:0">'
      /* الاسم مُعرِّف الموظف: ثلاثة أسطر بدل اثنين حتى لا يُقتطع اسم
         عربي طويل على الورق الضيق (15 حرفًا للسطر في 58mm). */
      + wrapHTML(x.name, w, 3)
      + '<div class="emp-j">' + esc(ellipsis(x.job, w + 6)) + '</div>'
      + '</div><div class="emp-i">#' + esc(String(x.empId == null ? '' : x.empId).slice(-6)) + '</div></div>';
    /* الفترة المغطّاة: بصيغتها الحقيقية، بلا أي تسمية أسبوع ثابتة */
    var pf = x.period || {};
    var perTxt = (pf.fromKey && pf.toKey)
      ? ('الفترة: ' + esc(t.fmtDMY ? t.fmtDMY(new Date(pf.fromKey + 'T12:00:00')) : pf.fromKey)
        + ' ← ' + esc(t.fmtDMY ? t.fmtDMY(new Date(pf.toKey + 'T12:00:00')) : pf.toKey))
      : '';
    if (perTxt) h += '<div class="per">' + perTxt + '</div>';
    h += row('الأجر اليومي', '<span class="num">' + esc(fitAmount(x.dailyWage, w + 6)) + '</span>');
    h += row('أيام الحضور', '<span class="num">' + esc(fmtNum(x.work)) + '</span>');
    if (num(x.abs) > 0) h += row('أيام الغياب', '<span class="num">' + esc(fmtNum(x.abs)) + '</span>');
    if (num(x.vac) > 0) h += row('أيام الإجازة', '<span class="num">' + esc(fmtNum(x.vac)) + '</span>');
    h += row('الأجر المكتسب', '<span class="num">' + esc(fitAmount(x.gross, w + 8)) + '</span>');
    /* المكافآت والجزاءات والسلف والخصومات: تُطبع فقط عند وجودها فعليًا */
    if (num(x.bonus) !== 0) h += row('مكافآت ومكافآت تشجيعية', '<span class="num">' + esc(fitAmount(x.bonus, w + 6)) + '</span>');
    if (num(x.pen) !== 0) h += row('جزاءات', '<span class="num">-' + esc(fitAmount(x.pen, w + 4)) + '</span>');
    if (num(x.adv) !== 0) h += row('سلف مخصومة', '<span class="num">-' + esc(fitAmount(x.adv, w + 4)) + '</span>');
    if (num(x.ded) !== 0) h += row('خصومات أخرى', '<span class="num">-' + esc(fitAmount(x.ded, w + 4)) + '</span>');
    if (num(x.paidBefore) !== 0) h += row('مسدَّد سابقًا', '<span class="num">' + esc(fitAmount(x.paidBefore, w + 6)) + '</span>');
    /* ---- التسوية: تُظهر المستند مطابقًا لنفسه مهما كان توزيع البنود ---- */
    if (num(x.coveredNet) !== 0) h += row('صافي بنود هذه الدفعة', '<span class="num">' + esc(fitAmount(x.coveredNet, w + 4)) + '</span>');
var idf = r2(num(x.itemsDiff));
    if (idf !== 0) {
      /* فرق البنود مُوقَّع، ويجعل هذه المعادلة صحيحة دائمًا في المطبوعة:
             صافي بنود هذه الدفعة  +  فرق البنود  =  المصروف في هذه الدفعة
         · موجب ⇒ جزءٌ من المبلغ يُسدِّد بندًا لم يمكن إدراجه ضمن بنود
                  الدفعة لأن رصيده التراكمي بلغ ذروته قبل خصم لاحق.
         · سالب ⇒ البنود المُسمّاة تشمل جزءًا سدَّدته دفعة سابقة، وسطر
                  «مسدَّد سابقًا» يوضّح مقداره؛ والباقي هو المصروف الآن.
         المال صحيح في الحالتين؛ وهذا السطر هو ما يجعل المطبوعة متسقة. */
      var idfRow = (idf > 0)
        ? row('بنود غير مُفصَّلة في هذا الإيصال', '<span class="num">' + esc(fitAmount(idf, w + 2)) + '</span>')
        : row('يُسدَّد لاحقًا من بنود هذه الدفعة', '<span class="num">-' + esc(fitAmount(-idf, w + 2)) + '</span>');
      h += idfRow;
    }
    h += row('<b>المصروف في هذه الدفعة</b>', '<span class="v num"><b>' + esc(fitAmount(x.amount, w + 8)) + '</b></span>');
    h += row('المتبقي بعد الصرف', '<span class="num">' + esc(fitAmount(x.balanceAfter, w + 6)) + '</span>');
    h += '</div>';
    return h;
  }
  function totalsBlock(m) {
    var t = util(), esc = t.esc, fmtNum = t.fmtNum, g = m.totals;
    var money = function (v, w) { return '<span class="num">' + esc(fitAmount(v, w)) + '</span>'; };
    var h = '<div class="tot" data-sec="totals"><div class="ln b"><span class="l">إجمالي الأجر المكتسب</span>' + money(g.gross, 18) + '</div>';
    if (num(g.bonus) !== 0) h += '<div class="ln"><span class="l">إجمالي المكافآت</span>' + money(g.bonus, 18) + '</div>';
    if (num(g.pen) !== 0) h += '<div class="ln"><span class="l">إجمالي الجزاءات</span>' + money(g.pen, 18) + '</div>';
    if (num(g.adv) !== 0) h += '<div class="ln"><span class="l">إجمالي السلف</span>' + money(g.adv, 18) + '</div>';
    if (num(g.ded) !== 0) h += '<div class="ln"><span class="l">إجمالي الخصومات</span>' + money(g.ded, 18) + '</div>';
    h += '<div class="ln b"><span class="l">إجمالي السلف والخصومات</span>-' + money(g.deductionsTotal, 16) + '</div>';
    if (num(g.paidBefore) !== 0) h += '<div class="ln"><span class="l">إجمالي مسدَّد سابقًا</span>' + money(g.paidBefore, 18) + '</div>';
/* نفس سطر التسوية في بطاقة كل موظف، وإلا لم يطابق المجموعُ نفسَه:
         إجمالي صافي البنود + إجمالي فرق البنود = صافي المصروف فعليًا */
    h += '<div class="ln b"><span class="l">إجمالي صافي بنود الدفعة</span>' + money(g.coveredNet, 18) + '</div>';
    var gidf = r2(num(g.itemsDiff));
    if (gidf !== 0) {
      h += (gidf > 0)
        ? '<div class="ln"><span class="l">إجمالي بنود غير مُفصَّلة</span>' + money(gidf, 18) + '</div>'
        : '<div class="ln"><span class="l">إجمالي يُسدَّد لاحقًا من بنود الدفعة</span>-' + money(-gidf, 18) + '</div>';
    }
    h += '<div class="ln big b"><span class="l">صافي المصروف فعليًا</span>' + money(g.amount, 20) + '</div>';
    if (num(g.balanceAfter) !== 0) h += '<div class="ln"><span class="l">إجمالي المتبقي</span>' + money(g.balanceAfter, 18) + '</div>';
    h += '</div>';
    h += '<div class="cnt" data-sec="count">عدد الموظفين ضمن الدفعة: ' + esc(fmtNum(m.count)) + '</div>';
    return h;
  }
  function headHTML(m, title, paper) {
    var t = util(), esc = t.esc, hr = function () { return hrHTML(paper); };
    var h = '<div data-sec="header">';
    h += '<div class="venue">' + wrapHTML(m.venue, charWidth(paper) + 6, 2) + '</div>';
    h += '<div class="ttl">' + esc(title) + '</div>';
    h += hr();
    h += '<div class="r"><span class="l">تاريخ الصرف</span><span class="v num">' + esc(m.dateText) + '</span></div>';
    h += '<div class="r"><span class="l">وقت الصرف</span><span class="v num">' + esc(m.timeText) + '</span></div>';
    h += '<div class="r"><span class="l">رقم الدفعة</span><span class="v num">' + esc(ellipsis(m.ref, charWidth(paper) + 6)) + '</span></div>';
    h += hr();
    h += '</div>';
    return h;
  }
  function footHTML(m, paper) {
    var esc = util().esc;
    return '<div data-sec="footer">' + hrHTML(paper)
      + '<div class="foot c">' + esc(m.venue) + '</div>'
      + '<div class="foot c">' + esc(REPORT_FOOT) + '</div></div>';
  }

  /* التقرير المجمّع كاملًا (كل موظف في الدفعة) */
  function batchHTML(batch, opts) {
    opts = opts || {};
    var paper = opts.paper || '80';
    /* esc لازم يُعرَّف هنا: ملاحظة الدفعة تُهرَّب في السطر التالي، واستدعاء
       `esc(...)` بلا تعريف كان يرمي ReferenceError على أي دفعة تحمل ملاحظة. */
    var esc = util().esc;
    var m = batchModel(batch, opts);
    var h = headHTML(m, REPORT_TITLE, paper);
    h += '<div data-sec="employees">';
    if (!m.items.length) {
      h += '<div class="c s">لا توجد عمليات صرف مسجَّلة في هذه الدفعة</div>';
    } else {
      m.items.forEach(function (x) { h += employeeBlock(x, paper); });
    }
    h += '</div>';
    h += totalsBlock(m);
    if (m.note) h += '<div class="foot">' + esc(ellipsis(m.note, charWidth(paper) + 14)) + '</div>';
    h += footHTML(m, paper);
    return doc(h, opts.paperCSS != null ? opts.paperCSS : payrollPaperCSS(paper));
  }

  /* إيصال صرف فردي لموظف واحد (من نفس بيانات الدفعة المحفوظة) */
  function receiptHTML(item, opts) {
    opts = opts || {};
    var paper = opts.paper || '80';
    var m = receiptModel(item, opts);
    var x = m.items[0];
    var t = util(), esc = t.esc, w = charWidth(paper);
    var h = '<div data-sec="header">';
    h += '<div class="venue">' + wrapHTML(m.venue, w + 6, 2) + '</div>';
    h += '<div class="ttl">' + esc(RECEIPT_TITLE) + '</div>';
    h += hrHTML(paper);
    h += '<div class="r"><span class="l">رقم الإيصال</span><span class="v num">' + esc(ellipsis(m.ref, w + 6)) + '</span></div>';
    h += '<div class="r"><span class="l">التاريخ</span><span class="v num">' + esc(m.dateText) + '</span></div>';
    h += '<div class="r"><span class="l">الوقت</span><span class="v num">' + esc(m.timeText) + '</span></div>';
    h += hrHTML(paper);
    h += '</div>';
    h += employeeBlock(x, paper);
    h += '<div class="tot" data-sec="totals"><div class="ln big b"><span class="l">المبلغ المصروف</span>'
      + '<span class="v num">' + esc(fitAmount(x.amount, w + 10)) + '</span></div></div>';
    h += '<div class="foot c">توقيع الموظف: ............................</div>';
    h += footHTML(m, paper);
    return doc(h, opts.paperCSS != null ? opts.paperCSS : payrollPaperCSS(paper));
  }

  function doc(body, css) {
    return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>' + css
      + '</style></head><body>' + body + '</body></html>';
  }

/* ==================== تقرير تدقيق الترحيل ====================
     تقرير مستقل يوثّق ما استورده الترحيل بالضبط: عدد أيام الحضور
     المُرحَّلة، والعمليات، والأسابيع المدفوعة (التي لا يُعاد احتسابها
     إطلاقًا)، والأسابيع التي تحتاج مراجعة.
     كل الأرقام من سجل التدقيق المحفوظ على الموظف (legacyImport) —
     لا يُعاد عدّ أي يوم ولا يُحسب أي رصيد هنا. */
  var AUDIT_TITLE = 'تقرير تدقيق ترحيل سجل الموظفين';

  function migrationAuditModel(audit, opts) {
    opts = opts || {};
    var t = util();
    var a = audit || {};
    var when = num(opts.ts) ? new Date(num(opts.ts)) : (num(a.at) ? new Date(num(a.at)) : new Date());
    var rows = (Array.isArray(a.rows) ? a.rows : []).map(function (r) {
      return {
        empId: r.empId, name: r.name || '', job: r.job || '',
        days: num(r.days), work: num(r.work), abs: num(r.abs), vac: num(r.vac),
        ops: num(r.ops),
        weeksPaid: num(r.weeksPaid), weeksUnpaid: num(r.weeksUnpaid),
        weeksUnreadable: num(r.weeksUnreadable), flags: num(r.flags), at: num(r.at)
      };
    });
    var g = { employees: num(a.employees), migrated: num(a.migrated),
      days: num(a.days), work: num(a.work), abs: num(a.abs), vac: num(a.vac), ops: num(a.ops),
      weeksPaid: num(a.weeksPaid), weeksUnpaid: num(a.weeksUnpaid),
      weeksUnreadable: num(a.weeksUnreadable), flags: num(a.flags) };
    /* مطابقة دائمة: الأيام المُرحَّلة هي مجموع صفوف الموظفين */
    var sumDays = 0, sumOps = 0, sumFlags = 0;
    rows.forEach(function (r) { sumDays += r.days; sumOps += r.ops; sumFlags += r.flags; });
    g.rowsDays = r2(sumDays);
    g.rowsOps = r2(sumOps);
    g.rowsFlags = sumFlags;
    /* مطابقة دائمة: الأيام المُرحَّلة = حضور + غياب + إجازة */
    g.dayParts = r2(g.work + g.abs + g.vac);
    return {
      venue: (opts.venue != null && opts.venue !== '') ? String(opts.venue) : DEFAULT_VENUE,
      title: AUDIT_TITLE, ref: opts.ref || '',
      when: when, dateText: t.fmtDMY(when), timeText: t.fmtTime12(when),
      rows: rows, totals: g,
      count: rows.length,
      balanced: r2(g.days) === r2(g.rowsDays) && r2(g.ops) === r2(g.rowsOps) &&
        r2(g.days) === r2(g.dayParts)
    };
  }

  function migrationAuditHTML(audit, opts) {
    opts = opts || {};
    var paper = opts.paper || '80';
    var w = charWidth(paper);
    var t = util(), esc = t.esc, fmtNum = t.fmtNum;
    var m = migrationAuditModel(audit, opts);
    var money = function (v, wd) { return '<span class="num">' + esc(fitAmount(v, wd)) + '</span>'; };
    var line = function (l, v) { return '<div class="ln"><span class="l">' + l + '</span>' + v + '</div>'; };

    var h = '<div data-sec="header">';
    h += '<div class="venue">' + wrapHTML(m.venue, w + 6, 2) + '</div>';
    h += '<div class="ttl">' + esc(m.title) + '</div>';
    h += hrHTML(paper);
    h += '<div class="r"><span class="l">تاريخ التقرير</span><span class="v num">' + esc(m.dateText) + '</span></div>';
    h += '<div class="r"><span class="l">وقت التقرير</span><span class="v num">' + esc(m.timeText) + '</span></div>';
    h += hrHTML(paper);
    h += '</div>';

    h += '<div data-sec="totals">';
    h += '<div class="tot">';
    h += '<div class="ln big b"><span class="l">أيام الحضور المُرحَّلة</span>' + money(m.totals.days, w + 4) + '</div>';
    h += line('منها أيام عمل', '<span class="num">' + esc(fmtNum(m.totals.work)) + '</span>');
    h += line('منها أيام غياب', '<span class="num">' + esc(fmtNum(m.totals.abs)) + '</span>');
    h += line('منها أيام إجازة', '<span class="num">' + esc(fmtNum(m.totals.vac)) + '</span>');
    h += line('عمليات مُرحَّلة (سلف/خصومات/مكافآت/جزاءات)', money(m.totals.ops, w));
    h += line('موظفون تم ترحيلهم', '<span class="num">' + esc(fmtNum(m.totals.migrated)) + '</span>');
    h += line('إجمالي الموظفين', '<span class="num">' + esc(fmtNum(m.totals.employees)) + '</span>');
    h += line('أسابيع مدفوعة (لم يُعد احتسابها)', '<span class="num">' + esc(fmtNum(m.totals.weeksPaid)) + '</span>');
    h += line('أسابيع غير مدفوعة', '<span class="num">' + esc(fmtNum(m.totals.weeksUnpaid)) + '</span>');
    if (num(m.totals.weeksUnreadable) !== 0) h += line('أسابيع تعذّر قراءتها', '<span class="num">' + esc(fmtNum(m.totals.weeksUnreadable)) + '</span>');
    if (num(m.totals.flags) !== 0) h += line('سجلات تحتاج مراجعة', '<span class="num">' + esc(fmtNum(m.totals.flags)) + '</span>');
    h += '</div></div>';

    h += '<div data-sec="employees">';
    if (!m.rows.length) {
      h += '<div class="c s">لا يوجد سجلات مُرحَّلة لعرضها</div>';
    } else {
      m.rows.forEach(function (x) {
        h += '<div class="emp" data-emp="' + esc(x.empId == null ? '' : x.empId) + '">';
        h += '<div class="emp-h"><div style="min-width:0">'
          + wrapHTML(x.name, w, 3)
          + '<div class="emp-j">' + esc(ellipsis(x.job, w + 6)) + '</div>'
          + '</div><div class="emp-i">#' + esc(String(x.empId == null ? '' : x.empId).slice(-6)) + '</div></div>';
        h += line('أيام حضور مُرحَّلة', '<span class="num">' + esc(fmtNum(x.days)) + '</span>');
        h += line('منها عمل / غياب / إجازة', '<span class="num">' + esc(fmtNum(x.work)) + ' / ' + esc(fmtNum(x.abs)) + ' / ' + esc(fmtNum(x.vac)) + '</span>');
        h += line('عمليات مُرحَّلة', '<span class="num">' + esc(fmtNum(x.ops)) + '</span>');
        h += line('أسابيع مدفوعة لم تُعد', '<span class="num">' + esc(fmtNum(x.weeksPaid)) + '</span>');
        h += line('أسابيع غير مدفوعة', '<span class="num">' + esc(fmtNum(x.weeksUnpaid)) + '</span>');
        if (num(x.flags) !== 0) h += line('سجلات تحتاج مراجعة', '<span class="num">' + esc(fmtNum(x.flags)) + '</span>');
        h += '</div>';
      });
    }
    h += '</div>';

    h += '<div class="foot c">' + esc(REPORT_FOOT) + '</div>';
    return doc(h, opts.paperCSS != null ? opts.paperCSS : payrollPaperCSS(paper));
  }
  return {
    DEFAULT_VENUE: DEFAULT_VENUE,
    REPORT_TITLE: REPORT_TITLE,
    RECEIPT_TITLE: RECEIPT_TITLE,
    SECTION_ORDER: SECTION_ORDER,
    setUtil: setUtil, util: util,
    num: num, r2: r2, pad2: pad2,
    ellipsis: ellipsis, wrapArabic: wrapArabic, wrapHTML: wrapHTML, fitAmount: fitAmount,
    batchModel: batchModel, receiptModel: receiptModel,
    migrationAuditModel: migrationAuditModel, migrationAuditHTML: migrationAuditHTML,
    payrollPaperCSS: payrollPaperCSS, thermalCSS: thermalCSS, a4CSS: a4CSS,
    hrHTML: hrHTML, charWidth: charWidth,
    batchHTML: batchHTML, receiptHTML: receiptHTML
  };
});
