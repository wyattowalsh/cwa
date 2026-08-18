# Repository inventory

Recorded against HEAD `6da172fbc9d44f956f525813810e875a3579b270` plus additive planning overlay.

## Product

- Name: **cwa** (ChatGPT Web App)
- Bundle id: `com.wyattowalsh.cwa`
- Origin: `https://github.com/wyattowalsh/cwa`
- Runtime: Pake CLI 3.15.7 wrapping `https://chatgpt.com`

## Config

| Path | Role |
| --- | --- |
| `pake.cwa.json` | Script source of truth (`pnpm pake:build`) |
| `pake.json` | Duplicate of `pake.cwa.json` (do not delete in Wave 1) |
| `package.json` | `pnpm test` = Vitest + `node --test inject/chrome.test.js` |
| `pnpm-lock.yaml` | Present; restore only, no extra packages |

## Inject (page world)

| Path | Role |
| --- | --- |
| `inject/theme.css` | Tokens + chrome widgets; sentinel `cwa-theme-sentinel` |
| `inject/chrome.js` | Toolbar, palette, sidebar, minimap; dispatches export events |
| `inject/export-core.js` | Serializer + exporter |
| `inject/export.js` | Page-world boot |
| `inject/vendor/jszip.min.js` | JSZip 3.10.1 vendored |

## Tests

- `tests/inject/export-core.test.js`
- `tests/inject/export.test.js`
- `tests/fixtures/visible-thread.html`
- `inject/chrome.test.js`

## Planning overlay (this change)

OpenSpec under `openspec/changes/establish-cwa-foundation/`, docs under `docs/planning/establish-cwa-foundation/`, schema `schemas/export-manifest.schema.json`, validator `scripts/validate_planning.py`.
