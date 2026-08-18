# Delta: validation-and-auditability

## ADDED Requirements

### Requirement: Planning validator is stdlib-first

`scripts/validate_planning.py` SHALL run with the Python standard library. `--strict` MAY use PyYAML/jsonschema only if already installed. `--runtime` SHALL fail if inject still references private conversation/session fetch helpers.

#### Scenario: Default validate passes overlay shape

- **WHEN** `python3 scripts/validate_planning.py` runs on a complete overlay
- **THEN** required OpenSpec/docs/schema files exist
- **AND** export spec forbids `conversation.json` as a ZIP entry
