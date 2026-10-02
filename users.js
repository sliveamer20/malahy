// users.js — أساس المصادقة والصلاحيات للنظام (العملية الرئيسية / Main process)
// ---------------------------------------------------------------
// المرحلة 3B: أساس المصادقة فقط — لا واجهة تسجيل دخول، ولا فرض صلاحيات على العمليات.
// يستخدم وحدات Node المدمجة فقط (crypto.scrypt) ولا يضيف أي نظام تخزين جديد:
// كل البيانات تُحفظ داخل نفس قاعدة database.js تحت مفتاح إضافي واحد (malahy_users_v1).
// يتم تمرير db من main.js حتى يبقى هذا الملف قابلاً للاختبار بدون Electron.

const crypto = require("crypto");
const PERMLIB = require("./permissions");

/* يمّثل واجهة database.js (get/set) ويُحقن من main.js حتى يبقى الملف قابلاً
   للاختبار في Node صرفًا بدون Electron. */
let db = null;

/* ============ المفاتيح والثوابت ============ */
const K_USERS = "malahy_users_v1";       // المفتاح الإضافي الجديد (إضافي بحت)
const K_PASS = "malahy_pos_pass_v1";      // مفتاح كلمة السر القديم في v2.5.1 (للترحيل فقط)
const DEFAULT_PASS = "1234";              // نفس كلمة السر الافتراضية الموجودة في v2.5.1

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1;
const KEY_LEN = 32, SALT_LEN = 16;
const HASH_PREFIX = "scrypt";
const MIN_PASS_LEN = 4;

/* ============ استعادة كلمة سر المدير (المرحلة 3C-4) ============ */
/* رمز استعادة عشوائي آمن: ٦ أرقام (نفس معيار OTP المعتمد عالميًا). يُحمى
   بصلاحية قصيرة (١٠ دقائق) + حدّ المحاولات (٥) + الاستخدام لمرة واحدة.
   التوليد يتم حصرًا عبر crypto.randomInt (مولّد آمن تشفيريًا) —
   لا يُستخدم Math.random أبدًا. */
const RECOVERY_CODE_LEN = 6;
const RECOVERY_CODE_MAX = 1000000;                       /* 10^RECOVERY_CODE_LEN */
const RECOVERY_TTL_MS = 10 * 60 * 1000;                  /* صلاحية الرمز */
const RECOVERY_MAX_ATTEMPTS = 5;                         /* حدّ المحاولات الخاطئة */
const RECOVERY_SALT_LEN = 16;                            /* ملح تجزئة الرمز */

/* سجلّ الصلاحيات المعروف — مصدره الوحيد permissions.js (لا تكرار).
   أي معرّف غير موجود يُعتبر مرفوضًا افتراضيًا (default-deny).
   الأدمن له كل الصلاحيات ضمنيًا. */
const PERMS = PERMLIB.PERMS;
const defaultCashierPerms = PERMLIB.defaultCashierPerms;
const sanitizePermsLib = PERMLIB.sanitizePerms;

/* ============ الجلسة (في ذاكرة العملية الرئيسية فقط) ============ */
/* الحد الأدنى من المعلومات: معرّف المستخدم، الدور، الاسم، الحالة، الصلاحيات.
   لا تُخزّن أي أسرار داخل الجلسة. */
let currentSession = null;
function getSession() { return currentSession; }
function logout() { currentSession = null; }
function allPerms() { return PERMLIB.allPermsMap(); }

/* ============ تجزئة كلمات السر (crypto.scrypt + ملح عشوائي لكل كلمة) ============ */
function scryptRun(password, salt, N, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, key) => { if (err) reject(err); else resolve(key); });
  });
}
/* التمثيل المخزّن: scrypt:N:r:p:<ملح hex>:<تجزئة hex> — يحتوي كل ما يلزم للتحقق
   بدون تخزين كلمة السر الأصلية أبدًا. */
