# المرحلة 1 — تدقيق نظام الموظفين والرواتب (Read-Only Audit)

> التدقيق فقط — لم يتم تعديل أي ملف وظيفي أثناء إعداد هذا التقرير.
> الإصدار الحالي: **2.5.4** · فرع `main` · شجرة العمل نظيفة (لا تغييرات غير محفوظة).

---

## 1. خريطة المشروع

| الملف | الدور في هذا المشروع | علاقته بالرواتب |
|---|---|---|
| `index.html` (733 KB) | تطبيق Electron أحادي الملف: كل الواجهة ومنطق العمل | **كل منطق الموظفين والرواتب موجود هنا** |
| `assets/report/daily-report.js` | مصدر الحقيقة الوحيد لتنسيق/حساب تقرير اليوم الحراري | البنية التي سنحاكيها لتقرير الرواتب |
| `database.js` | تخزين JSON واحد: `%APPDATA%\<app>\malahy-data.json` + نسخة `.bak.json` | تخزين `malahy_employees_v1` |
| `main.js` | `get-printers` + `print-ticket` IPC + معالجة الأخطاء | بنية الطباعة الحرارية |
| `preload.js` | `window.malahyDB.get/set` و `window.malahyPrint.printTicket` | جسور التخزين والطباعة |
| `permissions.js` / `perm-gate.js` | تسجيل الصلاحيات + `employeeManage` / `payroll` | يجب أن يبقى كل عملية صرف خلف `MalahyPerm.requirePerm('payroll',…)` |
| `users.js` / `login.js` / `recovery.js` | الحسابات والجلسات — **خارج النطاق** | لا تُمس |
| `tests/*.test.js` | 14 ملف اختبار قائم | `tests/protected-baseline.json` يحمي بصمات ملفات |

---

## 2. الملفات والدوال المسؤولة عن قيد «السبت ← الجمعة»

| السطر | الدالة | نوع القيد |
|---|---|---|
| 4720 | تعليق `نظام الموظفين والرواتب الأسبوعية (السبت → الجمعة)` | توثيق |
| 4721 | `EMP_JOBS` | **أجر يومي افتراضي مرصوص** (كاشير 100 / مشغل ألعاب 85) |
| 4722 | `EMP_DAYS` | ترتيب اليوم داخل الأسبوع مثبّت على السبت |
| 4752 | `satStartOf(ts)` | **جوهر القيد**: يعيد أقرب سبت |
| 4753 | `weekKeyOf(ts)` | مفتاح الفترة = تاريخ السبت |
| 4754-4758 | `weekStartFromKey` / `weekEndFromKey` / `dayDateOf` / `dayTsOf` / `dayIdxInWeek` | كل التواريخ محسوبة من تاريخ السبت |
| 4759 | `defaultDayIdx(key)` | اعتماد على المؤشر داخل الأسبوع |
| 4761 | `weekRangeLabel(key)` | نص «السبت … ← الجمعة …» |
| 4763 | `empCurKey()` | الفترة الحالية = أسبوع السبت الحالي |
| 4765-4771 | `newWeek(key, wage)` | ينشئ 7 أيام كلها `status:'work'` |
| 4773-4792 | `ensureWeeks()` / `empWeekEnsure(e,key)` | إنشاء أسبوع تلقائي لكل موظف |
| 4808-4820 | `recordEmployeeAdvance()` | **`if(w.paid)` يمنع تسجيل السلفة** — مرتبط بالأسبوع |
| 4835-4844 | `calcWeek(w)` | الحساب = `work × wage + bonus − pen − adv − ded` |
| 4846-4851 | `weekStats(w)` | يعتمد `snapshot` إن كان `paid` |
| 4852-4862 | `empDashboardStats(curKey)` | لوحة أسبوعية |
| 4958 | شريط «بداية الأسبوع / نهاية الأسبوع» | واجهة |
| 4988-5021 | جدول لوحة الموظفين | «صافي الأسبوع» |
| 5181-5312 | `empView()` | شاشة الموظف: جدول حضور 7 أيام ثابت |
| 5282-5308 | سجل الرواتب | صف لكل أسبوع |
| 5341-5405 | `empStatement()` | كشف الحساب الأسبوعي |
| **5409-5427** | **`empPayOne(empId,key)`** | **`if(w.paid){ … لا يمكن الصرف مرتين }` + صرف المبلغ الصافي كاملًا فقط** |
| **5428-5444** | **`empPayAll()`** | **يصرف «الأسبوع الحالي» لكل الموظفين دفعة واحدة، مبلغ الصافي الكامل فقط** |
| 5458-5472 | `empStartNewWeek()` | زر «بدء أسبوع جديد» |
| 5475-5485 | `empWeekTableData(curKey)` | تقرير أسبوعي |
| 5503-5527 / 5544 / 5578 / 5618 | `salaryReportHTML` / `exportWeekExcel` / `statementHTML` / `exportStatementExcel` | نصوص «السبت/الجمعة» في التقارير |
| 5578 | `statementHTML` | «بداية الأسبوع … نهاية الأسبوع» |
| 5648-5676 | `drLoad/drRec/drWeekOf` | التسجيل اليومي مربوط بـ`weekKeyOf` |
| 5706-5732 | `drSetAmount()` | خصم/مكافأة يومية تنعكس داخل الأسبوع |
| 5734-5743 | `empPruneAutoWeeks()` | يحذف أسابيع فارغة |

