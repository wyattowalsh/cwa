# Delta: test-architecture

## ADDED Requirements

### Requirement: Visible-thread fixtures only

Tests SHALL use synthetic HTML fixtures. They SHALL NOT require a live ChatGPT session. They SHALL spy on `fetch` and fail if conversation/session endpoints are called.

#### Scenario: Private endpoint spy

- **WHEN** `createExporter().saveZip()` runs against the visible-thread fixture
- **THEN** no captured `fetch` URL matches `/backend-api/conversation`, `/backend-api/conversations`, or `/api/auth/session`
