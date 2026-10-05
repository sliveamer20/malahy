# Phase 5 — Repair v2.5.2 Test Baseline (Data Correction Only)

**Project:** Malahy (`D:\Malahy`) — production `main`
**Release:** v2.5.2 · **Branch:** `main` · **HEAD before and after:** `18acba6`
**Phase status:** **PASS**
**Files changed by this phase:** `tests/protected-baseline.json` — **1 line**, one hash value
**Result:** **718 PASS / 5 FAIL → 722 PASS / 1 FAIL**
**No UI change. No business-logic change. No build, commit, tag, push, or GitHub release.**

---

## 1. Starting state

Clean `HEAD` `18acba6` reported **718 PASS / 5 FAIL**, not the documented **722 PASS / 1 FAIL**.

| Suite | PASS | FAIL |
|---|---|---|
| `phase3b-auth.test.js` | 60 | **1** |
| `phase3c1-gate.test.js` | 46 | **2** |
| `phase3c2-baseline.test.js` | 61 | **2** |
| other 11 suites | 518 | 0 |
| **TOTAL** | **718** | **5** |

The five failures:

```
phase3b-auth.test.js     FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html, package.json
phase3c1-gate.test.js    FAIL  protected file unchanged: package.json
phase3c1-gate.test.js    FAIL  all protected baseline files intact (except the intended index.html)
phase3c2-baseline.test.js FAIL  protected file unchanged: package.json
phase3c2-baseline.test.js FAIL  all protected baseline files intact (except the intended index.html)
```

`package.json` appears in **4 of the 5** failures.

### Pre-flight (read-only, nothing modified)

| Check | Result |
|---|---|
| `git status` | `index.html` modified (Phase 4 clock CSS), 3 untracked paths |
| Branch | `main` ✅ |
| Version | `2.5.2` ✅ |
| Phase 4 clock CSS | present and intact — `index.html:733–749`, 4 `::-webkit-calendar-picker-indicator` rules ✅ |
| Unexpected user changes | **none** ✅ |
| `AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md` | read in full |

Pre-existing untracked paths, all accounted for and none touched by this phase:
`AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md` and `qa-ticket-renders/` (both present before Phase 4), plus the Phase 4 report itself.

---

## 2. Root cause

`tests/protected-baseline.json` is a **frozen data table** of SHA-256 digests used by the byte-identity guards in three suites. Three test files consume it:

- `phase3b-auth.test.js:263` — iterates every entry, reports the changed list
- `phase3c1-gate.test.js:54` — iterates every entry, skips `index.html` (`intended = { "index.html": true }`), plus explicit `splash.html`/`update.html` checks at `:70`
- `phase3c2-baseline.test.js` — same pattern (`intended = { "index.html": true }`), plus `:71`

When the v2.5.2 release bumped `package.json` `2.5.1 → 2.5.2` (and dropped `scripts` + `devDependencies` so the packaging baseline held), it re-anchored that table's `package.json` entry — **but recorded a digest that does not correspond to the `package.json` it committed alongside it.**

Because `phase3c1-gate` and `phase3c2-baseline` skip only `index.html`, their `package.json` entry was load-bearing: a wrong value there fails two assertions in each of those suites, plus the aggregate assertion, plus `phase3b-auth`. Hence 4 extra failures from one wrong 64-character string.

---

## 3. Old stale hash

```
42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c
```

Re-verified independently this phase, and confirmed to match **no** plausible variant of the file (9 variants computed):

| Variant | SHA-256 |
|---|---|
| as-committed (LF) | `afb76afc…` |
| CRLF line endings | `b95d16d2…` |
| CRLF + trailing CRLF | `6ba5a92a…` |
| LF + trailing LF | `696df9a6…` |
| UTF-8 BOM | `62f3a20f…` |
| no trailing newline | `afb76afc…` |
| pretty-printed 2-space | `696df9a6…` |
| pretty-printed 4-space | `5f1faf78…` |
| minified | `f391f4d6…` |

