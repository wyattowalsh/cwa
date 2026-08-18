# Delta: chatgpt-web-wrapper

## ADDED Requirements

### Requirement: Isolated ChatGPT.com shell

CWA SHALL wrap `https://chatgpt.com` as a dedicated desktop webview (Pake) distinct from official `ChatGPT.app`. The wrapper SHALL NOT claim official OpenAI desktop identity (`com.openai.chat`, ChatGPT.app).

#### Scenario: Distinct product identity

- **WHEN** an operator inspects bundle id and window title
- **THEN** they observe `com.wyattowalsh.cwa` and product name `cwa`

### Requirement: Untrusted provider DOM

Injected scripts SHALL treat ChatGPT.com DOM, network, and storage as untrusted. They SHALL NOT harvest session cookies, Authorization headers, or hidden conversation stores for export or telemetry.

#### Scenario: No session harvest in inject

- **WHEN** export or chrome inject runs
- **THEN** no code path reads `/api/auth/session` access tokens or attaches `Authorization: Bearer` for conversation JSON
