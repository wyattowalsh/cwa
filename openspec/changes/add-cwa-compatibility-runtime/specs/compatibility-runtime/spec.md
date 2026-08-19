# Delta: compatibility-runtime

## ADDED Requirements

### Requirement: Selector registry is hashed-class-free

CWA SHALL resolve ChatGPT chrome targets through an ordered fallback list of role, landmark, and `data-testid` selectors. Class-only hashed selectors SHALL be rejected.

#### Scenario: Message probe

- **WHEN** a mounted node has `data-message-author-role`
- **THEN** `CwaSelectors.resolve(root, "message").hit` is true
- **AND** the probe snapshot does not include the node’s textContent

### Requirement: Safe mode preserves export

After consecutive critical selector misses, chrome SHALL enter safe mode. Copy/Markdown/ZIP events SHALL remain dispatchable.

#### Scenario: Three message misses

- **WHEN** `probe().message.hit` is false three times
- **THEN** safe mode is active
- **AND** diagnostics `code` is `safe_mode`
