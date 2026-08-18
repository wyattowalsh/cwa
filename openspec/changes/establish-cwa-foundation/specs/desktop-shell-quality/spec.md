# Delta: desktop-shell-quality

## ADDED Requirements

### Requirement: Pake config is the runtime source of truth

Build and run scripts SHALL use `pake.cwa.json` (`name: cwa`, `identifier: com.wyattowalsh.cwa`). Duplicate `pake.json` SHALL be treated as a known duplicate until a later inventory task deletes or generates one from the other.

#### Scenario: Scripts reference pake.cwa.json

- **WHEN** an operator runs `pnpm pake:dev` or `pnpm pake:build`
- **THEN** the invoked CLI receives `--config pake.cwa.json`
