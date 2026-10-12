// tests/payroll-migration-gate.test.js
// بوابة الترحيل الصريحة — تُختبَر دوال index.html الحقيقية فوق مخزن ذاكرة
// اصطناعي بالكامل. لا Electron، ولا شاشات، ولا بيانات إنتاجية.
//
// ما يُثبته:
//   - فتح الشاشة لا يكتب شيئًا ولا يُرحّل (صفر كتابة).
//   - البوابة تظهر فقط عند وجود ترحيل معلّق، وهي قراءةٌ خالصة.
//   - إلغاء التأكيد لا يكتب أي بايت ولا يُرحّل شيئًا.
//   - التأكيد بلا صلاحية لا يُرحّل (تُستدعى MalahyPerm.deny).
//   - التأكيد مع الصلاحية يُرحّل مرة واحدة فقط ولا يكرر الاستيراد.
//   - الأسابيع المدفوعة لا تدخل الرصيد ولا تُحتسب مرتين.

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "assets", "payroll", "payroll-core.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
function D(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0, 0).getTime(); }
function K(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
const NOW = D(2026, 10, 12);
function EOD() { return P.endOfDayTs(NOW); }

/* ---------- استخراج دوال حقيقية من index.html ---------- */
function extractFunction(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found in index.html: " + name);
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- بدائل DOM صغيرة بما يكفي للبوابة ---------- */
const env0 = { removed: [] };   /* يتتبع العناصر المُزالة من الواجهة */
function el(tag, props, kids) {
  const n = {
    tag: tag, props: props || {}, kids: [],
    onClick: (props && props.onClick) || null,
    text: (props && props.text) || "",
    appendChild: function (c) { n.kids.push(c); return c; },
    remove: function () { n.removed = true; env0.removed.push(n); return n; }
  };
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
    if (k && typeof k === "object") n.kids.push(k);
  });
  return n;
}
function walk(n, out) {
  out = out || [];
  if (!n) return out;
  if (n.tag) out.push(n);
  (n.kids || []).forEach(function (k) { walk(k, out); });
  return out;
}
function fmtNum(n) {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ---------- موظفون أصطناعيون بالشكل القديم الحقيقي ---------- */
function oldWeek(key, o) {
  o = o || {};
  const p = key.split("-").map(Number);
  const start = D(p[0], p[1], p[2]);
  return Object.assign({
    key: key, startTs: start, endTs: start + 6 * 86400000, dailyWage: 100,
    days: [0, 1, 2, 3, 4, 5, 6].map(function () { return { status: "work", penalty: 0, bonus: 0, note: "" }; }),
    bonuses: [], penalties: [], advances: [], deductions: [], weekNote: "",
    paid: false, paidAt: null, snapshot: null
  }, o);
}
function mkEnv(employees) {
  const store = {}; store["malahy_employees_v1"] = employees;
  const env = { store: store, writes: 0, toasts: [], denyCalls: 0, goCalls: 0, mounted: [], removed: env0.removed };
  env.permOk = true;
  const loadJSON = function (k, d) { return (k in store) ? store[k] : d; };
  const saveJSON = function (k, v) { env.writes++; store[k] = JSON.parse(JSON.stringify(v)); return true; };
  const MalahyPerm = {
    hasPerm: function () { return env.permOk; },
    deny: function () { env.denyCalls++; }
  };
  const document = { body: { appendChild: function (n) { env.mounted.push(n); } } };
  const toast = function (m) { env.toasts.push(m); };
  const empGo = function () { env.goCalls++; };
  const _emp = { list: null };
  const names = ["empLoad", "empSave", "empMigrate", "empRunMigration", "empPendingMigration", "empMigrationGate"];
  const body = names.map(function (n) { return extractFunction(htmlSrc, n); }).join("\n")
    + "\nreturn {empLoad:empLoad,empSave:empSave,empMigrate:empMigrate,empRunMigration:empRunMigration,"
    + "empPendingMigration:empPendingMigration,empMigrationGate:empMigrationGate};";
  /* eslint-disable no-new-func */
  const api = new Function("loadJSON", "saveJSON", "toast", "empGo", "document", "MalahyPerm",
    "PR", "el", "fmtNum", "K_EMP", "_emp", body)(
      loadJSON, saveJSON, toast, empGo, document, MalahyPerm,
      function () { return P; }, el, fmtNum, "malahy_employees_v1", _emp);
  env.api = api;
  return env;
}
function buttonsOf(env) {
  const last = env.mounted[env.mounted.length - 1];
  return walk(last).filter(function (n) { return n.tag === "button"; });
}

console.log("PAYROLL MIGRATION GATE - explicit confirmation, no automatic migration");

/* ==========================================================================
 * 1) لا ترحيل تلقائي: الفتح صفر كتابة
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [oldWeek("2026-10-03")], }]);
  const list = env.api.empLoad();
  eq("1a loading performs zero writes", env.writes, 0);
  eq("1b nothing was migrated by loading", list[0].days, undefined);
  eq("1c no schema stamp was written", list[0].legacySchema, undefined);
  eq("1d the legacy week is untouched", list[0].weeks.length, 1);
}

/* ==========================================================================
 * 2) الكشف عن الترحيل المعلّق — قراءة خالصة
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [oldWeek("2026-10-03"), oldWeek("2026-09-26", { paid: true, snapshot: { net: 700 } })] }]);
  env.api.empLoad();
  const pend = env.api.empPendingMigration();
  eq("2a the pending migration is detected", pend.employees, 1);
  eq("2b both weeks are counted", pend.weeks, 2);
  eq("2c the paid week is counted separately", pend.weeksPaid, 1);
  eq("2d detection performs zero writes", env.writes, 0);
  const again = env.api.empPendingMigration();
  eq("2e detection is idempotent", again.weeks, 2);
  eq("2f ...and still writes nothing", env.writes, 0);
  const box = el("div", {});
  eq("2g the gate shows itself when something is pending", env.api.empMigrationGate(box), true);
  eq("2h rendering the gate performs zero writes", env.writes, 0);
}

/* ==========================================================================
 * 3) لا بوابة cuando لا شيء معلّق
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "سارة", job: "مشغل", dailyWage: 85,
    hiredAt: D(2026, 10, 1), weeks: [] }]);
  env.api.empLoad();
  const box = el("div", {});
  eq("3a a clean employee needs no gate", env.api.empMigrationGate(box), false);
  eq("3b nothing was appended", box.kids.length, 0);
  eq("3c and nothing was written", env.writes, 0);
}

/* ==========================================================================
 * 4) إلغاء التأكيد لا يكتب شيئًا
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [oldWeek("2026-10-03")] }]);
  const list = env.api.empLoad();
  const box = el("div", {});
  env.api.empMigrationGate(box);
  /* the trigger button inside the gate box */
  const trigger = walk(box).filter(function (n) { return n.tag === "button"; })[0];
  ok("4a the gate offers a trigger button", !!trigger && !!trigger.onClick);
  trigger.onClick();
  eq("4b opening the confirmation mounts an overlay", env.mounted.length, 1);
  eq("4c ...and still writes nothing", env.writes, 0);
  const btns = buttonsOf(env);
  const cancel = btns.filter(function (n) { return n.props.class === "cancel"; })[0];
  ok("4d a cancel button exists", !!cancel);
  cancel.onClick();
  ok("4e the confirmation overlay was dismissed", env.removed.length === 1);
  eq("4f cancelling performs zero writes", env.writes, 0);
  eq("4g cancelling migrates nothing", list[0].days, undefined);
  eq("4h the legacy week survives untouched", list[0].weeks.length, 1);
  /* بعدها الترحيل الصريح ما زال يعمل — لم تُفقد بيانات */
  env.api.empRunMigration();
  eq("4i a later explicit run still migrates correctly", list[0].days.length, 7);
}

