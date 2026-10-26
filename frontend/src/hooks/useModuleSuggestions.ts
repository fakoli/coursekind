import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuggestModules, useGenerateModuleContent } from './useGeneration';
import { useBatchCreateModules, useDeleteModule } from './useModules';
import { modulesApi } from '../api/modules';
import { useToast } from './useToast';
import { isInsufficientTokensError } from '../utils/errors';
import { GENERATION_COSTS, DEFAULTS, LIMITS } from '../utils/constants';
import type { ModuleSuggestion, ModuleCreate, ModuleSummary } from '../types';
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
  const generateModuleContent = useGenerateModuleContent();
  const batchCreateModules = useBatchCreateModules();
  const deleteModule = useDeleteModule();

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
      success(`Generated ${result.suggestions.length} suggestions! Used ${result.tokens_used} tokens.`);
    } catch (err) {
      console.error('Failed to suggest modules:', err);
      showError('Failed to generate module suggestions. Please try again.');
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
    currentOutlines: ModuleOutline[],
    onSuccess: (newOutlines: ModuleOutline[], isReplace: boolean) => void
  ) => {
    if (selectedIndices.size === 0) return;

    setIsCreating(true);

    try {
      // Delete existing modules if replacing
      if (mode === 'replace' && existingModules && existingModules.length > 0) {
        for (const module of existingModules) {
          await deleteModule.mutateAsync({ courseId, moduleId: module.id });
        }
      }

      const startIndex = mode === 'replace' ? 0 : (existingModules?.length || 0);
      const selectedList = suggestions.filter((_, idx) => selectedIndices.has(idx));

      if (options.generateContent) {
        // Generate and create modules one by one
        setProgress({ current: 0, total: selectedList.length });
        const createdModules: ModuleOutline[] = [];
        let stoppedDueToTokens = false;

        for (let i = 0; i < selectedList.length; i++) {
          const suggestion = selectedList[i];
          setProgress({ current: i + 1, total: selectedList.length });

          try {
            // Generate content for this module
            const generated = await generateModuleContent.mutateAsync({
              course_id: courseId,
              module_title: suggestion.title,
              module_prompt: `${suggestion.description}\n\nObjectives:\n${suggestion.objectives.map(o => `- ${o}`).join('\n')}`,
              generate_flashcards: true,
              flashcard_count: options.flashcardCount,
              generate_quiz: true,
              quiz_question_count: options.quizQuestionCount,
            });

            // Create module with generated content
            const moduleData: ModuleCreate = {
              title: suggestion.title,
              order_index: startIndex + i,
              content_markdown: generated.content_markdown,
              flashcards: generated.flashcards,
              quiz: generated.quiz || undefined,
            };

            const createdModule = await modulesApi.create(courseId, moduleData);
            createdModules.push({
              id: createdModule.id,
              title: createdModule.title,
              description: suggestion.description,
            });
          } catch (err: unknown) {
            console.error(`Failed to generate module ${suggestion.title}:`, err);

            if (isInsufficientTokensError(err)) {
              stoppedDueToTokens = true;
              break;
            }
            // For other errors, continue with next module
          }
        }

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
        queryClient.invalidateQueries({ queryKey: ['course', courseId] });
        queryClient.invalidateQueries({ queryKey: ['path'] });

        if (createdModules.length > 0) {
          onSuccess(createdModules, mode === 'replace');

          if (stoppedDueToTokens) {
            success(`Created ${createdModules.length} of ${selectedList.length} modules with content (stopped due to insufficient tokens).`);
          } else {
            success(`Created ${createdModules.length} modules with content!`);
          }
          closeModal();
        } else if (stoppedDueToTokens) {
          showError('Insufficient tokens. You need at least 25 tokens per module. Please add more tokens and try again.');
        } else {
          showError('Failed to create any modules. Please try again.');
        }
      } else {
        // Create empty modules via batch
        const modulesToCreate: ModuleCreate[] = selectedList.map((suggestion, i) => ({
          title: suggestion.title,
          order_index: startIndex + i,
          content_markdown: '',
          flashcards: [],
          quiz: undefined,
        }));

        const result = await batchCreateModules.mutateAsync({ courseId, modules: modulesToCreate });

        const newOutlines: ModuleOutline[] = result.created.map((m) => ({
          id: m.id,
          title: m.title,
          description: '',
        }));

        onSuccess(newOutlines, mode === 'replace');
        success(`Created ${result.count} modules!`);
        closeModal();
      }
    } catch (err) {
      console.error('Failed to create modules:', err);
      showError('Failed to create modules. Please try again.');
    } finally {
      setIsCreating(false);
      setProgress(null);
    }
  }, [
    selectedIndices,
    mode,
    suggestions,
    options,
    deleteModule,
    generateModuleContent,
    batchCreateModules,
    queryClient,
    closeModal,
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
