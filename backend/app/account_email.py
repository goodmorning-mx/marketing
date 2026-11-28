"""Transactional account email over an operator-configured SMTP relay."""

import os
import smtplib
import ssl
from contextlib import contextmanager
from email.message import EmailMessage
from urllib.parse import urlencode, urlsplit

from fastapi import HTTPException


def unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="Account email is temporarily unavailable.")


class AccountEmail:
    def __init__(self, allowed_origins: list[str], environment: str):
        self.origin = os.getenv("ACCOUNT_PUBLIC_ORIGIN", "").rstrip("/")
        self.host = os.getenv("ACCOUNT_SMTP_HOST", "")
        self.sender = os.getenv("ACCOUNT_EMAIL_FROM", "")
        self.mode = os.getenv("ACCOUNT_SMTP_SECURITY", "starttls")
        self.username = os.getenv("ACCOUNT_SMTP_USERNAME", "")
        self.password = os.getenv("ACCOUNT_SMTP_PASSWORD", "")
        try:
            self.port = int(os.getenv("ACCOUNT_SMTP_PORT", "465" if self.mode == "ssl" else "587"))
        except ValueError:
            raise unavailable() from None
        origin = urlsplit(self.origin)
        local = environment == "local" and self.host in {"127.0.0.1", "::1", "localhost"}
        valid_mode = self.mode in {"ssl", "starttls"} or (local and self.mode == "local")
        if (
            not self.host or not self.sender or not valid_mode or not 1 <= self.port <= 65535
            or bool(self.username) != bool(self.password)
            or self.origin not in allowed_origins or origin.scheme != "https"
            or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment
        ):
            raise unavailable()

    @contextmanager
    def connect(self):
        try:
            tls = ssl.create_default_context() if self.mode != "local" else None
            smtp = (
                smtplib.SMTP_SSL(self.host, self.port, context=tls, timeout=5)
                if self.mode == "ssl"
                else smtplib.SMTP(self.host, self.port, timeout=5)
            )
            try:
                if self.mode == "starttls":
                    smtp.starttls(context=tls)
                if self.username:
                    smtp.login(self.username, self.password)
                yield smtp
            finally:
                smtp.close()
        except (OSError, smtplib.SMTPException):
            raise unavailable() from None

    def send(self, smtp, *, recipient: str, locale: str, purpose: str, token: str) -> bool:
        path = "/verify-email/" if purpose == "verify" else "/reset-password/"
        fragment = urlencode({"token": token})
        url = f"{self.origin}{path}?lang={locale}#{fragment}"
        copy = {
            ("verify", "en"): ("Verify your GoodMarketing email", "Use this link to verify your email and set up your workspace. It expires in 30 minutes."),
            ("verify", "es"): ("Verifica tu correo de GoodMarketing", "Usa este enlace para verificar tu correo y crear tu espacio de trabajo. Vence en 30 minutos."),
            ("reset", "en"): ("Reset your GoodMarketing password", "Use this link to choose a new password. It expires in 30 minutes."),
            ("reset", "es"): ("Restablece tu contraseña de GoodMarketing", "Usa este enlace para elegir una nueva contraseña. Vence en 30 minutos."),
        }
        subject, intro = copy[purpose, locale]
        ignore = "Si no lo solicitaste, ignora este mensaje." if locale == "es" else "If you didn't request this, you can ignore this message."
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(f"{intro}\n\n{url}\n\n{ignore}\n")
        try:
            smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            # Recipient-specific failures cannot change a public response and reveal an account.
            return False
        return True
