"""Protected operator commands for temporary Marketing DEV accounts.

Run only inside the API image with an interactive TTY. Passwords are requested
through getpass and are never accepted as command-line arguments.
"""

import argparse
import getpass
import json
import os
import secrets
import sys
import warnings
from uuid import uuid4

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import create_engine, text

from gm_auth import AuthService, AuthSettings

from app.self_service import MarketingAuthService, OWNER_PERMISSIONS, TransactionScope


class DevAccountError(Exception):
    """A safe, user-facing command error with no credential material."""


def require_dev_environment(environ=None) -> str:
    env = os.environ if environ is None else environ
    if env.get("APP_ENV") != "dev":
        raise DevAccountError("This command is available only when APP_ENV=dev.")
    if env.get("ACCOUNT_DEV_MANUAL_ACCESS") != "true":
        raise DevAccountError("Enable ACCOUNT_DEV_MANUAL_ACCESS=true for Marketing DEV first.")
    database_url = env.get("DATABASE_URL", "")
    if not database_url:
        raise DevAccountError("DATABASE_URL is required.")
    return database_url


def _normalized_identity(email_value: str, name_value: str, workspace_value: str):
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email_value)).lower()
    except ValidationError:
        raise DevAccountError("Enter a valid email address.") from None
    name, workspace = name_value.strip(), workspace_value.strip()
    if not 1 <= len(name) <= 100 or not 1 <= len(workspace) <= 100:
        raise DevAccountError("Name and workspace name must each contain 1 to 100 characters.")
    return email, name, workspace


def _password() -> str:
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise DevAccountError("Run this command from an interactive terminal to enter the password securely.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            first = getpass.getpass("Password (input hidden): ")
            second = getpass.getpass("Confirm password (input hidden): ")
    except getpass.GetPassWarning:
        raise DevAccountError("Secure hidden password input is unavailable in this terminal.") from None
    if first != second:
        raise DevAccountError("The passwords did not match.")
    if not 8 <= len(first) <= 128:
        raise DevAccountError("Password must contain 8 to 128 characters.")
    return first


def _auth_settings() -> AuthSettings:
    # Operator commands need gm-auth password hashing/reset semantics, not a
    # persistent signing key. No configured application secret is read here.
    return AuthSettings(jwt_secret=secrets.token_urlsafe(48), issuer="goodmarketing")


def _user_by_email(connection, email: str, *, lock: bool = False):
    suffix = " FOR UPDATE" if lock else ""
    rows = connection.execute(text(
        "SELECT id, name, is_active FROM gm_auth_users WHERE lower(email) = :email" + suffix
    ), {"email": email}).mappings().all()
    if len(rows) > 1:
        raise DevAccountError("Multiple existing accounts match this email; no changes were made.")
    return rows[0] if rows else None


def _tracked_workspace(connection, user_id: str, *, lock: bool = False):
    suffix = " FOR UPDATE OF p" if lock else ""
    return connection.execute(text("""
        SELECT p.organization_id, p.display_name, o.name AS organization_name, m.roles
        FROM goodmarketing_workspace_profiles p
        JOIN gm_auth_organizations o ON o.id = p.organization_id
        LEFT JOIN gm_auth_memberships m
          ON m.organization_id = p.organization_id AND m.user_id = p.dev_managed_owner_user_id
        WHERE p.dev_managed_owner_user_id = :user_id
    """ + suffix), {"user_id": user_id}).mappings().all()


def _roles(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return []
    return value or []


def _advisory_lock(connection, key: str):
    connection.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key})


def _validate_retry(connection, existing, *, name: str, workspace: str, lock: bool = False):
    tracked = _tracked_workspace(connection, str(existing["id"]), lock=lock)
    if len(tracked) != 1:
        raise DevAccountError("An existing, unmanaged, or ambiguous account already uses this email.")
    if not existing["is_active"]:
        raise DevAccountError("The tracked DEV account is inactive; operator assistance is required.")
    row = tracked[0]
    memberships = connection.execute(text(
        "SELECT organization_id FROM gm_auth_memberships WHERE user_id = :user_id"
    ), {"user_id": existing["id"]}).all()
    if (existing["name"] != name or row["display_name"] != workspace
            or row["organization_name"] != workspace
            or len(memberships) != 1 or str(memberships[0][0]) != str(row["organization_id"])
            or "owner" not in _roles(row["roles"])):
        raise DevAccountError("The existing account does not match its DEV provisioning record; no changes were made.")


