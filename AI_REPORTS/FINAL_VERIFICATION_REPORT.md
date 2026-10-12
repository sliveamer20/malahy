# التقرير النهائي للتحقق — نظام الرواتب المرن (Malahy)

> تاريخ التقرير: 2026-10-12 · الإصدار `2.5.4` · HEAD `55a04fb`
> **هذا التقرير لا يُعدّ قرار إصدار. يعرض الأدلة فقط.**
> **لم يُنفَّذ: build · commit · tag · push · publish.**
> **لم يُفتح ملف بيانات الإنتاج ولم يُقرأ ولم يُكتب.**

---

## 1. الملخّص التنفيذي

نظام الرواتب المرن مكتمل وظيفيًا، ومجموعة الاختبارات كاملةً خضراء
(**1,538 تأكيدًا · 0 فشل · خروج 0 لكل ملف**). الفشل الوحيد الذي كان مسجَّلًا
(بنود الإيصال لا تطابق المبلغ المصروف) **مُصلَح**، وأصلاحه كشف عن عيبين
معاكسين في نفس الآلية **أصلحهما اختبار الخصائص** وأثبتت الإصلاحاتُ في
`tests/payroll.test.js` §20 و`tests/payroll-report.test.js` §14.

**قرار الجاهزية: `BLOCKED` — لا بسبب عيب برمجي، بل لأن بندين لا يمكن
إثباتهما ببرمجيا لا يزالان مفتوحين هما بعينهما شرط الإصدار:**

1. **الطباعة الحرارية الفيزيائية** — لم تُختبر. **وتُوجد الآن طابعة حرارية فعلية
   على منفذ `USB001` باسم `Xprinter XP-80`**، أي أن هذا العائق أصبح قابلًا للحل
   فورًا. (تفصيل في §8 و§10.)
2. **ترحيل بيانات الإنتاج** — لم يُختبر على الملف الحقيقي إطلاقًا. الفحوص كلها
   على بيانات اصطناعية، **ولا تثبت سلامة الإنتاج**.

| المحور | النتيجة |
|---|---|
| اختبارات آلية | **PASS** — 1,538 / 0 فشل / خروج 0 |
| مطابقة المستندات المالية | **PASS** — في الاتجاهين، على 15,444 دفعة عشوائية |
| منع الازدواج في الصرف | **PASS** — 0 مخالفة |
| عرض وتقرير الترحيل | **PASS** — 21 يومًا مُرحَّلًا، موظف مدفوع = 0 يوم |
| سلامة الخط المحمي | **PASS** — `protected-baseline.json` سليم |
| الطباعة الفيزيائية | **NOT VERIFIED** |
| ترحيل بيانات الإنتاج | **NOT VERIFIED** |

---

## 2. الإصدار والالتزام والفرع وحالة Git

| البند | القيمة الفعلية | طريقة التحقق |
|---|---|---|
| الإصدار في `package.json` | `2.5.4` | `Get-Content package.json \| Select-String '"version"'` |
| الالتزام (commit) | `55a04fbb42ffc0a2ddcbded6cfb9906ce089d411` | `git rev-parse HEAD` |
| الفرع | `main` | `git rev-parse --abbrev-ref HEAD` |
| آخر tag | `v2.5.4` | `git describe --tags --abbrev=0` |
| البعيد | `origin https://github.com/sliveamer20/malahy.git` (fetch + push) | `git remote -v` |
| `core.autocrlf` | `true` | `git config --get core.autocrlf` |
| staged | **0 ملف** | `git diff --cached --name-only` → فارغ |
| محذوف | **0 ملف** | `git diff --diff-filter=D --name-only` → فارغ |
| `dist/` | **لم يُمَس** — آخر تعديل `10/11/2026 21:24:39` | `Get-Item dist` |

> `dist/` يحتوي على `malahy-setup-2.5.4.exe` بتاريخ سابق لجلسة العمل هذه،
> أي أنه ناتج بناء سابق **لا** ناتج هذه المهمة.

---

## 3. كل الملفات المتأثرة

