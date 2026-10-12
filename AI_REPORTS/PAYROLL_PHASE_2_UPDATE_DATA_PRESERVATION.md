# المرحلة 2 — حفظ البيانات عند التحديث التلقائي

> **التاريخ:** 2026-10-12 · **الإصدار:** `2.5.4` · **HEAD:** `55a04fb`
> **نوع المرحلة:** فحص + اختبار انحدار. **لم يُعدَّل أي ملف مصدري.**
HEAD    : 55a04fbb42ffc0a2ddcbded6cfb9906ce089d411

---

# الحالة النهائية: `PASS`

> **لا يوجد خطر فقدان بيانات عند التحديث التلقائي.**
> هذا **مُثبت بدليل من شيفرة المصدر** لا بالاعتماد على الذاكرة — والحماية بثلاث طبقات مستقلة.

---

## 1. خط الأساس عند البدء

```
branch  : main
HEAD    : 55a04fbb42ffc0a2ddcbded6cfb9906ce089d9906ce089d411 → 55a04fbb42ffc0a2ddcbded6cfb9906ce089d411
version : 2.5.4
staged  : none
```

### `git status --porcelain` (عند البدء)

| النوع | الملفات |
|---|---|
| ` M` | `database.js` · `index.html` · `permissions.js` · `tests/phase3b-auth.test.js` · `tests/phase3c1-gate.test.js` · `tests/phase3c2-baseline.test.js` |
| `??` | `assets/payroll/` · `assets/report/payroll-report.js` · `tests/payroll*.test.js` (9) · `AI_REPORTS/*.md` (10) |

**لم يتغيّر شيء عن نهاية المرحلة 1.**

---

## 2. الملفات ومسارات التحديث المفحوصة

| الملف / المسار | الدور | الحالة |
|---|---|---|
| `main.js` (L432–L510 · L614–L651) | ربط `autoUpdater` · `quitAndInstall` · بوابة التحديث | ✅ |
| `update-gate.js` | بوابة التحديث الإلزامي (منطق نقي) | ✅ |
| `electron-builder.yml` (nsis · `deleteAppDataOnUninstall`) | إعداد الحذف عند إلغاء التثبيت | ✅ |
| `node_modules/electron-updater/out/NsisUpdater.js` | **أمر التثبيت الفعلي** | ✅ |
| `node_modules/electron-updater/out/BaseUpdater.js` | `quitAndInstall → install()` | ✅ |
| `node_modules/app-builder-lib/templates/nsis/uninstaller.nsh` | **منطق حذف البيانات** | ✅ |
| `node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh` | تمرير الوسائط | ✅ |
| `node_modules/app-builder-lib/templates/nsis/common.nsh` | `isUpdated` · `startAppArgs` | ✅ |
| `node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js` | توليد `DELETE_APP_DATA_ON_UNINSTALL` | ✅ |
| `database.js` · `index.html` · `permissions.js` | تحديد مجلد البيانات الحقيقي | ✅ |

---

## 3. الدليل: كيف يختلف إلغاء التثبيت عن التحديث التلقائي

### 3.1 منطق الحذف — `uninstaller.nsh:216-248`

```nsis
Var /GLOBAL isDeleteAppData
StrCpy $isDeleteAppData "0"                    ; ① الافتراضي: لا حذف

${GetOptions} $R0 "--delete-app-data" $R1
${if} ${Errors}                               ; ② الوسيط غير موجود
  !ifdef DELETE_APP_DATA_ON_UNINSTALL
    ${ifNot} ${isUpdated}                     ; ③ ولسنا في تحديث
      StrCpy $isDeleteAppData "1"             ; ④ ⇒ احذف
    ${endif}
  !endif
${else}
  StrCpy $isDeleteAppData "1"                 ; ⑤ طلب صريح ⇒ احذف
${endIf}

${if} $isDeleteAppData == "1"
  RMDir /r "$APPDATA\${APP_FILENAME}"
  RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
${endif}
```

### 3.2 جدول القرار

| السيناريو | `isUpdated` | `--delete-app-data` | `isDeleteAppData` | النتيجة |
|---|---|---|---|---|
| **تحديث تلقائي** | ✅ | ❌ | **`0`** | 🟢 **البيانات تُحفظ** |
| **إلغاء تثبيت عادي** | ❌ | ❌ | **`1`** | 🔴 بيانات محذوفة — **مقصود** |
| طلب صريح بالمعلَمة | — | ✅ | **`1`** | 🔴 بيانات محذوفة |

### 3.3 إسناد `isUpdated = true` — **طبقتان مستقلتان**

**الطبقة ① — electron-updater (JavaScript)**
```js
// node_modules/electron-updater/out/NsisUpdater.js:107
const args = ["--updated"];        // ← تُمرَّر دائمًا، بلا استثناء
```

