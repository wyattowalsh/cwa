# Plan: review hardening (RV-R-001–011)

Range: `9317155..79bfe8a` on `cursor/cwa-waves-2-plus-c576`.
Contracts: `docs/planning/review-hardening/contracts.md`.
Graph: `docs/planning/review-hardening/task-graph.md`.

## Goal

Close every range-review finding with exclusive-file parallel agents, without reopening Wave 1, without new packages, and without claiming sandbox powers the page world does not have.

## Planning method

Seven planning agents reviewed export allowlisting, in-flight caps, native fail-closed, chrome loops, tests/workflow labels, docs drift, and a parallel task graph. This document is the **reconciled** plan after critique — not a union of every suggestion.

## Critique (what we rejected)

| Suggestion | Verdict | Why |
| --- | --- | --- |
| HTTPS-only `chatgpt.com` + drop localhost origin fallback | **Reject** | Tests and real sessions use the **page origin** (`chatgpt.com` or `chat.openai.com`). Same-origin relative `/files/` must keep working. Localhost is allowed only when it **is** the page origin. |
| Allow `*.oaiusercontent.com` / `oaistatic.com` | **Reject** | Fixtures only prove `files.oaiusercontent.com`. Suffix matching is an attack primitive. |
| Rely on `res.url` after default redirect following | **Reject** | The redirected request already happened. Use `redirect: "error"` **and** validate `res.url`. |
| Abort in-flight via real `setTimeout` only | **Reject** | `MEDIA_MAX_MS` is 8000; the hang-first-fetch duplicate test would flake. Timers must be injectable; tests inject a manual scheduler that does not fire unless asked. |
| ReadableStream size abort | **Defer** | Compatibility cost. Residual: unknown-length bodies still materialize; document it. |
| Blob content sniffing / ZIP unzip for `conversation.json` | **Reject** | Bypassable; false positives on visible-thread text. Envelope + filename only. |
| Require `mime`; reject any filename containing `conversation` | **Reject** | Breaks current valid `cwa.md` payloads and legitimate titles. |
| Rename `media.workflow` to `main-subtree` | **Reject** | Breaks schema enum and TASK-055. Keep `visible-dom`; add CSS-hidden filtering + honest docs. |
| Split tests into a later wave from the code owner | **Reject for this repo** | API mismatch risk on `export-core.js`. Same owner writes code + its tests. Parallelism is **by file**, not by tests-vs-impl. |
| Graph-agent extras E2/E4/E5/E6/E8/E11/E13 | **Out of scope** | Not in RV-R-001–011. Do not inflate this change. |
| “008 emitStatus if moved” as one agent’s choice | **Reject** | Frozen: `emitStatus` stays in `export-core.js`; chrome listener is independently safe. |

## Critique (what we accepted)

- Exact-host CDN allowlist + same-origin + `redirect: "error"` + pre-`blob()` `res.url` check (RV-R-001).
- Injectable deadline + per-request AbortController + race (RV-R-002).
- Key allowlist, reject `bytes`, honest ADR (RV-R-003).
- Chrome-owned mutation filter, not “observe a different root and miss provider attributes” (RV-R-004).
- Geometry filter on resolved sidebars (RV-R-005).
- Unmount minimap in safe mode (RV-R-006).
- Wire `isTypingTarget` (RV-R-007).
- Dual-dispatch fix in core **and** chrome target guard (RV-R-008).
- `result.files` from `zip.files`; capture FakeZip; fix operator-grouping assertion (RV-R-009).
- CSS-hidden filter without geometry (RV-R-010).
- Docs/spec/TASK-043/`validation-report` drift (RV-R-011).

## Parallelization

Max useful fan-out is **five implementation agents**. The critical path is `export-core.js` and `chrome.js`; extra agents do not shorten it.

| Agent | Exclusive files | Findings |
| --- | --- | --- |
| D1-CORE | `inject/export-core.js`, `tests/inject/export-core.test.js`, `tests/inject/export.test.js`, `schemas/export-manifest.schema.json` (description only) | 001, 002, 008 emit, 009, 010 |
| D1-CHROME | `inject/chrome.js`, `inject/chrome.test.js`, `tests/inject/chrome.runtime.test.js` (new) | 004, 005, 006, 007, 008 listener, a11y extra |
| D1-BRIDGE | `inject/native-bridge.js`, `tests/inject/native-bridge.test.js` | 003 |
| D1-TOOLS | `inject/tools.js`, `tests/inject/tools.test.js` | extras |
| D1-DOCS | OpenSpec sibling specs/design/tasks, ADRs, known-limitations, risk-register, SECURITY.md, validation-report count/status sentences — **not** `PLANS.md` evidence tables | 011 |

Wave V (orchestrator only): `pnpm test`, `python3 scripts/validate_planning.py --runtime`, ripgrep `inject/` for forbidden literals, then scribe `PLANS.md` / `validation-report.md`.

## Acceptance (all must hold)

- Arbitrary HTTP(S) hosts are never fetched; fixture CDN + same-origin `/files/` still export.
- Redirects are not followed; bad final URLs never call `blob()`.
- In-flight fetch/`blob()` abort when the injectable deadline fires; duplicate ZIP hang test still passes.
- Native extra keys including `bytes` never reach the host; docs do not claim a sandbox.
- Minimap `replaceChildren` does not schedule another `mutate` job.
- Resolved generic `aside`/`nav` decoys fail geometry.
- Safe mode removes `#cwa-minimap`.
- Composer Cmd/Ctrl+Shift+C/S/K are not stolen.
- One live-region text write per status; region unhidden before text.
- ZIP `result.files` matches FakeZip contents.
- CSS-hidden file-cards omitted; `media.workflow` remains `visible-dom`.
- `pnpm test` green; `--runtime` PASS; `inject/` has zero forbidden full-path literals.
- `inject/chrome.test.js` still asserts `__CWA_CHROME_BOOTED__ === undefined` in Node.
- Vitest chrome runtime tests use an isolated `happy-dom` `Window`; they never boot chrome on the shared document.

## Residual risk (document, do not “fix”)

- Page scripts can call `__cwaNative.saveFile` directly.
- Allowed Blobs may contain user-pasted secrets or renamed JSON.
- Unknown-length media bodies can still fully download before size caps.
- New ChatGPT CDN hostnames need an explicit allowlist amendment + fixture.
