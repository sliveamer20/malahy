# Batch 3 — التقرير — تقوية الترحيل + التحقّق التكاملي

> **التاريخ:** 2026-10-12 · **الإصدار:** `2.5.4` (لم يتغيّر) · **HEAD:** `55a04fb` (لم يتغيّر)
> **الحكم: `PASS`**
> **بيانات الإنتاج: لم تُمَس إطلاقًا.**

---

## 1. النطاق

| الجزء | المطلوب | الحالة |
|---|---|---|
| **A** | إنهاء تقوية الترحيل + توثيق `snapshot()` | ✅ |
| **B** | تحقّق تكاملي طرف-إلى-طرف | ✅ |

**لم يُنفَّذ:** زر تراجع في الواجهة (غير مُعتمد · لم يُضَف).
**لم يُوسَّع النطاق:** `snapshot()` لم يُوصَل — توثيق فقط (انظر §4).

---

## 2. الجزء A — تقوية الترحيل

### 2.1 جرد كل رايات الترحيل (A1)

| العلامة | الموقع | الغرض |
|---|---|---|
| `e.legacySchema` | L787 | إعلان اكتمال المخطط — **مشروط بـ `allHandled`** |
| `e.legacyMigratedAt` | L788 | مرجع زمني لحارس التراجع |
| `e.legacyImport` | L775 | سجل تدقيق ثابت `{days,work,abs,vac,ops,weeksPaid,weeksUnpaid,weeksUnreadable,weeksNoWage}` |
| `w.legacyHandled` | L707 · L723 · L735 · L772 | عولج هذا الأسبوع — **بعد** الاستيراد |
| `w.legacySettled` | L720 | أسبوع مدفوع، لا يدخل الرصيد |
| `w.legacyMigrated` | L771 | تم استيراد أيامه |
| `w.legacyNet` | L722 | **إضافة فقط**، لا تُكتب فوق قيمة قائمة |
| `d.legacyKey` | L745 | رابط اليوم بمصدره |
| `x.legacyId` / `id:'lg_…'` | L756 · L760 | حارس تكرار العمليات |

### 2.2 أنواع الرايات — 5 أنواع، صفر اختراع مالي

| النوع | الموقع | السلوك |
|---|---|---|
| `week-unreadable` | أسبوع بلا بداية قابلة للقراءة | لا استيراد |
| `paid-week-no-snapshot` | أسبوع مدفوع بلا لقطة | لا يدخل الرصيد |
| `paid-week-no-date` | أسبوع مدفوع بلا تاريخ صرف | لا يدخل الرصيد |
| `week-no-wage` | أسبوع بلا أجر محفوظ | **لا استيراد + لا تخمين** |
| `day` (L257) | يوم مفرد في كشف التسوية | عرض فقط |

### 2.3 لا يُفقد ولا يُكرَّر ولا يُختلق (A3)

| الضمانة | الدليل | التأكيدات |
|---|---|---|
| لا حذف لأي أسبوع | لا `delete`/`splice` على `weeks` | `integrity 2p` · `3j` |
| الأسابيع الأصلية مطابقة بايتًا | `finOf` قبل/بعد | `migration 13g` · `integrity 2p, 3j` |
| لا ازدواج في الأيام | حارس `dayRec` | `integrity 2d, 2t` |
| لا ازدواج في العمليات | حارس `legacyId` | `integrity 2j, 2o` |
| صفر تخمين | `week-no-wage` يمنع الاستيراد | `integrity 1p-1t` |
| صفر أثر مالي من الرايات | اختبار الثنائية بعد كل راية | `integrity 4m-4o` |

### 2.4 تكرار وانقطاع وإعادة محاولة (A2)

| السيناريو | النتيجة | التأكيدات |
|---|---|---|
| تكرار كامل | صفر استيراد، حالة متطابقة | `integrity 2m, 2w, 2x` |
| انقطاع بعد 3 أيام من 7 | يُكمل **4** أيام ⇒ 7 بلا تكرار | `integrity 2f-2o` |
| انقطاع تام: أسبوع اكتمل + آخر لم يبدأ | يُستورد 7 ⇒ 14، مفاتيح فريدة | `integrity 2p-2x` |
| ختم مبكّر كاذب | المخطط **لا يُختم**؛ يُعالَج لاحقًا | `integrity 2q, 2r, 2u, 2v` |
| الأسابيع الأصلية بعد دورة انقطاع | مطابقة | `integrity 2p` |

