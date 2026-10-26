import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi, planFixture } from '../../test/workspaceBuildApi';
import { PlanReview } from './PlanReview';
import { Workspace } from '../../pages/Workspace';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('saves assumptions and keyboard reorder for free; does not auto-apply', async () => {
  const state = installWorkspaceBuildApi();
  renderJourney(<PlanReview proposal={planFixture} onChanged={async () => {}} />, '/', '/');
  fireEvent.change(await screen.findByRole('textbox', { name: /Assumptions/ }), {
    target: { value: 'Some experience' },
  });
  const down = screen.getByRole('button', { name: 'Move module 1.1 down' });
  down.focus();
  expect(down).toHaveFocus();
  fireEvent.click(down);
  expect(screen.getByRole('textbox', { name: 'Module 1.1 title' })).toHaveValue('Second');
  expect(screen.getByRole('button', { name: 'Apply plan · free' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save plan edits · free' }));
  await waitFor(() => expect(state.plans[0].version).toBe(2));
  expect(state.plans[0].plan.assumptions).toEqual(['Some experience']);
  expect(state.writes).toHaveLength(1);
  expect(state.plans[0].status).toBe('ready');
});
it('reload discovers a saved ready plan and shows its provider without inference', async () => {
  const state = installWorkspaceBuildApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  expect(await screen.findByRole('textbox', { name: 'Plan title' })).toHaveValue('Learn addition');
  expect(screen.getAllByText(/anvil \/ llm.primary/).length).toBeGreaterThan(0);
  expect(state.writes).toHaveLength(0);
  cleanup();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  await screen.findByRole('button', { name: 'Apply plan · free' });
  expect(state.writes).toHaveLength(0);
});
it('AI refinement leaves live content unchanged and has an explicit stable request', async () => {
  const state = installWorkspaceBuildApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  const input = await screen.findByRole('textbox', {
    name: 'AI refinement instructions',
  });
  fireEvent.change(input, { target: { value: 'Add examples' } });
  state.fail = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await screen.findByText('Synthetic failed request');
  state.fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await waitFor(() => expect(state.writes).toHaveLength(2));
  expect(state.writes[0].body.request_id).toBe(state.writes[1].body.request_id);
  expect(state.writes[1].body.previous_proposal_id).toBe('proposal-1');
  expect(state.journey.modules[0].content_markdown).toBe('');
});

it.each([false, true])('advances a %s dirty mounted brief only after confirmed plan Apply', async (dirty) => {
  const state = installWorkspaceBuildApi();
  renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  const goal = screen.getByRole('textbox', { name: 'Learning goal' });
  if (dirty) fireEvent.change(goal, { target: { value: 'My preserved draft' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Apply plan · free' }));
  await waitFor(() => expect(state.plans[0].status).toBe('applied'));
  if (dirty) expect(goal).toHaveValue('My preserved draft');
  else fireEvent.change(goal, { target: { value: 'My preserved draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await waitFor(() => expect(state.workspace.brief.goal).toBe('My preserved draft'));
  expect(state.writes.at(-1)?.body.expected_version).toBe(2);
  expect(screen.queryByText(/This workspace changed/)).not.toBeInTheDocument();
});

it('keeps a competing external brief save conflicting after a confirmed plan apply', async () => {
  const state = installWorkspaceBuildApi();
  const client = renderJourney(<Workspace />, '/workspaces/w1', '/workspaces/:workspaceId');
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), { target: { value: 'Local draft' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Apply plan · free' }));
  await waitFor(() => expect(state.plans[0].status).toBe('applied'));
  state.workspace.brief = { ...state.workspace.brief, goal: 'Competing saved brief' };
  state.workspace.version = 3;
  await client.invalidateQueries({ queryKey: ['workspace'] });
  await screen.findByRole('heading', { name: 'Competing saved brief' });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  await screen.findByText(/This workspace changed/);
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Local draft');
  expect(state.writes.at(-1)?.body.expected_version).toBe(2);
  expect(state.workspace.brief.goal).toBe('Competing saved brief');
});
