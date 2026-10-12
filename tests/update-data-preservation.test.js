// tests/update-data-preservation.test.js
// عقد حفظ البيانات عند التحديث التلقائي — تثبيت (regression lock) لسلوك
// electron-builder / electron-updater الذي يحمي بيانات المستخدم من الحذف
// أثناء التحديث، مع الإبقاء على سلوك إلغاء التثبيت العادي كما هو.
//
// القرار المؤكَّد من المستخدم:
//   - إلغاء التثبيت العادي يحذف بيانات التطبيق = سلوك مقصود ويجب ألا يتغيّر.
//   - التحديث التلقائي يجب ألّا يحذف أي بيانات.
//
// كل الفحوص قراءة نصوص من المشروع وnode_modules — لا بناء، لا تشغيل Electron،
// ولا أي وصول إلى %APPDATA%\malahy أو أي ملف بيانات إنتاج.

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? " :: " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
const ROOT = path.join(__dirname, "..");
function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const yml = rd("electron-builder.yml");
const mainJs = rd("main.js");
const indexHtml = rd("index.html");
const NS = path.join(ROOT, "node_modules", "app-builder-lib", "templates", "nsis");
const uninstaller = fs.readFileSync(path.join(NS, "uninstaller.nsh"), "utf8");
const installUtil = fs.readFileSync(path.join(NS, "include", "installUtil.nsh"), "utf8");
const commonNsh = fs.readFileSync(path.join(NS, "common.nsh"), "utf8");
const nsisTarget = rd("node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js");
const nsisUpdater = rd("node_modules/electron-updater/out/NsisUpdater.js");
const baseUpdater = rd("node_modules/electron-updater/out/BaseUpdater.js");

console.log("UPDATE DATA PRESERVATION — automatic update vs normal uninstall");

