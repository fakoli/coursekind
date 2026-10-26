import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi } from '../../test/workspaceBuildApi';
import { WorkspaceHistory } from './WorkspaceHistory';
import { workspacesApi } from '../../api/workspaces';
import type { WorkspaceRevision } from '../../types/workspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function fixture(): WorkspaceRevision {
  const target = {
    kind: 'module' as const,
    resource_id: 'm1',
    course_id: 'c1',
  };
  return {
    id: 'r1',
    change_id: 'change-1',
    before: [{ target, fingerprint: 'before', fields: { quiz: null } }],
    after: [{ target, fingerprint: 'after', fields: { quiz: { questions: [] } } }],
    touched_fields: [['quiz']],
    fingerprint: 'touched',
    current_fingerprint: 'current',
    parent_revision_id: null,
    restorable: true,
    kind: 'editorial',
    created_at: '2026-10-26T12:00:00Z',
  };
}
it('records creation without destructive restore and reloads editorial history', async () => {
  const state = installWorkspaceBuildApi();
  vi.spyOn(workspacesApi, 'history').mockResolvedValue([
    {
      ...fixture(),
      id: 'created',
      kind: 'creation',
      before: [],
      restorable: false,
    },
    fixture(),
  ]);
  const restore = vi.spyOn(workspacesApi, 'restore').mockResolvedValue(state.change);
  renderJourney(
    <WorkspaceHistory workspaceId="w1" onChanged={async () => {}} />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  expect(await screen.findByText(/Not restorable/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Restore prior content · free' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Restore prior content · free' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Restored as a new history entry');
  expect(restore.mock.calls[0]).toEqual([
    'w1',
    'r1',
    { request_id: expect.any(String), expected_current_fingerprint: 'current' },
  ]);
});
it('keeps history on conflict and uses the captured fingerprint on retry', async () => {
  installWorkspaceBuildApi();
  vi.spyOn(workspacesApi, 'history').mockResolvedValue([fixture()]);
  const restore = vi
    .spyOn(workspacesApi, 'restore')
    .mockRejectedValue(new Error('Content changed'));
  renderJourney(
    <WorkspaceHistory workspaceId="w1" onChanged={async () => {}} />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Restore prior content · free' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Content changed');
  expect(screen.getByText('Compare recorded fields')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore prior content · free' }));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
  expect(restore.mock.calls[0][2]).toEqual(restore.mock.calls[1][2]);
});