async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = await scryptRun(String(plain), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return HASH_PREFIX + ":" + SCRYPT_N + ":" + SCRYPT_R + ":" + SCRYPT_P +
    ":" + salt.toString("hex") + ":" + key.toString("hex");
}
async function verifyPassword(plain, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return false;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "hex");
  const hash = Buffer.from(parts[5], "hex");
  if (!N || !r || !p || salt.length !== SALT_LEN || hash.length !== KEY_LEN) return false;
  const key = await scryptRun(String(plain), salt, N, r, p);
  try { return crypto.timingSafeEqual(key, hash); } catch (_) { return false; }
}

/* ============ تجزئة رمز الاستعادة (sha256 + ملح عشوائي لكل رمز) ============ */
/* لا يُخزّن الرمز نفسه أبدًا — فقط تجزئته. التحقّق بمقارنة زمنية ثابتة.
   sha256 كافٍ هنا لأن الرمز يُحمى بصلاحية قصيرة وحدّ محاولات صارم،
   فلا يُتاح للخصم مجال لفكّ التجزئة خارجيًا. */
async function hashRecoveryCode(code) {
  const salt = crypto.randomBytes(RECOVERY_SALT_LEN);
  const h = crypto.createHash("sha256");
  h.update(salt);
  h.update(String(code));
  return "sha256:" + salt.toString("hex") + ":" + h.digest("hex");
}
async function verifyRecoveryCode(code, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "sha256") return false;
  const salt = Buffer.from(parts[1], "hex");
  const hash = Buffer.from(parts[2], "hex");
  if (salt.length !== RECOVERY_SALT_LEN || hash.length !== 32) return false;
  const h = crypto.createHash("sha256");
  h.update(salt);
  h.update(String(code));
  const dig = h.digest();
  try { return crypto.timingSafeEqual(dig, hash); } catch (_) { return false; }
}

