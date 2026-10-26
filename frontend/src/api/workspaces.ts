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
  RevisionRequest,
  WorkspaceRevision,
  ResourceSnapshot,
  MaterialReview,
  MaterialReviewRequest,
  ReviewSources,
} from '../types/workspace';

export const workspacesApi = {
  reviewSources: (id: string, changeId?: string) =>
    api.get<ReviewSources>(
      `/workspaces/${id}/review-sources${changeId ? `?change_id=${encodeURIComponent(changeId)}` : ''}`,
    ),
  review: (id: string, data: MaterialReviewRequest) =>
    api.post<MaterialReview>(`/workspaces/${id}/reviews`, data),
  getReview: (id: string, reviewId: string) =>
    api.get<MaterialReview>(`/workspaces/${id}/reviews/${reviewId}`),
  changes: (id: string) => api.get<ChangeSet[]>(`/workspaces/${id}/changes`),
  revise: (id: string, data: RevisionRequest) =>
    api.post<WorkspaceJob>(`/workspaces/${id}/revisions`, data),
  manualChange: (id: string, data: { request_id: string; patches: ChangeSet['patches'] }) =>
    api.post<ChangeSet>(`/workspaces/${id}/changes`, data),
  snapshots: (id: string) => api.get<ResourceSnapshot[]>(`/workspaces/${id}/snapshots`),
  history: (id: string) => api.get<WorkspaceRevision[]>(`/workspaces/${id}/history`),
  restore: (
    id: string,
    revisionId: string,
    data: { request_id: string; expected_current_fingerprint: string },
  ) => api.post<ChangeSet>(`/workspaces/${id}/history/${revisionId}/restore`, data),
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
