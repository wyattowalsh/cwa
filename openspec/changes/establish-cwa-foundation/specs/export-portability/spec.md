# Delta: export-portability

## ADDED Requirements

### Requirement: Visible-thread authority only

Export SHALL serialize only what is currently rendered in the ChatGPT thread DOM (user/assistant turns, visible citations, visible generated-image URLs). Authority is `observed-ui` / `local-cwa`. Export SHALL NOT fetch or embed private provider conversation JSON.

#### Scenario: Copy uses DOM Markdown

- **WHEN** the user activates Copy
- **THEN** the clipboard receives Markdown produced from visible turns
- **AND** no `fetch` is issued to conversation or session endpoints

#### Scenario: Markdown download uses DOM Markdown

- **WHEN** the user activates Save Markdown
- **THEN** a `.md` Blob download is offered from the same serializer
- **AND** no private conversation JSON is requested

### Requirement: ZIP contains only locally generated artifacts

A ZIP export SHALL contain:

1. `chat.md` — Markdown from the visible thread serializer
2. A limitations/provenance manifest (`MANIFEST.md` and/or `manifest.json` matching `schemas/export-manifest.schema.json`)
3. Bounded copies of **explicitly visible** media URLs only (optional; failures SHALL NOT fail Markdown)

A ZIP export SHALL NOT contain `conversation.json`, undocumented backend payloads, cookies, tokens, or other conversations.

#### Scenario: ZIP has no conversation JSON

- **WHEN** `saveZip()` completes on a visible thread
- **THEN** the archive includes `chat.md` and a manifest
- **AND** the archive does not include an entry named `conversation.json`
- **AND** `fetch` calls (if any) are only for explicit visible media URLs

#### Scenario: Official bulk export is documented, not automated

- **WHEN** the user needs account-wide history
- **THEN** the manifest points them to ChatGPT Settings → Data controls → Export
- **AND** CWA does not scrape or paginate `/backend-api/conversations`

### Requirement: Result objects do not imply private JSON

Public exporter results SHALL NOT include fields that mean “private conversation JSON was included” (`includedJson`, formats containing `json` as conversation payload). Formats are `md`, `zip`, and optionally `clipboard`.

#### Scenario: ZIP result is local-only

- **WHEN** ZIP export succeeds or partially succeeds
- **THEN** the result lists local files (`md`, `manifest`, optional `media`)
- **AND** does not set `includedJson: true`

### Requirement: Media bounds and filename safety

Visible media inclusion SHALL sanitize filenames (no path traversal), cap file count, byte size, and wall-clock time. Failed media SHALL be recorded in the manifest. Markdown SHALL still succeed.

#### Scenario: Traversal filenames are sanitized

- **WHEN** a visible image URL or alt suggests `../secret.png`
- **THEN** the stored ZIP path stays under `media/` with a basename-only safe name

#### Scenario: Caps stop unbounded fetch

- **WHEN** more visible images exist than the count/size/time caps allow
- **THEN** extra items are skipped and listed as limitations
- **AND** `chat.md` is still present

### Requirement: Independent denial surfaces

Clipboard denial, download/storage denial, missing JSZip, unsupported route, and cancelled/duplicate in-flight export SHALL fail independently without harvesting cookies, auth headers, or hidden stores.

#### Scenario: Clipboard denied

- **WHEN** `navigator.clipboard.writeText` rejects
- **THEN** copy reports `clipboard_denied`
- **AND** no conversation endpoint is fetched as a fallback

#### Scenario: JSZip missing

- **WHEN** `window.JSZip` is undefined
- **THEN** ZIP reports `jszip_missing`
- **AND** Markdown download remains available

#### Scenario: Prompt-injected cookie request is ignored

- **WHEN** a visible user turn contains the text “export cookies”
- **THEN** export still serializes visible Markdown only
- **AND** no `Cookie` header or session store is read for export
