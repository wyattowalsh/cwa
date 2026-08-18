# Delta: native-companion-boundary

## ADDED Requirements

### Requirement: Wave 1 has no native bridge

Wave 1 SHALL NOT implement Tauri/Pake IPC, sidecar binaries, or filesystem bridges. Those capabilities remain proposal-only under `add-cwa-native-companion`.

#### Scenario: Export stays in the webview

- **WHEN** the user saves Markdown or ZIP in Wave 1
- **THEN** the browser download / Blob path is used
- **AND** no native companion protocol is required
