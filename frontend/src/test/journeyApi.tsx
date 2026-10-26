import { AuthProvider } from '../components/common/AuthProvider';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../components/common/ToastProvider';
import type { Course, Module } from '../types';

export function makeModule(id = 'm1', order = 0): Module {
  return {
    id, course_id: 'c1', title: `Lesson ${id}`, order_index: order,
    content_markdown: 'Existing lesson content',
    flashcards: [{ front: 'First question', back: 'First answer' },
      { front: 'Last question', back: 'Last answer' }],
    quiz: { questions: [{ question: 'Two plus three?', options: ['5', '6'], correct_index: 0 }] },
    sandbox: null, created_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:00:00Z',
  };
}

// A stateful HTTP boundary for component tests. Hooks, mutations, forms,
// navigation, and rendering remain real; assertions inspect saved state.
export function installJourneyApi(modules: Module[] = []) {
  localStorage.setItem('token', 'synthetic-test-token');
  const state = {
    course: {
      id: 'c1', title: 'Test course', description: '', thumbnail_url: null,
      difficulty: 'beginner', tags: [], visibility: 'private', source: 'database',
      author_id: 'u1', author_name: 'Author', ai_enabled: false, instructions: null,
      times_added: 0, created_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:00:00Z',
    } as Course,
    modules: structuredClone(modules),
    progress: new Map<string, { reviews: number; completed: boolean }>(),
    timezone: 'UTC',
    actions: [] as Record<string, unknown>[],
    failQuiz: false,
    failPersonal: false,
    personal: new Map<string, Record<string, unknown>>(),
    failCompletion: false,
    failReview: false,
    failModuleCreate: false,
    failModuleCreateAfter: null as number | null,
    courseCreates: 0,
    courseGetDelay: null as Promise<void> | null,
  };
  const summary = () => state.modules.map(m => ({
    id: m.id, title: m.title, description: m.description || '', order_index: m.order_index,
    flashcard_count: m.flashcards.length, has_quiz: !!m.quiz,
  }));
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname.replace('/api/v1', '');
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (path === '/notifications/preferences') {
      if (method === 'PUT' && body.timezone) state.timezone = body.timezone;
      return reply({ timezone: state.timezone });
    }
    if (path === '/auth/me') return reply({ id: 'u1', name: 'Author', email: 'author@example.test', role: 'user', token_balance: 100 });
    if (path === '/courses' && method === 'POST') {
      state.course = { ...state.course, ...body };
      state.courseCreates++;
      return reply(state.course);
    }
    if (path === '/courses/c1') {
      if (method === 'GET' && state.courseGetDelay) await state.courseGetDelay;
      if (method === 'PUT') state.course = { ...state.course, ...body };
      return reply(method === 'GET' ? { course: state.course, modules: summary() } : state.course);
    }
    if (path === '/paths/p1') return reply({
      path: { id: 'p1', title: 'Test path', description: null, thumbnail_url: null,
        difficulty: 'beginner', estimated_hours: null, owner_id: 'u1', course_ids: ['c1'],
        visibility: 'private', created_at: state.course.created_at, updated_at: state.course.updated_at },
      courses: [{ ...state.course, module_count: state.modules.length }],
    });
    if (path === '/generate/flashcards') return reply({flashcards:[{front:'Generated question',back:'Generated answer'}],tokens_used:8});
    if (path === '/generate/quiz') return reply({ quiz: { questions: [{ question: 'Extra question?', options: ['Yes', 'No'], correct_index: 0 }] }, tokens_used: 1 });
    if (path === '/generate/suggest-modules') return reply({ suggestions: [{
      title: 'Suggested lesson', description: 'Generated outline', objectives: ['Learn addition'], suggested: true,
    }], tokens_used: 10 });
    if (path === '/auth/ai-preferences') return reply({provider:'anvil',model:'llm.primary',is_configured:true,credentials:{},accounting:'application_credits',automatic_fallback:false});
    if (path === '/generate/full-course' && method === 'POST') {
      const created = body.module_suggestions.map((data: {title:string;description:string;objectives:string[]}, index:number) => ({
        ...makeModule(`generated-${state.modules.length + index + 1}`), ...data,
        order_index: (body.replace_existing ? 0 : state.modules.length) + index,
      }));
      state.modules = body.replace_existing ? created : [...state.modules, ...created];
      return reply({total_tokens_used:body.generate_content ? created.length * 25 : 0,
        module_statuses:created.map((m:Module)=>({module_id:m.id,title:m.title,success:true}))});
    }
    if (path === '/generate/module-content') return reply({
      content_markdown: '# Generated lesson', flashcards: [], quiz: null,
      suggested_visuals: [], tokens_used: 25,
    });
    if (path === '/courses/c1/modules/batch' && method === 'POST') {
      const created = body.modules.map((data: Partial<Module>, index: number) => ({
        ...makeModule(`batch-${state.modules.length + index + 1}`), ...data,
      }));
      state.modules.push(...created);
      return reply({ created, count: created.length });
    }
    if (path === '/courses/c1/modules') {
      if (method === 'GET') return reply(summary());
      if (method === 'POST') {
        if (state.failModuleCreate || (state.failModuleCreateAfter !== null
          && state.modules.length >= state.failModuleCreateAfter)) {
          return reply({ detail: 'Module save failed' }, 500);
        }
        const module = { ...makeModule(`new-${state.modules.length + 1}`), flashcards: [], quiz: null, ...body };
        state.modules.push(module);
        return reply(module);
      }
    }
    if (path === '/courses/c1/modules/reorder' && method === 'PUT') {
      state.modules = body.module_ids.map((id: string, order: number) => ({ ...state.modules.find(m => m.id === id), order_index: order }));
      return reply(summary());
    }
    const moduleMatch = path.match(/^\/courses\/c1\/modules\/([^/]+)$/);
    if (moduleMatch) {
      const module = state.modules.find(m => m.id === moduleMatch[1]);
      if (!module) return reply({ detail: 'Missing module' }, 404);
      if (method === 'DELETE') state.modules = state.modules.filter(m => m.id !== module.id);
      if (method === 'PUT') Object.assign(module, body);
      return reply(method === 'DELETE' ? { message: 'Deleted' } : module);
    }
    if (path.includes('/flashcards/ratings')) return reply([]);
    if (path.includes('/flashcards/summary')) return reply({ total: 2, unrated: 2, easy: 0, medium: 0, hard: 0, unhelpful: 0 });
    if (path === '/progress/courses/c1') {
      const completed = state.modules.filter(m => state.progress.get(m.id)?.completed).length;
      return reply({ course_id: 'c1', total_modules: state.modules.length,
        completed_modules: completed, completion_percentage: completed / state.modules.length * 100 });
    }
    const progressMatch = path.match(/^\/progress\/modules\/c1\/([^/]+)$/);
    if (progressMatch) {
      const id = progressMatch[1];
      if (method === "POST") state.actions.push(body);
      if (body.action === "submit_quiz" && state.failQuiz) return reply({ detail: "Quiz save failed" }, 500);
      if (method === 'GET') return reply(state.personal.get(id) ?? null);
      if (body.action === 'save_state' && state.failPersonal) return reply({ detail: 'Personal save failed' }, 500);
      const progress = state.progress.get(id) || { reviews: 0, completed: false };
      if (body.action === 'complete') {
        if (state.failCompletion) return reply({ detail: 'Try again' }, 500);
        progress.completed = true;
      }
      if (body.action === 'review_flashcard') {
        if (state.failReview) return reply({ detail: 'Review failed' }, 500);
        progress.reviews++;
      }
      state.progress.set(id, progress);
      const previous = state.personal.get(id) ?? {};
      const saved = { id: `progress-${id}`, user_id: 'u1', course_id: 'c1', module_id: id,
        status: progress.completed ? 'completed' : 'in_progress', content_read: true,
        started_at: '2026-10-25T12:00:00Z', completed_at: progress.completed ? '2026-10-25T12:01:00Z' : null,
        flashcards_reviewed: progress.reviews, quiz_score: null, quiz_attempts: 0,
        last_quiz_at: null, time_spent_minutes: 0,
        created_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:01:00Z', ...previous,
        ...(body.practice_code !== undefined ? { practice_code: body.practice_code } : {}),
        ...(body.extra_quiz_questions !== undefined ? { extra_quiz_questions: body.extra_quiz_questions } : {}),
      };
      state.personal.set(id, saved);
      return reply(saved);
    }
    return reply({ detail: `Unexpected test request: ${method} ${path}` }, 404);
  });
  return state;
}

export function renderJourney(page: ReactNode, route: string, path: string,
  prepare?: (client: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: Infinity }, mutations: { retry: false },
  } });
  prepare?.(queryClient);
  render(<QueryClientProvider client={queryClient}>
    <AuthProvider><MemoryRouter initialEntries={[route]}><ToastProvider><Routes>
      <Route path={path} element={page} />
      <Route path="/courses/:courseId" element={<p>Course saved</p>} />
    </Routes></ToastProvider></MemoryRouter></AuthProvider>
  </QueryClientProvider>);
  return queryClient;
}
