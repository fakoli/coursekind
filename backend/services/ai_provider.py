"""Bounded, fixed-endpoint official HTTP adapters. No environment BYOK fallback."""

from dataclasses import dataclass, field
from urllib.parse import quote

import httpx

from config import Settings
from exceptions import AIServiceException
from services.codex_subscription import CodexSubscription


class ProviderOutputError(AIServiceException):
    """Safe diagnostics for invalid output; never includes source text or credentials."""

    def __init__(self, provider, reason, max_output_tokens):
        super().__init__(
            f"{provider} returned {reason} output. No application credits charged.",
            details={
                "provider": provider,
                "reason": reason,
                "max_output_tokens": max_output_tokens,
            },
        )
        self.reason = reason


@dataclass(frozen=True)
class ProviderSnapshot:
    provider: str
    model: str
    api_key: str = field(repr=False)
    user_id: str | None = field(default=None, repr=False)


class ProviderClient:
    def __init__(self, settings: Settings, transport=None):
        self.settings = settings
        self.transport = transport

    def _connection(self, snapshot):
        if not snapshot.api_key:
            raise AIServiceException("Selected provider has no credential configured")
        if snapshot.provider == "anvil":
            if not self.settings.anvil_router_base_url:
                raise AIServiceException("Anvil is not configured")
            return self.settings.anvil_router_base_url.rstrip("/"), {
                "Authorization": f"Bearer {snapshot.api_key}"
            }
        if snapshot.provider == "openai":
            return "https://api.openai.com/v1", {"Authorization": f"Bearer {snapshot.api_key}"}
        if snapshot.provider == "anthropic":
            return "https://api.anthropic.com/v1", {
                "x-api-key": snapshot.api_key,
                "anthropic-version": "2023-06-01",
            }
        if snapshot.provider == "gemini":
            return "https://generativelanguage.googleapis.com/v1beta", {
                "x-goog-api-key": snapshot.api_key
            }
        raise AIServiceException("Unsupported provider")

    async def _request(self, snapshot, path, payload=None, params=None):
        base, headers = self._connection(snapshot)
        try:
            async with httpx.AsyncClient(
                timeout=300 if payload is not None else 20, transport=self.transport
            ) as client:
                response = await client.request(
                    "POST" if payload is not None else "GET",
                    base + path,
                    headers=headers,
                    json=payload,
                    params=params,
                )
            if response.status_code >= 400:
                raise AIServiceException(
                    f"{snapshot.provider} request failed (HTTP {response.status_code})"
                )
            return response.json()
        except (httpx.HTTPError, ValueError):
            # Provider bodies, URLs and transport exceptions may contain credentials.
            raise AIServiceException(
                f"{snapshot.provider} unavailable or returned invalid data"
            ) from None

    async def models(self, snapshot: ProviderSnapshot) -> list[str]:
        if snapshot.provider == "codex_subscription":
            return await CodexSubscription(self.settings).models(snapshot.user_id)
        result = []
        params = {}
        for _ in range(20):
            data = await self._request(snapshot, "/models", params=params)
            try:
                if snapshot.provider == "gemini":
                    result.extend(
                        m["name"].removeprefix("models/")
                        for m in data.get("models", [])
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                        and not any(
                            x in m["name"].lower() for x in ("image", "tts", "audio", "robotics")
                        )
                    )
                    token = data.get("nextPageToken")
                    if token:
                        params = {"pageToken": token}
                        continue
                else:
                    for model in data["data"]:
                        name = model["id"]
                        if snapshot.provider == "anvil" and name not in (
                            "llm.primary",
                            "llm.secondary",
                            "llm.auxiliary",
                        ):
                            continue
                        if snapshot.provider == "openai":
                            if not name.startswith(
                                ("gpt-", "o1", "o3", "o4", "chatgpt-", "codex-")
                            ):
                                continue
                            if any(
                                x in name
                                for x in (
                                    "audio",
                                    "realtime",
                                    "transcribe",
                                    "tts",
                                    "image",
                                    "search",
                                    "instruct",
                                )
                            ):
                                continue
                        result.append(name)
                    if snapshot.provider == "anthropic" and data.get("has_more"):
                        params = {"after_id": data["last_id"]}
                        continue
                return sorted(set(result))
            except (KeyError, TypeError, AttributeError):
                raise AIServiceException("Provider returned an invalid model catalog") from None
        raise AIServiceException("Provider model catalog exceeded pagination limit")

    async def complete(self, snapshot, prompt, system_prompt, max_tokens=4096):
        p = snapshot.provider
        if p == "codex_subscription":
            return await CodexSubscription(self.settings).complete(
                snapshot.user_id, snapshot.model, prompt, system_prompt, max_tokens
            )
        if p == "openai":
            path = "/responses"
            payload = {
                "model": snapshot.model,
                "input": prompt,
                "instructions": system_prompt,
                "max_output_tokens": max_tokens,
                "store": False,
            }
        elif p == "gemini":
            path = f"/models/{quote(snapshot.model, safe='')}:generateContent"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "generationConfig": {"maxOutputTokens": max_tokens},
            }
        elif p == "anthropic":
            path = "/messages"
            payload = {
                "model": snapshot.model,
                "system": system_prompt,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }
        else:
            path = "/chat/completions"
            payload = {
                "model": snapshot.model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
            }
        data = await self._request(snapshot, path, payload)
        try:
            if p == "openai":
                if data.get("status") != "completed" or data.get("error"):
                    reason = "incomplete" if data.get("status") == "incomplete" else "malformed"
                    raise ProviderOutputError(p, reason, max_tokens)
                parts = [
                    part
                    for item in data["output"]
                    if item.get("type") == "message"
                    for part in item.get("content", [])
                ]
                if any(part.get("type") == "refusal" for part in parts):
                    raise ProviderOutputError(p, "blocked", max_tokens)
                text = "\n".join(
                    part["text"] for part in parts if part.get("type") == "output_text"
                )
            elif p == "gemini":
                candidate = data["candidates"][0]
                if candidate.get("finishReason") != "STOP" or data.get("promptFeedback", {}).get(
                    "blockReason"
                ):
                    reason = {
                        "MAX_TOKENS": "incomplete",
                        "SAFETY": "blocked",
                        "RECITATION": "blocked",
                        "BLOCKLIST": "blocked",
                        "PROHIBITED_CONTENT": "blocked",
                    }.get(candidate.get("finishReason"), "malformed")
                    if data.get("promptFeedback", {}).get("blockReason"):
                        reason = "blocked"
                    raise ProviderOutputError(p, reason, max_tokens)
                text = "\n".join(
                    part["text"]
                    for part in candidate["content"]["parts"]
                    if "text" in part and not part.get("thought")
                )
            elif p == "anthropic":
                if data.get("stop_reason") not in ("end_turn", "stop_sequence"):
                    reason = {"max_tokens": "incomplete", "refusal": "blocked"}.get(
                        data.get("stop_reason"), "malformed"
                    )
                    raise ProviderOutputError(p, reason, max_tokens)
                text = "\n".join(
                    part["text"] for part in data["content"] if part.get("type") == "text"
                )
            else:
                choice = data["choices"][0]
                if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
                    reason = {"length": "incomplete", "content_filter": "blocked"}.get(
                        choice.get("finish_reason"), "malformed"
                    )
                    if choice["message"].get("refusal"):
                        reason = "blocked"
                    raise ProviderOutputError(p, reason, max_tokens)
                text = choice["message"]["content"]
            if not isinstance(text, str):
                raise ValueError()
            if not text.strip():
                raise ProviderOutputError(p, "empty", max_tokens)
            return text.strip()
        except (ValueError, TypeError, AttributeError, KeyError, IndexError):
            raise ProviderOutputError(p, "malformed", max_tokens) from None
