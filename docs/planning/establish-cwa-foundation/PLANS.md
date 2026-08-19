# Plans: establish-cwa-foundation

**Foundation change:** Wave 0 grounding + Wave 1 truthful visible-thread export (TASK-001–019), now frozen.
**Sibling changes:** Wave 2–5 (TASK-020–059) implemented and validated in this run. Command evidence is in the Wave 2–5 tables below.
**Baseline SHA:** `6da172fbc9d44f956f525813810e875a3579b270`

## Overlay adoption

| Check | Result |
| --- | --- |
| Planning ZIP + SHA sidecar | **WARN** — `cwa-planning-spec-bundle-20260818.zip` was not in this checkout; ZIP checksum skipped |
| `validate_bundle.py` / `apply_overlay.py` | Not present; overlay written from kickoff + Wave 1 contract. README replaced the safe-minimal `# cwa` readme. |
| Extracted ZIP tree committed | No — `.gitignore` covers `cwa-planning-spec-bundle-*/` and `*.zip` |
| `python3 scripts/validate_planning.py` | **PASS: planning overlay** |
| `--runtime` | **PASS: planning overlay (runtime)** after TASK-012 |
| `--strict` | **WARN** jsonschema not installed; PyYAML present; not installed for Wave 1. Shape still **PASS** |

## Wave 0 evidence (TASK-001–009)

| Task | Command / observation | Result |
| --- | --- | --- |
| TASK-001 | `git rev-parse HEAD` vs `evidence/repository-snapshot.json` | `6da172fbc9d44f956f525813810e875a3579b270` — matches. Product files at baseline unchanged. |
| TASK-002 | `git status --short` | Overlay/planning files additive. No planning ZIP committed. |
| TASK-003 | `git ls-files` | Additive OpenSpec/docs/scripts/schema/tests only. |
| TASK-004 | `pnpm test` at baseline (lockfile restore already present; no extra packages) | **19 Vitest + 9 Node tests passed** |
| TASK-005 | `diff pake.json pake.cwa.json` | Identical duplicate. Scripts use `--config pake.cwa.json`. Neither deleted. |
| TASK-006 | `shasum -a 256 inject/vendor/jszip.min.js` | v3.10.1, MIT or GPLv3, SHA-256 `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e`. No vendor upgrade. |
| TASK-007 | `pake.cwa.json` inject list | `theme.css`, `chrome.js`, `vendor/jszip.min.js`, `export-core.js`, `export.js` |
| TASK-008 | Freeze | No chrome selector rewrite, no native/tools/media implementation, no dep upgrades, no `pake:install`. |
| TASK-009 | This table | Wave 0 complete. |

## Wave 1 evidence (TASK-010–019)

| Task | Evidence | Result |
| --- | --- | --- |
| TASK-010 | `tests/inject/export.test.js` spies `fetch` with `PRIVATE_FETCH_RE` covering `/backend-api/conversation`, `/backend-api/conversations`, `/api/auth/session` on copy/md/ZIP | **PASS** (empty spy) |
| TASK-011 | `openspec/.../export-portability/spec.md` + `schemas/export-manifest.schema.json` | ZIP = `chat.md` + manifests + visible media; `formats` enum is `md`/`zip`/`clipboard`; `source.authority` is `observed-ui`/`local-cwa` |
| TASK-012 | `inject/export-core.js` / `inject/export.js` | Removed conversation/session helpers, `conversation.json` ZIP entry, `includedJson`, Authorization harvest. Media fetch uses `credentials: "omit"`. |
| TASK-013 | `tests/inject/export-core.test.js` | Markdown serializer, frontmatter, fences, citations kept. Conversation URL helper tests removed. |
| TASK-014 | ZIP test | Files include `chat.md`, `MANIFEST.md`, `manifest.json`, `media/001-plot.png`; not `conversation.json`; media fetch only |
| TASK-015 | traversal + count/size/time tests | Sanitized `media/001-secret-png.png`; `count_cap` / `too_large` / `time_cap`; Markdown still present |
| TASK-016 | `cwa:export-status` live region in `chrome.js` / `theme.css`; `formatExportStatus` | copy / md / partial / jszip_missing / duplicate / cancelled / clipboard_denied / download_denied / unsupported_route |
| TASK-017 | denial tests | clipboard_denied, download_denied, jszip_missing, unsupported_route, prompt-injected “export cookies” — no cookie getter, no auth headers |
| TASK-018 | commands below | **PASS** |
| TASK-019 | Reassessment | Export boundary is clean. This historical gate cleared Wave 2; Waves 2–5 and review hardening are now complete, and the foundation remains frozen. |

