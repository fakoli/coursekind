"""Anvil Serving client for LLM text generation.

Talks to the self-hosted Anvil router (OpenAI-compatible /v1 API) instead of
pay-per-use providers. The router multiplexes onto the fleet's local models
(e.g. ``llm.primary``), so no external API keys are required.

Configuration comes from Settings:
- ``anvil_router_base_url``: router base URL (e.g. https://fakoli-dark.tail4378d.ts.net/v1)
- ``anvil_router_token``: bearer token for the router endpoint
- ``anvil_model``: route/model id to request (e.g. "llm.primary")
"""

from __future__ import annotations

import time

import httpx

from config import Settings
from exceptions import AIServiceException, ErrorCode
from logging_config import get_logger

logger = get_logger(__name__)

# Default per-request timeout (seconds) for LLM calls.
DEFAULT_TIMEOUT_SECONDS = 300.0


class AnvilClient:
    """Async client for the Anvil router's OpenAI-compatible chat API."""

    def __init__(self, settings: Settings, timeout: float = DEFAULT_TIMEOUT_SECONDS):
        self.settings = settings
        self.timeout = timeout

    @property
    def is_configured(self) -> bool:
        """True when both a base URL and a token are present."""
        return bool(self.settings.anvil_router_base_url and self.settings.anvil_router_token)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.anvil_router_token:
            headers["Authorization"] = f"Bearer {self.settings.anvil_router_token}"
        return headers

    async def complete(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> str:
        """Run a chat completion and return the assistant text.

        Args:
            prompt: The user prompt to send.
            system_prompt: Optional system prompt for context.
            model: Model/route id; defaults to ``settings.anvil_model``.
            max_tokens: Maximum tokens in the response.
            temperature: Sampling temperature.

        Raises:
            AIServiceException: If the client is unconfigured or the call fails.
        """
        if not self.is_configured:
            logger.error("Anvil client not configured: missing base URL or token")
            raise AIServiceException(
                "AI service not configured: ANVIL_ROUTER_BASE_URL and "
                "ANVIL_ROUTER_TOKEN required",
                code=ErrorCode.AI_SERVICE_UNAVAILABLE,
            )

        model = model or self.settings.anvil_model
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        url = f"{self.settings.anvil_router_base_url.rstrip('/')}/chat/completions"
        start_time = time.perf_counter()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload, headers=self._headers())
                duration_ms = (time.perf_counter() - start_time) * 1000

                if response.status_code == 401 or response.status_code == 403:
                    logger.error(
                        "Anvil router rejected credentials",
                        status_code=response.status_code,
                        duration_ms=round(duration_ms, 2),
                    )
                    raise AIServiceException(
                        f"AI service authentication failed (HTTP {response.status_code})",
                        code=ErrorCode.AI_SERVICE_UNAVAILABLE,
                    )

                if response.status_code == 429:
                    logger.error(
                        "Anvil router rate limit exceeded",
                        duration_ms=round(duration_ms, 2),
                    )
                    raise AIServiceException("AI service rate limit exceeded")

                if response.status_code >= 400:
                    logger.error(
                        "Anvil router error",
                        status_code=response.status_code,
                        duration_ms=round(duration_ms, 2),
                    )
                    raise AIServiceException(
                        f"AI service error (HTTP {response.status_code})",
                        code=ErrorCode.AI_SERVICE_ERROR,
                    )

                data = response.json()
                content = data["choices"][0]["message"]["content"] or ""

                if (
                    not isinstance(content, str)
                    or not content.strip()
                    or data["choices"][0].get("finish_reason") in ("length", "content_filter")
                ):
                    raise AIServiceException("AI service returned empty or incomplete output")

                usage = data.get("usage") or {}
                logger.info(
                    "Anvil completion completed",
                    model=model,
                    duration_ms=round(duration_ms, 2),
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"),
                )
                return content

        except httpx.ConnectError as e:
            logger.error(
                "Failed to connect to Anvil router",
                error_type=type(e).__name__,
                base_url=self.settings.anvil_router_base_url,
            )
            raise AIServiceException(
                "Failed to connect to AI service",
                code=ErrorCode.AI_SERVICE_UNAVAILABLE,
            )
        except (httpx.TimeoutException, httpx.HTTPError) as e:
            logger.error("Anvil router request failed", error_type=type(e).__name__)
            raise AIServiceException("AI service request failed")
        except (KeyError, IndexError, ValueError) as e:
            logger.error("Unexpected Anvil response shape", error_type=type(e).__name__)
            raise AIServiceException(
                "AI service returned an unexpected response",
                code=ErrorCode.AI_SERVICE_ERROR,
            )


    async def generate_image(
        self,
        prompt: str,
        model: str | None = "vision.general",
        max_tokens: int = 4096,
    ) -> str:
        """Ask the vision-capable tier to produce an image.

        The Anvil router's ``vision.*`` tiers are multimodal (image input AND
        output). This sends a text prompt and returns whatever content the
        model produces (text description or image data) so callers can decide
        how to persist it.

        Args:
            prompt: The image generation prompt.
            model: Vision route id; defaults to ``vision.general``.
            max_tokens: Maximum tokens in the response.

        Raises:
            AIServiceException: If the client is unconfigured or the call fails.
        """
        if not self.is_configured:
            raise AIServiceException(
                "AI service not configured: ANVIL_ROUTER_BASE_URL and "
                "ANVIL_ROUTER_TOKEN required",
                code=ErrorCode.AI_SERVICE_UNAVAILABLE,
            )

        url = f"{self.settings.anvil_router_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
        }
        start_time = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload, headers=self._headers())
                duration_ms = (time.perf_counter() - start_time) * 1000
                if response.status_code >= 400:
                    logger.error(
                        "Anvil vision call failed",
                        status_code=response.status_code,
                        duration_ms=round(duration_ms, 2),
                    )
                    raise AIServiceException(
                        "Image generation failed (HTTP "
                        f"{response.status_code})",
                        code=ErrorCode.AI_SERVICE_ERROR,
                    )
                data = response.json()
                message = data["choices"][0]["message"]
                content = message.get("content")
                if isinstance(content, list):
                    # Multimodal parts: prefer image part, else join text parts.
                    for part in content:
                        if part.get("type") == "image_url":
                            return str(part.get("image_url", {}).get("url", ""))
                    return "\n".join(
                        p.get("text", "") for p in content if p.get("type") == "text"
                    )
                return content or ""
        except httpx.HTTPError as e:
            logger.error("Anvil vision request failed", error_type=type(e).__name__)
            raise AIServiceException("Image generation request failed")


_client_instance: AnvilClient | None = None


def get_anvil_client(settings: Settings | None = None) -> AnvilClient:
    """Get (or create) the shared Anvil client instance."""
    global _client_instance
    if settings is not None:
        return AnvilClient(settings)
    if _client_instance is None:
        from config import get_settings

        _client_instance = AnvilClient(settings or get_settings())
    return _client_instance


async def check_anvil_health(settings: Settings) -> tuple[bool, str]:
    """Probe the router's /models endpoint to verify configuration.

    Returns:
        Tuple of (is_valid, message).
    """
    if not settings.anvil_router_base_url or not settings.anvil_router_token:
        return False, "Anvil router not configured (missing base URL or token)"

    url = f"{settings.anvil_router_base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {settings.anvil_router_token}"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return True, "Anvil router is reachable and authenticated"
        if response.status_code in (401, 403):
            return False, f"Anvil router rejected credentials (HTTP {response.status_code})"
        return False, f"Anvil router returned HTTP {response.status_code}"
    except httpx.HTTPError as e:
        logger.error("Anvil health check failed", error_type=type(e).__name__)
        return False, "Anvil router unreachable"


__all__ = ["AnvilClient", "get_anvil_client", "check_anvil_health"]
