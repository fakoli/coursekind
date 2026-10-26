import { useAuthContext } from '../components/common/AuthContext';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  BookOpen,
  Sparkles,
  Code,
} from 'lucide-react';
import { Card, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { RatingButtons } from '../components/flashcards/RatingButtons';
import { FlashcardFilter } from '../components/flashcards/FlashcardFilter';
import { CodeSandbox } from '../components/module-editor/CodeSandbox';
import { useModule, useModules } from '../hooks/useModules';
import { useCourse } from '../hooks/useCourses';
import { useUpdateModuleProgress, useModuleProgress } from '../hooks/useProgress';
import { useActiveStudyTime } from '../hooks/useActiveStudyTime';
import type { ExecutionResult } from '../services/codeExecution';
import type { UpdateModuleProgressRequest } from '../api/progress';
import { useModuleGeneration } from '../hooks/useModuleGeneration';
import { useToast } from '../hooks/useToast';
import {
  useFlashcardRatings,
  useFlashcardRatingSummary,
  useRateFlashcard,
} from '../hooks/useFlashcardRatings';
import type { FlashcardFilter as FilterType, FlashcardRating, QuizQuestionData } from '../types';

type ViewTab = 'content' | 'flashcards' | 'quiz' | 'practice';

interface FlashcardReviewEncounter {
  actionKey: string;
  cardKey: string;
  saved: boolean;
  startedAt: number;
}

export function ModuleViewer() {
  const { user } = useAuthContext();
  const { courseId, moduleId } = useParams();
  return <StudyModule key={`${user?.id}:${courseId}:${moduleId}`} />;
}

function StudyModule() {
  const { user } = useAuthContext();
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [isCompleting, setIsCompleting] = useState(false);

  const [requestedTab, setActiveTab] = useState<ViewTab>('content');
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSubmissionPending, setQuizSubmissionPending] = useState(false);
  const [submittedQuizAnswers, setSubmittedQuizAnswers] = useState<Record<number, number> | null>(null);
  const [flashcardFilter, setFlashcardFilter] = useState<FilterType>('all');
  const [localExtraQuestions, setExtraQuizQuestions] = useState<QuizQuestionData[] | null>(null);
  const [localPracticeCode, setLocalPracticeCode] = useState<string | null>(null);
  const [failedStudyAction, setFailedStudyAction] = useState<{key: string; data: UpdateModuleProgressRequest} | null>(null);
  const [personalSaveError, setPersonalSaveError] = useState(false);
  const personalDraft = useRef<UpdateModuleProgressRequest>({ action: 'save_state' });
  const eventRequests = useRef(new Map<string, UpdateModuleProgressRequest>());
  const takeStudyTime = useActiveStudyTime();

  const { data: courseData } = useCourse(courseId || '');
  const { data: module, isLoading, error } = useModule(courseId || '', moduleId || '');
  const { data: modules } = useModules(courseId || '');
  const updateProgress = useUpdateModuleProgress();
  const { data: personal, isLoading: personalLoading, error: personalError } = useModuleProgress(courseId || '', moduleId || '');
  const extraQuizQuestions = useMemo(() => localExtraQuestions ?? personal?.extra_quiz_questions ?? [], [localExtraQuestions, personal?.extra_quiz_questions]);
  const { mutateAsync: mutateProgress } = updateProgress;
  const saveAction = useCallback(async (key: string, data: UpdateModuleProgressRequest) => {
    let request = eventRequests.current.get(key);
    if (!request) {
      request = { ...data, event_id: crypto.randomUUID(), time_spent_seconds: takeStudyTime() };
      eventRequests.current.set(key, request);
    }
    try {
      const result = await mutateProgress({ courseId: courseId!, moduleId: moduleId!, data: request });
      setFailedStudyAction(previous => previous?.key === key ? null : previous);
      return result;
    } catch (error) {
      setFailedStudyAction({ key, data: request });
      throw error;
    }
  }, [courseId, moduleId, mutateProgress, takeStudyTime]);
  const handleExampleExecuted = useCallback(async (_code: string, result: ExecutionResult) => {
    try {
      await saveAction(`example:${crypto.randomUUID()}`, { action: 'practice', practice_result: { success: result.success, output: result.output, error: result.error } });
    } catch { showError('Could not save your example run. Please try again.'); }
  }, [saveAction, showError]);
  const savePersonal = async (data: UpdateModuleProgressRequest) => {
    personalDraft.current = { ...personalDraft.current, ...data, action: 'save_state' };
    try {
      await updateProgress.mutateAsync({ courseId: courseId!, moduleId: moduleId!, data: { ...personalDraft.current } });
      setPersonalSaveError(false);
    } catch { setPersonalSaveError(true); }
  };
  const retryFailedStudySave = async () => {
    const failed = failedStudyAction;
    if (!failed) return;
    const isQuiz = failed.data.action === 'submit_quiz';
    if (isQuiz) setQuizSubmissionPending(true);
    try {
      await saveAction(failed.key, failed.data);
      if (isQuiz) {
        const snapshot = Object.fromEntries(
          Object.entries(failed.data.quiz_answers ?? {}).map(([index, answer]) => [Number(index), answer]),
        );
        setQuizAnswers(snapshot);
        setSubmittedQuizAnswers(snapshot);
        setQuizSubmitted(true);
      }
    } catch {
      // The existing failed action and its idempotency key remain available.
    } finally {
      if (isQuiz) setQuizSubmissionPending(false);
    }
  };

  // Flashcard rating hooks
  const { data: ratingsData } = useFlashcardRatings(courseId || '', moduleId || '');
  const { data: ratingSummary } = useFlashcardRatingSummary(courseId || '', moduleId || '');
  const rateFlashcard = useRateFlashcard();

  // Quiz generation hook
  const { generateMoreQuizQuestions, isPendingQuiz } = useModuleGeneration();

  // Create a map of flashcard index to rating for quick lookup
  const ratingsMap = useMemo(() => {
    const map = new Map<number, FlashcardRating>();
    if (ratingsData) {
      ratingsData.forEach((r) => map.set(r.flashcard_index, r.rating));
    }
    return map;
  }, [ratingsData]);

  const hasTrackedContentRead = useRef(false);
  const flashcardReviewEncounter = useRef<FlashcardReviewEncounter | null>(null);
  const flashcardReviewSequence = useRef(0);
  const pendingFlashcardReviews = useRef(new Map<string, Promise<void>>());

  // Combine module quiz questions with extra generated questions
  const allQuizQuestions = useMemo(() => {
    const moduleQuestions = module?.quiz?.questions || [];
    return [...moduleQuestions, ...extraQuizQuestions];
  }, [module?.quiz?.questions, extraQuizQuestions]);

  const availableTabs: ViewTab[] = [
    ...(module?.content_markdown.trim() ? ['content' as const] : []),
    ...(module?.flashcards.length ? ['flashcards' as const] : []),
    ...(allQuizQuestions.length ? ['quiz' as const] : []),
    ...(module?.sandbox ? ['practice' as const] : []),
  ];
  const activeTab = availableTabs.includes(requestedTab) ? requestedTab : availableTabs[0];

  // Filter flashcards based on selected filter
  const filteredFlashcards = useMemo(() => {
    if (!module?.flashcards) return [];
    if (flashcardFilter === 'all') {
      return module.flashcards.map((fc, i) => ({ ...fc, originalIndex: i }));
    }
    return module.flashcards
      .map((fc, i) => ({ ...fc, originalIndex: i }))
      .filter((fc) => {
        const rating = ratingsMap.get(fc.originalIndex);
        if (flashcardFilter === 'unrated') return rating === undefined;
        return rating === flashcardFilter;
      });
  }, [module?.flashcards, flashcardFilter, ratingsMap]);

  const safeFlashcardIndex = Math.min(currentFlashcardIndex, Math.max(0, filteredFlashcards.length - 1));

  // Handle rating a flashcard
  const trackFlashcardReview = (): Promise<void> => {
    const flashcard = filteredFlashcards[safeFlashcardIndex];
    const cardKey = flashcard?.id ?? `index:${flashcard?.originalIndex}`;
    if (!courseId || !moduleId || !flashcard) return Promise.resolve();
    const now = Date.now();
    let encounter = flashcardReviewEncounter.current;
    if (encounter?.cardKey === cardKey) {
      const pending = pendingFlashcardReviews.current.get(encounter.actionKey);
      if (pending) return pending;
      // An unsaved encounter always retries the same event ID. A saved encounter
      // remains one interaction until the card is left or study resumes after 30m.
      if (!encounter.saved || now - encounter.startedAt <= 30 * 60 * 1000) {
        if (encounter.saved) return Promise.resolve();
      } else {
        encounter = null;
      }
    } else {
      encounter = null;
    }
    if (!encounter) {
      const sequence = ++flashcardReviewSequence.current;
      encounter = {
        actionKey: `card:${cardKey}:encounter:${sequence}`,
        cardKey,
        saved: false,
        startedAt: now,
      };
      flashcardReviewEncounter.current = encounter;
    }
    const pending = pendingFlashcardReviews.current.get(encounter.actionKey);
    if (pending) return pending;
    const currentEncounter = encounter;
    const saved = saveAction(encounter.actionKey, { action: 'review_flashcard', flashcard_id: flashcard.id })
      .then(() => { currentEncounter.saved = true; })
      .catch(error => {
        showError('Could not save your flashcard review. Please try again.');
        throw error;
      })
      .finally(() => { pendingFlashcardReviews.current.delete(currentEncounter.actionKey); });
    pendingFlashcardReviews.current.set(currentEncounter.actionKey, saved);
    return saved;
  };

  const handleFlipFlashcard = () => {
    if (!isFlipped) void trackFlashcardReview().catch(() => {});
    setIsFlipped(!isFlipped);
  };

  const handleRateFlashcard = (rating: FlashcardRating) => {
    if (!courseId || !moduleId) return;
    const flashcard = filteredFlashcards[safeFlashcardIndex];
    if (!flashcard) return;
    void trackFlashcardReview().catch(() => {});

    rateFlashcard.mutate({
      courseId,
      moduleId,
      flashcardIndex: flashcard.originalIndex,
      flashcardId: flashcard.id,
      rating,
    });
  };

  // Reset index when filter changes - MUST be before early returns to follow Rules of Hooks
  useEffect(() => {
    setCurrentFlashcardIndex(0);
    setIsFlipped(false);
    flashcardReviewEncounter.current = null;
  }, [flashcardFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Module not found</h2>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  const isEditable = courseData?.course.source === 'database' && courseData.course.author_id === user?.id;
  const currentModuleIndex = modules?.findIndex((m) => m.id === moduleId) ?? -1;
  const prevModule = currentModuleIndex > 0 ? modules?.[currentModuleIndex - 1] : null;
  const nextModule = modules && currentModuleIndex < modules.length - 1
    ? modules[currentModuleIndex + 1]
    : null;

  const handleFlashcardNav = (direction: 'prev' | 'next') => {
    setIsFlipped(false);

    // Track flashcard review when navigating to next card (indicates user reviewed current card)
    if (direction === 'next') void trackFlashcardReview().catch(() => {});

    if (direction === 'prev' && safeFlashcardIndex > 0) {
      setCurrentFlashcardIndex(safeFlashcardIndex - 1);
      flashcardReviewEncounter.current = null;
    } else if (direction === 'next' && safeFlashcardIndex < filteredFlashcards.length - 1) {
      setCurrentFlashcardIndex(safeFlashcardIndex + 1);
      flashcardReviewEncounter.current = null;
    }
  };

  const handleQuizAnswer = (questionIndex: number, answerIndex: number) => {
    if (!quizSubmitted && !quizSubmissionPending) {
      eventRequests.current.delete('quiz');
      setFailedStudyAction(previous => previous?.key === 'quiz' ? null : previous);
      setQuizAnswers({ ...quizAnswers, [questionIndex]: answerIndex });
    }
  };

  const handleQuizSubmit = async () => {
    if (!courseId || !moduleId || quizSubmissionPending) return;
    const snapshot = { ...quizAnswers };
    const score = Math.round(allQuizQuestions.filter((q, i) => snapshot[i] === q.correct_index).length / allQuizQuestions.length * 100);
    setQuizSubmissionPending(true);
    try {
      await saveAction('quiz', { action: 'submit_quiz', quiz_score: score, quiz_answers: snapshot });
      setSubmittedQuizAnswers(snapshot);
      setQuizSubmitted(true);
    } catch { showError('Could not save your quiz. Please try again.'); }
    finally { setQuizSubmissionPending(false); }
  };

  const calculateQuizScore = () => {
    if (allQuizQuestions.length === 0) return 0;
    const answers = submittedQuizAnswers ?? quizAnswers;
    let correct = 0;
    allQuizQuestions.forEach((q, i) => {
      if (answers[i] === q.correct_index) correct++;
    });
    return Math.round((correct / allQuizQuestions.length) * 100);
  };

  const handleGenerateMoreQuestions = async () => {
    if (!courseId || !moduleId) return;
    const newQuestions = await generateMoreQuizQuestions(courseId, moduleId);
    if (newQuestions) {
      const combined = [...extraQuizQuestions, ...newQuestions];
      setExtraQuizQuestions(combined);
      await savePersonal({ action: 'save_state', extra_quiz_questions: combined });
      setQuizSubmitted(false);
      // Keep existing answers
    }
  };

  const currentFlashcard = filteredFlashcards[safeFlashcardIndex];
  const currentRating = currentFlashcard ? ratingsMap.get(currentFlashcard.originalIndex) : undefined;

  const handleCompleteModule = async () => {
    if (!courseId || !moduleId || isCompleting) return;
    setIsCompleting(true);
    try {
      if (activeTab === 'flashcards') await trackFlashcardReview();
      await Promise.all(pendingFlashcardReviews.current.values());
      await saveAction('complete', { action: 'complete' });
      navigate(nextModule
        ? `/courses/${courseId}/modules/${nextModule.id}`
        : `/courses/${courseId}`);
    } catch {
      showError('Could not save your progress. Please try again.');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <button
            aria-label="Back"
            onClick={() => navigate(`/courses/${courseId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 truncate">{courseData?.course.title}</p>
            <h1 className="text-2xl font-bold text-gray-900 break-words">{module.title}</h1>
          </div>
        </div>
        {isEditable && (
          <Button
            variant="secondary"
            onClick={() => navigate(`/courses/${courseId}/modules/${moduleId}/edit`)}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {failedStudyAction && <div role="alert">A study action has not been saved. <Button disabled={updateProgress.isPending || quizSubmissionPending} onClick={() => { void retryFailedStudySave(); }}>Retry study save</Button></div>}
      {personalSaveError && <div role="alert">Could not save your personal changes. <Button onClick={() => savePersonal(personalDraft.current)}>Retry save</Button></div>}
      {personalError && <p role="alert">Could not load saved study state. Reload before editing your personal practice.</p>}
      {personal?.quiz_attempts ? <p>Saved quiz attempts: {personal.quiz_attempts} · Latest score: {personal.quiz_score}%</p> : null}
      {personal?.quiz_history?.length ? <details><summary>Quiz history</summary><ul>{personal.quiz_history.map((attempt, i) => <li key={i}>{new Date(attempt.created_at).toLocaleString()}: {attempt.score}%</li>)}</ul></details> : null}
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav aria-label="Module study activities" className="-mb-px flex flex-wrap gap-x-4 sm:gap-x-8">
          {module.content_markdown.trim() && <button
            aria-pressed={activeTab === 'content'}
            onClick={() => setActiveTab('content')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'content'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Content
          </button>}
          {module.flashcards.length > 0 && (
            <button
              aria-pressed={activeTab === 'flashcards'}
              onClick={() => setActiveTab('flashcards')}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'flashcards'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              Flashcards ({module.flashcards.length})
            </button>
          )}
          {allQuizQuestions.length > 0 && (
            <button
              aria-pressed={activeTab === 'quiz'}
              onClick={() => setActiveTab('quiz')}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'quiz'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              Quiz ({allQuizQuestions.length})
            </button>
          )}
          {module.sandbox && (
            <button
              aria-pressed={activeTab === 'practice'}
              onClick={() => setActiveTab('practice')}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'practice'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Code className="w-4 h-4" />
              Practice
            </button>
          )}
        </nav>
      </div>

      {/* Content */}
      {availableTabs.length === 0 && <p>This module has no study activities yet. You can return later or explicitly finish it.</p>}
      {activeTab === 'content' && module.content_markdown.trim() && (
        <Card>
          <CardContent>
            <MarkdownRenderer
              content={module.content_markdown || '*No content yet*'}
              enableRunnable
              onCodeExecuted={handleExampleExecuted}
            />
            <Button className="mt-4" disabled={updateProgress.isPending} onClick={async () => {
              try {
                await saveAction('read', { action: 'read_content' });
                hasTrackedContentRead.current = true;
                eventRequests.current.delete('read');
              } catch { showError('Could not save your reading. Please try again.'); }
            }}>{personal?.content_read || hasTrackedContentRead.current ? 'Content read — study again' : 'Mark content read'}</Button>
          </CardContent>
        </Card>
      )}

      {/* Flashcards */}
      {activeTab === 'flashcards' && module.flashcards.length > 0 && (
        <div className="flex flex-col items-center space-y-6">
          {/* Filter dropdown */}
          <div className="w-full max-w-2xl flex justify-end">
            <FlashcardFilter
              currentFilter={flashcardFilter}
              onFilterChange={setFlashcardFilter}
              summary={ratingSummary}
            />
          </div>

          {filteredFlashcards.length === 0 ? (
            <Card className="w-full max-w-2xl">
              <CardContent className="text-center py-12">
                <p className="text-gray-500">No flashcards match this filter.</p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => setFlashcardFilter('all')}
                >
                  Show All Cards
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <button
                type="button"
                aria-label="Flip flashcard"
                aria-pressed={isFlipped}
                onClick={handleFlipFlashcard}
                className="w-full max-w-2xl h-72 cursor-pointer"
                style={{ perspective: '1000px' }}
              >
                <div
                  className="relative w-full h-full transition-transform duration-500"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  {/* Front */}
                  <Card
                    className="absolute w-full h-full flex items-center justify-center p-8"
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    <p className="text-lg text-center">{currentFlashcard?.front}</p>
                  </Card>
                  {/* Back */}
                  <Card
                    className="absolute w-full h-full flex flex-col items-center justify-center p-8 bg-indigo-50"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  >
                    <p className="text-lg text-center mb-4">{currentFlashcard?.back}</p>
                  </Card>
                </div>
              </button>
              {isFlipped && <RatingButtons onRate={handleRateFlashcard} currentRating={currentRating} isLoading={rateFlashcard.isPending} />}

              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  onClick={() => handleFlashcardNav('prev')}
                  aria-label="Previous flashcard"
                  disabled={safeFlashcardIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-500">
                  {safeFlashcardIndex + 1} / {filteredFlashcards.length}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleFlashcardNav('next')}
                  aria-label="Next flashcard"
                  disabled={safeFlashcardIndex === filteredFlashcards.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <p className="text-sm text-gray-500">Click or press Enter/Space to flip · Reviewed {module.flashcards.filter(c => c.id && personal?.reviewed_card_ids?.includes(c.id)).length} of {module.flashcards.length} cards</p>
            </>
          )}
        </div>
      )}

      {/* Quiz */}
      {activeTab === 'quiz' && allQuizQuestions.length > 0 && (
        <div className="space-y-6">
          {quizSubmitted && (
            <Card className="bg-indigo-50">
              <CardContent>
                <div className="text-center">
                  <p className="text-2xl font-bold text-indigo-600">
                    Score: {calculateQuizScore()}%
                  </p>
                  <p className="text-gray-600 mt-1">
                    {calculateQuizScore() >= 70 ? 'Great job!' : 'Keep practicing!'}
                  </p>
                  <div className="flex justify-center gap-3 mt-4">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        eventRequests.current.delete('quiz');
                        setQuizAnswers({});
                        setSubmittedQuizAnswers(null);
                        setQuizSubmitted(false);
                      }}
                    >
                      Retry Quiz
                    </Button>
                    {courseData?.course.ai_enabled && (
                      <Button
                        onClick={handleGenerateMoreQuestions}
                        disabled={isPendingQuiz}
                        isLoading={isPendingQuiz}
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate More Questions
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {allQuizQuestions.map((question, qIndex) => (
            <Card key={qIndex}>
              <CardContent>
                <p className="font-medium mb-4">
                  {qIndex + 1}. {question.question}
                </p>
                <div className="space-y-2">
                  {question.options.map((option, oIndex) => {
                    const displayedAnswers = quizSubmitted && submittedQuizAnswers
                      ? submittedQuizAnswers
                      : quizAnswers;
                    const isSelected = displayedAnswers[qIndex] === oIndex;
                    const isCorrect = question.correct_index === oIndex;
                    let optionClass = 'border-gray-200 hover:border-indigo-300';

                    if (quizSubmitted) {
                      if (isCorrect) {
                        optionClass = 'border-green-500 bg-green-50';
                      } else if (isSelected && !isCorrect) {
                        optionClass = 'border-red-500 bg-red-50';
                      }
                    } else if (isSelected) {
                      optionClass = 'border-indigo-500 bg-indigo-50';
                    }

                    return (
                      <button
                        key={oIndex}
                        aria-pressed={quizAnswers[qIndex] === oIndex}
                        onClick={() => handleQuizAnswer(qIndex, oIndex)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${optionClass}`}
                        disabled={quizSubmitted || quizSubmissionPending}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {quizSubmitted && question.explanation && (
                  <p className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    <strong>Explanation:</strong> {question.explanation}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {!quizSubmitted && (
            <Button
              onClick={handleQuizSubmit}
              disabled={quizSubmissionPending || Object.keys(quizAnswers).length !== allQuizQuestions.length}
              isLoading={quizSubmissionPending}
            >
              Submit Quiz
            </Button>
          )}
        </div>
      )}

      {/* Practice Sandbox */}
      {activeTab === 'practice' && module.sandbox && (
        <Card>
          <CardContent>
            {personalLoading ? <p>Loading saved practice…</p> : personalError ? null : <CodeSandbox
              key={`${courseId}:${moduleId}`}
              sandbox={module.sandbox}
              savedCode={localPracticeCode ?? personal?.practice_code ?? undefined}
              onCodeChange={code => {
                setLocalPracticeCode(code);
                void savePersonal({ action: 'save_state', practice_code: code });
              }}
              onExecuted={async (code, result) => {
                try {
                  await saveAction(`practice:${crypto.randomUUID()}`, { action: 'practice', practice_code: code,
                    practice_result: { success: result.success, output: result.output, error: result.error } });
                } catch { showError('Could not save your practice run. Please try again.'); }
              }}
            />}
            {personal?.practice_history?.length ? <details><summary>Saved practice runs: {personal.practice_history.length}</summary><ol className="space-y-3">{personal.practice_history.map((attempt, index) => <li key={index}><p>{new Date(attempt.created_at).toLocaleString()} · {attempt.result.success ? 'Executed' : 'Execution error'}</p><pre className="text-sm whitespace-pre-wrap">{attempt.result.output || attempt.result.error}</pre></li>)}</ol></details> : null}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t">
        {prevModule ? (
          <Button
            variant="secondary"
            onClick={() => navigate(`/courses/${courseId}/modules/${prevModule.id}`)}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {prevModule.title}
          </Button>
        ) : (
          <div />
        )}
        {nextModule ? (
          <Button
            onClick={handleCompleteModule}
            isLoading={isCompleting}
          >
            {nextModule.title}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleCompleteModule} isLoading={isCompleting}>
            Finish
          </Button>
        )}
      </div>
    </div>
  );
}