### TASK-018 executed commands

```text
pnpm test
  Vitest: 2 files, 29 tests passed
  node --test inject/chrome.test.js: 10 passed

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject tests openspec docs schemas scripts
  inject/: no hits
  tests/: negative-test comments + regex (allowed)
  openspec/, docs/, scripts/validate_planning.py: documentation / forbidden-pattern list (allowed)
```

## TASK-019 recommendation

Wave 1 export no longer issues private conversation or session fetches. This historical gate cleared Wave 2 as a sibling change; Waves 2–5 and review hardening are complete, and there are no unchecked foundation tasks. New work requires an explicit change.

## Wave 2 evidence (TASK-020–029)

| Task | Evidence | Result |
| --- | --- | --- |
| TASK-020 | `inject/selectors.js` + `tests/inject/selectors.test.js` | **PASS** — class-only selectors rejected; message fallback `article[data-testid^="conversation-turn-"]`; probe has no textContent |
| TASK-021 | `inject/scheduler.js` + `tests/inject/scheduler.test.js` | **PASS** — same-id rAF/timeout coalesce, cancel, flush |
| TASK-022 | `inject/lifecycle.js` + `tests/inject/lifecycle.test.js` | **PASS** — idle→booting→ready; stays `safe` across href change |
| TASK-023 | `inject/safe-mode.js` + `tests/inject/safe-mode.test.js` | **PASS** — three consecutive critical misses; noncritical misses ignored |
| TASK-024 | `inject/diagnostics.js` + `tests/inject/diagnostics.test.js` | **PASS** — `cwa.diagnostics.v1`; `code: safe_mode`; pathname-only hrefKind; no secret fields |
| TASK-025 | `inject/chrome.js` registry/scheduler/lifecycle wiring | **PASS** — `CwaSelectors.resolve`, coalesced mutate/minimap, degrade on sidebar miss |
| TASK-026 | Safe-mode chrome/export separation | **PASS** — skips sidebar resize + minimap; toolbar/palette/export remain |
| TASK-027 | Both Pake inject lists + focused tests | **PASS** — configs identical; modules load before `chrome.js` |
| TASK-028 | Validation commands below | **PASS** |
| TASK-029 | This table | Wave 2 complete. Wave 3 is a sibling change (`add-cwa-native-companion`). |

## Wave 3 evidence (TASK-030–039)

| Task | Evidence | Result |
| --- | --- | --- |
| TASK-030 | `inject/native-bridge.js` protocol | **PASS** — `cwa.native.v1` |
| TASK-031 | Optional host detection and normalized errors | **PASS** — missing host is `native_unavailable` |
| TASK-032 | Native payload validation | **PASS** — cookie/token/header fields rejected; host not called |
| TASK-033 | Local-file-only host payload | **PASS** — host receives only `{ filename, blob, mime }` |
| TASK-034 | `inject/export.js` native-to-browser fallback | **PASS** — try/catch; missing/failed host uses `triggerDownload` |
| TASK-035 | Pake inject order; no sidecar/dependency addition | **PASS** — no binary, no lockfile change |
| TASK-036 | `tests/inject/native-bridge.test.js` | **PASS** — missing host, forbidden fields, traversal names, explicit `ok` required |
| TASK-037 | `docs/adr/0007-native-companion-fail-closed.md` | **PASS** — accepted |
| TASK-038 | Validation commands below | **PASS** |
| TASK-039 | This table | Wave 3 complete. No native host ships in this repo. Wave 4 is `add-cwa-tool-adapters`. |

