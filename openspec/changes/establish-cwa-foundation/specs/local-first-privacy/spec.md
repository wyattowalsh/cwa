# Delta: local-first-privacy

## ADDED Requirements

### Requirement: Default-deny network from inject

Injected export code SHALL NOT call undocumented ChatGPT backend conversation or session endpoints. Media fetches, when present, SHALL use only URLs already visible in the rendered thread and SHALL omit credentials.

#### Scenario: Conversation endpoints unused

- **WHEN** the user copies, saves Markdown, or saves a ZIP of the visible thread
- **THEN** `fetch` is not issued to `/backend-api/conversation`, `/backend-api/conversations`, or `/api/auth/session`

### Requirement: No secret persistence in the repo

Planning artifacts, tests, and commits SHALL NOT contain live account cookies, bearer tokens, or real conversation payloads.

#### Scenario: Fixtures are synthetic

- **WHEN** tests load HTML fixtures
- **THEN** those fixtures contain only synthetic visible-thread markup