**لا يوجد أي مفهوم للدفع الجزئي، ولا لمجموعة عمليات (batch)، ولا لسجل دفعات منفصل.** الفترة = الأسبوع، والصرف = علامة `paid` + `snapshot` مجمّد.

---

## 3. نموذج البيانات الحالي

```js
// K_EMP = 'malahy_employees_v1'  →  مصفوفة موظفين
{
  id, name, job, dailyWage, phone, hiredAt, notes,
  weeks: [{
    key:'YYYY-MM-DD',            // تاريخ السبت
    startTs, endTs,
    dailyWage,                   // نسخة الأجر وقت إنشاء الأسبوع
    days:[ {status:'work'|'vacation'|'absent', penalty, bonus, note} ×7 ],
    bonuses:[], penalties:[], advances:[], deductions:[],
    weekNote:'',
    paid:false, paidAt:null,
    snapshot:null                // ناتج calcWeek لحظة الصرف
  }]
}
// K_DREG = 'malahy_daily_reg_v1'  →  سجل حضور/انصراف يومي
{ id, empId, dayKey:'YYYY-MM-DD', inTs, outTs, deduction, bonus, updatedAt }
```

### م.rule الحضور القائم
- `newWeek()` ينشئ **7 أيام بحالة `work` افتراضيًا** ⇒ أي يوم غير مسجَّل يُحتسب **حضورًا**.
- الغياب يُحتسب فقط عند اختيار `absent` صراحةً ⇒ الشرط «لا تحسب غيابًا تلقائيًا» **محترم حاليًا**، لكن العكس (**اختراع حضور**) مكسور.
- `dreg` (تسجيل الحضور/الانصراف) هو سجل الحضور الحقيقي اليومي، لكنه **لا يؤثّر على `calcWeek`** — الأجر يأتي من شبكة `days` فقط.

### م.rule الأجر
`calcWeek` يستخدم `w.dailyWage` (نسخة الأسبوع)، و`empForm` يزامن `e.dailyWage` مع الأسبوع الحالي غير المصروف فقط.
`EMP_JOBS[].wage` (100 / 85) يُستخدم **لملء نموذج الموظف الجديد فقط** — يجب ألا يُرمَّز في أي حساب جديد.

---

## 4. البنية التحتية للطباعة الحرارية (قابلة لإعادة الاستخدام كما هي)

| المكوّن | الموقع | الاستخدام الجديد |
|---|---|---|
| `paperKind()` | `index.html:3846` | يحدّد 58/80/A4 من الإعدادات أو من اسم الطابعة — **نستخدمه كما هو** |
| `ticketCSS()` | `index.html:3861` | عرض 48مم (58) / 72مم (80) |
| `reportPaperCSS()` → `MalahyDailyReport.paperCSS(paper)` | `daily-report.js:206` | CSS حراري أسود/أبيض عالي التباين + فواصل `-----` |
| `thermalReportCSS(bodyW, fs)` / `a4ReportCSS(fs)` | `daily-report.js:169,187` | قالب CSS موحّد قابل لإعادة الاستخدام |
| `printResultToast(res, okMsg)` | `index.html:4148` | **ن réutilise كما هو**: `no-printer-selected` / `printer-not-found` / خطأ عام برسائل عربية |
| `window.malahyPrint.printTicket({html, printerName, paper, silent})` | `preload.js` + `main.js:354+` | إرسال HTML للطباعة؛ يُرجع `{ok,reason}` |
| `brandName()` | `index.html:2377` | اسم النشاط القابل للتهيئة |

