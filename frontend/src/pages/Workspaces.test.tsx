import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, render } from '@testing-library/react';
import App from '../App';
import { installWorkspaceApi } from '../test/workspaceApi';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
it('creates a private workspace from a goal and opens its saved brief', async () => {
  const state = installWorkspaceApi(false);
  window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  await screen.findByText('No workspaces yet');
  expect(screen.getByRole('link', { name: 'Create a course manually' })).toHaveAttribute('href', '/courses/new');
  fireEvent.change(screen.getByRole('textbox', { name: 'Learning goal' }), { target: { value: 'Understand recursion' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  expect(await screen.findByRole('heading', { name: 'Understand recursion' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Learning goal' })).toHaveValue('Understand recursion');
  expect(state.workspaces[0].brief.goal).toBe('Understand recursion');
  expect(localStorage.getItem('workspace-brief')).toBeNull();
});
it('renders Coursekind identity and all existing navigation destinations', async () => {
  installWorkspaceApi(); window.history.replaceState({}, '', '/workspaces');
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Coursekind' })).toBeInTheDocument();
  for (const name of ['Home', 'Workspaces', 'Courses', 'Paths', 'Settings']) expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0);
});
