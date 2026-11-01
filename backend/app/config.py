from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(Path(__file__).resolve().parents[2] / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    AUTH_REQUIRED: bool = True
    VERCEL: str = ""
    APP_ORIGIN: str = "http://localhost:5173"
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: SecretStr | None = None
    SESSION_SECRET: SecretStr | None = None

    @field_validator("APP_ORIGIN")
    @classmethod
    def valid_app_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("APP_ORIGIN must be an exact origin without a trailing slash")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("Public APP_ORIGIN must use HTTPS")
        return value

    GROQ_API_KEY: SecretStr | None = None
    GROQ_MODEL: str = "qwen/qwen3.8-27b"
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    MAX_REQUEST_BYTES: int = Field(default=6_291_456, ge=1024, le=16_777_216)
    API_REQUESTS_PER_MINUTE: int = Field(default=240, ge=1, le=10000)

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def exact_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or "*" in origin or parsed.path or parsed.query or parsed.fragment or parsed.username:
                raise ValueError("ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or wildcards")
        return origins


settings = Settings()

