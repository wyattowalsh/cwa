# ADR 0007: Native companion is optional and fail-closed

## Status

Accepted (Wave 3)

## Context

File saves happen in the ChatGPT.com page world via Blob download. A native host can optionally receive local bytes.

## Decision

`CwaNativeBridge` talks only to `global.__cwaNative`. Missing host is `native_unavailable` and export uses Blob download. Payloads cannot include cookies, tokens, Authorization, or conversation JSON. No sidecar is shipped in this change.

## Consequences

Operators without a native host see no behavior change. Future Pake IPC can implement `__cwaNative.saveFile` without widening ChatGPT network authority.
