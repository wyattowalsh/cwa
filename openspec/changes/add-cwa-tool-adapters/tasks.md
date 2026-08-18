# Tasks: add-cwa-tool-adapters (Wave 4)

Execute **TASK-040 through TASK-049** in this sibling change. Earlier waves retain their own boundaries and evidence.

Status legend: `[ ]` pending · `[x]` implementation artifact present · command evidence lives in `docs/planning/establish-cwa-foundation/PLANS.md`.

## Wave 4 — local tool adapters (TASK-040–049)

- [x] **TASK-040** Add `inject/tools.js` with a local catalog for `copy-visible`, `save-md`, `save-zip`, and `diagnostics`.
- [x] **TASK-041** Dispatch the existing `cwa:copy`, `cwa:save-md`, and `cwa:save-zip` events for export adapters instead of duplicating export behavior.
- [x] **TASK-042** Route the diagnostics adapter through `CwaDiagnostics.snapshot` and `cwa:diagnostics` so its result retains Wave 2 redaction.
- [x] **TASK-043** Fail closed with `unknown_tool` for catalog misses and `unhandled_tool` for catalog entries without a supported local action.
- [x] **TASK-044** Integrate the adapters with the existing command palette while preserving keyboard and toolbar export entry points.
- [x] **TASK-045** Keep `tools/catalog.yaml` synchronized with the runtime ids/events and set its policy to `no default network`.
- [x] **TASK-046** Keep adapters local-only: no default network transport, private provider endpoint, hidden store scrape, cookie read, token read, or conversation JSON path.
- [x] **TASK-047** Load `tools.js` before `chrome.js` in both Pake configs and add unit coverage for catalog shape, export event dispatch, diagnostics redaction, and unknown-id rejection.
- [ ] **TASK-048** Run `pnpm test`, `python3 scripts/validate_planning.py`, `python3 scripts/validate_planning.py --runtime`, and the forbidden-endpoint ripgrep review. Replace all Wave 4 TBD placeholders only with executed results.
- [ ] **TASK-049** Update the Wave 4 evidence table and recommendation after TASK-048. Do not claim PASS or add network-capable tools while validation evidence is TBD.
