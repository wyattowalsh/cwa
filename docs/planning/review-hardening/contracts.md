# Frozen contracts — RV-R-001–011

Agents must not invent new event names, globals, or status codes.
Adding a code requires updating this file in the same change.

## In scope

RV-R-001 through RV-R-011 from the 2026-08-18 range review of `9317155..79bfe8a`.

Cheap extras that share those owner files:

- parse-failure skip reason `invalid_url` (not `forbidden_endpoint`)
- freeze `CwaTools` catalog records
- diagnostics adapter returns `ok: false` / `diagnostics_unavailable` when snapshot is missing
- palette `aria-activedescendant` on the focused filter input

## Out of scope

Do **not** implement these even if a planner mentioned them:

- Markdown fence blank-line collapsing
- `/c/new` route guard changes
- Double in-flight guards in `export.js` vs core
- Emitting `native_unavailable` from `export.js` (formatter already has the string)
- `formatExportStatus` coverage of every media reason
- Schema forbidding `media/conversation.json` path segments
- Validator `INJECT_RUNTIME` glob rewrite
- Class-selector combinators (spec is class-**only**)
- Foundation TASK-001–019 reopen
- New npm packages, `pnpm install`, `pake:install`, signing

## Globals (do not rename)

`CwaExportCore`, `CwaExport`, `CwaNativeBridge`, `CwaChrome`, `CwaTools`, `CwaDiagnostics`, `CwaSelectors`, `CwaScheduler`, `CwaLifecycle`, `CwaSafeMode`

Boot flags: `__cwaExportBooted`, `__CWA_CHROME_BOOTED__`, `__CWA_HISTORY_HOOKED__`, `__CWA_OBSERVER__`

Host hook: `global.__cwaNative.saveFile`

## Events (literal strings)

| Name | Init |
| --- | --- |
| `cwa:copy` | `{ bubbles: true, cancelable: true }` from chrome; tools may omit `cancelable` |
| `cwa:save-md` | same |
| `cwa:save-zip` | same |
| `cwa:export-status` | `{ bubbles: true, detail }` — **one dispatch per result**, prefer `window` |
| `cwa:diagnostics` | existing diagnostics helper |

## Media destination policy (RV-R-001)

A candidate URL is fetchable only when **all** of the following hold:

1. Scheme is `http:` or `https:` (root-relative URLs resolved against the page origin).
2. URL parses; no username/password.
3. Normalized pathname does **not** start with `/backend-api/` or `/api/auth/` (lowercase, collapse duplicate slashes, `decodeURIComponent` best-effort).
4. Destination is either:
   - **same-origin** as the provided page origin (protocol + hostname + port), or
   - `https:` with hostname **exactly** `files.oaiusercontent.com` and default port.

Fetch init:

```js
{ credentials: "omit", redirect: "error", signal: controller && controller.signal }
```

After a response returns and **before** `blob()`:

- Reject missing/unusable `res.url` → `invalid_response_url` (failed)
- Reject `res.redirected === true` or `res.type === "opaqueredirect"` → `redirected_response` (failed)
- Re-run the destination policy on `res.url`

Skip/fail reasons:

| Code | When |
| --- | --- |
| `forbidden_endpoint` | Allowed host, denied provider path prefix |
| `disallowed_host` | Host/origin not on the allowlist |
| `unsupported_scheme` | Not http(s) / not a fetchable URL shape |
| `invalid_url` | Parse failure, credentials, relative URL with no origin |
| `redirected_response` | Response indicates a redirect was followed |
| `invalid_response_url` | Empty or unparsable `res.url` |
| `network` | Fetch threw (including `redirect: "error"`) |
| existing | `count_cap`, `size_cap`, `time_cap`, `too_large`, `no_fetch`, `cancelled`, `http_<status>` |

Do **not** put `/backend-api/conversation`, `/backend-api/conversations`, or `/api/auth/session` string literals in `inject/`.

Do **not** allow `*.oaiusercontent.com`, `oaistatic.com`, localhost as a CDN, or IP literals unless they are the page origin.