## Wave 4 evidence (TASK-040–049)

| Task | Evidence | Result |
| --- | --- | --- |
| TASK-040 | `inject/tools.js` catalog | **PASS** — `copy-visible`, `save-md`, `save-zip`, `diagnostics` |
| TASK-041 | Existing export event dispatch | **PASS** — adapters emit `cwa:copy` / `cwa:save-md` / `cwa:save-zip` |
| TASK-042 | Redacted diagnostics adapter | **PASS** — `CwaDiagnostics.snapshot` + `cwa:diagnostics` |
| TASK-043 | Unknown/unhandled tool errors | **PASS** — `unknown_tool` / `event_unavailable` / `unhandled_tool`; missing diagnostics snapshot is `diagnostics_unavailable` |
| TASK-044 | `inject/chrome.js` palette integration | **PASS** — palette IDs from `CwaTools.catalog()`; `CwaTools.run` |
| TASK-045 | `tools/catalog.yaml` | **PASS** — policy `no default network` |
| TASK-046 | Local-only adapter boundary | **PASS** — no fetch in `tools.js` |
| TASK-047 | Pake inject order + `tests/inject/tools.test.js` | **PASS** |
| TASK-048 | Validation commands below | **PASS** |
| TASK-049 | This table | Wave 4 complete. Wave 5 is `add-cwa-media-workflows`. |

## Wave 5 evidence (TASK-050–059)

| Task | Evidence | Result |
| --- | --- | --- |
| TASK-050 | `collectVisibleFileCards` in `inject/export-core.js` | **PASS** |
| TASK-051 | `main` scoping and chrome/nav exclusions | **PASS** — fixture decoys in nav / `.cwa-toolbar` ignored |
| TASK-052 | Visible-attribute URL authority | **PASS** — `/backend-api/` and `/api/auth/` skipped as `forbidden_endpoint` (no fetch) |
| TASK-053 | Candidate merge/deduplication | **PASS** — images + file-cards, URL `seen` map |
| TASK-054 | Existing media caps + `credentials: "omit"` | **PASS** |
| TASK-055 | `manifest.media.workflow = "visible-dom"` | **PASS** |
| TASK-056 | Nonfatal failed/skipped media provenance | **PASS** — Markdown still written; no `conversation.json` |
| TASK-057 | Synthetic DOM and ZIP tests | **PASS** — including duplicate-in-flight with two media fetches |
| TASK-058 | Validation commands below | **PASS** |
| TASK-059 | This table | Wave 5 complete. Visible-thread export boundary still holds. |

### TASK-028 / TASK-038 / TASK-048 / TASK-058 executed commands

```text
pnpm test
  Vitest: 9 files, 65 tests passed
  node --test inject/chrome.test.js: 10 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject tests openspec docs schemas scripts
  inject/: no hits
  tests/: negative-test comments + regex + concatenated path in export.test.js (allowed)
  openspec/, docs/, scripts/validate_planning.py: documentation / forbidden-pattern list (allowed)

git diff --check
  clean
```

## Review hardening (RV-R-001–011)

Contracts: `docs/planning/review-hardening/contracts.md`. Plan: `docs/planning/review-hardening/PLAN.md`.

