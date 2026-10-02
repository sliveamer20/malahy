/* permissions.js — سجلّ الصلاحيات الموحّد (المصدر الوحيد للحقيقة)
   ---------------------------------------------------------------
   المرحلة 3C-2: يعرّف معرّفات الصلاحيات المستقرّة + صلاحيات الكاشير
   الافتراضية + خريطة حماية مفاتيح قاعدة البيانات الحساسة.
   يعمل في العملية الرئيسية (require) وفي الواجهة (<script> → window.MalahyPerms)
   دون أي تكرار لتعريفات الصلاحيات في مكان آخر.

   قواعد الصلاحيات:
   - الأدمن له كل الصلاحيات تلقائيًا (لا يعتمد على مصفوفة مخزّنة).
   - الكاشير له الصلاحيات الممنوحة صراحةً فقط.
   - أي معرّف صلاحية غير معروف → مرفوض افتراضيًا (default-deny).
   - كل صلاحية مستقلّة: حذف مصروف لا يعني إنشاءه، والعكس. */

/* ============ المعرّفات المستقرّة للصلاحيات ============ */
/* أي معرّف غير موجود هنا يُعتبر غير معروف → مرفوض للكاشير. */
var PERMS = [
  "sales", "ticketPrint", "returns",
  "expenseAdd", "expenseDelete", "giftAdd", "giftDelete",
  "reports", "reportExport", "reportPrint",
  "gameManage", "employeeManage", "payroll",
  "dayReset", "historyDelete", "settings",
];

/* ============ صلاحيات الكاشير الافتراضية ============ */
/* تُمنح عند إنشاء كاشير جديد أو عند ترحيل كاشير قديم بلا صلاحيات.
   كل صلاحية مستقلّة قابلة للإلغاء لاحقًا من إدارة الأدمن. */
var DEFAULT_CASHIER_PERMS = {
  sales: true,
  ticketPrint: true,
  returns: true,
  expenseAdd: true,
  expenseDelete: true,
  giftAdd: true,
  giftDelete: true,
  reports: true,
  reportPrint: true,
  /* مرفوضة افتراضيًا للكاشير: */
  reportExport: false,
  gameManage: false,
  employeeManage: false,
  payroll: false,
  dayReset: false,
  historyDelete: false,
  settings: false,
};

/* ============ تسميات الصلاحيات (للواجهة المستقبلية فقط) ============ */
var PERM_LABELS = {
  sales: "بيع التذاكر",
  ticketPrint: "طباعة التذاكر",
  returns: "خصم/مرتجع التذاكر",
  expenseAdd: "إضافة مصروف",
  expenseDelete: "حذف مصروف",
  giftAdd: "إضافة هدية",
  giftDelete: "حذف هدية",
  reports: "عرض التقارير",
  reportExport: "تصدير التقارير",
  reportPrint: "طباعة التقارير",
  gameManage: "إدارة الألعاب",
  employeeManage: "إدارة الموظفين",
  payroll: "صرف الرواتب",
  dayReset: "إعادة تعيين اليوم",
  historyDelete: "حذف السجل",
  settings: "الإعدادات",
};

/* ============ حماية مفاتيح قاعدة البيانات الحساسة ============ */
/* العملية الرئيسية هي السلطة النهائية: لا يجوز للمفتاح الحساس أن يُكتب
   أو يُحذف لمجرّد أن الواجهة طلبت ذلك. لكل مفتاح الصلاحيات المطلوبة.
   - write: الصلاحيات التي تسمح بالكتابة (يكفي واحدة).
   - del:   الصلاحيات التي تسمح بالحذف (يكفي واحدة).
   - null:  لا يُسمح به أبدًا عبر IPC (مثل مفتاح المستخدمين). */
var SENSITIVE_KEYS = {
  "malahy_pos_pass_v1":     { write: ["settings"], del: ["settings"] },
  "malahy_pos_history_v1":  { write: ["dayReset", "historyDelete"], del: ["historyDelete"] },
  "malahy_employees_v1":    { write: ["employeeManage", "payroll"], del: ["employeeManage"] },
  "malahy_pos_games_v1":    { write: ["gameManage"], del: ["gameManage"] },
  "malahy_pos_settings_v1": { write: ["settings"], del: ["settings"] },
  "malahy_users_v1":        { write: null, del: null }
};

