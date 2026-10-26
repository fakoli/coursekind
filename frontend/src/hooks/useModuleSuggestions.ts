import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuggestModules } from './useGeneration';
import { generationApi } from '../api/generation';
import { useToast } from './useToast';
import { GENERATION_COSTS, DEFAULTS, LIMITS } from '../utils/constants';
import type { ModuleSuggestion, ModuleSummary } from '../types';
import type { ModuleOutline } from './useModuleOutlines';

export type SuggestionMode = 'add' | 'replace' | null;

export interface GenerationOptions {
  generateContent: boolean;
  flashcardCount: number;
  quizQuestionCount: number;
}

export interface GenerationProgress {
  current: number;
  total: number;
}

export function useModuleSuggestions() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Modal state
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ModuleSuggestion[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<SuggestionMode>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  // Generation options
  const [options, setOptions] = useState<GenerationOptions>({
    generateContent: true,
    flashcardCount: DEFAULTS.FLASHCARD_COUNT,
    quizQuestionCount: DEFAULTS.QUIZ_QUESTION_COUNT,
  });

  // Mutations
  const suggestModules = useSuggestModules();

  // Open modal with suggestions
  const openModal = useCallback((newSuggestions: ModuleSuggestion[], hasExistingModules: boolean) => {
    setSuggestions(newSuggestions);
    setSelectedIndices(new Set(newSuggestions.map((_, i) => i)));
    setMode(hasExistingModules ? null : 'add');
    setIsOpen(true);
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    if (!isCreating) {
      setIsOpen(false);
      setSuggestions([]);
      setSelectedIndices(new Set());
      setMode(null);
      setProgress(null);
    }
  }, [isCreating]);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async (
    courseId: string,
    hasExistingModules: boolean
  ) => {
    try {
      const result = await suggestModules.mutateAsync({ course_id: courseId });
      openModal(result.suggestions, hasExistingModules);
      success(`Generated ${result.suggestions.length} suggestions! Used ${result.tokens_used} application credits.`);
    } catch (err) {
      console.error('Failed to suggest modules:', err);
      showError(err instanceof Error ? err.message : 'Failed to generate module suggestions. Please try again.');
    }
  }, [suggestModules, openModal, success, showError]);

  // Toggle suggestion selection
  const toggleSuggestion = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        newSelected.add(index);
      }
      return newSelected;
    });
  }, []);

  // Select all/none
  const selectAll = useCallback(() => {
    setSelectedIndices(new Set(suggestions.map((_, i) => i)));
  }, [suggestions]);

  const selectNone = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  // Update generation options
  const updateOptions = useCallback((updates: Partial<GenerationOptions>) => {
    setOptions((prev) => ({
      ...prev,
      ...updates,
      flashcardCount: updates.flashcardCount !== undefined
        ? Math.max(LIMITS.FLASHCARD_MIN, Math.min(LIMITS.FLASHCARD_MAX, updates.flashcardCount))
        : prev.flashcardCount,
      quizQuestionCount: updates.quizQuestionCount !== undefined
        ? Math.max(LIMITS.QUIZ_MIN, Math.min(LIMITS.QUIZ_MAX, updates.quizQuestionCount))
        : prev.quizQuestionCount,
    }));
  }, []);

  // Confirm and create modules
  const confirmSuggestions = useCallback(async (
    courseId: string,
    existingModules: ModuleSummary[] | undefined,
    _currentOutlines: ModuleOutline[],
    onSuccess: (newOutlines: ModuleOutline[], isReplace: boolean) => void
  ) => {
    if (selectedIndices.size === 0) return;

    setIsCreating(true);

    try {
      const selectedList = suggestions.filter((_, idx) => selectedIndices.has(idx));
      setProgress({ current: 0, total: selectedList.length });
      const result = await generationApi.generateFullCourse({
        course_id: courseId,
        module_suggestions: selectedList,
        suggest_modules: false,
        generate_content: options.generateContent,
        generate_flashcards: true,
        flashcard_count_per_module: options.flashcardCount,
        generate_quiz: true,
        quiz_questions_per_module: options.quizQuestionCount,
        replace_existing: mode === 'replace',
        expected_module_ids: existingModules?.map(m => m.id) || [],
      });
      const newOutlines = result.module_statuses.map((module, index) => ({
        id: module.module_id, title: module.title,
        description: selectedList[index].description,
      }));
      await queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
      await queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      await queryClient.invalidateQueries({ queryKey: ['path'] });
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      await queryClient.invalidateQueries({ queryKey: ['progress'] });
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      onSuccess(newOutlines, mode === 'replace');
      success(`Created ${newOutlines.length} modules. Used ${result.total_tokens_used} application credits.`);
      setIsOpen(false);
      setSuggestions([]);
      setSelectedIndices(new Set());
      setMode(null);
    } catch (err) {
      console.error('Failed to create modules:', err);
      showError(err instanceof Error ? err.message : 'Failed to create modules. Your existing modules and drafts are unchanged.');
    } finally {
      setIsCreating(false);
      setProgress(null);
    }
  }, [
    selectedIndices,
    mode,
    suggestions,
    options,
    queryClient,
    success,
    showError,
  ]);

  // Calculate estimated token cost
  const estimatedTokens = selectedIndices.size * GENERATION_COSTS.MODULE_CONTENT;

  return {
    // Modal state
    isOpen,
    suggestions,
    selectedIndices,
    mode,
    setMode,
    isCreating,
    progress,

    // Generation options
    options,
    updateOptions,

    // Actions
    fetchSuggestions,
    closeModal,
    toggleSuggestion,
    selectAll,
    selectNone,
    confirmSuggestions,

    // Loading states
    isFetching: suggestModules.isPending,

    // Calculated values
    estimatedTokens,
  };
}
