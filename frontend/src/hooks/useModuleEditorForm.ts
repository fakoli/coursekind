import { validateActivities } from '../utils/activityValidation';
import { useState, useCallback, useRef } from 'react';
import type { Module, FlashcardData, QuizQuestionData, ModuleCreate, ModuleUpdate } from '../types';

export type EditorTab = 'content' | 'flashcards' | 'quiz' | 'sandbox';

export interface ModuleFormState {
  title: string;
  contentMarkdown: string;
  hasUnsavedChanges: boolean;
}

export function useModuleEditorForm() {
  const [activeTab, setActiveTab] = useState<EditorTab>('content');
  const [title, setTitle] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isInitializedRef = useRef(false);

  const updateTitle = useCallback((value: string) => {
    setTitle(value);
    if (isInitializedRef.current) {
      setHasUnsavedChanges(true);
    }
  }, []);

  const updateContent = useCallback((value: string) => {
    setContentMarkdown(value);
    if (isInitializedRef.current) {
      setHasUnsavedChanges(true);
    }
  }, []);

  const populateFromModule = useCallback((module: Module) => {
    setTitle(module.title);
    setContentMarkdown(module.content_markdown || '');
    setHasUnsavedChanges(false);
    isInitializedRef.current = true;
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setContentMarkdown('');
    setHasUnsavedChanges(false);
    isInitializedRef.current = true;
  }, []);

  const markAsSaved = useCallback(() => {
    setHasUnsavedChanges(false);
  }, []);

  const getCreateData = useCallback(
    (
      orderIndex: number,
      flashcards: FlashcardData[],
      quizQuestions: QuizQuestionData[]
    ): ModuleCreate => {
      validateActivities(flashcards, quizQuestions);
      return {
        title: title.trim(),
        order_index: orderIndex,
        content_markdown: contentMarkdown,
        flashcards,
        quiz:
          quizQuestions.length > 0
            ? {
                questions: quizQuestions,
              }
            : null,
      };
    },
    [title, contentMarkdown]
  );

  const getUpdateData = useCallback(
    (
      flashcards: FlashcardData[],
      quizQuestions: QuizQuestionData[]
    ): ModuleUpdate => {
      validateActivities(flashcards, quizQuestions);
      return {
        title: title.trim(),
        content_markdown: contentMarkdown,
        flashcards,
        quiz:
          quizQuestions.length > 0
            ? {
                questions: quizQuestions,
              }
            : null,
      };
    },
    [title, contentMarkdown]
  );

  return {
    // Tab state
    activeTab,
    setActiveTab,

    // Form state
    title,
    contentMarkdown,
    hasUnsavedChanges,

    // Setters
    updateTitle,
    updateContent,

    // Actions
    populateFromModule,
    resetForm,
    markAsSaved,
    getCreateData,
    getUpdateData,
  };
}
