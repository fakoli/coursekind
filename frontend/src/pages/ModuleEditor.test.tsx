import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Module } from '../types';
import { ModuleEditor } from './ModuleEditor';
import { installJourneyApi, makeModule, renderJourney } from '../test/journeyApi';
import { coursesApi } from '../api/courses';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('persists explicit sandbox removal instead of omitting the update', async () => {
  const module = makeModule();
  module.sandbox = { language: 'python', starter_code: 'print(5)' };
  const state = installJourneyApi([module]);
  renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  await screen.findByDisplayValue('Lesson m1');
  fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Sandbox' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Module updated successfully');
  expect(state.modules[0].sandbox).toBeNull();
});

it('keeps the course outline current after renaming a module in its editor', async () => {
  installJourneyApi([makeModule()]);
  const queryClient = renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  const title = await screen.findByDisplayValue('Lesson m1');
  fireEvent.change(title, { target: { value: 'Renamed in module editor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Module updated successfully');
  const course = await queryClient.fetchQuery({ queryKey: ['course', 'c1'], queryFn: () => coursesApi.get('c1') });
  expect(course.modules[0].title).toBe('Renamed in module editor');
});

it('preserves a sandbox draft during background module refreshes', async () => {
  const module = makeModule();
  module.sandbox = { language: 'python', starter_code: 'print(5)' };
  const state = installJourneyApi([module]);
  const queryClient = renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  await screen.findByDisplayValue('Lesson m1');
  fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
  fireEvent.change(screen.getByDisplayValue('print(5)'), { target: { value: 'print(7)' } });
  state.modules[0].updated_at = '2026-10-25T13:00:00Z';
  state.modules[0].sandbox!.starter_code = 'print(99)';
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['module', 'c1', 'm1'] }); });
  await waitFor(() => expect(queryClient.getQueryData<Module>(['module', 'c1', 'm1'])?.sandbox?.starter_code).toBe('print(99)'));
  expect(screen.getByDisplayValue('print(7)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Module updated successfully');
  expect(state.modules[0].sandbox?.starter_code).toBe('print(7)');
});

it.each(['close', 'escape', 'append', 'replace'] as const)('handles generated flashcards %s explicitly', async choice => {
  const state = installJourneyApi([makeModule()]);
  state.course.ai_enabled = true;
  renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  await screen.findByDisplayValue('Lesson m1');
  fireEvent.click(screen.getByRole('button', { name: /^Flashcards/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
  await screen.findByRole('dialog', { name: 'Replace Flashcards?' });
  if (choice === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
  if (choice === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
  if (choice === 'append') fireEvent.click(screen.getByRole('button', { name: 'Append' }));
  if (choice === 'replace') fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Module updated successfully');
  expect(state.modules[0].flashcards).toHaveLength(choice === 'replace' ? 1 : choice === 'append' ? 3 : 2);
  if (choice === 'close' || choice === 'escape') expect(state.modules[0].flashcards.map(c => c.front)).toEqual(['First question','Last question']);
});
