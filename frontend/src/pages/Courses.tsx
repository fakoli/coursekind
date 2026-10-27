import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Loader2 } from 'lucide-react';
import { CourseList } from '../components/courses/CourseList';
import { CourseCard } from '../components/courses/CourseCard';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Card, CardContent } from '../components/common/Card';
import { SkeletonDeckGrid } from '../components/common/Skeleton';
import { useMyCourses, useDiscoverCourses, useSharedCourses } from '../hooks/useCourses';
import { useMyLearningPaths, useAddCourseToPath } from '../hooks/useLearningPaths';
import { useToast } from '../hooks/useToast';
import { useDebouncedValue } from '../hooks/useDebouncedSearch';
import type { CourseDifficulty, CourseDiscoveryFilters } from '../types';

type Tab = 'mine' | 'discover' | 'shared';

export function Courses() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error: showError } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('tab') === 'discover' ? 'discover' : searchParams.get('tab') === 'shared' ? 'shared' : 'mine'
  );

  // Discovery filters
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<CourseDifficulty | ''>('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'alphabetical'>('popular');

  // Debounce search query to reduce API calls while typing
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const isSearchDebouncing = searchQuery !== debouncedSearchQuery;

  // Add to path modal
  const [addToPathModalOpen, setAddToPathModalOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Build discovery filters using debounced search query
  const filters: CourseDiscoveryFilters = {
    q: debouncedSearchQuery || undefined,
    difficulty: difficultyFilter || undefined,
    sort: sortBy,
  };

  // Hooks
  const { data: myCourses, isLoading: loadingMyCourses } = useMyCourses();
  const { data: discoverData, isLoading: loadingDiscover } = useDiscoverCourses(filters);
  const { data: accessible, isLoading: loadingAccessible } = useSharedCourses();
  const { data: myPaths } = useMyLearningPaths();
  const addCourseToPath = useAddCourseToPath();

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'mine' ? {} : { tab });
  };

  const handleAddToPath = (courseId: string) => {
    setSelectedCourseId(courseId);
    setAddToPathModalOpen(true);
  };

  const handleConfirmAddToPath = async (pathId: string) => {
    if (!selectedCourseId) return;
    try {
      await addCourseToPath.mutateAsync({ pathId, courseId: selectedCourseId });
      setAddToPathModalOpen(false);
      setSelectedCourseId(null);
      success('Course added to learning path');
    } catch (err) {
      console.error('Failed to add course to path:', err);
      showError('Failed to add course to path. Please try again.');
    }
  };

  const visibleCourses = activeTab === 'shared' ? accessible : discoverData?.courses;
  const isLoading = activeTab === 'mine' ? loadingMyCourses : activeTab === 'shared' ? loadingAccessible : loadingDiscover;

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-gray-500 mt-1">Your next lesson starts here.</p>
        </div>
        <Button className="self-start whitespace-nowrap" onClick={() => navigate('/courses/new')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Course
        </Button>
      </div>

      {/* Tabs */}
      <div>
        <nav aria-label="Course collections" className="collection-tabs">
          <button
            aria-pressed={activeTab === 'mine'} onClick={() => handleTabChange('mine')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'mine'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            My Courses
          </button>
          <button
            aria-pressed={activeTab === 'discover'} onClick={() => handleTabChange('discover')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'discover'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Discover
          </button>
          <button aria-pressed={activeTab === 'shared'} onClick={() => handleTabChange('shared')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'shared' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'}`}>Shared with me</button>
        </nav>
      </div>

      {/* Search and Filters (only for discover tab) */}
      {activeTab === 'discover' && (
        <Card>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  aria-label="Search courses"
                  placeholder="Search courses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {isSearchDebouncing && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <select
                  aria-label="Difficulty"
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value as CourseDifficulty | '')}
                  className="min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Levels</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <select
                  aria-label="Sort courses"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="popular">Most Popular</option>
                  <option value="newest">Newest</option>
                  <option value="alphabetical">A-Z</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Course List */}
      {isLoading ? (
        <SkeletonDeckGrid count={6} />
      ) : activeTab === 'mine' ? (
        <CourseList
          courses={myCourses ?? []}
          onCreateCourse={() => navigate('/courses/new')}
          showAuthor={false}
          showCreateButton={false}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCourses?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onAddToPath={() => handleAddToPath(course.id)}
            />
          ))}
          {visibleCourses?.length === 0 && (
            <div className="col-span-full">
              <div className="text-center py-12 px-4">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No courses found</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {searchQuery || difficultyFilter
                    ? "Try adjusting your search or filters to find more courses."
                    : activeTab === 'shared' ? 'Courses shared with your email will appear here.' : 'No public courses are available yet. Check back soon!'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add to Path Modal */}
      <Modal
        isOpen={addToPathModalOpen}
        onClose={() => {
          setAddToPathModalOpen(false);
          setSelectedCourseId(null);
        }}
        title="Add to Learning Path"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Select a learning path to add this course to:</p>
          {myPaths && myPaths.length > 0 ? (
            <div className="space-y-2">
              {myPaths.map((path) => (
                <button
                  key={path.id}
                  onClick={() => handleConfirmAddToPath(path.id)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <div className="font-medium">{path.title}</div>
                  <div className="text-sm text-gray-500">
                    {path.course_count} {path.course_count === 1 ? 'course' : 'courses'}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p>You don't have any learning paths yet.</p>
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setAddToPathModalOpen(false);
                  navigate('/paths');
                }}
              >
                Create a Learning Path
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