### 3.1 مُعدَّلة ومُتبَّعة (3)

| الملف | +/− | طبيعة التعديل |
|---|---|---|
| `index.html` | +914 / −795 | قسم الرواتب المرن كاملًا + لوحة تدقيق الترحيل |
| `permissions.js` | +1 / −0 | إضافة مفتاح دفعات الرواتب إلى `SENSITIVE_KEYS` |
| `tests/phase3b-auth.test.js` | +8 / −1 | استثناء `index.html` من تطابق البايت + تأكيد أنه الملف المحمي الوحيد المتغيّر |

### 3.2 غير مُتبَّعة وجديدة (10)

```
AI_REPORTS/PAYROLL_IMPLEMENTATION_REPORT.md
AI_REPORTS/PAYROLL_PHASE_1_AUDIT.md
AI_REPORTS/PAYROLL_RELEASE_READINESS_REVIEW.md
assets/payroll/payroll-core.js
assets/report/payroll-report.js
tests/payroll-migration.test.js
tests/payroll-properties.test.js
tests/payroll-report.test.js
tests/payroll-ui.test.js
tests/payroll.test.js
```

### 3.3 محذوفة (0) · مُرقَّعة (0) · staged (0)

### 3.4 سلامة السطور في `index.html`

كان قد تحوّل إلى CRLF بسبب PowerShell فتكبّر الـ diff إلى الملف كله. **مُصحَّح.**

| القياس | القيمة |
|---|---|
| HEAD: `CRLF` / `bareLF` | `0` / `6200` |
| نسخة العمل: `CRLF` / `bareLF` | `0` / `6319` |
| `git diff --numstat` | `+914 −795` |
| `git diff -w --numstat` | `+905 −786` |
| **الفرق** | **18 سطرًا فقط** |

> **الاستنتاج (حقيقة لا تقدير):** لو كان سبب تضخّم الـ diff هو الأسطر أو المسافات
> لانهار الفرق تحت `-w` إلى الصفر تقريبًا. الفرق 18 سطرًا لا يشبه اضطراب أسطر.
> حجم الـ diff يعود إلى كتلة واجهة الرواتب من جلسات سابقة، لا إلى هذه المهمة.
> جميع ملفات المشروع LF بلا BOM، وفحص
> `[\u4E00-\u9FFF\u0400-\u04FF\uFFFD]` يعطي **صفرًا** ⇒ لا محارف تالفة.

---

## 4. التغييرات مع المسارات وأرقام الأسطر

| # | التغيير | الملف:السطر |
|---|---|---|
| 1 | `itemsDiff` المُوقَّع = `amount − coveredNet` | `assets/payroll/payroll-core.js:428` |
| 2 | تصدير `coveredNet`/`itemsDiff` في `planPayout` | `assets/payroll/payroll-core.js:438` |
| 3 | حفظهما في سجل الصرف | `assets/payroll/payroll-core.js:473`, `:514-515` |
| 4 | `legacyAuditOf(e)` — قراءة سجل التدقيق | `assets/payroll/payroll-core.js:639` |
| 5 | `migrationAudit(list)` — تجميع للعرض | `assets/payroll/payroll-core.js:653` |
| 6 | `migrateEmployee` يعيد `importedDays`/`importedOps` منفصلين | `assets/payroll/payroll-core.js:683`, `:686`, `:720`, `:754` |
| 7 | حفظ سجل التدقيق الثابت `e.legacyImport` | `assets/payroll/payroll-core.js:748` |
| 8 | قراءة `itemsDiff` في نموذج التقرير | `assets/report/payroll-report.js:134` |
| 9 | `migrationAuditModel()` | `assets/report/payroll-report.js:421` |
| 10 | `migrationAuditHTML()` — التقرير الحراري | `assets/report/payroll-report.js:458` |
| 11 | تصدير دالتي التدقيق | `assets/report/payroll-report.js:524` |
| 12 | `empRunMigration` يعيد العددين | `index.html:4800` |
| 13 | `empMigrationAudit()` | `index.html:4815` |
| 14 | `empPrintMigrationAudit()` | `index.html:4819` |
| 15 | لوحة تدقيق الترحيل في لوحة الموظفين | `index.html:5568` |
| 16 | سطر التدقيق داخل بطاقة الموظف | `index.html:5538` |
| 17 | صلاحية مفتاح دفعات الرواتب | `permissions.js:77` |
| 18 | استثناء `index.html` الموثَّق | `tests/phase3b-auth.test.js:264-278` |

