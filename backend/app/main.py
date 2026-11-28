import base64
import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request, Response, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from psycopg.rows import dict_row
from app.account_email import AccountEmail
from app.config import get_settings
from app import self_service
from app.brand_assets import MAX_OUTPUT_BYTES, decode_logo
from app.brand_fonts import validate_font
from app.brand_palette import MAX_PALETTE_BYTES, parse_gpl
from app.database import get_db
from app.models import Base, Brand, Campaign
from app.adapters import router as adapters_router
from sqlalchemy import and_, create_engine, or_, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from gm_auth import AuthIdentity, AuthService, AuthSettings, create_auth_router
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
    return self_service.MarketingAuthService(runtime_database_engine(), AuthSettings(jwt_secret=secret, issuer="goodmarketing"))


def account_service() -> AuthService:
    global auth_service
    if auth_service is None:
        auth_service = configure_auth()
    return auth_service


class _LazyAuthService:
    """Resolve runtime configuration only when an auth endpoint is requested."""

    def __getattr__(self, name: str):
        return getattr(account_service(), name)


app.include_router(create_auth_router(_LazyAuthService()))


@app.exception_handler(RequestValidationError)
async def redact_auth_validation(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/auth/"):
        return JSONResponse(status_code=422, content={"detail": "Invalid account request."},
                            headers={"Cache-Control": "no-store"})
    return await request_validation_exception_handler(request, exc)



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


class CustomerCredentials(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class WorkspaceLoginInput(CustomerCredentials):
    organization_id: str | None = Field(default=None, min_length=1, max_length=128)


class ActivateInput(CustomerCredentials):
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
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie("gm_access", tokens.access_token, httponly=True, secure=True, samesite="lax", max_age=tokens.expires_in, path="/", domain=domain)
    response.set_cookie("gm_refresh", tokens.refresh_token, httponly=True, secure=True, samesite="lax", max_age=30 * 86400, path="/auth", domain=domain)


def clear_session(response: Response):
    domain = os.getenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx") or None
    response.headers["Cache-Control"] = "no-store"
    response.delete_cookie("gm_access", path="/", domain=domain, secure=True, httponly=True)
    response.delete_cookie("gm_refresh", path="/auth", domain=domain, secure=True, httponly=True)


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
            migrations = [
                ("marketing:adapters-models:189869c", lambda: Base.metadata.create_all(schema_engine)),
                ("demo-requests:1", "003_demo_requests.sql"),
                ("marketing:strategy-fields:1", "004_marketing_strategy_fields.sql"),
                ("marketing:primary-brand-brief:1", "006_primary_brand_brief.sql"),
            ]
            if os.getenv("AUTH_JWT_SECRET"):
                migrations.insert(0, ("gm-auth:0.1.5", lambda: gm_auth_metadata.create_all(schema_engine)))
                migrations.extend((
                    ("workspace-accounts:1", "002_workspace_accounts.sql"),
                    ("marketing:owner-write-permission:1", "005_owner_marketing_permissions.sql"),
                    ("marketing:self-service-accounts:1", "007_self_service_accounts.sql"),
                    ("marketing:workspace-brand-appearance:1", "008_workspace_brand_appearance.sql"),
                    ("marketing:workspace-brand-asset-extensions:1", "009_workspace_brand_asset_extensions.sql"),
                    ("marketing:workspace-campaigns:1", "010_workspace_campaigns.sql"),
                ))
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


def limit_account_request(service: AuthService, request: Request, action: str, email: str | None = None):
    peer = request.client.host if request.client else None
    self_service.limit(service.engine, action=action, email=email, address=peer)


@app.post("/auth/registration/request", status_code=202)
def start_registration(payload: self_service.EmailRequest, request: Request, response: Response,
                       service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    email = str(payload.email).lower()
    limit_account_request(service, request, "registration", email)
    mailer = AccountEmail(settings.allowed_origins, settings.app_env)
    self_service.request_verification(service, mailer, email, payload.locale)
    response.headers["Cache-Control"] = "no-store"
    return {"message": "If this address is eligible, check your inbox. If nothing arrives, try again."}


@app.post("/auth/registration/verify", status_code=204)
def finish_registration(payload: self_service.RegistrationConfirmation, request: Request, response: Response,
                        service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    limit_account_request(service, request, "verify")
    if not self_service.verify_and_provision(service, payload):
        raise HTTPException(status_code=400, detail="Invalid, expired, or used verification link.")
    response.headers["Cache-Control"] = "no-store"


@app.post("/auth/session/password-reset/request", status_code=202)
def start_browser_reset(payload: self_service.EmailRequest, request: Request, response: Response,
                        service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    email = str(payload.email).lower()
    limit_account_request(service, request, "reset", email)
    mailer = AccountEmail(settings.allowed_origins, settings.app_env)
    self_service.request_reset(service, mailer, email, payload.locale)
    response.headers["Cache-Control"] = "no-store"
    return {"message": "If this address is eligible, check your inbox. If nothing arrives, try again."}


@app.post("/auth/session/password-reset/confirm", status_code=204)
def finish_browser_reset(payload: self_service.ResetConfirmation, request: Request, response: Response,
                         service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    limit_account_request(service, request, "reset-confirm")
    if not service.reset_password(payload.token, payload.password):
        raise HTTPException(status_code=400, detail="Invalid, expired, or used reset link.")
    clear_session(response)


@app.post("/auth/session/login")
def customer_login(payload: WorkspaceLoginInput, request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    email = payload.email.strip().lower()
    limit_account_request(service, request, "login", email)
    tokens = service.login(email=email, password=payload.password, organization_id=payload.organization_id)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    set_session(response, tokens)
    return {"identity": tokens.identity.as_dict()}


@app.post("/auth/workspaces")
def customer_workspaces(payload: CustomerCredentials, request: Request, service: AuthService = Depends(account_service)):
    """List only memberships belonging to an identity whose password was verified."""
    require_allowed_origin(request)
    email = payload.email.strip().lower()
    limit_account_request(service, request, "login", email)
    tokens = service.login(email=email, password=payload.password)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    service.logout(tokens.refresh_token)
    with service.engine.connect() as connection:
        rows = connection.execute(text("""SELECT o.id, COALESCE(p.display_name, o.name) FROM gm_auth_memberships m
            JOIN gm_auth_organizations o ON o.id = m.organization_id
            LEFT JOIN goodmarketing_workspace_profiles p ON p.organization_id = o.id
            WHERE m.user_id = :user_id ORDER BY o.name, o.id"""), {"user_id": tokens.identity.user_id}).all()
    return {"workspaces": [{"organization_id": row[0], "name": row[1]} for row in rows]}


@app.post("/auth/session/logout", status_code=204)
def customer_logout(request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    refresh = request.cookies.get("gm_refresh")
    if refresh:
        service.logout(refresh)
    clear_session(response)


@app.post("/auth/session/refresh")
def customer_refresh(request: Request, response: Response, service: AuthService = Depends(account_service)):
    require_allowed_origin(request)
    refresh = request.cookies.get("gm_refresh")
    tokens = service.refresh(refresh) if refresh else None
    if tokens is None:
        unauthorized = JSONResponse(status_code=401, content={"detail": "Sign-in required."})
        clear_session(unauthorized)
        return unauthorized
    set_session(response, tokens)
    return {"identity": tokens.identity.as_dict()}


@app.get("/auth/session/me")
def customer_me(response: Response, identity: AuthIdentity = Depends(current_customer)):
    response.headers["Cache-Control"] = "no-store"
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


BRAND_TEMPLATES = {
    "goodmarketing": ("#718ED1", "#000CE0", "#A0AECB", "#00010E", "#FEFEFE"),
    "night-pulse": ("#46E582", "#147D49", "#AFD2BB", "#08120F", "#FEFEFE"),
    "bright-bounce": ("#A0EF20", "#58A900", "#C8D9B5", "#0E180B", "#FEFEFE"),
    "clear-form": ("#79BAFF", "#1769B4", "#B5C3D3", "#0D1219", "#FEFEFE"),
    "forward": ("#FF8654", "#C34B25", "#DBC3B9", "#170B08", "#FEFEFE"),
    "soft-focus": ("#F3A8BD", "#A95778", "#E2C8D0", "#170D13", "#FEFEFE"),
    "loud-rebel": ("#D7B46A", "#765521", "#D5C9AE", "#100E0A", "#FEFEFE"),
    "sunny-wit": ("#FFE01B", "#A78000", "#DDD29C", "#171407", "#FEFEFE"),
    "open-canvas": ("#D4C7B2", "#76634C", "#D7D0C5", "#15130F", "#FEFEFE"),
}
MAX_ASSET_REQUEST_BYTES = 6_000_000


class BrandFontChange(BaseModel):
    model_config = {"extra": "forbid"}
    action: Literal["keep", "replace", "remove", "add"]
    id: uuid.UUID | None = None
    filename: str | None = None
    base64: str | None = None


class BrandAssetsInput(BaseModel):
    model_config = {"extra": "forbid"}
    template_key: str | None = None
    logo_action: Literal["keep", "replace", "remove"] = "keep"
    logo_media_type: Literal["image/png", "image/jpeg", "image/webp", "image/svg+xml"] | None = None
    logo_base64: str | None = None
    palette_source: Literal["template", "custom"] | None = None
    palette_action: Literal["keep", "replace", "remove"] = "keep"
    palette_filename: str | None = None
    palette_base64: str | None = None
    font_changes: list[BrandFontChange] | None = None


def _appearance_dict(row):
    if row is None:
        return None
    logo_present = row["logo_size"] is not None
    custom_palette = row.get("custom_palette") or []
    if isinstance(custom_palette, str):
        custom_palette = json.loads(custom_palette)
    palette_source = row.get("palette_source", "template")
    return {
        "template_key": row["template_key"],
        "template_colors": [row[f"color_{index}"].strip() for index in range(1, 6)],
        "palette_source": palette_source,
        "custom_palette": ({"filename": row.get("custom_palette_filename"), "colors": custom_palette} if custom_palette else None),
        "colors": custom_palette if palette_source == "custom" and custom_palette else [row[f"color_{index}"].strip() for index in range(1, 6)],
        "fonts": row.get("fonts", []),
        "revision": row["revision"],
        "logo": ({"media_type": "image/png", "sha256": row["logo_sha256"], "size": row["logo_size"], "width": row["logo_width"], "height": row["logo_height"]} if logo_present else None),
    }


def _appearance_etag(organization_id: str, assets: dict | None) -> str:
    payload = json.dumps([organization_id, assets], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return '"ba-' + hashlib.sha256(payload.encode()).hexdigest() + '"'


def _read_appearance(connection, organization_id: str, *, lock: bool = False):
    suffix = " FOR UPDATE" if lock else ""
    return connection.execute(
        "SELECT a.organization_id, a.revision, a.template_key, a.color_1, a.color_2, a.color_3, a.color_4, a.color_5, a.logo_sha256, a.logo_size, a.logo_width, a.logo_height, a.palette_source, a.custom_palette, a.custom_palette_filename, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.font_id, 'filename', f.filename, 'name', f.display_name, 'media_type', f.media_type, 'size', f.size, 'sha256', f.sha256) ORDER BY f.created_at, f.font_id) FROM goodmarketing_brand_fonts f WHERE f.organization_id = a.organization_id), '[]'::jsonb) AS fonts FROM goodmarketing_brand_appearances a WHERE a.organization_id = %s" + suffix,
        (organization_id,),
    ).fetchone()


def _validate_appearance(payload: BrandAssetsInput) -> tuple[list[str], bytes | None, dict | None]:
    if payload.template_key is not None and payload.template_key not in BRAND_TEMPLATES:
        raise HTTPException(status_code=422, detail="Choose a supported brand template.")
    colors = list(BRAND_TEMPLATES[payload.template_key or "goodmarketing"])
    has_encoded = payload.logo_base64 is not None
    has_type = payload.logo_media_type is not None
    logo = None
    logo_metadata = None
    if payload.logo_action == "replace":
        if not has_encoded or not has_type:
            raise HTTPException(status_code=422, detail="Choose a valid logo file before saving.")
        try:
            logo = decode_logo(payload.logo_base64, payload.logo_media_type)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if len(logo.data) > MAX_OUTPUT_BYTES:
            raise HTTPException(status_code=422, detail="Processed logo is too large to save.")
        logo_metadata = {"sha256": hashlib.sha256(logo.data).hexdigest(), "size": len(logo.data), "width": logo.width, "height": logo.height}
    elif has_encoded or has_type:
        raise HTTPException(status_code=422, detail="Logo data is only accepted when replacing the logo.")
    return colors, logo.data if logo else None, logo_metadata


async def _read_bounded_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length and (not content_length.isdigit() or int(content_length) > MAX_ASSET_REQUEST_BYTES):
        raise HTTPException(status_code=413, detail="Brand assets request is too large.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_ASSET_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="Brand assets request is too large.")
    return bytes(body)


def _save_brand_assets(body: bytes, validator: str, organization_id: str) -> tuple[dict, str]:
    try:
        value = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError) as exc:
        raise HTTPException(status_code=400, detail="Brand assets request is not valid JSON.") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="Brand assets request must be a JSON object.")
    try:
        payload = BrandAssetsInput.model_validate(value)
    except (ValidationError, RecursionError) as exc:
        raise HTTPException(status_code=422, detail="Brand assets request is invalid.") from exc
    colors, replacement, logo_metadata = _validate_appearance(payload)
    custom_palette = None
    palette_filename = None
    if payload.palette_action == "replace":
        try:
            if not payload.palette_base64 or not payload.palette_filename:
                raise ValueError("Choose a GIMP Palette (.gpl) file.")
            if len(payload.palette_base64) > ((MAX_PALETTE_BYTES + 2) // 3) * 4:
                raise ValueError("Palette file exceeds 16 KiB.")
            palette_bytes = base64.b64decode(payload.palette_base64, validate=True)
            palette_filename, custom_palette = parse_gpl(palette_bytes, payload.palette_filename)
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    elif payload.palette_base64 is not None or payload.palette_filename is not None:
        raise HTTPException(status_code=422, detail="Palette data is only accepted when replacing the palette.")
    prepared_fonts = []
    if payload.font_changes is not None:
        if len(payload.font_changes) > 6:
            raise HTTPException(status_code=422, detail="Choose up to three brand fonts.")
        for change in payload.font_changes:
            action = change.action
            font_id = change.id
            validated = None
            if action in {"add", "replace"}:
                try:
                    if not isinstance(change.base64, str) or not isinstance(change.filename, str):
                        raise ValueError("Choose a supported font file.")
                    if len(change.base64) > ((1024 * 1024 + 2) // 3) * 4:
                        raise ValueError("Font files must not exceed 1 MiB.")
                    font_data = base64.b64decode(change.base64, validate=True)
                    validated = validate_font(font_data, change.filename)
                except (ValueError, UnicodeDecodeError) as exc:
                    raise HTTPException(status_code=422, detail="Font file is malformed or unsupported.") from exc
            if (action in {"keep", "remove", "replace"}) != (font_id is not None):
                raise HTTPException(status_code=422, detail="Brand font change is invalid.")
            prepared_fonts.append((action, font_id, validated))
    with database_connection() as connection:
        current_row = _read_appearance(connection, organization_id, lock=True)
        current = _appearance_dict(current_row)
        if _appearance_etag(organization_id, current) != validator:
            raise HTTPException(status_code=412, detail="Brand assets changed. Reload before saving.")
        existing_fonts = connection.execute("SELECT font_id FROM goodmarketing_brand_fonts WHERE organization_id = %s FOR UPDATE", (organization_id,)).fetchall()
        existing_ids = {row["font_id"] for row in existing_fonts}
        if payload.font_changes is not None:
            specified = [font_id for action, font_id, _font in prepared_fonts if action in {"keep", "remove", "replace"}]
            if len(specified) != len(set(specified)) or set(specified) != existing_ids:
                raise HTTPException(status_code=422, detail="Reload brand assets before changing fonts.")
            final_count = sum(action in {"keep", "replace", "add"} for action, _font_id, _font in prepared_fonts)
            if final_count > 3:
                raise HTTPException(status_code=422, detail="Choose up to three brand fonts.")
        effective_template_key = payload.template_key if "template_key" in payload.model_fields_set else (current_row["template_key"] if current_row is not None else "goodmarketing")
        if effective_template_key is None:
            effective_template_key = "goodmarketing"
        if "template_key" not in payload.model_fields_set and current_row is not None:
            colors = [current_row[f"color_{index}"].strip() for index in range(1, 6)]
        old_palette = current_row["custom_palette"] if current_row is not None else []
        if isinstance(old_palette, str):
            old_palette = json.loads(old_palette)
        old_palette_filename = current_row["custom_palette_filename"] if current_row is not None else None
        if payload.palette_action == "remove":
            custom_palette, palette_filename = [], None
        elif payload.palette_action == "keep":
            custom_palette, palette_filename = old_palette, old_palette_filename
        palette_source = payload.palette_source or (current_row["palette_source"] if current_row is not None else "template")
        if not custom_palette and palette_source == "custom":
            palette_source = "template"
        if current_row is None:
            logo_bytes = replacement if payload.logo_action == "replace" else None
            logo_sha = logo_metadata["sha256"] if logo_metadata else None
            logo_size = logo_metadata["size"] if logo_metadata else None
            logo_width = logo_metadata["width"] if logo_metadata else None
            logo_height = logo_metadata["height"] if logo_metadata else None
            inserted = connection.execute(
                "INSERT INTO goodmarketing_brand_appearances (organization_id, revision, template_key, color_1, color_2, color_3, color_4, color_5, logo_bytes, logo_sha256, logo_size, logo_width, logo_height, palette_source, custom_palette, custom_palette_filename) VALUES (%s, 1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING organization_id",
                (organization_id, effective_template_key, *colors, logo_bytes, logo_sha, logo_size, logo_width, logo_height, palette_source, json.dumps(custom_palette), palette_filename),
            ).fetchone()
            if inserted is None:
                raise HTTPException(status_code=412, detail="Brand assets changed. Reload before saving.")
        elif payload.logo_action == "keep":
            updated = connection.execute(
                "UPDATE goodmarketing_brand_appearances SET revision = revision + 1, template_key = %s, color_1 = %s, color_2 = %s, color_3 = %s, color_4 = %s, color_5 = %s, palette_source = %s, custom_palette = %s, custom_palette_filename = %s, updated_at = now() WHERE organization_id = %s AND revision = %s RETURNING organization_id",
                (effective_template_key, *colors, palette_source, json.dumps(custom_palette), palette_filename, organization_id, current_row["revision"]),
            ).fetchone()
            if updated is None:
                raise HTTPException(status_code=412, detail="Brand assets changed. Reload before saving.")
        else:
            logo_values = (replacement, logo_metadata["sha256"], logo_metadata["size"], logo_metadata["width"], logo_metadata["height"]) if payload.logo_action == "replace" else (None, None, None, None, None)
            updated = connection.execute(
                "UPDATE goodmarketing_brand_appearances SET revision = revision + 1, template_key = %s, color_1 = %s, color_2 = %s, color_3 = %s, color_4 = %s, color_5 = %s, logo_bytes = %s, logo_sha256 = %s, logo_size = %s, logo_width = %s, logo_height = %s, palette_source = %s, custom_palette = %s, custom_palette_filename = %s, updated_at = now() WHERE organization_id = %s AND revision = %s RETURNING organization_id",
                (effective_template_key, *colors, *logo_values, palette_source, json.dumps(custom_palette), palette_filename, organization_id, current_row["revision"]),
            ).fetchone()
            if updated is None:
                raise HTTPException(status_code=412, detail="Brand assets changed. Reload before saving.")
        if payload.font_changes is not None:
            for action, font_id, validated in prepared_fonts:
                if action == "remove":
                    connection.execute("DELETE FROM goodmarketing_brand_fonts WHERE organization_id = %s AND font_id = %s", (organization_id, font_id))
                elif action in {"add", "replace"}:
                    saved_font_id = font_id or uuid.uuid4()
                    if action == "replace":
                        connection.execute("UPDATE goodmarketing_brand_fonts SET filename = %s, display_name = %s, media_type = %s, font_bytes = %s, sha256 = %s, size = %s WHERE organization_id = %s AND font_id = %s", (validated.filename, validated.display_name, validated.media_type, validated.data, validated.sha256, len(validated.data), organization_id, saved_font_id))
                    else:
                        connection.execute("INSERT INTO goodmarketing_brand_fonts (organization_id, font_id, filename, display_name, media_type, font_bytes, sha256, size) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", (organization_id, saved_font_id, validated.filename, validated.display_name, validated.media_type, validated.data, validated.sha256, len(validated.data)))
        saved_row = _read_appearance(connection, organization_id)
    assets = _appearance_dict(saved_row)
    return assets, _appearance_etag(organization_id, assets)


def _brief_dict(row):
    if row is None:
        return None
    return {"id": row["id"], "brand_name": row["name"], "description": row["summary"], "audience": row["audience"], "voice_tone": row["tone"], "primary_goal": row["goal"], "revision": row["revision"]}


CampaignPlatform = Literal["facebook", "instagram"]
CampaignFrequency = Literal["low", "medium", "high"]


class WorkspaceCampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    objective: str = Field(default="", max_length=5000)
    platforms: list[CampaignPlatform] = Field(default_factory=list, max_length=2)
    duration_days: int = Field(ge=7, le=90)
    posting_frequency: CampaignFrequency

    @model_validator(mode="after")
    def unique_platforms(self):
        if len(set(self.platforms)) != len(self.platforms):
            raise ValueError("Campaign platforms must be unique.")
        return self


class WorkspaceCampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=180)
    objective: str | None = Field(default=None, max_length=5000)
    platforms: list[CampaignPlatform] | None = Field(default=None, max_length=2)
    duration_days: int | None = Field(default=None, ge=7, le=90)
    posting_frequency: CampaignFrequency | None = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("At least one campaign field is required.")
        if "platforms" in self.model_fields_set and self.platforms is not None and len(set(self.platforms)) != len(self.platforms):
            raise ValueError("Campaign platforms must be unique.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Campaign fields cannot be null.")
        return self


def _workspace_campaign_dict(campaign: Campaign) -> dict:
    return {
        "id": campaign.id,
        "name": campaign.name,
        "objective": campaign.objective,
        "key_message": campaign.key_message,
        "start_date": campaign.start_date,
        "end_date": campaign.end_date,
        "success_metrics": campaign.success_metrics,
        "platforms": campaign.platforms or [],
        "status": campaign.status,
        "duration_days": campaign.duration_days,
        "posting_frequency": campaign.posting_frequency,
        "archived_at": campaign.archived_at.isoformat() if campaign.archived_at else None,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "revision": campaign.revision,
    }


def _workspace_campaign_etag(organization_id: str, campaign: Campaign) -> str:
    serialized = json.dumps([organization_id, _workspace_campaign_dict(campaign)], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return '"wc-' + hashlib.sha256(serialized.encode()).hexdigest() + '"'


def _workspace_campaign_query(organization_id: str, campaign_id: int | None = None, *, lock: bool = False):
    owned_workspace = Campaign.workspace_id == organization_id
    owned_legacy_brand = and_(Campaign.workspace_id.is_(None), Brand.tenant_id == organization_id)
    query = select(Campaign).outerjoin(Brand, Brand.id == Campaign.brand_id).where(or_(owned_workspace, owned_legacy_brand))
    if campaign_id is not None:
        query = query.where(Campaign.id == campaign_id)
    if lock:
        query = query.with_for_update(of=Campaign)
    return query


def _require_campaign_read(identity: AuthIdentity) -> None:
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")


def _require_campaign_write(identity: AuthIdentity) -> None:
    if "owner" not in identity.roles or "marketing:write" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Marketing updates are not permitted.")


def _require_campaign_etag(request: Request, organization_id: str, campaign: Campaign) -> None:
    validator = request.headers.get("If-Match")
    if validator is None:
        raise HTTPException(status_code=428, detail="If-Match is required.")
    if validator.startswith("W/") or validator == "*" or not re.fullmatch(r'"wc-[0-9a-f]{64}"', validator):
        raise HTTPException(status_code=400, detail="Unsupported If-Match validator.")
    if _workspace_campaign_etag(organization_id, campaign) != validator:
        raise HTTPException(status_code=412, detail="Campaign changed in another session. Reload before saving.")


def _campaign_create_key(value: str | None) -> str:
    if not value:
        raise HTTPException(status_code=428, detail="Idempotency-Key is required.")
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be a UUID.") from exc


def _campaign_create_fingerprint(payload: WorkspaceCampaignCreate) -> str:
    serialized = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()


def _existing_campaign_request(db: Session, organization_id: str, key: str) -> Campaign | None:
    return db.scalar(select(Campaign).where(Campaign.workspace_id == organization_id, Campaign.create_request_id == key))


def _campaign_request_conflict(campaign: Campaign, organization_id: str) -> HTTPException:
    return HTTPException(status_code=409, detail={
        "code": "idempotency_key_reused",
        "message": "This save request was already used for different campaign details.",
        "campaign_id": campaign.id,
        "etag": _workspace_campaign_etag(organization_id, campaign),
    })


@app.get("/workspace/campaigns")
def read_workspace_campaigns(response: Response, identity: AuthIdentity = Depends(current_customer), db: Session = Depends(get_db)):
    _require_campaign_read(identity)
    campaigns = db.scalars(_workspace_campaign_query(identity.organization_id).order_by(Campaign.created_at.desc(), Campaign.id.desc())).all()
    response.headers["Cache-Control"] = "private, no-store"
    return {"campaigns": [_workspace_campaign_dict(campaign) for campaign in campaigns]}


@app.post("/workspace/campaigns", status_code=201)
def create_workspace_campaign(payload: WorkspaceCampaignCreate, request: Request, response: Response,
                              identity: AuthIdentity = Depends(current_customer), db: Session = Depends(get_db),
                              idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    _require_campaign_write(identity)
    request_id = _campaign_create_key(idempotency_key)
    fingerprint = _campaign_create_fingerprint(payload)
    existing = _existing_campaign_request(db, identity.organization_id, request_id)
    if existing:
        if existing.create_request_fingerprint != fingerprint:
            raise _campaign_request_conflict(existing, identity.organization_id)
        response.status_code = 200
        response.headers["ETag"] = _workspace_campaign_etag(identity.organization_id, existing)
        response.headers["Cache-Control"] = "private, no-store"
        return {"campaign": _workspace_campaign_dict(existing), "replayed": True}

    campaign = Campaign(
        workspace_id=identity.organization_id,
        brand_id=None,
        name=payload.name,
        objective=payload.objective,
        platforms=payload.platforms,
        duration_days=payload.duration_days,
        posting_frequency=payload.posting_frequency,
        status="draft",
        revision=1,
        create_request_id=request_id,
        create_request_fingerprint=fingerprint,
    )
    db.add(campaign)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing_campaign_request(db, identity.organization_id, request_id)
        if existing is None:
            raise
        if existing.create_request_fingerprint != fingerprint:
            raise _campaign_request_conflict(existing, identity.organization_id)
        campaign = existing
        replayed = True
        response.status_code = 200
    else:
        replayed = False
    db.refresh(campaign)
    response.headers["ETag"] = _workspace_campaign_etag(identity.organization_id, campaign)
    response.headers["Cache-Control"] = "private, no-store"
    return {"campaign": _workspace_campaign_dict(campaign), "replayed": replayed}


@app.get("/workspace/campaigns/{campaign_id}")
def read_workspace_campaign(response: Response, campaign_id: int = Path(..., ge=1, le=2_147_483_647), identity: AuthIdentity = Depends(current_customer), db: Session = Depends(get_db)):
    _require_campaign_read(identity)
    campaign = db.scalar(_workspace_campaign_query(identity.organization_id, campaign_id))
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    response.headers["ETag"] = _workspace_campaign_etag(identity.organization_id, campaign)
    response.headers["Cache-Control"] = "private, no-store"
    return {"campaign": _workspace_campaign_dict(campaign)}


@app.put("/workspace/campaigns/{campaign_id}")
def update_workspace_campaign(payload: WorkspaceCampaignUpdate, request: Request, response: Response,
                              campaign_id: int = Path(..., ge=1, le=2_147_483_647),
                              identity: AuthIdentity = Depends(current_customer), db: Session = Depends(get_db)):
    _require_campaign_write(identity)
    campaign = db.scalar(_workspace_campaign_query(identity.organization_id, campaign_id, lock=True))
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    _require_campaign_etag(request, identity.organization_id, campaign)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(campaign, key, value)
    campaign.revision += 1
    db.commit()
    db.refresh(campaign)
    response.headers["ETag"] = _workspace_campaign_etag(identity.organization_id, campaign)
    response.headers["Cache-Control"] = "private, no-store"
    return {"campaign": _workspace_campaign_dict(campaign)}


@app.post("/workspace/campaigns/{campaign_id}/archive")
def archive_workspace_campaign(request: Request, response: Response,
                               campaign_id: int = Path(..., ge=1, le=2_147_483_647),
                               identity: AuthIdentity = Depends(current_customer), db: Session = Depends(get_db)):
    _require_campaign_write(identity)
    campaign = db.scalar(_workspace_campaign_query(identity.organization_id, campaign_id, lock=True))
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    _require_campaign_etag(request, identity.organization_id, campaign)
    if campaign.archived_at is None:
        campaign.archived_at = datetime.now(timezone.utc)
        campaign.revision += 1
        db.commit()
        db.refresh(campaign)
    response.headers["ETag"] = _workspace_campaign_etag(identity.organization_id, campaign)
    response.headers["Cache-Control"] = "private, no-store"
    return {"campaign": _workspace_campaign_dict(campaign)}


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


@app.get("/workspace/brand-assets")
def read_brand_assets(response: Response, identity: AuthIdentity = Depends(current_customer)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    with database_connection() as connection:
        row = _read_appearance(connection, identity.organization_id)
    assets = _appearance_dict(row)
    response.headers["ETag"] = _appearance_etag(identity.organization_id, assets)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return {"assets": assets}


@app.get("/workspace/brand-assets/logo")
def read_brand_logo(identity: AuthIdentity = Depends(current_customer)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    with database_connection() as connection:
        row = connection.execute("SELECT logo_bytes FROM goodmarketing_brand_appearances WHERE organization_id = %s", (identity.organization_id,)).fetchone()
    if row is None or row["logo_bytes"] is None:
        raise HTTPException(status_code=404, detail="No saved logo.", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
    return Response(content=bytes(row["logo_bytes"]), media_type="image/png", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="brand-logo.png"'})


@app.post("/workspace/brand-assets/palette-preview")
async def preview_brand_palette(request: Request, identity: AuthIdentity = Depends(current_customer)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    content_length = request.headers.get("content-length")
    if content_length and (not content_length.isdigit() or int(content_length) > 24 * 1024):
        raise HTTPException(status_code=413, detail="Palette preview request is too large.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 24 * 1024:
            raise HTTPException(status_code=413, detail="Palette preview request is too large.")
    try:
        payload = json.loads(bytes(body))
        if not isinstance(payload, dict) or not isinstance(payload.get("filename"), str) or not isinstance(payload.get("base64"), str):
            raise ValueError("Choose a GIMP Palette (.gpl) file.")
        encoded = payload["base64"]
        if len(encoded) > ((MAX_PALETTE_BYTES + 2) // 3) * 4:
            raise ValueError("Palette file exceeds 16 KiB.")
        data = base64.b64decode(encoded, validate=True)
        filename, colors = parse_gpl(data, payload["filename"])
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise HTTPException(status_code=422, detail=str(exc) or "Palette file is invalid.") from exc
    return JSONResponse({"filename": filename, "colors": colors}, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@app.get("/workspace/brand-assets/fonts/{font_id}")
def read_brand_font(font_id: uuid.UUID, identity: AuthIdentity = Depends(current_customer)):
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Workspace access is not permitted.")
    with database_connection() as connection:
        row = connection.execute("SELECT font_bytes, filename, media_type FROM goodmarketing_brand_fonts WHERE organization_id = %s AND font_id = %s", (identity.organization_id, font_id)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No saved brand font.", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
    return Response(content=bytes(row["font_bytes"]), media_type=row["media_type"], headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="brand-font"'})


@app.put("/workspace/brand-assets")
async def write_brand_assets(request: Request, response: Response, identity: AuthIdentity = Depends(current_customer)):
    if "owner" not in identity.roles or "marketing:write" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Marketing updates are not permitted.")
    validator = request.headers.get("If-Match")
    if validator is None:
        raise HTTPException(status_code=428, detail="If-Match is required.")
    if validator.startswith("W/") or validator == "*" or not re.fullmatch(r'"ba-[0-9a-f]{64}"', validator):
        raise HTTPException(status_code=400, detail="Unsupported If-Match validator.")
    body = await _read_bounded_body(request)
    assets, etag = await run_in_threadpool(_save_brand_assets, body, validator, identity.organization_id)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return {"assets": assets}


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