**Matches: none.** The recorded value is simply incorrect — not a line-ending or encoding artefact.

---

## 4. Correct hash

```
afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d
```

Verified from **three independent sources**, all agreeing, before any edit was made:

| Source | Bytes | SHA-256 |
|---|---|---|
| `D:\Malahy\package.json` (disk) | 294 | `afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d` |
| `git cat-file blob HEAD:package.json` | 294 | `afb76afc…` (identical) |
| `git cat-file blob 5c9dc15:package.json` (release commit) | 294 | `afb76afc…` (identical) |

Disk file profile: 294 bytes, **LF only** (0 CR), **no BOM** (starts `123 10 32` = `{`, `\n`, ` `).

Cross-reference: the *pre-bump* baseline entry `d1f2551f…` **does** match the v2.5.1 blob exactly — so the re-anchoring *method* was sound; only this one value was transcribed wrongly.

---

## 5. Exact file changed

**`tests/protected-baseline.json`** — and nothing else.

```
$ git diff --numstat
1       1       tests/protected-baseline.json
17      0       index.html          <- pre-existing Phase 4 clock CSS, untouched by this phase
```

`git status` shows exactly two modified tracked files: `index.html` (Phase 4, expected to remain) and `tests/protected-baseline.json` (this phase).

---

## 6. Exact scope of change

The single line, verbatim:

```diff
--- a/tests/protected-baseline.json
+++ b/tests/protected-baseline.json
@@ -3,7 +3,7 @@
   "database.js": "04a687c4925db79d98b6ee0778b93541489d0348c74eb4f148f8ef104c23fe97",
   "activation.js": "47cee9f65ce909305f5ca6ad27451c1ce309821c26d9232dbc072a1d81444a7d",
   "update-gate.js": "b9af3f2f1e41063536a89115f884571398da9b7f92eda04d077c7a960a422e36",
-  "package.json": "42fbdb44841ebc2b5daf2df5c44256bc7d2ba6435dcde7d1bc04aa980a51f66c",
+  "package.json": "afb76afc22a97e9f395be5e378b540d48a7376f62bbdbe5632b96afd5677bb0d",
   "README.md": "4c9aa5eee0272ec4054c608563fab460bd89aaa6d933face12dd7a2d857d1772",
   "launch.js": "7db341a1c70ded693e4fb0479702ee3ef4e3141773e27bd371580198de0d02c8",
   "electron-builder.yml": "2396654f7428a1268e2a7b01ae78b0032255a5b7066ed15844d689b3619d41db",
```

Structural integrity preserved — verified programmatically:

| Property | Before | After |
|---|---|---|
| File size | 1 488 bytes | **1 488 bytes** (unchanged) |
| Line endings | CRLF 0 / LF 17 | **CRLF 0 / LF 17** (unchanged) |
| Valid JSON | yes | **yes** |
| Entries | 16 | **16** |
| Keys added / removed | — | **0 / 0** |
| **Values changed** | — | **1** (`package.json` only) |
| `index.html` entry | `854cff97…` | `854cff97…` — **untouched**, still the historical stale value |

**Explicitly not changed**, as required: every other hash · any test file · test logic · test expectations · protected-file rules · the `index.html` allowance (`intended = { "index.html": true }`) · the three `pkg.version === "2.5.2"` assertions.

Before/after file digests: `dc1cf79802baf4f4…` → `dfc341a3f8f1d8fe…`.

**This is a data-baseline correction only.** It changes a recorded expectation to match reality; it does not change what any test asserts or how.

---

## 7. Final test result

All 14 suites, repository convention `node tests/<suite>.test.js`, no framework:

