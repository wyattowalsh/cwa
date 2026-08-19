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
| R-008 | Safe mode disables export along with selector-dependent chrome | Keep toolbar/palette export events mounted while skipping sidebar/minimap work; cover the separation in tests | Low after validation |
| R-009 | Untrusted page-world code sends hidden fields to a native host or bypasses the bridge | For CWA-owned calls, allow only `filename`, Blob `blob`, and optional `mime`; reject an invalid envelope before host invocation and fall back on host failure | High for a host implementation — page-world code can call `__cwaNative.saveFile` directly; bridge validation is not a sandbox |
| R-010 | Visible file-card URLs are private, signed, or capability-bearing | Fetch only same-origin destinations or exactly `https://files.oaiusercontent.com` at its default port; omit credentials, deny private provider paths, set `redirect: "error"`, revalidate response URLs, apply caps, and record failures | Medium — an allowed URL can still be capability-bearing |
| R-011 | `pake.json` and `pake.cwa.json` inject lists drift | Keep both ordered lists synchronized and compare them in planning shape validation | Low |
