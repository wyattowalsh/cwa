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


def derive_inject_runtime(root: Path) -> list[Path]:
    inject_root = root / "inject"
    return sorted(
        path
        for path in inject_root.rglob("*.js")
        if path.is_file()
        and "vendor" not in path.relative_to(inject_root).parts
        and not path.name.endswith(".test.js")
    )


def check_conversation_pattern(schema: dict[str, object], samples: tuple[str, ...]) -> list[str]:
    errors: list[str] = []
    properties = schema.get("properties")
    files = properties.get("files") if isinstance(properties, dict) else None
    items = files.get("items") if isinstance(files, dict) else None
    exclusion = items.get("not") if isinstance(items, dict) else None
    pattern = exclusion.get("pattern") if isinstance(exclusion, dict) else None
    if not isinstance(pattern, str):
        return ["schema files.items.not.pattern must forbid conversation.json"]
    try:
        regex = re.compile(pattern)
    except re.error as err:
        return [f"schema files.items.not.pattern is invalid: {err}"]
    for sample in samples:
        if regex.search(sample) is None:
            errors.append(
                f"schema files.items.not.pattern must match forbidden path {sample!r}"
            )
    if regex.search("media/conversation.json.txt") is not None:
        errors.append("schema files.items.not.pattern must not match media/conversation.json.txt")
    return errors


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
        except (OSError, json.JSONDecodeError) as err:
            errors.append(f"schema JSON: {err}")
        else:
            if not isinstance(schema, dict):
                errors.append("schema JSON must be an object")
            else:
                formats = ((schema.get("properties") or {}).get("formats") or {})
                items = formats.get("items") or {}
                enum = items.get("enum") or []
                if "json" in enum:
                    errors.append("schema formats must not include json (conversation payload)")
                errors.extend(
                    check_conversation_pattern(
                        schema,
                        (
                            "conversation.json",
                            "media/conversation.json",
                            "media\\conversation.json",
                            "Conversation.JSON",
                            "C:\\temp\\conversation.json",
                        ),
                    )
                )
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
        if "includedJson" not in spec:
            errors.append("export spec missing 'includedJson'")
        if "SHALL NOT" not in spec:
            errors.append("export spec must forbid includedJson")
        if re.search(r"SHALL NOT contain\s+`?conversation\.json`?", spec) is None:
            errors.append("export spec must say SHALL NOT contain conversation.json")
    pake_paths = {rel: root / rel for rel in ("pake.json", "pake.cwa.json")}
    pake_injects: dict[str, list[object]] = {}
    for rel, path in pake_paths.items():
        if not path.is_file():
            errors.append(f"missing {rel}")
            continue
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            errors.append(f"{rel} JSON: {err}")
            continue
        if not isinstance(config, dict):
            errors.append(f"{rel} JSON must be an object")
            continue
        inject = config.get("inject")
        if not isinstance(inject, list):
            errors.append(f"{rel} inject must be a list")
            continue
        pake_injects[rel] = inject
    if all(path.is_file() for path in pake_paths.values()):
        if pake_paths["pake.json"].read_bytes() != pake_paths["pake.cwa.json"].read_bytes():
            errors.append("pake.json and pake.cwa.json must be byte-identical")
    if len(pake_injects) == 2 and pake_injects["pake.json"] != pake_injects["pake.cwa.json"]:
        errors.append("pake.json and pake.cwa.json inject lists differ")
    if len(pake_injects) == 2:
        inject = pake_injects["pake.json"]
        expected_inject = [
            "./inject/theme.css",
            "./inject/selectors.js",
            "./inject/scheduler.js",
            "./inject/lifecycle.js",
            "./inject/safe-mode.js",
            "./inject/diagnostics.js",
            "./inject/tools.js",
            "./inject/native-bridge.js",
            "./inject/chrome.js",
            "./inject/vendor/jszip.min.js",
            "./inject/export-core.js",
            "./inject/export.js",
        ]
        if inject != expected_inject:
            errors.append("pake inject order must match the Wave 2-5 boot sequence")
        tools_index = next(
            (index for index, entry in enumerate(inject) if "tools.js" in str(entry)),
            None,
        )
        chrome_index = next(
            (index for index, entry in enumerate(inject) if "chrome.js" in str(entry)),
            None,
        )
        if tools_index is None or chrome_index is None or tools_index >= chrome_index:
            errors.append("pake inject must list tools.js before chrome.js")
    return errors


def check_strict(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    ran = {"yaml": False, "jsonschema": False}
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
            text = cfg.read_text(encoding="utf-8")
            ran["yaml"] = True
            yaml.safe_load(text)
        except Exception as err:  # noqa: BLE001
            errors.append(f"openspec/config.yaml: {err}")
    if jsonschema is not None:
        try:
            schema = json.loads(
                (root / "schemas/export-manifest.schema.json").read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as err:
            errors.append(f"schema JSON: {err}")
        else:
            if not isinstance(schema, dict):
                errors.append("schema JSON must be an object")
            else:
                errors.extend(
                    check_conversation_pattern(
                        schema,
                        (r"media\conversation.json", "Conversation.JSON"),
                    )
                )
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
                    "media": {
                        "workflow": "visible-dom",
                        "included": 0,
                        "failed": [],
                        "skipped": [],
                    },
                    "officialExport": "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data",
                }
                try:
                    ran["jsonschema"] = True
                    jsonschema.validate(sample, schema)
                except Exception as err:  # noqa: BLE001
                    errors.append(f"sample manifest failed schema: {err}")
                empty_files = dict(sample)
                empty_files["files"] = []
                try:
                    jsonschema.validate(empty_files, schema)
                    errors.append("schema unexpectedly accepted empty files")
                except Exception:
                    pass
                missing_manifest = dict(sample)
                missing_manifest["files"] = ["chat.md", "manifest.json"]
                try:
                    jsonschema.validate(missing_manifest, schema)
                    errors.append("schema unexpectedly accepted files without MANIFEST.md")
                except Exception:
                    pass
                for forbidden in (
                    "conversation.json",
                    "media/conversation.json",
                    r"media\conversation.json",
                    "Conversation.JSON",
                    r"C:\temp\conversation.json",
                ):
                    bad = dict(sample)
                    bad["files"] = [*sample["files"], forbidden]
                    try:
                        jsonschema.validate(bad, schema)
                        errors.append(
                            f"schema unexpectedly accepted forbidden file entry {forbidden!r}"
                        )
                    except Exception:
                        pass
    skipped = [name for name in ("yaml", "jsonschema") if not ran[name]]
    return errors, skipped


def check_runtime(root: Path) -> list[str]:
    errors: list[str] = []
    compiled = [(pat, re.compile(pat)) for pat in FORBIDDEN_RUNTIME]
    for path in derive_inject_runtime(root):
        rel = path.relative_to(root).as_posix()
        if not path.is_file():
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
    skipped: list[str] = []
    if args.strict:
        strict_errors, skipped = check_strict(root)
        errors.extend(strict_errors)
    if args.runtime:
        errors.extend(check_runtime(root))
    if errors:
        return fail(errors)
    extras = []
    if args.runtime:
        extras.append("runtime")
    if args.strict:
        extras.append("strict")
    suffix = f" ({', '.join(extras)})" if extras else ""
    if skipped:
        skipped_suffix = ", ".join(f"{name} skipped" for name in skipped)
        print(f"WARN: planning overlay ({', '.join(extras)}; {skipped_suffix})")
    else:
        print(f"PASS: planning overlay{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
