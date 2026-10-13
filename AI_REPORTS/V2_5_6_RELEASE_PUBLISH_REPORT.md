# Malahy v2.5.6 — Release Publish Report

**Status:** `PUBLISHED` — GitHub Release live and verified.
**Publication date:** 2026-10-13 (release created `2026-10-13T03:49:14Z`)
**Repository:** `sliveamer20/malahy` (`https://github.com/sliveamer20/malahy.git`)
**Release URL:** https://github.com/sliveamer20/malahy/releases/tag/v2.5.6

---

## 1. Release Identity

| Item | Value |
|---|---|
| Version | `2.5.6` (`package.json`) |
| Source commit (tagged) | `0a548ad208deb595b97830126dd40dc12249acbb` — `release: v2.5.6 payroll disbursement reports (thermal, PDF and Excel exports)` |
| Release-validation commit | `4a7338c49921690baa5c664c90837ded96ae4c94` (test-only, on top of the release commit) |
| Tag | annotated `v2.5.6` → object `734ddb2b…` → peels to `0a548ad…` |
| Branch | `main` |
| Previous release | `v2.5.5` (preserved untouched) |

**Intentional tag/commit relationship (documented):** the tag remains on the release commit `0a548ad`, exactly as created before this review. A separate, clearly named **release-validation commit** `4a7338c` sits on top of it, containing only test corrections. This mirrors the project's existing convention (`v2.5.5` is tagged on `969ccc0`, with the later docs commit `0ef9cc2` on top). The tag was **not** moved, amended, or recreated; the release commit was **not** rewritten.

## 2. Test Results

Focused suites:

```
node tests/payroll-ui.test.js            → 96 passed, 0 failed
node tests/v256-attendance-scroll.test.js→ 218 passed, 0 failed
node tests/v256-payroll-exports.test.js  → 146 passed, 0 failed
```

Full suite (each `tests/*.test.js` run individually — 27 files):

**2,231 assertions passed, 0 failed.**

### Issue found and resolved during this release

The Phase 1.1 suite anchors its D-section scope guards to `git rev-parse HEAD~1`. Verified in a throwaway clone, **any** commit on top of the release commit shifts that anchor and breaks `D2`, `D3`, `D8` (215 passed / 3 failed). **With the user's explicit approval**, the anchor was changed to `v2.5.6~1` — the release tag's parent — making the guards stable across follow-up commits while still enforcing the identical baseline and allowlists. No behavioral assertion was weakened, skipped or excluded.

Three test-only changes, no production code:

| File | Change |
|---|---|
| `tests/payroll-ui.test.js` | deterministic `7g` fix (fixed batch/next-day dates) + new regression assertion `7g2` |
| `tests/v256-attendance-scroll.test.js` | `D9` allowlist: added `tests/payroll-ui.test.js` + the two pre-publish reports; D-section anchor `HEAD~1` → `v2.5.6~1` |

## 3. Build Result

```
npx electron-builder --win --publish never --config.directories.output=%TEMP%\malahy-build-256-publish
→ exit 0 | electron-builder 26.15.3 | electron 43.7.5 | NSIS x64 | oneClick=false
```

Built to a temporary directory; existing stable installers were never overwritten. Packaging used the project's existing `electron-builder.yml` unchanged.

**This is a new build.** NSIS installers are not byte-reproducible, so this artifact legitimately differs from the earlier locally-verified v2.5.6 build (105,908,934 B / `HOkpr33K…` → **105,909,012 B / `27zXITpN…`**). The two files are **not** claimed to be identical; this published artifact was verified from scratch.

## 4. Release Folder and Assets

```
D:\Malahy\releases\v2.5.6\
  malahy-setup-2.5.6.exe            105 909 012 bytes
  malahy-setup-2.5.6.exe.blockmap      111 132 bytes
  latest.yml                              341 bytes
  SHA256SUMS.txt                          267 bytes
```

This follows the repository's existing `releases/vX.Y.Z/` convention (as used by v2.5.2–v2.5.5); `v2.5.5` has the same four files. All previous release folders were left untouched.

**Checksums (actually computed, never invented):**

| File | SHA-256 |
|---|---|
| `malahy-setup-2.5.6.exe` | `456dd4b16c7315d2220223e5687edf4adcaa64b86b4cfc34997a442cf97d2029` |
| `malahy-setup-2.5.6.exe.blockmap` | `0ce4baa1d32ae62a800a889c5cefe6683238d0fa295c7781b4a16686cf148638` |
| `latest.yml` | `1e009e35985958bf3825bcc89d3d3596573f66dcd6cde3400e37baf0f3992db5` |

SHA-512 of the installer: `DBBCD7213A4D4686C1C1FF47AF0D4015125AB1C80A49F6B47FA76D1602B45574CC349BDDA76FC319E82F26FC86A5F48D2F025FB26443B330B97ABD07771158F0` (base64 `27zXITpNRobBwf9Hrw1AFRJascgKSfa0f6dtFgK0VXTMNJvdp2/DGegvJvyGpfSNLwJfsmRDszC5er0HdxFY8A==`)

## 5. `latest.yml` Consistency Check