/* تطبيع أرقام الهاتف للمقارنة/الربط: أرقام فقط (تُزال المسافات/الشرطات/+). */
function digitsOnly(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

/* ============ قراءة/كتابة مستودع المستخدمين (نفس database.js) ============ */
function readDoc() {
  const d = db.get(K_USERS, null);
  return (d && typeof d === "object") ? d : null;
}
function writeDoc(doc) { return db.set(K_USERS, doc); }

function newId() { return "usr_" + crypto.randomUUID(); }

function sanitizePerms(perms) { return sanitizePermsLib(perms); }
/* نسخة عامة من المستخدم بدون أي أسرار (للإرجاع للواجهة أو للتسجيل) */
function sanitize(rec, role, perms) {
  return {
    id: rec.id,
    username: rec.username,
    role: role,
    active: role === "admin" ? true : rec.active !== false,
    mustChangePass: !!rec.mustChangePass,
    perms: perms || (role === "admin" ? allPerms() : sanitizePerms(rec.permissions)),
  };
}

/* ============ التهيئة وترحيل الأدمن (idempotent) ============ */
/* - لو يوجد سجل أدمن سليم بكلمة سر مجزّأة → نتركه كما هو.
   - وإلا نرحّل كلمة سر v2.5.1 من K_PASS إلى حساب الأدمن (بدون تعديل K_PASS).
   - لو لا توجد كلمة سر قديمة نحتفظ بسلوك كلمة السر الافتراضية.
   - دائمًا يوجد أدمن واحد بالضبط، ولا تتكرر العملية عند إعادة التشغيل.
   - ترحيل صلاحيات الكاشير (إضافي و idempotent): أي كاشير قديم بلا صلاحيات
     يُهيّأ بالصلاحيات الافتراضية للكاشير، دون الكتابة فوق تخصيص موجود. */
async function initUsers() {
  const existing = readDoc();
  const doc = existing ? JSON.parse(JSON.stringify(existing)) : {};
  doc.schema = 1;
  if (!Array.isArray(doc.cashiers)) doc.cashiers = [];

  let changed = !existing;

  /* ترحيل صلاحيات الكاشير: فقط لمن لا يملك مجموعة صلاحيات صالحة. */
  doc.cashiers.forEach(function (c) {
    if (c && (!c.permissions || typeof c.permissions !== "object" || Array.isArray(c.permissions))) {
      c.permissions = defaultCashierPerms();
      changed = true;
    }
  });

  const adminOk = doc.admin && typeof doc.admin.passwordHash === "string" &&
    doc.admin.passwordHash.indexOf(HASH_PREFIX + ":") === 0;
  if (!adminOk) {
    const legacy = db.get(K_PASS, null);
    const seedPass = (typeof legacy === "string" && legacy.length) ? legacy : DEFAULT_PASS;
    const prevRecovery = (doc.admin && typeof doc.admin.recoveryWhatsapp === "string") ? doc.admin.recoveryWhatsapp : "";
    doc.admin = {
      id: "admin",
      username: "admin",
      passwordHash: await hashPassword(seedPass),
      recoveryWhatsapp: prevRecovery,
      recoveryState: null,
    };
    changed = true;
  } else {
    /* تنظيف حالة استعادة منتهية الصلاحية عند الإقلاع (إضافي وآمن):
       لا يُكتب شيءٌ إن لم توجد حالة، فتبقى التهيئة idempotent تمامًا. */
    if (doc.admin.recoveryState && doc.admin.recoveryState.expiresAt <= Date.now()) {
      doc.admin.recoveryState = null;
      changed = true;
    }
  }

  if (changed) writeDoc(doc);
  return doc;
}

/* ============ تسجيل الدخول ============ */
async function login(args) {
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  const u = String((args && args.username) || "").trim();
  if (!u) return { ok: false, error: "missing-credentials" };

  let rec = null, role = null;
  if (doc.admin.username.toLowerCase() === u.toLowerCase()) {
    rec = doc.admin; role = "admin";
  } else {
    const list = Array.isArray(doc.cashiers) ? doc.cashiers : [];
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].username).toLowerCase() === u.toLowerCase()) { rec = list[i]; role = "cashier"; break; }
    }
  }
  if (!rec) return { ok: false, error: "user-not-found" };
  if (role === "cashier" && rec.active === false) return { ok: false, error: "inactive" };

  const ok = await verifyPassword(String((args && args.password) || ""), rec.passwordHash);
  if (!ok) return { ok: false, error: "wrong-password" };

  const perms = role === "admin" ? allPerms() : sanitizePerms(rec.permissions);
  currentSession = {
    userId: rec.id,
    role: role,
    username: rec.username,
    active: role === "admin" ? true : rec.active !== false,
    perms: perms,
    loggedInAt: Date.now(),
  };
  return { ok: true, user: sanitize(rec, role, perms) };
}

/* ============ تغيير كلمة السر (يتطلب معرفة القديمة) ============ */
async function changePass(args) {
  const doc = readDoc();
  if (!doc) return { ok: false, error: "not-initialized" };
  const userId = String((args && args.userId) || "");
  let rec = null;
  if (doc.admin && doc.admin.id === userId) rec = doc.admin;
  else if (Array.isArray(doc.cashiers)) {
    for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === userId) { rec = doc.cashiers[i]; break; } }
  }
  if (!rec) return { ok: false, error: "user-not-found" };

  const ok = await verifyPassword(String((args && args.oldPass) || ""), rec.passwordHash);
  if (!ok) return { ok: false, error: "wrong-password" };

  const np = String((args && args.newPass) || "");
  if (np.length < MIN_PASS_LEN) return { ok: false, error: "weak-password" };

  rec.passwordHash = await hashPassword(np);
  if (rec.mustChangePass) rec.mustChangePass = false;
  writeDoc(doc);

  /* أثناء فترة الانتقال: إبقاء K_PASS متوافقةً مع واجهة v2.5.1 التي لا تزال تعمل
     (لا نغيّر سلوكها — فقط نبقي المصدرين متفقين على نفس كلمة السر). */
  if (rec === doc.admin) { try { db.set(K_PASS, np); } catch (_) {} }
  return { ok: true };
}

