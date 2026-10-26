import { useState, useCallback } from 'react';
import {
  useGenerateModuleContent,
  useGenerateFlashcards,
  useGenerateQuiz,
  useGenerateVisual,
} from './useGeneration';
import { useToast } from './useToast';
import { DEFAULTS, LIMITS } from '../utils/constants';
import type { FlashcardData, QuizQuestionData } from '../types';

export interface GenerationOptions {
  modulePrompt: string;
  flashcardCount: number;
  quizQuestionCount: number;
}

export interface GenerationCallbacks {
  onContentGenerated: (content: string) => void;
  onFlashcardsGenerated: (flashcards: FlashcardData[], replace: boolean) => void;
  onQuizGenerated: (questions: QuizQuestionData[], replace: boolean) => void;
  onVisualGenerated: (markdown: string) => void;
}

export function useModuleGeneration() {
  const { success, error: showError } = useToast();

  // Generation options state
  const [options, setOptions] = useState<GenerationOptions>({
    modulePrompt: '',
    flashcardCount: DEFAULTS.FLASHCARD_COUNT,
    quizQuestionCount: DEFAULTS.QUIZ_QUESTION_COUNT,
  });

  // Generation mutations
  const generateContent = useGenerateModuleContent();
  const generateFlashcards = useGenerateFlashcards();
  const generateQuiz = useGenerateQuiz();
  const generateVisual = useGenerateVisual();

  const isGenerating =
    generateContent.isPending ||
    generateFlashcards.isPending ||
    generateQuiz.isPending ||
    generateVisual.isPending;

  // Update options
  const updateOptions = useCallback((updates: Partial<GenerationOptions>) => {
    setOptions((prev) => ({
      ...prev,
      ...updates,
      flashcardCount:
        updates.flashcardCount !== undefined
          ? Math.max(
              LIMITS.FLASHCARD_MIN,
              Math.min(LIMITS.FLASHCARD_MAX, updates.flashcardCount)
            )
          : prev.flashcardCount,
      quizQuestionCount:
        updates.quizQuestionCount !== undefined
          ? Math.max(LIMITS.QUIZ_MIN, Math.min(LIMITS.QUIZ_MAX, updates.quizQuestionCount))
          : prev.quizQuestionCount,
    }));
  }, []);

  // Generate all content
  const handleGenerateContent = useCallback(
    async (
      courseId: string,
      title: string,
      callbacks: GenerationCallbacks
    ) => {
      if (!title.trim()) {
        showError('Please enter a module title first');
        return;
      }
      if (!options.modulePrompt.trim() || options.modulePrompt.trim().length < LIMITS.MODULE_PROMPT_MIN_LENGTH) {
        showError(`Please enter a module prompt (at least ${LIMITS.MODULE_PROMPT_MIN_LENGTH} characters)`);
        return;
      }

      try {
        const result = await generateContent.mutateAsync({
          course_id: courseId,
          module_title: title.trim(),
          module_prompt: options.modulePrompt.trim(),
          generate_flashcards: true,
          flashcard_count: options.flashcardCount,
          generate_quiz: true,
          quiz_question_count: options.quizQuestionCount,
        });

        callbacks.onContentGenerated(result.content_markdown);
        if (result.flashcards.length > 0) {
          callbacks.onFlashcardsGenerated(result.flashcards, true);
        }
        if (result.quiz && result.quiz.questions.length > 0) {
          callbacks.onQuizGenerated(result.quiz.questions, true);
        }

        success(`Content generated! Used ${result.tokens_used} application credits.`);
      } catch (err) {
        console.error('Failed to generate content:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate content. Please try again.');
      }
    },
    [options, generateContent, success, showError]
  );

  // Generate flashcards only
  const handleGenerateFlashcards = useCallback(
    async (
      courseId: string,
      moduleId: string,
      hasExisting: boolean,
      callbacks: GenerationCallbacks
    ): Promise<'replace' | 'append' | null> => {
      if (!moduleId || moduleId === 'new') {
        showError('Please save the module first before generating flashcards');
        return null;
      }

      try {
        const result = await generateFlashcards.mutateAsync({
          course_id: courseId,
          module_id: moduleId,
          count: options.flashcardCount,
        });

        // Return whether to replace or append - caller decides with ConfirmModal
        success(
          `Generated ${result.flashcards.length} flashcards! Used ${result.tokens_used} application credits.`
        );

        // If no existing, just replace
        if (!hasExisting) {
          callbacks.onFlashcardsGenerated(result.flashcards, true);
          return 'replace';
        }

        // Return the flashcards for the caller to handle
        return 'replace'; // Default - caller should use ConfirmModal to decide
      } catch (err) {
        console.error('Failed to generate flashcards:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate flashcards. Please try again.');
        return null;
      }
    },
    [options.flashcardCount, generateFlashcards, success, showError]
  );

  // Generate flashcards and return the result for manual handling
  const generateFlashcardsAsync = useCallback(
    async (courseId: string, moduleId: string) => {
      if (!moduleId || moduleId === 'new') {
        showError('Please save the module first before generating flashcards');
        return null;
      }

      try {
        const result = await generateFlashcards.mutateAsync({
          course_id: courseId,
          module_id: moduleId,
          count: options.flashcardCount,
        });

        success(
          `Generated ${result.flashcards.length} flashcards! Used ${result.tokens_used} application credits.`
        );

        return result.flashcards;
      } catch (err) {
        console.error('Failed to generate flashcards:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate flashcards. Please try again.');
        return null;
      }
    },
    [options.flashcardCount, generateFlashcards, success, showError]
  );

  // Generate quiz only
  const handleGenerateQuiz = useCallback(
    async (
      courseId: string,
      moduleId: string,
      callbacks: GenerationCallbacks,
      appendMode: boolean = false
    ) => {
      if (!moduleId || moduleId === 'new') {
        showError('Please save the module first before generating a quiz');
        return;
      }

      try {
        const result = await generateQuiz.mutateAsync({
          course_id: courseId,
          module_id: moduleId,
          question_count: options.quizQuestionCount,
        });

        callbacks.onQuizGenerated(result.quiz.questions, !appendMode);
        success(
          `Generated ${result.quiz.questions.length} questions! Used ${result.tokens_used} application credits.`
        );
      } catch (err) {
        console.error('Failed to generate quiz:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate quiz. Please try again.');
      }
    },
    [options.quizQuestionCount, generateQuiz, success, showError]
  );

  // Generate more quiz questions (append mode)
  const generateMoreQuizQuestions = useCallback(
    async (courseId: string, moduleId: string) => {
      if (!moduleId || moduleId === 'new') {
        showError('Please save the module first before generating more questions');
        return null;
      }

      try {
        const result = await generateQuiz.mutateAsync({
          course_id: courseId,
          module_id: moduleId,
          question_count: options.quizQuestionCount,
        });

        success(
          `Generated ${result.quiz.questions.length} more questions! Used ${result.tokens_used} application credits.`
        );

        return result.quiz.questions;
      } catch (err) {
        console.error('Failed to generate more questions:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate more questions. Please try again.');
        return null;
      }
    },
    [options.quizQuestionCount, generateQuiz, success, showError]
  );

  // Generate visual
  const handleGenerateVisual = useCallback(
    async (
      courseId: string,
      moduleId: string,
      description: string,
      callbacks: GenerationCallbacks
    ) => {
      if (!moduleId || moduleId === 'new') {
        showError('Please save the module first before generating visuals');
        return;
      }

      try {
        const result = await generateVisual.mutateAsync({
          course_id: courseId,
          module_id: moduleId,
          description,
          style: 'educational_diagram',
          model: 'flash',
          aspect: 'landscape',
        });

        callbacks.onVisualGenerated('\n' + result.markdown_reference + '\n');
        success(`Visual generated! Used ${result.tokens_used} application credits.`);
      } catch (err) {
        console.error('Failed to generate visual:', err);
        showError(err instanceof Error ? err.message : 'Failed to generate visual. Please try again.');
      }
    },
    [generateVisual, success, showError]
  );

  return {
    options,
    updateOptions,
    isGenerating,
    handleGenerateContent,
    handleGenerateFlashcards,
    generateFlashcardsAsync,
    handleGenerateQuiz,
    generateMoreQuizQuestions,
    handleGenerateVisual,
    isPendingContent: generateContent.isPending,
    isPendingFlashcards: generateFlashcards.isPending,
    isPendingQuiz: generateQuiz.isPending,
    isPendingVisual: generateVisual.isPending,
  };
}
