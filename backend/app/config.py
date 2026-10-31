from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    GEMINI_API_KEY: SecretStr | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    GEMINI_FALLBACK_MODEL: str = "gemini-2.5-flash-lite"
    GOOGLE_PLACES_API_KEY: SecretStr | None = None
    GOOGLE_PLACES_RPM_LIMIT: int = 5
    GOOGLE_PLACES_DAILY_LIMIT: int = 100
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    MAX_UPLOAD_BYTES: int = 5_242_880
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

