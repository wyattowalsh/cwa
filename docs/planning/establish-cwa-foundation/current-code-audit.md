# Current code audit (Wave 0 / Wave 1)

## At baseline `6da172f`

ZIP export called `conversationRequestUrl` → `GET /backend-api/conversation/<id>` with `credentials: "same-origin"`. On 401/403 it called `readSameOriginAccessToken` (`GET /api/auth/session`) and retried with `Authorization: Bearer`. Successful JSON was stored as ZIP entry `conversation.json` and result field `includedJson`. Tests required that fetch.

Copy and Markdown already used `collectVisibleThread` (DOM). Media fetch used `credentials: "include"` and also harvested URLs from conversation JSON.

That private-endpoint path was a Wave 1 release blocker. TASK-012 removed it.

## After TASK-012

- No conversation/session helpers in inject
- ZIP = `chat.md` + `MANIFEST.md` + optional `manifest.json` + bounded visible `media/`
- Media `credentials: "omit"`, sanitized names, count/size/time caps
- Status event `cwa:export-status` for copy / md / zip / denials

## After Waves 2–5

- Compatibility runtime: selector registry, coalesced scheduler, lifecycle, safe mode, redacted diagnostics
- Optional native protocol `cwa.native.v1` via `global.__cwaNative.saveFile`; payloads are `{ filename, blob, mime }`
- Palette tools `copy-visible`, `save-md`, `save-zip`, `diagnostics` with no default network
- Visible-DOM file-cards under `main`, excluding nav/chrome; private `/backend-api/` and `/api/auth/` paths are not fetched
- Visible media destinations are limited to the page origin or exactly `https://files.oaiusercontent.com` at its default port; redirects fail closed and response URLs are revalidated
- Pake inject order (both configs): theme → selectors → scheduler → lifecycle → safe-mode → diagnostics → tools → native-bridge → chrome → jszip → export-core → export
