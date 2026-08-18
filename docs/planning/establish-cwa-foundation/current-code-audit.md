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
