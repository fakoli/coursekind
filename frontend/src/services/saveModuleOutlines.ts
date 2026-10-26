import { modulesApi } from '../api/modules';
import type { ModuleOutline } from '../hooks/useModuleOutlines';
import type { ModuleSummary } from '../types';

/** The initial snapshot and retry ID are retained by the editor, never refreshed at Save. */
export async function saveModuleOutlines(
  courseId: string,
  outlines: ModuleOutline[],
  initial: ModuleSummary[],
  requestId: string,
): Promise<void> {
  await modulesApi.reconcileOutlines(courseId, initial, outlines, requestId);
}
