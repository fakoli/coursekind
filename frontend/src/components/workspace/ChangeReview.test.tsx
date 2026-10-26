import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi } from '../../test/workspaceBuildApi';
import { ChangeReview } from './ChangeReview';
import { workspacesApi } from '../../api/workspaces';
import { ApiError } from '../../api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('renders a quiz-only before/after and preserves proposal on conflict', async () => {
  const state = installWorkspaceBuildApi();
  state.change.patches[0].fields = {
    quiz: {
      questions: [{ question: 'Revised?', options: ['Yes', 'No'], correct_index: 0 }],
    },
  };
  state.change.before = [
    {
      target: state.change.patches[0].target,
      fingerprint: 'old',
      fields: {
        title: 'Existing lesson',
        quiz: null,
        content_markdown: '# Do not replace',
      },
    },
  ];
  state.change.revision_request = {
    request_id: 'original',
    target: state.change.patches[0].target,
    scope: 'quiz',
    instruction: 'Clarify',
    count: 1,
  };
  const apply = vi
    .spyOn(workspacesApi, 'applyChange')
    .mockRejectedValue(new ApiError('Content changed', 409));
  const regenerate = vi.spyOn(workspacesApi, 'revise').mockResolvedValue({} as never);
  renderJourney(
    <ChangeReview
      workspaceId="w1"
      changeId="change-1"
      onDismiss={vi.fn()}
      onChanged={async () => {}}
    />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  expect(await screen.findByLabelText('quiz comparison')).toHaveTextContent('Revised?');
  expect(screen.queryByLabelText('content_markdown comparison')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply draft · free' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Content changed');
  expect(screen.getByLabelText('quiz comparison')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review current module' })).toHaveAttribute(
    'href',
    '/courses/c1/modules/m1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate against current version' }));
  await waitFor(() => expect(regenerate).toHaveBeenCalledOnce());
  expect(regenerate.mock.calls[0][1]).toMatchObject({
    scope: 'quiz',
    count: 1,
    instruction: 'Clarify',
  });
  expect(regenerate.mock.calls[0][1].request_id).not.toBe('original');
  expect(apply).toHaveBeenCalledOnce();
});
it('retains the same apply key after a lost response and dismiss performs no write', async () => {
  const state = installWorkspaceBuildApi();
  const apply = vi
    .spyOn(workspacesApi, 'applyChange')
    .mockRejectedValueOnce(new Error('Network lost'))
    .mockResolvedValue(state.change);
  const dismiss = vi.fn();
  renderJourney(
    <ChangeReview
      workspaceId="w1"
      changeId="change-1"
      onDismiss={dismiss}
      onChanged={async () => {}}
    />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Apply draft · free' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network lost');
  fireEvent.click(screen.getByRole('button', { name: 'Apply draft · free' }));
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
  expect(apply.mock.calls[0][2]).toBe(apply.mock.calls[1][2]);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss review' }));
  expect(dismiss).toHaveBeenCalledOnce();
});
