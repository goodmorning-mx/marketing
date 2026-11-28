import json
from pathlib import Path

from app import main
from scripts.check_adapters_compatibility import adapter_contract_ok


CONTRACT = Path(__file__).resolve().parents[1] / "contracts" / "marketing-adapters-189869c.openapi.json"


def test_adapter_routes_and_schemas_match_historical_contract():
    historical = json.loads(CONTRACT.read_text())
    assert adapter_contract_ok(historical, main.app.openapi())


def test_health_response_preserves_adapters_identity(monkeypatch):
    monkeypatch.setattr(main.settings, "app_name", "GoodMorning Marketing Adapters API")
    monkeypatch.setattr(main.settings, "app_env", "dev")
    assert main.health() == {
        "service": "GoodMorning Marketing Adapters API",
        "status": "ok",
        "environment": "dev",
    }
