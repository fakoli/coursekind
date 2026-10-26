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
  fireEvent.click(await screen.findByRole('button', {name:'Keep my draft'}));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Module updated successfully');
  expect(state.modules[0].sandbox?.starter_code).toBe('print(7)');
});

it.each(['close', 'escape', 'append', 'replace'] as const)('handles generated flashcards %s explicitly', async choice => {
  const state = installJourneyApi([makeModule()]);
  state.course.ai_enabled = true;
  renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  fireEvent.change(await screen.findByDisplayValue('Lesson m1'), {target:{value:'Unsaved generated draft'}});
  fireEvent.change(screen.getByDisplayValue('Existing lesson content'), {target:{value:'Retain local lesson draft'}});
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
  expect(state.modules[0].title).toBe('Unsaved generated draft');
  expect(state.modules[0].content_markdown).toBe('Retain local lesson draft');
  expect(state.modules[0].flashcards).toHaveLength(choice === 'replace' ? 1 : choice === 'append' ? 3 : 2);
  if (choice === 'close' || choice === 'escape') expect(state.modules[0].flashcards.map(c => c.front)).toEqual(['First question','Last question']);
});

it('preserves an incomplete flashcard draft and gives a useful error on Save', async () => {
  const state = installJourneyApi([makeModule()]);
  renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  await screen.findByDisplayValue('Lesson m1');
  fireEvent.click(screen.getByRole('button', { name: /^Flashcards/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Flashcard' }));
  fireEvent.change(screen.getAllByPlaceholderText('What is the question?').at(-1)!, { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(/Flashcard 3: enter both/);
  expect(screen.getByDisplayValue('Keep this draft')).toBeInTheDocument();
  expect(state.modules[0].flashcards).toHaveLength(2);
});

it('preserves dirty title, lesson, cards and quiz when a changed response arrives', async () => {
  const state = installJourneyApi([makeModule()]);
  const client = renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  fireEvent.change(await screen.findByDisplayValue('Lesson m1'), {target:{value:'My draft title'}});
  fireEvent.change(screen.getByDisplayValue('Existing lesson content'), {target:{value:'Unsaved local lesson'}});
  fireEvent.click(screen.getByRole('button', {name:/^Flashcards/}));
  fireEvent.change(screen.getByDisplayValue('First question'), {target:{value:'My draft card'}});
  fireEvent.click(screen.getByRole('button', {name:/^Quiz/}));
  fireEvent.change(screen.getByDisplayValue('Two plus three?'), {target:{value:'My draft quiz'}});
  state.modules[0] = {...state.modules[0], title:'Remote title', updated_at:'2026-10-26T20:00:00Z'};
  await act(async()=>{await client.invalidateQueries({queryKey:['module','c1','m1']});});
  expect(screen.getByDisplayValue('My draft title')).toBeInTheDocument();
  expect(screen.getByDisplayValue('My draft quiz')).toBeInTheDocument();
  expect(await screen.findByText(/changed on the server/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:/Keep my draft/}));
  fireEvent.click(screen.getByRole('button', {name:'Save'}));
  await screen.findByText('Module updated successfully');
  expect(state.modules[0].content_markdown).toBe('Unsaved local lesson');
  expect(state.modules[0].flashcards[0].front).toBe('My draft card');
  expect(state.modules[0].quiz?.questions[0].question).toBe('My draft quiz');
});


it('reloads the server version only after an explicit discard choice', async () => {
  const state = installJourneyApi([makeModule()]);
  const client = renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  fireEvent.change(await screen.findByDisplayValue('Lesson m1'), {target:{value:'Local draft'}});
  state.modules[0] = {...state.modules[0],title:'Updated remotely',content_markdown:'Remote lesson'};
  await act(async()=>{await client.invalidateQueries({queryKey:['module','c1','m1']});});
  fireEvent.click(await screen.findByRole('button',{name:'Reload server version'}));
  expect(screen.getByDisplayValue('Updated remotely')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Remote lesson')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Local draft')).not.toBeInTheDocument();
});
