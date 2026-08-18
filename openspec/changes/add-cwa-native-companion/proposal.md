# Change: add-cwa-native-companion

## Why

Downloads currently use the untrusted ChatGPT.com origin Blob path. A optional page-world protocol lets a future Pake/Tauri host save files without enlarging ChatGPT network authority.

## Requirements

- Protocol `cwa.native.v1`
- Host: `global.__cwaNative.saveFile({ filename, blob, mime })`
- Missing host → `native_unavailable`; export falls back to `triggerDownload`
- Payloads MUST NOT include cookies, Authorization, tokens, or conversation JSON
- No sidecar binary and no dependency upgrade in this change

#### Scenario: No host

- **WHEN** `__cwaNative` is absent
- **THEN** `saveFile` returns `{ ok: false, error: "native_unavailable" }`
- **AND** Markdown/ZIP still use the browser download path