/* ============ إعادة تعيين كلمة سر الكاشير (للأدمن فقط) ============ */
async function resetCashier(args) {
  /* القرار في العملية الرئيسية: تتطلب جلسة أدمن مُصادَق عليها */
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return { ok: false, error: "not-initialized" };
  const cid = String((args && args.cashierId) || "");
  let rec = null;
  for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === cid) { rec = doc.cashiers[i]; break; } }
  if (!rec) return { ok: false, error: "cashier-not-found" };

  const np = String((args && args.newPass) || "");
  if (np.length < MIN_PASS_LEN) return { ok: false, error: "weak-password" };

  rec.passwordHash = await hashPassword(np);
  rec.mustChangePass = true; /* الكاشير يُجبَر على تغييرها عند أول استخدام */
  writeDoc(doc);
  return { ok: true };
}

/* ============ الاستعلام عن الصلاحية (القرار في العملية الرئيسية) ============ */
function hasPerm(args) {
  const sess = currentSession;
  if (!sess) return false;
  const permId = String((args && args.permId) || "");
  const userId = (args && typeof args.userId === "string") ? args.userId : null;

  let role = sess.role, perms = sess.perms || {};
  if (userId && userId !== sess.userId) {
    if (sess.role !== "admin") return false; /* لا يمكن الاستعلام عن مستخدم آخر إلا للأدمن */
    const doc = readDoc();
    if (!doc) return false;
    if (doc.admin && doc.admin.id === userId) { role = "admin"; perms = allPerms(); }
    else {
      let c = null;
      if (Array.isArray(doc.cashiers)) {
        for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === userId) { c = doc.cashiers[i]; break; } }
      }
      if (!c) return false;
      role = "cashier"; perms = sanitizePerms(c.permissions);
    }
  }
  if (role === "admin") return true;
  if (PERMS.indexOf(permId) === -1) return false; /* معرّف غير معروف → مرفوض */
  return perms[permId] === true;
}

/* ============ إدارة الكاشير (أساس داخلي — واجهة الإدارة تأتي لاحقًا) ============ */
async function createCashier(args) {
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  const u = String((args && args.username) || "").trim();
  if (u.length < 2) return { ok: false, error: "invalid-username" };
  if (doc.admin.username.toLowerCase() === u.toLowerCase()) return { ok: false, error: "username-taken" };
  const list = Array.isArray(doc.cashiers) ? doc.cashiers : [];
  for (let i = 0; i < list.length; i++) {
    if (String(list[i].username).toLowerCase() === u.toLowerCase()) return { ok: false, error: "username-taken" };
  }
  const pw = String((args && args.password) || "");
  if (pw.length < MIN_PASS_LEN) return { ok: false, error: "weak-password" };

  /* الصلاحيات: لو حدّدها المُنشئ ننقّيها، وإلا نعطي الصلاحيات
     الافتراضية للكاشير (كل صلاحية مستقلّة وقابلة للإلغاء لاحقًا). */
  const hasPermsArg = !!(args && args.permissions && typeof args.permissions === "object" && !Array.isArray(args.permissions));
  const rec = {
    id: newId(),
    username: u,
    passwordHash: await hashPassword(pw),
    permissions: hasPermsArg ? sanitizePerms(args.permissions) : defaultCashierPerms(),
    mustChangePass: (args && args.mustChangePass) !== false,
    active: (args && args.active) !== false,
  };
  doc.cashiers = list.concat([rec]);
  writeDoc(doc);
  return { ok: true, user: sanitize(rec, "cashier", rec.permissions) };
}
function listCashiers() {
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return [];
  return doc.cashiers.map((c) => sanitize(c, "cashier", sanitizePerms(c.permissions)));
}

/* ============ تفعيل/تعطيل حساب الكاشير (للأدمن فقط) ============ */
/* القرار في العملية الرئيسية: تتطلب جلسة أدمن مُصادَق عليها.
    - التفعيل: يستطيع الكاشير تسجيل الدخول من جديد.
    - التعطيل: يُمنع تسجيل الدخول فورًا (login() يرفض الحساب المعطّل).
    لا يمكن تعطيل حساب الأدمن (ليس له حقل active أصلاً — دائمًا مفعّل). */
