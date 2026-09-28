from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = Field(default="GoodMorning MVP Template API", alias="APP_NAME")
    app_env: str = Field(default="local", alias="APP_ENV")
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")
    database_url: str = Field(
        default="postgresql+psycopg://goodmorning:goodmorning_local_password@localhost:5432/goodmorning_mvp",
        alias="DATABASE_URL",
    )
    meta_client_id: str = Field(default="", alias="META_CLIENT_ID")
    meta_client_secret: str = Field(default="", alias="META_CLIENT_SECRET")
    meta_redirect_uri: str = Field(default="", alias="META_REDIRECT_URI")
    auth_secret: str = Field(default="", alias="AUTH_SECRET")
    # Backward-compatible name used by the first marketing deployment.
    legacy_jwt_secret: str = Field(default="", alias="JWT_SECRET")

    @property
    def jwt_secret(self) -> str:
        """Return the Factory-standard secret, with legacy fallback."""
        return self.auth_secret or self.legacy_jwt_secret

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