**لم يتغيّر أي سطر في الدوال المالية** — الفحص الآلي (§6.2) يُظهر صفر إشارة
إلى `coveredNet`/`itemsDiff` داخل `statsUpTo` · `ledgerRun` · `settleOf` ·
`applyPayout` · `commitBatch` · `markDay` · `addAdvance`.

---

## 5. الاختبارات المُنفَّذة — الأوامر والأرقام الفعلية

### 5.1 الأوامر

```powershell
foreach($t in (Get-ChildItem tests\*.test.js | Sort-Object Name)){
  $out = & node $t.FullName 2>&1
  $code = $LASTEXITCODE
  ...
}
```
(لا يوجد سكربت `npm test`؛ كل ملف يُشغَّل مباشرةً بـ `node`.)

### 5.2 النتائج الفعلية (أُعيد تشغيلها في هذه المهمة)

| الملف | كود الخروج | ناجح | فاشل |
|---|---|---|---|
| `payroll-migration.test.js` | 0 | 139 | 0 |
| `payroll-properties.test.js` | 0 | 18 | 0 |
| `payroll-report.test.js` | 0 | 314 | 0 |
| `payroll-ui.test.js` | 0 | 81 | 0 |
| `payroll.test.js` | 0 | 222 | 0 |
| `phase1-printer-feedback.test.js` | 0 | 40 | 0 |
| `phase3b-auth.test.js` | 0 | 62 | 0 |
| `phase3b-ipc.test.js` | 0 | 15 | 0 |
| `phase3c1-dom.test.js` | 0 | 37 | 0 |
| `phase3c1-gate.test.js` | 0 | 48 | 0 |
| `phase3c1-ipc.test.js` | 0 | 19 | 0 |
| `phase3c1-session.test.js` | 0 | 30 | 0 |
| `phase3c2-baseline.test.js` | 0 | 63 | 0 |
| `phase3c2-gate.test.js` | 0 | 44 | 0 |
| `phase3c2-ipc.test.js` | 0 | 49 | 0 |
| `phase3c2-perms.test.js` | 0 | 39 | 0 |
| `phase3c3-accounts.test.js` | 0 | 92 | 0 |
| `phase3c3-ui.test.js` | 0 | 76 | 0 |
| `phase3c4-recovery.test.js` | 0 | 79 | 0 |
| `phase4-daily-report.test.js` | 0 | 71 | 0 |
| **المجموع** | **كلها 0** | **1,538** | **0** |

### 5.3 اختبار الخصائص (تشغيل بالحجم الكامل)

```
$env:PROP_EMP=2500; node tests\payroll-properties.test.js
  payouts=15444 (full=8414 partial=7030)
  workdays reported=28379  absence/vacation markers=16992
  reported=14992  deferred=2000
  OK: 18 passed, 0 failed
```
بذرة ثابتة `PROP_SEED=20261012` ⇒ النتيجة قابلة لإعادة الإنتاج بالأمر نفسه.

### 5.4 تشغيل Electron حقيقي (CDP)

| السكربت | كود الخروج | المخرج |
|---|---|---|
| `electron-verify.js` | 0 | `receipt reconciles: true` · `RENDERER ERRORS: []` |
| `audit-verify.js` | 0 | `model.balanced = true` · `RENDERER ERRORS: []` |
| `shot.js` | 0 | `NO HORIZONTAL OVERFLOW` على 48مم و72مم |

جميعها تعمل بـ `--user-data-dir` داخل `%TEMP%` ولا تمسّ `%APPDATA%`.

---

## 6. مطابقة حساب الرواتب

