# Delta: media-workflows

## ADDED Requirements

### Requirement: File-card discovery is visible-DOM-only

CWA SHALL collect file-card candidates only from mounted elements under the thread’s `main` region. Eligible elements SHALL expose an `a[download]`, `/files/` href, or file-card/attachment test id; navigation and CWA chrome SHALL be excluded.

#### Scenario: Visible file card

- **WHEN** a mounted file-card link appears under `main`
- **THEN** `collectVisibleFileCards` returns a `file-card` candidate for its visible URL
- **AND** an equivalent link outside `main` is not collected

### Requirement: File-card fetches retain export bounds

Visible file-card URLs SHALL use the Wave 1 media allowlist, endpoint denylist, count cap, size cap, elapsed-time cap, abort handling, filename sanitization, and `credentials: "omit"`. CWA SHALL NOT discover media through private provider APIs, hidden stores, cookies, tokens, or conversation JSON.

#### Scenario: File-card fetch

- **WHEN** an allowed visible file-card URL is included in a ZIP export
- **THEN** CWA fetches it with `credentials: "omit"`
- **AND** stores it under a sanitized deterministic `media/` filename

#### Scenario: Private endpoint link

- **WHEN** a visible element points to a forbidden conversation or session endpoint
- **THEN** the media workflow records the candidate as skipped
- **AND** no request is made to that endpoint

### Requirement: File-card failures do not block Markdown

Failed, skipped, oversized, or timed-out file-card fetches SHALL be recorded as media provenance. They SHALL NOT prevent `chat.md` generation or add a `conversation.json` payload.

#### Scenario: File fetch fails

- **WHEN** a visible file-card request fails
- **THEN** the archive still contains `chat.md` and its manifests
- **AND** the failure is listed in `manifest.media.failed`

### Requirement: Manifest identifies visible-DOM workflow

The export manifest SHALL set `media.workflow` to `visible-dom` and SHALL report included, failed, and skipped media derived from mounted messages and visible file cards.

#### Scenario: ZIP with visible media

- **WHEN** a ZIP includes mounted-message media or a visible file card
- **THEN** `manifest.media.workflow` is `visible-dom`
- **AND** the manifest remains authoritative about media omissions
