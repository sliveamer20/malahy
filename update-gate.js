// update-gate.js — منطق "بوابة التحديث الإجباري" (نقي وقابل للاختبار بدون Electron).
//
// القاعدة:
//   - كل إصدار يُنشر على GitHub يعتبر إلزاميًا: لو النسخة المثبّتة أقدم من
//     أحدث إصدار متاح → الواجهة الرئيسية تبقى مقفولة حتى يكتمل التحديث.
//   - FLOOR_VERSION هو أقل نسخة يسمح هذا البناء بتشغيلها (مدمجة في الكود).
//     تُستخدم كحدي أدنى للنسخة المطلوبة، وكحالة احتياطية لو تعذّر الوصول
//     لخادم التحديثات (أوفلاين): عندها النسخة المطلوبة = FLOOR_VERSION.
//   - لو النسخة المثبّتة >= النسخة المطلوبة → يُسمح بالدخول (حتى لو أوفلاين).
//   - لو النسخة المثبّتة < النسخة المطلوبة ولا يمكن إكمال التحديث → مقفول
//     مع رسالة واضحة وإعادة محاولة + رابط تحميل يدوي.

// أقل نسخة مسموح بتشغيلها (مدمجة في هذا البناء — تُرفع مع كل إصدار جديد)
const FLOOR_VERSION = "2.4.8";

// نحوّل "2.4.8" إلى [2,4,8]؛ نتجاهل أي لواحق غير رقمية بأمان
function parseSemver(v) {
  if (typeof v !== "string") return null;
  const parts = v.trim().split(".");
  if (parts.length < 2) return null;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = parts[i];
    if (p === undefined) { out.push(0); continue; }
    const n = parseInt(p, 10);
    if (isNaN(n)) return null;
    out.push(n);
  }
  return out;
}

// -1 لو a < b، 0 لو متساويتان، 1 لو a > b؛ النسخ غير الصالحة تُعتبر "أقدم"
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

// status: { reached:boolean, latest:string|null, error:string|null }
//   reached = true  → تمكنا من سؤال خادم التحديثات (حتى لو لم يوجد تحديث)
//   latest  = أحدث نسخة متاحة على الخادم (null لو لا يوجد تحديث أو لم نصل)
function evaluate(installed, status) {
  const floor = FLOOR_VERSION;
  let required = floor;

  // خادم التحديثات وصل: أحدث نسخة منشورة تصبح هي المطلوبة (شرط ألا تقل عن الحد الأدنى)
  if (status && status.reached && status.latest) {
    if (compareSemver(status.latest, required) > 0) required = status.latest;
  }

  const installedValid = parseSemver(installed) !== null;
  const cmp = installedValid ? compareSemver(installed, required) : -1;

  // 1) النسخة الحالية تساوي أو تتفوق على المطلوبة → دخول طبيعي (حتى لو أوفلاين)
  if (cmp >= 0) {
    return { action: "proceed", installed: installed, required: required, floor: floor };
  }

  // 2) النسخة أقدم من المطلوبة ولا يمكننا الوصول للخادم → مقفول (أوفلاين)
  if (!status || !status.reached) {
    return {
      action: "locked",
      reason: "offline",
      installed: installed,
      required: required,
      floor: floor,
      error: (status && status.error) || null,
    };
  }

  // 3) وصلنا للخادم ويوجد تحديث يساوي/يتفوق على المطلوبة → ابدأ التحديث الإجباري
  if (status.latest && compareSemver(status.latest, required) >= 0) {
    return {
      action: "update",
      installed: installed,
      required: required,
      latest: status.latest,
      floor: floor,
    };
  }

  // 4) وصلنا للخادم لكن لا يوجد تحديث يلبّي الحد الأدنى المطلوب → مقفول
  return {
    action: "locked",
    reason: "unavailable",
    installed: installed,
    required: required,
    floor: floor,
    error: (status && status.error) || null,
  };
}

module.exports = {
  FLOOR_VERSION: FLOOR_VERSION,
  parseSemver: parseSemver,
  compareSemver: compareSemver,
  evaluate: evaluate,
};
