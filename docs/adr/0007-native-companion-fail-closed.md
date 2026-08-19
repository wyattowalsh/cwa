# ADR 0007: Native companion is optional and fail-closed

## Status

Accepted (Wave 3)

## Context

File saves happen in the ChatGPT.com page world via Blob download. A native host can optionally receive a local Blob.

## Decision

`CwaNativeBridge` talks only to `global.__cwaNative`. Missing host is `native_unavailable` and export uses browser Blob download.

For CWA-owned calls, the envelope allows only own enumerable `filename`, Blob `blob`, and optional `mime` fields. Any extra field is `forbidden_field`, a non-Blob `blob` is `invalid_payload`, and a sanitized filename equal to `conversation.json` is `forbidden_filename`. An invalid envelope never invokes the host.

This is envelope validation, not a page-world sandbox. Page scripts can call `__cwaNative.saveFile` directly, so a future host must treat every call as untrusted. This change ships no native host or sidecar.

## Consequences

Operators without a native host see no behavior change. A future Pake host can implement `__cwaNative.saveFile`, but it must enforce its own security boundary.
