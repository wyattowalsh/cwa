# Traceability

| Requirement | Spec | Tasks | Tests |
| --- | --- | --- | --- |
| Isolated unofficial shell | chatgpt-web-wrapper | 001–008 | chrome identity / README |
| No session harvest | local-first-privacy | 010, 012, 017, 018 | private-endpoint spy |
| Visible-thread ZIP | export-portability | 011–015 | export.test.js ZIP cases |
| Media bounds | export-portability | 015 | traversal / cap tests |
| Denial surfaces | export-portability | 016–017 | clipboard, JSZip, route, cookies prompt |
| Pake config | desktop-shell-quality | 005 | package.json scripts |
| Validator | validation-and-auditability | 018 | `scripts/validate_planning.py` |
| Fixtures synthetic | test-architecture | 010, 017 | `tests/fixtures/visible-thread.html` |
| No native bridge in frozen foundation | native-companion-boundary | 008, 019 | Wave 1 boundary docs |
| Hashed-class-free selector registry | compatibility-runtime | 020, 025, 027–029 | `tests/inject/selectors.test.js`; chrome integration tests |
| Coalesced lifecycle and safe mode | compatibility-runtime | 021–028 | scheduler/lifecycle/safe-mode/diagnostics unit tests |
| Optional fail-closed native save | native-companion | 030–039 | `tests/inject/native-bridge.test.js`; export fallback tests |
| Local tool catalog with no default network | tool-adapters | 040–049 | `tests/inject/tools.test.js`; palette integration tests |
| Visible-DOM file-card media | media-workflows | 050–059 | export-core synthetic DOM and ZIP tests |
