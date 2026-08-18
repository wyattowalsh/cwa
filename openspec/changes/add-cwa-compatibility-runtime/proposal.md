# Change: add-cwa-compatibility-runtime (Wave 2)

## Why

ChatGPT.com is an untrusted SPA. Hardcoded hashed utilities break. Chrome needs a selector registry, coalesced scheduler, lifecycle, safe mode, and redacted diagnostics without touching the Wave 1 export boundary.

## What

- `inject/selectors.js` — role/landmark/data-testid fallbacks; reject hashed class-only selectors
- `inject/scheduler.js` — coalesce rAF/timeout by id
- `inject/lifecycle.js` — idle/booting/ready/navigating/degraded/safe
- `inject/safe-mode.js` — enter after consecutive critical misses; export remains available
- `inject/diagnostics.js` — redacted snapshot (`cwa:diagnostics`); no cookies/tokens/message text

## Non-goals

Native binaries, dependency upgrades, private conversation APIs, MutationObserver feature rewrite beyond scheduler coalescing.
