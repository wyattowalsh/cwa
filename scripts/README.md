# Scripts

`validate_planning.py` is stdlib-first.

```bash
python3 scripts/validate_planning.py
python3 scripts/validate_planning.py --runtime
python3 scripts/validate_planning.py --strict
```

`--strict` is skipped-with-WARN when PyYAML or jsonschema are missing. Do not install them for Wave 1.

`regen-chrome-patterns.mjs` is generation-only (takumi-js). It is not a Pake inject.

```bash
pnpm regen:chrome-patterns
```

Writes `inject/patterns/*.svg` and inlines data-URIs in `inject/theme.css` so the webview can paint CWA chrome without sibling file URLs.