/* ============ دوال مساعدة مشتركة ============ */
function isKnownPerm(id) {
  return PERMS.indexOf(String(id || "")) !== -1;
}
/* خريطة كل الصلاحيات مفعّلة (للأدمن) — تُبنى ديناميكيًا من السجل،
   فأي صلاحية جديدة تُضاف لاحقًا يحصل عليها الأدمن تلقائيًا. */
function allPermsMap() {
  var out = {};
  for (var i = 0; i < PERMS.length; i++) out[PERMS[i]] = true;
  return out;
}
/* نسخة من صلاحيات الكاشير الافتراضية (نسخة مستقللة لكل كائن) */
function defaultCashierPerms() {
  return JSON.parse(JSON.stringify(DEFAULT_CASHIER_PERMS));
}
/* تنقية صلاحيات واردة: نحتفظ فقط بالصلاحيات المعروفة والمفعّلة صراحةً.
   أي معرّف غير معروف يُتجاهل (لا يُمنح أبدًا). */
function sanitizePerms(perms) {
  var out = {};
  if (perms && typeof perms === "object") {
    for (var i = 0; i < PERMS.length; i++) {
      if (perms[PERMS[i]] === true) out[PERMS[i]] = true;
    }
  }
  return out;
}
/* هل يملك المستخدم (الجلسة) الصلاحية المطلوبة؟
   - الجلسة كائن { role, perms } قادم من العملية الرئيسية فقط.
   - role==='admin' → جميع الصلاحيات تلقائيًا.
   - الكاشير → المنحة الصريحة فقط، وغير المعروف مرفوض. */
function sessionHasPerm(session, permId) {
  if (!session) return false;
  if (session.role === "admin") return true;
  var id = String(permId || "");
  if (!isKnownPerm(id)) return false;
  return !!(session.perms && session.perms[id] === true);
}

/* ============ قرار حماية مفتاح قاعدة البيانات ============ */
/* op: 'write' | 'delete' · key: اسم المفتاح · session: جلسة العملية الرئيسية
   keyExists: هل المفتاح موجود فعليًا في المخزن؟
   - المفاتيح غير الحساسة → مسموح (سلوك v2.5.1 كما هو).
   - مفتاح المستخدمين → مرفوض دائمًا عبر IPC (تكتبه users.js في Main فقط).
   - الأدمن → مسموح.
   - جلسة بصلاحية مطابقة → مسموح.
   - بدون جلسة: يُسمح فقط بإنشاء مفتاح غائب لأول مرة (تهيئة الإقلاع:
     تهيئة الألعاب وكلمة السر الافتراضية). ما عدا ذلك مرفوض (fail-closed). */
function authorizeDbOp(op, key, session, keyExists) {
  var spec = Object.prototype.hasOwnProperty.call(SENSITIVE_KEYS, key) ? SENSITIVE_KEYS[key] : null;
  if (!spec) return true;
  if (spec.write === null || spec.del === null) return false;
  var need = (op === "delete") ? spec.del : spec.write;
  if (!need || !need.length) return false;
  if (session && session.role === "admin") return true;
  if (session && session.perms) {
    for (var i = 0; i < need.length; i++) {
      if (session.perms[need[i]] === true) return true;
    }
    return false;
  }
  if (!session && op !== "delete" && keyExists === false) return true;
  return false;
}

/* ============ التصدير المشترك (Node + المتصفح) ============ */
var api = {
  PERMS: PERMS,
  DEFAULT_CASHIER_PERMS: DEFAULT_CASHIER_PERMS,
  PERM_LABELS: PERM_LABELS,
  SENSITIVE_KEYS: SENSITIVE_KEYS,
  isKnownPerm: isKnownPerm,
  allPermsMap: allPermsMap,
  defaultCashierPerms: defaultCashierPerms,
  sanitizePerms: sanitizePerms,
  sessionHasPerm: sessionHasPerm,
  authorizeDbOp: authorizeDbOp,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.MalahyPerms = api;
