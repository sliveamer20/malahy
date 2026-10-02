# FINAL RELEASE REPORT — Malahy v2.5.1

**Status: RELEASED AND PUBLISHED** — 2026-10-02

Windows distribution built, verified, committed, tagged, and published to the existing
GitHub repository with the correct installer + auto-update artifacts. All completed stable
functionality preserved.

---

## 1. Final release status

| Item | Value |
|---|---|
| Release | Malahy v2.5.1 |
| GitHub repository | `sliveamer20/malahy` (remote `origin`, unchanged) |
| Result | **SUCCESS — published** |
| Release URL | https://github.com/sliveamer20/malahy/releases/tag/v2.5.1 |
| Archive | `releases/v2.5.1/` (existing local convention preserved; gitignored) |

### Release-config changes made for this release (documented, minimal, no business logic)

Two small, required release-configuration changes were made. Neither alters any business
logic, calculations, or protected systems:

1. **`electron-builder.yml` — packaging fix (release-blocking).** The completed v2.5.1
   modules required by `main.js` (`users.js`, `permissions.js`) and loaded by `index.html`
   (`login.js`, `permissions.js`, `perm-gate.js`, `accounts.js`, `recovery.js`) were
   **absent** from the `files` list. Without this fix the packaged app could not boot
   (`main.js` `require("./users")` would fail). The six modules were added to the existing
   `files` enumeration. Verified: all six are present in the shipped `app.asar` and
   byte-identical to the source tree.
2. **`tests/protected-baseline.json` — baseline re-anchor.** `electron-builder.yml` is a
   protected baseline file, so fix (1) invalidated its recorded SHA-256. The snapshot entry
   was re-anchored to the new verified hash (`2396654f…`). The guardian assertion remains
   strict byte-identity; only the reference point was updated to the legitimate release
   value. All 15 other protected files remain byte-identical to their original capture.

---

## 2. Exact test results

14 regression suites run (`node tests/<suite>.test.js`), **722 assertions passed, 1 failed**.

| Suite | Passed | Failed | Exit |
|---|---|---|---|
| phase3b-auth.test.js | 60 | 1 | 1 |
| phase3b-ipc.test.js | 15 | 0 | 0 |
| phase3c1-dom.test.js | 37 | 0 | 0 |
| phase3c1-gate.test.js | 48 | 0 | 0 |
| phase3c1-ipc.test.js | 19 | 0 | 0 |
| phase3c1-session.test.js | 30 | 0 | 0 |
| phase3c2-baseline.test.js | 63 | 0 | 0 |
| phase3c2-gate.test.js | 44 | 0 | 0 |
| phase3c2-ipc.test.js | 49 | 0 | 0 |
| phase3c2-perms.test.js | 39 | 0 | 0 |
| phase3c3-accounts.test.js | 92 | 0 | 0 |
| phase3c3-ui.test.js | 76 | 0 | 0 |
| phase3c4-recovery.test.js | 79 | 0 | 0 |
| phase4-daily-report.test.js | 71 | 0 | 0 |
| **TOTAL** | **722** | **1** | — |

---

## 3. Known historical test failure (reproduced, accepted)

**Suite:** `tests/phase3b-auth.test.js`
**Assertion:** `all protected files byte-identical to pre-phase baseline`
**Message:** `:: changed: index.html`

This is the **exact, already-documented historical baseline mismatch** (see
`PHASE_3C2_PERMISSION_ENFORCEMENT.md` §"known failure", `PHASE_3C3_…md` §10,
`PHASE_3C4_1_…md`, `PHASE_3C4_2_…md`). It occurs because `phase3b-auth.test.js` compares
`index.html` against a frozen pre-Phase-3B SHA-256 snapshot, and `index.html` is the one
file Phases 3C-1/3C-2/3C-3/3C-4 and Phase 4 intentionally change (login screen, permission
gate wiring, account management UI, recovery UI, report printing).

**Acceptance criteria — all met:**

- Exactly the single documented assertion fails; **no additional assertion fails.**
- The current integrity/baseline guardians pass in full:
  `phase3c1-gate.test.js` **48/48**, `phase3c2-baseline.test.js` **63/63**.
