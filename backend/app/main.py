import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from sqlalchemy import create_engine
from app.adapters import router as adapters_router
from app.config import get_settings
from app.database import engine
from app.models import Base

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
origins = settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(adapters_router)
basic_auth = HTTPBasic(auto_error=False)
statuses = ("new", "qualified", "not_qualified", "contacted", "invited", "closed")


class DemoRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    company: str = Field(min_length=2, max_length=160)
    role: str = Field(min_length=2, max_length=120)
    website: str | None = Field(default=None, max_length=240)
    goals: str = Field(min_length=20, max_length=1500)
    market: str = Field(min_length=2, max_length=120)
    consent: bool
    honeypot: str = ""


class RequestUpdate(BaseModel):
    qualification_status: Literal["new", "qualified", "not_qualified", "contacted", "invited", "closed"]
    admin_notes: str = Field(default="", max_length=2000)


def database_connection():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise HTTPException(status_code=503, detail="Request storage is not configured.")
    url = url.replace("postgresql+psycopg://", "postgresql://", 1)
    try:
        return psycopg.connect(url, row_factory=dict_row, connect_timeout=5)
    except psycopg.Error as exc:
        raise HTTPException(status_code=503, detail="Request storage is temporarily unavailable.") from exc


def ensure_table(connection):
    connection.execute(
        """CREATE TABLE IF NOT EXISTS demo_requests (
            id UUID PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(254) NOT NULL,
            company VARCHAR(160) NOT NULL,
            role VARCHAR(120) NOT NULL,
            website VARCHAR(240),
            goals TEXT NOT NULL,
            market VARCHAR(120) NOT NULL,
            submitted_at TIMESTAMPTZ NOT NULL,
            qualification_status VARCHAR(24) NOT NULL DEFAULT 'new',
            admin_notes TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS demo_requests_submitted_at_idx ON demo_requests (submitted_at DESC)")
    connection.commit()


@app.on_event("startup")
def startup_database():
    if not os.getenv("DATABASE_URL"):
        return
    database_url = os.environ["DATABASE_URL"]
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    schema_engine = create_engine(database_url, pool_pre_ping=True)
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    try:
        with database_connection() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS goodmarketing_schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
            connection.commit()
            connection.execute("SELECT pg_advisory_xact_lock(hashtext('goodmarketing-auth-migrations')::bigint)")
            migrations = (
                ("marketing:adapters-models:189869c", lambda: Base.metadata.create_all(schema_engine)),
                ("demo-requests:1", "003_demo_requests.sql"),
                ("marketing:strategy-fields:1", "004_marketing_strategy_fields.sql"),
            )
            for version, migration in migrations:
                found = connection.execute("SELECT 1 FROM goodmarketing_schema_migrations WHERE version = %s", (version,)).fetchone()
                if found:
                    continue
                if callable(migration):
                    migration()
                else:
                    with open(os.path.join(migrations_dir, migration), encoding="utf-8") as source:
                        connection.execute(source.read(), prepare=False)
                connection.execute("INSERT INTO goodmarketing_schema_migrations (version) VALUES (%s)", (version,))
            connection.commit()
    finally:
        schema_engine.dispose()


def require_admin(credentials: HTTPBasicCredentials | None = Depends(basic_auth)):
    username = os.getenv("ADMIN_USERNAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        raise HTTPException(status_code=503, detail="Admin access is not configured.")
    if credentials is None or not (
        secrets.compare_digest(credentials.username.encode(), username.encode())
        and secrets.compare_digest(credentials.password.encode(), password.encode())
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign-in required.",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok", "environment": settings.app_env}


@app.post("/demo-requests", status_code=status.HTTP_201_CREATED)
def submit_demo_request(request: DemoRequest):
    if request.honeypot.strip():
        return {"message": "Your request has been received."}
    email = request.email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not request.consent:
        raise HTTPException(status_code=422, detail="Enter a valid email and agree to be contacted.")
    request_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    with database_connection() as connection:
        ensure_table(connection)
        connection.execute(
            """INSERT INTO demo_requests
            (id, name, email, company, role, website, goals, market, submitted_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (request_id, request.name.strip(), email, request.company.strip(), request.role.strip(),
             request.website.strip() if request.website else None, request.goals.strip(), request.market.strip(), now, now),
        )
    return {"id": str(request_id), "message": "Your request has been received."}


@app.get("/admin/demo-requests")
def list_demo_requests(
    qualification_status: str | None = Query(default=None),
    search: str = Query(default="", max_length=120),
    _admin: str = Depends(require_admin),
):
    if qualification_status and qualification_status not in statuses:
        raise HTTPException(status_code=422, detail="Unknown request status.")
    with database_connection() as connection:
        ensure_table(connection)
        conditions, values = [], []
        if qualification_status:
            conditions.append("qualification_status = %s")
            values.append(qualification_status)
        if search.strip():
            conditions.append("(name ILIKE %s OR email ILIKE %s OR company ILIKE %s)")
            wildcard = f"%{search.strip()}%"
            values.extend([wildcard, wildcard, wildcard])
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        rows = connection.execute(
            "SELECT * FROM demo_requests" + where + " ORDER BY submitted_at DESC LIMIT 500", values
        ).fetchall()
    return rows


@app.put("/admin/demo-requests/{request_id}")
def update_demo_request(request_id: uuid.UUID, update: RequestUpdate, _admin: str = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    with database_connection() as connection:
        ensure_table(connection)
        row = connection.execute(
            """UPDATE demo_requests SET qualification_status = %s, admin_notes = %s, updated_at = %s
            WHERE id = %s RETURNING *""",
            (update.qualification_status, update.admin_notes.strip(), now, request_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Request not found.")
    return row