| Suite | BEFORE | AFTER |
|---|---|---|
| `phase3b-auth.test.js` | 60 / 1 | **60 / 1** |
| `phase3b-ipc.test.js` | 15 / 0 | **15 / 0** |
| `phase3c1-dom.test.js` | 37 / 0 | **37 / 0** |
| `phase3c1-gate.test.js` | 46 / **2** | **48 / 0** ✅ |
| `phase3c1-ipc.test.js` | 19 / 0 | **19 / 0** |
| `phase3c1-session.test.js` | 30 / 0 | **30 / 0** |
| `phase3c2-baseline.test.js` | 61 / **2** | **63 / 0** ✅ |
| `phase3c2-gate.test.js` | 44 / 0 | **44 / 0** |
| `phase3c2-ipc.test.js` | 49 / 0 | **49 / 0** |
| `phase3c2-perms.test.js` | 39 / 0 | **39 / 0** |
| `phase3c3-accounts.test.js` | 92 / 0 | **92 / 0** |
| `phase3c3-ui.test.js` | 76 / 0 | **76 / 0** |
| `phase3c4-recovery.test.js` | 79 / 0 | **79 / 0** |
| `phase4-daily-report.test.js` | 71 / 0 | **71 / 0** |
| **TOTAL** | **718 / 5** | **722 / 1** ✅ |

| | BEFORE | AFTER | Δ |
|---|---|---|---|
| PASS | 718 | **722** | **+4** |
| FAIL | 5 | **1** | **−4** |

**Target `722 PASS / 1 FAIL` met exactly.** The result is fully explained: precisely the 4 assertions that were failing on the `package.json` digest now pass, and nothing else changed.

Compliance:

- **New failures: 0**
- **Test files modified: 0** — all 14 verified `UNCHANGED` via `git diff --numstat`
- **Tests skipped: 0** · **assertions weakened: 0** · **assertions removed: 0** · **conditional logic introduced: 0**
- No workaround, no re-anchoring of unrelated assertions

---

## 8. Remaining historical failure

Exactly one, and it is the documented pre-existing one — **not** the `package.json` entry any more:

```
phase3b-auth.test.js :: FAIL  all protected files byte-identical to pre-phase baseline :: changed: index.html
```

This matches the v2.5.2 release report verbatim. `phase3b-auth.test.js` compares `index.html` against the **frozen pre-Phase-3B snapshot** (`854cff97…`); `index.html` legitimately differs because of the authorised Phase 2 UI redesign and the Phase 4 clock CSS. `phase3c1-gate` and `phase3c2-baseline` explicitly *skip* `index.html` via `intended = { "index.html": true }` and therefore pass. This is a report-and-accept condition by design, not a defect to fix.

**Not touched, as instructed.** The `index.html` entry in the baseline still reads `854cff97e10932c036df534396d975e1ded674e4f8b5b85e538dea77be8ac5a2`, exactly as in `HEAD`.

---

## 9. Protected-file verification

Every tracked file compared against its `HEAD` blob via `git cat-file`.

**Protected files byte-identical: 27 / 27** (EOL-normalised, because this checkout is CRLF while blobs are LF):

`main.js` · `preload.js` · `database.js` · `users.js` · `login.js` · `recovery.js` · `permissions.js` · `perm-gate.js` · `activation.js` · `update-gate.js` · `accounts.js` · `package.json` · `package-lock.json` · `electron-builder.yml` · `windows/splash.html` · `windows/update.html` · `assets/ticket/ticket-template.js` · `assets/ticket/ticket-template.svg` · `assets/report/daily-report.js` · `assets/vendor/qrcode.js` · `assets/vendor/radix-colors.css` · `launch.js` · `README.md` · `.gitignore` · `assets/icons/icon.ico` · `assets/icons/logo.png` · `assets/images/logo.png`

**Differing: none.**

Also verified:

