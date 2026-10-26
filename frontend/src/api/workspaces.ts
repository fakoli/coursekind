import { api } from './client';
import type {
  Workspace,
  WorkspaceCreate,
  WorkspaceUpdate,
  WorkspaceJob,
  PlanProposal,
  PlanRequest,
  WorkspacePlan,
  BuildRequest,
  ChangeSet,
} from '../types/workspace';

export const workspacesApi = {
  create: (data: WorkspaceCreate) => api.post<Workspace>('/workspaces', data),
  list: (archived = false) => api.get<Workspace[]>(`/workspaces?archived=${archived}`),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`),
  update: (id: string, data: WorkspaceUpdate) => api.put<Workspace>(`/workspaces/${id}`, data),
  jobs: (id: string) => api.get<WorkspaceJob[]>(`/workspaces/${id}/jobs`),
  plans: (id: string) => api.get<PlanProposal[]>(`/workspaces/${id}/plans`),
  plan: (id: string, data: PlanRequest) => api.post<WorkspaceJob>(`/workspaces/${id}/plans`, data),
  updatePlan: (
    id: string,
    proposalId: string,
    data: {
      request_id: string;
      expected_proposal_version: number;
      plan: WorkspacePlan;
    },
  ) => api.put<PlanProposal>(`/workspaces/${id}/plans/${proposalId}`, data),
  applyPlan: (
    id: string,
    proposalId: string,
    data: { request_id: string; expected_proposal_version: number },
  ) => api.post<PlanProposal>(`/workspaces/${id}/plans/${proposalId}/apply`, data),
  build: (id: string, data: BuildRequest) =>
    api.post<WorkspaceJob>(`/workspaces/${id}/build`, data),
  cancel: (id: string, jobId: string, request_id: string) =>
    api.post<WorkspaceJob>(`/workspaces/${id}/jobs/${jobId}/cancel`, {
      request_id,
    }),
  retry: (id: string, jobId: string, data: { request_id: string; step_ids: string[] }) =>
    api.post<WorkspaceJob>(`/workspaces/${id}/jobs/${jobId}/retry`, data),
  change: (id: string, changeId: string) =>
    api.get<ChangeSet>(`/workspaces/${id}/changes/${changeId}`),
  applyChange: (id: string, changeId: string, request_id: string) =>
    api.post<ChangeSet>(`/workspaces/${id}/changes/${changeId}/apply`, {
      request_id,
    }),
};
