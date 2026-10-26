import { api } from './client';
import type { Workspace, WorkspaceCreate, WorkspaceUpdate } from '../types/workspace';

export const workspacesApi = {
  create: (data: WorkspaceCreate) => api.post<Workspace>('/workspaces', data),
  list: (archived = false) => api.get<Workspace[]>(`/workspaces?archived=${archived}`),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`),
  update: (id: string, data: WorkspaceUpdate) => api.put<Workspace>(`/workspaces/${id}`, data),
};