- `update-gate.js` `FLOOR_VERSION` still `"2.5.1"` (line 14) — untouched; `2.5.2 > 2.5.1`, so the mandatory-update gate remains satisfied and its 3 guarding assertions pass.
- `assets/icons/radix/sprite.svg` — byte-identical; `git status` does **not** list it. (An earlier byte check flagged it, but that was purely this checkout's CRLF working-copy state; `git diff` shows zero content change.)
- 83 tracked files scanned; only `index.html` and `tests/protected-baseline.json` differ from `HEAD`.

---

## 10. No UI or business-logic change

| Check | Result |
|---|---|
| `index.html` diff | **`17 / 0`** — unchanged from Phase 4 |
| Phase 4 clock CSS rules | **4 present**, byte-identical to Phase 4 (`index.html:733–749`) |
| Emoji count in `index.html` | HEAD **259** → disk **259** — **zero emoji replaced** |
| New icon marker classes (`.ic-clock`, `.ic-print`, `.luc`, …) | **0** — none introduced |
| `mask-image` rules | HEAD **3** → disk **3** — pre-existing Phase 2b-2 block untouched |
| `<script>` blocks | **12**, **0 content-differing** after EOL normalisation |
| `id="…"` multiset | **57 → 57**, identical |
| `onclick="…"` multiset | **18 → 18**, identical |
| `data-perm="…"` multiset | **10 → 10**, identical |
| `<script src>` multiset | **9 → 9**, identical |
| `<link rel=stylesheet>` multiset | **1 → 1**, identical |
| `windows/splash.html` | untouched; still contains the stale `2.5.0` (as Phase 4 left it) |
| `windows/update.html` | untouched; contains no stale version |
| `main.js` / `preload.js` | byte-identical |
| Sales · tickets · QR · printing · accounts · gifts · expenses · payroll · advances · shifts · auth · permissions · recovery · activation · update gate · DB · storage · IPC | all byte-identical, all covered by the passing regression |

No UI redesign, no icon replacement, no splash change, no `main.js`/`preload.js` change, no business-logic change. **Not one line of JavaScript was touched in this phase.**

---

## 11. Git status

```
$ git status --porcelain=v1
 M index.html                              <- Phase 4 clock CSS (+17/-0), expected, untouched
 M tests/protected-baseline.json           <- this phase (1 line)
?? AI_REPORTS/UI_ICON_CONSISTENCY_PHASE_4.md   <- Phase 4 report
?? AI_REPORTS/UI_REDESIGN_RADIX_AUDIT.md       <- pre-existing, untouched
?? qa-ticket-renders/                          <- pre-existing, untouched
```

Branch `main`. `HEAD` still `18acba6`. Version still `2.5.2`. No staged changes. Nothing committed, tagged, pushed or built.

---

## 12. Why this repair is safe

1. **It corrects an error, it does not relax a test.** The guard was already a strict byte-equality check; only the *recorded expectation* was wrong. The guard is now stricter in practice — it passes only because the file genuinely matches.
2. **The new value is proven, not assumed.** Three independent sources — disk, `HEAD` blob, release-commit blob — agree byte-for-byte, and the stale value provably matches none of 9 file variants.
3. **Blast radius is exactly one assertion path.** Only the `package.json` row of the data table moved. Key order, entry count, byte length and line endings are identical; all 15 other digests are untouched.
4. **No protected file moved.** 27/27 byte-identical, including `package.json` itself — the guard now correctly asserts the *current, unmodified* `package.json`.
5. **The same four assertions that were red are now green**, with no test file touched: `git diff --numstat tests/` reports only `protected-baseline.json`.
6. **The historical failure is preserved.** `index.html` still fails `phase3b-auth` exactly as documented, so the regression suite retains its independent signal about `index.html` — the repair did not paper over it.
7. **No behaviour can change.** A JSON expectation table is inert at runtime: it is read only by test harnesses and is not loaded by `main.js`, `preload.js` or any renderer. Nothing in the shipped application is affected.
8. **Fully reversible.** One line, one value. Reverting restores the previous behaviour exactly.

---

*Phase 5 ends here. Not built, not committed, not tagged, not pushed, no GitHub release.*
*Outstanding from earlier phases and untouched by this one: the splash `2.5.0`, the emoji→SVG icon work (blocked, documented in the Phase 4 report), and the historical `index.html` baseline difference.*