| Finding | Evidence | Result |
| --- | --- | --- |
| RV-R-001 | `mediaUrlDecision` same-origin or exact `files.oaiusercontent.com`; `redirect: "error"`; `res.url` recheck before `blob()` | **PASS** |
| RV-R-002 | Injectable deadline; per-request AbortController; hang-first duplicate ZIP still passes | **PASS** |
| RV-R-003 | Native key allowlist; extra `bytes` is `forbidden_field`; `conversation.json` is `forbidden_filename` | **PASS** |
| RV-R-004 | Chrome-owned MutationObserver batches ignored | **PASS** |
| RV-R-005 | Resolved sidebar must pass geometry `height>120`, `width>40`, `left<280` | **PASS** |
| RV-R-006 | Safe mode unmounts `#cwa-minimap` | **PASS** |
| RV-R-007 | `isTypingTarget` gates Cmd/Ctrl+Shift+C/S/K | **PASS** |
| RV-R-008 | `emitStatus` dispatches once; chrome ignores `target !== window`; live region unhidden before text | **PASS** |
| RV-R-009 | `result.files` is `Object.keys(zip.files)`; FakeZip `file()` captured | **PASS** |
| RV-R-010 | CSS-hidden file-cards omitted; `media.workflow` remains `visible-dom` | **PASS** |
| RV-R-011 | Specs/ADR/`validation-report` aligned; TASK-043 three codes | **PASS** |

### Review-hardening executed commands

