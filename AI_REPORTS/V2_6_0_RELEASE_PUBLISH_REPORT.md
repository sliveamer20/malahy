# Malahy v2.6.0 — Release Publish Report

**Status:** `PUBLISHED` — GitHub Release live and verified.
**Publication date:** 2026-10-14
**Repository:** `sliveamer20/malahy` (`https://github.com/sliveamer20/malahy.git`)
**Release URL:** https://github.com/sliveamer20/malahy/releases/tag/v2.6.0
**Feature report:** `AI_REPORTS/UNINSTALL_ADMIN_PASSWORD_PROTECTION_REPORT.md`

---

## 1. Release Identity

| Item | Value |
|---|---|
| Version | `2.6.0` (`package.json`) |
| Source commit (tagged) | `daaa8908f6b92852be491dd2672198524e722a27` — `release: v2.6.0 — require the admin password to uninstall` |
| Release-validation commits | `191a2e7` (release-guard re-anchors) · `ce41502` (D9 allow-list) · `d54b67a` (final report tally) — all test/docs only, on top of the release commit |
| Tag | annotated `v2.6.0` → object `28df6607…` → peels to `daaa8908…` |
| Branch | `main` (remote `d54b67a`) |
| Previous release | `v2.5.9` (preserved untouched) |

The tag remains on the release commit `daaa890`; test/validation-only commits sit on top of it — the same commit/tag convention as v2.5.5–v2.5.9. The tag was not moved, amended, or recreated; no commit was rewritten and no force-push was used at any point.

## 2. Test Results

New suite for this release: `tests/v260-uninstall-auth.test.js` — **58/58 pass**.

Packaged validation (isolated synthetic data store, production `%APPDATA%\malahy` untouched and hash-verified after every run):

- Phase A (packaged app `--uninstall-auth`): **6/6 pass**
- Phase B (packaged NSIS uninstaller, end to end): **5/5 pass** —
  `wrong` → blocked with nothing deleted (79→79); `cancel` → blocked; `correct` → full uninstall (79→0); `missingexe` → fail-closed, nothing deleted; `updated` (`/S /KEEP_APP_DATA /currentuser --updated _?=<dir>`, the exact electron-builder invocation) → completed with **no prompt** (79→0)

Full suite (30 files, each `tests/*.test.js` run individually): **2603 passed / 2 failed**. The only 2 failures are `payroll-ui` §7 `7g`/`7g2` — pre-existing and date-sensitive, verified byte-identical on a pristine `v2.5.9` checkout (v2.5.9 was released 2026-10-13; the fixed-date pins only match their literal day, and `payCommit` derives the batch reference from the real clock since v2.5.5). This is payroll behaviour that is explicitly out of scope for this release; no payroll code was modified.

### Guard re-anchoring (same convention as the v2.5.4 release, commit `2ed072f`)

`phase3b-auth` / `phase3c1-gate` / `phase3c2-baseline` / `v256-payroll-exports` version pins now expect `2.6.0`; the single `electron-builder.yml` entry of `tests/protected-baseline.json` was re-anchored to the v2.6.0 hash (no other entry changed; `index.html`/`database.js`/`package.json` remain allow-listed as intended). The phase 3B/3C-1/3C-2 suites pass fully after this.

## 3. Artifact

This release publishes **the exact locally validated artifact** (`D:\Malahy\dist\malahy-setup-2.6.0.exe`, built with `npm run dist` = `electron-builder --win --publish never`), i.e. the very file on which the Phase A/Phase B end-to-end results above were obtained. No rebuild was made for publication, so there is no build-reproducibility gap between validation and publishing.

Packaged-app inspection is documented in the feature report; `app.asar` version is `2.6.0`.

## 4. Release Folder and Assets

```
D:\Malahy\releases\v2.6.0\
  malahy-setup-2.6.0.exe            105 912 205 bytes
  malahy-setup-2.6.0.exe.blockmap      111 213 bytes
  latest.yml                              341 bytes
  SHA256SUMS.txt                          264 bytes
```

Follows the repository's existing `releases/vX.Y.Z/` convention (as used by v2.5.2–v2.5.9). All previous release folders were left untouched. `dist/` and `releases/` are gitignored.

**Checksums (actually computed, never invented):**

| File | SHA-256 |
|---|---|
| `malahy-setup-2.6.0.exe` | `5ebbe9aac2a736bd3c652eecbde84c8b79ba1e557294d60b6a3f94f09deed120` |
| `malahy-setup-2.6.0.exe.blockmap` | `b3d1c47b8003c65435e966d309f97dd1026647ac44848444f828a57d36e644ad` |
| `latest.yml` | `8202a1307eac734274349185263deeab8c41d559e0b80f69cb4eecd55e43c11d` |

SHA-512 of the installer (base64, as published in `latest.yml`): `ArmBcGQSciHG9OLK6rjfBf5hHUD5iTmOflDFg73wWsBL98sI+m7j/Tdn2Tw5cabT4qWRTzRwmZoBb4GfVlOQRA==`

## 5. `latest.yml` Consistency Check

| Field | `latest.yml` | Actual artifact | Match |
|---|---|---|---|
| `version` | `2.6.0` | `package.json` `2.6.0`; `app.asar` `2.6.0` | ✅ |
| `files[].url` / `path` | `malahy-setup-2.6.0.exe` | exists, non-empty | ✅ |
| `files[].size` / `size` | `105912205` | 105,912,205 bytes | ✅ |
| `files[].sha512` / `sha512` | `ArmBcGQS…` | computed independently → identical | ✅ |