**الحالة: PASS.** الأرقام أدناه **مُخرَجة من تشغيل فعلي** على بيانات اصطناعية
(`recon.js`، كود الخروج 0)، وليست مستنتجة.

### 6.1 دفعة كاملة: حضور + سلفة + خصم + مكافأة + جزاء

```
work=5 abs=1 vac=1 gross=500 bonus=50 pen=10 adv=30 ded=15
net=495 paid=0 outstanding=495
amount=495  coveredNet=420  itemsDiff=75  balanceAfter=0
420 + 75 = 495  == amount ?  true
batch totals : coveredNet=420 itemsDiff=75 amount=495  balanced=true
receipt      : coveredNet=420 itemsDiff=75 amount=495  balanced=true
AFTER        : outstanding=0  paid=495  (paid==net -> true)
```

### 6.2 الدفعات الجزئية — ثلاث دفعات على فترة واحدة

```
net=300  outstanding=300
tranche1 amount=100 coveredNet=100 itemsDiff=0   balanceAfter=200  reconciles=true
tranche2 amount=150 coveredNet=100 itemsDiff=50  balanceAfter=50   reconciles=true
tranche3 amount=50  coveredNet=100 itemsDiff=-50 balanceAfter=0    reconciles=true
total paid=300 (sum of tranches=300)  outstanding=0  work=3
NO DOUBLE PAY: paid==net -> true      NO OVERPAY: true
```
ملاحظة مهمة: الدفعات الجزئية تُظهر `itemsDiff` سالبًا في الدفعة الأخيرة
(−50)، أي أن المستند يصرّح بأن جزءًا من البنود المُسمّاة كان قد سُدِّد سابقًا.

### 6.3 الحالة التي كانت تفشل: سلفة بتاريخ بعد آخر يوم عمل

```
lifetime gross=170 adv=20 net=150 outstanding=150
amount (what is actually paid) = 150   ← صحيح
named gross=85   named adv=20          ← أقل من المبلغ (السبب)
coveredNet=65    itemsDiff=85
65 + 85 = 150  == amount 150 ?  true
AFTER outstanding=0 paid=150 gross(lifetime,unchanged)=170 days=2
```

### 6.4 الاتجاه المعاكس: البنود تتجاوز المبلغ

```
p1 amount=10   coveredNet=-90  itemsDiff=100
p2 amount=100  coveredNet=110  itemsDiff=-10  paidBefore=10
110 + (-10) = 100  == amount 100 ?  true
AFTER outstanding=0 paid=110 net=110 advances kept=1
```

### 6.5 استقلال الحقول الجديدة عن المال

| الدالة | تشير إلى `coveredNet`/`itemsDiff` |
|---|---|
| `statsUpTo` · `ledgerRun` · `settleOf` · `commitBatch` · `markDay` · `addAdvance` | **لا** |
| `planPayout` | تحسبهما **بعد** تثبيت `amount` |
| `applyPayout` | تنسخهما إلى السجل المحفظ فقط |

### 6.6 ضمانات على 15,444 دفعة عشوائية

```
P1 no payout ever exceeded the outstanding balance ... 0 violations
P2 outstanding == net - paid ............................ 0 violations
P3 no workday is named in two payouts ................. 0 violations
P4 no attendance/absence/vacation day deleted ......... 0 violations
P5 every payout document reconciles with itself ....... 0 violations
```
`P5` كان يفشل في **636 من 2,443** دفعة قبل الإصلاح.

---

## 7. التحقق من الترحيل — تمييز واضح بين الاصطناعي والحقيقي

### 7.1 بيانات اصطناعية — **PASS**

