import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  const conflictMessage =
    'This content changed since your draft was created. Your draft is kept. Review the current version or regenerate before applying.';
  const apply = vi
    .spyOn(workspacesApi, 'applyChange')
    .mockRejectedValue(new ApiError(conflictMessage, 409));
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
  expect(await screen.findByRole('alert')).toHaveTextContent(conflictMessage);
  expect(screen.getAllByText(conflictMessage)).toHaveLength(1);
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

it.each([
  { name: 'changed visual', visual: 'visuals/revised-card.png' },
  { name: 'removed visual', visual: undefined },
  {
    name: 'untrusted visual',
    visual: 'javascript:alert(1)<svg onload="alert(2)">',
  },
])('shows a flashcard $name as inert text in both proposal sides', async ({ visual }) => {
  const state = installWorkspaceBuildApi();
  const card = {
    id: 'retained',
    front: 'Unchanged front',
    back: 'Unchanged back',
  };
  state.change.before = [
    {
      target: state.change.patches[0].target,
      fingerprint: 'old',
      fields: {
        flashcards: [{ ...card, visual: 'visuals/original-card.png' }],
      },
    },
  ];
  state.change.patches[0].fields = { flashcards: [{ ...card, visual }] };
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
  const comparison = await screen.findByLabelText('flashcards comparison');
  fireEvent.click(within(comparison).getByText('Before', { exact: true }));
  expect(
    within(comparison).getByText('visuals/original-card.png', {
      exact: true,
    }),
  ).toBeVisible();
  expect(within(comparison).getByText(visual || 'No visual', { exact: true })).toBeVisible();
  expect(within(comparison).getAllByText('Unchanged front')).toHaveLength(2);
  expect(within(comparison).getAllByText('Unchanged back')).toHaveLength(2);
  expect(comparison.querySelector('img, a, svg, iframe')).toBeNull();
});

it('resolves path reference titles from fresh access checks and hides revoked cached titles', async () => {
  const state = installWorkspaceBuildApi();
  state.change.patches[0].fields = { course_ids: ['c1'] };
  const client = renderJourney(
    <ChangeReview
      workspaceId="w1"
      changeId="change-1"
      onDismiss={vi.fn()}
      onChanged={async () => {}}
    />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  expect(await screen.findByRole('link', { name: 'Test course' })).toHaveAttribute(
    'href',
    '/courses/c1',
  );
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.endsWith('/courses/c1')
      ? Promise.resolve(
          new Response(JSON.stringify({ detail: 'Forbidden' }), {
            status: 403,
          }),
        )
      : original(input, init),
  );
  await client.invalidateQueries({ queryKey: ['workspace-reference-title'] });
  expect(
    await screen.findByRole('link', {
      name: 'Course reference (title unavailable)',
    }),
  ).toHaveAttribute('href', '/courses/c1');
  expect(screen.queryByText('Test course')).not.toBeInTheDocument();
});
