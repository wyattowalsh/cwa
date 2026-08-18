# Proposal: establish the CWA Pake foundation (Wave 1 slice)

## Why

ZIP export currently requests `/backend-api/conversation/<id>` and may harvest a session token from `/api/auth/session`. That is an undocumented provider data source and a Wave 1 release blocker.

## What changes

- Adopt OpenSpec/planning docs.
- Define visible-thread export as mounted DOM only.
- Remove private conversation/list/session-token requests from runtime and tests.
- Keep copy, Markdown, and best-effort ZIP of local `chat.md`, manifest, and bounded visible media.

## Non-goals (this change)

Native companion, tool adapters, media ingestion pipelines, dependency upgrades, app install, Wave 2 chrome rewrite.
