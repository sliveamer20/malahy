/* printer-readiness.js — فحص جاهزية الطابعة قبل إرسال أي مهمة طباعة إلى ويندوز.
 *
 * المشكلة التي تحلّها هذه الوحدة:
 *   إلكترون/كروميوم يسلّم المهمة إلى Print Spooler في ويندوز ثم يُرجع نجاحًا
 *   بمعنى «قُبلت المهمة»، لا بمعنى «طُبعت الورقة». لو كانت الطابعة مفصولة أو
 *   متوقفة، يحتفظ الـ Spooler بالمهمة ويعيد تشغيلها عند عودة الطابعة — فتُطبع
 *   تذاكر قديمة متأخرة. لذلك نفحص جاهزية الطابعة من ويندوز نفسه قبل الإرسال،
 *   ولا نرسل شيئًا إن لم نستطع إثبات الجاهزية.
 *
 * الفحص يعتمد على واجهات ويندوز الأصلية (WMI/CIM) وعلى وجود جهاز USB الفعلي
 * في شجرة PnP، وعلى فحص منفذ الشبكة للطابعات TCP/IP. لا يكتب أي ملف، ولا
 * يحتفظ بأي مهمة، ولا يعيد المحاولة.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const net = require("net");
const { execFile } = require("child_process");

/* مهلة استدعاء PowerShell. الفحص يجب أن يفشل بأمان لا أن يعلّق الواجهة. */
const PROBE_TIMEOUT_MS = 8000;
/* مهلة فحص منفذ الشبكة. الطابعة الحقيقية ترد خلال أجزاء من الثانية. */
const TCP_TIMEOUT_MS = 1400;

/* سكربت PowerShell: يقرأ حالة الطابعة المطلوبة (أو الافتراضية) من ويندوز،
 * وجودة جهاز USB المرتبط بمنفذها، ومنافذ TCP/IP. الاسم يُمرَّر عبر متغير
 * بيئة (وليس داخل السكربت) فلا توجد أي إمكانية لحقن أوامر من الواجهة. */
const PROBE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  "$WarningPreference = 'SilentlyContinue'",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "try {",
  "  $target = [string]$env:MALAHY_PRINT_TARGET",
  "  $all = @(Get-CimInstance Win32_Printer -ErrorAction Stop)",
  "  if ([string]::IsNullOrWhiteSpace($target)) {",
  "    $p = $all | Where-Object { $_.Default -eq $true } | Select-Object -First 1",
  "  } else {",
  "    $p = $all | Where-Object { [string]$_.Name -ieq $target } | Select-Object -First 1",
  "  }",
  "  $tcpPorts = @()",
  "  try { $tcpPorts = @(Get-CimInstance Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | Select-Object Name, HostAddress, PortNumber, Protocol) } catch {}",
  "  $usbPort = $null",
  "  if ($p) {",
  "    $portName = [string]$p.PortName",
  "    if ($portName -match '^USB') {",
  "      $usbKey = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports\\' + $portName",
  "      if (Test-Path $usbKey) {",
  "        $v = Get-ItemProperty $usbKey -ErrorAction SilentlyContinue",
  "        $devId = [string]$v.'Device Id'",
  "        $present = $false",
  "        $devStatus = ''",
  "        $cfg = -1",
  "        if ($devId) {",
  "          $esc = $devId.Replace('\\', '\\\\').Replace(\"'\", \"''\")",
  "          $d = Get-CimInstance Win32_PnPEntity -Filter \"DeviceID='$esc'\" -ErrorAction SilentlyContinue | Select-Object -First 1",
  "          if ($d) { $present = $true; $devStatus = [string]$d.Status; $cfg = [int]$d.ConfigManagerErrorCode }",
  "        }",
  "        $usbPort = [pscustomobject]@{ Name = $portName; DeviceId = $devId; Present = $present; DeviceStatus = $devStatus; ConfigManagerErrorCode = $cfg }",
  "      }",
  "    }",
  "  }",
  "  $spooler = ''",
  "  $svc = Get-Service -Name Spooler -ErrorAction SilentlyContinue",
  "  if ($svc) { $spooler = [string]$svc.Status }",
  "  $result = [pscustomobject]@{",
  "    ok = $true",
  "    found = [bool]$p",
  "    target = $target",
  "    spooler = $spooler",
  "    names = @($all | ForEach-Object { [string]$_.Name })",
  "    printer = if ($p) { [pscustomobject]@{",
  "      Name = [string]$p.Name",
  "      WorkOffline = [bool]$p.WorkOffline",
  "      PrinterStatus = [int]$p.PrinterStatus",
  "      ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus",
  "      DetectedErrorState = [int]$p.DetectedErrorState",
  "      PrinterState = [int]$p.PrinterState",
  "      Status = [string]$p.Status",
  "      PortName = [string]$p.PortName",
  "      Default = [bool]$p.Default",
  "      Local = [bool]$p.Local",
  "      Network = [bool]$p.Network",
  "      JobCount = [int]$p.JobCount",
  "      DriverName = [string]$p.DriverName",
  "    } } else { $null }",
  "    tcpPorts = $tcpPorts",
  "    usbPort = $usbPort",
  "  }",
  "  $result | ConvertTo-Json -Depth 6 -Compress",
  "} catch {",
  "  [pscustomobject]@{ ok = $false; error = [string]$_.Exception.Message } | ConvertTo-Json -Compress",
  "}",
].join("\r\n");

