import { useMyCourses } from './useCourses';
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { installJourneyApi, makeModule } from '../test/journeyApi';
import { useLearningPath } from './useLearningPaths';
import { useBatchCreateModules, useCreateModule, useDeleteModule } from './useModules';
import { useModuleSuggestions } from './useModuleSuggestions';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/common/ToastProvider';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['create', 'batch', 'delete'] as const)('refreshes an open path card after module %s', async operation => {
  installJourneyApi([makeModule()]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const { result } = renderHook(() => ({ path: useLearningPath('p1'),
    create: useCreateModule(), batch: useBatchCreateModules(), remove: useDeleteModule() }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.path.data?.courses[0].module_count).toBe(1));
  await act(async () => {
    if (operation === 'create') await result.current.create.mutateAsync({ courseId: 'c1', data: { title: 'Second', order_index: 1 } });
    if (operation === 'batch') await result.current.batch.mutateAsync({ courseId: 'c1', modules: [{ title: 'Second', order_index: 1 }] });
    if (operation === 'delete') await result.current.remove.mutateAsync({ courseId: 'c1', moduleId: 'm1' });
  });
  await waitFor(() => expect(result.current.path.data?.courses[0].module_count).toBe(operation === 'delete' ? 0 : 2));
});

it('refreshes an open path after suggested modules with content are created', async () => {
  installJourneyApi([makeModule()]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const { result } = renderHook(() => ({ path: useLearningPath('p1'), suggestions: useModuleSuggestions() }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}><MemoryRouter><ToastProvider>{children}</ToastProvider></MemoryRouter></QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.path.data?.courses[0].module_count).toBe(1));
  await act(async () => { await result.current.suggestions.fetchSuggestions('c1', true); });
  act(() => { result.current.suggestions.setMode('add'); });
  await act(async () => {
    await result.current.suggestions.confirmSuggestions('c1', [{
      id: 'm1', title: 'Lesson m1', order_index: 0, flashcard_count: 2, has_quiz: true,
    }], [], () => {});
  });
  await waitFor(() => expect(result.current.path.data?.courses[0].module_count).toBe(2));
});

it.each(['create','batch','delete'] as const)('refreshes a warmed My Courses count after %s', async operation => {
  const state = installJourneyApi([makeModule()]);
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (String(input).endsWith('/courses/mine')) return Promise.resolve(new Response(JSON.stringify([{...state.course,module_count:state.modules.length}])));
    return original(input,init);
  });
  const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  const {result} = renderHook(()=>({courses:useMyCourses(),create:useCreateModule(),batch:useBatchCreateModules(),remove:useDeleteModule()}), {
    wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(()=>expect(result.current.courses.data?.[0].module_count).toBe(1));
  await act(async()=>{
    if(operation==='create') await result.current.create.mutateAsync({courseId:'c1',data:{title:'Second',order_index:1}});
    if(operation==='batch') await result.current.batch.mutateAsync({courseId:'c1',modules:[{title:'Second',order_index:1}]});
    if(operation==='delete') await result.current.remove.mutateAsync({courseId:'c1',moduleId:'m1'});
  });
  await waitFor(()=>expect(result.current.courses.data?.[0].module_count).toBe(operation==='delete'?0:2));
});
