"""Discover durable accessible records without exposing denied historical content."""

from exceptions import ForbiddenException, NotFoundException
from models.workspace_discovery import WorkspaceDiscovery


async def discover_records(ctx, user_id, workspace_id, collection, read):
    # Current workspace authorization remains a collection-wide requirement. Keep the
    # complete scan in the concrete store's transaction so it cannot mix access states.
    async with ctx.storage.transaction():
        await ctx.workspace(user_id, workspace_id)
        docs = await ctx.storage.list(
            collection, {"owner_id": user_id, "workspace_id": workspace_id}
        )
        items, unavailable = [], 0
        for doc in sorted(docs, key=lambda d: d["created_at"], reverse=True):
            try:
                items.append(await read(doc["id"]))
            except (NotFoundException, ForbiddenException):
                # Only a count: no identifiers, titles, prompts, outputs or timestamps.
                unavailable += 1
        return WorkspaceDiscovery(items=items, unavailable_count=unavailable)
