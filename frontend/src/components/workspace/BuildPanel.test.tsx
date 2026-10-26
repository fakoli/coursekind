import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi, jobFixture } from '../../test/workspaceBuildApi';
import { Workspace } from '../../pages/Workspace';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('defaults to one incomplete module with five cards and three questions', async () => {
  const state = installWorkspaceBuildApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const panel = await screen.findByRole('region', {
    name: 'Build learning material',
  });
  expect(await within(panel).findByRole('checkbox', { name: /Lesson m1/ })).toBeChecked();
  expect(within(panel).getByRole('checkbox', { name: /Lesson m2/ })).not.toBeChecked();
  fireEvent.click(within(panel).getByRole('button', { name: 'Build selected modules' }));
  await waitFor(() => expect(state.writes).toHaveLength(1));
  expect(state.writes[0].body).toMatchObject({
    module_ids: ['m1'],
    flashcard_count: 5,
    quiz_question_count: 3,
  });
  expect(state.journey.modules[0].content_markdown).toBe('');
});
it('a failed second step retains the first draft on reload; dismiss does not mutate', async () => {
  const state = installWorkspaceBuildApi();
  const job = jobFixture();
  job.state = 'partial';
  job.steps.push({
    ...job.steps[0],
    id: 's2',
    state: 'failed',
    output_ref: null,
    credits: 0,
    safe_error: 'No credits charged for step 2.',
  });
  state.jobs = [job];
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const reviewButton = await screen.findByRole('button', { name: 'Review draft 1' });
  reviewButton.focus();
  fireEvent.click(reviewButton);
  expect(await screen.findByRole('heading', { name: 'Proposed lesson' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Draft review' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss review' }));
  expect(reviewButton).toHaveFocus();
  expect(state.writes).toHaveLength(0);
  expect(state.journey.modules[0].content_markdown).toBe('');
  expect(screen.getByRole('checkbox', { name: 'Retry step 2' })).toBeInTheDocument();
  cleanup();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  expect(await screen.findByRole('button', { name: 'Review draft 1' })).toBeInTheDocument();
});
it('only the explicit apply click changes live content and offers study', async () => {
  const state = installWorkspaceBuildApi();
  state.jobs = [jobFixture()];
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByRole('button', { name: 'Review draft 1' }));
  const apply = await screen.findByRole('button', {
    name: 'Apply draft · free',
  });
  expect(state.writes).toHaveLength(0);
  fireEvent.click(apply);
  expect(await screen.findByRole('link', { name: 'Study this module' })).toHaveAttribute(
    'href',
    '/courses/c1/modules/m1',
  );
  expect(state.change.revision_id).toBe('rev1');
  expect(state.journey.modules[0].content_markdown).toBe('# Proposed lesson');
});

it('normalizes disabled activity counts while retaining enabled count validation', async () => {
  const state = installWorkspaceBuildApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const panel = await screen.findByRole('region', {
    name: 'Build learning material',
  });
  await within(panel).findByRole('checkbox', { name: /Lesson m1/ });
  fireEvent.change(within(panel).getByLabelText('Build flashcard count'), {
    target: { value: '' },
  });
  fireEvent.change(within(panel).getByLabelText('Build question count'), {
    target: { value: '' },
  });
  expect(within(panel).getByRole('button', { name: 'Build selected modules' })).toBeDisabled();
  fireEvent.click(within(panel).getByLabelText('Generate flashcards'));
  fireEvent.click(within(panel).getByLabelText('Generate quiz'));
  fireEvent.click(within(panel).getByRole('button', { name: 'Build selected modules' }));
  await waitFor(() => expect(state.writes).toHaveLength(1));
  expect(state.writes[0].body).toMatchObject({
    generate_flashcards: false,
    flashcard_count: 5,
    generate_quiz: false,
    quiz_question_count: 3,
  });
});

it('shows quota recovery guidance without discarding a saved workspace or brief draft', async () => {
  installWorkspaceBuildApi();
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.endsWith('/auth/tokens')
      ? Promise.resolve(new Response(JSON.stringify({ balance: 15 })))
      : original(input, init),
  );
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const panel = await screen.findByRole('region', {
    name: 'Build learning material',
  });
  expect(
    await within(panel).findByText('Available Anvil budget: 15 application credits.'),
  ).toBeInTheDocument();
  expect(panel).toHaveTextContent('This selection needs 25 credits');
  expect(panel).toHaveTextContent('not money');
  fireEvent.click(screen.getByText('Saved brief · edit goal and defaults'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Keep my draft' },
  });
  fireEvent.click(screen.getByText('Saved brief · edit goal and defaults'));
  fireEvent.click(screen.getByRole('link', { name: 'Brief' }));
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Keep my draft');
});
