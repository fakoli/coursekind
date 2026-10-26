import type { WorkspaceBrief, Workspace } from '../types/workspace';
import { vi } from 'vitest';
import { installJourneyApi } from './journeyApi';

export const briefFixture: WorkspaceBrief = {
  goal: 'Learn Python',
  scope: 'course',
  prior_knowledge: '',
  audience: '',
  weekly_hours: null,
  generate_flashcards: true,
  flashcard_count: 5,
  generate_quiz: true,
  quiz_question_count: 3,
};
export const workspaceFixture: Workspace = {
  id: 'w1',
  owner_id: 'u1',
  brief: briefFixture,
  archived: false,
  version: 1,
  course_ids: ['c1'],
  path_id: null,
  created_at: '2026-10-26T12:00:00Z',
  updated_at: '2026-10-26T12:00:00Z',
};

export function installWorkspaceApi(initial = true) {
  installJourneyApi();
  const baseline = fetch;
  const state = {
    workspaces: initial ? [structuredClone(workspaceFixture)] : [],
    failSave: false,
    stale: false,
    writes: [] as Record<string, unknown>[],
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    if (!url.pathname.includes('/workspaces')) return baseline(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const method = init?.method || 'GET';
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === 'POST') {
      const existing = state.workspaces.find(
        (w) =>
          !w.archived &&
          (body.source_course_id
            ? !w.path_id && w.course_ids.includes(body.source_course_id)
            : body.source_path_id
              ? w.path_id === body.source_path_id
              : false),
      );
      if (existing) {
        state.writes.push(body);
        return reply(existing);
      }
      const w: Workspace = {
        ...structuredClone(workspaceFixture),
        id: `w${state.workspaces.length + 1}`,
        brief: { ...briefFixture, ...body.brief },
        course_ids: body.source_course_id
          ? [body.source_course_id]
          : body.source_path_id
            ? ['c1']
            : [],
        path_id: body.source_path_id || null,
      };
      state.workspaces.push(w);
      state.writes.push(body);
      return reply(w);
    }
    if (url.pathname.endsWith('/workspaces'))
      return reply(
        state.workspaces.filter(
          (w) => w.archived === (url.searchParams.get('archived') === 'true'),
        ),
      );
    const w = state.workspaces.find((w) => url.pathname.endsWith(w.id));
    if (!w) return reply({ detail: 'Workspace not found' }, 404);
    if (method === 'PUT') {
      state.writes.push(body);
      if (state.stale) return reply({ detail: 'Workspace changed' }, 409);
      if (state.failSave) return reply({ detail: 'Save unavailable' }, 500);
      Object.assign(
        w,
        body.brief ? { brief: body.brief } : {},
        body.archived !== undefined ? { archived: body.archived } : {},
        { version: w.version + 1 },
      );
    }
    return reply(w);
  });
  return state;
}
