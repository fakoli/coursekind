import { vi } from 'vitest';
import { installJourneyApi, makeModule } from './journeyApi';
import { workspaceFixture } from './workspaceApi';
import type { ChangeSet, PlanProposal, WorkspaceJob } from '../types/workspace';

export const planFixture: PlanProposal = {
  id: 'proposal-1',
  workspace_id: 'w1',
  owner_id: 'u1',
  version: 1,
  plan: {
    scope: 'course',
    title: 'Learn addition',
    description: 'Practice sums',
    assumptions: ['Beginner'],
    courses: [
      {
        kind: 'new',
        temp_id: 'new-c',
        title: 'Addition',
        description: 'Numbers',
        difficulty: 'beginner',
        modules: [
          {
            temp_id: 'new-m1',
            title: 'First',
            description: 'Start',
            objectives: ['Add'],
          },
          {
            temp_id: 'new-m2',
            title: 'Second',
            description: 'Continue',
            objectives: ['Explain'],
          },
        ],
      },
    ],
  },
  base_workspace_version: 1,
  base_snapshots: [],
  status: 'ready',
  job_id: 'plan-job',
  applied_ids: {},
  reuse_course_ids: [],
  created_at: '2026-10-26T12:00:00Z',
};
export function jobFixture(kind: 'plan' | 'build' = 'build'): WorkspaceJob {
  return {
    id: 'j1',
    workspace_id: 'w1',
    owner_id: 'u1',
    kind,
    provider: 'anvil',
    model: 'llm.primary',
    state: 'ready',
    steps: [
      {
        id: 's1',
        target: { kind: 'module', resource_id: 'm1', course_id: 'c1' },
        attempt: 1,
        state: 'ready',
        credits: 25,
        finalize_only: false,
        operation_credits: kind === 'plan' ? 10 : 25,
        output_ref: kind === 'build' ? 'change-1' : planFixture.id,
        safe_error: null,
        source_snapshots: [],
      },
    ],
    created_at: '2026-10-26T12:00:00Z',
    updated_at: '2026-10-26T12:00:00Z',
  };
}
export function installWorkspaceBuildApi() {
  const journey = installJourneyApi([
    { ...makeModule(), content_markdown: '' },
    { ...makeModule('m2', 1), content_markdown: '' },
  ]);
  const fallback = fetch;
  const state = {
    journey,
    workspace: structuredClone(workspaceFixture),
    plans: [structuredClone(planFixture)],
    jobs: [] as WorkspaceJob[],
    writes: [] as { path: string; body: Record<string, unknown> }[],
    fail: false,
    change: {
      id: 'change-1',
      workspace_id: 'w1',
      owner_id: 'u1',
      status: 'ready',
      revision_id: null,
      patches: [
        {
          target: { kind: 'module', resource_id: 'm1', course_id: 'c1' },
          expected_fingerprint: 'fingerprint',
          fields: {
            content_markdown: '# Proposed lesson',
            flashcards: [],
            quiz: null,
          },
        },
      ],
      base_snapshots: [],
      origin_job_id: 'j1',
      created_at: '2026-10-26T12:00:00Z',
    } as ChangeSet,
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname.replace('/api/v1', '');
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (!path.startsWith('/workspaces')) return fallback(input, init);
    if (method !== 'GET') {
      state.writes.push({ path, body });
      if (state.fail) return reply({ detail: 'Synthetic failed request' }, 500);
    }
    if (path === '/workspaces/w1') {
      if (method === 'PUT') {
        if (body.expected_version !== state.workspace.version) return reply({ detail: 'Workspace changed' }, 409);
        if (body.brief) state.workspace.brief = body.brief;
        state.workspace.version++;
      }
      return reply(state.workspace);
    }
    if (path.endsWith('/history') || path.endsWith('/snapshots') || path.endsWith('/changes')) return reply([]);
    if (path === '/workspaces/w1/jobs') return reply(state.jobs);
    if (path.endsWith('/changes/change-1')) return reply(state.change);
    if (path.endsWith('/changes/change-1/apply')) {
      state.change.status = 'applied';
      state.change.revision_id = 'rev1';
      journey.modules[0].content_markdown = state.change.patches[0].fields.content_markdown || '';
      return reply(state.change);
    }
    if (path.endsWith('/plans/proposal-1/apply')) {
      state.plans[0].status = 'applied';
      state.workspace.version++;
      state.plans[0].applied_workspace = structuredClone(state.workspace);
      return reply(state.plans[0]);
    }
    if (path.endsWith('/plans/proposal-1') && method === 'PUT') {
      state.plans[0].plan = body.plan;
      state.plans[0].version++;
      return reply(state.plans[0]);
    }
    if (path.endsWith('/plans')) {
      if (method === 'GET') return reply(state.plans);
      const job = jobFixture('plan');
      state.jobs.unshift(job);
      return reply(job, 202);
    }
    if (path.endsWith('/build')) {
      const job = jobFixture();
      state.jobs.unshift(job);
      return reply(job, 202);
    }
    if (path.endsWith('/retry') || path.endsWith('/cancel')) return reply(state.jobs[0]);
    return reply({ detail: 'Missing fixture route' }, 404);
  });
  return state;
}