## 6. Remote Verification

```
git push origin main        → 4f11fd2..d54b67a  (fast-forward, no force)
git push origin v2.6.0      → * [new tag] v2.6.0  (tag did not previously exist on the remote)
git ls-remote --tags origin refs/tags/v2.6.0   → 28df6607… (tag object)
git ls-remote origin refs/heads/main           → d54b67a…
```

The remote tag peels to the intended release commit `daaa890`; `origin/main` contains the release commit plus the three validation commits. No previous tag or release was moved or overwritten (`v2.5.9` and earlier untouched).

## 7. GitHub Release and Asset Verification

Release created via the GitHub REST API using `GH_TOKEN` already present in the environment (`gh` CLI is not installed). The token was used only as a `Bearer` header; its value was never printed, logged, written to any file, or committed.

- Release id `412365432`, tag `v2.6.0`, `draft: false`, `prerelease: false`
- URL: **https://github.com/sliveamer20/malahy/releases/tag/v2.6.0**
- 4 assets, all `state=uploaded`: `malahy-setup-2.6.0.exe` (105,912,205 B), `malahy-setup-2.6.0.exe.blockmap` (111,213 B), `latest.yml` (341 B), `SHA256SUMS.txt` (264 B)

**Verified by actual public download, not by exit code:**

- `GET …/releases/latest/download/latest.yml` → HTTP 200, **version 2.6.0**, size and SHA-512 identical to the local `latest.yml`
- Downloaded the published installer (105,912,205 B), recomputed SHA-256 → **matches `SHA256SUMS.txt`**; recomputed SHA-512 → **matches `latest.yml`**
- Downloaded the published blockmap and `SHA256SUMS.txt` → both byte-identical in digest to the local files

### Auto-update channel verified

```
GET https://github.com/sliveamer20/malahy/releases/latest/download/latest.yml            → 200, version: 2.6.0
GET …/latest/download/malahy-setup-2.6.0.exe                                              → 200
GET …/latest/download/malahy-setup-2.6.0.exe.blockmap                                     → 200
```

The built-in updater (`electron-updater`, GitHub provider, `autoDownload = true`, update floor `2.5.1` in `update-gate.js`) can therefore discover v2.6.0. On update, electron-builder runs the old uninstaller with `--updated`, which is the single documented exemption from the new password prompt (see the feature report's threat model) — so the update path never asks for the password.

## 8. Security Scan

- No `.env` files, API tokens, cookies, session files, credentials, private keys or certificates were added to the repository or to any release asset. `.gitignore` already excludes these patterns.
- `GH_TOKEN` was read from the environment only for the API calls; its value never appeared in any output, file, or commit.
- No production user data (`%APPDATA%\malahy`) was read, migrated, or modified during this release cycle; its SHA-256 (`E5EF1E0D…`) was verified unchanged after every packaged test run.
- Electron security settings were not modified or weakened (`webPreferences` for the auth dialog: no `nodeIntegrationInWorker`, `devTools` disabled, CSP unchanged). The admin password is never placed in `argv`, environment, or logs.
- Release assets contain only the installer, its blockmap, updater metadata, and checksums — no source tree, `node_modules`, test fixtures, logs, or internal reports.

## 9. Manual Checks and Limitations (not performed)

These are **not** claimed as verified:

- **Update from a live v2.5.9 install driven by the real `electron-updater` against this new release** — the `--updated` exemption path was instead replicated exactly as electron-builder invokes it (uninstaller copied to a temp dir, `/S /KEEP_APP_DATA /currentuser --updated _?=<dir>`), which is the same code path the updater uses.
- **Uninstallation behaviour on other Windows machines/versions or other user accounts** — Phase A/B ran on this machine, current user, with a synthetic isolated data store.
- **Physical observation of the Arabic dialog on high-DPI/RTL Displays** — verified by UIAutomation/CDP property reads and screenshots, not visually on other hardware.
- The two pre-existing `payroll-ui` date-sensitive failures (`7g`/`7g2`) remain unfixed (documented; payroll behaviour untouched by design).

## 10. Summary of Completed Actions

- Committed the v2.6.0 feature (`daaa890`, 11 files: `users.js`, `main.js`, `preload.js`, `windows/uninstall-auth.html`, `build/uninstall-auth.nsh`, `electron-builder.yml`, `.gitignore`, `tests/v260-uninstall-auth.test.js`, the feature report, and guard updates) — plus three test/docs-only validation commits on top (`191a2e7`, `ce41502`, `d54b67a`).
- Validated the packaged installer/uninstaller end to end (Phase A 6/6, Phase B 5/5) including the fail-closed paths and the auto-update exemption; production data hash confirmed unchanged.
- Pushed `main` fast-forward to `d54b67a` and created the annotated tag `v2.6.0` on the remote at `daaa890`. No force-push, no tag move, no amend.
- Placed the exact validated artifacts in `releases/v2.6.0/` with a real `SHA256SUMS.txt`.
- Published the GitHub Release `v2.6.0` (id `412365432`) with 4 assets and verified every asset by public download; confirmed the auto-update channel resolves to 2.6.0.

**Nothing was claimed that was not performed.** Previous releases (v2.4.1–v2.5.9) and production data are preserved.
