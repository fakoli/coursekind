"""Private workspace lifecycle contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkspaceBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(min_length=1, max_length=4000)
    scope: Literal["course", "path"] = "course"
    prior_knowledge: str = Field(default="", max_length=4000)
    audience: str = Field(default="", max_length=1000)
    weekly_hours: float | None = Field(default=None, ge=0, le=168, allow_inf_nan=False)
    generate_flashcards: bool = True
    flashcard_count: int = Field(default=5, ge=1, le=20)
    generate_quiz: bool = True
    quiz_question_count: int = Field(default=3, ge=1, le=10)

    @field_validator("goal", mode="before")
    @classmethod
    def trim_goal(cls, value):
        return value.strip() if isinstance(value, str) else value


class Workspace(BaseModel):
    id: str
    owner_id: str
    brief: WorkspaceBrief
    archived: bool = False
    version: int = 1
    course_ids: list[str] = Field(default_factory=list)
    path_id: str | None = None
    created_at: datetime
    updated_at: datetime


class WorkspaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)
    brief: WorkspaceBrief
    source_course_id: str | None = None
    source_path_id: str | None = None

    @model_validator(mode="after")
    def one_source(self):
        if self.source_course_id is not None and self.source_path_id is not None:
            raise ValueError("Choose one source course or path")
        return self


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)
    expected_version: int = Field(ge=1)
    brief: WorkspaceBrief | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def has_change(self):
        if self.brief is None and self.archived is None:
            raise ValueError("Provide a brief or archive state")
        return self