نمط الاختبار المرجعي: `assets/report/daily-report.js` (UMD: يعمل في `window` وفي `require` من Node) — **سنتبع نفس النمط تمامًا** لملف `assets/report/payroll-report.js`.

---

## 5. الاختبارات والخط الأساس المحمي

`tests/protected-baseline.json` يثبّت SHA-256 لـ 13 ملفًا منها `index.html`.
`tests/phase3c2-baseline.test.js` يتجاهل `index.html` صراحةً (`intended = {"index.html": true}`) ويتوقع `package.json === "2.5.4"`.

حالة_baseline الحالية (جميعها تمر):

| الاختبار | النتيجة |
|---|---|
| `phase1-printer-feedback.test.js` | 40 / 0 |
| `phase3b-auth.test.js` | 79 / 0 |
| `phase3c2-baseline.test.js` | 63 / 0 |
| `phase3c3-accounts.test.js` | 92 / 0 |
| `phase3c3-ui.test.js` | 76 / 0 |
| `phase3c4-recovery.test.js` | 79 / 0 |
| `phase4-daily-report.test.js` | 71 / 0 |
| (phase3b-ipc, phase3c1-*, phase3c2-gate/perms) | تمر |

**ملاحظة مهمة:** لا يوجد سكربت `npm test`. الاختبارات تُشغَّل يدويًا بـ `node tests\<file>`.

### نقاط ضعف في التغطية الحالية
- **صفر** اختبارات لمنطق الرواتب (`calcWeek` / `empPayOne` / `empPayAll` / الترحيل).
- **صفر** اختبارات ترحيل بيانات الموظفين.
- `index.html` غير قابل للتحميل في Node، لذلك سنحتاج **وحدة منطق نقي** قابلة للاختبار.

---

## 6. التغييرات المطلوبة

### 6.1 إزالة القيد
- حذف الاعتماد على `weekKeyOf` / `satStartOf` في **مسار الصرف الجديد**.
- إبقاء دوال الأسبوع **كقارئ للتاريخ التاريخي فقط** (`weekStartFromKey`, `weekEndFromKey`, `weekRangeLabel`) حتى لا تضيع receipts قديمة — أو بالأحرى نقرأ `w.startTs/w.endTs` المخزَّنين.

### 6.2 نموذج بيانات جديد (إضافة، لا حذف)
على كل موظف:
```
payCycle : 'weekly' | 'biweekly' | 'monthly' | 'manual'
cycleAnchorDay : 1..31            (لدورة الشهر)
days     : [ {key:'YYYY-MM-DD', ts, status:'work'|'absent'|'vacation',
              src:'dreg'|'manual'|'legacy', note, wage} ]   ← سجل الحضور المرن
payouts  : [ {id, ts, date, amount, batchId, ref, covered:{...},
              deductions:{...}, balanceAfter, note} ]       ← سجل الدفعات
advances : [ {id, dayKey, ts, amount, reason, note, expenseId, settledBy} ]
bonuses / penalties / deductions : [ {id, dayKey, ts, amount, reason, note, settledBy} ]
```
على مستوى التطبيق: مفتاح جديد `K_PAYBATCH='malahy_payroll_batches_v1'` لمجموعات الصرف.

### 6.3 دوال منطق جديدة (قابلة للاختبار)
`empLedgerStats(e, atDate)`, `empOutstanding(e)`, `planPayout(e, opts)`, `applyPayout(e, plan)`, `commitBatch(plans, opts)`.

### 6.4 الترحيل (Phase 6)
لكل `w` قديم في `weeks[]`:
- `w.paid === true` ⇒ يبقى كما هو، يُوسم `legacySettled:true`، **لا يدخل الحساب الجديد** (مُدفوع أصلًا).
- `w.paid === false` ⇒ **تُستورد أيامه المنتهية (≤ اليوم)** إلى `days[]` بـ`src:'legacy'`، وتُستورد `advances` غير المسددة. `w` يبقى محفوظًا ويُوسم `legacyMigrated:true` لمنع الازدواج.
- الأيام المستقبلية داخل `w.days` **لا** تُستورد (تفادي اختراع حضور).
- أي سجل لا يمكن تفسيره بأمان ⇒ `e.reviewFlags[]` بدل تغيير معناه المالي.