---

## 3. الجزء B — التحقّق التكاملي

### 3.1 المسار المتتبَّع

```
حضور (markDay) → سجل الأيام (days + wage مُجمَّد)
  → الإحصاء (statsUpTo): gross/bonus/pen/adv/ded → outstanding
  → التخطيط (planPayout): covered dayKeys + coveredNet + itemsDiff
  → التنفيذ (applyPayout): settledBy + payouts[]
  → الدفعة (commitBatch): تراجع كامل عند الفشل + retotal
  → التقرير (batchModel / receiptModel)
```
كل حلقة في هذا المسار مُغطّاة بتأكيد جديد في `payroll-e2e.test.js`.

### 3.2 أمثلة مطابقة مالية حقيقية (B2)

**مثال 1 — رصيد جارٍ**
```
5 أيام عمل × 100 + غياب + إجازة
gross 500 → outstanding 500 → دفعة 500 → outstanding 0 → paid 500
إعادة الصرف: saved=0, failed=0 (تخطّي لا فشل) → paid يبقى 500  ✅
```

**مثال 2 — دفعتان جزئيتان حقيقيتان** (لا تعديل يدوي للمبلغ)
```
أيام 1-5 أكتوبر (500). دفعة عند 3 أكتوبر 18:00 تغطّي 3 أيام فقط = 300
  → paid 300 · outstanding 200
دفعة عند 12 أكتوبر تغطّي اليومين المتبقيين فقط = 200
  → work=2 (لا تعيد تغطية اليومين الأولين) · outstanding 0 · paid 500
دفعة ثالثة → saved=0  ✅
```

**مثال 3 — كل أنواع العمليات**
```
gross 400 + مكافأة 50 − جزاء 20 − سلفة 100 − خصم 30 = 300
دفعة = 300 · outstanding 0 · السلفة محفوظة ومختومة بـ settledBy
إعادة الصرف لا تستهلك السلفة مرتين → paid يبقى 300  ✅
```

**مثال 4 — عدة موظفين**
```
A 5×100=500 · B 5×80=400 · C 5×120=600  →  دفعة واحدة 1500
دفعة موظف واحد لا تمسّ الآخرين (500/400/600 ثابتة)  ✅
```

**مثال 5 — ترحيل ← صرف بأجرين مختلفين**
```
أسبوع قديم بأجر 80 (7 أيام = 560) + موظف الآن بأجر 150
يوم جديد بـ 150 → outstanding 710 → دفعة 710 → 0
نموذج 58مم يحمل نفس المجموع 710 · كل بند: coveredNet + itemsDiff = amount  ✅
```

**مثال 6 — تغيير الأجر بعد الصرف**
```
5 أيام × 100 → دفعة 500. ثم dailyWage = 300
paid يبقى 500 · gross يبقى 500 · outstanding = 300 (يوم جديد فقط)  ✅
```

### 3.3 سيناريوهات الفشل (B3)

| السيناريو | النتيجة |
|---|---|
| فشل الحفظ لموظفَين | `saved=0` · كائن لكل موظف **متطابق بايتًا** مع ما قبله · لا `payouts` · المبلغ المقصود يُسجَّل بـ `intendedAmount` والمصروف `amount=0` |
| إعادة المحاولة بعد الإصلاح | `saved=2` · تسوية **مرة واحدة** لكل موظف · لا ازدواج |

### 3.4 صفر كتابة عند الفتح + الصلاحيات (B4 · B5)

| الفحص | الدليل |
|---|---|
| `empMigrate()` بلا أي موقع استدعاء | `index.html:4797` تعريف فقط |
| `empRunMigration()` تُستدعى من بوابة التأكيد فقط | `index.html:4847` |
| الفتح لا يكتب | `gate 1a-1e, 4f, 5c` · `ui 1c, 1p, 9a0, 9a00` |
| بوابة الصلاحيات في شاشة الموظفين | `index.html:5743` · `5945` · `5976` (`employeeManage`) |
| فحص الصلاحية قبل الترحيل | `index.html:4845` + `report 11m` + `gate 5a-5d` |
| مفتاح الدفعات محميّ | `permissions.js` · `report 11h` |
| اختبارات التفويض | `phase3b-auth 62` · `phase3c1-gate 50` · `phase3c2-baseline 66` · `phase3c2-perms 39` — كلها خضراء |

