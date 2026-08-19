# Delta: tool-adapters

## ADDED Requirements

### Requirement: Tool catalog is local-only

CWA SHALL expose the `copy-visible`, `save-md`, `save-zip`, and `diagnostics` adapters from a local catalog. The catalog policy SHALL be `no default network`.

#### Scenario: Catalog inspection

- **WHEN** an operator lists the tool catalog
- **THEN** the four documented local adapter ids are returned
- **AND** no adapter declares a ChatGPT backend endpoint or network transport

### Requirement: Export adapters reuse existing events

Copy, Markdown, and ZIP adapters SHALL dispatch the existing export events. They SHALL NOT duplicate export serialization, fetch hidden conversation state, or gain additional provider authority.

#### Scenario: Save Markdown tool

- **WHEN** `CwaTools.run("save-md")` is invoked
- **THEN** CWA dispatches `cwa:save-md`
- **AND** the existing visible-thread export boundary handles the save

### Requirement: Diagnostics adapter remains redacted

The diagnostics adapter SHALL use the compatibility runtime’s redacted snapshot. It SHALL NOT return message text, cookies, Authorization, bearer values, tokens, session data, or conversation JSON.

#### Scenario: Diagnostics from settings

- **WHEN** `CwaTools.run("diagnostics")` runs on a settings route
- **THEN** the result identifies `hrefKind` as `settings`
- **AND** the emitted snapshot contains no provider credential or conversation payload

### Requirement: Tool execution failures are explicit

An id absent from the catalog SHALL return `unknown_tool`. A cataloged export event that cannot be dispatched SHALL return `event_unavailable`; a missing or invalid diagnostics snapshot provider SHALL return `diagnostics_unavailable`; and a catalog entry without a supported event or action SHALL return `unhandled_tool`. These failures SHALL NOT initiate network activity.

#### Scenario: Unknown id

- **WHEN** `CwaTools.run("not-cataloged")` is invoked
- **THEN** the result is `{ ok: false, error: "unknown_tool" }`
- **AND** no local action is executed

#### Scenario: Export event unavailable

- **WHEN** a cataloged export adapter runs without a usable event dispatcher
- **THEN** the result is `{ ok: false, error: "event_unavailable" }`
- **AND** no export event is dispatched

#### Scenario: Diagnostics unavailable

- **WHEN** the diagnostics adapter runs without a usable snapshot provider
- **THEN** the result is `{ ok: false, error: "diagnostics_unavailable" }`
- **AND** no diagnostics event is emitted

#### Scenario: Catalog entry has no adapter

- **WHEN** a catalog entry has neither a supported event nor a supported action
- **THEN** the result is `{ ok: false, error: "unhandled_tool" }`
- **AND** no local action is executed
