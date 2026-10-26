import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { CourseEditor } from './CourseEditor';
import { installJourneyApi, makeModule, renderJourney } from '../test/journeyApi';
import { modulesApi } from '../api/modules';
import { api } from '../api/client';
import { learningPathsApi } from '../api/learningPaths';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('persists the module title, description and order when creating a course', async () => {
  const state = installJourneyApi();
  renderJourney(<CourseEditor />, '/courses/new', '/courses/new');
  fireEvent.change(await screen.findByLabelText(/Course Title/), { target: { value: 'Python' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add First Module' }));
  fireEvent.change(screen.getByPlaceholderText('Module title'), { target: { value: 'Variables' } });
  fireEvent.change(screen.getByPlaceholderText('Brief description (optional)'), { target: { value: 'Learn assignment' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
  await screen.findByText('Course saved');
  expect(state.modules.map(m => [m.title, m.order_index, m.description])).toEqual([
    ['Variables', 0, 'Learn assignment'],
  ]);
});

it('saves changed outlines without discarding existing module content or sandbox', async () => {
  const original = makeModule();
  original.sandbox = { language: 'python', starter_code: 'print(5)' };
  const state = installJourneyApi([original]);
  renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByDisplayValue('Lesson m1'), { target: { value: 'Renamed lesson' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Module' }));
  const titles = screen.getAllByPlaceholderText('Module title');
  fireEvent.change(titles[1], { target: { value: 'Second lesson' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Course saved');
  expect(state.modules.map(m => m.title)).toEqual(['Renamed lesson', 'Second lesson']);
  expect(state.modules[0].content_markdown).toBe('Existing lesson content');
  expect(state.modules[0].sandbox).toEqual({ language: 'python', starter_code: 'print(5)' });
  expect(state.modules[0].flashcards).toHaveLength(2);
});

it('keeps the editor open on outline save failure and retries without another course', async () => {
  const state = installJourneyApi();
  state.failModuleCreate = true;
  renderJourney(<CourseEditor />, '/courses/new', '/courses/new');
  fireEvent.change(await screen.findByLabelText(/Course Title/), { target: { value: 'Retry course' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add First Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
  await screen.findByText('Failed to save course. Please try again.');
  expect(screen.queryByText('Course saved')).not.toBeInTheDocument();
  state.failModuleCreate = false;
  fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
  await screen.findByText('Course saved');
  await waitFor(() => expect(state.modules).toHaveLength(1));
  expect(state.courseCreates).toBe(1);
});

it('persists outline order and removal while retaining the remaining lessons', async () => {
  const state = installJourneyApi([makeModule(), makeModule('m2', 1), makeModule('m3', 2)]);
  renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move module 2 up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove module 3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Course saved');
  expect(state.modules.slice().sort((a,b) => a.order_index - b.order_index).map(m => m.id))
    .toEqual(['m2', 'm1']);
  expect(state.modules.every(m => m.content_markdown === 'Existing lesson content')).toBe(true);
});

it('retries an atomic failed outline without duplicating modules', async () => {
  const state = installJourneyApi();
  state.failModuleCreateAfter = 1;
  renderJourney(<CourseEditor />, '/courses/new', '/courses/new');
  fireEvent.change(await screen.findByLabelText(/Course Title/), { target: { value: 'Partial save' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add First Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
  await screen.findByText('Failed to save course. Please try again.');
  expect(state.modules).toHaveLength(0);
  state.failModuleCreateAfter = null;
  fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
  await screen.findByText('Course saved');
  expect(state.modules).toHaveLength(2);
  expect(state.courseCreates).toBe(1);
});

it('refreshes a previously opened module after an outline rename', async () => {
  installJourneyApi([makeModule()]);
  const queryClient = renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  await queryClient.fetchQuery({ queryKey: ['module', 'c1', 'm1'], queryFn: () => modulesApi.get('c1', 'm1') });
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByDisplayValue('Lesson m1'), { target: { value: 'Updated heading' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Course saved');
  const reopened = await queryClient.fetchQuery({ queryKey: ['module', 'c1', 'm1'], queryFn: () => modulesApi.get('c1', 'm1') });
  expect(reopened.title).toBe('Updated heading');
});

it('refreshes completion totals after adding an outline to a completed course', async () => {
  const state = installJourneyApi([makeModule()]);
  state.progress.set('m1', { reviews: 2, completed: true });
  const queryClient = renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  const query = { queryKey: ['progress', 'courses', 'c1'], queryFn: () => api.get<{total_modules: number; completion_percentage: number}>('/progress/courses/c1') };
  expect((await queryClient.fetchQuery(query)).completion_percentage).toBe(100);
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Course saved');
  const updated = await queryClient.fetchQuery(query);
  expect(updated.total_modules).toBe(2);
  expect(updated.completion_percentage).toBe(50);
});

it('initializes from the refreshed outline instead of stale cached module titles', async () => {
  const state = installJourneyApi([makeModule()]);
  state.modules[0].title = 'Latest lesson title';
  let release!: () => void;
  state.courseGetDelay = new Promise<void>(resolve => { release = resolve; });
  renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit', client => {
    client.setQueryData(['course', 'c1'], { course: state.course, modules: [{
      id: 'm1', title: 'Stale lesson title', order_index: 0, flashcard_count: 2, has_quiz: true,
    }] });
    void client.invalidateQueries({ queryKey: ['course', 'c1'] });
  });
  await act(async () => { release(); });
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByDisplayValue('Latest lesson title')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Stale lesson title')).not.toBeInTheDocument();
});

it('refreshes a cached path card when course outlines add a module', async () => {
  installJourneyApi([makeModule()]);
  const client = renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  const query = { queryKey: ['path', 'p1'], queryFn: () => learningPathsApi.get('p1') };
  expect((await client.fetchQuery(query)).courses[0].module_count).toBe(1);
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Course saved');
  expect((await client.fetchQuery(query)).courses[0].module_count).toBe(2);
});


it('keeps the stale outline draft and a concurrently added lesson after Save conflicts', async () => {
  const state = installJourneyApi([makeModule()]);
  renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  await screen.findByDisplayValue('Test course');
  fireEvent.click(screen.getByRole('button', {name:'Next'}));
  fireEvent.change(screen.getByDisplayValue('Lesson m1'), {target:{value:'My outline draft'}});
  state.modules.push(makeModule('concurrent', 1));
  fireEvent.click(screen.getByRole('button', {name:'Save Changes'}));
  await screen.findAllByText(/outline changed on the server/);
  expect(screen.getByDisplayValue('My outline draft')).toBeInTheDocument();
  expect(state.modules.map(m=>m.id)).toEqual(['m1','concurrent']);
  expect(screen.queryByText('Course saved')).not.toBeInTheDocument();
});
