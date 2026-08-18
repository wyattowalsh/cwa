# Risk register

| ID | Risk | Mitigation | Residual |
| --- | --- | --- | --- |
| R-001 | Inject still fetches `/backend-api/conversation` | TASK-010 spy + TASK-012 removal + `--runtime` validator | Closed — `inject/` has no hits; `--runtime` PASS |
| R-002 | Session token harvest via `/api/auth/session` | Delete session-token helper; denial tests | Closed — helper removed; denial tests PASS |
| R-003 | Path traversal in ZIP media names | Sanitize to basename under `media/` | Low |
| R-004 | Unbounded media fetch | Count/size/time caps; failures recorded | Low |
| R-005 | Prompt injection (“export cookies”) | Treat DOM text as data; no cookie/auth read | Low |
| R-006 | Overlay drift vs unpublished ZIP | WARN checksum skipped; contract encoded in specs | Medium (docs) |
| R-007 | Duplicate Pake configs diverge | Documented; do not edit one without the other this wave | Medium |