### 6.5 التقارير
- `assets/report/payroll-report.js` (جديد, UMD): `payrollReportModel()`, `payrollBatchHTML()`, `payrollReceiptHTML()`, `payrollPaperCSS()`, `ARABIC_WRAP`.
- تقرير مجمّع + إيصال فردي، بنفس `printResultToast`.

---

## 7. المخاطر على البيانات

| # | الخطر | التخفيف |
|---|---|---|
| R1 | **ازدواج حساب الأيام**: `weeks[].days` و `days[]` معًا | الترحيل يضع `legacyMigrated` ويقصّ الأسبوع القديم من الحساب الجديد |
| R2 | **اختراع حضور** من `newWeek` (7 أيام `work` افتراضيًا) | لا نُنشئ أيامًا إلا من سجل فعلي (`dreg`) أو من Days منتهية مُستوردة |
| R3 | **خسارة رواتب غير مصروفة** عند الترحيل | استيراد `w.paid===false` كاملًا؛ `w.paid===true` محفوظ بـ`snapshot` |
| R4 | **خصم السلفة مرتين** | حقل `settledBy` على كل سلفة/خصم/مكافأة؛ يُملأ مرة واحدة فقط |
| R5 | **فشل جزئي في الحفظ** | حفظ كل موظف على حدة مع تراجع (rollback) وتسجيل النتيجة في الدفعة |
| R6 | **إعادة محاولة مكرّرة** | `batchId` و`payout.id` يُولَّدان قبل الحفظ؛ التخطي إن وُجدت |
| R7 | **كشف حساب قديم ينكسر** | `statementHTML`/`empStatement` يقرآن `w.startTs/w.endTs` لا `weekKeyOf` |
| R8 | **baseline محمي** | `index.html` مستثنى في `phase3c2-baseline`؛ `package.json` يبقى `2.5.4` |
| R9 | **ملفات الإنتاج** | لا نكتب في `%APPDATA%` إطلاقًا من الاختبارات؛ كل اختبار يستخدم `os.tmpdir()` |
| R10 | **`dregSetAmount` يكتب في الأسبوع** | نعيد توجيهه إلى `days[]`/قوائم الموظف الجديدة، مع إبقاء مسار المصروفات للسلف |

---

## 8. خطة الاختبار (Phase 7)

ملف جديد `tests/payroll.test.js` + `tests/payroll-report.test.js` ببيانات اصطناعية بالكامل.

| # | الحالة | الهدف |
|---|---|---|
| 1 | يوم حضور واحد ثم الصرف | الرصيد = أجر يوم واحد |
| 2 | يومان ثم الصرف | الرصيد = أجر يومين |
| 3 | دورات 7 / 15 / شهري / يدوي | احتساب «موعد الاستحقاق» بدون منع الصرف |
| 4 | الصرف قبل اكتمال الدورة | يُسمح |
| 5 | موظف واحد / عدة موظفين معًا | مسارات فردية وجماعية |
| 6 | دفعات جزئية | `outstanding` ينقص بدقة |
| 7 | عدّ الحضور والغياب | من السجل فقط |
| 8 | سلف/خصومات/مكافآت/جزاءات | تُخصم مرة واحدة |
| 9 | منع الدفع المكرر | الرصيد لا يصبح سالبًا بالخطأ |
| 10 | حفظ السجل التاريخي | الأسابيع القديمة تبقى وتُقرأ |
| 11 | إجماليات التقرير المجمّع | مطابقة لكل بند |
| 12 | تنسيق الإيصال الحراري + التفاف العربي + أخطاء الطابعة | عرض 58/80 + `printResultToast` |
| 13 | فشل عملية الدفع | تراجع + لا تعليم كمدفوع |
| 14 | انحدار الميزات الحالية | كل اختبارات `tests/*` تمر |

---

## 9. نطاق العمل (Phase 8)

**يدخل:** `index.html` (قسم الموظفين/الرواتب/التسجيل اليومي فقط) · `assets/report/payroll-report.js` (جديد) · `tests/*` (جديد) · `AI_REPORTS/*`.
**لا يُمس:** `main.js` · `preload.js` · `database.js` · `users.js` · `login.js` · `perm-gate.js` · `permissions.js` · `activation.js` · `update-gate.js` · `electron-builder.yml` · إعدادات GitHub للنشر · `package.json` (الإصدار يبقى 2.5.4).

**لا إصدار ولا نشر** إلا بموافقة صريحة من المستخدم.
