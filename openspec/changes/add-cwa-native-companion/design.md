# Design: native companion (page-world)

The webview never sends session material to native. The host, if present, receives only a local Blob and a sanitized filename. Wave 1 ADR 0006 still applies: no private conversation JSON.
