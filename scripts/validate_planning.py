#!/usr/bin/env python3
"""Validate CWA planning overlay and (optionally) the Wave 1 export boundary.

Stdlib only for the default path. --strict uses PyYAML/jsonschema when present.
--runtime fails if inject still references private conversation/session fetch.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_FILES = (
    "START_HERE.md",
    "README.md",
    "AGENTS.md",
    "SECURITY.md",
    "openspec/config.yaml",
    "openspec/changes/establish-cwa-foundation/proposal.md",
    "openspec/changes/establish-cwa-foundation/design.md",
    "openspec/changes/establish-cwa-foundation/tasks.md",
    "openspec/changes/establish-cwa-foundation/specs/chatgpt-web-wrapper/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/local-first-privacy/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/export-portability/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/desktop-shell-quality/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/operator-trust/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/validation-and-auditability/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/test-architecture/spec.md",
    "openspec/changes/establish-cwa-foundation/specs/native-companion-boundary/spec.md",
    "openspec/changes/add-cwa-compatibility-runtime/tasks.md",
    "openspec/changes/add-cwa-compatibility-runtime/specs/compatibility-runtime/spec.md",
    "openspec/changes/add-cwa-native-companion/tasks.md",
    "openspec/changes/add-cwa-native-companion/specs/native-companion/spec.md",
    "openspec/changes/add-cwa-tool-adapters/tasks.md",
    "openspec/changes/add-cwa-tool-adapters/specs/tool-adapters/spec.md",
    "openspec/changes/add-cwa-media-workflows/tasks.md",
    "openspec/changes/add-cwa-media-workflows/specs/media-workflows/spec.md",
    "schemas/export-manifest.schema.json",
    "docs/planning/establish-cwa-foundation/PLANS.md",
    "docs/planning/establish-cwa-foundation/repository-inventory.md",
    "docs/planning/establish-cwa-foundation/current-code-audit.md",
    "docs/planning/establish-cwa-foundation/traceability-matrix.md",
    "docs/planning/establish-cwa-foundation/validation.md",
    "docs/planning/establish-cwa-foundation/decision-log.md",
    "docs/planning/establish-cwa-foundation/risk-register.md",
    "docs/planning/establish-cwa-foundation/source-registry.md",
    "docs/planning/establish-cwa-foundation/known-limitations.md",
    "docs/adr/0006-visible-thread-export-only.md",
    "docs/adr/0007-native-companion-fail-closed.md",
)

INJECT_RUNTIME = (
    "inject/export-core.js",
    "inject/export.js",
    "inject/chrome.js",
    "inject/selectors.js",
    "inject/scheduler.js",
    "inject/lifecycle.js",
    "inject/safe-mode.js",
    "inject/diagnostics.js",
    "inject/tools.js",
    "inject/native-bridge.js",
)

FORBIDDEN_RUNTIME = (
    r"/backend-api/conversation",
    r"/backend-api/conversations",
    r"/api/auth/session",
    r"conversationRequestUrl",
    r"fetchCurrentConversationJson",
    r"readSameOriginAccessToken",
    r"countConversationJsonMessages",
    r"collectMediaFromConversationJson",
    r"includedJson",
    r"Authorization:\s*Bearer",
    r"zip\.file\(\s*[\"']conversation\.json[\"']",
)

SPEC_MUST_CONTAIN = (
    "conversation.json",
    "observed-ui",
    "chat.md",
)


def fail(errors: list[str]) -> int:
    for item in errors:
        print(f"FAIL: {item}", file=sys.stderr)
    print(f"{len(errors)} error(s)", file=sys.stderr)
    return 1


def check_shape(root: Path) -> list[str]:
    errors: list[str] = []
    for rel in REQUIRED_FILES:
        path = root / rel
        if not path.is_file():
            errors.append(f"missing {rel}")
    schema_path = root / "schemas/export-manifest.schema.json"
    spec_path = root / "openspec/changes/establish-cwa-foundation/specs/export-portability/spec.md"
    if schema_path.is_file():
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            errors.append(f"schema JSON: {err}")
        else:
            formats = ((schema.get("properties") or {}).get("formats") or {})
            items = formats.get("items") or {}
            enum = items.get("enum") or []
            if "json" in enum:
                errors.append("schema formats must not include json (conversation payload)")
            files = ((schema.get("properties") or {}).get("files") or {})
            blob = json.dumps(files)
            if "conversation.json" not in blob:
                errors.append("schema files must explicitly forbid conversation.json")
            authority = (
                ((schema.get("properties") or {}).get("source") or {})
                .get("properties", {})
                .get("authority", {})
                .get("enum")
                or []
            )
            if "observed-ui" not in authority or "local-cwa" not in authority:
                errors.append("schema source.authority must allow observed-ui and local-cwa")
    if spec_path.is_file():
        spec = spec_path.read_text(encoding="utf-8")
        for needle in SPEC_MUST_CONTAIN:
            if needle not in spec:
                errors.append(f"export spec missing {needle!r}")
        if "includedJson" in spec and "SHALL NOT" not in spec:
            errors.append("export spec must forbid includedJson")
    pake_injects: dict[str, list[object]] = {}
    for rel in ("pake.json", "pake.cwa.json"):
        path = root / rel
        if not path.is_file():
            continue
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            errors.append(f"{rel} JSON: {err}")
            continue
        inject = config.get("inject")
        if not isinstance(inject, list):
            errors.append(f"{rel} inject must be a list")
            continue
        pake_injects[rel] = inject
    if len(pake_injects) == 2 and pake_injects["pake.json"] != pake_injects["pake.cwa.json"]:
        errors.append("pake.json and pake.cwa.json inject lists differ")
    return errors


def check_strict(root: Path) -> list[str]:
    errors: list[str] = []
    try:
        import yaml  # type: ignore
    except ImportError:
        print("WARN: PyYAML not installed; skipping --strict YAML parse")
        yaml = None  # type: ignore
    try:
        import jsonschema  # type: ignore
    except ImportError:
        print("WARN: jsonschema not installed; skipping --strict schema validation")
        jsonschema = None  # type: ignore
    if yaml is not None:
        cfg = root / "openspec/config.yaml"
        try:
            yaml.safe_load(cfg.read_text(encoding="utf-8"))
        except Exception as err:  # noqa: BLE001
            errors.append(f"openspec/config.yaml: {err}")
    if jsonschema is not None:
        schema = json.loads((root / "schemas/export-manifest.schema.json").read_text(encoding="utf-8"))
        sample = {
            "schema": "cwa.export-manifest.v1",
            "product": "cwa",
            "source": {
                "authority": "observed-ui",
                "url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                "title": "Widget export",
            },
            "exportedAt": "2026-08-18T16:00:00.000Z",
            "formats": ["md", "zip"],
            "files": ["chat.md", "MANIFEST.md", "manifest.json"],
            "limitations": [
                {
                    "id": "unloaded_messages",
                    "title": "Unloaded messages",
                    "detail": "Older turns may be virtualized.",
                }
            ],
            "officialExport": "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data",
        }
        try:
            jsonschema.validate(sample, schema)
        except Exception as err:  # noqa: BLE001
            errors.append(f"sample manifest failed schema: {err}")
        bad = dict(sample)
        bad["files"] = ["chat.md", "conversation.json"]
        try:
            jsonschema.validate(bad, schema)
            errors.append("schema unexpectedly accepted conversation.json file entry")
        except Exception:
            pass
    return errors


def check_runtime(root: Path) -> list[str]:
    errors: list[str] = []
    compiled = [(pat, re.compile(pat)) for pat in FORBIDDEN_RUNTIME]
    for rel in INJECT_RUNTIME:
        path = root / rel
        if not path.is_file():
            errors.append(f"missing runtime file {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        for pat, rx in compiled:
            if rx.search(text):
                errors.append(f"{rel} still matches forbidden pattern {pat}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="repository root")
    parser.add_argument("--strict", action="store_true", help="use PyYAML/jsonschema if installed")
    parser.add_argument("--runtime", action="store_true", help="fail if inject still fetches private endpoints")
    args = parser.parse_args(argv)
    root = Path(args.repo).resolve()
    errors = check_shape(root)
    if args.strict:
        errors.extend(check_strict(root))
    if args.runtime:
        errors.extend(check_runtime(root))
    if errors:
        return fail(errors)
    extras = []
    if args.strict:
        extras.append("strict")
    if args.runtime:
        extras.append("runtime")
    suffix = f" ({', '.join(extras)})" if extras else ""
    print(f"PASS: planning overlay{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
