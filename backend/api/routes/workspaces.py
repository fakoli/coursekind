"""Private workspace lifecycle endpoints. Reads remain available during write rollback."""

from fastapi import APIRouter

from dependencies import CurrentUser, SettingsDep, StorageDep
from exceptions import StudyBuddyException
from models.workspace import Workspace, WorkspaceCreate, WorkspaceUpdate
from models.workspace_change import (
    ChangeSet,
    ManualChangeRequest,
    ResourceSnapshot,
    ResourceTarget,
    RestoreRequest,
    Revision,
    RevisionRequest,
)
from models.workspace_discovery import WorkspaceDiscovery
from models.workspace_job import BuildRequest, MutationRequest, RetryRequest, WorkspaceJob
from models.workspace_plan import ApplyPlanRequest, PlanProposal, PlanRequest, PlanUpdateRequest
from models.workspace_review import MaterialReview, MaterialReviewRequest, ReviewSources
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_context import WorkspaceContext
from services.workspace_job_service import WorkspaceJobService
from services.workspace_plan_service import WorkspacePlanService
from services.workspace_review_service import WorkspaceReviewService
from services.workspace_service import WorkspaceService

router = APIRouter()


def require_workspace_writes(settings):
    if not settings.workspace_enabled:
        raise StudyBuddyException("Workspace changes are currently disabled", status_code=503)


@router.post("", response_model=Workspace)
async def create_workspace(
    data: WorkspaceCreate, user: CurrentUser, storage: StorageDep, settings: SettingsDep
):
    require_workspace_writes(settings)
    return await WorkspaceService(storage).create(user.id, user.name, data)


@router.get("", response_model=list[Workspace])
async def list_workspaces(user: CurrentUser, storage: StorageDep, archived: bool = False):
    return await WorkspaceService(storage).list(user.id, archived)


@router.get("/{workspace_id}", response_model=Workspace)
async def get_workspace(workspace_id: str, user: CurrentUser, storage: StorageDep):
    return await WorkspaceService(storage).get(user.id, workspace_id)


