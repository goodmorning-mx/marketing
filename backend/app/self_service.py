"""Marketing signup and browser reset integration for the pinned gm-auth service."""

import hashlib
import secrets
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from gm_auth import AuthService
from gm_auth.models import password_resets, refresh_sessions, users
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError

from app.account_email import AccountEmail

OWNER_PERMISSIONS = {"workspace:read", "workspace:name:update", "marketing:write"}
TOKEN_TTL = timedelta(minutes=30)


class EmailRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    locale: Literal["en", "es"] = "en"


class ResetConfirmation(BaseModel):
    token: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(min_length=8, max_length=128)


class RegistrationConfirmation(ResetConfirmation):
    name: str = Field(min_length=1, max_length=100)
    workspace_name: str = Field(min_length=1, max_length=100)

    @field_validator("name", "workspace_name", mode="before")
    @classmethod
    def trim_names(cls, value):
        return value.strip() if isinstance(value, str) else value


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def limit(engine, *, action: str, email: str | None, address: str | None) -> None:
    """Limit per email and per trusted socket peer across API workers."""
    if engine.dialect.name != "postgresql":
        return
    current = datetime.now(timezone.utc)
    deadline = current + timedelta(minutes=10)
    scopes = []
    if email:
        scopes.append((digest(f"{action}:email:{email}"), 15 if action == "login" else 4))
    if address:
        scopes.append((digest(f"{action}:peer:{address}"), 150 if action == "login" else 80))
    exceeded = False
    with engine.begin() as connection:
        for bucket, maximum in sorted(scopes):
            hits = connection.execute(text("""
                INSERT INTO goodmarketing_account_limits (bucket, hits, expires_at)
                VALUES (:bucket, 1, :deadline)
                ON CONFLICT (bucket) DO UPDATE SET
                  hits = CASE WHEN goodmarketing_account_limits.expires_at <= :current
                              THEN 1 ELSE goodmarketing_account_limits.hits + 1 END,
                  expires_at = CASE WHEN goodmarketing_account_limits.expires_at <= :current
                                    THEN :deadline ELSE goodmarketing_account_limits.expires_at END
                RETURNING hits
            """), {"bucket": bucket, "deadline": deadline, "current": current}).scalar_one()
            exceeded |= hits > maximum
        # Bounded cleanup keeps abandoned email and address buckets from accumulating.
        connection.execute(text("""
            DELETE FROM goodmarketing_account_limits WHERE bucket IN (
              SELECT bucket FROM goodmarketing_account_limits
              WHERE expires_at <= :old LIMIT 32 FOR UPDATE SKIP LOCKED
            )
        """), {"old": current - timedelta(days=1)})
    if exceeded:
        raise HTTPException(429, detail="Too many account requests.", headers={"Retry-After": "600"})


class TransactionScope:
    """Let gm-auth 0.1.5 reuse a product-owned connection without closing it."""

    def __init__(self, connection):
        self.connection = connection

    def begin(self):
        return nullcontext(self.connection)

    def connect(self):
        return nullcontext(self.connection)


def request_verification(service: AuthService, mailer: AccountEmail, email: str, locale: str) -> None:
    with mailer.connect() as smtp:
        with service.engine.begin() as connection:
            if connection.scalar(select(users.c.id).where(users.c.email == email)):
                return
            token = secrets.token_urlsafe(32)
            token_hash = digest(token)
            current = datetime.now(timezone.utc)
            connection.execute(text("""
                INSERT INTO goodmarketing_email_verifications (token_hash, email, expires_at)
                VALUES (:token_hash, :email, :expires_at)
            """), {"token_hash": token_hash, "email": email, "expires_at": current + TOKEN_TTL})
            connection.execute(text("""
                DELETE FROM goodmarketing_email_verifications WHERE token_hash IN (
                  SELECT token_hash FROM goodmarketing_email_verifications
                  WHERE expires_at <= :current LIMIT 32 FOR UPDATE SKIP LOCKED
                )
            """), {"current": current})
        if not mailer.send(smtp, recipient=email, locale=locale, purpose="verify", token=token):
            with service.engine.begin() as connection:
                connection.execute(text("DELETE FROM goodmarketing_email_verifications WHERE token_hash = :token_hash"), {"token_hash": token_hash})


