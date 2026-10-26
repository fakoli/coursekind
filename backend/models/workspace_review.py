"""Bounded explicit advisory review; never an authorization or assessment result."""

import math
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.workspace_change import ResourceSnapshot, ResourceTarget, StrictModel

DIMENSIONS = frozenset({"answer_supported", "answer_ambiguous", "objective_aligned"})


class MaterialReviewRequest(StrictModel):
    request_id: str = Field(min_length=1, max_length=200)
    change_id: str | None = None
    target: ResourceTarget
    question_index: int = Field(ge=0, strict=True)
    lesson_excerpt: str = Field(min_length=1, max_length=8000)
    objective: str = Field(min_length=1, max_length=1000)
    expected_fingerprint: str = Field(min_length=1)
    expected_revision_marker: str = Field(min_length=1)
    refresh: bool = False


class JevResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: Literal["jev-1.14.0"]
    dimensions: dict[str, float]
    input_tokens: int = Field(ge=0, strict=True)
    output_tokens: int = Field(ge=0, strict=True)

    @field_validator("dimensions", mode="before")
    @classmethod
    def strict_dimensions(cls, value):
        if (
            not isinstance(value, dict)
            or set(value) != DIMENSIONS
            or any(
                type(v) not in (int, float) or not 0 <= v <= 1 or not math.isfinite(v)
                for v in value.values()
            )
        ):
            raise ValueError("Invalid advisory dimensions")
        return value


class ReviewUsage(BaseModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class MaterialReview(BaseModel):
    id: str
    state: Literal["ready", "unavailable", "stale"]
    model: str
    prompt_version: str
    content_hash: str
    revision_marker: str
    dimensions: dict[str, float] | None = None
    usage: ReviewUsage | None = None
    created_at: datetime
    safe_error: str | None = None


class ReviewSource(BaseModel):
    snapshot: ResourceSnapshot
    revision_marker: str
    change_id: str | None = None


class ReviewSources(BaseModel):
    configured: bool
    sources: list[ReviewSource]