def provision(engine, *, email_value: str, name_value: str, workspace_value: str) -> str:
    email, name, workspace = _normalized_identity(email_value, name_value, workspace_value)
    # Preflight existing identities in a short transaction so a password
    # prompt never holds a database or advisory lock.
    with engine.begin() as connection:
        existing = _user_by_email(connection, email)
        if existing:
            _validate_retry(connection, existing, name=name, workspace=workspace)
            return "This DEV account is already provisioned; no changes were made."

    password = _password()

    # The shared signup lock serializes with self-service verification. Recheck
    # after the hidden prompt before creating anything.
    with engine.begin() as connection:
        _advisory_lock(connection, f"signup:{email}")
        existing = _user_by_email(connection, email, lock=True)
        if existing:
            _validate_retry(connection, existing, name=name, workspace=workspace, lock=True)
            return "This DEV account is already provisioned; no changes were made."
        organization_id = str(uuid4())
        service = AuthService(TransactionScope(connection), _auth_settings())
        service.create_organization(organization_id=organization_id, slug=organization_id, name=workspace)
        service.create_user(email=email, name=name, password=password, organization_id=organization_id,
                            roles={"owner"}, permissions=OWNER_PERMISSIONS)
        created = _user_by_email(connection, email)
        if not created or created["name"] != name:
            raise DevAccountError("The account could not be verified after provisioning; no changes were committed.")
        connection.execute(text("""
            INSERT INTO goodmarketing_workspace_profiles
              (organization_id, display_name, dev_managed_owner_user_id)
            VALUES (:organization_id, :display_name, :user_id)
        """), {"organization_id": organization_id, "display_name": workspace, "user_id": created["id"]})
    return "DEV owner account and workspace provisioned."


def change_password(engine, *, email_value: str) -> str:
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email_value)).lower()
    except ValidationError:
        raise DevAccountError("Enter a valid email address.") from None
    with engine.begin() as connection:
        existing = _user_by_email(connection, email)
        if not existing:
            raise DevAccountError("No tracked DEV-managed account matches that identity.")
        tracked = _tracked_workspace(connection, str(existing["id"]))
        if len(tracked) != 1 or "owner" not in _roles(tracked[0]["roles"]):
            raise DevAccountError("No tracked DEV-managed owner account matches that identity.")
        if not existing["is_active"]:
            raise DevAccountError("The tracked DEV account is inactive; password changes are unavailable.")
        target_user_id = str(existing["id"])
        target_workspace_id = str(tracked[0]["organization_id"])
    password = _password()
    with engine.begin() as connection:
        _advisory_lock(connection, f"account-password:{email}")
        existing = _user_by_email(connection, email, lock=True)
        if (not existing or not existing["is_active"]
                or str(existing["id"]) != target_user_id):
            raise DevAccountError("No active tracked DEV-managed owner account matches that identity.")
        tracked = _tracked_workspace(connection, str(existing["id"]), lock=True)
        if (len(tracked) != 1 or str(tracked[0]["organization_id"]) != target_workspace_id
                or "owner" not in _roles(tracked[0]["roles"])):
            raise DevAccountError("No tracked DEV-managed owner account matches that identity.")
        # Use gm-auth's one-time reset-token path inside this transaction. The
        # token stays in process memory, is never returned or logged, and the
        # Marketing wrapper revokes every refresh session on consumption.
        service = MarketingAuthService(TransactionScope(connection), _auth_settings())
        token = service.request_password_reset(email)
        if not token or not service.reset_password(token, password):
            raise DevAccountError("The DEV password change could not be completed.")
    return "DEV account password changed; refresh sessions were revoked. Existing access tokens can remain valid for up to 15 minutes."


def _parser():
    parser = argparse.ArgumentParser(description="Provision or change a tracked Marketing DEV owner account.")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    create = subparsers.add_parser("provision", help="Create one DEV owner and workspace.")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--workspace-name", required=True)
    password = subparsers.add_parser("password", help="Change a tracked DEV account password.")
    password.add_argument("--email", required=True)
    return parser


def main(argv=None) -> int:
    args = _parser().parse_args(argv)
    try:
        database_url = require_dev_environment()
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        engine = create_engine(database_url, pool_pre_ping=True, hide_parameters=True)
    except DevAccountError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except Exception:
        print("Could not prepare the DEV account command.", file=sys.stderr)
        return 2

    try:
        if args.operation == "provision":
            message = provision(engine, email_value=args.email, name_value=args.name, workspace_value=args.workspace_name)
        else:
            message = change_password(engine, email_value=args.email)
        print(message)
        return 0
    except DevAccountError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (KeyboardInterrupt, EOFError):
        print("DEV account command cancelled; no credentials were printed.", file=sys.stderr)
        return 2
    except Exception:
        print("DEV account command failed; no credentials were printed.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