**الطبقة ② — مثبّت electron-builder نفسه (NSIS)**
```nsis
; node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh:202-207
${if} ${isDeleteAppData}
  StrCpy $0 "$0 --delete-app-data"
${else}
  # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL
  # is defined, user data will be not removed
  StrCpy $0 "$0 --updated"         ; ← طبقة ثانية مستقلة تمامًا
${endif}
```

> **حتى لو فشلت طبقة ① لسبب ما، تُغلقها طبقة ②.** وهذا تعليق electron-builder نفسه في مصدره.

**الطبقة ③ — تأكيد موثَّق:** `common.nsh:125` `StrCpy $startAppArgs "--updated"` · `common.nsh:114` `${if} ${isUpdated}` → `Abort` (يتخطّى مسار التثبيت المبكر).

### 3.4 المسار الفعلي من التنزيل إلى إعادة التشغيل

```
checkForUpdates()            main.js:525 / 632
  → autoDownload = true      main.js:493  (تنزيل تلقائي)
  → "update-downloaded"      main.js:500
  → autoUpdater.quitAndInstall()  main.js:506 / 651
      → BaseUpdater.quitAndInstall()  →  this.install()
          → NsisUpdater.executeDownloadedUpdate()
              args = ["--updated", …]        NsisUpdater.js:107
              spawn(elevate.exe, [installer] + args)
                → المثبّت يضيف --updated مرة أخرى   installUtil.nsh:206
                  → uninstaller.nsh: ${ifNot} ${isUpdated} ⇒ لا حذف
                  → StartApp: StrCpy $startAppArgs "--updated"   common.nsh:125
```

### 3.5 **حجم الخطر لو انكسرت الحماية**

مجلد واحد محمي فقط:
```
RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"   →  $APPDATA\malahy
```
وهو يحوي **كل** بيانات البرنامج:
| المفتاح | المحتوى |
|---|---|
| `malahy_employees_v1` | **سجلات الموظفين** |
| (داخلها) `days` / `payouts` / `advances` / `deductions` / `bonuses` / `penalties` / `weeks` | **الحضور والغياب، تاريخ الرواتب، الأرصدة، السلف والخصومات والمكافآت** |
| `malahy_payroll_batches_v1` | **دفعات الصرف** |
| `malahy_pos_state_v1` · `malahy_pos_settings_v1` · `malahy_users_v1` | الإعدادات والحسابات |

> **إذن لو انكسرت الحماية مرة واحدة، Loss = كل شيء.** ولهذا ثبّتُّ الاختبار أدناه بعقوبة `1e`.

---

## 4. فجوة التغطية — موجودة فعلاً، وقد عولجت

**الفحص:** بحثت في `tests/*.test.js` عن `deleteAppDataOnUninstall|--updated|--delete-app-data|isUpdated|nsis`.

**النتيجة: صفر تطابق.** لا يوجد **أي** اختبار يحرس هذا العقد. كانت أي ترقية لـ `electron-builder`/`electron-updater`، أو تعديل في `electron-builder.yml`، able أن تُسقط الحماية **بصمت** مع بقاء كل الاختبارات خضراء.

> **فجوة حقيقية ⇒ أُضيف اختبار انحدار مُوجَّه** (مطابق لتعليمك).

### `tests/update-data-preservation.test.js` — **جديد · 25 تأكيدًا**

| القسم | يثبّت |
|---|---|
| **1** | طبقة NSIS: الافتراضي `0` · الحذف مُعطَّل عند `isUpdated` · كل `RMDir` داخل الحرس · **لا حذف غير مشروط خارج الحرس** · إلغاء التثبيت العادي ما زال يحذف |
| **2** | electron-updater يمرّر `--updated` دائمًا · `quitAndInstall` يمرّ عبر `install()` · نفس مصفوفة الوسائط تُستخدم عند الاستدعاء |
| **3** | المثبّت يضيف `--updated` ما لم يُطلب الحذف · تعليق electron-builder نفسه · `startAppArgs` · `Abort` في المسار المبكر |
| **4** | `deleteAppDataOnUninstall: true` باقٍ · يولّد `DELETE_APP_DATA_ON_UNINSTALL` · `--delete-app-data` هو المفتاح الوحيد |
| **5** | تطبيقنا **لا يمرّر** `--delete-app-data` · **لا** يستدعي `app.setPath('userData')` · المجلد المحمي = `malahy` = مجلد بياناتنا · كل بيانات الرواتب داخله |
| **6** | نستخدم `autoUpdater` الرسمي · `autoDownload` + `quitAndInstall` · لا `execSync/spawnSync` بأعلام حذف · `update-gate.js` لا يحذف ملفات |

---

## 5. الاختبارات المُنفَّذة وكود الخروج

```powershell
node tests\update-data-preservation.test.js      # جديد
node tests\<24 ملفًا>.test.js                   # المجموعة الكاملة
```

### الاختبار الجديد
```
node tests\update-data-preservation.test.js
OK: 25 passed, 0 failed        exit=0
```

