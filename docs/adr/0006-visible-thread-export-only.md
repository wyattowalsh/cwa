# ADR 0006: Visible-thread export only

## Status

Accepted (Wave 1)

## Context

ZIP export fetched `/backend-api/conversation/<id>` and, on 401/403, harvested `/api/auth/session` for a bearer token. That is an undocumented provider API and a privacy boundary violation for an unofficial wrapper.

## Decision

Serialize only the mounted conversation pane. ZIP contains locally generated `chat.md`, a limitations/provenance manifest, and optionally bounded visible media. Do not fetch conversation JSON, conversation lists, or session tokens. Do not emit `includedJson` or a `conversation.json` archive entry.

## Consequences

Exports are honest but incomplete. Full history remains the official Settings export. Wave 2 must not reintroduce private endpoints without a new ADR.
