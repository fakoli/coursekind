"""Authenticated provider preferences, write-only credentials and live model catalogs."""

from fastapi import APIRouter, Depends

from config import get_settings
from dependencies import StorageDep, get_current_user
from exceptions import AIServiceException
from models.ai_preferences import AIPreferencesUpdate, Provider, ValidateCredentialRequest
from models.user import User
from services.ai_preferences_service import AIPreferencesService
from services.anvil_client import check_anvil_health
from services.codex_subscription import CodexSubscription

router = APIRouter()


@router.get("/ai-connection")
async def check_ai_connection(
    user: User = Depends(get_current_user),
) -> dict:
    """Check that the server's Anvil router is configured and reachable.

    Returns the router status so users can verify AI features will work.
    No secrets are exposed.
    """
    settings = get_settings()
    is_valid, message = await check_anvil_health(settings)
    return {
        "provider": "anvil",
        "is_configured": bool(settings.anvil_router_base_url and settings.anvil_router_token),
        "is_reachable": is_valid,
        "model": settings.anvil_model,
        "message": message,
    }


@router.get("/ai-preferences")
async def get_ai_preferences(storage: StorageDep, user: User = Depends(get_current_user)):
    return await AIPreferencesService(storage, get_settings()).get(user.id)


@router.put("/ai-preferences")
async def update_ai_preferences(
    request: AIPreferencesUpdate, storage: StorageDep, user: User = Depends(get_current_user)
):
    return await AIPreferencesService(storage, get_settings()).update(user.id, request)


@router.delete("/ai-preferences/credentials/{provider}")
async def delete_ai_credential(
    provider: Provider, storage: StorageDep, user: User = Depends(get_current_user)
):
    return await AIPreferencesService(storage, get_settings()).delete_credential(user.id, provider)


@router.get("/ai-preferences/models")
async def get_ai_models(
    provider: Provider, storage: StorageDep, user: User = Depends(get_current_user)
):
    try:
        models = await AIPreferencesService(storage, get_settings()).catalog(user.id, provider)
        return {
            "provider": provider,
            "models": models,
            "is_available": True,
            "message": (
                "Configured candidates only; model access requires a successful inference check"
                if provider == "codex_subscription"
                else "Advertised text models; generation availability is checked per request"
            ),
        }
    except AIServiceException as exc:
        return {"provider": provider, "models": [], "is_available": False, "message": exc.message}


@router.post("/ai-preferences/validate")
async def validate_ai_credential(
    request: ValidateCredentialRequest, storage: StorageDep, user: User = Depends(get_current_user)
):
    models = await AIPreferencesService(storage, get_settings()).catalog(
        user.id, request.provider, request.api_key
    )
    if request.provider == "codex_subscription":
        if not request.model or request.model not in models:
            raise AIServiceException(
                "Choose a configured Codex candidate model for the inference check"
            )
        result = await CodexSubscription(get_settings()).complete(
            user.id,
            request.model,
            "Return exactly subscription-check-ok",
            "This is a connection check. Follow the requested response exactly.",
            128,
        )
        if result != "subscription-check-ok":
            raise AIServiceException("Codex inference check returned an unexpected response")
        return {
            "provider": request.provider,
            "is_valid": True,
            "models": models,
            "message": f"Inference check succeeded for {request.model}. "
            "Future requests remain subject to subscription limits.",
        }
    return {
        "provider": request.provider,
        "is_valid": True,
        "models": models,
        "message": "Credential accepted by model catalog. Select a model and save.",
    }