## Media caps (RV-R-002)

- One collection deadline from `started + maxMs`.
- Injectable `setTimeout` / `clearTimeout` / `abortControllerFactory` on `createExporter` deps.
- Tests **must** inject a manual timer that does not fire unless the test fires it (default `MEDIA_MAX_MS` is 8000).
- Per-request `AbortController`; race fetch and `blob()` against the deadline.
- Opportunistic `Content-Length` vs per-file and remaining total caps; residual: unknown-length bodies still materialize before size is known.
- Do **not** stream `ReadableStream`.
- Preserve the mock-clock pre-fetch `time_cap` test and the hang-first-fetch duplicate ZIP test.

## Native protocol (RV-R-003)

Allowlisted own enumerable keys: `filename`, `blob`, optional `mime`.

- Extra key (including `bytes`) → `forbidden_field`; host not called.
- Missing/invalid filename or non-Blob `blob` → `invalid_payload`.
- Exact filename `conversation.json` (case-insensitive, after basename sanitize) → `forbidden_filename`.
- `mime` remains optional.
- Do **not** sniff Blob bytes as a security control.
- Honest wording: page-world is not a sandbox; `__cwaNative` is directly callable; this is envelope validation for CWA-owned calls.

## Chrome (RV-R-004–008)

- Stamp `data-cwa-chrome="1"` on toolbar, palette, palette backdrop, minimap, export status, sidebar handle.
- MutationObserver: if **every** record is chrome-owned, skip the 80ms `mutate` job.
- `.cwa-scroller` is **not** chrome-owned.
- `findSidebar`: geometry filter `height > 120 && width > 40 && left < 280` applies to **resolved** nodes too; decoys fall through to the candidate scan.
- Safe mode: `unmountMinimap()` removes `#cwa-minimap` and the scroller class; do not remount while safe.
- `isTypingTarget` gates Cmd/Ctrl+Shift+C/S/K; Escape still closes the palette from the filter input.
- `onExportStatus`: ignore events whose `target !== window`; unhide the live region **before** assigning non-empty `textContent`.

## ZIP files list (RV-R-009)

`result.files` on success and `download_denied` is `Object.keys(zip.files)` after all `zip.file()` calls. Tests capture the FakeZip instance and assert `file()` arguments.

## Visible-DOM label (RV-R-010)

Keep wire value `media.workflow = "visible-dom"` (schema enum, TASK-055).

Clarify: mounted under `main`, excluding nav/CWA chrome and **CSS-hidden** ancestors (`hidden`, `display:none`, `visibility:hidden|collapse`, `opacity:0`). Not viewport intersection. Happy-DOM `getBoundingClientRect` is `0x0` — **do not** use geometry.

## Tools extras

- `catalog()` returns copies; mutating the copy cannot change later `catalog()` / `find()`.
- Freeze catalog records.
- Missing diagnostics snapshot → `{ ok: false, error: "diagnostics_unavailable" }`.

## Chrome tests (isolation)

`inject/chrome.test.js` remains `node --test` and **must not** create a DOM. Export new pure helpers on `CwaChrome` (`isTypingTarget`, `isSidebarCandidate`, `isChromeOwnedNode`, `shouldIgnoreMutations`).

`tests/inject/chrome.runtime.test.js` **must not** `import`/`require` `inject/chrome.js` into the shared Vitest happy-dom document (a MutationObserver on `documentElement` would leak into export tests in the same worker). Load the script with `fs.readFileSync` + `new Window()` from `happy-dom` (or equivalent isolated window) and `eval` there.

## Inject dialect

Classic IIFE. Match the file: `var`, `function`, existing `async function` where already used. Keep `module.exports` tails. No `innerHTML`. No new dependencies.

## Pake

Do not edit `pake.json` / `pake.cwa.json` unless inject order must change (it must not for this work).

## Evidence

Do not write PASS/FAIL into `PLANS.md` or `validation-report.md` until Wave V pastes executed command output.