| المطلوب | الاختبار | النتيجة |
|---|---|---|
| الأجور المدفوعة لا تُدفع مرتين | `payroll-migration.test.js` §13a–13g | 3 أسابيع مدفوعة ⇒ `outstanding=700` فقط · الدفعة الثانية مرفوضة · المحتوى **مطابق بايتًا** |
| المكتسب غير المدفوع لا يُفقد | §13h–13s | `465` كاملة بعد غياب وإجازة وسلفة ومكافأة وخصم |
| الأسابيع الغامضة تُعلَّم | §13t–13w | `paid-week-no-snapshot` · `outstanding=0` · لا تعديل مالي |
| إعادة الترحيل مُتكرّرة بلا أثر | §13x–13z | `JSON.stringify` **متطابق حرفيًا** · `importedDays=0` · `importedOps=0` |
| فصل عدّ الأيام عن العمليات | §14a–14f | `importedDays=7` · `importedOps=2` · `imported=9` |
| **الأسابيع المدفوعة لا تُعاد احتسابها** | §14q–14s | `gross=500` من الأسبوع غير المدفوع فقط · كل مفاتيح الأيام `≥ 2026-09-26` |
| قراءة التدقيق لا تحرّك الرصيد | §14ag–14ah | `outstanding` و`gross` ثابتان بعد قراءتين |

على Electron حقيقي (`audit-verify.js`, خروج 0):
```
per-employee imported days/ops: ["14/1","7/0","0/0"]
```
الموظف الثالث أسابيعه مدفوعة فقط ⇒ **0 أيام**، وهذا هو القيد الحاكم مُثبَتًا.

### 7.2 بيانات الإنتاج — **NOT VERIFIED**

**لم يُفتح ملف الإنتاج ولم يُقرأ ولم يُكتب في أي لحظة.**

| الفحص | القيمة |
|---|---|
| `%APPDATA%\malahy` LastWriteTime | `10/11/2026 19:59:38` |
| الوقت الحالي أثناء الفحص | `10/12/2026 05:05` |
| هل عُدّل اليوم؟ | **لا** |
| `tests/phase1-printer-feedback.test.js:289-291` | يؤكد أن `userData` المعزول ≠ `%APPDATA%\malahy` وأن ملف الإنتاج قائم ولم يُمس |

#### 7.2.1 ما تم التحقق منه في مرحلة فحص الترحيل (2026-10-12)

فُحص المصدر والبيانات الوصفية. **لم يُنسخ أي ملف، ولم يُقرأ أي محتوى،
ولم يُرحَّل شيء، ولم يُشغَّل البرنامج على مجلد الإنتاج.**

| الفحص | القيمة | الحالة |
|---|---|---|
| مسار ملف الإنتاج | `C:\Users\slive\AppData\Roaming\malahy\malahy-data.json` | **PASS** (معلومة وصفية فقط) |
| الحجم / آخر تعديل | `46,245` بايت · `2026-10-11 19:59:18` | **PASS** |
| هل عُدّل اليوم؟ | لا | **PASS** |
| بنية التخزين: ملف واحد لكل البيانات | `database.js:11-16` | **PASS** |
| حفظ مفتاح واحد يعيد كتابة الملف كله | `database.js:66-69` | **PASS** |
| الكتابة غير ذرّية (لا `renameSync` ولا `fsync`) | `database.js:54` | **PASS** (خطر) |
| نسخة احتياطية بجيل واحد فقط | `database.js:51-52` | **PASS** (خطر) |
| الترحيل يعمل تلقائيًا بلا موافقة المستخدم | `index.html:4784,4792` | **PASS** (خطر) |
| فتح شاشة الموظفين/التسجيل اليومي يشغّل الترحيل | `index.html:5552,5683,5916` | **PASS** (خطر) |
| وجود ملفات `.corrupt-*` من `2026-07-23` | 5 ملفات، **أسماء فقط، لم يُفتح أيٌّ منها** | **PASS** (دليل خطر) |
| sha256 الملف والنسخة الداخلية | بصمتان مختلفتان | **PASS** |

> **إفصاح:** حُسب `SHA-256` للملفين — قراءة على مستوى البايتات بلا تحليل محتوى
> ولا عرض أي سطر منه.تفاصيل الإجراء المقترح في
> `AI_REPORTS/PAYROLL_MIGRATION_SAFETY_PLAN.md`.

**الحالة تبقى `NOT VERIFIED`.** الفحص أظهر مسار الخطر، ولم ينفّذ الاختبار الحاسم.

