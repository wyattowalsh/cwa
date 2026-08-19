# Design: tool adapters

`CwaTools.run(id)` either dispatches an existing export event or returns a redacted diagnostics snapshot. Failures are explicit: `unknown_tool` for a catalog miss, `event_unavailable` when an export event cannot be dispatched, `diagnostics_unavailable` when the snapshot provider is missing or invalid, and `unhandled_tool` when a catalog entry has no supported adapter.
