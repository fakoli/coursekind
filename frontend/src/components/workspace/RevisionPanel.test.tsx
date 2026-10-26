import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi } from '../../test/workspaceBuildApi';
import { RevisionPanel } from './RevisionPanel';
import { workspacesApi } from '../../api/workspaces';
import type { AIPreferenceData } from '../../api/userSettings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const preferences = {
  provider: 'anvil',
  model: 'llm.primary',
  is_configured: true,
} as AIPreferenceData;
it('submits quiz scope only with the selected count and preserves the lesson', async () => {
  const state = installWorkspaceBuildApi();
  const revise = vi.spyOn(workspacesApi, 'revise').mockResolvedValue({} as never);
  renderJourney(
    <RevisionPanel
      workspace={state.workspace}
      jobs={[]}
      preferences={preferences}
      onChanged={async () => {}}
    />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  fireEvent.change(await screen.findByLabelText('Revision scope'), {
    target: { value: 'quiz' },
  });
  fireEvent.change(screen.getByLabelText('Revision instructions'), {
    target: { value: 'Clarify answers' },
  });
  expect(screen.getByLabelText('Revision count')).toHaveValue(3);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate scoped revision' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate scoped revision' }));
  await waitFor(() => expect(revise).toHaveBeenCalledOnce());
  expect(revise.mock.calls[0][1]).toMatchObject({
    scope: 'quiz',
    count: 3,
    target: { kind: 'module', resource_id: 'm1' },
    reuse_course_ids: [],
  });
  expect(state.journey.modules[0].content_markdown).toBe('');
});
it('manual path removal prepares a free proposal and never deletes a source', async () => {
  const state = installWorkspaceBuildApi();
  state.workspace.path_id = 'p1';
  vi.spyOn(workspacesApi, 'snapshots').mockResolvedValue([
    {
      target: { kind: 'path', resource_id: 'p1', course_id: null },
      fingerprint: 'path-current',
      fields: { course_ids: ['c1'] },
    },
  ]);
  const manual = vi.spyOn(workspacesApi, 'manualChange').mockResolvedValue(state.change);
  renderJourney(
    <RevisionPanel
      workspace={state.workspace}
      jobs={[]}
      preferences={preferences}
      onChanged={async () => {}}
    />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  fireEvent.click(await screen.findByRole('button', { name: /Remove reference to/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Review path changes · free' }));
  await waitFor(() => expect(manual).toHaveBeenCalledOnce());
  expect(manual.mock.calls[0][1].patches).toEqual([
    {
      target: { kind: 'path', resource_id: 'p1', course_id: null },
      expected_fingerprint: 'path-current',
      fields: { course_ids: [] },
    },
  ]);
  expect(state.journey.modules).toHaveLength(2);
  expect(state.writes).toHaveLength(0);
});
