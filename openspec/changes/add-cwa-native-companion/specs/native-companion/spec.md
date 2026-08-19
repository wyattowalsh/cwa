# Delta: native-companion

## ADDED Requirements

### Requirement: Native companion is optional and fail-closed

CWA SHALL use protocol `cwa.native.v1` only when `global.__cwaNative.saveFile` is callable. A missing or failing host SHALL NOT block the existing browser Blob download path.

#### Scenario: No host

- **WHEN** `__cwaNative` is absent
- **THEN** native `saveFile` returns `native_unavailable`
- **AND** Markdown and ZIP saves fall back to `triggerDownload`

#### Scenario: Host failure

- **WHEN** the native host rejects or throws during `saveFile`
- **THEN** the bridge returns `native_error` or the host’s normalized error code
- **AND** the export path attempts the browser download without exposing host exception content

### Requirement: Native payload is local-file-only

CWA SHALL accept only own enumerable `filename`, Blob `blob`, and optional `mime` fields for a CWA-owned native save call. Any extra field SHALL return `forbidden_field`; a missing or invalid filename or non-Blob `blob` SHALL return `invalid_payload`; and a sanitized filename equal to `conversation.json`, case-insensitively, SHALL return `forbidden_filename`. An invalid envelope SHALL NOT invoke the host.

#### Scenario: Forbidden field

- **WHEN** a native save payload contains any extra field, including `cookie`, `token`, or `bytes`
- **THEN** `saveFile` returns `forbidden_field`
- **AND** `__cwaNative.saveFile` is not called

#### Scenario: Bytes are not a Blob

- **WHEN** the `blob` field contains bytes rather than a Blob and the envelope has no extra fields
- **THEN** `saveFile` returns `invalid_payload`
- **AND** `__cwaNative.saveFile` is not called

#### Scenario: Conversation JSON filename

- **WHEN** the sanitized filename is `conversation.json`, regardless of case
- **THEN** `saveFile` returns `forbidden_filename`
- **AND** `__cwaNative.saveFile` is not called

#### Scenario: Allowed local file

- **WHEN** a valid `chat.md` Blob is offered to an available host
- **THEN** the host receives only `filename`, `blob`, and optional `mime`
- **AND** the bridge reports protocol `cwa.native.v1` with `via` set to `native`

### Requirement: No native sidecar is implied

This change SHALL define validation for CWA-owned page-world calls only. It SHALL NOT ship a native host or sidecar, add a native dependency, or grant the companion access to ChatGPT cookies, tokens, private APIs, or hidden conversation state. Because page-world scripts can call `__cwaNative.saveFile` directly, the envelope SHALL NOT be described as a sandbox or as the host’s security boundary.

#### Scenario: Browser-only installation

- **WHEN** CWA runs without a companion implementation
- **THEN** visible-thread export remains available through browser capabilities
- **AND** no companion setup is required
