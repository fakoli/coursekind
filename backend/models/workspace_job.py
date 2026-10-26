"""Public jobs omit private validated inputs, staged outputs and provider credentials."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.workspace_change import ResourceSnapshot, ResourceTarget

JobState = Literal["queued", "running", "ready", "partial", "failed", "cancelled", "interrupted"]


class MutationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)


class BuildRequest(MutationRequest):
    module_ids: list[str] = Field(min_length=1, max_length=3)
    generate_flashcards: bool = True
    flashcard_count: int = Field(default=5, ge=1, le=20)
    generate_quiz: bool = True
    quiz_question_count: int = Field(default=3, ge=1, le=10)

    @model_validator(mode="after")
    def unique_modules(self):
        if len(set(self.module_ids)) != len(self.module_ids) or any(not i for i in self.module_ids):
            raise ValueError("Select distinct modules")
        return self


class RetryRequest(MutationRequest):
    step_ids: list[str] = Field(min_length=1, max_length=3)


class JobStep(BaseModel):
    id: str
    target: ResourceTarget | None = None
    attempt: int = 1
    state: JobState = "queued"
    credits: int = 0
    finalize_only: bool = False
    operation_credits: int = 0
    provider: str = ""
    model: str = ""
    output_ref: str | None = None
    safe_error: str | None = None
    source_snapshots: list[ResourceSnapshot] = Field(default_factory=list)


class WorkspaceJob(BaseModel):
    id: str
    workspace_id: str
    owner_id: str
    kind: Literal["plan", "build", "revision"]
    provider: str
    model: str
    state: JobState = "queued"
    steps: list[JobStep]
    created_at: datetime
    updated_at: datetime