**لم يتغيّر أي سلوك قائم:** كل اختبارات Batch 1 و2 خضراء بلا تعديل.

---

## 4. `snapshot()` — توثيق فقط (A4)

### الحالة الراهنة

`snapshot()` **مُعرَّفة ومُختبَرة** في `database.js:145`، لكنها **غير متّصلة بالواجهة**.

### توصيلها يتطلب 3 تغييرات عبر طبقة IPC — خارج نطاق الرواتب

| # | الملف | التغيير المقترح |
|---|---|---|
| 1 | `database.js` | ✅ **منجَز** — `snapshot(tag)` مع إرجاع المسار |
| 2 | `main.js` | معالج جديد: `ipcMain.on("db-snapshot", …)` مع **حراسة جلسة** (مثل `db-clear` الذي يتطلّب `role==="admin"`) |
| 3 | `preload.js` | `snapshot: (tag) => ipcRenderer.sendSync("db-snapshot", { tag })` |
| 4 | `index.html` | نداء `malahyDB.snapshot('pre-migration')` داخل `empMigrationGate` قبل `empRunMigration()` |

### لماذا لم أنفّذها

1. **توسيع النطاق إلى طبقة IPC والأمان** — و`main.js`/`preload.js` خارج نطاق عمل الرواتب.
2. **حارس أمني إلزامي**: أي معالج جديد يقرأ/يكتب القرص يجب أن يمرّ على `users.getSession()`؛ النسخ الاحتياطي مسار حسّاس.
3. **لا دليل على حاجة عاجلة**: الكتابة الآن ذرّية بـ 3 أجيال + استرجاع مُختبَر (Batch 1). اللقطة_before-ترحيل طبقة حماية ثانية، لا أولى.

> **التوصية:** تعطيل الـ IPC مؤجَّلًا إلى دفعة منفصلة بإذن صريح، بعد المرحلة 5.

---

## 5. الأوامر المُنفَّذة وكود الخروج

```powershell
node tests\payroll-e2e.test.js          # جديد — 89
node tests\payroll-integrity.test.js    # 101
node tests\payroll-db-safety.test.js    # 38
node tests\payroll-migration-gate.test.js # 39
node tests\payroll-migration.test.js    # 139
node tests\payroll-properties.test.js   # 18
node tests\payroll-report.test.js       # 333
node tests\payroll-ui.test.js           # 95
node tests\payroll.test.js              # 222
node tests\phase1-printer-feedback.test.js # 40
node tests\phase3b-auth.test.js         # 62
node tests\phase3b-ipc.test.js          # 15
node tests\phase3c1-dom.test.js         # 37
node tests\phase3c1-gate.test.js        # 50
node tests\phase3c1-ipc.test.js         # 19
node tests\phase3c1-session.test.js     # 30
node tests\phase3c2-baseline.test.js    # 66
node tests\phase3c2-gate.test.js        # 44
node tests\phase3c2-ipc.test.js         # 49
node tests\phase3c2-perms.test.js       # 39
node tests\phase3c3-accounts.test.js    # 92
node tests\phase3c3-ui.test.js          # 76
node tests\phase3c4-recovery.test.js    # 79
node tests\phase4-daily-report.test.js  # 71
$env:PROP_EMP='2500'; $env:PROP_SEED='20261012'; node tests\payroll-properties.test.js
```

## النتائج

| الملف | passed | failed | exit |
|---|---|---|---|
| `payroll-e2e.test.js` **(جديد)** | **89** | 0 | 0 |
| `payroll-db-safety.test.js` | 38 | 0 | 0 |
| `payroll-integrity.test.js` | 101 | 0 | 0 |
| `payroll-migration-gate.test.js` | 39 | 0 | 0 |
| `payroll-migration.test.js` | 139 | 0 | 0 |
| `payroll-properties.test.js` | 18 | 0 | 0 |
| `payroll-report.test.js` | 333 | 0 | 0 |
| `payroll-ui.test.js` | 95 | 0 | 0 |
| `payroll.test.js` | 222 | 0 | 0 |
| `phase1-printer-feedback.test.js` | 40 | 0 | 0 |
| `phase3b-auth.test.js` | 62 | 0 | 0 |
| `phase3b-ipc.test.js` | 15 | 0 | 0 |
| `phase3c1-dom.test.js` | 37 | 0 | 0 |
| `phase3c1-gate.test.js` | 50 | 0 | 0 |
| `phase3c1-ipc.test.js` | 19 | 0 | 0 |
| `phase3c1-session.test.js` | 30 | 0 | 0 |
| `phase3c2-baseline.test.js` | 66 | 0 | 0 |
| `phase3c2-gate.test.js` | 44 | 0 | 0 |
| `phase3c2-ipc.test.js` | 49 | 0 | 0 |
| `phase3c2-perms.test.js` | 39 | 0 | 0 |
| `phase3c3-accounts.test.js` | 92 | 0 | 0 |
| `phase3c3-ui.test.js` | 76 | 0 | 0 |
| `phase3c4-recovery.test.js` | 79 | 0 | 0 |
| `phase4-daily-report.test.js` | 71 | 0 | 0 |