/* مسار PowerShell النظامي. لا نستخدم shell إطلاقًا. */
function powershellPath() {
  const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const full = path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    if (fs.existsSync(full)) return full;
  } catch (_) {}
  return "powershell.exe";
}

function parseProbeOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}
  /* بعض إصدارات PowerShell قد تطبع سطرًا تحذيريًا قبل JSON — نقرأ آخر كائن. */
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].charAt(0) !== "{") continue;
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {}
  }
  return null;
}

function runProbe(printerName) {
  return new Promise((resolve, reject) => {
    const target = typeof printerName === "string" ? printerName.trim() : "";
    const encoded = Buffer.from(PROBE_SCRIPT, "utf16le").toString("base64");
    const env = Object.assign({}, process.env, { MALAHY_PRINT_TARGET: target });
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
    ];
    try {
      execFile(
        powershellPath(),
        args,
        {
          windowsHide: true,
          timeout: PROBE_TIMEOUT_MS,
          maxBuffer: 2 * 1024 * 1024,
          encoding: "utf8",
          env: env,
        },
        (err, stdout, stderr) => {
          if (err) {
            const e = new Error("printer-probe-failed");
            e.code = err.code;
            e.killed = !!err.killed;
            e.stderr = String(stderr || "").slice(0, 500);
            reject(e);
            return;
          }
          const parsed = parseProbeOutput(stdout);
          if (!parsed) {
            reject(new Error("printer-probe-invalid-json"));
            return;
          }
          resolve(parsed);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

/* فحص عنوان TCP مع محاولة المنافذ المعتادة للطابعات. الهدف إثبات أن الجهاز
 * نفسه موجود على الشبكة، لا مجرد وجود اسمه في سجل ويندوز. */
function tcpReachable(host, preferredPort) {
  const h = String(host || "").trim();
  if (!h) return Promise.resolve(false);
  const ports = [];
  const add = (v) => {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && n < 65536 && ports.indexOf(n) === -1) ports.push(n);
  };
  add(preferredPort);
  add(9100);
  add(515);
  add(631);
  if (!ports.length) return Promise.resolve(false);

  return Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve) => {
          let done = false;
          const socket = net.connect({ host: h, port: port });
          const finish = (ok) => {
            if (done) return;
            done = true;
            try { socket.destroy(); } catch (_) {}
            resolve(ok);
          };
          socket.setTimeout(TCP_TIMEOUT_MS);
          socket.once("connect", () => finish(true));
          socket.once("timeout", () => finish(false));
          socket.once("error", () => finish(false));
        })
    )
  ).then((results) => results.some(Boolean));
}