@router.put("/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceService(storage).update(user.id, workspace_id, data)


# Durable inference jobs are admitted before submission; polling performs no inference.


@router.post("/{workspace_id}/plans", response_model=WorkspaceJob, status_code=202)
async def plan_workspace(
    workspace_id: str,
    data: PlanRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceJobService(storage, settings).start(user.id, workspace_id, "plan", data)


@router.get(
    "/{workspace_id}/plans", response_model=list[PlanProposal] | WorkspaceDiscovery[PlanProposal]
)
async def list_plans(
    workspace_id: str,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
    partial: bool = False,
):
    if partial:
        return await WorkspacePlanService(storage, settings).discover(user.id, workspace_id)
    return await WorkspacePlanService(storage, settings).list(user.id, workspace_id)


@router.get("/{workspace_id}/plans/{proposal_id}", response_model=PlanProposal)
async def get_plan(
    workspace_id: str,
    proposal_id: str,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    return await WorkspacePlanService(storage, settings).get(user.id, workspace_id, proposal_id)


@router.put("/{workspace_id}/plans/{proposal_id}", response_model=PlanProposal)
async def update_plan(
    workspace_id: str,
    proposal_id: str,
    data: PlanUpdateRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspacePlanService(storage, settings).update(
        user.id, workspace_id, proposal_id, data
    )


@router.post("/{workspace_id}/plans/{proposal_id}/apply", response_model=PlanProposal)
async def apply_plan(
    workspace_id: str,
    proposal_id: str,
    data: ApplyPlanRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspacePlanService(storage, settings).apply(
        user.id, workspace_id, proposal_id, data
    )


@router.post("/{workspace_id}/build", response_model=WorkspaceJob, status_code=202)
async def build_workspace(
    workspace_id: str,
    data: BuildRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceJobService(storage, settings).start(user.id, workspace_id, "build", data)


@router.get(
    "/{workspace_id}/jobs", response_model=list[WorkspaceJob] | WorkspaceDiscovery[WorkspaceJob]
)
async def list_jobs(
    workspace_id: str,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
    partial: bool = False,
):
    if partial:
        return await WorkspaceJobService(storage, settings).discover(user.id, workspace_id)
    return await WorkspaceJobService(storage, settings).list(user.id, workspace_id)


@router.get("/{workspace_id}/jobs/{job_id}", response_model=WorkspaceJob)
async def get_job(
    workspace_id: str, job_id: str, user: CurrentUser, storage: StorageDep, settings: SettingsDep
):
    return await WorkspaceJobService(storage, settings).get(user.id, workspace_id, job_id)


@router.post("/{workspace_id}/jobs/{job_id}/cancel", response_model=WorkspaceJob)
async def cancel_job(
    workspace_id: str,
    job_id: str,
    data: MutationRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceJobService(storage, settings).cancel(
        user.id, workspace_id, job_id, data.request_id
    )


@router.post("/{workspace_id}/jobs/{job_id}/retry", response_model=WorkspaceJob, status_code=202)
async def retry_job(
    workspace_id: str,
    job_id: str,
    data: RetryRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceJobService(storage, settings).retry(
        user.id, workspace_id, job_id, data.request_id, data.step_ids
    )


@router.get("/{workspace_id}/changes/{change_id}", response_model=ChangeSet)
async def get_change(workspace_id: str, change_id: str, user: CurrentUser, storage: StorageDep):
    return await WorkspaceChangeService(storage).get(user.id, workspace_id, change_id)


@router.post("/{workspace_id}/changes/{change_id}/apply", response_model=ChangeSet)
async def apply_change(
    workspace_id: str,
    change_id: str,
    data: MutationRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceChangeService(storage).apply(
        user.id, workspace_id, change_id, data.request_id
    )


@router.post("/{workspace_id}/revisions", response_model=WorkspaceJob, status_code=202)
async def revise_workspace(
    workspace_id: str,
    data: RevisionRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceJobService(storage, settings).start(
        user.id, workspace_id, "revision", data
    )


@router.post("/{workspace_id}/changes", response_model=ChangeSet)
async def manual_change(
    workspace_id: str,
    data: ManualChangeRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceChangeService(storage).manual(user.id, workspace_id, data)


@router.get("/{workspace_id}/history", response_model=list[Revision] | WorkspaceDiscovery[Revision])
async def workspace_history(
    workspace_id: str, user: CurrentUser, storage: StorageDep, partial: bool = False
):
    if partial:
        return await WorkspaceChangeService(storage).discover_history(user.id, workspace_id)
    return await WorkspaceChangeService(storage).history(user.id, workspace_id)


@router.post("/{workspace_id}/history/{revision_id}/restore", response_model=ChangeSet)
async def restore_revision(
    workspace_id: str,
    revision_id: str,
    data: RestoreRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    require_workspace_writes(settings)
    return await WorkspaceChangeService(storage).restore(
        user.id, workspace_id, revision_id, data.expected_current_fingerprint, data.request_id
    )


@router.get("/{workspace_id}/snapshots", response_model=list[ResourceSnapshot])
async def workspace_snapshots(workspace_id: str, user: CurrentUser, storage: StorageDep):
    ctx = WorkspaceContext(storage)
    workspace = await ctx.workspace(user.id, workspace_id)
    targets = [ResourceTarget(kind="course", resource_id=cid) for cid in workspace.course_ids]
    if workspace.path_id:
        targets.append(ResourceTarget(kind="path", resource_id=workspace.path_id))
    return [await ctx.snapshot(user.id, target, editable=False) for target in targets]


@router.get(
    "/{workspace_id}/changes", response_model=list[ChangeSet] | WorkspaceDiscovery[ChangeSet]
)
async def list_changes(
    workspace_id: str, user: CurrentUser, storage: StorageDep, partial: bool = False
):
    if partial:
        return await WorkspaceChangeService(storage).discover_changes(user.id, workspace_id)
    return await WorkspaceChangeService(storage).list_changes(user.id, workspace_id)


@router.get("/{workspace_id}/review-sources", response_model=ReviewSources)
async def review_sources(
    workspace_id: str,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
    change_id: str | None = None,
):
    return await WorkspaceReviewService(storage, settings).sources(user.id, workspace_id, change_id)


@router.post("/{workspace_id}/reviews", response_model=MaterialReview)
async def review_material(
    workspace_id: str,
    data: MaterialReviewRequest,
    user: CurrentUser,
    storage: StorageDep,
    settings: SettingsDep,
):
    return await WorkspaceReviewService(storage, settings).review(user.id, workspace_id, data)


@router.get("/{workspace_id}/reviews/{review_id}", response_model=MaterialReview)
async def get_material_review(
    workspace_id: str, review_id: str, user: CurrentUser, storage: StorageDep, settings: SettingsDep
):
    return await WorkspaceReviewService(storage, settings).get(user.id, workspace_id, review_id)
