"""Typed editorial changes; account, progress and sharing fields are never patches."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.module import FlashcardData, QuizData, validate_activity_write


class ResourceTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["course", "module", "path"]
    resource_id: str = Field(min_length=1, max_length=200)
    course_id: str | None = None

    @model_validator(mode="after")
    def module_parent(self):
        if self.kind == "module" and not self.course_id:
            raise ValueError("Module requires course_id")
        return self


class ResourceSnapshot(BaseModel):
    target: ResourceTarget
    fingerprint: str
    fields: dict


class ModuleFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_markdown: str = Field(min_length=1, max_length=200000)
    flashcards: list[FlashcardData] | None = None
    quiz: QuizData | None = None

    @model_validator(mode="after")
    def valid_content(self):
        if not self.content_markdown.strip():
            raise ValueError("Content must not be blank")
        validate_activity_write(self.flashcards, self.quiz)
        return self


class ResourcePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: ResourceTarget
    expected_fingerprint: str
    fields: ModuleFields

    @model_validator(mode="after")
    def supported_target(self):
        if self.target.kind != "module":
            raise ValueError("Only module content patches are supported")
        return self


class ChangeSet(BaseModel):
    id: str
    workspace_id: str
    owner_id: str
    patches: list[ResourcePatch]
    base_snapshots: list[ResourceSnapshot]
    origin_job_id: str | None = None
    status: Literal["ready", "applied"] = "ready"
    revision_id: str | None = None
    created_at: datetime


class Revision(BaseModel):
    id: str
    workspace_id: str
    owner_id: str
    change_id: str
    before: list[ResourceSnapshot]
    after: list[ResourceSnapshot]
    created_at: datetime
