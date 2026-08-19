# Design: native companion (page-world)

For CWA-owned calls, the optional bridge accepts only own enumerable `filename`, Blob `blob`, and optional `mime` fields. It rejects extra fields, non-Blob payloads, and a sanitized `conversation.json` filename before invoking the host. Wave 1 ADR 0006 still applies: no private conversation JSON.

`global.__cwaNative.saveFile` remains directly callable by other page-world code. Envelope validation is not a sandbox; a future host must validate untrusted calls independently. This change ships no native host or sidecar.
