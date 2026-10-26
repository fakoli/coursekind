import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from exceptions import ErrorCode, StudyBuddyException
from logging_config import get_logger, set_request_id, setup_logging

settings = get_settings()

# Configure logging
setup_logging(debug=settings.debug)
logger = get_logger(__name__)

app = FastAPI(
    title=settings.app_name,
    description="A learning platform for visual learners who learn by doing",
    version="0.1.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log all requests with timing and correlation ID."""
    # Set request ID (use existing or generate new)
    request_id = request.headers.get("X-Request-ID")
    request_id = set_request_id(request_id)

    start_time = time.perf_counter()

    # Log request
    client_ip = request.client.host if request.client and getattr(request.client, "host", None) else "unknown"
    logger.info(
        f"Request started: {request.method} {request.url.path}",
        method=request.method,
        path=request.url.path,
        client=client_ip,
    )

    try:
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Log response
        logger.info(
            f"Request completed: {request.method} {request.url.path} -> {response.status_code}",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )

        # Add request ID to response headers for tracing
        response.headers["X-Request-ID"] = request_id

        return response

    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path}",
            method=request.method,
            path=request.url.path,
            duration_ms=round(duration_ms, 2),
            error=str(e),
        )
        # Re-raise so the outer ServerErrorMiddleware (which owns the
        # exception handlers) can convert this into a proper 500 response.
        # We must NOT swallow it here: a response built inside this
        # middleware's except would short-circuit the error contract.
        raise e


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """Retain field diagnostics without echoing unvalidated credentials or request bodies."""
    # SecretStr cannot protect a missing sibling field's raw input object. Rebuild
    # the public errors instead of serializing exc/errors/body. Even custom
    # validator messages can interpolate secrets, so use input-independent text.
    messages = {
        "missing": "Field required",
        "string_type": "Input should be a valid string",
        "string_too_short": "Text is shorter than the allowed minimum",
        "string_too_long": "Text exceeds the allowed maximum",
        "string_pattern_mismatch": "Text does not match the required format",
        "literal_error": "Select a supported value",
        "enum": "Select a supported value",
        "json_invalid": "Request body must be valid JSON",
        "model_attributes_type": "Input should be a valid object",
        "dict_type": "Input should be a valid object",
        "list_type": "Input should be a valid list",
        "int_type": "Input should be a valid integer",
        "int_parsing": "Input should be a valid integer",
        "bool_type": "Input should be a valid boolean",
        "bool_parsing": "Input should be a valid boolean",
    }
    errors = [
        {
            "loc": error["loc"],
            "type": error["type"],
            "msg": messages.get(error["type"], "Input does not satisfy this field's validation rules"),
        }
        for error in exc.errors()
    ]
    logger.warning(
        "Request validation failed",
        status_code=422,
        error_code=ErrorCode.VALIDATION_ERROR.value,
        error_count=len(errors),
        path=request.url.path,
        method=request.method,
    )
    # Preserve FastAPI's detail-list shape; omit input, ctx, body and exception text.
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(StudyBuddyException)
async def study_buddy_exception_handler(request: Request, exc: StudyBuddyException):
    """Handle StudyBuddyException with structured error responses.

    Supports legacy format via X-Error-Format: legacy header for backward compatibility.
    """
    # Log server errors (5xx) at ERROR level with full context
    if exc.status_code >= 500:
        logger.error(
            f"Server error: {exc.message}",
            status_code=exc.status_code,
            error_code=exc.code.value if exc.code else ErrorCode.INTERNAL_ERROR.value,
            error_details=exc.details,
            path=request.url.path,
            method=request.method,
        )
    elif exc.status_code >= 400:
        # Log client errors at WARNING level
        logger.warning(
            f"Client error: {exc.message}",
            status_code=exc.status_code,
            error_code=exc.code.value if exc.code else None,
            path=request.url.path,
            method=request.method,
        )

    # Check for legacy format header
    error_format = request.headers.get("X-Error-Format", "").lower()

    if error_format == "legacy":
        # Backward compatible format
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )

    # New structured error format
    error_response = {
        "error": {
            "code": exc.code.value if exc.code else ErrorCode.INTERNAL_ERROR.value,
            "message": exc.message,
        }
    }

    if exc.details:
        error_response["error"]["details"] = exc.details

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Handle any unhandled exception with a structured 500 response.

    Without this, FastAPI's default behaviour lets raw exceptions escape as
    `{"detail": "Internal Server Error"}` (or, via httpx ASGITransport tests,
    as raised transport exceptions) — inconsistent with the structured
    `{"error": {...}}` contract every other error follows (see .tickets/003).
    Never leak the exception message to clients; log it with full context.
    """
    logger.error(
        "Unhandled exception",
        path=request.url.path,
        method=request.method,
    )
    logger.exception(exc)

    error_format = request.headers.get("X-Error-Format", "").lower()
    content: dict = {
        "error": {
            "code": ErrorCode.INTERNAL_ERROR.value,
            "message": "An unexpected error occurred",
        }
    }
    if error_format == "legacy":
        content = {"detail": "An unexpected error occurred"}

    return JSONResponse(status_code=500, content=content)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name}


@app.get("/__force_500")
async def force_500():
    """Test-only route that raises, to exercise the generic exception handler.

    Registered only when DEBUG is true (never in production).
    """
    if not settings.debug:  # pragma: no cover - prod guard
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")
    raise RuntimeError("Forced 500 for exception-handler test")


# Import and register routers
from api.routes import auth, progress, references, ai, notifications
from api.routes import courses, learning_paths, modules, uploads, generation
from api.routes import user_settings, admin, flashcard_ratings, workspaces

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(user_settings.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(progress.router, prefix="/api/v1/progress", tags=["progress"])
app.include_router(references.router, prefix="/api/v1/references", tags=["references"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])

# Course authoring system routes
app.include_router(courses.router, prefix="/api/v1/courses", tags=["courses"])
app.include_router(learning_paths.router, prefix="/api/v1/paths", tags=["learning-paths"])
app.include_router(modules.router, prefix="/api/v1/courses", tags=["modules"])
app.include_router(uploads.router, prefix="/api/v1/uploads", tags=["uploads"])
app.include_router(generation.router, prefix="/api/v1", tags=["generation"])

# Admin routes
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])

# Flashcard ratings routes
app.include_router(flashcard_ratings.router, prefix="/api/v1", tags=["flashcard-ratings"])
app.include_router(flashcard_ratings.feedback_router, prefix="/api/v1", tags=["flashcard-ratings"])

app.include_router(workspaces.router, prefix="/api/v1/workspaces", tags=["workspaces"])