```text
pnpm test
  Vitest: 10 files, 97 tests passed
  node --test inject/chrome.test.js: 13 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

## Skipped checks

- ZIP checksum of the original planning bundle
- jsonschema `--strict` validation of a live sample (package not installed; do not install)
- Pake runtime / `pake:install` / `/Applications`
- Live ChatGPT account fixtures

## Wave assurance (post-merge on main)

Independent per-wave audit on `main`, then exclusive-file fixes. No Wave 6.

| Gap | Owner | Result |
| --- | --- | --- |
| Canonical media/skip URL dedupe (TASK-053) | `inject/export-core.js` | **PASS** |
| CSS-hidden message images omitted | `inject/export-core.js` | **PASS** |
| `/c/new` is not a conversation id | `inject/export-core.js` | **PASS** |
| Fence-safe blank-line collapse | `inject/export-core.js` | **PASS** |
| Abort after ZIP `generateAsync` | `inject/export-core.js` | **PASS** |
| Manifest `media` required; nested `conversation.json` forbidden | `schemas/export-manifest.schema.json` | **PASS** |
| `cwa-scroller` class added only once | `inject/chrome.js` | **PASS** |
| `recover()` cannot exit `safe` | `inject/lifecycle.js` | **PASS** |
| Extra native keys checked first (`bytes` → `forbidden_field`) | `inject/native-bridge.js` | **PASS** |
| Export events set `detail.handled`; tools require it | `inject/export.js` / `inject/tools.js` | **PASS** |
| Isolated `export.js` native fallback tests | `tests/inject/export-boot.test.js` | **PASS** |
| Runtime scan derived from `inject/*.js` (excl. vendor/tests) | `scripts/validate_planning.py` | **PASS** |

Discarded (not defects vs frozen specs): class selectors with combinators; clipboard `execCommand` fallback; emitting `native_unavailable` on successful browser fallback.

### Wave-assurance executed commands

```text
pnpm test
  Vitest: 11 files, 114 tests passed
  node --test inject/chrome.test.js: 13 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

## Wave assurance round 2 (post-merge on main)

Independent per-wave re-audit after the first assurance commit (`e9dcb7e`), then exclusive-file fixes. No Wave 6.

| Gap | Owner | Result |
| --- | --- | --- |
| Visible-thread search root is `main`; skip CSS-hidden and chrome/nav messages | `inject/export-core.js` | **PASS** |
| ZIP fetch allowlist is the canonical visible media URLs only | `tests/inject/export.test.js` | **PASS** |
| Manifest `files` must contain `chat.md` and `MANIFEST.md` | `schemas/export-manifest.schema.json` | **PASS** |
| Stale `.cwa-scroller` class removed when the scroller node changes | `inject/chrome.js` | **PASS** |
| Palette skips missing catalog tools instead of legacy `copy` fallback | `inject/chrome.js` | **PASS** |
| Native `blob` requires `Blob` or size+slice duck-type | `inject/native-bridge.js` | **PASS** |
| Thenable `ping()` results are `native_error` | `inject/native-bridge.js` | **PASS** |
| Diagnostics snapshot `{error}` is `diagnostics_unavailable` | `inject/tools.js` | **PASS** |
| Both Pake configs required, byte-identical, `tools.js` before `chrome.js` | `scripts/validate_planning.py` | **PASS** |
| ZIP native path and `jszip_missing` covered in isolated boot tests | `tests/inject/export-boot.test.js` | **PASS** |

Discarded (not defects vs frozen specs): class selectors with combinators; clipboard `execCommand` fallback; emitting `native_unavailable` on successful browser fallback.

### Wave-assurance round 2 executed commands

```text
pnpm test
  Vitest: 11 files, 126 tests passed
  node --test inject/chrome.test.js: 13 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

## Wave assurance round 3 (auditor leftovers)

Per-wave auditors on `e9dcb7e` confirmed round 2’s known list and found leftover runtime gaps. Exclusive-file fixes on `main`. No Wave 6.

| Gap | Owner | Result |
| --- | --- | --- |
| CSS-hidden descendant text/thinking/citations omitted | `inject/export-core.js` | **PASS** |
| System/tool roles skipped | `inject/export-core.js` | **PASS** |
| Canonical media aliases rewritten after one fetch | `inject/export-core.js` | **PASS** |
| Denied media aliases deduped via normalized `href` | `inject/export-core.js` | **PASS** |
| Never-settling native `saveFile` times out | `inject/native-bridge.js` | **PASS** |
| Export command rejections emit failure status | `inject/export.js` | **PASS** |
| Minimap ignores off-main messages | `inject/chrome.js` | **PASS** |
| Previous sidebar handle/styles torn down on candidate change | `inject/chrome.js` | **PASS** |
| Diagnostics href kinds anchored at pathname start | `inject/diagnostics.js` | **PASS** |
| Diagnostics emit required; throw → `diagnostics_unavailable` | `inject/tools.js` | **PASS** |

Deferred (validator hygiene, not runtime leaks): `--strict` PASS wording when jsonschema is absent; schema `additionalProperties` on nested objects; Windows-separator `conversation.json` variants.

### Wave-assurance round 3 executed commands

```text
pnpm test
  Vitest: 11 files, 134 tests passed
  node --test inject/chrome.test.js: 13 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  PASS: planning overlay (strict)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

## Wave assurance round 4 (validator/schema hygiene)

Independent per-wave re-audit on `bd264b1`, then exclusive-file fixes. No Wave 6. Runtime inject waves had no new P1 leaks.

| Gap | Owner | Result |
| --- | --- | --- |
| `--strict` is WARN when jsonschema is skipped | `scripts/validate_planning.py` | **PASS** |
| Nested limitation/failed/skipped `additionalProperties: false` | `schemas/export-manifest.schema.json` | **PASS** |
| `conversation.json` forbidden across `/`, `\\`, and case | `schemas/export-manifest.schema.json` | **PASS** |
| Spec requires `SHALL NOT contain conversation.json` | `scripts/validate_planning.py` | **PASS** |
| Non-object Pake/schema JSON fails closed without traceback | `scripts/validate_planning.py` | **PASS** |
| In-`main` nav/chrome file-card decoys stay excluded | `tests/fixtures/visible-thread.html` | **PASS** |

### Wave-assurance round 4 executed commands

```text
pnpm test
  Vitest: 11 files, 135 tests passed
  node --test inject/chrome.test.js: 13 passed
  `__CWA_CHROME_BOOTED__` remains undefined when chrome.js is required in Node

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  WARN: planning overlay (strict; jsonschema skipped)

diff -u pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

### Wave-assurance round 4 follow-up

Late exclusive-file inject fixes after the schema/validator commit.

| Gap | Owner | Result |
| --- | --- | --- |
| Native save timeout cleared on success and sync throw | `inject/native-bridge.js` | **PASS** |
| Sync export throws emit failure and release inflight | `inject/export.js` | **PASS** |
| Sidebar styles restored when the candidate unmounts | `inject/chrome.js` | **PASS** |

```text
pnpm test
  Vitest: 11 files, 138 tests passed
  node --test inject/chrome.test.js: 13 passed

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  WARN: planning overlay (strict; jsonschema skipped)
```

## Wave assurance round 5 (hidden text, native snapshot, diagnostics)

Leftover P1/P2 after round 4. Chrome timeout/geometry/export inflight work from the remaining-inject hunt was already on `main` (`8e3758f`). No Wave 6.

| Gap | Owner | Result |
| --- | --- | --- |
| CSS-hidden descendants inside thinking/code/citations/tables/file-cards | `inject/export-core.js` | **PASS** |
| First `.markdown` content root dropped sibling blocks | `inject/export-core.js` | **PASS** |
| Nested `[data-message-author-role]` duplicated turns | `inject/export-core.js` | **PASS** |
| Gap inspection scanned off-`main` chrome | `inject/export-core.js` | **PASS** |
| Native `saveFile` reread payload after validation | `inject/native-bridge.js` | **PASS** |
| Symbol extra keys missed by `Object.keys` | `inject/native-bridge.js` | **PASS** |
| Host getter throw escaped `ping` | `inject/native-bridge.js` | **PASS** |
| Diagnostics adapter accepted arrays / missing schema / no-op emit | `inject/tools.js` | **PASS** |
| Manifest `media.required` omitted included/failed/skipped | `schemas/export-manifest.schema.json` | **PASS** |

### Wave-assurance round 5 executed commands

```text
pnpm test
  Vitest: 11 files, 147 tests passed
  node --test inject/chrome.test.js: 13 passed

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  WARN: planning overlay (strict; jsonschema skipped)

diff -q pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```

## Wave assurance round 6 (Wave 2 chrome + Wave 5 media leftovers)

Independent audits of Wave 2 and Wave 5 against `bd264b1`, applied on current `main`. Geometry restore, hidden file-card labels, and in-main fixture decoys were already on `main`. No Wave 6.

| Gap | Owner | Result |
| --- | --- | --- |
| Safe-mode strikes on home/settings/`/c/new` | `inject/chrome.js` | **PASS** |
| History rescans bypassed scheduler coalescing | `inject/chrome.js` | **PASS** |
| Document-wide role decoys masked in-`main` article fallbacks | `inject/chrome.js` | **PASS** |
| First `<main>` could be a hidden stale pane | `inject/export-core.js` | **PASS** |
| URL fragments split one media resource into many fetches | `inject/export-core.js` | **PASS** |
| Chrome runtime tests stubbed Wave 2 modules | `tests/inject/chrome.runtime.test.js` | **PASS** |
| Escaped/Unicode class-only selectors were allowed | `inject/selectors.js` | **PASS** |
| `lifecycle.boot()` could leave safe | `inject/lifecycle.js` | **PASS** |

### Wave-assurance round 6 executed commands

```text
pnpm test
  Vitest: 11 files, 154 tests passed
  node --test inject/chrome.test.js: 13 passed

python3 scripts/validate_planning.py
  PASS: planning overlay

python3 scripts/validate_planning.py --runtime
  PASS: planning overlay (runtime)

python3 scripts/validate_planning.py --strict
  WARN: jsonschema not installed; skipping --strict schema validation
  WARN: planning overlay (strict; jsonschema skipped)

diff -q pake.json pake.cwa.json
  identical (exit 0)

rg -n "/backend-api/conversation|/backend-api/conversations|/api/auth/session" inject
  inject/: no hits

git diff --check
  clean
```
