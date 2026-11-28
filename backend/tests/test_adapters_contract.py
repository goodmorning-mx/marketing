import json
from collections import Counter
from pathlib import Path

from app import main
from scripts.check_adapters_compatibility import account_endpoints_ok, adapter_contract_ok


CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"


def test_current_app_keeps_historical_adapters_contract_and_account_routes():
    historical = json.loads((CONTRACTS / "marketing-adapters-189869c.openapi.json").read_text())
    current = main.app.openapi()
    assert adapter_contract_ok(historical, current)
    assert account_endpoints_ok(current)
    auth_routes = Counter(
        (route.path, method)
        for route in main.app.routes
        if route.path.startswith("/auth/")
        for method in route.methods
    )
    assert auth_routes
    assert set(auth_routes.values()) == {1}


def test_health_response_keeps_service_status_and_environment(monkeypatch):
    monkeypatch.setattr(main.settings, "app_name", "GoodMorning Marketing Adapters API")
    monkeypatch.setattr(main.settings, "app_env", "dev")
    assert main.health() == {
        "service": "GoodMorning Marketing Adapters API",
        "status": "ok",
        "environment": "dev",
    }