### المجموعة الكاملة
```
TOTAL passed=1868   failed=0   files=25
```
>Was `1,843` in 24 files, now `1,868` in 25 files = **+25 assertions**, **0 failures**, no test removed or weakened.

---

## 6. الملفات المُعدَّلة

| الملف | التغيير | السبب |
|---|---|---|
| `tests/update-data-preservation.test.js` | **جديد** — 25 تأكيدًا | فجوة تغطية مُثبَتة (§4) |
| `AI_REPORTS/PAYROLL_PHASE_2_UPDATE_DATA_PRESERVATION.md` | **جديد** | هذا التقرير |

**لم يُعدَّل أي ملف مصدري.** لم أُمس `electron-builder.yml` ولا `main.js` ولا `database.js` ولا `update-gate.js` ولا `node_modules`.

**سلوك إلغاء التثبيت العادي لم يتغيّر** — affirmed by assertion `4a` which now *guards* it against future accidental removal.

---

## 7. ما لم يُنفَّذ ولماذا

| الفحص | السبب |
|---|---|
| بناء مثبّت و**تجربة تحديث حقيقي** | ممنوع في هذه المرحلة؛ يتطلب بناءً |
| فحص `app.asar` بعد البناء | يتطلب بناءً |
| محاكاة NSIS فعليًا (makensis) | أداة غير متاحة / تتطلب بناءً |
| فتح `%APPDATA%\malahy` | ممنوع |
| تشغيل Electron على بيانات الإنتاج | ممنوع |
| commit / tag / push / publish | ممنوع |

### ⚠️ ما يبقى **غير مُتحقَّق منه فعليًا**
> **لم أُشغِّل تحديثًا حقيقيًا.** الاستنتاج مبني على **قراءة شيفرة electron-builder وelectron-updater المثبَّتة فعليًا** في `node_modules` (26.0.12 / 6.3.9) — وهي نفسها التي سيبنيها `npm run dist`.
> **التحقق الحقيقي يقتضي** بناء المثبّت ثم نشر إصدار تجريبي على فرع منفصل وتثبيته على جهاز ببيانات تجريبية.

---

## 8. العوائق غير الطباعية المتبقية

| # | العائق | الأولوية | الحالة |
|---|---|---|---|
| **W1** | ترحيل بيانات الإنتاج غير مُتحقَّق | 🔴 عالية | مفتوح — **يحتاج إذن نسخ Production** |
| **W2** | لا نسخة احتياطية يدوية خارجية | 🔴 عالية | مفتوح — **يحتاج إذن نسخ Production** |
| **W3** | `dist/` قديم | 🟡 متوسطة | يُحل بالبناء |
| W4 | 3 اختبارات تقبل `database.js` ضمن `intended` | 🟢 موثّق | معتمد |
| W5 | محرفان غريبان في `phase3c1-gate.test.js:66` | 🟢 منخفض | تجميلي |
| W6 | لا زر تراجع في الواجهة | 🟢 منخفض | قرار |
| W7 | `snapshot()` غير موصولة | 🟢 اختياري | تأجيل |
| **W8** | **تحديث تلقائي غير مُختبر عمليًا** | 🟢 **مُغلق مخاطريًا** | **محمي بثلاث طبقات + اختبار انحدار** |
| ~~NV-1~~ | الطابعة الحرارية | — | ⛔ مستثنى بقرارك |

> **لم يُكتشف أي عائق جديد من مسار التحديث.** W8 كانThickness افتراضيًا؛ أصبح الآن مُثبتًا بالاختبار.

---

## 9. تأكيدات

- ✅ **لم يُعدَّل أي ملف مصدري** — ملف اختبار واحد + هذا التقرير.
- ✅ **لم تُفتح بيانات الإنتاج ولم تُقرأ ولم تُتجزّأ ولم تُنسخ ولم تُرحَّل** — `%APPDATA%\malahy` ثابت `10/11 19:59:38` بـ 24 ملفًا.
- ✅ **لم يُشغَّل Electron** ولا أي تطبيق.
- ✅ **لم يُبنَ** `dist` ولم يُلمس (`10/11 21:24:39`).
- ✅ **لا commit · tag · push · publish** · لا تغيير إصدار (`2.5.4`).
- ✅ **لم يُحذف أو يُضعَف أي اختبار** — `+25` صافيًا.
- ✅ **سلوك إلغاء التثبيت العادي لم يتغيّر** وهو الآن محميّ باختبار انحدار.
- ✅ **لم أفحص أي ملف بيانات إنتاجي** — كل الفحوص على ملفات المشروع و`node_modules`.

## الإجراء التالي الواحد

> **امنح إذن النسخة الاحتياطية اليدوية المؤرَّخة خارج `%APPDATA%\malahy` (W2).**
> هو الخطر القائم الوحيد على بياناتك الحقيقية، ولا يحلّه أي اختبار.