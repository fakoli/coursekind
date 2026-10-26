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

it('records new events when the same stable card is revisited or resumed after 30 minutes', async () => {
  const module = makeModule();
  module.flashcards[0].id = 'card-first';
  const state = installJourneyApi([module]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Flashcards (2)' }));
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);

  fireEvent.click(screen.getByRole('button', { name: 'Flip flashcard' }));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next flashcard' }));
  expect(state.actions.filter(action => action.action === 'review_flashcard')).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Previous flashcard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Flip flashcard' }));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(2));
  const reviews = state.actions.filter(action => action.action === 'review_flashcard');
  expect(reviews).toHaveLength(2);
  expect(new Set(reviews.map(review => review.event_id)).size).toBe(2);
  expect(new Set(reviews.map(review => review.flashcard_id))).toEqual(new Set(['card-first']));

  fireEvent.click(screen.getByRole('button', { name: 'Flip flashcard' }));
  now += 30 * 60 * 1000 + 1;
  fireEvent.click(screen.getByRole('button', { name: 'Flip flashcard' }));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(3));
  const resumedReviews = state.actions.filter(action => action.action === 'review_flashcard');
  expect(new Set(resumedReviews.map(review => review.event_id)).size).toBe(3);
  expect(new Set(resumedReviews.map(review => review.flashcard_id))).toEqual(new Set(['card-first']));
});

it('freezes the submitted quiz answers while their save is pending', async () => {
  installJourneyApi([makeModule()]);
  const journeyFetch = fetch;
  let submitted: Record<string, unknown> | undefined;
  let finishSave: ((response: Response) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname.replace('/api/v1', '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/progress/modules/c1/m1' && init?.method === 'POST' && body.action === 'submit_quiz') {
      submitted = body;
      return new Promise<Response>(resolve => { finishSave = resolve; });
    }
    return journeyFetch(input, init);
  }));
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Quiz (1)' }));
  fireEvent.click(screen.getByRole('button', { name: '6' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }));
  await waitFor(() => expect(submitted).toEqual(expect.objectContaining({ quiz_score: 0, quiz_answers: { 0: 1 } })));
  expect(screen.getByRole('button', { name: '5' })).toBeDisabled();

  finishSave?.(new Response(JSON.stringify({ id: 'p1' }), { status: 200 }));
  expect(await screen.findByText('Score: 0%')).toBeInTheDocument();
  expect(submitted?.quiz_answers).toEqual({ 0: 1 });
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
  state.failQuiz = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry study save' }));
  expect(await screen.findByText('Score: 100%')).toBeInTheDocument();
  const attempts = state.actions.filter(action => action.action === 'submit_quiz');
  expect(attempts).toHaveLength(2);
  expect(new Set(attempts.map(attempt => attempt.event_id)).size).toBe(1);
  expect(attempts[0].quiz_answers).toEqual(attempts[1].quiz_answers);
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

it('opens cards-only lessons on cards and never offers empty-content credit', async () => {
  const module = makeModule(); module.content_markdown = ''; module.quiz = null;
  installJourneyApi([module]);
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  await screen.findByRole('heading', { name: 'Lesson m1' });
  expect(screen.queryByRole('button', { name: 'Content' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark content read' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Flip flashcard' })).toBeInTheDocument();
});

it('retains earlier failed encounters after a later success and retries original event IDs before Finish', async () => {
  const module = makeModule();
  module.flashcards[0].id = 'first'; module.flashcards[1].id = 'second';
  const state = installJourneyApi([module]);
  const original = fetch;
  let denyFirst = true;
  const attempts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.action === 'review_flashcard') {
      attempts.push(body);
      if (body.flashcard_id === 'first' && denyFirst) return Promise.resolve(new Response(JSON.stringify({detail:'Retry later'}), {status:503}));
    }
    return original(input, init);
  });
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button', { name: 'Flashcards (2)' }));
  fireEvent.click(screen.getByText('First question'));
  await screen.findByRole('button', {name:'Retry study save'});
  fireEvent.click(screen.getByRole('button', { name: 'Next flashcard' }));
  await waitFor(() => expect(attempts.filter(a=>a.flashcard_id === 'first')).toHaveLength(2));
  fireEvent.click(screen.getByText('Last question'));
  await waitFor(() => expect(state.progress.get('m1')?.reviews).toBe(1));
  fireEvent.click(screen.getByRole('button', {name:'Finish'}));
  await screen.findByText('Could not save your progress. Please try again.');
  expect(state.progress.get('m1')?.completed).not.toBe(true);
  denyFirst = false;
  fireEvent.click(screen.getByRole('button', {name:'Finish'}));
  await screen.findByText('Course saved');
  expect(state.progress.get('m1')?.reviews).toBe(2);
  expect(new Set(attempts.filter(a=>a.flashcard_id === 'first').map(a=>a.event_id)).size).toBe(1);
});

it('keeps multiple settled review failures until each original encounter is acknowledged', async () => {
  const module = makeModule();
  module.flashcards = [
    {id:'a',front:'Card A',back:'Answer A'}, {id:'b',front:'Card B',back:'Answer B'},
    {id:'c',front:'Card C',back:'Answer C'},
  ];
  const state = installJourneyApi([module]);
  const original = fetch;
  const failing = new Set(['a','b']);
  const requests: Record<string,unknown>[] = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.action === 'review_flashcard') {
      requests.push(body);
      if (failing.has(body.flashcard_id)) return Promise.resolve(new Response(JSON.stringify({detail:'Unavailable'}),{status:503}));
    }
    return original(input,init);
  });
  renderJourney(<ModuleViewer />, '/courses/c1/modules/m1', '/courses/:courseId/modules/:moduleId');
  fireEvent.click(await screen.findByRole('button',{name:'Flashcards (3)'}));
  fireEvent.click(screen.getByText('Card A'));
  await screen.findByRole('button',{name:'Retry study save'});
  fireEvent.click(screen.getByRole('button',{name:'Next flashcard'}));
  fireEvent.click(screen.getByText('Card B'));
  await screen.findByText(/2 study action\(s\)/);
  fireEvent.click(screen.getByRole('button',{name:'Next flashcard'}));
  fireEvent.click(screen.getByText('Card C'));
  await waitFor(()=>expect(state.progress.get('m1')?.reviews).toBe(1));
  failing.delete('a');
  fireEvent.click(screen.getByRole('button',{name:'Finish'}));
  await screen.findByText('Could not save your progress. Please try again.');
  expect(state.progress.get('m1')?.reviews).toBe(2);
  expect(state.progress.get('m1')?.completed).not.toBe(true);
  failing.delete('b');
  fireEvent.click(screen.getByRole('button',{name:'Finish'}));
  await screen.findByText('Course saved');
  expect(state.progress.get('m1')?.reviews).toBe(3);
  for (const id of ['a','b']) expect(new Set(requests.filter(r=>r.flashcard_id === id).map(r=>r.event_id)).size).toBe(1);
});