## **المجموع: 1,843 passed · 0 failed · 24 ملفًا · كود خروج 0**

**التسلسل:** Batch 1 = 1,653 · Batch 2 = 1,754 (+101) · Batch 3 = **1,843 (+89)**.
**صفر حذف لأي تأكيد قائم.**

### اختبار الخصائص — 15,444 دفعة
```
payouts=15444 (full=8414 partial=7030)
workdays reported=28379  absence/vacation markers=16992  reported=14992  deferred=2000
OK: 18 passed, 0 failed   exit=0
```
**0 تجاوز · 0 ازدواج · 0 يوم مفقود · 0 تعارض مستند · 0 يوم مذكور مرتين.**

---

## 6. الملفات المُعدَّلة

| الملف | التغيير | السبب |
|---|---|---|
| `tests/payroll-e2e.test.js` | **جديد** — 89 تأكيدًا | التحقّق التكاملي (الجزء B) |

**لم يُعدَّل أي ملف مصدري في هذه الدفعة.** لم يُعدَّل أي اختبار قائم. `payroll-core.js` و`index.html` و`database.js` **كما هما من Batch 2**.

> عملُ Batch 3 كان **تحقّقًا** بالدرجة الأولى، لا تعديلًا — وهذا مقصود: العيوب المُصلَحة في Batch 2 احتاجت **إثباتًا تكامليًا** لا كودًا جديدًا.

---

## 7. العيوب المكتشفة في هذه الدفعة

| # | العيب | الإصلاح |
|---|---|---|
| B3-1 | **اختباران بُنيا خطأً مني**: حرّرت `plan.amount` يدويًا، فتعارض التغطية مع المبلغ ⇒ 6 إخفاقات | أُعيد بناء **دفعة جزئية حقيقية** بدلًا من التلاعب: دفعة وقت 3 أكتوبر تغطّي 3 أيام، والثانية تغطّي يومين |
| B3-2 | `bm.totals.count` غير موجود — العدد في `bm.count` | صُحّح |
| B3-3 | `commitBatch` يُرجع `{ok,batch,results,saved,failed}` لا الدفعة نفسها | صُحّح — وأُضيفت تأكيدات `saved`/`failed` |
| B3-4 | `receiptModel` يُرجع نموذج دفعة، والمبلغ في `b.totals.amount` | صُحّح |
| B3-5 | اسم موظف اعرابي مخلوط (`دiana`) | صُحّح |

> **لم يكن هناك عيب في الكود الإنتاجي في هذه الدفعة.** الإخفاقات الخمسة كانت في **اختباري أنا**، وأُصلحت في الاختبار لا في الكود.

---

## 8. المخاطر المتبقّية وبنود `NOT VERIFIED`

### ❌ بنود `NOT VERIFIED` — لا يمكن إغلاقها برمجيًا

| # | البند | لماذا لا يُغلق |
|---|---|---|
| **NV-1** | **الطباعة الحرارية الفيزيائية** | لم تُطبع **ورقة واحدة** على رول حراري. `Xprinter XP-80` غير متصلة. كل فحوص التقارير HTML/CSS وقياسات متصفح — **لا تُثبت** جودة النقاط العربية ولا قصّ الورق ولا التباعد الفعلي على 58مم |
| **NV-2** | **ترحيل بيانات الإنتاج** | `%APPDATA%\malahy\malahy-data.json` **لم يُفتح ولا يُقرأ ولا يُنسخ**. كل الاختبارات على بيانات اصطناعية — **تُثبت سلوك الكود، لا سلامة بيانات الإنتاج نفسها** |

### ⏳ مؤجَّلة