def verify_and_provision(service: AuthService, payload: RegistrationConfirmation) -> bool:
    token_hash = digest(payload.token)
    try:
        with service.engine.begin() as connection:
            email = connection.execute(text("""
                SELECT email FROM goodmarketing_email_verifications
                WHERE token_hash = :token_hash AND expires_at > now()
            """), {"token_hash": token_hash}).scalar()
            if not email:
                return False
            connection.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"signup:{email}"})
            claimed = connection.execute(text("""
                DELETE FROM goodmarketing_email_verifications
                WHERE token_hash = :token_hash AND expires_at > clock_timestamp()
                RETURNING email
            """), {"token_hash": token_hash}).scalar()
            if not claimed or connection.scalar(select(users.c.id).where(users.c.email == email)):
                return False
            organization_id = str(uuid4())
            scoped = AuthService(TransactionScope(connection), service.settings, service.audit_hook)
            scoped.create_organization(organization_id=organization_id, slug=organization_id, name=payload.workspace_name)
            scoped.create_user(email=email, name=payload.name, password=payload.password, organization_id=organization_id,
                               roles={"owner"}, permissions=OWNER_PERMISSIONS)
            connection.execute(text("""
                INSERT INTO goodmarketing_workspace_profiles (organization_id, display_name)
                VALUES (:organization_id, :name)
            """), {"organization_id": organization_id, "name": payload.workspace_name})
            connection.execute(text("DELETE FROM goodmarketing_email_verifications WHERE email = :email"), {"email": email})
    except IntegrityError:
        # A concurrent legacy account creation may claim the email first. Roll back the whole workspace.
        return False
    return True


def request_reset(service: AuthService, mailer: AccountEmail, email: str, locale: str) -> None:
    with mailer.connect() as smtp:
        token = service.request_password_reset(email)
        if token and not mailer.send(smtp, recipient=email, locale=locale, purpose="reset", token=token):
            with service.engine.begin() as connection:
                connection.execute(delete(password_resets).where(password_resets.c.token_hash == digest(token)))


class MarketingAuthService(AuthService):
    def login(self, *, email: str, password: str, organization_id: str | None = None):
        with self.engine.begin() as connection:
            connection.execute(select(users.c.id).where(users.c.email == email.lower()).with_for_update()).scalar()
            scoped = AuthService(TransactionScope(connection), self.settings, self.audit_hook)
            return scoped.login(email=email, password=password, organization_id=organization_id)

    def refresh(self, refresh_token: str):
        with self.engine.begin() as connection:
            account_id = connection.scalar(select(refresh_sessions.c.user_id).where(
                refresh_sessions.c.token_hash == digest(refresh_token)
            ))
            if not account_id:
                return None
            connection.execute(select(users.c.id).where(users.c.id == account_id).with_for_update()).scalar()
            scoped = AuthService(TransactionScope(connection), self.settings, self.audit_hook)
            return scoped.refresh(refresh_token)

    def reset_password(self, token: str, new_password: str) -> bool:
        # Serialize both the existing bearer route and the browser route by account.
        # gm-auth checks expiry, changes the password, and revokes refresh sessions in this transaction.
        with self.engine.begin() as connection:
            account_id = connection.scalar(select(password_resets.c.user_id).where(password_resets.c.token_hash == digest(token)))
            if not account_id:
                return False
            connection.execute(select(users.c.id).where(users.c.id == account_id).with_for_update()).scalar()
            scoped = AuthService(TransactionScope(connection), self.settings, self.audit_hook)
            if not scoped.reset_password(token, new_password):
                return False
            connection.execute(update(password_resets).where(
                password_resets.c.user_id == account_id, password_resets.c.used_at.is_(None)
            ).values(used_at=datetime.now(timezone.utc)))
            return True