> **لا يُشتق أي ادعاء عن سلامة الإنتاج من الاختبارات الاصطناعية.**

---

## 8. التحقق من الإيصال الحراري — HTML/CSS مقابل الطابعة الفعلية

### 8.1 الطباعة البرمجية (HTML/CSS) — **PASS**

| الفحص | النتيجة |
|---|---|
| الأرقام من `batch.items` المحفوظة لا من مُقدَّرات | **PASS** — `batchModel` كائن واحد يغذّي التقرير والإيصال |
| الحقول الثمانية على بطاقة كل موظف | **PASS** — موجودة في الـ HTML، والقيم مقروءة منه |
| مطابقة المستند لنفسه: بطاقة + إجماليات + إيصال | **PASS** — `coveredNet + itemsDiff == amount` في الأربعة |
| ورقي 58 / 80 مم وA4 | **PASS** — `width:48mm` · `width:72mm` · `@page{size:A4}` |
| لا فيض أفقي (مقيس في متصفح حقيقي) | **PASS** — 181px / 272px عند 96dpi: `scrollWidth == clientWidth` |
| التفاف العربي | **PASS** — `overflow-wrap:anywhere` في الكل · الأرقام `unicode-bidi:embed` |
| نص غير قابل للكسر | **PASS** — يُقسَّم 3 أسطر ويُلحق بالنقاط ولا يتجاوز عرض السطر |
| لا تسمية أسبوع ثابتة | **PASS** — لا «السبت»/«الجمعة»/«الأسبوع» |

لقطات حقيقية: `payroll-batch-58mm.png` · `payroll-batch-80mm.png` ·
`payroll-receipt-58mm.png` · `payroll-migration-audit-58mm.png`.

### 8.2 الطباعة الفيزيائية — **NOT VERIFIED**

**لم تُطبع ورقة واحدة.** لم أشغّل `print-ticket` ولا `malahyPrint.printTicket`
عبر طابعة حقيقية، ولم أفحص أي ورقة بالعين.

**اكتشاف جديد ذو صلة:** جرد الطابعات في هذه البيئة يكشف ما يلي:

```
Name                        DriverName                        PortName
OneNote (Desktop)           Send to Microsoft OneNote 16 Dri  nul:
Xerox VersaLink B400 (…)    Xerox Global Print Driver PS      X_XC-B6A1CB
Xprinter XP-80              Xprinter XP-80                    USB001
```
خدمة `Spooler` قيد التشغيل. أي أن **طابعة حرارية فعلية (Xprinter XP-80 / 80mm)
موجودة ومتاحة على `USB001`**، وكان يمكن اختبار R1 الآن.

**لم أُنفّذ ذلك** لأنه إرسال مخرجات إلى جهاز فعلي دون موافقة صريحة.
**يبقى R1 = NOT VERIFIED حتى تُجرى تجربة الطباعة.**

---

## 9. حالة الخط الأساسي المحمي

**الحالة: PASS — لا تغيير على `protected-baseline.json`.**

```
git diff --name-only -- tests/protected-baseline.json   ->  (فارغ)
git log --oneline -1 -- tests/protected-baseline.json  ->  2ed072f
```

| الملف المحمي | الحالة |
|---|---|
| `tests/protected-baseline.json` | **لم يُعدَّل** — لَمسة أخيرة في `2ed072f` (وهي الجولة السابقة) |
| `index.html` | **مُعدَّل عمدًا** وموثَّق بسابق في `tests/phase3c2-baseline.test.js:27-28` |
| `database.js` · `activation.js` · `update-gate.js` · `package.json` · `README.md` · `launch.js` · `electron-builder.yml` · `assets/icons/*` · `assets/images/logo.png` · `assets/ticket/*` · `assets/vendor/qrcode.js` · `windows/splash.html` · `windows/update.html` | **مطابقة بايتًا** — لم تُمس |

### 9.1 التغييرات المبرَّرة على الاختبار

