import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AuthContext } from '../components/common/AuthContext';
import { Workspace } from './Workspace';
import { useRemoveCourseFromPath } from '../hooks/useLearningPaths';
import { learningPathsApi } from '../api/learningPaths';
import { Workspaces } from './Workspaces';
import { installWorkspaceApi } from '../test/workspaceApi';
import { renderJourney } from '../test/journeyApi';
import type { User } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('loads a saved brief and retains typed text after a failed PUT with Retry', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(await screen.findByRole('textbox', { name: 'Learning goal' })).toHaveValue('Learn Python');
  state.failSave = true;
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'My edited goal' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Save unavailable/);
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('My edited goal');
  state.failSave = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(state.workspaces[0].brief.goal).toBe('My edited goal'));
  expect(await screen.findByText('Saved')).toBeInTheDocument();
  expect(state.writes[0].request_id).toBe(state.writes[1].request_id);
  cleanup();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(await screen.findByRole('textbox', { name: 'Learning goal' })).toHaveValue(
    'My edited goal',
  );
});
it('archives without removing the linked course', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(await screen.findByRole('link', { name: 'Test course' })).toHaveAttribute(
    'href',
    '/courses/c1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Archive workspace' }));
  expect(await screen.findByText(/Archived workspace/)).toBeInTheDocument();
  expect(state.workspaces[0].archived).toBe(true);
  expect(screen.getByRole('link', { name: 'Test course' })).toHaveAttribute('href', '/courses/c1');
});
it('explains stale saves while keeping the unsaved goal for comparison', async () => {
  const state = installWorkspaceApi();
  state.stale = true;
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Keep this text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/changed.*reload/i);
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Keep this text');
});
it('hides old list data and draft text immediately when the account changes', async () => {
  const state = installWorkspaceApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = (id: string) => ({
    user: { id, name: id } as User,
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  const tree = (id: string) => (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={context(id)}>
        <MemoryRouter initialEntries={['/workspaces/w1']}>
          <Routes>
            <Route path="/workspaces/:workspaceId" element={<Workspace />} />
            <Route path="/workspaces" element={<Workspaces />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const view = render(tree('u1'));
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Private unsaved text' },
  });
  state.workspaces = [];
  view.rerender(tree('u2'));
  expect(screen.queryByDisplayValue('Private unsaved text')).not.toBeInTheDocument();
  expect(screen.queryByText('Learn Python')).not.toBeInTheDocument();
  expect(await screen.findByText('Workspace unavailable')).toBeInTheDocument();
});
it('reloads the actual current server brief after a stale save before retrying edits', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  state.workspaces[0].brief = { ...state.workspaces[0].brief, goal: 'New server goal' };
  state.workspaces[0].version = 2;
  state.stale = true;
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Unsaved old version' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved brief' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('New server goal'),
  );
  state.stale = false;
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Updated after reload' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await waitFor(() => expect(state.workspaces[0].brief.goal).toBe('Updated after reload'));
  expect(state.writes.at(-1)?.expected_version).toBe(2);
});
it('keeps the workspace accessible with generic recovery when a linked course is deleted', async () => {
  installWorkspaceApi();
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.endsWith('/courses/c1')
      ? Promise.resolve(
          new Response(JSON.stringify({ detail: 'Course not found' }), { status: 404 }),
        )
      : original(input, init),
  );
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(await screen.findByText(/Course unavailable/)).toBeInTheDocument();
  expect(screen.queryByText('Test course')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Learn Python');
  expect(screen.getByRole('link', { name: 'Browse courses' })).toHaveAttribute('href', '/courses');
});
it('hides the old account workspace list before the next account fetch resolves', async () => {
  const state = installWorkspaceApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = (id: string) => ({
    user: { id, name: id } as User,
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  const tree = (id: string) => (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={context(id)}>
        <MemoryRouter>
          <Workspaces />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const view = render(tree('u1'));
  await screen.findByRole('link', { name: /Learn Python/ });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Private list draft' },
  });
  state.workspaces = [];
  view.rerender(tree('u2'));
  expect(screen.queryByRole('link', { name: /Learn Python/ })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Private list draft')).not.toBeInTheDocument();
  expect(await screen.findByText('No workspaces yet')).toBeInTheDocument();
});
it('retains the draft when reloading a conflicting brief temporarily fails', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  state.stale = true;
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Keep through reload failure' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await screen.findByRole('alert');
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.endsWith('/workspaces/w1') && !init?.method
      ? Promise.resolve(
          new Response(JSON.stringify({ detail: 'Temporarily unavailable' }), { status: 503 }),
        )
      : original(input, init),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved brief' }));
  await screen.findByText('Could not reload the saved brief. Your edits are kept. Try again.');
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue(
    'Keep through reload failure',
  );
});
it('saves a newly edited brief at the confirmed version after archiving and restoring', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  fireEvent.click(screen.getByRole('button', { name: 'Archive workspace' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore workspace' }));
  await screen.findByRole('button', { name: 'Archive workspace' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Edited after restore' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await waitFor(() => expect(state.workspaces[0].brief.goal).toBe('Edited after restore'));
  expect(state.writes.map((write) => write.expected_version)).toEqual([1, 2, 3]);
  expect(state.workspaces[0].version).toBe(4);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('preserves a dirty brief through archive and restore and saves with the confirmed version', async () => {
  const state = installWorkspaceApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Dirty draft before archive' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Archive workspace' }));
  const restore = await screen.findByRole('button', { name: 'Restore workspace' });
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue(
    'Dirty draft before archive',
  );
  expect(state.workspaces[0].brief.goal).toBe('Learn Python');
  fireEvent.click(restore);
  await screen.findByRole('button', { name: 'Archive workspace' });
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue(
    'Dirty draft before archive',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await waitFor(() => expect(state.workspaces[0].brief.goal).toBe('Dirty draft before archive'));
  expect(state.writes.map((write) => write.expected_version)).toEqual([1, 2, 3]);
  expect(state.workspaces[0].version).toBe(4);
});
it('does not accept an archive response version when another save changed the server brief', async () => {
  const state = installWorkspaceApi();
  const client = renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  await screen.findByRole('textbox', { name: 'Learning goal' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'My unsaved draft' },
  });
  state.workspaces[0].brief = { ...state.workspaces[0].brief, goal: 'Different server brief' };
  state.workspaces[0].version = 2;
  await client.invalidateQueries({ queryKey: ['workspace'] });
  await screen.findByRole('heading', { name: 'Different server brief' });
  fireEvent.click(screen.getByRole('button', { name: 'Archive workspace' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore workspace' }));
  await screen.findByRole('button', { name: 'Archive workspace' });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/workspace changed/i);
  expect(state.writes.map((write) => write.expected_version)).toEqual([2, 3, 1]);
  expect(state.workspaces[0].brief.goal).toBe('Different server brief');
  expect(state.workspaces[0].version).toBe(4);
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('My unsaved draft');
});


it('the primary next action reopens a collapsed Plan and retains planning instructions', async () => {
  const state = installWorkspaceApi();
  state.workspaces[0].course_ids = [];
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const instructions = await screen.findByRole('textbox', { name: 'Additional planning instructions' });
  fireEvent.change(instructions, { target: { value: 'Keep these planning instructions' } });
  fireEvent.click(screen.getByText('Plan · review before creating material'));
  expect(screen.getByRole('button', { name: 'Generate plan' })).not.toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Next: generate and review a plan' }));
  expect(screen.getByRole('button', { name: 'Generate plan' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Additional planning instructions' })).toHaveValue('Keep these planning instructions');
});

it('offers baseline path repair and recovers current work while historical jobs stay unavailable', async () => {
  const state = installWorkspaceApi();
  state.workspaces[0].path_id = 'p1';
  let currentUnavailable = true;
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (input.endsWith('/jobs') || input.endsWith('/plans') || (currentUnavailable && input.endsWith('/snapshots'))) {
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Source unavailable' }), { status: 404 }));
    }
    return original(input, init);
  });
  vi.spyOn(learningPathsApi, 'removeCourse').mockImplementation(async () => {
    currentUnavailable = false;
    state.workspaces[0].course_ids = [];
    return {} as Awaited<ReturnType<typeof learningPathsApi.removeCourse>>;
  });
  function BaselineRepairHarness() {
    const remove = useRemoveCourseFromPath();
    return <><button onClick={() => remove.mutate({ pathId: 'p1', courseId: 'c1' })}>Baseline remove reference</button><Workspace /></>;
  }
  renderJourney(<BaselineRepairHarness />, '/workspaces/w1', '/workspaces/:workspaceId');
  expect(await screen.findByRole('link', { name: 'Repair linked path' })).toHaveAttribute('href', '/paths/p1');
  expect(screen.queryByRole('button', { name: 'Generate plan' })).not.toBeInTheDocument();
  expect(screen.getByText(/Source access is required even for historical drafts/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Baseline remove reference' }));
  await screen.findByRole('button', { name: 'Generate plan' });
  expect(screen.getByText(/Some saved plans or jobs are unavailable/)).toBeInTheDocument();
  await screen.findByText('No linked courses yet.');
  expect(screen.getByText(/Job status unavailable/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Build learning material' })).toBeInTheDocument();
});
