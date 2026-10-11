# Phase 4 — Malahy v2.5.4: Packaging and GitHub Publication Verification

**Date:** 2026-10-11
**Project:** Malahy Electron POS — `D:\Malahy`
**Repository:** `sliveamer20/malahy` (branch `main`)
**Previous release:** v2.5.3 — **verified unchanged**
**Release:** v2.5.4 — **published**

**Outcome: ✅ Published and independently verified from remote evidence. All checks passed.**

---

## 1. Release commit and tag

| Item | Value |
|---|---|
| Release commit | `2ed072fe4d680dd8da107d8ff089780d763ff2b9` (`2ed072f`) |
| Commit subject | `release: v2.5.4 printer error feedback + full-uninstall data cleanup` |
| Parent | `6df7f6c` (the v2.5.3 docs commit) — a clean **fast-forward**, 1 commit ahead, 0 behind |
| Branch | `main` |
| Tag | `v2.5.4` — **annotated** |
| Tag object | `99377f1084c04d0d014172c644f49a4df6c3986f` |
| Tag → commit | `2ed072fe4d680dd8da107d8ff089780d763ff2b9` — **matches HEAD** |
| Files in commit | 16 (10 modified, 6 added) — staged **explicitly**, never `git add .` / `-A` |
| `releases/` staged? | **No** — `.gitignore:11` ignores `releases/`, exactly as for every prior release |

Commit composition:

| Type | Files |
|---|---|
| Modified | `README.md`, `electron-builder.yml`, `index.html`, `main.js`, `package.json`, `windows/splash.html`, `tests/phase3b-auth.test.js`, `tests/phase3c1-gate.test.js`, `tests/phase3c2-baseline.test.js`, `tests/protected-baseline.json` |
| Added | `tests/phase1-printer-feedback.test.js`, 5 × `AI_REPORTS/*.md` |

Working tree after commit: **clean**. `git status --short` → empty.

No force-push, no history rewrite, no tag moved. `v2.5.3` still points at `7228787…`.

---

## 2. Local release folder — `releases/v2.5.4/`

| File | Size | SHA-256 |
|---|---|---|
| `malahy-setup-2.5.4.exe` | 105,922,258 B | `09ec6bed0e07392dac679dcf52bd60285f55ac523e33646b0d7c40112394b8d9` |
| `malahy-setup-2.5.4.exe.blockmap` | 111,291 B | `20229fe94a4a05f8843d89ac78636a05038ae47244bc271ea635630b59020d59` |
| `latest.yml` | 341 B | `784e84d1e7e3db26c1c04f2cef71bfe2e1d43cde6dccd492deabeecaf619b2a9` |

Copied from `dist/` and verified **byte-for-byte identical** to the source artifacts. No renaming —
`latest.yml` `path:` is `malahy-setup-2.5.4.exe` and the file exists under that exact name, so the
updater metadata resolves correctly. `dist/` left intact.

`releases/v2.5.3/` untouched (2026-10-06 timestamps, original sizes).

---

## 3. Installer verification (candidate vs Phase 3 report)

| Property | Report said | Actual | Result |
|---|---|---|---|
| Size | 105,922,258 | 105,922,258 | **MATCH** |
| SHA-256 | `09ec6bed…4b8d9` | `09ec6bed…4b8d9` | **MATCH** |
| `malahy-setup-2.5.4.exe` present | yes | yes | ✅ |
| `malahy-setup-2.5.4.exe.blockmap` present | yes | yes | ✅ |
| `latest.yml` present | yes | yes | ✅ |
| Same build run | — | timestamps within 4.7 s | ✅ |

`latest.yml` (candidate): `version: 2.5.4`, `path: malahy-setup-2.5.4.exe`,
`size: 105922258` **MATCH**, `sha512` **MATCH** (recomputed from installer bytes).

No rebuild was necessary; the candidate was already consistent with the report.

---

## 4. GitHub Release — published

| Item | Value |
|---|---|
| **URL** | **https://github.com/sliveamer20/malahy/releases/tag/v2.5.4** |
| Release name | `Malahy v2.5.4` |
| Tag | `v2.5.4` |
| Draft | **false** |
| Prerelease | **false** |
| Published at | 2026-10-11 19:02:15 UTC |
| Release id | `409861304` |
| Duplicate check | releases tagged `v2.5.4` = **1** — no duplicate created |

### Uploaded assets

