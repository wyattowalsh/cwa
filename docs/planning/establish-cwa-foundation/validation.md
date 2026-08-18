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
- Inject runtime (`inject/export-core.js`, `inject/export.js`, `inject/chrome.js`) MUST NOT match those endpoints after TASK-012.

## Out of scope this run

Pake GUI, `/Applications`, live ChatGPT session, `--strict` if jsonschema missing.
