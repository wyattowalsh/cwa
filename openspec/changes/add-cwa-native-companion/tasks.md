# Tasks: add-cwa-native-companion (Wave 3)

Execute **TASK-030 through TASK-039** in this sibling change. Wave 1 remains frozen in `establish-cwa-foundation`, and Wave 2 owns the compatibility runtime.

Status legend: `[ ]` pending · `[x]` implementation artifact present · command evidence lives in `docs/planning/establish-cwa-foundation/PLANS.md`.

RV-R-003 correction: TASK-032–033 are Blob-only: a non-Blob `blob` is `invalid_payload`, any extra key is `forbidden_field`, and `conversation.json` is `forbidden_filename`; invalid envelopes never invoke the host. `__cwaNative` remains directly callable by page-world code, and no native host or sidecar ships.

## Wave 3 — optional native companion (TASK-030–039)

- [x] **TASK-030** Add `inject/native-bridge.js` with protocol identifier `cwa.native.v1` and an optional `global.__cwaNative` host boundary.
- [x] **TASK-031** Detect the host without probing provider APIs; return `native_unavailable` when `__cwaNative.saveFile` is absent and normalize host ping failures to `native_error`.
- [x] **TASK-032** Validate native save payloads before host invocation. Reject cookie, Authorization, bearer, token, header, or conversation-JSON-shaped fields.
- [x] **TASK-033** Forward only the local filename, Blob, and MIME type to the host; normalize host rejection and exceptions without exposing exception content.
- [x] **TASK-034** Integrate optional native save into `inject/export.js`; any missing host, host rejection, or host exception falls back to the existing browser Blob download path.
- [x] **TASK-035** Load `native-bridge.js` before export modules in both Pake configs. Do not add a sidecar binary, native dependency, provider credential bridge, or dependency upgrade.
- [x] **TASK-036** Add focused unit coverage for missing-host behavior, forbidden payload rejection before host invocation, and the allowed local-file payload.
- [x] **TASK-037** Record the fail-closed boundary in `docs/adr/0007-native-companion-fail-closed.md` and keep the companion explicitly optional.
- [x] **TASK-038** Run `pnpm test`, `python3 scripts/validate_planning.py`, `python3 scripts/validate_planning.py --runtime`, and the forbidden-endpoint ripgrep review. Replace all Wave 3 TBD placeholders only with executed results.
- [x] **TASK-039** Update the Wave 3 evidence table and recommendation after TASK-038. Do not claim a shipped native host or PASS while validation evidence is TBD.
