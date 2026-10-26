import { useAuthContext } from '../components/common/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ConfirmModal } from '../components/common/ConfirmModal';
import {
  ModuleEditorTabs,
  ContentTab,
  FlashcardsTab,
  QuizTab,
} from '../components/module-editor';
import { SandboxTab } from '../components/module-editor/SandboxTab';
import { useCourse } from '../hooks/useCourses';
import { useModule, useCreateModule, useUpdateModule } from '../hooks/useModules';
import { useModuleEditorForm } from '../hooks/useModuleEditorForm';
import { useFlashcardEditor } from '../hooks/useFlashcardEditor';
import { useQuizEditor } from '../hooks/useQuizEditor';
import { useMarkdownEditor } from '../hooks/useMarkdownEditor';
import { useModuleGeneration } from '../hooks/useModuleGeneration';
import { useToast } from '../hooks/useToast';
import type { FlashcardData, SandboxData } from '../types';

export function ModuleEditor() {
  const { user, isLoading: authLoading } = useAuthContext();
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const isEditing = moduleId !== 'new' && !!moduleId;

  // Data fetching
  const { data: courseData, isLoading: loadingCourse } = useCourse(courseId || '');
  const { data: existingModule, isLoading: loadingModule } = useModule(
    courseId || '',
    isEditing ? moduleId || '' : ''
  );

  // Mutations
  const createModule = useCreateModule();
  const updateModule = useUpdateModule();

  // Custom hooks for state management
  const form = useModuleEditorForm();
  const flashcards = useFlashcardEditor();
  const quiz = useQuizEditor();
  const markdownEditor = useMarkdownEditor(form.contentMarkdown, form.updateContent);
  const generation = useModuleGeneration();

  // Use the loaded sandbox until the learner edits it. A refetch must not
  // overwrite an in-progress draft, including an explicit sandbox removal.
  const editorKey = `${courseId}/${moduleId || 'new'}`;
  const [sandboxDraft, setSandboxDraft] = useState<{
    editorKey: string;
    value: SandboxData | null;
  } | null>(null);
  const sandbox = sandboxDraft?.editorKey === editorKey
    ? sandboxDraft.value
    : existingModule?.sandbox ?? null;

  // Confirm modal for flashcard replacement
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingFlashcards, setPendingFlashcards] = useState<FlashcardData[]>([]);

  // Track sandbox changes
  const handleSandboxChange = useCallback((newSandbox: SandboxData | null) => {
    setSandboxDraft({ editorKey, value: newSandbox });
  }, [editorKey]);

  const { populateFromModule } = form;
  const { setAll: setFlashcards } = flashcards;
  const { setAll: setQuizQuestions } = quiz;

  // Populate form when editing
  useEffect(() => {
    if (existingModule && isEditing) {
      populateFromModule(existingModule);
      setFlashcards(existingModule.flashcards || []);
      setQuizQuestions(existingModule.quiz?.questions || []);
    }
  }, [existingModule, isEditing, populateFromModule, setFlashcards, setQuizQuestions]);

  const isAiEnabled = courseData?.course.ai_enabled ?? false;
  const isSaving = createModule.isPending || updateModule.isPending;
  const isLoading = loadingCourse || (isEditing && loadingModule);

  // Generation callbacks
  const generationCallbacks = {
    onContentGenerated: form.updateContent,
    onFlashcardsGenerated: (cards: FlashcardData[], replace: boolean) => {
      if (replace) flashcards.replaceAll(cards);
      else flashcards.appendAll(cards);
    },
    onQuizGenerated: quiz.replaceAll,
    onVisualGenerated: markdownEditor.insertAtCursor,
  };

  // Handle content generation
  const handleGenerateContent = () => {
    if (!courseId) return;
    generation.handleGenerateContent(courseId, form.title, generationCallbacks);
  };

  // Handle flashcard generation with confirm dialog
  const handleGenerateFlashcards = async () => {
    if (!courseId || !moduleId) return;

    const result = await generation.generateFlashcardsAsync(courseId, moduleId);
    if (result) {
      if (flashcards.flashcards.length > 0) {
        setPendingFlashcards(result);
        setShowReplaceConfirm(true);
      } else {
        flashcards.replaceAll(result);
      }
    }
  };

  // Handle quiz generation
  const handleGenerateQuiz = () => {
    if (!courseId || !moduleId) return;
    generation.handleGenerateQuiz(courseId, moduleId, generationCallbacks);
  };

  // Handle flashcard replace/append confirmation
  const handleConfirmReplaceFlashcards = () => {
    flashcards.replaceAll(pendingFlashcards);
    setPendingFlashcards([]);
    setShowReplaceConfirm(false);
  };

  const handleAppendFlashcards = () => {
    flashcards.appendAll(pendingFlashcards);
    setPendingFlashcards([]);
    setShowReplaceConfirm(false);
  };

  // Save handler
  const handleSave = async () => {
    if (!courseId) return;
    if (!form.title.trim()) {
      showError('Please enter a module title');
      return;
    }

    try {
      if (isEditing && moduleId) {
        await updateModule.mutateAsync({
          courseId,
          moduleId,
          data: {
            ...form.getUpdateData(flashcards.flashcards, quiz.questions),
            sandbox,
          },
        });
        success('Module updated successfully');
        form.markAsSaved();
      } else {
        const orderIndex = courseData?.modules?.length ?? 0;
        const newModule = await createModule.mutateAsync({
          courseId,
          data: {
            ...form.getCreateData(orderIndex, flashcards.flashcards, quiz.questions),
            sandbox: sandbox || undefined,
          },
        });
        success('Module created successfully');
        navigate(`/courses/${courseId}/modules/${newModule.id}`, { replace: true });
        return;
      }
    } catch (err) {
      console.error('Failed to save module:', err);
      showError(err instanceof Error ? err.message : 'Failed to save module. Please try again.');
    }
  };

  if (authLoading) return <p>Checking editing access…</p>;
  if (courseData && (courseData.course.source !== 'database' || courseData.course.author_id !== user?.id)) {
    return <p role="alert">Only the course author can edit modules.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!courseData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Course not found</h2>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <button
            aria-label="Back"
            onClick={() => navigate(`/courses/${courseId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 truncate">{courseData.course.title}</p>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Module' : 'New Module'}
              {isAiEnabled && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  <Sparkles className="w-3 h-3" />
                  AI
                </span>
              )}
            </h1>
          </div>
        </div>
        <Button onClick={handleSave} isLoading={isSaving} className="flex-shrink-0">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </div>

      {/* Module Title */}
      <Input
        id="module-title"
        label="Module Title"
        value={form.title}
        onChange={(e) => form.updateTitle(e.target.value)}
        placeholder="e.g., Introduction to Variables"
        required
      />

      {/* Tabs */}
      <ModuleEditorTabs
        activeTab={form.activeTab}
        onTabChange={form.setActiveTab}
        flashcardCount={flashcards.flashcards.length}
        quizQuestionCount={quiz.questions.length}
        hasSandbox={sandbox !== null}
      />

      {/* Tab Content */}
      {form.activeTab === 'content' && (
        <ContentTab
          contentMarkdown={form.contentMarkdown}
          onContentChange={form.updateContent}
          onInsertMarkdown={markdownEditor.insertMarkdown}
          textareaRef={markdownEditor.textareaRef}
          isAiEnabled={isAiEnabled}
          modulePrompt={generation.options.modulePrompt}
          flashcardCount={generation.options.flashcardCount}
          quizQuestionCount={generation.options.quizQuestionCount}
          title={form.title}
          isGenerating={generation.isPendingContent}
          onPromptChange={(value) => generation.updateOptions({ modulePrompt: value })}
          onFlashcardCountChange={(value) => generation.updateOptions({ flashcardCount: value })}
          onQuizCountChange={(value) => generation.updateOptions({ quizQuestionCount: value })}
          onGenerateContent={handleGenerateContent}
        />
      )}

      {form.activeTab === 'flashcards' && (
        <FlashcardsTab
          flashcards={flashcards.flashcards}
          isAiEnabled={isAiEnabled}
          isEditing={isEditing}
          isGenerating={generation.isPendingFlashcards}
          onAdd={flashcards.addFlashcard}
          onUpdate={flashcards.updateFlashcard}
          onRemove={flashcards.removeFlashcard}
          onMove={flashcards.moveFlashcard}
          onGenerate={handleGenerateFlashcards}
        />
      )}

      {form.activeTab === 'quiz' && (
        <QuizTab
          questions={quiz.questions}
          isAiEnabled={isAiEnabled}
          isEditing={isEditing}
          isGenerating={generation.isPendingQuiz}
          onAdd={quiz.addQuestion}
          onUpdateQuestion={quiz.updateQuestion}
          onUpdateOption={quiz.updateQuestionOption}
          onAddOption={quiz.addOption}
          onRemoveOption={quiz.removeOption}
          onRemove={quiz.removeQuestion}
          onGenerate={handleGenerateQuiz}
        />
      )}

      {form.activeTab === 'sandbox' && (
        <SandboxTab sandbox={sandbox} onChange={handleSandboxChange} />
      )}

      {/* Unsaved changes indicator */}
      {form.hasUnsavedChanges && (
        <div className="fixed bottom-4 right-4 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          You have unsaved changes
        </div>
      )}

      {/* Replace flashcards confirmation modal */}
      <ConfirmModal
        isOpen={showReplaceConfirm}
        onClose={() => {
          setPendingFlashcards([]);
          setShowReplaceConfirm(false);
        }}
        onConfirm={handleConfirmReplaceFlashcards}
        onSecondaryAction={handleAppendFlashcards}
        title="Replace Flashcards?"
        message="Choose Append to keep existing cards or Replace to use only the generated cards. Close this dialog to discard the generated cards."
        confirmLabel="Replace"
        cancelLabel="Append"
        variant="default"
      />
    </div>
  );
}
