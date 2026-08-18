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

CWA SHALL send only a sanitized filename, local Blob or bytes, and MIME type across the native boundary. Payloads containing cookie, Authorization, bearer, token, header, or conversation JSON fields SHALL be rejected before host invocation.

#### Scenario: Forbidden field

- **WHEN** a native save payload contains a `cookie` or `token` field
- **THEN** `saveFile` returns `forbidden_field`
- **AND** `__cwaNative.saveFile` is not called

#### Scenario: Allowed local file

- **WHEN** a valid `chat.md` Blob is offered to an available host
- **THEN** the host receives only the local file payload
- **AND** the bridge reports protocol `cwa.native.v1` with `via` set to `native`

### Requirement: No native sidecar is implied

This change SHALL define a page-world protocol boundary only. It SHALL NOT ship a native binary, add a native dependency, or grant the companion access to ChatGPT cookies, tokens, private APIs, or hidden conversation state.

#### Scenario: Browser-only installation

- **WHEN** CWA runs without a companion implementation
- **THEN** visible-thread export remains available through browser capabilities
- **AND** no companion setup is required
