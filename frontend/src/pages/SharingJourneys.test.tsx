import { useLocation, Routes, Route } from 'react-router-dom';
import { LearningPaths } from './LearningPaths';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { installJourneyApi, makeModule, renderJourney } from '../test/journeyApi';
import { LearningPathDetail } from './LearningPathDetail';
import { CourseDetail } from './CourseDetail';
import { CourseEditor } from './CourseEditor';
import { ModuleEditor } from './ModuleEditor';
import { SharingPanel } from '../components/courses/SharingPanel';
import { useMyCourses } from '../hooks/useCourses';
import { useAddCourseToPath, useDeleteLearningPath, useRemoveCourseFromPath } from '../hooks/useLearningPaths';

function fixture(owner = 'u1') {
  const base = installJourneyApi([makeModule()]);
  const fallback = globalThis.fetch;
  const state = {
    ...base,
    following: false,
    path: { id: 'p1', title: 'Goal path', owner_id: owner, course_ids: ['c1', 'missing'], visibility: 'private',
      difficulty: 'beginner', estimated_hours: null, created_at: base.course.created_at, updated_at: base.course.updated_at },
    recipients: [] as { id: string; name: string; email: string }[],
    timesAdded: 0,
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname.replace('/api/v1', '');
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (data: unknown) => new Response(JSON.stringify(data));
    if (path.endsWith('/sharing') || path.includes('/sharing/')) {
      if (method === 'POST') state.recipients = [{ id: 'u2', name: 'Learner', email: body.email }];
      if (method === 'DELETE') state.recipients = [];
      return reply({ recipients: state.recipients });
    }
    if (path === '/courses/c1' && method === 'PUT') { base.course.visibility = body.visibility; return reply(base.course); }
    if (path === '/courses/mine' || path === '/courses') return reply([{ ...base.course, module_count: 1, times_added: state.timesAdded, own_path_count: 0, other_path_count: state.timesAdded }]);
    if (path === '/courses/discover') return reply({ courses: [], total: 0 });
    if (path === '/paths' || path === '/paths/mine' || path === '/paths/following') return reply([{ ...state.path, course_count: 2 }]);
    if (path === '/paths/p1/follow') { state.following = method === 'POST'; return reply({ is_following: state.following }); }
    if (path === '/paths/p1/courses/reorder') { state.path.course_ids = body.course_ids; return reply(state.path); }
    if (path === '/paths/p1/courses') { state.timesAdded++; return reply(state.path); }
    if (path === '/paths/p1/courses/c1') { state.timesAdded--; return reply(state.path); }
    if (path === '/paths/p1' && method === 'DELETE') { state.timesAdded = 0; return reply({ message: 'Deleted' }); }
    if (path === '/paths/p1') return reply({ path: state.path, courses: [{ ...base.course, module_count: 1 }],
      unavailable_courses: [{ id: 'missing', reason: 'unavailable' }], is_following: state.following });
    return fallback(input, init);
  });
  return state;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it('saves visibility, grants a named recipient, and revokes persistently', async () => {
  const state = fixture();
  renderJourney(<SharingPanel resource="courses" id="c1" visibility="private" />, '/sharing', '/sharing');
  fireEvent.change(await screen.findByLabelText('Visibility'), { target: { value: 'unlisted' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));
  await waitFor(() => expect(state.course.visibility).toBe('unlisted'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Grant access' })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'learner@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  expect(await screen.findByText('Learner (learner@example.test)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access for learner@example.test' }));
  await waitFor(() => expect(state.recipients).toEqual([]));
  await waitFor(() => expect(screen.queryByText('Learner (learner@example.test)')).not.toBeInTheDocument());
});

it('persists follow across a remount and never exposes owner controls', async () => {
  const state = fixture('someone-else');
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  fireEvent.click(await screen.findByRole('button', { name: 'Follow path' }));
  expect(await screen.findByRole('button', { name: 'Unfollow' })).toBeInTheDocument();
  expect(state.following).toBe(true);
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Move .* up/ })).not.toBeInTheDocument();
  expect(screen.getByText('Unavailable course')).toBeInTheDocument();
  expect(screen.getByText('2 courses · 1 unavailable')).toBeInTheDocument();
  cleanup();
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  fireEvent.click(await screen.findByRole('button', { name: 'Unfollow' }));
  expect(await screen.findByRole('button', { name: 'Follow path' })).toBeInTheDocument();
  expect(state.following).toBe(false);
});

it('reorders accessible and unavailable references with labeled keyboard buttons', async () => {
  const state = fixture();
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  const move = await screen.findByRole('button', { name: 'Move Test course down' });
  move.focus();
  expect(move).toHaveFocus();
  fireEvent.click(move);
  await waitFor(() => expect(state.path.course_ids).toEqual(['missing', 'c1']));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move Test course down' })).toBeDisabled());
  cleanup();
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  expect(await screen.findByRole('button', { name: 'Move Test course down' })).toBeDisabled();
});