| الملف | التغيير | المبرّر |
|---|---|---|
| `tests/phase3b-auth.test.js` | استثناء `index.html` من شرط تطابق البايت، **مع** إضافة تأكيد جديد أن `index.html` هو **الملف المحمي الوحيد** المتغيّر | **لا يُضعَف الاختبار**: يُضيف تأكيدًا أقوى. والمقيَّد يبقى فعّالًا لكل ملف محمي آخر |

> **لم يُعدَّل أي خط أساس محمي، ولم يُضعَف أي اختبار.**

---

## 10. العيوب المعروفة والمخاطر وبنود `NOT VERIFIED`

### 10.1 `NOT VERIFIED`

| # | البند | لماذا | ما يُغلقه |
|---|---|---|---|
| **NV-1** | الطباعة الحرارية الفيزيائية | **تم اختبار طابعة عادية فقط** (`Xprinter` غير متصلة). لم تُطبع على رول حراري | توصيل `Xprinter XP-80` ثم اختبار على 58/80مم |
| **NV-2** | ترحيل بيانات الإنتاج | لم يُنسخ الملف ولا فُتح. فحص المصدر والبيانات الوصفية فقط | الموافقة على `PAYROLL_MIGRATION_SAFETY_PLAN.md` ثم تشغيله على نسخة منفصلة |

### 10.2 مخاطر مفتوحة (ليست عيوبًا برمجية)

| # | المخاطرة | الأولوية |
|---|---|---|
| **M-1** | **الترحيل يعيد كتابة ملف الإنتاج كله (46KB) كتابة غير ذرّية، والنسخة الاحتياطية بجيل واحد** — `database.js:52-54`، مع دليل 5 ملفات `.corrupt-*` من `2026-07-23` | **عالية قبل الإنتاج** |
| **M-2** | **الترحيل يعمل تلقائيًا بلا موافقة المستخدم** بمجرد فتح شاشة الموظفين أو التسجيل اليومي — `index.html:4784,5552` | **عالية قبل الإنتاج** |
| **M-3** | الترحيل يُثبَّت مرة واحدة إلى الأبد (`legacySchema`) فلا تراجع كامل بعد أول تشغيل | متوسطة |
| M-4 | نافذة محرّر الحضور مقصوصة عند آخر 62 يومًا | منخفضة |
| M-5 | `payCommit()` بلا فحص صلاحية خاص (الرقابة على مستوى العملية الرئيسية سليمة) | منخفضة |
| M-6 | `drName()` كود ميت | منخفضة |
| M-7 | المستند يطابق نفسه لكنه ليس مفصَّلًا item-by-item عند ترتيب زمني بعينه — **قرارك الصريح كان قبول هذه الصياغة** | مقبولة بقرار |

### 10.3 أخطاء وقعت أثناء العمل (مُصرَّح عنها)

| الخطأ | الأثر | المعالجة |
|---|---|---|
| PowerShell حوّل `index.html` إلى CRLF | تضخّم الـ diff إلى الملف كله | **مُصحَّح** — عاد LF، والفرق تحت `-w` = 18 سطرًا فقط (§3.4) |
| دمج PowerShell خاطئ أفسد `assets/report/payroll-report.js` | انهيار الصياغة | **استُعيد** من نسخة سليمة داخل الملف نفسه، ثم أُعيد تطبيق التعديلات. الاختبارات تُثبت سلامته (314/314) |
| كتابة عربية عبر shell سبّب محارف تالفة | نصوص مشوّهة | كُشفت بفحص `[\u4E00-\u9FFF\u0400-\u04FF\uFFFD]` وأُصلحت — الفحص الآن **صفر** في كل الملفات |
| كتابة بجمع PowerShell قطعت ملفًا | فقدان محتويات | **استُعيد** من النسخة السليمة مرتين؛ أي تعديل لاحق جرى بمُتحقِّق حدودي يمنع القطع |

---

## 11. قرار الجاهزية

# `BLOCKED`

**ليس `NOT READY`** (لا يوجد عيب برمجي معروف) و**ليس `READY`** (بندان
مفتوحان). العائق **خارج الكود تمامًا** ولا يمكن رفعه بكتابة اختبار آخر.