| Asset | Asset id | Size | State |
|---|---|---|---|
| `malahy-setup-2.5.4.exe` | 631554078 | 105,922,258 B | uploaded |
| `malahy-setup-2.5.4.exe.blockmap` | 631560863 | 111,291 B | uploaded |
| `latest.yml` | 631560884 | 341 B | uploaded |

Release notes (bilingual, matching the Arabic-first product) cover:
1. the printer error-feedback improvement, with the exact Arabic message per case;
2. **a normal update preserves all business data**;
3. a prominent **warning that a full uninstall permanently deletes local data**, with the
   instruction to back up `%APPDATA%\malahy\malahy-data.json` first;
4. the mandatory-update policy, the unsigned-installer notice, and the unchanged update policy.

---

## 5. Remote verification evidence

All checks below were performed **against GitHub after publishing**, not inferred from the push.

### 5.1 Branch and tag

| Check | Result |
|---|---|
| `origin/main` SHA | `2ed072fe4d680dd8da107d8ff089780d763ff2b9` — **matches the release commit** |
| Remote `v2.5.4` tag → commit | `2ed072fe4d680dd8da107d8ff089780d763ff2b9` — **matches** |
| Remote branch subject | `release: v2.5.4 printer error feedback + full-uninstall data cleanup` |

### 5.2 Assets downloaded and compared — the decisive check

Every published asset was **downloaded from GitHub** and compared to the local verified files:

| Asset | Result |
|---|---|
| `malahy-setup-2.5.4.exe` | **IDENTICAL** — `09ec6bed0e07392dac679dcf…` |
| `malahy-setup-2.5.4.exe.blockmap` | **IDENTICAL** — `20229fe94a4a05f8…` |
| `latest.yml` | **IDENTICAL** — `784e84d1e7e3db26…` |

**All three assets are present, downloadable, and byte-for-byte correct.**

### 5.3 Published updater metadata is internally consistent

Verified against the **downloaded** installer, not the local one:

| Field | Value | Check |
|---|---|---|
| `version` | `2.5.4` | ✅ |
| `path` / `url` | `malahy-setup-2.5.4.exe` | ✅ |
| `size` | 105,922,258 | **MATCH** actual downloaded size |
| `sha512` | `xnpFJY77c5WKqxpp0dgqoTfJTXeRwjWoJoqDpUGZwaODTF6t/HUpN+aD1dqxoIFiFu0OuNeKk8mgObxj9A+tNA==` | **MATCH** (recomputed from the published installer) |
| blockmap format | v2, 5042 blocks | ✅ |
| blockmap `sizes` sum | 105,922,258 | **MATCH**, full gapless coverage |
| blockmap identical to local | yes | ✅ |

### 5.4 Update discovery actually resolves to v2.5.4

This is the mechanism `electron-updater` uses (GitHub provider → `releases/latest`):

| URL | Result |
|---|---|
| `https://github.com/sliveamer20/malahy/releases/latest/download/latest.yml` | HTTP 200, 341 B, **version 2.5.4** |
| `https://github.com/sliveamer20/malahy/releases/download/v2.5.4/latest.yml` | HTTP 200, 341 B, **version 2.5.4** |
| `GET /releases/latest` (API) | resolves to **`Malahy v2.5.4`** / tag `v2.5.4` |

### 5.5 Update gate behaviour against the published state

`update-gate.evaluate()` run as a pure function against the version fetched from GitHub — **no
production data opened or written**:

```
FLOOR_VERSION = 2.5.1 ; published latest = 2.5.4

installed 2.5.1:  ONLINE -> action=update required=2.5.4  |  OFFLINE -> action=proceed
installed 2.5.2:  ONLINE -> action=update required=2.5.4  |  OFFLINE -> action=proceed
installed 2.5.3:  ONLINE -> action=update required=2.5.4  |  OFFLINE -> action=proceed
installed 2.5.4:  ONLINE -> action=proceed required=2.5.4  |  OFFLINE -> action=proceed
```

The production installation on this machine is **2.5.3**, so it will be offered v2.5.4 when online.
And because `FLOOR_VERSION` was deliberately left at 2.5.1, **machines that cannot reach GitHub are
not locked out** — they proceed normally. The mandatory-update risk flagged in Phase 3 §6.8 is
therefore bounded, not bricked.

### 5.6 v2.5.3 is untouched

