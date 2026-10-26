import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useUpdateModuleProgress } from '../hooks/useProgress';
import { useModuleGeneration } from '../hooks/useModuleGeneration';
import { useToast } from '../hooks/useToast';
import {
  useFlashcardRatings,
  useFlashcardRatingSummary,
  useRateFlashcard,
} from '../hooks/useFlashcardRatings';
import type { FlashcardFilter as FilterType, FlashcardRating, QuizQuestionData } from '../types';

type ViewTab = 'content' | 'flashcards' | 'quiz' | 'practice';

export function ModuleViewer() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [isCompleting, setIsCompleting] = useState(false);

  const [activeTab, setActiveTab] = useState<ViewTab>('content');
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [flashcardFilter, setFlashcardFilter] = useState<FilterType>('all');
  const [extraQuizQuestions, setExtraQuizQuestions] = useState<QuizQuestionData[]>([]);

  const { data: courseData } = useCourse(courseId || '');
  const { data: module, isLoading, error } = useModule(courseId || '', moduleId || '');
  const { data: modules } = useModules(courseId || '');
  const updateProgress = useUpdateModuleProgress();
  const { mutate: saveContentProgress } = updateProgress;

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
  const trackedFlashcardReviews = useRef(new Set<number>());
  const pendingFlashcardReviews = useRef(new Map<number, Promise<void>>());

  // Reset tracking when module changes
  useEffect(() => {
    hasTrackedContentRead.current = false;
    trackedFlashcardReviews.current = new Set();
    pendingFlashcardReviews.current = new Map();
    setCurrentFlashcardIndex(0);
    setFlashcardFilter('all');
    setExtraQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setActiveTab('content');
    setIsFlipped(false);
  }, [moduleId]);

  // Reset the previous module's refs before recording a cached next module.
  useEffect(() => {
    if (activeTab === 'content' && courseId && moduleId && !hasTrackedContentRead.current && module) {
      hasTrackedContentRead.current = true;
      saveContentProgress({ courseId, moduleId, data: { action: 'read_content' } });
    }
  }, [activeTab, courseId, moduleId, module, saveContentProgress]);

  // Combine module quiz questions with extra generated questions
  const allQuizQuestions = useMemo(() => {
    const moduleQuestions = module?.quiz?.questions || [];
    return [...moduleQuestions, ...extraQuizQuestions];
  }, [module?.quiz?.questions, extraQuizQuestions]);

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

  // Handle rating a flashcard
  const trackFlashcardReview = (): Promise<void> => {
    const flashcard = filteredFlashcards[currentFlashcardIndex];
    if (!courseId || !moduleId || !flashcard
      || trackedFlashcardReviews.current.has(flashcard.originalIndex)) return Promise.resolve();
    const trackedReviews = trackedFlashcardReviews.current;
    const pendingReviews = pendingFlashcardReviews.current;
    const pending = pendingReviews.get(flashcard.originalIndex);
    if (pending) return pending;
    const saved = updateProgress.mutateAsync({ courseId, moduleId, data: { action: 'review_flashcard' } })
      .then(() => { trackedReviews.add(flashcard.originalIndex); })
      .catch(error => {
        showError('Could not save your flashcard review. Please try again.');
        throw error;
      })
      .finally(() => { pendingReviews.delete(flashcard.originalIndex); });
    pendingReviews.set(flashcard.originalIndex, saved);
    return saved;
  };

  const handleFlipFlashcard = () => {
    if (!isFlipped) void trackFlashcardReview().catch(() => {});
    setIsFlipped(!isFlipped);
  };

  const handleRateFlashcard = (rating: FlashcardRating) => {
    if (!courseId || !moduleId) return;
    const flashcard = filteredFlashcards[currentFlashcardIndex];
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

  const isEditable = courseData?.course.source === 'database';
  const currentModuleIndex = modules?.findIndex((m) => m.id === moduleId) ?? -1;
  const prevModule = currentModuleIndex > 0 ? modules?.[currentModuleIndex - 1] : null;
  const nextModule = modules && currentModuleIndex < modules.length - 1
    ? modules[currentModuleIndex + 1]
    : null;

  const handleFlashcardNav = (direction: 'prev' | 'next') => {
    setIsFlipped(false);

    // Track flashcard review when navigating to next card (indicates user reviewed current card)
    if (direction === 'next') void trackFlashcardReview().catch(() => {});

    if (direction === 'prev' && currentFlashcardIndex > 0) {
      setCurrentFlashcardIndex(currentFlashcardIndex - 1);
    } else if (direction === 'next' && currentFlashcardIndex < filteredFlashcards.length - 1) {
      setCurrentFlashcardIndex(currentFlashcardIndex + 1);
    }
  };

  const handleQuizAnswer = (questionIndex: number, answerIndex: number) => {
    if (!quizSubmitted) {
      setQuizAnswers({ ...quizAnswers, [questionIndex]: answerIndex });
    }
  };

  const handleQuizSubmit = () => {
    setQuizSubmitted(true);

    // Track quiz submission with score
    if (courseId && moduleId && allQuizQuestions.length > 0) {
      let correct = 0;
      allQuizQuestions.forEach((q, i) => {
        if (quizAnswers[i] === q.correct_index) correct++;
      });
      const score = Math.round((correct / allQuizQuestions.length) * 100);

      updateProgress.mutate({
        courseId,
        moduleId,
        data: { action: 'submit_quiz', quiz_score: score },
      });
    }
  };

  const calculateQuizScore = () => {
    if (allQuizQuestions.length === 0) return 0;
    let correct = 0;
    allQuizQuestions.forEach((q, i) => {
      if (quizAnswers[i] === q.correct_index) correct++;
    });
    return Math.round((correct / allQuizQuestions.length) * 100);
  };

  const handleGenerateMoreQuestions = async () => {
    if (!courseId || !moduleId) return;
    const newQuestions = await generateMoreQuizQuestions(courseId, moduleId);
    if (newQuestions) {
      setExtraQuizQuestions((prev) => [...prev, ...newQuestions]);
      setQuizSubmitted(false);
      // Keep existing answers
    }
  };

  const currentFlashcard = filteredFlashcards[currentFlashcardIndex];
  const currentRating = currentFlashcard ? ratingsMap.get(currentFlashcard.originalIndex) : undefined;

  const handleCompleteModule = async () => {
    if (!courseId || !moduleId || isCompleting) return;
    setIsCompleting(true);
    try {
      if (activeTab === 'flashcards') await trackFlashcardReview();
      await Promise.all(pendingFlashcardReviews.current.values());
      await updateProgress.mutateAsync({ courseId, moduleId, data: { action: 'complete' } });
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

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('content')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'content'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Content
          </button>
          {module.flashcards.length > 0 && (
            <button
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
      {activeTab === 'content' && (
        <Card>
          <CardContent>
            <MarkdownRenderer
              content={module.content_markdown || '*No content yet*'}
              enableRunnable
            />
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
              <div
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
                    <div onClick={(e) => e.stopPropagation()}>
                      <RatingButtons
                        onRate={handleRateFlashcard}
                        currentRating={currentRating}
                        isLoading={rateFlashcard.isPending}
                      />
                    </div>
                  </Card>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  onClick={() => handleFlashcardNav('prev')}
                  aria-label="Previous flashcard"
                  disabled={currentFlashcardIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-500">
                  {currentFlashcardIndex + 1} / {filteredFlashcards.length}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleFlashcardNav('next')}
                  aria-label="Next flashcard"
                  disabled={currentFlashcardIndex === filteredFlashcards.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <p className="text-sm text-gray-500">Click the card to flip</p>
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
                        setQuizAnswers({});
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
                    const isSelected = quizAnswers[qIndex] === oIndex;
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
                        onClick={() => handleQuizAnswer(qIndex, oIndex)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${optionClass}`}
                        disabled={quizSubmitted}
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
              disabled={Object.keys(quizAnswers).length !== allQuizQuestions.length}
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
            <CodeSandbox sandbox={module.sandbox} />
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
