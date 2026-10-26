import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi, it, expect, beforeEach } from 'vitest';
import { useModuleSuggestions } from './useModuleSuggestions';
import { generationApi } from '../api/generation';
const mocks = vi.hoisted(()=>({success:vi.fn(),error:vi.fn(),suggest:vi.fn()}));
vi.mock('./useToast',()=>({useToast:()=>mocks}));
vi.mock('./useGeneration',()=>({useSuggestModules:()=>({isPending:false,mutateAsync:mocks.suggest})}));
vi.mock('../api/generation',()=>({generationApi:{generateFullCourse:vi.fn()}}));
const suggestion = {title:'New',description:'Retained description',objectives:['Retained objective']};
function setup() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  return renderHook(()=>useModuleSuggestions(),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
}
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.suggest.mockResolvedValue({tokens_used:10,suggestions:[suggestion]});
});

it('keeps prior modules and drafts on replacement failure; retry sends metadata atomically',async()=>{
  const {result} = setup();
  await act(async()=>result.current.fetchSuggestions('course',true));
  act(()=>result.current.setMode('replace'));
  const saved = [{id:'old',title:'Old',order_index:0,flashcard_count:0,has_quiz:false}];
  const drafts = [{id:'draft',title:'Unsaved',description:'Keep this'}];
  const done = vi.fn();
  vi.mocked(generationApi.generateFullCourse).mockRejectedValueOnce(new Error('Provider unavailable'));
  await act(async()=>result.current.confirmSuggestions('course',saved,drafts,done));
  expect(done).not.toHaveBeenCalled();
  expect(result.current.isOpen).toBe(true);
  expect(drafts[0].description).toBe('Keep this');
  expect(mocks.error).toHaveBeenCalledWith('Provider unavailable');
  expect(generationApi.generateFullCourse).toHaveBeenCalledWith(expect.objectContaining({replace_existing:true,expected_module_ids:['old'],module_suggestions:[suggestion]}));
  vi.mocked(generationApi.generateFullCourse).mockResolvedValueOnce({total_tokens_used:25,module_statuses:[{module_id:'new',title:'New',success:true}]});
  await act(async()=>result.current.confirmSuggestions('course',saved,drafts,done));
  expect(done).toHaveBeenCalledWith([{id:'new',title:'New',description:'Retained description'}],true);
  expect(result.current.isOpen).toBe(false);
});

it('shows sanitized outline failure and leaves dialog closed',async()=>{
  mocks.suggest.mockRejectedValueOnce(new Error('anvil request failed (HTTP 503)'));
  const {result} = setup();
  await act(async()=>result.current.fetchSuggestions('course',false));
  expect(mocks.error).toHaveBeenCalledWith('anvil request failed (HTTP 503)');
  expect(result.current.isOpen).toBe(false);
});

it('creates outline-only suggestions atomically with metadata and zero credits',async()=>{
  const {result} = setup();
  await act(async()=>result.current.fetchSuggestions('course',false));
  act(()=>result.current.updateOptions({generateContent:false}));
  vi.mocked(generationApi.generateFullCourse).mockResolvedValueOnce({total_tokens_used:0,module_statuses:[{module_id:'new',title:'New',success:true}]});
  const done = vi.fn();
  await act(async()=>result.current.confirmSuggestions('course',[],[],done));
  expect(generationApi.generateFullCourse).toHaveBeenCalledWith(expect.objectContaining({generate_content:false,replace_existing:false,module_suggestions:[suggestion]}));
  expect(mocks.success).toHaveBeenCalledWith('Created 1 modules. Used 0 application credits.');
  expect(done).toHaveBeenCalledWith([{id:'new',title:'New',description:'Retained description'}],false);
});