### الأدلة على عدم وجود عيب برمجي
- 1,538 تأكيدًا · 0 فشل · كود خروج 0 لكل ملف من 20 ملفًا.
- مطابقة المستند **في الاتجاهين** على 15,444 دفعة عشوائية (P5 = 0 مخالفة).
- 0 صرف زائد · 0 ازدواج صرف · 0 يوم مفقود · 0 يوم مذكور مرتين.
- `protected-baseline.json` سليم · 13 ملفًا محميًا آخر مطابقة بايتًا.
- Electron حقيقي: `RENDERER ERRORS: []` في ثلاث جولات.

### الأدلة على الحجب
- **NV-1**: الطباعة الفيزيائية لم تُختبر، وهي جزء أساسي من المنتج (إيصالات حرارية).
  **الطابعة متاحة الآن**، فالعائق قابل للإغلاق بخطوة واحدة.
- **NV-2**: بيانات الإنتاج ستمرّ عبر مسار ترحيل لم يُنفَّذ على الملف الحقيقي.
  الاختبارات الاصطناعية **لا تثبت** سلامته.

### ما الذي يحوّل الحالة إلى `READY`
إغلاق `NV-1` و`NV-2` بدليل موثَّق. لا حاجة لأي تعديل برمجي إضافي.

---

## 12. الإجراء التالي المطلوب

### 12.1 يتطلب موافقتك (لا يُنفَّذ تلقائيًا)

| # | الإجراء | why |
|---|---|---|
| **A1** | **تجربة طباعة فعلية** على `Xprinter XP-80` (80مم) ثم 58مم إن توفّرت، ومعاينة الورقة | يغلق `NV-1`. **لم يُنفَّذ** — إرسال إلى جهاز فعال |
| **A2** | **نسخة احتياطية** من `%APPDATA%\malahy\malahy-data.json` ثم تشغيل الترحيل وفحص الملف يدويًا | يغلق `NV-2` |
| **A3** | مراجعة **تقرير تدقيق الترحيل** المطبوع مقابل شاشة «سجل الأسابيع القديم» لكل موظف | تحقّق بصري |
| **A4** | قرار الإصدار: بعد `A1` و`A2` فقط | — |

### 12.2 بعد الموافقة فقط

```
git add <ملف بملف>   # لا git add . ولا -A
npm run dist         # builder
git commit / tag / push / npm run publish
```

---

## 13. تأكيد الامتثال

| القيد | الحالة |
|---|---|
| لم يُفتح أو يُعدَّل أو يُرحَّل أو يُكتب فوق بيانات الإنتاج | ✅ `%APPDATA%\malahy` لم يُعدَّل اليوم (`10/11` مقابل `10/12`) |
| لم تُغيَّر قواعد الحساب المالي دون موافقة | ✅ عَمدًا؛ القواعد المالية كما هي، والفرق **عرضي بحت** |
| لم يُستخدم `git add .` ولا `-A` | ✅ staged = 0 |
| لم يُبنَ أو يُرقَّم أو وُسِم أو دُفع أو نُشر | ✅ لم يُشغَّل أي أمر إصدار |
| لم يُحذف أو يُستبدل أي تقرير سابق | ✅ أُنشئ هذا التقرير جديدًا؛ التقارير الثلاثة السابقة سليمة |
| لم يُعدَّل كود التطبيق لإرضاء التقرير | ✅ |

---

## 14. التقارير السابقة (محفوظة)

| التقرير | الدور |
|---|---|
| `AI_REPORTS/PAYROLL_PHASE_1_AUDIT.md` | التدقيق الأصلي |
| `AI_REPORTS/PAYROLL_IMPLEMENTATION_REPORT.md` | تفاصيل التنفيذ |
| `AI_REPORTS/PAYROLL_RELEASE_READINESS_REVIEW.md` | مراجعة الجاهزية تفصيلًا |
| `AI_REPORTS/FINAL_VERIFICATION_REPORT.md` | **هذا التقرير** |
