import { useAuthContext } from '../components/common/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import {
  CourseStepper,
  CourseInfoStep,
  CourseInstructionsStep,
  CourseModulesStep,
  ModuleSuggestionModal,
} from '../components/course-editor';
import { useCourse, useCreateCourse, useUpdateCourse } from '../hooks/useCourses';
import { useModules } from '../hooks/useModules';
import { useCourseEditorForm } from '../hooks/useCourseEditorForm';
import { useCourseSteps } from '../hooks/useCourseSteps';
import { useModuleOutlines } from '../hooks/useModuleOutlines';
import { useModuleSuggestions } from '../hooks/useModuleSuggestions';
import { useToast } from '../hooks/useToast';
import type { ModuleSummary } from '../types';
import { saveModuleOutlines } from '../services/saveModuleOutlines';

export function CourseEditor() {
  const { user, isLoading: authLoading } = useAuthContext();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const isEditing = !!courseId;
  const queryClient = useQueryClient();
  const initializedCourse = useRef<string | null>(null);
  const createdCourseId = useRef<string | null>(null);
  const initialOutlines = useRef<ModuleSummary[]>([]);
  const outlineSave = useRef<{signature:string;id:string} | null>(null);
  const [outlineConflict, setOutlineConflict] = useState('');
  const [savingOutlines, setSavingOutlines] = useState(false);

  // Data fetching
  const { data: existingCourse, isLoading: loadingCourse, isFetching: refreshingCourse,
    error: courseLoadError, refetch: reloadCourse } = useCourse(courseId || '');
  const { data: existingModules } = useModules(courseId || '');

  // Mutations
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();

  // Custom hooks for state management
  const form = useCourseEditorForm();
  const steps = useCourseSteps(form.formState.aiEnabled);
  const outlines = useModuleOutlines();
  const suggestions = useModuleSuggestions();
  const { populateFromCourse } = form;
  const { populateFromModules } = outlines;

  // Populate form when editing
  useEffect(() => {
    if (existingCourse && isEditing && !refreshingCourse && !courseLoadError
      && initializedCourse.current !== courseId) {
      populateFromCourse(existingCourse.course);
      populateFromModules(existingCourse.modules);
      initialOutlines.current = existingCourse.modules.map(module => ({...module}));
      initializedCourse.current = courseId!;
    }
  }, [existingCourse, isEditing, refreshingCourse, courseLoadError, courseId,
    populateFromCourse, populateFromModules]);

  // Validation
  const isStepValid = (step: string): boolean => {
    const { formState } = form;
    switch (step) {
      case 'info':
        return formState.title.trim().length > 0;
      case 'instructions':
        return (
          formState.instructions.purpose.trim().length > 0 &&
          formState.instructions.target_audience.trim().length > 0 &&
          formState.instructions.tone.trim().length > 0
        );
      case 'modules':
        return true;
      default:
        return true;
    }
  };

  const canProceed = isStepValid(steps.currentStep);
  const isSaving = createCourse.isPending || updateCourse.isPending || savingOutlines;

  // Save handler
  const handleSave = async () => {
    if (isSaving) return;
    if (!form.formState.title.trim()) {
      showError('Please enter a course title');
      return;
    }

    const desiredOutlines = outlines.outlines.map(outline => ({ ...outline }));
    if (desiredOutlines.some(outline => !outline.title.trim())) {
      showError('Please enter a title for every module');
      return;
    }

    setSavingOutlines(true);
    try {
      let targetId = courseId || createdCourseId.current;
      if (targetId) {
        await updateCourse.mutateAsync({ courseId: targetId, data: form.getUpdateData() });
      } else {
        const newCourse = await createCourse.mutateAsync(form.getCreateData());
        targetId = newCourse.id;
        createdCourseId.current = targetId;
      }
      const signature = JSON.stringify(desiredOutlines);
      if (outlineSave.current?.signature !== signature) {
        outlineSave.current = {signature, id:crypto.randomUUID()};
      }
      await saveModuleOutlines(targetId, desiredOutlines, initialOutlines.current, outlineSave.current.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['course', targetId] }),
        queryClient.invalidateQueries({ queryKey: ['modules', targetId] }),
        queryClient.invalidateQueries({ queryKey: ['module', targetId] }),
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['paths'] }),
        queryClient.invalidateQueries({ queryKey: ['path'] }),
      ]);
      success(isEditing ? 'Course updated successfully' : 'Course created successfully');
      navigate(`/courses/${targetId}`);
    } catch (err) {
      console.error('Failed to save course:', err);
      if (err instanceof Error && err.message.includes('outline changed')) setOutlineConflict(err.message);
      showError(err instanceof Error && err.message.includes('outline changed')
        ? err.message : 'Failed to save course. Please try again.');
    } finally {
      setSavingOutlines(false);
    }
  };

  // Handle suggest modules
  const handleSuggestModules = () => {
    if (!isEditing || !courseId) {
      showError('Please save the course first before generating module suggestions');
      return;
    }
    suggestions.fetchSuggestions(courseId, (existingModules?.length || 0) > 0);
  };

  // Handle confirm suggestions
  const handleConfirmSuggestions = () => {
    if (!courseId) return;
    suggestions.confirmSuggestions(
      courseId,
      existingModules,
      outlines.outlines,
      (newOutlines, isReplace) => {
        // Only acknowledge modules created by this explicit generation operation.
        // Never adopt unfamiliar server additions into a stale destructive draft.
        const generatedIds = new Set(newOutlines.map(outline => outline.id));
        const refreshed = queryClient.getQueryData<ModuleSummary[]>(['modules', courseId]) || [];
        const generated = refreshed.filter(module => generatedIds.has(module.id));
        initialOutlines.current = isReplace ? generated : [...initialOutlines.current, ...generated];
        outlineSave.current = null;
        if (isReplace) {
          outlines.replaceOutlines(newOutlines);
        } else {
          outlines.appendOutlines(newOutlines);
        }
      }
    );
  };

  if (isEditing && authLoading) return <p>Checking editing access…</p>;
  if (isEditing && existingCourse && (existingCourse.course.source !== 'database' || existingCourse.course.author_id !== user?.id)) {
    return <p role="alert">Only the course author can edit this course.</p>;
  }

  if (isEditing && courseLoadError && initializedCourse.current !== courseId) {
    return <div role="alert">
      <p>Could not load the latest course. Please try again.</p>
      <Button onClick={() => reloadCourse()}>Retry</Button>
    </div>;
  }

  if (isEditing && (loadingCourse || initializedCourse.current !== courseId)) {
    return (
      <div className="space-y-6 page-enter">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          aria-label="Back"
            onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Course' : 'Create Course'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isEditing ? 'Update your course details' : 'Build a new learning experience'}
          </p>
        </div>
      </div>

      {outlineConflict && <div role="alert"><p>{outlineConflict}</p>
        <a href={`/courses/${courseId || createdCourseId.current}/edit`} target="_blank" rel="noopener noreferrer" className="underline">Open latest course in a new tab</a>
      </div>}
      {/* Stepper */}
      <CourseStepper
        steps={steps.visibleSteps}
        currentStep={steps.currentStep}
        currentStepIndex={steps.currentStepIndex}
        onStepClick={steps.setCurrentStep}
      />

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {steps.currentStep === 'info' && (
            <CourseInfoStep
              title={form.formState.title}
              description={form.formState.description}
              difficulty={form.formState.difficulty}
              tags={form.formState.tags}
              tagInput={form.formState.tagInput}
              aiEnabled={form.formState.aiEnabled}
              onTitleChange={form.setTitle}
              onDescriptionChange={form.setDescription}
              onDifficultyChange={form.setDifficulty}
              onTagInputChange={form.setTagInput}
              onAddTag={form.addTag}
              onRemoveTag={form.removeTag}
              onAiEnabledChange={form.setAiEnabled}
            />
          )}

          {steps.currentStep === 'instructions' && (
            <CourseInstructionsStep
              instructions={form.formState.instructions}
              onUpdateInstructions={form.updateInstructions}
              onAddObjective={form.addObjective}
              onUpdateObjective={form.updateObjective}
              onRemoveObjective={form.removeObjective}
              onMoveObjective={form.moveObjective}
            />
          )}

          {steps.currentStep === 'modules' && (
            <CourseModulesStep
              outlines={outlines.outlines}
              aiEnabled={form.formState.aiEnabled}
              isEditing={isEditing}
              isSuggestPending={suggestions.isFetching}
              onAddModule={outlines.addOutline}
              onUpdateModule={outlines.updateOutline}
              onRemoveModule={outlines.removeOutline}
              onMoveModule={outlines.moveOutline}
              onSuggestModules={handleSuggestModules}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={steps.goBack} disabled={steps.isFirstStep}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex gap-2">
          {!steps.isLastStep ? (
            <Button onClick={steps.goToNext} disabled={!canProceed}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} isLoading={isSaving} disabled={!canProceed}>
              {isEditing ? 'Save Changes' : 'Create Course'}
            </Button>
          )}
        </div>
      </div>

      {/* AI Suggestion Modal */}
      <ModuleSuggestionModal
        isOpen={suggestions.isOpen}
        onClose={suggestions.closeModal}
        suggestions={suggestions.suggestions}
        selectedIndices={suggestions.selectedIndices}
        mode={suggestions.mode}
        onModeChange={suggestions.setMode}
        isCreating={suggestions.isCreating}
        progress={suggestions.progress}
        existingModules={existingModules}
        options={suggestions.options}
        onOptionsChange={suggestions.updateOptions}
        onToggleSuggestion={suggestions.toggleSuggestion}
        onSelectAll={suggestions.selectAll}
        onSelectNone={suggestions.selectNone}
        onConfirm={handleConfirmSuggestions}
      />
    </div>
  );
}