function setCashierActive(args) {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return { ok: false, error: "not-initialized" };
  const cid = String((args && args.cashierId) || "");
  let rec = null;
  for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === cid) { rec = doc.cashiers[i]; break; } }
  if (!rec) return { ok: false, error: "cashier-not-found" };
  /* قيمة منطقية صريحة فقط — لا نستنتج القيمة من غيابها */
  if (typeof (args && args.active) !== "boolean") return { ok: false, error: "invalid-argument" };
  if (rec.active === args.active) return { ok: true, user: sanitize(rec, "cashier", sanitizePerms(rec.permissions)), unchanged: true };
  rec.active = args.active;
  writeDoc(doc);
  return { ok: true, user: sanitize(rec, "cashier", sanitizePerms(rec.permissions)) };
}

/* ============ تغيير اسم مستخدم الكاشير (للأدمن فقط) ============ */
/* الاسم الجديد يجب أن يكون فريدًا (لا يتطابق مع الأدمن ولا مع كاشير آخر)
    وبطول لا تقل عن 2. لا تُمسَّ كلمة السر ولا الصلاحيات. */
function setCashierUsername(args) {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return { ok: false, error: "not-initialized" };
  const cid = String((args && args.cashierId) || "");
  let rec = null;
  for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === cid) { rec = doc.cashiers[i]; break; } }
  if (!rec) return { ok: false, error: "cashier-not-found" };
  const u = String((args && args.username) || "").trim();
  if (u.length < 2) return { ok: false, error: "invalid-username" };
  if (doc.admin && doc.admin.username.toLowerCase() === u.toLowerCase()) return { ok: false, error: "username-taken" };
  const list = doc.cashiers;
  for (let i = 0; i < list.length; i++) {
    if (list[i] !== rec && String(list[i].username).toLowerCase() === u.toLowerCase()) return { ok: false, error: "username-taken" };
  }
  if (rec.username === u) return { ok: true, user: sanitize(rec, "cashier", sanitizePerms(rec.permissions)), unchanged: true };
  rec.username = u;
  writeDoc(doc);
  return { ok: true, user: sanitize(rec, "cashier", sanitizePerms(rec.permissions)) };
}

/* ============ تعديل صلاحيات الكاشير (للأدمن فقط) ============ */
/* القرار في العملية الرئيسية: تتطلب جلسة أدمن مُصادَق عليها.
   تُستبدل كل الصلاحيات بالقيمة الجديدة (القيمة المنطقية لكل صلاحية معروفة).
   أي صلاحية غير معروفة في الطلب تُتجاهل (لا تُمنح أبدًا).
   مفتاح لهذه الإدارة في واجهة لاحقة — هذه المرحلة توفّر الآلية فقط. */
function setCashierPermissions(args) {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return { ok: false, error: "not-initialized" };
  const cid = String((args && args.cashierId) || "");
  let rec = null;
  for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === cid) { rec = doc.cashiers[i]; break; } }
  if (!rec) return { ok: false, error: "cashier-not-found" };

  /* نبني الصلاحيات الجديدة من الحالة الحالية ثم نطبّق التبديل الصريح:
     true → مفعّلة، و false/غير معروف → ملغاة. */
  const next = defaultCashierPerms();
  const given = (args && args.permissions && typeof args.permissions === "object") ? args.permissions : {};
  for (let i = 0; i < PERMS.length; i++) {
    const id = PERMS[i];
    if (given[id] === true) next[id] = true;
    else if (given[id] === false) next[id] = false;
  }
  rec.permissions = next;
  writeDoc(doc);
  return { ok: true, user: sanitize(rec, "cashier", next) };
}

/* الاستعلام عن الصلاحيات الكاملة لكاشير (للأدمن فقط) — للاستخدام المستقبلي
   في واجهة الإدارة؛ يُرجع الصلاحيات المنقّاة فقط دون أي أسرار. */
function getCashierPermissions(args) {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !Array.isArray(doc.cashiers)) return { ok: false, error: "not-initialized" };
  const cid = String((args && args.cashierId) || "");
  let rec = null;
  for (let i = 0; i < doc.cashiers.length; i++) { if (doc.cashiers[i].id === cid) { rec = doc.cashiers[i]; break; } }
  if (!rec) return { ok: false, error: "cashier-not-found" };
  return { ok: true, perms: sanitizePerms(rec.permissions) };
}

