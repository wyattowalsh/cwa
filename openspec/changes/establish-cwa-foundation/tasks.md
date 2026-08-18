# Tasks: establish-cwa-foundation (Wave 0–1)

Execute **TASK-001 through TASK-019** in this change. Stop after TASK-019. Do not start TASK-020 (Wave 2 chrome) in this run.

Status legend: `[ ]` pending · `[x]` done · evidence lives in `docs/planning/establish-cwa-foundation/PLANS.md`.

## Wave 0 — grounding (TASK-001–009)

- [x] **TASK-001** Record `git rev-parse HEAD` and compare to `evidence/repository-snapshot.json` expected SHA `6da172fbc9d44f956f525813810e875a3579b270`. Stop if HEAD differs and the diff is material.
- [x] **TASK-002** Record `git status --short` and untracked overlay/planning paths. Do not commit the extracted planning ZIP/tree.
- [x] **TASK-003** Compare `git ls-files` to snapshot `tracked_files`. Expected additive overlay files only.
- [x] **TASK-004** Run `pnpm test` only (lockfile present). If missing pnpm/`node_modules`, mark BLOCKED with the exact prerequisite — no extra `pnpm install` of new packages.
- [x] **TASK-005** Document duplicate `pake.json` / `pake.cwa.json`; scripts use `pake.cwa.json`. Do not delete either file this wave unless inventory says otherwise.
- [x] **TASK-006** Record JSZip vendor file SHA-256, license, and version in `source-registry.md` / `decision-log.md`. No vendor upgrade.
- [x] **TASK-007** Confirm inject surface: `theme.css`, `chrome.js`, `export.js`, `export-core.js`, `vendor/jszip.min.js`.
- [x] **TASK-008** Freeze Wave 1 scope: no chrome rewrite, no native/tools/media OpenSpec *implementation*, no dependency upgrades, no `pake:install`.
- [x] **TASK-009** Update PLANS.md Wave 0 evidence table. Mark Wave 0 complete only with executed commands.

## Wave 1 — truthful visible-thread export (TASK-010–019)

- [x] **TASK-010** Add a failing Vitest that `saveZip()` (and copy/md if they share the helper) must not fetch `/backend-api/conversation`, `/backend-api/conversations`, `/api/auth/session`, or other conversation-list / session-token routes. Capture unexpected `fetch` URLs.
- [x] **TASK-011** Update export-portability spec and `schemas/export-manifest.schema.json`: ZIP = locally generated `chat.md` + limitations/provenance manifest + bounded visible media. No `includedJson`, no `conversation.json` ZIP entry, no format `json` meaning conversation payload. `source.authority` remains `observed-ui` / `local-cwa`.
- [x] **TASK-012** Remove `conversationRequestUrl`, `fetchCurrentConversationJson`, `readSameOriginAccessToken`, `countConversationJsonMessages`, ZIP `conversation.json`, `includedJson`, Authorization/cookie/session harvest from `inject/export-core.js` / `inject/export.js`. Keep DOM Markdown, copy, Blob download, JSZip of local files, official Settings → Export guidance.
- [x] **TASK-013** Preserve Markdown serializer tests in `tests/inject/export-core.test.js`. Drop assertions that require the conversation URL helper.
- [x] **TASK-014** ZIP tests: archive contains `chat.md` + manifest; **no** `conversation.json`; `fetch` only for explicit visible media URLs; conversation-endpoint spy is empty.
- [x] **TASK-015** Media bounds: sanitize filenames (no traversal), cap count/size/time; failed media recorded; Markdown still succeeds.
- [x] **TASK-016** Minimal chrome/export status for copy / md / partial ZIP / ZIP unavailable / cancelled / duplicate / clipboard deny / download deny / unsupported route. Do **not** start Wave 2 selector registry or MutationObserver rewrite.
- [x] **TASK-017** Denial tests: clipboard deny, storage/download deny, missing JSZip, unsupported route, prompt-injected “export cookies” fixture — independent failures; no cookies/auth headers/hidden stores/other conversations.
- [x] **TASK-018** Full `pnpm test`; `python3 scripts/validate_planning.py` (and `--runtime` once the leak is gone); ripgrep `/backend-api/conversation` and review every hit. PASS only with executed evidence.
- [x] **TASK-019** Update PLANS, risk-register, decision-log; recommend Wave 2 only if export boundary is clean. **Do not start TASK-020.**

## Later waves (not this run)

- [ ] **TASK-020+** Chrome selector registry / native companion / tool adapters / media workflows — documented in sibling OpenSpec changes only. **Not started.**
