"""Safe failure categories never copy untrusted provider bodies or exception messages."""

import httpx
import pytest

from config import Settings
from services.ai_provider import ProviderClient, ProviderRequestError, ProviderSnapshot
from services.workspace_runner import failure_guidance


@pytest.mark.parametrize(
    "status, category",
    [(503, "temporarily unavailable"), (429, "rate limited"), (401, "authentication failed")],
)
async def test_safe_http_category(status, category):
    private = "secret-token private lesson personal@example.com"
    client = ProviderClient(
        Settings(_env_file=None),
        transport=httpx.MockTransport(lambda request: httpx.Response(status, text=private)),
    )
    with pytest.raises(ProviderRequestError) as caught:
        await client._request(
            ProviderSnapshot("openai", "synthetic", "secret-token"), "/responses", {}
        )
    kind, message = failure_guidance(caught.value)
    assert kind == "provider"
    assert category in message and str(status) in message
    assert private not in message
    assert "secret-token" not in str(caught.value)
    assert "http" not in message.lower().replace("http " + str(status), "")


def test_internal_failure_does_not_expose_message():
    assert failure_guidance(RuntimeError("secret-token private lesson")) == (
        "internal",
        "Generation could not finish. Retry later; ask the operator if this persists.",
    )