const BLOCKED_EXTENDED = {
  7: "offline",
  8: "paused",
  9: "error",
  11: "not-available",
  16: "pending-deletion",
  21: "paper-jam",
  22: "paper-out",
  23: "door-open",
  24: "out-of-memory",
  25: "output-bin-full",
  26: "user-intervention",
  27: "server-unknown",
};

const BLOCKED_DETECTED_ERROR = {
  1: "error",
  4: "paper-out",
  6: "no-toner",
  7: "door-open",
  8: "paper-jam",
  9: "offline",
  10: "service-requested",
  11: "output-bin-full",
};

/* أعلام PrinterState (Win32_Printer). نتجاهل التحذيرات غير المانعة مثل
 * انخفاض الحبر/الورق، ونمنع فقط الحالات التي تعني أن الطباعة لن تحدث. */
const BLOCKED_STATE_FLAGS = [
  [1, "error"],                 /* Other */
  [64, "offline"],
  [128, "paused"],
  [256, "error"],
  [4096, "paper-jam"],
  [8192, "paper-out"],
  [32768, "paper-problem"],
  [2097152, "user-intervention"],
  [4194304, "out-of-memory"],
  [8388608, "server-unknown"],
  [16777216, "door-open"],
  [65536, "offline"],
];

const BLOCKED_STATUS_TEXT = [
  "error",
  "degraded",
  "pred fail",
  "stressed",
  "nonrecover",
  "no contact",
  "lost comm",
  "stopping",
  "service",
];

function failed(reason, detail, extra) {
  const out = { ok: false, reason: reason, detail: detail };
  if (extra) Object.keys(extra).forEach((k) => { out[k] = extra[k]; });
  return out;
}

