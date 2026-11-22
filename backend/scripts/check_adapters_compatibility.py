#!/usr/bin/env python3
"""Compare the live Marketing Adapters contract to 189869c and this checkout."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "contracts" / "marketing-adapters-189869c.openapi.json"
HEALTH_BASELINE_PATH = ROOT / "contracts" / "marketing-adapters-189869c.health.json"
DEFAULT_LIVE_URL = "https://api.dev.marketing.goodmorning.mx/openapi.json"
DEFAULT_HEALTH_URL = "https://api.dev.marketing.goodmorning.mx/health"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def live_spec(url: str) -> dict[str, Any]:
    # curl verifies TLS certificates by default; do not add --insecure here.
    if not url.startswith("https://"):
        raise ValueError("Live contract URLs must use HTTPS with certificate validation.")
    result = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "30", url],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def current_health_response() -> dict[str, Any]:
    from app.main import health

    return health()


def compare_health(label: str, expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    ok = expected == actual
    print(f"{label}: {'MATCH' if ok else 'MISMATCH'}")
    if not ok:
        print(f"  expected response: {json.dumps(expected, sort_keys=True)}")
        print(f"  actual response:   {json.dumps(actual, sort_keys=True)}")
    return ok


def current_source_spec() -> dict[str, Any]:
    from app.main import app

    return app.openapi()


def operation_keys(spec: dict[str, Any]) -> set[tuple[str, str]]:
    return {
        (method.upper(), path)
        for path, item in spec.get("paths", {}).items()
        for method in item
        if method.lower() in {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
    }


def compare(label: str, expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    """Compare paths and components, including params and request/response schemas."""
    expected_ops = operation_keys(expected)
    actual_ops = operation_keys(actual)
    missing = sorted(expected_ops - actual_ops)
    added = sorted(actual_ops - expected_ops)
    changed = sorted(
        key for key in expected_ops & actual_ops
        if expected["paths"][key[1]][key[0].lower()]
        != actual["paths"][key[1]][key[0].lower()]
    )
    expected_components = expected.get("components", {})
    actual_components = actual.get("components", {})
    component_names = sorted(set(expected_components) | set(actual_components))
    changed_components = [
        name for name in component_names
        if expected_components.get(name) != actual_components.get(name)
    ]
    # Path-level parameters are part of the contract but are not operation keys.
    changed_path_items = sorted(
        path for path in set(expected.get("paths", {})) & set(actual.get("paths", {}))
        if expected["paths"][path].get("parameters") != actual["paths"][path].get("parameters")
    )

    ok = not (missing or added or changed or changed_components or changed_path_items)
    print(f"{label}: {'MATCH' if ok else 'MISMATCH'}")
    print(f"  operations: expected {len(expected_ops)}, actual {len(actual_ops)}")
    for method, path in missing:
        print(f"  missing: {method} {path}")
    for method, path in added:
        print(f"  added: {method} {path}")
    for method, path in changed:
        print(f"  changed operation/schema: {method} {path}")
    for name in changed_components:
        print(f"  changed component: {name}")
    for path in changed_path_items:
        print(f"  changed path parameters: {path}")
    if expected.get("info") != actual.get("info"):
        print(f"  info metadata differs: {expected.get('info')} -> {actual.get('info')}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-url", default=DEFAULT_LIVE_URL)
    parser.add_argument("--live-health-url", default=DEFAULT_HEALTH_URL)
    parser.add_argument("--live-openapi-file", type=Path, help="Use a previously fetched OpenAPI JSON file.")
    parser.add_argument("--live-health-file", type=Path, help="Use a previously fetched health JSON file.")
    args = parser.parse_args()

    historical = load_json(BASELINE_PATH)
    historical_health = load_json(HEALTH_BASELINE_PATH)
    live = load_json(args.live_openapi_file) if args.live_openapi_file else live_spec(args.live_url)
    live_health = load_json(args.live_health_file) if args.live_health_file else live_spec(args.live_health_url)
    current = current_source_spec()

    live_ok = compare("Live DEV vs historical source 189869c", historical, live)
    source_ok = compare("Current checkout vs historical source 189869c", historical, current)
    live_health_ok = compare_health("Live health response vs historical source 189869c", historical_health, live_health)
    source_health_ok = compare_health("Current health response vs historical source 189869c", historical_health, current_health_response())
    return 0 if live_ok and source_ok and live_health_ok and source_health_ok else 1


if __name__ == "__main__":
    sys.exit(main())
