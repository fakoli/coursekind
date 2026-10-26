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
  expect(state.progress.get('m1')?.completed ?? false).toBe(false);
  expect(screen.queryByText('Course saved')).not.toBeInTheDocument();
});

it('requires an explicit read and never records a passive page load', async () => {
  const state = installJourneyApi([makeModule()]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  await screen.findByRole('heading', { name: 'Lesson m1' });
  expect(state.actions).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Mark content read' }));
  await waitFor(() => expect(state.actions).toContainEqual(expect.objectContaining({ action: 'read_content', event_id: expect.any(String) })));
});

it('uses a native flashcard flip control and sends stable card identity', async () => {
  const module = makeModule();
  module.flashcards[0].id = 'card-first';
  const state = installJourneyApi([module]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Flashcards (2)' }));
  const flip = screen.getByRole('button', { name: /Flip flashcard/ });
  expect(flip.tagName).toBe('BUTTON');
  fireEvent.click(flip);
  await waitFor(() => expect(state.actions).toContainEqual(expect.objectContaining({ action: 'review_flashcard', flashcard_id: 'card-first' })));
  expect(flip.querySelector('button')).toBeNull();
});

it('keeps quiz feedback unsubmitted when the personal save fails', async () => {
  const state = installJourneyApi([makeModule()]);
  state.failQuiz = true;
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Quiz (1)' }));
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }));
  await screen.findByText('Could not save your quiz. Please try again.');
  expect(screen.getByRole('button', { name: 'Submit Quiz' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry Quiz' })).not.toBeInTheDocument();
});

it('persists personal practice drafts across remounts, including an empty draft and Reset', async () => {
  const module = makeModule();
  module.sandbox = { language: 'python', starter_code: 'print(5)' };
  const state = installJourneyApi([module]);
  const mount = () => renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Practice code' }), { target: { value: 'print(7)' } });
  await waitFor(() => expect(state.personal.get('m1')?.practice_code).toBe('print(7)'));
  expect(state.actions.every(a => a.action === 'save_state')).toBe(true);
  cleanup();
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
  expect(await screen.findByRole('textbox', { name: 'Practice code' })).toHaveValue('print(7)');
  fireEvent.change(screen.getByRole('textbox', { name: 'Practice code' }), { target: { value: '' } });
  await waitFor(() => expect(state.personal.get('m1')?.practice_code).toBe(''));
  cleanup();
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
  expect(await screen.findByRole('textbox', { name: 'Practice code' })).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await waitFor(() => expect(state.personal.get('m1')?.practice_code).toBe('print(5)'));
});

it('retains generated personal questions across remounts', async () => {
  const state = installJourneyApi([makeModule()]);
  state.course.ai_enabled = true;
  const mount = () => renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Quiz (1)' }));
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Generate More Questions' }));
  await screen.findByText('2. Extra question?');
  await waitFor(() => expect(state.personal.get('m1')?.extra_quiz_questions).toHaveLength(1));
  expect(state.modules[0].quiz?.questions).toHaveLength(1);
  cleanup();
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Quiz (2)' }));
  expect(await screen.findByText('2. Extra question?')).toBeInTheDocument();
});
