from contextlib import contextmanager
import json
from uuid import UUID

import psycopg.types.json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app import main


class Result:
    def __init__(self, result):
        self.result = result

    def fetchone(self):
        row = self.result.fetchone()
        return dict(row._mapping) if row is not None else None

    def fetchall(self):
        return [dict(row._mapping) for row in self.result.fetchall()]


class Connection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement, params=(), prepare=None):
        statement = statement.replace("%s", "?")
        values = tuple(
            json.dumps(value.obj) if isinstance(value, psycopg.types.json.Jsonb)
            else str(value) if isinstance(value, UUID)
            else value
            for value in params
        )
        return Result(self.connection.exec_driver_sql(statement, values))

    def commit(self):
        # The surrounding SQLAlchemy transaction commits on context exit.
        pass


@pytest.fixture
def client(monkeypatch, tmp_path):
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @contextmanager
    def database_connection():
        with engine.begin() as connection:
            yield Connection(connection)

    monkeypatch.setattr(main, "database_connection", database_connection)
    monkeypatch.setenv("ADMIN_USERNAME", "staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "disposable-demo-admin-password")
    with TestClient(main.app, base_url="https://dev.marketing.goodmorning.mx", raise_server_exceptions=False) as test_client:
        yield test_client
    engine.dispose()


def test_public_demo_request_and_staff_follow_up(client):
    payload = {
        "name": "Disposable prospect",
        "email": "prospect@example.test",
        "company": "Example Studio",
        "role": "Marketing lead",
        "website": "https://example.test",
        "goals": "Plan a bilingual campaign and review weekly performance.",
        "market": "Mexico",
        "consent": True,
        "honeypot": "",
    }
    submitted = client.post("/demo-requests", json=payload)
    assert submitted.status_code == 201
    assert client.get("/admin/demo-requests").status_code == 401

    rows = client.get("/admin/demo-requests", auth=("staff", "disposable-demo-admin-password"))
    assert rows.status_code == 200
    assert len(rows.json()) == 1
    request_id = rows.json()[0]["id"]
    updated = client.put(
        f"/admin/demo-requests/{request_id}",
        auth=("staff", "disposable-demo-admin-password"),
        json={"qualification_status": "contacted", "admin_notes": "Follow up manually."},
    )
    assert updated.status_code == 200
    assert updated.json()["qualification_status"] == "contacted"
