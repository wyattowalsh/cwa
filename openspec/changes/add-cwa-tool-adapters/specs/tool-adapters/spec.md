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

### Requirement: Unknown tools fail closed

An id absent from the catalog SHALL return `unknown_tool` and SHALL NOT dispatch an event, invoke diagnostics, or initiate network activity.

#### Scenario: Unknown id

- **WHEN** `CwaTools.run("not-cataloged")` is invoked
- **THEN** the result is `{ ok: false, error: "unknown_tool" }`
- **AND** no local action is executed
