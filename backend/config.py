from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Define paths for hierarchical .env loading
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = Path(__file__).parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(PROJECT_ROOT / ".env"),  # Project root (base config)
            str(BACKEND_DIR / ".env"),   # Backend dir (overrides)
        ),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "Study Buddy"
    debug: bool = False

    # Storage
    storage_backend: Literal["json", "sqlite", "supabase"] = "json"
    storage_path: str = "./data"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        """Reject default secrets in production mode."""
        if not self.debug and self.jwt_secret == "change-me-in-production":
            raise ValueError(
                "JWT_SECRET must be set to a secure value in production (DEBUG=false). "
                "Generate a secure secret with: python -c "
                '"import secrets; print(secrets.token_urlsafe(32))"'
            )
        return self

    # Supabase (optional)
    supabase_url: str | None = None
    supabase_key: str | None = None

    # Email (Mailgun)
    mailgun_api_key: str | None = None
    mailgun_domain: str | None = None

    # SMS (Twilio)
    sms_provider: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_phone_number: str | None = None

    # AI (Anvil Serving router - OpenAI-compatible, self-hosted fleet)
    anvil_router_base_url: str | None = None  # e.g. https://fakoli-dark.tail4378d.ts.net/v1
    anvil_router_token: str | None = None
    ai_credentials_key: str | None = None
    anvil_model: str = "llm.primary"
    # Legacy image setting; application image generation is currently unavailable.
    anvil_image_model: str = "gemini-nano-banana"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
