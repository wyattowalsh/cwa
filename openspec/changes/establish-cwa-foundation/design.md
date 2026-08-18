# Design: Wave 1 export boundary

Export runs in the Pake page world. Copy/Markdown serialize `collectVisibleThread`. ZIP packages:

- `chat.md` (local Markdown)
- `MANIFEST.md` (limitations + provenance)
- `media/*` only for URLs observed on mounted image nodes, fetched with `credentials: "omit"` under count/size/timeout caps

No `conversation.json`. No `/backend-api/conversation`. No `/api/auth/session`. No `Authorization` headers.

Unsupported routes (no mounted messages and no `/c/` conversation URL) fail closed without harvest.

Status events: `cwa:export-status` with `{ action, ok, code, message }` for copy / save-md / save-zip outcomes including duplicate, cancelled, jszip_missing, download_denied, clipboard_denied, unsupported_route, partial.