| Check | Expected | Actual | Result |
|---|---|---|---|
| Release id | 404163017 | 404163017 | **UNCHANGED** |
| Published at | 10/05/2026 23:15:43 | 10/05/2026 23:15:43 | **UNCHANGED** |
| Asset ids | 613862386 / 613857141 / 613862364 | identical | **UNCHANGED** |
| Tag `v2.5.3` object | `5bbebdeb46ab…` | `5bbebdeb46ab…` | **UNCHANGED** |
| Total releases | 10 (9 prior + v2.5.4) | 10 | ✅ |

---

## 6. Test results

| Suite | Result |
|---|---|
| `phase1-printer-feedback.test.js` | **40 PASS / 0 FAIL** |
| All 15 suites (full regression) | **763 PASS / 0 FAIL** |
| Phase 2 behavioural (update / uninstall / reinstall) | **73 / 73** |
| Phase 3 behavioural (v2.5.4 install / update / uninstall / reinstall) | **67 / 67** |

Re-run immediately before the commit: **763 PASS / 0 FAIL**, unchanged. No source file had been
modified between the candidate build (21:24:34) and the commit, so the regression suite result still
describes exactly the code that is in the published binary.

### Behavioural evidence for the two user-facing promises

**"A normal update preserves your data"** — a real in-place upgrade in a disposable Windows account
using the exact `electron-updater` command line (`--updated /S /D=<dir>`):

```
installed version        = 2.5.3   (before)
installed version now    = 2.5.4   (after)
marker / ticket / dailyRegister / employee / settings -> all preserved
app relaunched on the updated install, seeded ticket still present
```

**"A full uninstall deletes the app's data"** — real registry `UninstallString`:

```
%APPDATA%\malahy REMOVED       PASS
unrelated canary app intact    PASS
%APPDATA% parent intact        PASS
install dir removed            PASS
production install untouched   PASS
```

---

## 7. Production data protection

| Check | Value |
|---|---|
| `%APPDATA%\malahy\malahy-data.json` SHA-256 | `183C0FE4FF97FA9B7B84A72A749DDC1936B2CBD29F2C699F24AB811CD55DC5D4` — **identical to the phase-start value** |
| userData file count | **72** — unchanged |
| Production install | present, version **2.5.3.0**, never launched or uninstalled |
| Production app running | 0 — never started |
| Production database / activation | never opened or written |
| Disposable test accounts | `malahyqa`, `malahyqa2`, `malahyqa3`, `malahyqa4` — all removed with their profiles |

No credentials were printed. `GH_TOKEN` was used only as a bearer header; its value never appeared
in any command, log, or report.

---

## 8. Limitations and failed checks

**No check failed.** Limitations carried forward:

1. **The installer is unsigned** (`NotSigned`). No certificate is configured in this repository —
   the same as every prior release. Users will see the SmartScreen "unknown publisher" prompt.
2. **Blockmap per-block checksums were not independently recomputed.** Structure (v2), schema
   identity with the published v2.5.3 blockmap, and gapless full-file coverage were verified; the
   18-byte per-block values use app-builder's internal algorithm, which was not re-derived.
3. **The interactive (non-`/S`) update variant was not executed unattended** — the assisted
   installer wizard needs clicks. `--updated`, the only flag that gates data deletion, is identical
   in both variants, and the silent variant was executed end-to-end.
4. **"Ticket still available" is verified at the data layer** — the record remains in
   `malahy_pos_txlog_v1` across a real launch and a real upgrade; confirming it renders in the UI
   would need UI automation.
5. **A full end-to-end auto-update on a real second device was not performed** (it would require
   provisioning a separate machine/profile with v2.5.3 installed). Update *discovery* was verified
   directly against the live GitHub endpoints and against the real `update-gate.evaluate()`.
6. **Publishing 2.5.4 is mandatory for versions below it** when online. Offline machines are not
   locked out (§5.5), but an online machine on 2.5.1–2.5.3 will be pushed through the update flow.

---

## 9. Final state

```
main            2ed072f  release: v2.5.4 printer error feedback + full-uninstall data cleanup
tags            v2.5.4 -> 2ed072f   (new, annotated)
                v2.5.3 -> 7228787   (untouched)
origin/main     2ed072f
worktree        clean
GitHub          Malahy v2.5.4  https://github.com/sliveamer20/malahy/releases/tag/v2.5.4
                3 assets uploaded, downloaded and checksum-verified
```

This report is committed separately as a `docs:` commit after the tag, matching the repository's
established two-commit release pattern (release commit → tag → docs commit).