- The guardians confirm **all 15 other protected files are byte-identical** to the
  pre-phase baseline (`database.js`, `activation.js`, `update-gate.js`, `README.md`,
  `launch.js`, `electron-builder.yml` (re-anchored), icons/logo, ticket template JS + SVG,
  QR vendor lib, `windows/splash.html`, `windows/update.html`).
- **No test was modified or weakened to make the release pass.** The frozen Phase 3B
  artifact was left untouched.

---

## 4. Build command used

```powershell
npm run dist
# => electron-builder --win --publish never
# electron-builder 26.15.3, Electron 43.7.5, target nsis, arch x64
```

The stale `dist/` (containing the previous `malahy-setup-2.5.0.exe`) was **fully cleared
before building** so no cached/older artifact could contaminate the release.

---

## 5. Installer filename

`malahy-setup-2.5.1.exe`

---

## 6. Installer exact size

**105,925,158 bytes** (~101.0 MiB)

---

## 7. SHA-256

```
2b24e78a8faf26a2769eb4dc42a12aacbad02f26a52269a6c11ba64d2edee4a5
```

---

## 8. SHA-512

Hex:
```
b387488da46815f302a4a98fb090c8af758fdb3dbc92bb1784666b8b9891e604db68536f9d043012bbd11961b934f28a17982a9ddcf7dcbb152f564745df8f3d
```

Base64 (the form the auto-update system uses in `latest.yml`):
```
s4dIjaRoFfMCpKmPsJDIr3WP2z28krsXhGZri5iR5gTbaFNvnQQwErvRGWG5NPKKF5gqndz33LsVL1ZHRd+PPQ==
```

---

## 9. FileVersion

**2.5.1** (NSIS installer `malahy-setup-2.5.1.exe`)

---

## 10. ProductVersion

**2.5.1** (installer) / **2.5.1.0** (unpacked app executable `كوكي بارك.exe`)

Package version (`package.json`): **2.5.1** · Runtime version (`app.getVersion()`): **2.5.1** ·
`FLOOR_VERSION` (`update-gate.js`): **2.5.1** · Architecture: **x64 (win32, nsis)**

---

## 11. Git commit hash

```
a3e790d0488d408b3e637248b63eb4dad5482063
```

Commit message: `release: Malahy v2.5.1` — 42 files changed, 12,501 insertions(+), 270 deletions(-).
Committed only legitimate v2.5.1 source/test/report/release changes. Previous release
history was not rewritten.

---

## 12. Git tag

**`v2.5.1`** — annotated tag, object `63ab96df4337ffb9d4eff38d34887d53480e7319`,
points at commit `a3e790d0488d408b3e637248b63eb4dad5482063`.
Verified non-existent locally and remotely before creation; pushed to `origin`.
Not force-moved or overwritten.

---

## 13. GitHub Release status

| Item | Value |
|---|---|
| Release ID | 401524681 |
| Tag | `v2.5.1` |
| Title | `Malahy v2.5.1` |
| State | **published** (not draft, not prerelease) |
| URL | https://github.com/sliveamer20/malahy/releases/tag/v2.5.1 |
| Is `latest` | Yes (confirmed via `/releases/latest`) |

---

## 14. Uploaded release artifacts

| Asset | Size | Purpose |
|---|---|---|
| `malahy-setup-2.5.1.exe` | 105,925,158 | NSIS x64 Windows installer (the update payload) |
| `malahy-setup-2.5.1.exe.blockmap` | 111,173 | Block map for differential/auto-update |
| `latest.yml` | 341 | Updater metadata (version + sha512 + size) |

No development files were uploaded. This matches the existing project convention
(the v2.5.0 release shipped the same three artifact types).

---

## 15. Auto-update verification

All checks pass — the published release is exactly what `electron-updater` expects:

| Check | Result |
|---|---|
| `/releases/latest` tag = `v2.5.1` | PASS |
| `latest.yml` remote == local (byte-identical) | PASS |
| `latest.yml` version = `2.5.1` | PASS |
| `latest.yml` artifact = `malahy-setup-2.5.1.exe` (matches `path` and `files[].url`) | PASS |
| Declared size `105925158` == uploaded asset size | PASS |
| Declared SHA-512 == SHA-512 of the uploaded installer | PASS |
| Block map present | PASS |
| Mandatory update gate (`FLOOR_VERSION` = `2.5.1`) | PASS |

Mandatory-update gate behavior simulated with `update-gate.js evaluate()`:

