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
| TASK-019 | Reassessment | Export boundary is clean. **Stop. Do not start TASK-020 in this run.** Next dependency-ready work in a later change is TASK-020 (chrome compatibility runtime). |

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

Wave 1 export no longer issues private conversation or session fetches. This historical gate cleared Wave 2 as a sibling change; TASK-001–019 remain frozen.

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
| TASK-043 | Unknown/unhandled tool errors | **PASS** — `unknown_tool` / `event_unavailable` |
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

## Skipped checks

- ZIP checksum of the original planning bundle
- jsonschema `--strict` validation of a live sample (package not installed; do not install)
- Pake runtime / `pake:install` / `/Applications`
- Live ChatGPT account fixtures
