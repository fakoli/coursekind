import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderJourney, makeModule } from '../../test/journeyApi';
import { installWorkspaceBuildApi, planFixture } from '../../test/workspaceBuildApi';
import { useWorkspaceActivity } from '../../hooks/useWorkspaceActivity';
import { useCourseProgress, usePathProgress, useNextUp } from '../../hooks/useProgress';
import { useFlashcardRatingsWithSummary } from '../../hooks/useFlashcardRatings';
import { PlanReview } from './PlanReview';
import { ChangeReview } from './ChangeReview';
import { WorkspaceHistory } from './WorkspaceHistory';
import { workspacesApi } from '../../api/workspaces';
import { flashcardRatingsApi } from '../../api/flashcardRatings';
import { progressApi } from '../../api/progress';
import type { WorkspaceRevision } from '../../types/workspace';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

function StudyProjection() {
  const course = useCourseProgress('c1');
  const path = usePathProgress('p1');
  const next = useNextUp();
  const ratings = useFlashcardRatingsWithSummary('c1', 'm1');
  return <div aria-label="Study projections">
    <p>Course completion {Math.round(course.data?.completion_percentage ?? -1)}%</p>
    <p>Path completion {Math.round(path.data?.completion_percentage ?? -1)}%</p>
    <p>Continue Learning: {next.data?.items.length ?? 0} modules</p>
    <p>Easy cards: {ratings.data?.summary.easy ?? -1}</p>
    <p>Card at index 0: {ratings.data?.ratings.find((rating) => rating.flashcard_index === 0)?.rating ?? 'unrated'}</p>
  </div>;
}
function Harness({ action }: { action: 'plan' | 'content' }) {
  const [view, setView] = useState('study');
  const activity = useWorkspaceActivity('w1');
  return <>
    <button onClick={() => setView('study')}>Back to study</button>
    <button onClick={() => setView('workspace')}>Open workspace actions</button>
    {view === 'study' ? <StudyProjection /> : action === 'plan'
      ? <PlanReview proposal={planFixture} onChanged={activity.refresh} />
      : <><ChangeReview workspaceId="w1" changeId="change-1" onDismiss={() => {}} onChanged={activity.refresh} />
          <WorkspaceHistory workspaceId="w1" onChanged={activity.refresh} /></>}
  </>;
}

it('revisits fresh completed-course, path and Continue Learning caches after additive Apply without reloading', async () => {
  const state = installWorkspaceBuildApi();
  state.journey.modules.forEach((module) => state.journey.progress.set(module.id, { completed: true, reviews: 0 }));
  vi.spyOn(progressApi, 'getPathProgress').mockImplementation(async () => ({
    completion_percentage: 2 / state.journey.modules.length * 100,
  }) as Awaited<ReturnType<typeof progressApi.getPathProgress>>);
  vi.spyOn(progressApi, 'getNextUp').mockImplementation(async () => state.journey.modules.length > 2
    ? { items: [{ item_type: 'module', module_id: 'm3', module_title: 'New lesson', course_id: 'c1', course_title: 'Test course', path_id: 'p1', path_title: 'Test path', reason: 'Continue learning' }] } : { items: [] });
  vi.spyOn(flashcardRatingsApi, 'getRatingsWithSummary').mockResolvedValue({ ratings: [], summary: { total: 0, easy: 0, medium: 0, hard: 0, unhelpful: 0, unrated: 0 } });
  const original = workspacesApi.applyPlan;
  vi.spyOn(workspacesApi, 'applyPlan').mockImplementation(async (...args) => {
    const result = await original(...args);
    state.journey.modules.push(makeModule('m3', 2));
    return result;
  });
  const client = renderJourney(<Harness action="plan" />, '/', '/');
  await screen.findByText('Course completion 100%');
  await screen.findByText('Path completion 100%');
  expect(screen.getByText('Continue Learning: 0 modules')).toBeInTheDocument();
  expect(client.getQueryState(['progress', 'courses', 'c1'])?.isInvalidated).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Open workspace actions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply plan · free' }));
  await waitFor(() => expect(client.getQueryState(['progress', 'courses', 'c1'])?.isInvalidated).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Back to study' }));
  await screen.findByText('Course completion 67%');
  await screen.findByText('Path completion 67%');
  await screen.findByText('Continue Learning: 1 modules');
});

it('refetches fresh index-based rating and filter data after replacement and restore', async () => {
  const state = installWorkspaceBuildApi();
  let originalCard = true;
  vi.spyOn(progressApi, 'getPathProgress').mockResolvedValue({ completion_percentage: 0 } as Awaited<ReturnType<typeof progressApi.getPathProgress>>);
  vi.spyOn(progressApi, 'getNextUp').mockResolvedValue({ items: [] });
  const ratingRead = vi.spyOn(flashcardRatingsApi, 'getRatingsWithSummary').mockImplementation(async () => ({
    ratings: originalCard ? [{ id: 'rating', flashcard_id: 'original-card', flashcard_index: 0, rating: 'easy' }] : [],
    summary: { total: 1, easy: originalCard ? 1 : 0, medium: 0, hard: 0, unhelpful: 0, unrated: originalCard ? 0 : 1 },
  }) as Awaited<ReturnType<typeof flashcardRatingsApi.getRatingsWithSummary>>);
  state.change.patches[0].fields = { flashcards: [{ id: 'replacement-card', front: 'New', back: 'New answer' }] };
  vi.spyOn(workspacesApi, 'applyChange').mockImplementation(async () => { originalCard = false; return { ...state.change, status: 'applied' }; });
  vi.spyOn(workspacesApi, 'restore').mockImplementation(async () => { originalCard = true; return state.change; });
  vi.spyOn(workspacesApi, 'history').mockResolvedValue([{
    id: 'r1', change_id: state.change.id, before: [], after: [], touched_fields: [['flashcards']],
    fingerprint: 'after', current_fingerprint: 'after', parent_revision_id: null,
    restorable: true, kind: 'editorial', created_at: '2026-10-26T12:00:00Z',
  } as WorkspaceRevision]);
  const client = renderJourney(<Harness action="content" />, '/', '/');
  await screen.findByText('Easy cards: 1');
  expect(screen.getByText('Card at index 0: easy')).toBeInTheDocument();
  const key = ['flashcard-ratings', 'with-summary', 'c1', 'm1'];
  client.setQueryData(['flashcard-ratings', 'filtered', 'c1', 'm1', 'easy'], ['original-card']);
  fireEvent.click(screen.getByRole('button', { name: 'Open workspace actions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply draft · free' }));
  await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  expect(client.getQueryState(['flashcard-ratings', 'filtered', 'c1', 'm1', 'easy'])?.isInvalidated).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Back to study' }));
  await screen.findByText('Easy cards: 0');
  expect(screen.getByText('Card at index 0: unrated')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open workspace actions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore prior content · free' }));
  await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Back to study' }));
  await screen.findByText('Easy cards: 1');
  expect(screen.getByText('Card at index 0: easy')).toBeInTheDocument();
  expect(ratingRead).toHaveBeenCalledTimes(3);
});
