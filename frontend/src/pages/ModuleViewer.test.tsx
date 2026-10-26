import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ModuleViewer } from './ModuleViewer';
import { installJourneyApi, makeModule, renderJourney } from '../test/journeyApi';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('counts the final card when flipped, avoids duplicate reviews, and saves Finish', async () => {
  const state = installJourneyApi([makeModule()]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Flashcards (2)' }));
  fireEvent.click(screen.getByText('First question'));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(1));
  fireEvent.click(screen.getByText('First answer'));
  // The last card must be reviewable without a further Next navigation.
  fireEvent.click(screen.getByRole('button', { name: 'Next flashcard' }));
  fireEvent.click(screen.getByText('Last question'));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await screen.findByText('Course saved');
  expect(state.progress.get('m1')?.completed).toBe(true);
  expect(state.progress.get('m1')?.reviews).toBe(2);
});

it('saves completion before moving to the next module', async () => {
  const state = installJourneyApi([makeModule(), makeModule('m2', 1)]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Lesson m2' }));
  await waitFor(() => expect(state.progress.get('m1')?.completed).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Lesson m2' })).toBeInTheDocument();
});

it('stays on the module and shows an error if completion cannot be saved', async () => {
  const state = installJourneyApi([makeModule()]);
  state.failCompletion = true;
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
  expect(await screen.findByText('Could not save your progress. Please try again.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Lesson m1' })).toBeInTheDocument();
  expect(screen.queryByText('Course saved')).not.toBeInTheDocument();
});

it('does not complete or navigate when the final card review fails', async () => {
  const state = installJourneyApi([makeModule()]);
  state.failReview = true;
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Flashcards (2)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await screen.findByText('Could not save your progress. Please try again.');
  expect(state.progress.get('m1')?.completed).toBe(false);
  expect(screen.queryByText('Course saved')).not.toBeInTheDocument();
});