function ContributionHarness() {
  const courses = useMyCourses();
  const add = useAddCourseToPath();
  const remove = useRemoveCourseFromPath();
  const deletePath = useDeleteLearningPath();
  return <><p>References: {courses.data?.[0]?.times_added}</p>
    <button onClick={() => add.mutate({ pathId: 'p1', courseId: 'c1' })}>Add reference</button>
    <button onClick={() => remove.mutate({ pathId: 'p1', courseId: 'c1' })}>Remove reference</button>
    <button onClick={() => deletePath.mutate('p1')}>Delete path</button></>;
}

it('refreshes author contribution counts after add, remove and path deletion', async () => {
  fixture();
  renderJourney(<ContributionHarness />, '/counts', '/counts');
  expect(await screen.findByText('References: 0')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Add reference'));
  expect(await screen.findByText('References: 1')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Remove reference'));
  expect(await screen.findByText('References: 0')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Add reference'));
  expect(await screen.findByText('References: 1')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Delete path'));
  expect(await screen.findByText('References: 0')).toBeInTheDocument();
});

it('hides author actions and denies direct course and module editor routes', async () => {
  const state = installJourneyApi([makeModule()]);
  state.course.author_id = 'someone-else';
  renderJourney(<CourseDetail />, '/courses/c1', '/courses/:courseId');
  expect(await screen.findByText('Test course')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Sharing' })).not.toBeInTheDocument();
  cleanup();
  renderJourney(<CourseEditor />, '/courses/c1/edit', '/courses/:courseId/edit');
  expect(await screen.findByText('Only the course author can edit this course.')).toBeInTheDocument();
  cleanup();
  renderJourney(<ModuleEditor />, '/courses/c1/modules/m1/edit', '/courses/:courseId/modules/:moduleId/edit');
  expect(await screen.findByText('Only the course author can edit modules.')).toBeInTheDocument();
});

it('reorders modules without following the lesson link and preserves order after reload', async () => {
  const state = installJourneyApi([makeModule('m1', 0), makeModule('m2', 1)]);
  renderJourney(<CourseDetail />, '/courses/c1', '/courses/:courseId');
  const up = await screen.findByRole('button', { name: 'Move Lesson m2 up' });
  expect(up.closest('a')).toBeNull();
  fireEvent.click(up);
  await waitFor(() => expect(state.modules.map(m => m.id)).toEqual(['m2', 'm1']));
  expect(screen.getByRole('heading', { name: 'Test course' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move Lesson m2 up' })).toBeDisabled());
  cleanup();
  renderJourney(<CourseDetail />, '/courses/c1', '/courses/:courseId');
  expect(await screen.findByRole('button', { name: 'Move Lesson m2 up' })).toBeDisabled();
});

function PathCollectionNavigation() {
  return <><Routes><Route index element={<LearningPaths />} /><Route path=":pathId" element={<LearningPathDetail />} /></Routes><PathLocation /></>;
}

function PathLocation() {
  const location = useLocation();
  return <output aria-label="Current location">{location.pathname}{location.search}</output>;
}

it('persists path collections in a validated URL across reload and return navigation', async () => {
  fixture();
  renderJourney(<PathCollectionNavigation />, '/paths', '/paths/*');
  fireEvent.click(await screen.findByRole('button', { name: 'Public & shared paths' }));
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/paths?tab=discover');
  expect(screen.getByRole('button', { name: 'Public & shared paths' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(await screen.findByRole('link', { name: /Goal path/ }));
  expect(await screen.findByRole('heading', { name: 'Goal path' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to paths' }));
  expect(await screen.findByRole('button', { name: 'Public & shared paths' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/paths?tab=discover');
  cleanup();
  renderJourney(<><LearningPaths /><PathLocation /></>, '/paths?tab=discover', '/paths');
  expect(await screen.findByRole('button', { name: 'Public & shared paths' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Following' }));
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/paths?tab=following');
  cleanup();
  renderJourney(<LearningPaths />, '/paths?tab=following', '/paths');
  expect(await screen.findByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true');
  cleanup();
  renderJourney(<LearningPaths />, '/paths?tab=invalid', '/paths');
  expect(await screen.findByRole('button', { name: 'My Paths' })).toHaveAttribute('aria-pressed', 'true');
});

it('lets an owner explicitly follow and unfollow their own plan independently of author controls', async () => {
  const state = fixture();
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  fireEvent.click(await screen.findByRole('button', {name:'Follow path'}));
  await screen.findByRole('button', {name:'Unfollow'});
  expect(screen.getByRole('button', {name:'Edit'})).toBeInTheDocument();
  expect(state.path.owner_id).toBe('u1');
  cleanup();
  renderJourney(<LearningPathDetail />, '/paths/p1', '/paths/:pathId');
  fireEvent.click(await screen.findByRole('button', {name:'Unfollow'}));
  await screen.findByRole('button', {name:'Follow path'});
  expect(state.following).toBe(false);
  expect(state.path.course_ids).toEqual(['c1','missing']);
});
