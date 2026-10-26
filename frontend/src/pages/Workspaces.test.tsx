import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, render } from '@testing-library/react';
import App from '../App';
import { installWorkspaceApi } from '../test/workspaceApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('creates a private workspace from a goal and opens its saved brief', async () => {
  const state = installWorkspaceApi(false);
  window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  await screen.findByText('No workspaces yet');
  expect(screen.getByRole('link', { name: 'Create a course manually' })).toHaveAttribute(
    'href',
    '/courses/new',
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), {
    target: { value: 'Understand recursion' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  expect(await screen.findByRole('heading', { name: 'Understand recursion' })).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue(
    'Understand recursion',
  );
  expect(state.workspaces[0].brief.goal).toBe('Understand recursion');
  expect(
    Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.getItem(localStorage.key(i)!),
    ).join(' '),
  ).not.toContain('Understand recursion');
});
it('renders Coursekind identity and all existing navigation destinations', async () => {
  installWorkspaceApi();
  window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Coursekind' })).toBeInTheDocument();
  for (const name of ['Home', 'Workspaces', 'Courses', 'Paths', 'Settings'])
    expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0);
});
it.each([
  ['/courses/c1', 'source_course_id', 'c1'],
  ['/paths/p1', 'source_path_id', 'p1'],
])(
  'opens owned material from %s in a workspace with its original ID',
  async (route, sourceField, id) => {
    const state = installWorkspaceApi();
    window.history.replaceState({}, '', route);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open in workspace' }));
    fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
    expect(await screen.findByRole('heading', { name: 'Learning brief' })).toBeInTheDocument();
    expect(state.writes[0][sourceField]).toBe(id);
    const workspace = state.workspaces.at(-1)!;
    expect(workspace.course_ids).toEqual(['c1']);
    if (sourceField === 'source_path_id') expect(workspace.path_id).toBe('p1');
    else expect(state.workspaces).toHaveLength(1);
  },
);
it('lists archives separately and opens the retained saved brief', async () => {
  const state = installWorkspaceApi();
  state.workspaces[0].archived = true;
  window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  await screen.findByText('No workspaces yet');
  fireEvent.click(screen.getByLabelText('Show archived workspaces'));
  fireEvent.click(await screen.findByRole('link', { name: /Learn Python.*Archived/ }));
  expect(await screen.findByText(/Archived workspace/)).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  fireEvent.click(await screen.findByText('Saved brief · edit goal and defaults'));
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Learn Python');
});
it.each(['/login', '/register'])('shows Coursekind on the %s auth screen', async (route) => {
  installWorkspaceApi();
  localStorage.clear();
  window.history.replaceState({}, '', route);
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Coursekind' })).toBeInTheDocument();
});

it('keeps goal-only defaults valid when empty activity counts are disabled before creation', async () => {
  const state = installWorkspaceApi(false);
  window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  await screen.findByText('No workspaces yet');
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), { target: { value: 'Learn safely' } });
  fireEvent.change(screen.getByLabelText('Flashcard count'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Quiz question count'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByLabelText('Include flashcards'));
  fireEvent.click(screen.getByLabelText('Include quiz'));
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await screen.findByRole('heading', { name: 'Learn safely' });
  expect(state.workspaces[0].brief).toMatchObject({ flashcard_count: 5, quiz_question_count: 3, generate_flashcards: false, generate_quiz: false });
});
