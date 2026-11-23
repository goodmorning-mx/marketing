import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from app.config import get_settings
from app.models import Base
from app.adapters import router as adapters_router
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from gm_auth import AuthIdentity, AuthService, AuthSettings
from gm_auth.models import metadata as gm_auth_metadata

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
origins = settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["*", "If-Match"],
    expose_headers=["ETag"],
)
app.include_router(adapters_router)

basic_auth = HTTPBasic(auto_error=False)
bearer = HTTPBearer(auto_error=False)
statuses = ("new", "qualified", "not_qualified", "contacted", "invited", "closed")
auth_service: AuthService | None = None
_runtime_engine: Engine | None = None
_runtime_engine_url: str | None = None


def runtime_database_engine() -> Engine:
    global _runtime_engine, _runtime_engine_url
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=503, detail="Account storage is not configured.")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if _runtime_engine is None or _runtime_engine_url != database_url:
        if _runtime_engine is not None:
            _runtime_engine.dispose()
        _runtime_engine = create_engine(database_url, pool_pre_ping=True)
        _runtime_engine_url = database_url
    return _runtime_engine


def configure_auth() -> AuthService:
    secret = os.getenv("AUTH_JWT_SECRET", "")
    if not secret or len(secret) < 32:
        raise HTTPException(status_code=503, detail="Account access is not configured.")
    return AuthService(runtime_database_engine(), AuthSettings(jwt_secret=secret, issuer="goodmarketing"))


def account_service() -> AuthService:
    global auth_service
    if auth_service is None:
        auth_service = configure_auth()
    return auth_service


def require_allowed_origin(request: Request) -> None:
    origin = request.headers.get("Origin")
    if not origin or origin not in settings.allowed_origins:
        raise HTTPException(status_code=403, detail="Request origin is not permitted.")


def current_customer(request: Request, credentials=Depends(bearer), service: AuthService = Depends(account_service)) -> AuthIdentity:
    token = credentials.credentials if credentials else request.cookies.get("gm_access")
    if not token:
        raise HTTPException(status_code=401, detail="Sign-in required.")
    if credentials is None and request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_allowed_origin(request)
    try:
        return service.identity_from_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Sign-in required.") from exc


def require_staff(credentials: HTTPBasicCredentials | None = Depends(basic_auth)):
    username, password = os.getenv("ADMIN_USERNAME"), os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        raise HTTPException(status_code=503, detail="Admin access is not configured.")
    if credentials is None or not (secrets.compare_digest(credentials.username.encode(), username.encode()) and secrets.compare_digest(credentials.password.encode(), password.encode())):
        raise HTTPException(status_code=401, detail="Sign-in required.", headers={"WWW-Authenticate": "Basic"})
    return credentials.username


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class WorkspaceLoginInput(LoginInput):
    organization_id: str | None = Field(default=None, min_length=1, max_length=128)


class ActivateInput(LoginInput):
    name: str = Field(min_length=2, max_length=255)
    token: str = Field(min_length=32, max_length=256)


