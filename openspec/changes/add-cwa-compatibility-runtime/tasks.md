# Tasks: add-cwa-compatibility-runtime (Wave 2)

Execute **TASK-020 through TASK-029** in this sibling change. Wave 1 remains frozen in `establish-cwa-foundation`.

Status legend: `[ ]` pending · `[x]` implementation artifact present · command evidence lives in `docs/planning/establish-cwa-foundation/PLANS.md`.

## Wave 2 — compatibility runtime (TASK-020–029)

- [x] **TASK-020** Add `inject/selectors.js` with ordered role, landmark, and `data-testid` fallbacks for sidebar, message, composer, thinking, citation, and file-card targets. Reject hashed class-only selectors.
- [x] **TASK-021** Add `inject/scheduler.js` to coalesce animation-frame and timeout work by stable job id, with cancellation and flush support.
- [x] **TASK-022** Add `inject/lifecycle.js` with explicit idle, booting, ready, navigating, degraded, and safe states for boot and SPA navigation.
- [x] **TASK-023** Add `inject/safe-mode.js`; enter safe mode after three consecutive critical message-selector misses and reset the strike count after a successful probe.
- [x] **TASK-024** Add `inject/diagnostics.js` with redacted selector, lifecycle, safe-mode, and route-kind snapshots. Do not include message text, cookies, tokens, Authorization, or conversation JSON.
- [x] **TASK-025** Integrate the registry, scheduler, lifecycle, and safe-mode APIs into `inject/chrome.js` so SPA rescans are coalesced and noncritical selector misses degrade without forcing safe mode.
- [x] **TASK-026** Keep toolbar, palette, Copy, Markdown, and ZIP event surfaces available in safe mode while skipping selector-dependent chrome work such as sidebar resize and minimap rebuild.
- [x] **TASK-027** Load compatibility modules before `chrome.js` in both Pake configs and add focused synthetic-DOM/unit coverage for selector safety, scheduler coalescing, lifecycle transitions, safe-mode strikes, diagnostics redaction, and chrome integration.
- [ ] **TASK-028** Run `pnpm test`, `python3 scripts/validate_planning.py`, `python3 scripts/validate_planning.py --runtime`, and the forbidden-endpoint ripgrep review. Replace all Wave 2 TBD placeholders only with executed results.
- [ ] **TASK-029** Update the Wave 2 evidence table and recommendation after TASK-028. Do not claim PASS or advance the gate while validation evidence is TBD.