| Field | `latest.yml` | Actual artifact | Match |
|---|---|---|---|
| `version` | `2.5.6` | `package.json` `2.5.6`; app.asar `2.5.6` | ✅ |
| `files[].url` / `path` | `malahy-setup-2.5.6.exe` | exists, non-empty | ✅ |
| `files[].size` / `size` | `105909012` | 105,909,012 bytes | ✅ |
| `files[].sha512` / `sha512` | `27zXITpNRob…` | computed independently → identical | ✅ |

Packaged-app inspection (`app.asar`): version **2.5.6**; contains only production runtime dependencies (`electron-updater` and its tree); **no** dev dependencies (`electron`, `electron-builder`), **no** tests, **no** AI reports, **no** build intermediates — 366 entries, root files are the app sources only.

## 6. Remote Verification

```
git push origin main        → 0ef9cc2..4a7338c  (fast-forward, no force)
git push origin v2.5.6      → * [new tag] v2.5.6  (tag did not previously exist on the remote)
git ls-remote --tags origin refs/tags/v2.5.6*  → 734ddb2b…  and  v2.5.6^{} = 0a548ad…
git ls-remote origin refs/heads/main            → 4a7338c…
```

The remote tag peels to the intended release commit; `origin/main` contains both the release commit and the validation commit.

## 7. GitHub Release and Asset Verification

Release created via the GitHub REST API using the token already present in the environment (value never printed, never written to any file). `gh` CLI is not installed.

- Release id `411242458`, tag `v2.5.6`, `draft: false`, `prerelease: false`, published `2026-10-13T03:49:14Z`
- URL: **https://github.com/sliveamer20/malahy/releases/tag/v2.5.6**
- 4 assets, all `state=uploaded`: `malahy-setup-2.5.6.exe` (105,909,012 B), `malahy-setup-2.5.6.exe.blockmap` (111,132 B), `latest.yml` (341 B), `SHA256SUMS.txt` (267 B)

**Verified by actual download, not by exit code:**

- Public unauthenticated API read: HTTP 200, tag `v2.5.6`, 4 assets present.
- Downloaded the installer (105,909,012 B) and both metadata files; recomputed SHA-256 of each → **all three MATCH** the published `SHA256SUMS.txt`; recomputed SHA-512 of the downloaded installer → **matches `latest.yml`**.

### Auto-update channel verified

```
GET https://github.com/sliveamer20/malahy/releases/latest/download/latest.yml        → 200, version: 2.5.6
GET …/latest/download/malahy-setup-2.5.6.exe                                          → 200
GET …/latest/download/malahy-setup-2.5.6.exe.blockmap                                 → 200
```

The built-in updater (`electron-updater`, GitHub provider, `autoDownload = true`, update floor `2.5.1` in `update-gate.js`) can therefore discover and download v2.5.6.

## 8. Security Scan

- No `.env` files, API tokens, cookies, session files, credentials, private keys or certificates in the repository or in any release asset. `.gitignore` already excludes these patterns.
- `GH_TOKEN` was read from the environment only for the API call; its value was never printed, logged, written to a file, or committed. No secret value appears in this report or in the release notes.
- No production user data (`%APPDATA%\malahy`) was read, migrated or modified; all test data is synthetic and in-memory.
- Electron security settings were not modified or weakened.
- Release assets contain only the installer, its blockmap, updater metadata and checksums — no source tree, `node_modules`, test fixtures, logs or internal reports.
- Installed installers: only `sliveamer20/malahy` (`git remote get-url origin`), no unexpected remotes.

## 9. Manual Checks and Limitations (not performed)

These are **not** claimed as verified:

- **Physical thermal-printer output** on real 58 mm / 80 mm printers — widths were verified programmatically and in the renderer only.
- **Opening the exported workbook in Microsoft Excel** — the `.xls` structure was validated by XML well-formedness and type/count assertions, not by a real Excel/LibreOffice install.
- **Visual PDF page-break inspection** on paper.
- **Long Arabic names at 58 mm width** — verified unclipped programmatically, not visually.
- **Production-data behaviour** — deliberately untouched; no migration or data access was performed.

Known format note: the Excel export is SpreadsheetML 2003 (`.xls`), not OOXML `.xlsx`. It opens natively in Excel/LibreOffice but a third-party tool expecting OOXML would not read it.

## 10. Summary of Completed Actions

- Committed `4a7338c` — test-only release-validation commit (2 test files, 22 insertions / 8 deletions). No production code changed.
- Pushed `main` fast-forward to `4a7338c` and created the annotated tag `v2.5.6` on the remote at `0a548ad`. No force-push, no tag move, no amend.
- Built the v2.5.6 NSIS installer to a temporary directory with the existing configuration.
- Verified version, size, SHA-512, blockmap, `latest.yml` consistency, and packaged-app contents.
- Placed the verified artifacts in `releases/v2.5.6/` with a real `SHA256SUMS.txt`.
- Published the GitHub Release `v2.5.6` with 4 assets and verified every asset by downloading it.
- Confirmed the auto-update channel resolves to 2.5.6.

**Nothing was claimed that was not performed.** Previous releases (v2.5.2–v2.5.5) and production data are preserved.