/* ============ بيانات حساب المدير (للأدمن فقط) ============ */
/* يُرجع اسم المستخدم ورقم واتساب الاستعادة وحالة الاستعادة فقط — دون أي أسرار
    (لا كلمة سر ولا تجزئة). رقم الاستعادة ملكٌ لحساب المدير الوحيد ولا يُعرض
    للكاشير أبدًا. حالة الاستعادة تُرجع مُنقّاة: لا تُكشف تجزئة الرمز أبدًا. */
function sanitizeRecoveryState(st) {
  if (!st) return null;
  return {
    pending: st.used !== true && st.expiresAt > Date.now(),
    expiresAt: st.expiresAt,
    attempts: st.attempts || 0,
    used: st.used === true,
  };
}
function getAdminInfo() {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  return {
    ok: true,
    username: doc.admin.username,
    recoveryWhatsapp: (typeof doc.admin.recoveryWhatsapp === "string") ? doc.admin.recoveryWhatsapp : "",
    recoveryState: sanitizeRecoveryState(doc.admin.recoveryState),
  };
}

/* ============ ضبط رقم واتساب الاستعادة (للمدير فقط) ============ */
/* الرقم يُستخدم لاستعادة كلمة سر حساب المدير الوحيد: مسار «نسيت كلمة المرور»
    في شاشة الدخول يطلب هذا الرقم، فإذا طابقه يولّد رمز استعادة يُرسل عبر
    واتساب (الإرسال يدوي عبر الرابط المفتوح — لا تكامل API داخل التطبيق).
    نطلب قيمة منطقية نظيفة: أرقام/+/مسافات/شرطات، أو سلسلة فارغة لمسحه. */
function setRecoveryWhatsapp(args) {
  const sess = currentSession;
  if (!sess || sess.role !== "admin") return { ok: false, error: "forbidden" };
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  const raw = String((args && args.number) != null ? (args && args.number) : "");
  const num = raw.trim();
  if (num !== "" && !/^[0-9+][0-9+\s-]{4,23}$/.test(num)) return { ok: false, error: "invalid-number" };
  doc.admin.recoveryWhatsapp = num;
  writeDoc(doc);
  return { ok: true, recoveryWhatsapp: num };
}

/* ============ بدء الاستعادة (قبل تسجيل الدخول — للمدير الوحيد) ============ */
/* المسار: المستخدم نسى كلمة السر → يُدخل رقم واتساب الاستعادة → هذه الدالة
    تتحقق من مطابقته للرقم المخزّن في حساب المدير، فإن طابقه تولّد رمزًا
    عشوائيًا آمنًا وتُخزّن تجزئته فقط (مع صلاحية قصيرة + صفر محاولات +
    used=false)، وتُرجع الرمز كنص واضح مرة واحدة فقط للواجهة لتضعه في رسالة
    واتساب. الرمز لا يُخزّن ولا يُسجّل أبدًا.

   أمان:
   - خطأ موحّد لكلتا الحالتين (رقم غير مطابق / لا يوجد رقم مضبوط) حتى لا
     نكشف وجود رقم استالة مضبوط من عدمه.
   - توليد رمز جديد يُبطل أي رمز سابق فورًا (القيمة السابقة تُستبدل بالكامل).
   - لا تُلمس كلمات السر ولا الكاشيرين ولا أي بيانات أخرى. */