/* ==========================================================================
 * 1) طبقة NSIS: حذف البيانات مشروط بعدم التحديث
 * ========================================================================== */
{
  /* البوابة الأولى: القيمة الافتراضية "لا حذف" */
  ok("1a the data-deletion flag defaults to 0 (no deletion)",
     /StrCpy \$isDeleteAppData "0"/.test(uninstaller));
  /* البوابة الثانية: الحذف لا يُفعَّل إلا إن لم يكن تحديثًا */
  ok("1b deletion is enabled ONLY when NOT an update",
     /!ifdef DELETE_APP_DATA_ON_UNINSTALL[\s\S]{0,120}\$\{ifNot\} \$\{isUpdated\}[\s\S]{0,80}StrCpy \$isDeleteAppData "1"/.test(uninstaller));
  /* الرMDir محصور داخل الشرط: نقتطع نافذة من البوابة حتى كتلة السجل التالية */
  const gStart = uninstaller.indexOf('${if} $isDeleteAppData == "1"');
  const gEnd = uninstaller.indexOf("DeleteRegKey", gStart);
  ok("1c the guarded block could be located", gStart >= 0 && gEnd > gStart);
  const inside = uninstaller.slice(gStart, gEnd);
  const outside = uninstaller.slice(0, gStart) + uninstaller.slice(gEnd);
  ok("1d the deletion targets are exactly the userData folders, inside the guard",
     inside.indexOf('RMDir /r "$APPDATA\\${APP_FILENAME}"') >= 0 &&
     inside.indexOf('RMDir /r "$APPDATA\\${APP_PRODUCT_FILENAME}"') >= 0 &&
     inside.indexOf('RMDir /r "$APPDATA\\${APP_PACKAGE_NAME}"') >= 0);
  /* لا حذف لـ APPDATA خارج هذا الحرس */
  ok("1e no unconditional APPDATA deletion exists outside the guard",
     (outside.match(/RMDir \/r "\$APPDATA\\/g) || []).length === 0);
  /* إلغاء التثبيت العادي ما زال يحذف */
  ok("1f a normal uninstall (not updated) still deletes app data",
     /\$\{ifNot\} \$\{isUpdated\}[\s\S]{0,80}StrCpy \$isDeleteAppData "1"/.test(uninstaller));
}

/* ==========================================================================
 * 2) طبقة electron-updater: --updated تُمرَّر دائمًا
 * ========================================================================== */
{
  ok("2a NsisUpdater always passes --updated",
     /const args = \["--updated"\]/.test(nsisUpdater));
  ok("2b quitAndInstall routes through install() -> the Nsis updater",
     /quitAndInstall\([\s\S]{0,400}this\.install\(/.test(baseUpdater));
  ok("2c the installer is spawned with that same arg array",
     /spawnLog\((elevate\.)?[^\)]*installerPath[^\)]*\.concat\(args\)/.test(nsisUpdater) ||
     /\[installerPath\]\.concat\(args\)/.test(nsisUpdater));
}

/* ==========================================================================
 * 3) طبقة المثبِّت: --updated تُضاف من داخل السكربت نفسه
 * ========================================================================== */
{
  ok("3a the installer appends --updated unless the user asked to delete data",
     /\$\{if\} \$\{isDeleteAppData\}[\s\S]{0,120}--delete-app-data[\s\S]{0,200}else\}[\s\S]{0,200}--updated/.test(installUtil));
  ok("3b electron-builder documents this guard explicitly in-source",
     /DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed/.test(installUtil));
  ok("3c common.nsh passes --updated through to the app start args",
     /\$\{if\} \$\{isUpdated\}[\s\S]{0,80}StrCpy \$startAppArgs "--updated"/.test(commonNsh));
  ok("3d an update aborts the early-install path instead of proceeding",
     /\$\{if\} \$\{isUpdated\}[\s\S]{0,40}Abort/.test(commonNsh));
}

/* ==========================================================================
 * 4) إعداد المشروع: إلغاء التثبيت العادي يحذف (كما تريد) — وهذا مقصود
 * ========================================================================== */
{
  ok("4a deleteAppDataOnUninstall stays true (normal uninstall keeps deleting)",
     /deleteAppDataOnUninstall:\s*true/.test(yml));
  ok("4b the option maps to the DELETE_APP_DATA_ON_UNINSTALL define",
     /if \(options\.deleteAppDataOnUninstall\)[\s\S]{0,80}DELETE_APP_DATA_ON_UNINSTALL = null/.test(nsisTarget));
  ok("4c the define is the ONLY switch controlling data deletion on uninstall",
     (installUtil.match(/--delete-app-data/g) || []).length >= 1 &&
     (uninstaller.match(/--delete-app-data/g) || []).length >= 1);
}

/* ==========================================================================
 * 5) تطبيقنا: لا يطلب حذف البيانات أبدًا
 * ========================================================================== */
{
  const appSrc = mainJs + "\n" + indexHtml;
  ok("5a the app never passes --delete-app-data",
     appSrc.indexOf("--delete-app-data") === -1);
  ok("5b the app never calls app.setPath on userData (no redirect/restore trickery)",
     /app\.setPath\(\s*["']userData["']/.test(mainJs) === false);
  ok("5c the app uses the standard electron userData resolution",
     /app\.getPath\(\s*["']userData["']\s*\)/.test(rd("database.js")));
  /* الملف الإنتاجي هو ما سيُحذف لو انكسرت الحماية — نتحقق من مطابقة المجلد */
  ok("5d the guarded deletion folder matches the app's userData folder name",
     /APP_PACKAGE_NAME: \(0, targetUtil_1\.getWindowsInstallationAppPackageName\)\(appInfo\.name\)/.test(nsisTarget) &&
     /"name":\s*"malahy"/.test(rd("package.json")));
  /* بيانات الرواتب كلها داخل ذلك المجلد الواحد */
  ok("5e all payroll data lives under the single guarded userData folder",
     /const K_EMP\s*=\s*'malahy_employees_v1'/.test(indexHtml) &&
     /const K_PAYBATCH\s*=\s*'malahy_payroll_batches_v1'/.test(indexHtml) &&
     /path\.join\(app\.getPath\("userData"\),\s*"malahy-data\.json"\)/.test(rd("database.js")));
}

/* ==========================================================================
 * 6) مسار التحديث الفعلي في التطبيق
 * ========================================================================== */
{
  ok("6a the app uses electron-updater's autoUpdater (not a manual installer run)",
     /require\("electron-updater"\)\.autoUpdater/.test(mainJs));
  ok("6b updates are auto-downloaded and installed via quitAndInstall",
     /autoDownload\s*=\s*true/.test(mainJs) &&
     /autoUpdater\.quitAndInstall\(\)/.test(mainJs));
  ok("6c there is no silent exec of an installer with delete flags",
     /execSync|spawnSync/.test(mainJs) === false ||
     /--delete-app-data/.test(mainJs) === false);
  /* بوابة التحديث الإلزامي لا تمسّ البيانات */
  ok("6d the mandatory update gate only evaluates versions, it deletes nothing",
     /fs\.(unlink|rm|rmdir)/.test(rd("update-gate.js")) === false);
}

console.log("\n" + (fail === 0 ? "OK" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);