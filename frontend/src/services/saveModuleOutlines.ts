import { modulesApi } from '../api/modules';
import type { ModuleOutline } from '../hooks/useModuleOutlines';

/** Persist outline metadata while retaining the content of existing modules. */
export async function saveModuleOutlines(
  courseId: string,
  outlines: ModuleOutline[],
  createdIds: Map<string, string>,
): Promise<void> {
  const existing = await modulesApi.list(courseId);
  const keptIds = new Set<string>();

  // Complete additions/updates before deleting anything. Remember created IDs
  // immediately so a partial failure can be retried without duplicate modules.
  for (const [order_index, outline] of outlines.entries()) {
    const id = createdIds.get(outline.id) || outline.id;
    const previous = existing.find(module => module.id === id);
    const data = {
      title: outline.title.trim(), description: outline.description.trim(), order_index,
    };
    if (previous) {
      if (previous.title !== data.title || (previous.description || '') !== data.description
        || previous.order_index !== order_index) {
        await modulesApi.update(courseId, id, data);
      }
      keptIds.add(id);
    } else {
      const created = await modulesApi.create(courseId, data);
      createdIds.set(outline.id, created.id);
      keptIds.add(created.id);
    }
  }

  for (const module of existing) {
    if (!keptIds.has(module.id)) await modulesApi.delete(courseId, module.id);
  }
}
