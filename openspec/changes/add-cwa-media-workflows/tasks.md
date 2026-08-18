# Tasks: add-cwa-media-workflows (Wave 5)

Execute **TASK-050 through TASK-059** in this sibling change. Preserve the Wave 1 visible-thread authority and media bounds.

Status legend: `[ ]` pending · `[x]` implementation artifact present · command evidence lives in `docs/planning/establish-cwa-foundation/PLANS.md`.

## Wave 5 — visible-DOM media workflows (TASK-050–059)

- [x] **TASK-050** Add `collectVisibleFileCards` to the export core for mounted `a[download]`, `/files/` links, and file-card/attachment test ids.
- [x] **TASK-051** Scope file-card discovery to the visible thread’s `main` region and exclude CWA toolbar, palette, minimap, navigation, and unrelated page chrome.
- [x] **TASK-052** Accept only URLs exposed by visible DOM attributes and allowed by the existing media URL policy. Do not derive URLs from provider APIs, hidden stores, cookies, tokens, or conversation JSON.
- [x] **TASK-053** Merge visible file-card candidates with media already observed in mounted messages, deduplicate URLs, and preserve deterministic archive naming.
- [x] **TASK-054** Reuse Wave 1 count, byte-size, elapsed-time, abort, endpoint-deny, and `credentials: "omit"` controls for all file-card fetches.
- [x] **TASK-055** Set `manifest.media.workflow` to `visible-dom` and retain included, skipped, and failed media provenance.
- [x] **TASK-056** Record failed or skipped file-card fetches without failing Markdown generation or adding `conversation.json` to the archive.
- [x] **TASK-057** Add synthetic-DOM and ZIP coverage for main-scoped card discovery, chrome/nav exclusion, URL deduplication, `visible-dom` provenance, and nonfatal failures.
- [ ] **TASK-058** Run `pnpm test`, `python3 scripts/validate_planning.py`, `python3 scripts/validate_planning.py --runtime`, and the forbidden-endpoint ripgrep review. Replace all Wave 5 TBD placeholders only with executed results.
- [ ] **TASK-059** Update the Wave 5 evidence table and recommendation after TASK-058. Do not claim PASS or broader-than-visible media coverage while validation evidence is TBD.
