"""Content-free omission metadata for authorized workspace collection discovery."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class WorkspaceDiscovery(BaseModel, Generic[T]):
    items: list[T]
    unavailable_count: int = Field(default=0, ge=0)
