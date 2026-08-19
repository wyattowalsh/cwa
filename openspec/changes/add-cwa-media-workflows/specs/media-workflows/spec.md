# Delta: media-workflows

## ADDED Requirements

### Requirement: File-card discovery is visible-DOM-only

CWA SHALL collect file-card candidates only from mounted elements under the thread’s `main` region. Navigation, CWA chrome, and candidates with a CSS-hidden self or ancestor (`hidden`, `display: none`, `visibility: hidden|collapse`, or `opacity: 0`) SHALL be excluded. Eligible elements SHALL expose an `a[download]`, `/files/` href, or file-card/attachment test id. “Visible DOM” SHALL NOT mean viewport intersection or nonzero geometry.

#### Scenario: Visible file card

- **WHEN** a mounted, non-CSS-hidden file-card link appears under `main`
- **THEN** `collectVisibleFileCards` returns a `file-card` candidate for its visible URL
- **AND** an equivalent link outside `main` is not collected

#### Scenario: CSS-hidden file card

- **WHEN** a mounted file-card link under `main` has a CSS-hidden self or ancestor
- **THEN** `collectVisibleFileCards` omits it
- **AND** viewport position or zero geometry alone does not make a mounted candidate hidden

### Requirement: File-card fetches retain export bounds

Visible file-card URLs SHALL be fetched only when the destination is same-origin with the page or is exactly `https://files.oaiusercontent.com` at its default port. Fetches SHALL use `credentials: "omit"` and `redirect: "error"`; deny private provider paths; and retain count, size, deadline/abort, and filename-sanitization bounds. Before reading a Blob, CWA SHALL reject redirects and missing, invalid, or disallowed response URLs. CWA SHALL NOT discover media through private provider APIs, hidden stores, cookies, tokens, or conversation JSON.

#### Scenario: File-card fetch

- **WHEN** an allowed visible file-card URL is included in a ZIP export
- **THEN** CWA fetches it with `credentials: "omit"` and `redirect: "error"`
- **AND** stores it under a sanitized deterministic `media/` filename

#### Scenario: Destination is not allowlisted

- **WHEN** a visible file-card URL is neither same-origin nor the exact allowed HTTPS file host
- **THEN** the media workflow records it as skipped
- **AND** no request is made to that destination

#### Scenario: Redirected response

- **WHEN** an allowed media fetch encounters a redirect
- **THEN** the request fails without following the redirect or reading its Blob
- **AND** the failure is recorded in media provenance

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
