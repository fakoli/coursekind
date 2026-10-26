import { usePathProgress } from '../hooks/useProgress';
import { SharingPanel } from '../components/courses/SharingPanel';
import { useFollowPath, useReorderCoursesInPath } from '../hooks/useLearningPaths';
import { useCourses } from '../hooks/useCourses';
import { useAuthContext } from '../components/common/AuthContext';
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Clock,
  BookOpen,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Textarea } from '../components/common/Textarea';
import {
  useLearningPath,
  useUpdateLearningPath,
  useDeleteLearningPath,
  useRemoveCourseFromPath,
} from '../hooks/useLearningPaths';
import { useDiscoverCourses, useMyCourses } from '../hooks/useCourses';
import { useAddCourseToPath } from '../hooks/useLearningPaths';
import { useToast } from '../hooks/useToast';
import type { CourseDifficulty, CourseResponse } from '../types';

const difficultyColors: Record<CourseDifficulty, { bg: string; text: string }> = {
  beginner: { bg: 'bg-green-100', text: 'text-green-700' },
  intermediate: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  advanced: { bg: 'bg-red-100', text: 'text-red-700' },
};

export function LearningPathDetail() {
  const { user } = useAuthContext();
  const { pathId } = useParams<{ pathId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const { data, isLoading, error } = useLearningPath(pathId || '');
  const { data: progress } = usePathProgress(pathId || '');
  const updatePath = useUpdateLearningPath();
  const follow = useFollowPath();
  const reorder = useReorderCoursesInPath();
  const { data: accessibleCourses } = useCourses();
  const deletePath = useDeleteLearningPath();
  const removeCourse = useRemoveCourseFromPath();
  const addCourse = useAddCourseToPath();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addCourseModalOpen, setAddCourseModalOpen] = useState(false);
  const [courseToRemove, setCourseToRemove] = useState<CourseResponse | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<CourseDifficulty>('beginner');
  const [editEstimatedHours, setEditEstimatedHours] = useState('');

  // Fetch available courses for adding (both user's own and public courses)
  const { data: discoverData } = useDiscoverCourses({ limit: 50 });
  const { data: myCourses } = useMyCourses();

  const handleDeletePath = async () => {
    if (!pathId) return;
    try {
      await deletePath.mutateAsync(pathId);
      success('Learning path deleted successfully');
      navigate('/paths');
    } catch (err) {
      console.error('Failed to delete path:', err);
      showError('Failed to delete learning path. Please try again.');
    }
  };

  const handleRemoveCourse = async () => {
    if (!pathId || !courseToRemove) return;
    try {
      await removeCourse.mutateAsync({ pathId, courseId: courseToRemove.id });
      success('Course removed from path');
      setCourseToRemove(null);
    } catch (err) {
      console.error('Failed to remove course:', err);
      showError('Failed to remove course. Please try again.');
    }
  };

  const handleAddCourse = async (courseId: string) => {
    if (!pathId) return;
    try {
      await addCourse.mutateAsync({ pathId, courseId });
      success('Course added to path');
      setAddCourseModalOpen(false);
    } catch (err) {
      console.error('Failed to add course:', err);
      showError('Failed to add course. Please try again.');
    }
  };

  const openEditModal = () => {
    if (data?.path) {
      setEditTitle(data.path.title);
      setEditDescription(data.path.description || '');
      setEditDifficulty(data.path.difficulty);
      setEditEstimatedHours(data.path.estimated_hours?.toString() || '');
      setEditModalOpen(true);
    }
  };

  const handleEditPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathId) return;
    try {
      await updatePath.mutateAsync({
        pathId,
        data: {
          title: editTitle,
          description: editDescription || undefined,
          difficulty: editDifficulty,
          estimated_hours: editEstimatedHours ? parseInt(editEstimatedHours, 10) : undefined,
        },
      });
      success('Learning path updated successfully');
      setEditModalOpen(false);
    } catch (err) {
      console.error('Failed to update path:', err);
      showError('Failed to update learning path. Please try again.');
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
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Learning path not found</h2>
        <p className="text-gray-500 mt-2">The learning path you're looking for doesn't exist.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/paths')}>
          Back to Learning Paths
        </Button>
      </div>
    );
  }

  const { path, courses } = data;
  const colors = difficultyColors[path.difficulty];
  const isOwner = path.owner_id === user?.id;
  const move = async (index: number, offset: number) => {
    const ids = [...path.course_ids];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    try { await reorder.mutateAsync({ pathId: path.id, courseIds: ids }); }
    catch { showError('Could not reorder courses. Please try again.'); }
  };

  // Combine user's own courses with discovered courses, deduplicate, and filter out those already in the path
  const allCourses = [
    ...(accessibleCourses ?? []),
    ...(myCourses ?? []),
    ...(discoverData?.courses ?? []),
  ];
  const uniqueCourses = allCourses.filter(
    (course, index, self) => self.findIndex((c) => c.id === course.id) === index
  );
  const availableCourses = uniqueCourses.filter(
    (c) => !path.course_ids.includes(c.id)
  );

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:flex-1">
          <button
            aria-label="Back to paths"
            onClick={() => navigate(-1)}
            className="shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-gray-900">{path.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 mt-1">
              <span>{path.course_ids.length} {path.course_ids.length === 1 ? 'course' : 'courses'} · {data.unavailable_courses?.length ?? 0} unavailable</span>
              {path.estimated_hours && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  ~{path.estimated_hours}h
                </span>
              )}
            </div>
          </div>
        </div>
        {isOwner && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAddCourseModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Course
          </Button>
          <Button variant="secondary" onClick={openEditModal}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>}
        {!isOwner && user && <Button disabled={follow.isPending} onClick={async () => {
          try { await follow.mutateAsync({ pathId: path.id, following: !data.is_following }); }
          catch { showError('Could not update following. Please try again.'); }
        }}>{data.is_following ? 'Unfollow' : 'Follow path'}</Button>}
      </div>

      {progress && <Card><CardContent><p className="font-medium">Your progress: {progress.completion_percentage}% · {progress.completed_courses} of {progress.total_courses} courses completed</p>
        <p className="text-sm text-gray-600">Each course has equal weight. Empty and unavailable courses contribute 0%.</p></CardContent></Card>}
      {isOwner && <SharingPanel resource="paths" id={path.id} visibility={path.visibility} />}
      {/* Path Info */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {path.description && (
              <p className="text-gray-600 w-full">{path.description}</p>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}>
              {path.difficulty}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Courses */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Courses</h2>
        </CardHeader>
        <CardContent className="p-0">
          {path.course_ids.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No courses in this path yet</p>
              {isOwner && <Button variant="secondary" className="mt-4" onClick={() => setAddCourseModalOpen(true)}>Add First Course</Button>}
            </div>
          ) : <ol className="divide-y divide-gray-100">
            {path.course_ids.map((id, index) => {
              const course = courses.find(c => c.id === id);
              return <li key={`${id}-${index}`} className="flex flex-wrap items-center gap-4 p-4">
                <span>{index + 1}.</span>
                {course ? <Link to={`/courses/${id}`} className="flex-1 min-w-0">
                  <h3 className="font-medium">{course.title}</h3>
                  {progress?.courses.find(c => c.course_id === id) && <p className="text-sm text-indigo-600">{progress.courses.find(c => c.course_id === id)!.completion_percentage}% complete</p>}
                  <p className="text-sm text-gray-500">{course.module_count} {course.module_count === 1 ? 'module' : 'modules'} · by {course.author_name}</p>
                </Link> : <div className="flex-1"><h3 className="font-medium">Unavailable course</h3>
                  <p className="text-sm text-gray-600">This course was removed or you no longer have access.</p></div>}
                {isOwner && <div className="flex gap-2">
                  <Button variant="secondary" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}
                    aria-label={`Move ${course?.title ?? 'unavailable course'} up`}>Move up</Button>
                  <Button variant="secondary" disabled={index === path.course_ids.length - 1 || reorder.isPending} onClick={() => move(index, 1)}
                    aria-label={`Move ${course?.title ?? 'unavailable course'} down`}>Move down</Button>
                  <Button variant="secondary" onClick={() => setCourseToRemove(course ?? { id, title: 'Unavailable course' } as CourseResponse)}
                    aria-label={`Remove ${course?.title ?? 'unavailable course'} from path`}><X className="w-4 h-4" /></Button>
                </div>}
              </li>;
            })}
          </ol>}

        </CardContent>
      </Card>

      {/* Delete Path Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Learning Path"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete "{path.title}"? The courses will not be deleted.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeletePath}
              isLoading={deletePath.isPending}
            >
              Delete Path
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove Course Modal */}
      <Modal
        isOpen={!!courseToRemove}
        onClose={() => setCourseToRemove(null)}
        title="Remove Course"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to remove "{courseToRemove?.title}" from this path?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setCourseToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRemoveCourse}
              isLoading={removeCourse.isPending}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Course Modal */}
      <Modal
        isOpen={addCourseModalOpen}
        onClose={() => setAddCourseModalOpen(false)}
        title="Add Course to Path"
      >
        <div className="space-y-4">
          {availableCourses.length > 0 ? (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => handleAddCourse(course.id)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <div className="font-medium">{course.title}</div>
                  <div className="text-sm text-gray-500">
                    {course.module_count} {course.module_count === 1 ? 'module' : 'modules'} · by {course.author_name}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p>No more courses available to add.</p>
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setAddCourseModalOpen(false);
                  navigate('/courses?tab=discover');
                }}
              >
                Discover More Courses
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Path Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Learning Path"
      >
        <form onSubmit={handleEditPath} className="space-y-4">
          <Input
            id="edit-title"
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="e.g., Production Engineer"
            required
          />
          <Textarea
            id="edit-description"
            label="Description (optional)"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="What will learners achieve with this path?"
            rows={3}
            showCharCount
            maxLength={500}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={editDifficulty}
                onChange={(e) => setEditDifficulty(e.target.value as CourseDifficulty)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <Input
              id="edit-estimated-hours"
              label="Est. Hours (optional)"
              type="number"
              value={editEstimatedHours}
              onChange={(e) => setEditEstimatedHours(e.target.value)}
              placeholder="40"
              min={1}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={updatePath.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