| # | البند | الحالة |
|---|---|---|
| L5 | **لا زر تراجع في الواجهة** — `rollbackMigration` برمجي فقط | قرار متعمّد، ينتظر موافقتك |
| L6 | `snapshot()` غير موصولة بـ IPC | **موثّق في §4**، لم يُوسَّع النطاق |
| L7 | `tests/phase3c1-gate.test.js:66` محرفان غريبان | **سابقة** لتغييراتي (Batch 1)، لم تُمس |
| L8 | `database.js` نطاقه أوسع من الرواتب | موثّق وموافق عليه (Batch 1) |
| L9 | الرفض عند التراجع بعد دفعة **صارم** | قرار متعمّد: الأمان أهم من المرونة |

---

## 9. تأكيد صريح: بيانات الإنتاج

## ❌ لم تُقرأ بيانات الإنتاج إطلاقًا.

| الفحص | القيمة |
|---|---|
| `%APPDATA%\malahy` LastWriteTime | `10/11/2026 19:59:38` — **لم يتغيّر عبر الدُفعات الثلاث** |
| عدد الملفات | `24` — **نفس خط الأساس** |
| هل عُدّل اليوم؟ | **لا** |
| `malahy-data.json` · `.bak` · `.corrupt-*` | ❌ لم يُفتح · لم يُقرأ · لم يُتجزّأ · لم يُنسخ |
| Electron على بيانات الإنتاج | ❌ **لم يحدث** |
| ترحيل على بيانات حقيقية | ❌ **لم يحدث** |

**ما قُرئ في هذه الدفعة:** `payroll-core.js`، `index.html`، `preload.js`، `main.js`، `database.js`، `permissions.js`، ملفات الاختبارات، التقارير.

**كل بيانات الاختبار اصطناعية بالكامل**، ومعزولة في الذاكرة أو `%TEMP%` مع تحقّق صريح من عدم تطابقها مع مسار الإنتاج.

---

## 10. حالة Git وتأكيد عدم إصدار

```
 M database.js                     (Batch 1)
 M index.html                      (Batch 1)
 M permissions.js                  (Batch 1)
 M tests/phase3b-auth.test.js      (Batch 1)
 M tests/phase3c1-gate.test.js     (Batch 1)
 M tests/phase3c2-baseline.test.js (Batch 1)
?? AI_REPORTS/... (8)
?? assets/payroll/
?? assets/report/payroll-report.js
?? tests/payroll*.test.js (9)      ← +payroll-e2e.test.js
```

| العملية | الحالة |
|---|---|
| `staged` | **فارغ** |
| commit · tag · push · publish | ❌ **لم تُنفَّذ** |
| بناء مثبّت | ❌ **لم يُنفَّذ** |
| `package.json` version | ❌ **`2.5.4`** |
| HEAD | `55a04fb` (**لم يتغيّر**) |
| tags عند HEAD | **لا شيء** |
| `dist/` | `10/11/2026 21:24:39` (**لم يُمس**) |
| `tests/protected-baseline.json` | ❌ **لم يُعدَّل** |
| ترميز | ✅ **0 محرف تالف · 0 CRLF** |

---

## 11. الحكم

# `PASS`

**أساس الحكم:**
1. الترحيل **مُقوّى بالكامل**: 5 أنواع رايات، صفر تخمين، صفر فقد، صفر ازدواج.
2. الانقطاع والتكرار وإعادة المحاولة **مُثبتة** بأربعة سيناريوهات مختلفة.
3. المسار المالي **مُتحقَّق طرفًا لطرف** في 6 أمثلة واقعية.
4. الفشل **لا يترك أثرًا جزئيًا** — تراجع كامل ومُثبت.
5. صفر كتابة عند الفتح + الصلاحيات **سليمة**.
6. **`1,843` تأكيدًا · 0 فشل · 24 ملفًا · exit 0.**
7. **بيانات الإنتاج لم تُمَس.** **لا عمليات إصدار.**

---

## 12. الخطوة التالية

**Batch 4/5 — تقييم الجاهزية النهائي.**

> ⚠️ `NV-1` و`NV-2` يبقيان مفتوحين ولا يمكن إغلاقهما بالاختبارات. **أي تقييم نهائي يجب أن يذكرهما صراحةً كـ `NOT VERIFIED`** ولا يصف المشروع كـ «مُتحقَّق منه» في هذين البندين.