/* تقييم نتيجة الفحص (منفصل عن تنفيذ PowerShell حتى يكون قابلًا للاختبار). */
async function evaluateProbe(probe, target, options) {
  options = options || {};
  const wanted = typeof target === "string" ? target.trim() : "";
  if (!probe || probe.ok !== true) {
    return failed("printer-not-ready", "probe-failed", {
      probeError: probe && probe.error ? String(probe.error).slice(0, 200) : "",
    });
  }
  if (probe.spooler && String(probe.spooler).toLowerCase() !== "running") {
    return failed("printer-not-ready", "spooler-" + String(probe.spooler).toLowerCase(), {
      available: Array.isArray(probe.names) ? probe.names : [],
    });
  }
  if (!probe.found || !probe.printer) {
    return failed(wanted ? "printer-not-found" : "no-printer-selected", "not-found", {
      available: Array.isArray(probe.names) ? probe.names : [],
    });
  }

  const p = probe.printer;
  const base = {
    printerName: String(p.Name || wanted),
    portName: String(p.PortName || ""),
    status: {
      workOffline: p.WorkOffline === true,
      printerStatus: Number(p.PrinterStatus) || 0,
      extendedPrinterStatus: Number(p.ExtendedPrinterStatus) || 0,
      detectedErrorState: Number(p.DetectedErrorState) || 0,
      printerState: Number(p.PrinterState) || 0,
    },
  };

  if (p.WorkOffline === true) return failed("printer-not-ready", "offline", base);

  const ext = Number(p.ExtendedPrinterStatus) || 0;
  if (BLOCKED_EXTENDED[ext]) return failed("printer-not-ready", BLOCKED_EXTENDED[ext], base);

  const ps = Number(p.PrinterStatus) || 0;
  if (ps === 7) return failed("printer-not-ready", "offline", base);
  if (ps === 6) return failed("printer-not-ready", "paused", base);
  if (ps === 1) return failed("printer-not-ready", "error", base);

  const des = Number(p.DetectedErrorState) || 0;
  if (BLOCKED_DETECTED_ERROR[des]) return failed("printer-not-ready", BLOCKED_DETECTED_ERROR[des], base);

  const state = Number(p.PrinterState) || 0;
  for (let i = 0; i < BLOCKED_STATE_FLAGS.length; i++) {
    const flag = BLOCKED_STATE_FLAGS[i];
    if ((state & flag[0]) !== 0) return failed("printer-not-ready", flag[1], base);
  }

  const statusText = String(p.Status || "").trim().toLowerCase();
  if (statusText && BLOCKED_STATUS_TEXT.indexOf(statusText) !== -1) {
    return failed("printer-not-ready", "status-" + statusText.replace(/\s+/g, "-"), base);
  }

  const port = String(p.PortName || "");
  const lower = port.toLowerCase();

  /* المنافذ الافتراضية/الظاهرية: حالة الـ Spooler هي المرجع، ولا يوجد جهاز
   * فيزيائي يمكن فحصه. */
  if (!lower || lower === "nul:" || lower === "portprompt:" || lower === "file:") {
    return { ok: true, printer: base.printerName, portName: port, status: base.status };
  }

  if (lower.indexOf("usb") === 0) {
    const usb = probe.usbPort && String(probe.usbPort.Name || "").toLowerCase() === lower
      ? probe.usbPort
      : null;
    if (!usb || !usb.DeviceId) {
      /* لا نعرف أي جهاز USB يقف خلف المنفذ => لا نستطيع إثبات الجاهزية. */
      return failed("printer-not-ready", "usb-unverified", base);
    }
    if (usb.Present !== true) return failed("printer-not-ready", "usb-device-absent", base);
    if (Number(usb.ConfigManagerErrorCode) !== 0) {
      return failed("printer-not-ready", "usb-device-error", base);
    }
    if (usb.DeviceStatus && String(usb.DeviceStatus).toLowerCase() !== "ok") {
      return failed("printer-not-ready", "usb-device-not-ready", base);
    }
    return { ok: true, printer: base.printerName, portName: port, status: base.status };
  }

  const tcpPorts = Array.isArray(probe.tcpPorts) ? probe.tcpPorts : [];
  const tcp = tcpPorts.filter((x) => x && String(x.Name || "").toLowerCase() === lower)[0] || null;
  if (tcp && tcp.HostAddress) {
    const check = options.tcpReachable || tcpReachable;
    const reachable = await check(String(tcp.HostAddress), tcp.PortNumber);
    if (!reachable) return failed("printer-not-ready", "network-unreachable", base);
    return { ok: true, printer: base.printerName, portName: port, status: base.status };
  }

  /* منفذ غير معروف (WSD/IPP/COM/LPT/مشاركة شبكية...): لا يمكن إثبات أن الجهاز
   * متصل فعلًا. نفشل بأمان بدل إرسال مهمة قد تبقى في الـ Spooler. */
  return failed("printer-not-ready", "port-unverified", base);
}

async function checkPrinterReady(printerName, options) {
  options = options || {};
  const target = typeof printerName === "string" ? printerName.trim() : "";
  let probe;
  try {
    probe = options.probe ? await options.probe(target) : await runProbe(target);
  } catch (err) {
    return failed("printer-not-ready", "probe-failed", {
      probeError: String((err && err.message) || err).slice(0, 200),
    });
  }
  return evaluateProbe(probe, target, options);
}

module.exports = {
  checkPrinterReady: checkPrinterReady,
  evaluateProbe: evaluateProbe,
  tcpReachable: tcpReachable,
  runProbe: runProbe,
  parseProbeOutput: parseProbeOutput,
  PROBE_SCRIPT: PROBE_SCRIPT,
};
