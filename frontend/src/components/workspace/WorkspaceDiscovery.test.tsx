import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi, planFixture } from '../../test/workspaceBuildApi';
import { Workspace } from '../../pages/Workspace';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it('polls, reviews, applies and rediscovers new work with explicit unavailable-history counts', async () => {
  const state = installWorkspaceBuildApi();
  state.plans = [];
  state.workspace.path_id = 'p1';
  const original = fetch;
  let pending: 'plan' | 'build' | null = null;
  let polls = 0;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    if (init?.method === 'POST' && /\/(plans|build)$/.test(url.pathname)) {
      const result = await original(input, init);
      pending = url.pathname.endsWith('/plans') ? 'plan' : 'build';
      polls = 0;
      state.jobs[0].id = pending === 'plan' ? 'new-plan-job' : 'new-build-job';
      state.jobs[0].state = 'queued';
      state.jobs[0].steps[0].state = 'queued';
      state.jobs[0].steps[0].output_ref = null;
      return result;
    }
    if (url.pathname.endsWith('/jobs') && pending) {
      polls++;
      if (polls >= 2) {
        const job = state.jobs[0];
        job.state = 'ready';
        job.steps[0].state = 'ready';
        job.steps[0].output_ref = pending === 'plan' ? planFixture.id : state.change.id;
        if (pending === 'plan') state.plans = [structuredClone(planFixture)];
        pending = null;
      }
    }
    const result = await original(input, init);
    if (url.searchParams.get('partial') === 'true' && result.ok) {
      const batch = await result.json();
      return new Response(JSON.stringify({ ...batch, unavailable_count: 1 }));
    }
    return result;
  });
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByRole('link', { name: 'Plan' }));
  await screen.findByText(/1 earlier job\(s\) and 1 earlier plan\(s\)/);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate plan' }));
  await screen.findByText(/Plan: queued/);
  await screen.findByRole('button', { name: 'Apply plan · free' }, { timeout: 5000 });
  expect(polls).toBeGreaterThanOrEqual(2);
  fireEvent.click(screen.getByRole('button', { name: 'Apply plan · free' }));
  await waitFor(() => expect(state.plans[0].status).toBe('applied'));
  fireEvent.click(screen.getByRole('button', { name: 'Build selected modules' }));
  await screen.findByText(/Build: queued/);
  const review = await screen.findByRole('button', { name: 'Review draft 1' }, { timeout: 5000 });
  expect(polls).toBeGreaterThanOrEqual(2);
  fireEvent.click(review);
  fireEvent.click(await screen.findByRole('button', { name: 'Apply draft · free' }));
  await screen.findByRole('link', { name: 'Study this module' });
  expect(state.journey.modules[0].content_markdown).toBe('# Proposed lesson');
  expect(state.writes.filter((write) => /\/(build|plans)$/.test(write.path))).toHaveLength(2);
  cleanup();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByRole('button', { name: 'Review draft 1' }));
  await screen.findByRole('link', { name: 'Study this module' });
  expect(screen.getByText(/1 earlier job\(s\) and 1 earlier plan\(s\)/)).toBeInTheDocument();
  expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'History' }));
  expect(await screen.findByText(/1 earlier history entry\/entries unavailable/)).toBeInTheDocument();
  expect(screen.queryByText(/No recorded changes yet/)).not.toBeInTheDocument();
  expect(state.writes.filter((write) => /\/(build|plans)$/.test(write.path))).toHaveLength(2);
}, 12000);
