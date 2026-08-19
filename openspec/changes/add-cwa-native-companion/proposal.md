# Change: add-cwa-native-companion

## Why

Downloads currently use the untrusted ChatGPT.com origin Blob path. An optional page-world protocol lets a future Pake/Tauri host save files without enlarging ChatGPT network authority.

## Requirements

- Protocol `cwa.native.v1`
- Host: `global.__cwaNative.saveFile({ filename, blob, mime })`
- Missing host → `native_unavailable`; export falls back to `triggerDownload`
- CWA-owned envelopes allow only `filename`, Blob `blob`, and optional `mime`; invalid envelopes do not invoke the host
- A sanitized `conversation.json` filename is forbidden
- `__cwaNative` is directly callable in the page world; this envelope is not a sandbox
- No native host or sidecar and no dependency upgrade in this change

#### Scenario: No host

- **WHEN** `__cwaNative` is absent
- **THEN** `saveFile` returns `{ ok: false, error: "native_unavailable" }`
- **AND** Markdown/ZIP still use the browser download path
