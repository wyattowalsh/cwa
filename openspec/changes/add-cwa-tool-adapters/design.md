# Design: tool adapters

`CwaTools.run(id)` either dispatches existing export events or emits a redacted diagnostics snapshot. Unknown ids fail closed (`unknown_tool`).
