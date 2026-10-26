import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi, jobFixture } from '../../test/workspaceBuildApi';
import { Workspace } from '../../pages/Workspace';
import { workspacesApi } from '../../api/workspaces';
import { MaterialReview } from './MaterialReview';
import type { MaterialReview as Result, ReviewSources } from '../../types/workspace';

const sources: ReviewSources = {
  configured: true,
  sources: [
    {
      change_id: null,
      revision_marker: 'revision-1',
      snapshot: {
        target: { kind: 'module', resource_id: 'm1', course_id: 'c1' },
        fingerprint: 'hash',
        fields: {
          title: 'Addition',
          objectives: ['Add numbers'],
          content_markdown: 'One plus one is two. More examples.',
          quiz: {
            questions: [
              {
                question: 'One plus one?',
                options: ['Two', 'Three'],
                correct_index: 0,
              },
            ],
          },
        },
      },
    },
  ],
};
const ready: Result = {
  id: 'r1',
  state: 'ready',
  model: 'jev-1.14.0',
  prompt_version: 'material-review-v1',
  content_hash: 'hash',
  revision_marker: 'revision-1',
  dimensions: {
    answer_supported: 0.9,
    answer_ambiguous: 0.1,
    objective_aligned: 0.8,
  },
  usage: { input_tokens: 50, output_tokens: 12 },
  created_at: '2026-10-26T00:00:00Z',
  safe_error: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function setup(result: Result = ready, available = true) {
  installWorkspaceBuildApi();
  const load = vi
    .spyOn(workspacesApi, 'reviewSources')
    .mockResolvedValue({ ...sources, configured: available });
  const review = vi.spyOn(workspacesApi, 'review').mockResolvedValue(result);
  vi.spyOn(workspacesApi, 'getReview').mockResolvedValue(result);
  const client = renderJourney(
    <MaterialReview workspaceId="w1" />,
    '/workspaces/w1',
    '/workspaces/:workspaceId',
  );
  return { load, review, client };
}
async function select() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Select material for TypeSafe review',
    }),
  );
  return screen.findByRole('button', {
    name: 'Send selected material to TypeSafe for review',
  });
}
it('never sends on mount or source load; shows exact disclosure and bounded source selection', async () => {
  const { review } = setup();
  expect(review).not.toHaveBeenCalled();
  const send = await select();
  expect(review).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Selected lesson excerpt')).toHaveValue(
    'One plus one is two. More examples.',
  );
  expect(screen.getByLabelText('Selected lesson excerpt')).toHaveAttribute('readonly');
  expect(screen.getByText('One plus one?')).toBeVisible();
  expect(screen.getByText(/Two · Marked answer/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Excerpt end character'), {
    target: { value: '20' },
  });
  fireEvent.click(send);
  await waitFor(() => expect(review).toHaveBeenCalledOnce());
  expect(review.mock.calls[0][1]).toMatchObject({
    lesson_excerpt: 'One plus one is two.',
    objective: 'Add numbers',
    question_index: 0,
    expected_revision_marker: 'revision-1',
  });
  expect(await screen.findByText('Answer supported: 90%')).toBeVisible();
  expect(screen.getByText('Answer ambiguous: 10%')).toBeVisible();
  expect(screen.getByText('Objective aligned: 80%')).toBeVisible();
  expect(screen.getByText('Advisory')).toBeVisible();
  expect(screen.queryByText(/passed|certified|correctness verified/i)).not.toBeInTheDocument();
});
it('supports keyboard form submission and moves focus to the advisory result', async () => {
  const { review } = setup();
  await select();
  const objective = screen.getByLabelText('Review objective');
  objective.focus();
  expect(objective).toHaveFocus();
  fireEvent.submit(screen.getByRole('form', { name: 'Selected material disclosure' }));
  await waitFor(() => expect(review).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Material review result' })).toHaveFocus(),
  );
});
it('keeps an unavailable review optional and allows an explicit retry', async () => {
  const { review } = setup({
    ...ready,
    state: 'unavailable',
    dimensions: null,
    safe_error: 'Review unavailable. Your material is kept.',
  });
  fireEvent.click(await select());
  fireEvent.click(await screen.findByRole('button', { name: 'Retry TypeSafe review' }));
  await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  expect(review.mock.calls[0][1].request_id).not.toBe(review.mock.calls[1][1].request_id);
});
it('shows stale results and reloads current selection without sending', async () => {
  const { review, load } = setup({ ...ready, state: 'stale' });
  fireEvent.click(await select());
  fireEvent.click(await screen.findByRole('button', { name: 'Review current material' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(review).toHaveBeenCalledOnce();
});
it('does not render partial or malformed dimensions as successful', async () => {
  setup({ ...ready, dimensions: { answer_supported: 0.9 } } as Result);
  fireEvent.click(await select());
  expect(await screen.findByText('Review unavailable. Your material is kept.')).toBeVisible();
  expect(screen.queryByText('Answer supported: 90%')).not.toBeInTheDocument();
});
it('shows unavailable configuration without hiding material or leaking credentials', async () => {
  const { review } = setup(ready, false);
  const send = await select();
  expect(send).toBeDisabled();
  expect(screen.getByText(/TypeSafe review is not configured/)).toBeVisible();
  expect(screen.getByLabelText('Selected lesson excerpt')).toBeVisible();
  expect(review).not.toHaveBeenCalled();
});

it('generation completion and opening a saved draft never request a TypeSafe review', async () => {
  const state = installWorkspaceBuildApi();
  const review = vi.spyOn(workspacesApi, 'review').mockResolvedValue(ready);
  const sources = vi.spyOn(workspacesApi, 'reviewSources');
  const client = renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  await screen.findByRole('region', { name: 'Build learning material' });
  expect(review).not.toHaveBeenCalled();
  state.jobs = [jobFixture()];
  await client.invalidateQueries({ queryKey: ['workspace-jobs'] });
  fireEvent.click(await screen.findByRole('button', { name: 'Review draft 1' }));
  await screen.findByRole('region', { name: 'Draft advisory review' });
  expect(review).not.toHaveBeenCalled();
  expect(sources).not.toHaveBeenCalled();
});

it.each(['sole objective', 'shortened lesson', 'removed selected question'] as const)(
  'accepting current material resets selection after a same-module %s change',
  async (change) => {
    const { load, review, client } = setup();
    const initial = structuredClone(sources);
    const initialFields = initial.sources[0].snapshot.fields;
    if (change === 'removed selected question') {
      initialFields.quiz = {
        questions: [
          { question: 'One plus one?', options: ['Two', 'Three'], correct_index: 0 },
          { question: 'Two plus two?', options: ['Four', 'Five'], correct_index: 0 },
        ],
      };
    }
    load.mockResolvedValue(initial);
    const send = await select();
    if (change === 'removed selected question') {
      fireEvent.change(screen.getByLabelText('Review question'), { target: { value: '1' } });
    }
    fireEvent.click(send);
    await screen.findByText('Advisory');
    const latest = structuredClone(initial);
    latest.sources[0].revision_marker = 'revision-2';
    latest.sources[0].snapshot.fingerprint = 'hash-2';
    if (change === 'sole objective')
      latest.sources[0].snapshot.fields.objectives = ['Explain addition'];
    if (change === 'shortened lesson')
      latest.sources[0].snapshot.fields.content_markdown = 'One plus one is two.';
    if (change === 'removed selected question')
      latest.sources[0].snapshot.fields.quiz = {
        questions: [{ question: 'One plus one?', options: ['Two', 'Three'], correct_index: 0 }],
      };
    load.mockResolvedValue(latest);
    await client.invalidateQueries({ queryKey: ['workspace-review-sources'] });
    // Background source updates retain the old result as stale until explicitly accepted.
    await screen.findByText('Review stale. The material or selection has changed.');
    expect(review).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Review current material' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send selected material to TypeSafe for review' }),
      ).toBeEnabled(),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Material review result' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Review objective')).toHaveValue(
      change === 'sole objective' ? 'Explain addition' : 'Add numbers',
    );
    expect(screen.getByLabelText('Excerpt end character')).toHaveValue(
      String(latest.sources[0].snapshot.fields.content_markdown).length,
    );
    expect(screen.getByLabelText('Review question')).toHaveValue('0');
    expect(review).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole('button', { name: 'Send selected material to TypeSafe for review' }),
    );
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(review.mock.calls[1][1]).toMatchObject({
      objective: change === 'sole objective' ? 'Explain addition' : 'Add numbers',
      question_index: 0,
      lesson_excerpt: latest.sources[0].snapshot.fields.content_markdown,
      expected_revision_marker: 'revision-2',
      expected_fingerprint: 'hash-2',
    });
  },
);
