import { api } from './client';
import type {
  GeneratedModuleContent,
  GeneratedVisual,
  GenerateFlashcardsRequest,
  GenerateFlashcardsResponse,
  GenerateModuleContentRequest,
  GenerateQuizRequest,
  GenerateQuizResponse,
  GenerateVisualRequest,
  SuggestModulesRequest,
  SuggestModulesResponse,
} from '../types';

// Keep an operation ID across a failed network attempt; successful repeats are new work.
const pending = new Map<string, string>();
export async function generate<T>(path: string, data: object): Promise<T> {
  const signature = JSON.stringify([path, data]);
  const request_id = pending.get(signature) || crypto.randomUUID();
  if (pending.size > 100) pending.clear();
  pending.set(signature, request_id);
  const result = await api.post<T>(path, {...data, request_id});
  pending.delete(signature);
  return result;
}

export interface FullCourseInput {
  course_id: string; module_suggestions: import('../types').ModuleSuggestion[];
  suggest_modules: boolean; generate_content: boolean; generate_flashcards: boolean;
  flashcard_count_per_module: number; generate_quiz: boolean; quiz_questions_per_module: number;
  replace_existing: boolean; expected_module_ids: string[];
}
export interface FullCourseResult {
  total_tokens_used: number;
  module_statuses: {module_id: string; title: string; success: boolean}[];
}

/**
 * API client for AI-powered content generation.
 *
 * Token costs:
 * - suggestModules: 10 tokens
 * - generateModuleContent: 25 tokens
 * - generateFlashcards: 8 tokens
 * - generateQuiz: 10 tokens
 * - generateVisual: 5 tokens
 */
export const generationApi = {
  generateFullCourse: (request: FullCourseInput) => generate<FullCourseResult>("/generate/full-course", request),
  /**
   * Generate suggested module structure for an AI-enabled course.
   * Uses the course's instructions (purpose, audience, objectives) to suggest
   * a logical module structure.
   *
   * Token cost: 10
   */
  suggestModules: (request: SuggestModulesRequest) =>
    generate<SuggestModulesResponse>('/generate/suggest-modules', request),

  /**
   * Generate full module content including markdown, flashcards, and quiz.
   * Uses the course's instructions and the provided module prompt to generate
   * comprehensive learning content.
   *
   * Token cost: 25
   */
  generateModuleContent: (request: GenerateModuleContentRequest) =>
    generate<GeneratedModuleContent>('/generate/module-content', request),

  /**
   * Generate flashcards from existing module content.
   * Creates flashcards based on the module's markdown content and the
   * course's instructions.
   *
   * Token cost: 8
   */
  generateFlashcards: (request: GenerateFlashcardsRequest) =>
    generate<GenerateFlashcardsResponse>('/generate/flashcards', request),

  /**
   * Generate a quiz from existing module content.
   * Creates multiple-choice questions based on the module's content
   * and existing flashcards.
   *
   * Token cost: 10
   */
  generateQuiz: (request: GenerateQuizRequest) =>
    generate<GenerateQuizResponse>('/generate/quiz', request),

  /**
   * Generate an educational visual using AI image generation.
   * Uses nano-banana-pro (Gemini) to create diagrams, illustrations,
   * and other educational visuals.
   *
   * Token cost: 5
   */
  generateVisual: (request: GenerateVisualRequest) =>
    generate<GeneratedVisual>('/generate/visual', request),
};