| Installed | Server state | Decision |
|---|---|---|
| 2.5.0 | reachable, latest 2.5.1 | **update** (forced) |
| 2.5.1 | reachable, latest 2.5.1 | **proceed** |
| 2.5.1 | offline | **proceed** |
| 2.5.0 | offline | **locked** (clear reason + manual download) |

The updater was not redesigned; the existing mechanism was verified against v2.5.1.

---

## 16. Confirmation: no secrets / user databases committed or packaged

- **Secrets scan:** 0 hits for API keys, tokens, credentials, or
  5MinutesAPI / WAHA / OpenWA / Baileys / WhatsApp Cloud API anywhere in the project or the
  packaged app. (The only textual occurrences are in `AI_REPORTS/` documentation stating
  these integrations are explicitly absent.)
- **No HTTP client / WhatsApp library is installed** — the recovery handoff is a manual
  `wa.me` link via `shell.openExternal`; no automatic send path exists.
- **Recovery code is never persisted in plaintext:** only `codeHash` (salted SHA-256) is
  stored; the code lives solely in the one-time `wa.me` payload, expires after 10 minutes,
  is single-use, and is never logged.
- **Passwords:** scrypt hashes only (`scrypt:N:r:p:salt:hash`); no plaintext password is
  stored. Confirmed by the passing auth suites.
- **Production database untouched:** the store lives in the OS `userData` folder
  (`app.getPath("userData")/malahy-data.json`), outside the repository and outside the
  package. All tests run against in-memory shims; the real DB file is never opened.
- **Nothing packaged that should not be:** 0 suspicious files in the shipped `app.asar`
  (no `.env`, `.pem`, `.p12`, `.cert`, `.key`, `.log`, `.bak`); 0 secret/integration hits in
  the packaged JS/HTML/JSON. electron-builder stripped `scripts` and `devDependencies` from
  the packaged `package.json` (standard, correct normalization).
- **Commit contents reviewed:** the 42 committed files are source (`*.js`, `index.html`),
  assets (`assets/report`, `assets/ticket`, `assets/vendor`), tests (`tests/`), and reports
  (`AI_REPORTS/`). No databases, local user data, credentials, logs, or generated junk.

---

## 17. Final git status

```
?? qa-ticket-renders/
```

Working tree is clean apart from the intentionally-untracked `qa-ticket-renders/` directory
(generated ticket-render PNGs from QA). It was deliberately **excluded** from the release
commit as a generated artifact. `dist/` and `releases/` remain gitignored per `.gitignore`.
Both `main` and tag `v2.5.1` are pushed to `origin`.

---

## 18. Remaining limitations

1. **No installed-app smoke harness.** The project has no automated installed-app smoke
   test; verification was performed against the packaged build structurally (PE version
   resources, `app.asar` contents, byte-identity of every shipped module against the source
   tree, updater-metadata cross-check) rather than by launching the installed application.
   The app was intentionally not launched to guarantee the production `userData` database
   could not be touched.
2. **Physical printing not re-tested in this session.** Printer/ticket/QR code is
   byte-identical to the verified v2.5.0 baseline (confirmed by the passing guardians), so
   the on-site Xerox VersaLink B400 limitation noted in the v2.5.0 report still applies
   (WSD/IPP driver rejects silent programmatic print settings; thermal 58mm/80mm hardware
   was unavailable).
3. **The historical Phase 3B baseline assertion** remains red by design (see §3). It is a
   frozen end-of-phase snapshot whose scope has closed; the active guardians cover the same
   protection and pass in full. It should not be "fixed" by editing the protected Phase 3B
   artifact.

---

### Packaged source integrity (18 files checked)

All shipped modules are **byte-identical** to the current v2.5.1 working tree — confirming
the installer is genuinely v2.5.1 and not an older cached build:

`main.js`, `preload.js`, `index.html`, `users.js`, `permissions.js`, `perm-gate.js`,
`login.js`, `accounts.js`, `recovery.js`, `database.js`, `activation.js`, `update-gate.js`,
`assets/report/daily-report.js`, `assets/ticket/ticket-template.js`,
`assets/ticket/ticket-template.svg`, `assets/vendor/qrcode.js`, `windows/splash.html`,
`windows/update.html` — **IDENTICAL**; `package.json` — differs only by electron-builder's
`scripts`/`devDependencies` strip (version unchanged at 2.5.1).
