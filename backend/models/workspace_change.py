"""Strict editorial proposals. Personal, access and accounting data are never patches."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from models.module import FlashcardData, QuizData, QuizQuestionData, validate_activity_write


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResourceTarget(StrictModel):
    kind: Literal["course", "module", "path"]
    resource_id: str = Field(min_length=1, max_length=200)
    course_id: str | None = None

    @model_validator(mode="after")
    def module_parent(self):
        if self.kind == "module" and not self.course_id:
            raise ValueError("Module requires course_id")
        if self.kind != "module" and self.course_id is not None:
            raise ValueError("Only module targets have course_id")
        return self


class ResourceSnapshot(BaseModel):
    target: ResourceTarget
    fingerprint: str
    fields: dict


class StrictCard(FlashcardData):
    model_config = ConfigDict(extra="forbid")


class StrictQuestion(QuizQuestionData):
    model_config = ConfigDict(extra="forbid")


class StrictQuiz(QuizData):
    model_config = ConfigDict(extra="forbid")
    questions: list[StrictQuestion] = Field(default_factory=list)


class ModuleFields(StrictModel):
    # Empty lesson / null quiz are valid historical states for compensating restore.
    content_markdown: str | None = Field(default=None, max_length=200000)
    flashcards: list[StrictCard] | None = None
    quiz: StrictQuiz | None = None

    @model_validator(mode="before")
    @classmethod
    def native_models(cls, data):
        data = dict(data)
        if data.get("flashcards") is not None:
            data["flashcards"] = [
                c.model_dump() if isinstance(c, BaseModel) else c for c in data["flashcards"]
            ]
        if isinstance(data.get("quiz"), BaseModel):
            data["quiz"] = data["quiz"].model_dump()
        return data

    @model_validator(mode="after")
    def valid_content(self):
        if not self.model_fields_set:
            raise ValueError("Select editorial fields")
        if "content_markdown" in self.model_fields_set and self.content_markdown is None:
            raise ValueError("Lesson cannot be null")
        if "flashcards" in self.model_fields_set and self.flashcards is None:
            raise ValueError("Cards cannot be null")
        validate_activity_write(self.flashcards, self.quiz)
        return self


class OutlineItem(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    objectives: list[str] = Field(default_factory=list)
    order_index: int = Field(ge=0)


class CourseFields(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    tags: list[str] | None = None
    outline: list[OutlineItem] | None = None

    @model_validator(mode="after")
    def valid_fields(self):
        if not self.model_fields_set or any(
            getattr(self, k) is None for k in self.model_fields_set - {"description"}
        ):
            raise ValueError("Select non-null editorial fields")
        if "outline" in self.model_fields_set and self.model_fields_set != {"outline"}:
            raise ValueError("Outline and metadata changes must be separate")
        return self


class PathFields(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    course_ids: list[str] | None = None

    @model_validator(mode="after")
    def valid_fields(self):
        if not self.model_fields_set or any(
            getattr(self, k) is None for k in self.model_fields_set - {"description"}
        ):
            raise ValueError("Select non-null editorial fields")
        if self.course_ids is not None and (
            len(set(self.course_ids)) != len(self.course_ids) or any(not i for i in self.course_ids)
        ):
            raise ValueError("Select distinct course IDs")
        return self


class ResourcePatch(StrictModel):
    target: ResourceTarget
    expected_fingerprint: str = Field(min_length=1)
    fields: ModuleFields | CourseFields | PathFields

    @model_validator(mode="before")
    @classmethod
    def typed_fields(cls, data):
        data = dict(data)
        target = ResourceTarget.model_validate(data["target"])
        schema = {"module": ModuleFields, "course": CourseFields, "path": PathFields}[target.kind]
        fields = data["fields"]
        if isinstance(fields, BaseModel):
            fields = fields.model_dump(mode="json", exclude_unset=True)
        data["fields"] = schema.model_validate(fields)
        return data

    @field_serializer("fields")
    def serialize_fields(self, value):
        return value.model_dump(mode="json", exclude_unset=True)


class RevisionRequest(StrictModel):
    request_id: str = Field(min_length=1, max_length=200)
    target: ResourceTarget
    scope: Literal[
        "course_metadata", "course_outline", "lesson", "flashcards", "quiz", "path_references"
    ]
    instruction: str = Field(min_length=1, max_length=4000)
    count: int | None = None
    reuse_course_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def scope_target(self):
        kind = (
            "course"
            if self.scope.startswith("course_")
            else "path"
            if self.scope == "path_references"
            else "module"
        )
        if self.target.kind != kind or not self.instruction.strip():
            raise ValueError("Select a matching target and instruction")
        if self.reuse_course_ids and self.scope != "path_references":
            raise ValueError("Course reuse is only allowed for path references")
        if len(set(self.reuse_course_ids)) != len(self.reuse_course_ids) or any(
            not i for i in self.reuse_course_ids
        ):
            raise ValueError("Select distinct accessible course IDs")
        if self.count is not None and (
            self.scope not in ("flashcards", "quiz")
            or not 1 <= self.count <= (20 if self.scope == "flashcards" else 10)
        ):
            raise ValueError("Activity count is outside the selected scope bounds")
        return self


class ManualChangeRequest(StrictModel):
    request_id: str = Field(min_length=1, max_length=200)
    patches: list[ResourcePatch] = Field(min_length=1, max_length=100)


class RestoreRequest(StrictModel):
    request_id: str = Field(min_length=1, max_length=200)
    expected_current_fingerprint: str = Field(min_length=1)


class ChangeSet(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def legacy_build_drafts(cls, data):
        # Task2 serialized omitted optional activities as null and applied only
        # non-null fields. Preserve those saved drafts without changing new requests.
        if isinstance(data, dict) and "before" not in data:
            data = dict(data)
            data["state"] = data.get("status", "ready")
            data["before"] = data.get("base_snapshots", [])
            data["patches"] = [
                {
                    **patch,
                    "fields": {
                        key: value for key, value in patch["fields"].items() if value is not None
                    },
                }
                for patch in data.get("patches", [])
            ]
        return data

    id: str
    workspace_id: str
    owner_id: str
    patches: list[ResourcePatch]
    base_snapshots: list[ResourceSnapshot]
    before: list[ResourceSnapshot] = Field(default_factory=list)
    after: list[ResourceSnapshot] = Field(default_factory=list)
    origin_job_id: str | None = None
    request_id: str | None = None
    status: Literal["ready", "applied"] = "ready"
    state: Literal["ready", "applied"] = "ready"
    revision_id: str | None = None
    parent_revision_id: str | None = None
    revision_request: RevisionRequest | None = None
    applied_at: datetime | None = None
    created_at: datetime


class Revision(BaseModel):
    id: str
    workspace_id: str
    owner_id: str
    change_id: str
    before: list[ResourceSnapshot]
    after: list[ResourceSnapshot]
    touched_fields: list[list[str]] = Field(default_factory=list)
    fingerprint: str = ""
    parent_revision_id: str | None = None
    created_at: datetime
    # Read-time metadata is never written back to immutable history.
    current_snapshots: list[ResourceSnapshot] = Field(default_factory=list)
    current_fingerprint: str | None = None
    restorable: bool = False
    kind: Literal["editorial", "creation"] = "editorial"