class InvitationInput(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    workspace_name: str = Field(min_length=2, max_length=120)
    workspace_id: str | None = Field(default=None, max_length=128)
    role: Literal["owner", "viewer"]
    expires_hours: int = Field(default=72, ge=1, le=720)


class WorkspaceNameInput(BaseModel):
    display_name: str = Field(min_length=2, max_length=120)


def set_session(response: Response, tokens):
    domain = os.getenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx") or None
    response.set_cookie("gm_access", tokens.access_token, httponly=True, secure=True, samesite="lax", max_age=tokens.expires_in, path="/", domain=domain)
    response.set_cookie("gm_refresh", tokens.refresh_token, httponly=True, secure=True, samesite="lax", max_age=30 * 86400, path="/auth", domain=domain)


def clear_session(response: Response):
    domain = os.getenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx") or None
    response.delete_cookie("gm_access", path="/", domain=domain)
    response.delete_cookie("gm_refresh", path="/auth", domain=domain)


@app.on_event("startup")
def startup_database():
    global auth_service
    if not os.getenv("DATABASE_URL"):
        return
    if os.getenv("AUTH_JWT_SECRET") and auth_service is None:
        auth_service = configure_auth()
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    with database_connection() as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS goodmarketing_schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
        connection.commit()
        connection.execute("SELECT pg_advisory_xact_lock(hashtext('goodmarketing-auth-migrations')::bigint)")
        migrations = (
            ("gm-auth:0.1.5", lambda: gm_auth_metadata.create_all(runtime_database_engine())),
            ("marketing:adapters-models:189869c", lambda: Base.metadata.create_all(runtime_database_engine())),
            ("workspace-accounts:1", "002_workspace_accounts.sql"),
            ("demo-requests:1", "003_demo_requests.sql"),
            ("marketing:strategy-fields:1", "004_marketing_strategy_fields.sql"),
            ("marketing:owner-write-permission:1", "005_owner_marketing_permissions.sql"),
            ("marketing:primary-brand-brief:1", "006_primary_brand_brief.sql"),
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


@app.post("/auth/login")
def customer_login(payload: WorkspaceLoginInput, request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    tokens = service.login(email=payload.email.strip().lower(), password=payload.password, organization_id=payload.organization_id)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    set_session(response, tokens)
    return {"identity": tokens.identity.as_dict()}


@app.post("/auth/workspaces")
def customer_workspaces(payload: LoginInput, request: Request, service: AuthService = Depends(account_service)):
    """List only memberships belonging to an identity whose password was verified."""
    require_allowed_origin(request)
    tokens = service.login(email=payload.email.strip().lower(), password=payload.password)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    with service.engine.connect() as connection:
        rows = connection.execute(text("""SELECT o.id, COALESCE(p.display_name, o.name) FROM gm_auth_memberships m
            JOIN gm_auth_organizations o ON o.id = m.organization_id
            LEFT JOIN goodmarketing_workspace_profiles p ON p.organization_id = o.id
            WHERE m.user_id = :user_id ORDER BY o.name, o.id"""), {"user_id": tokens.identity.user_id}).all()
    return {"workspaces": [{"organization_id": row[0], "name": row[1]} for row in rows]}


@app.post("/auth/logout", status_code=204)
def customer_logout(request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    refresh = request.cookies.get("gm_refresh")
    if refresh:
        service.logout(refresh)
    clear_session(response)


@app.post("/auth/refresh")
def customer_refresh(request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    refresh = request.cookies.get("gm_refresh")
    tokens = service.refresh(refresh) if refresh else None
    if tokens is None:
        clear_session(response)
        raise HTTPException(status_code=401, detail="Sign-in required.")
    set_session(response, tokens)
    return {"identity": tokens.identity.as_dict()}


@app.get("/auth/me")
def customer_me(identity: AuthIdentity = Depends(current_customer)):
    return identity.as_dict()


@app.post("/auth/activate")
def activate_account(payload: ActivateInput, request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    email = payload.email.strip().lower()
    try:
        with database_connection() as connection:
            invitation = connection.execute("SELECT * FROM goodmarketing_invitations WHERE token_hash = %s FOR UPDATE", (token_hash,)).fetchone()
            expires_at = invitation["expires_at"] if invitation else None
            if expires_at is not None and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if invitation is None or invitation["used_at"] is not None or expires_at <= datetime.now(timezone.utc) or invitation["email"] != email:
                raise HTTPException(status_code=400, detail="Invitation is invalid, expired, or already used.")
            organization_id = invitation["organization_id"]
            role = "owner" if "owner" in invitation["roles"] else "viewer"
            permissions = {"workspace:read"}
            if role == "owner":
                permissions.update({"workspace:name:update", "marketing:write"})
            # First authenticate against any existing membership. A wrong password
            # must never create an identity or change membership.
            existing_tokens = service.login(email=email, password=payload.password)
            if existing_tokens is None:
                with service.engine.connect() as auth_connection:
                    existing_user = auth_connection.execute(text("SELECT id FROM gm_auth_users WHERE email = :email"), {"email": email}).first()
                if existing_user:
                    raise HTTPException(status_code=401, detail="Invalid email or password.")
                service.create_user(email=email, name=payload.name.strip(), password=payload.password,
                    organization_id=organization_id, roles={role}, permissions=permissions)
            else:
                # Keep a pre-existing target membership exactly as it is. Only add
                # a new membership after password proof for the intended identity.
                with service.engine.connect() as auth_connection:
                    membership = auth_connection.execute(text("SELECT 1 FROM gm_auth_memberships WHERE user_id = :uid AND organization_id = :org"), {"uid": existing_tokens.identity.user_id, "org": organization_id}).first()
                if membership is None:
                    service.set_membership(user_id=existing_tokens.identity.user_id, organization_id=organization_id, roles={role}, permissions=permissions)
            tokens = service.login(email=email, password=payload.password, organization_id=organization_id)
            if tokens is None:
                raise HTTPException(status_code=500, detail="Account activation could not be completed.")
            connection.execute("UPDATE goodmarketing_invitations SET used_at = %s WHERE id = %s", (datetime.now(timezone.utc), invitation["id"]))
    except HTTPException:
        raise
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=400, detail="An account already exists for this email.") from exc
        raise
    set_session(response, tokens)
    return {"identity": tokens.identity.as_dict()}


@app.post("/admin/invitations")
def issue_invitation(payload: InvitationInput, _admin: str = Depends(require_staff)):
    email = payload.email.strip().lower()
    workspace_name = payload.workspace_name.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email.")
    service = account_service()
    service.create_schema()
    if payload.workspace_id:
        organization_id = payload.workspace_id
        with service.engine.connect() as connection:
            workspace = connection.execute(text("SELECT id FROM gm_auth_organizations WHERE id = :id"), {"id": organization_id}).first()
        if workspace is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
    else:
        # Stable operation identity makes a retry recover the same organization
        # after gm-auth's internally committed create_organization call.
        operation = hashlib.sha256(f"{email}\0{workspace_name.casefold()}".encode()).hexdigest()
        organization_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"goodmarketing-invitation:{operation}"))
        slug = re.sub(r"[^a-z0-9]+", "-", workspace_name.lower()).strip("-")[:90] or "workspace"
        try:
            service.create_organization(organization_id=organization_id, slug=f"{slug}-{organization_id[:8]}", name=workspace_name)
        except Exception as exc:
            if "unique" not in str(exc).lower() and "duplicate" not in str(exc).lower():
                raise
            with service.engine.connect() as connection:
                exists = connection.execute(text("SELECT 1 FROM gm_auth_organizations WHERE id = :id"), {"id": organization_id}).first()
            if exists is None:
                raise
    with service.engine.begin() as connection:
        connection.execute(text("INSERT INTO goodmarketing_workspace_profiles (organization_id, display_name) VALUES (:id, :name) ON CONFLICT (organization_id) DO NOTHING"), {"id": organization_id, "name": workspace_name})
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    roles = [payload.role]
    permissions = ["workspace:read", "workspace:name:update", "marketing:write"] if payload.role == "owner" else ["workspace:read"]
    with database_connection() as connection:
        connection.execute("INSERT INTO goodmarketing_invitations (id, email, organization_id, roles, permissions, token_hash, expires_at, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), email, organization_id, psycopg.types.json.Jsonb(roles), psycopg.types.json.Jsonb(permissions), hashlib.sha256(token.encode()).hexdigest(), now + timedelta(hours=payload.expires_hours), now))
    return {"invitation_url": f"https://dev.marketing.goodmorning.mx/activate/#token={token}", "email": email, "workspace_id": organization_id, "role": payload.role, "expires_at": now + timedelta(hours=payload.expires_hours)}


@app.get("/workspace")
def workspace_read(identity: AuthIdentity = Depends(current_customer), service: AuthService = Depends(account_service)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    with service.engine.connect() as connection:
        row = connection.execute(text("SELECT display_name FROM goodmarketing_workspace_profiles WHERE organization_id = :id"), {"id": identity.organization_id}).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"display_name": row[0], "organization_id": identity.organization_id}


@app.put("/workspace")
def workspace_update(payload: WorkspaceNameInput, identity: AuthIdentity = Depends(current_customer), service: AuthService = Depends(account_service)):
    if "owner" not in identity.roles or "workspace:name:update" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace update is not permitted.")
    with service.engine.begin() as connection:
        row = connection.execute(text("UPDATE goodmarketing_workspace_profiles SET display_name = :name, updated_at = :now WHERE organization_id = :id RETURNING display_name"), {"name": payload.display_name.strip(), "now": datetime.now(timezone.utc), "id": identity.organization_id}).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"display_name": row[0], "organization_id": identity.organization_id}


class BrandBriefInput(BaseModel):
    model_config = {"extra": "forbid"}
    brand_name: str = Field(min_length=1, max_length=160)
    description: str
    audience: str
    voice_tone: str = Field(max_length=240)
    primary_goal: str


def validate_primary_brand_fields(*, name: str, tone: str) -> None:
    """Shared product contract for writes to the primary Brand row."""
    if not name.strip():
        raise HTTPException(status_code=422, detail="Brand name is required.")
    if len(tone) > 240:
        raise HTTPException(status_code=422, detail="Voice/tone must be 240 characters or fewer.")


def _brief_etag(organization_id: str, brief: dict | None) -> str:
    payload = json.dumps([organization_id, brief], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return '"bb-' + hashlib.sha256(payload.encode()).hexdigest() + '"'


def _brief_dict(row):
    if row is None:
        return None
    return {"id": row["id"], "brand_name": row["name"], "description": row["summary"], "audience": row["audience"], "voice_tone": row["tone"], "primary_goal": row["goal"], "revision": row["revision"]}


@app.get("/workspace/brand-brief")
def read_brand_brief(response: Response, identity: AuthIdentity = Depends(current_customer)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    with database_connection() as connection:
        row = connection.execute("SELECT id, name, summary, audience, tone, goal, revision FROM brands WHERE tenant_id = %s AND is_primary = true", (identity.organization_id,)).fetchone()
    brief = _brief_dict(row)
    response.headers["ETag"] = _brief_etag(identity.organization_id, brief)
    response.headers["Cache-Control"] = "private, no-store"
    return {"brief": brief}


@app.put("/workspace/brand-brief")
def write_brand_brief(payload: BrandBriefInput, request: Request, response: Response, identity: AuthIdentity = Depends(current_customer)):
    if "owner" not in identity.roles or "marketing:write" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Marketing updates are not permitted.")
    validator = request.headers.get("If-Match")
    if validator is None:
        raise HTTPException(status_code=428, detail="If-Match is required.")
    if validator.startswith("W/") or validator == "*" or not re.fullmatch(r'"bb-[0-9a-f]{64}"', validator):
        raise HTTPException(status_code=400, detail="Unsupported If-Match validator.")
    validate_primary_brand_fields(name=payload.brand_name, tone=payload.voice_tone)
    with database_connection() as connection:
        row = connection.execute("SELECT id, name, summary, audience, tone, goal, revision FROM brands WHERE tenant_id = %s AND is_primary = true FOR UPDATE", (identity.organization_id,)).fetchone()
        current = _brief_dict(row)
        if _brief_etag(identity.organization_id, current) != validator:
            raise HTTPException(status_code=412, detail="The brand brief changed. Reload before saving.")
        values = (payload.brand_name, payload.description, payload.audience, payload.voice_tone, payload.primary_goal)
        if row is None:
            new_row = connection.execute("INSERT INTO brands (tenant_id, name, website, industry, summary, audience, tone, goal, positioning, offers, message, metrics, target_date, growth_timeline, platforms, is_primary, revision) VALUES (%s, %s, '', '', %s, %s, %s, %s, '', '', '', '', '', '', '[]', true, 1) ON CONFLICT DO NOTHING RETURNING id, name, summary, audience, tone, goal, revision", (identity.organization_id, *values)).fetchone()
            if new_row is None:
                raise HTTPException(status_code=412, detail="The brand brief changed. Reload before saving.")
            saved = _brief_dict(new_row)
        else:
            saved_row = connection.execute("UPDATE brands SET name = %s, summary = %s, audience = %s, tone = %s, goal = %s, revision = revision + 1 WHERE tenant_id = %s AND id = %s AND is_primary = true AND revision = %s RETURNING id, name, summary, audience, tone, goal, revision", (*values, identity.organization_id, row["id"], row["revision"])).fetchone()
            if saved_row is None:
                raise HTTPException(status_code=412, detail="The brand brief changed. Reload before saving.")
            saved = _brief_dict(saved_row)
    response.headers["ETag"] = _brief_etag(identity.organization_id, saved)
    response.headers["Cache-Control"] = "private, no-store"
    return {"brief": saved}


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
