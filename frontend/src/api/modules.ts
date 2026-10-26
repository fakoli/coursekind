import { api } from './client';
import type {
  Module,
  ModuleCreate,
  ModuleSummary,
  ModuleUpdate,
} from '../types';

export const modulesApi = {
  /** List all modules for a course */
  list: (courseId: string) =>
    api.get<ModuleSummary[]>(`/courses/${courseId}/modules`),

  reconcileOutlines: (courseId: string, initial: ModuleSummary[], outlines: {id:string;title:string;description:string}[], request_id: string) =>
    api.put<ModuleSummary[]>(`/courses/${courseId}/modules/outlines`, {initial, outlines, request_id}),

  /** Create a new module in a course */
  create: (courseId: string, data: ModuleCreate) =>
    api.post<Module>(`/courses/${courseId}/modules`, data),

  /** Create multiple modules in a single request */
  batchCreate: (courseId: string, modules: ModuleCreate[]) =>
    api.post<{ created: Module[]; count: number }>(
      `/courses/${courseId}/modules/batch`,
      { modules }
    ),

  /** Get a module by ID */
  get: (courseId: string, moduleId: string) =>
    api.get<Module>(`/courses/${courseId}/modules/${moduleId}`),

  /** Update a module */
  update: (courseId: string, moduleId: string, data: ModuleUpdate) =>
    api.put<Module>(`/courses/${courseId}/modules/${moduleId}`, data),

  /** Delete a module */
  delete: (courseId: string, moduleId: string) =>
    api.delete<{ message: string }>(`/courses/${courseId}/modules/${moduleId}`),

  /** Reorder modules in a course */
  reorder: (courseId: string, moduleIds: string[]) =>
    api.put<ModuleSummary[]>(`/courses/${courseId}/modules/reorder`, { module_ids: moduleIds }),
};
