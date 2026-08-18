# Scripts

`validate_planning.py` is stdlib-first.

```bash
python3 scripts/validate_planning.py
python3 scripts/validate_planning.py --runtime
python3 scripts/validate_planning.py --strict
```

`--strict` is skipped-with-WARN when PyYAML or jsonschema are missing. Do not install them for Wave 1.
