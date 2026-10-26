"""Private workspace lifecycle endpoints. Reads remain available during write rollback."""
from fastapi import APIRouter
from dependencies import CurrentUser, SettingsDep, StorageDep
from exceptions import StudyBuddyException
from models.workspace import Workspace, WorkspaceCreate, WorkspaceUpdate
from services.workspace_service import WorkspaceService

router = APIRouter()


def require_workspace_writes(settings):
    if not settings.workspace_enabled:
        raise StudyBuddyException('Workspace changes are currently disabled', status_code=503)


@router.post('', response_model=Workspace)
async def create_workspace(data: WorkspaceCreate, user: CurrentUser, storage: StorageDep, settings: SettingsDep):
    require_workspace_writes(settings)
    return await WorkspaceService(storage).create(user.id, user.name, data)


@router.get('', response_model=list[Workspace])
async def list_workspaces(user: CurrentUser, storage: StorageDep, archived: bool = False):
    return await WorkspaceService(storage).list(user.id, archived)


@router.get('/{workspace_id}', response_model=Workspace)
async def get_workspace(workspace_id: str, user: CurrentUser, storage: StorageDep):
    return await WorkspaceService(storage).get(user.id, workspace_id)


@router.put('/{workspace_id}', response_model=Workspace)
async def update_workspace(workspace_id: str, data: WorkspaceUpdate, user: CurrentUser, storage: StorageDep, settings: SettingsDep):
    require_workspace_writes(settings)
    return await WorkspaceService(storage).update(user.id, workspace_id, data)
