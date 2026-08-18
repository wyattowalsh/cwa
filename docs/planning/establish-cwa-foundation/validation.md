# Validation

## Commands

```bash
pnpm test
python3 scripts/validate_planning.py
python3 scripts/validate_planning.py --runtime
rg -n "/backend-api/conversation|/api/auth/session" inject tests openspec docs schemas scripts
```

## PASS rules

- PASS only for executed commands (exit 0) plus reviewed ripgrep hits.
- Specs and negative tests MAY mention forbidden URLs.
- Inject runtime (`inject/export-core.js`, `inject/export.js`, `inject/chrome.js`, and the Wave 2–4 modules below) MUST NOT match those endpoints.

## Wave 2–5 inject surface

- Compatibility runtime: `inject/selectors.js`, `inject/scheduler.js`, `inject/lifecycle.js`, `inject/safe-mode.js`, `inject/diagnostics.js`
- Native boundary: `inject/native-bridge.js`
- Local tools: `inject/tools.js`
- Visible-DOM media workflow: `collectVisibleFileCards` and manifest/fetch integration in `inject/export-core.js`

Validation TASK-028, TASK-038, TASK-048, and TASK-058 are recorded with executed results in `PLANS.md`.

## Out of scope this run

Pake GUI, `/Applications`, live ChatGPT session, `--strict` if jsonschema missing.
