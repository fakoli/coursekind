"""Public AI preference inputs. Credentials are write-only."""

from typing import Literal

from pydantic import BaseModel, Field, SecretStr

Provider = Literal["anvil", "openai", "gemini", "anthropic", "codex_subscription"]


class AIPreferencesUpdate(BaseModel):
    provider: Provider
    model: str = Field(min_length=1, max_length=200, pattern=r"^[a-zA-Z0-9._:/-]+$")
    api_key: SecretStr | None = None


class ValidateCredentialRequest(BaseModel):
    provider: Provider
    model: str | None = Field(default=None, max_length=200, pattern=r"^[a-zA-Z0-9._:/-]+$")
    api_key: SecretStr | None = None