async function beginRecovery(args) {
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  const storedDigits = digitsOnly(doc.admin.recoveryWhatsapp);
  const givenDigits = digitsOnly((args && args.whatsapp) || "");
  if (!storedDigits || givenDigits !== storedDigits) {
    return { ok: false, error: "invalid-recovery-number" };
  }
  const code = String(crypto.randomInt(0, RECOVERY_CODE_MAX)).padStart(RECOVERY_CODE_LEN, "0");
  doc.admin.recoveryState = {
    codeHash: await hashRecoveryCode(code),
    createdAt: Date.now(),
    expiresAt: Date.now() + RECOVERY_TTL_MS,
    attempts: 0,
    used: false,
  };
  writeDoc(doc);
  return {
    ok: true,
    code: code,                          /* يُرجع مرة واحدة فقط — لا يُخزّن ولا يُسجّل */
    ttlSeconds: Math.round(RECOVERY_TTL_MS / 1000),
    whatsapp: storedDigits,              /* الوجهة المُطابقة (أرقام فقط) */
  };
}

/* ============ إكمال الاستعادة: التحقق من الرمز + كلمة سر جديدة ============ */
/* يتطلب رمزًا صحيحًا غير منتهٍ الصلاحية وضمن حدّ المحاولات وغير مستخدم.
   كلمة السر القديمة غير مطلوبة إطلاقًا (هذا غرض الاستعادة). عند النجاح:
   - تُستبدل تجزئة كلمة سر المدير بالجديدة (crypto.scrypt كالعادة).
   - يُبطل الرمز فورًا (recoveryState = null) → لا يمكن إعادة استخدامه.
   - تُزامن K_PASS لإبقاء واجهة v2.5.1 متوافقة (نفس سلوك changePass).
   رسائل الرفض الموحّدة لا تُميّز بين «لا رمز منتظر/مستخدم/منتهٍ/خطأ» حتى
   لا نتسرّب عن حالة الاستعادة؛ وحدّ المحاولات يُبلغ عنه صراحة عند بلوغه. */
async function completeRecovery(args) {
  const doc = readDoc();
  if (!doc || !doc.admin) return { ok: false, error: "not-initialized" };
  const st = doc.admin.recoveryState;
  if (!st || st.used !== false || st.expiresAt <= Date.now() || st.attempts >= RECOVERY_MAX_ATTEMPTS) {
    return { ok: false, error: "invalid-code" };
  }
  const codeOk = await verifyRecoveryCode(String((args && args.code) || ""), st.codeHash);
  if (!codeOk) {
    st.attempts = (st.attempts || 0) + 1;
    if (st.attempts >= RECOVERY_MAX_ATTEMPTS) {
      doc.admin.recoveryState = null; /* قفل: يلزم بدء استعادة جديدة برمز جديد */
      writeDoc(doc);
      return { ok: false, error: "too-many-attempts" };
    }
    writeDoc(doc);
    return { ok: false, error: "invalid-code" };
  }
  /* الرمز صحيح. نتحقق من كلمة السر الجديدة قبل الالتزام — يبقى الرمز
     صالحًا لو رُفضت كلمة السر الضعيفة/غير المتطابقة (لا تُستهلك محاولة). */
  const np = String((args && args.newPass) || "");
  const cf = String((args && args.confirm) || "");
  if (np !== cf) return { ok: false, error: "confirm-mismatch" };
  if (np.length < MIN_PASS_LEN) return { ok: false, error: "weak-password" };

  doc.admin.passwordHash = await hashPassword(np);
  doc.admin.recoveryState = null; /* إبطال الرمز فورًا (استخدام لمرة واحدة) */
  writeDoc(doc);
  try { db.set(K_PASS, np); } catch (_) {} /* توافق واجهة v2.5.1 */
  return { ok: true };
}

module.exports = function (dbInstance) {
  db = dbInstance;
  return {
    K_USERS, K_PASS, DEFAULT_PASS, PERMS, MIN_PASS_LEN,
    RECOVERY_CODE_LEN, RECOVERY_TTL_MS, RECOVERY_MAX_ATTEMPTS,
    initUsers, login, changePass, resetCashier, hasPerm,
    createCashier, listCashiers,
    setCashierPermissions, getCashierPermissions,
    setCashierActive, setCashierUsername,
    getAdminInfo, setRecoveryWhatsapp,
    beginRecovery, completeRecovery,
    getSession, logout, allPerms, sanitize,
    hashPassword, verifyPassword,
    hashRecoveryCode, verifyRecoveryCode,
  };
};
