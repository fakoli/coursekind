import { SharingPanel } from '../components/courses/SharingPanel';
import { useAuthContext } from '../components/common/AuthProvider';
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  BookOpen,
  Sparkles,
  Plus,
  FileText,
  HelpCircle,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useCourse, useDeleteCourse } from '../hooks/useCourses';
import { useDeleteModule, useReorderModules } from '../hooks/useModules';
import { useCourseProgress } from '../hooks/useProgress';
import { useToast } from '../hooks/useToast';
import type { ModuleSummary, CourseDifficulty, ModuleProgressStatus } from '../types';

const difficultyColors: Record<CourseDifficulty, { bg: string; text: string }> = {
  beginner: { bg: 'bg-green-100', text: 'text-green-700' },
  intermediate: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  advanced: { bg: 'bg-red-100', text: 'text-red-700' },
};

export function CourseDetail() {
  const { user } = useAuthContext();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const { data, isLoading, error } = useCourse(courseId || '');
  const { data: progressData } = useCourseProgress(courseId || '');
  const deleteCourse = useDeleteCourse();
  const deleteModule = useDeleteModule();
  const reorderModules = useReorderModules();

  // Create a map of module progress for easy lookup
  const moduleProgressMap = new Map<string, ModuleProgressStatus>();
  if (progressData?.modules) {
    progressData.modules.forEach((mp) => {
      moduleProgressMap.set(mp.module_id, mp);
    });
  }

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState<ModuleSummary | null>(null);

  const handleDeleteCourse = async () => {
    if (!courseId) return;
    try {
      await deleteCourse.mutateAsync(courseId);
      success('Course deleted successfully');
      navigate('/courses');
    } catch (err) {
      console.error('Failed to delete course:', err);
      showError('Failed to delete course. Please try again.');
    }
  };

  const handleDeleteModule = async () => {
    if (!courseId || !moduleToDelete) return;
    try {
      await deleteModule.mutateAsync({ courseId, moduleId: moduleToDelete.id });
      success('Module deleted successfully');
      setModuleToDelete(null);
    } catch (err) {
      console.error('Failed to delete module:', err);
      showError('Failed to delete module. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Course not found</h2>
        <p className="text-gray-500 mt-2">The course you're looking for doesn't exist.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/courses')}>
          Back to Courses
        </Button>
      </div>
    );
  }

  const { course, modules } = data;
  const colors = difficultyColors[course.difficulty];
  const isEditable = course.source === 'database' && course.author_id === user?.id;

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 break-words">{course.title}</h1>
              {course.ai_enabled && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium flex-shrink-0"
                  title="AI-Assisted Course"
                >
                  <Sparkles className="w-3 h-3" />
                  AI
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              by {course.author_name} · {modules.length} modules
            </p>
          </div>
        </div>
        {isEditable && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/courses/${courseId}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {isEditable && <SharingPanel resource="courses" id={course.id} visibility={course.visibility} />}
      <p className="text-sm text-gray-600">Used in {course.times_added} paths: {course.own_path_count ?? 0} by the author, {course.other_path_count ?? 0} by other owners.</p>
      {/* Course Info */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {course.description && (
              <p className="text-gray-600 w-full">{course.description}</p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}>
                {course.difficulty}
              </span>
              {course.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Course Progress */}
      {progressData && progressData.total_modules > 0 && (
        <Card>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {progressData.completed_modules} of {progressData.total_modules} modules completed
                </span>
                <span className="font-medium text-indigo-600">
                  {progressData.completion_percentage}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressData.completion_percentage}%` }}
                />
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                {progressData.average_quiz_score !== null && (
                  <span>Avg Quiz Score: {progressData.average_quiz_score}%</span>
                )}
                {progressData.total_time_spent_minutes > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {Math.round(progressData.total_time_spent_minutes * 10) / 10} min studied
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Instructions (if applicable) */}
      {course.ai_enabled && course.instructions && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              AI Instructions
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Purpose</dt>
                <dd className="text-gray-900">{course.instructions.purpose}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Target Audience</dt>
                <dd className="text-gray-900">{course.instructions.target_audience}</dd>
              </div>
              {course.instructions.learning_objectives.length > 0 && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Learning Objectives</dt>
                  <dd className="text-gray-900">
                    <ul className="list-disc list-inside mt-1">
                      {course.instructions.learning_objectives.map((obj, i) => (
                        <li key={i}>{obj}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Modules */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Modules</h2>
          {isEditable && (
            <Button size="sm" onClick={() => navigate(`/courses/${courseId}/modules/new`)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Module
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {modules.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No modules yet</p>
              {isEditable && (
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => navigate(`/courses/${courseId}/modules/new`)}
                >
                  Create First Module
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {modules.map((module, index) => {
                const moduleProgress = moduleProgressMap.get(module.id);
                const status = moduleProgress?.status || 'not_started';

                return (
                  <div
                    key={module.id}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-gray-400">
                      {isEditable && <div className="flex flex-col gap-1">
                      <button aria-label={`Move ${module.title} up`} disabled={index === 0 || reorderModules.isPending} onClick={async () => {
                        const ids = modules.map(m => m.id); [ids[index], ids[index - 1]] = [ids[index - 1], ids[index]];
                        try { await reorderModules.mutateAsync({ courseId: course.id, moduleIds: ids }); } catch { showError('Could not reorder modules'); }
                      }}>Move up</button>
                      <button aria-label={`Move ${module.title} down`} disabled={index === modules.length - 1 || reorderModules.isPending} onClick={async () => {
                        const ids = modules.map(m => m.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                        try { await reorderModules.mutateAsync({ courseId: course.id, moduleIds: ids }); } catch { showError('Could not reorder modules'); }
                      }}>Move down</button>
                    </div>}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      status === 'completed'
                        ? 'bg-green-100 text-green-600'
                        : status === 'in_progress'
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : status === 'in_progress' ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </div>
                    <Link to={`/courses/${courseId}/modules/${module.id}`} className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{module.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        {module.flashcard_count > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {moduleProgress ? `${moduleProgress.flashcards_reviewed}/${moduleProgress.flashcards_total}` : `${module.flashcard_count}`} cards
                          </span>
                        )}
                        {module.has_quiz && (
                          <span className="flex items-center gap-1">
                            <HelpCircle className="w-4 h-4" />
                            {moduleProgress?.quiz_score !== null && moduleProgress?.quiz_score !== undefined
                              ? `Quiz: ${moduleProgress.quiz_score}%`
                              : 'Quiz'}
                          </span>
                        )}
                      </div>
                    </Link>
                    {isEditable && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/courses/${courseId}/modules/${module.id}/edit`);
                          }}
                          aria-label={`Edit ${module.title}`}
                          className="p-2 hover:bg-gray-100 rounded"
                        >
                          <Edit className="w-4 h-4 text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setModuleToDelete(module);
                          }}
                          aria-label={`Delete ${module.title}`}
                          className="p-2 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Course Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Course"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete "{course.title}"? This will also delete all modules
            and cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteCourse}
              isLoading={deleteCourse.isPending}
            >
              Delete Course
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Module Modal */}
      <Modal
        isOpen={!!moduleToDelete}
        onClose={() => setModuleToDelete(null)}
        title="Delete Module"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete "{moduleToDelete?.title}"? This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModuleToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteModule}
              isLoading={deleteModule.isPending}
            >
              Delete Module
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
