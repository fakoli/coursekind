"""Strict bounds apply to proposals, never to existing library resources."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.workspace import Workspace
from models.workspace_change import ResourceSnapshot


class PlannedModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    temp_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=4000)
    objectives: list[str] = Field(max_length=20)


class NewCourseNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["new"] = "new"
    temp_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=4000)
    difficulty: Literal["beginner", "intermediate", "advanced"] = "beginner"
    modules: list[PlannedModule] = Field(min_length=1, max_length=6)


class ReuseCourseNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["reuse"] = "reuse"
    course_id: str = Field(min_length=1, max_length=200)


class WorkspacePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["course", "path"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=4000)
    assumptions: list[str] = Field(default_factory=list, max_length=20)
    courses: list[Annotated[NewCourseNode | ReuseCourseNode, Field(discriminator="kind")]] = Field(
        min_length=1, max_length=3
    )

    @model_validator(mode="after")
    def bounds(self):
        if self.scope == "course" and len(self.courses) != 1:
            raise ValueError("Course scope requires exactly one course")
        ids, reused = [], []
        for course in self.courses:
            if course.kind == "new":
                ids.extend([course.temp_id, *[m.temp_id for m in course.modules]])
                if not course.title.strip() or any(not m.title.strip() for m in course.modules):
                    raise ValueError("Titles must not be blank")
            else:
                reused.append(course.course_id)
        if len(ids) != len(set(ids)) or len(reused) != len(set(reused)) or set(ids) & set(reused):
            raise ValueError("Identifiers must be unique")
        if not self.title.strip():
            raise ValueError("Title must not be blank")
        return self


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)
    instruction: str = Field(default="", max_length=4000)
    reuse_course_ids: list[str] = Field(default_factory=list, max_length=3)
    previous_proposal_id: str | None = None


class PlanProposal(BaseModel):
    id: str
    workspace_id: str
    owner_id: str
    version: int = 1
    plan: WorkspacePlan
    base_workspace_version: int
    base_snapshots: list[ResourceSnapshot]
    status: Literal["ready", "applied"] = "ready"
    job_id: str | None = None
    applied_ids: dict[str, str] = Field(default_factory=dict)
    applied_workspace: Workspace | None = None
    reuse_course_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class ApplyPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)
    expected_proposal_version: int = Field(ge=1)


class PlanUpdateRequest(ApplyPlanRequest):
    plan: WorkspacePlan