/* ==========================================================================
 * 5) التأكيد بلا صلاحية لا يُرحّل
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [oldWeek("2026-10-03")] }]);
  const list = env.api.empLoad();
  const box = el("div", {});
  env.api.empMigrationGate(box);
  const trigger = walk(box).filter(function (n) { return n.tag === "button"; })[0];
  trigger.onClick();
  env.permOk = false;                       /* the permission is revoked */
  const confirm = buttonsOf(env).filter(function (n) { return n.props.class === "confirm"; })[0];
  ok("5a a confirm button exists", !!confirm);
  confirm.onClick();
  eq("5b the permission check fired", env.denyCalls, 1);
  eq("5c nothing was written", env.writes, 0);
  eq("5d nothing was migrated", list[0].days, undefined);
}

/* ==========================================================================
 * 6) التأكيد مع الصلاحية يُرحّل مرة واحدة فقط
 * ========================================================================== */
{
  const env = mkEnv([{ id: "E1", name: "أحمد", job: "كاشير", dailyWage: 100,
    hiredAt: D(2026, 1, 1), weeks: [oldWeek("2026-10-03"), oldWeek("2026-09-26", { paid: true, snapshot: { net: 700 } })] }]);
  const list = env.api.empLoad();
  const box = el("div", {});
  env.api.empMigrationGate(box);
  const trigger = walk(box).filter(function (n) { return n.tag === "button"; })[0];
  trigger.onClick();
  const confirm = buttonsOf(env).filter(function (n) { return n.props.class === "confirm"; })[0];
  confirm.onClick();
  ok("6a the confirmation wrote the file", env.writes > 0);
  eq("6b only the unpaid week entered the ledger", list[0].days.length, 7);
  eq("6c the paid week contributed nothing", P.statsUpTo(list[0], EOD()).work, 7);
  eq("6d outstanding = 7 x 100", P.statsUpTo(list[0], EOD()).outstanding, 700);
  eq("6e nothing is owed for the paid week", P.statsUpTo(list[0], EOD()).paid, 0);
  eq("6f the screen was refreshed", env.goCalls, 1);
  eq("6g no permission denial on the happy path", env.denyCalls, 0);
  /* إعادة فتح البوابة: لا شيء معلّق */
  const box2 = el("div", {});
  eq("6h the gate closes after migration", env.api.empMigrationGate(box2), false);
  /* إعادة الترحيل لا تستورد شيئًا ولا تكرر */
  const before = JSON.stringify(env.store["malahy_employees_v1"]);
  const r = env.api.empRunMigration();
  eq("6i a second explicit run imports no days", r.importedDays, 0);
  eq("6j ...and changes nothing on disk", JSON.stringify(env.store["malahy_employees_v1"]), before);
  eq("6k the ledger still holds exactly seven days", list[0].days.length, 7);
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);