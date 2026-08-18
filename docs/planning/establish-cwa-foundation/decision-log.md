# Decision log

| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D-001 | Visible-thread export only | Provider conversation JSON is undocumented and out of the local-first privacy model | Wave 1 |
| D-002 | Keep duplicate `pake.json` | Inventory freeze; scripts already pin `pake.cwa.json` | Wave 1 |
| D-003 | Vendor JSZip 3.10.1 in-tree | No dependency upgrade this wave | Wave 1 |
| D-004 | Reconstruct overlay without ZIP checksum | Bundle ZIP missing in this checkout; WARN recorded | Wave 1 |
| D-005 | Media fetch `credentials: "omit"` | Visible URLs must not ride the ChatGPT session cookie | Wave 1 |
| D-006 | Stop after TASK-019 | Wave 2 chrome rewrite is a separate change | Wave 1 |
| D-007 | Export boundary is clean enough to *recommend* Wave 2 later | TASK-018 passed; TASK-020 is not started in this run | Wave 1 |
