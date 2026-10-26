import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PathList } from '../components/courses/PathList';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Textarea } from '../components/common/Textarea';
import { SkeletonDeckGrid } from '../components/common/Skeleton';
import { useMyLearningPaths, useCreateLearningPath, useLearningPaths, useFollowingPaths } from '../hooks/useLearningPaths';
import { useToast } from '../hooks/useToast';
import type { CourseDifficulty } from '../types';

export function LearningPaths() {
  const navigate = useNavigate();
  const { data: paths, isLoading } = useMyLearningPaths();
  const createPath = useCreateLearningPath();
  const discovery = useLearningPaths();
  const following = useFollowingPaths();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'following' || requestedTab === 'discover' ? requestedTab : 'mine';
  const setTab = (value: 'mine' | 'following' | 'discover') => setSearchParams(value === 'mine' ? {} : { tab: value });
  const { success, error: showError } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<CourseDifficulty>('beginner');
  const [estimatedHours, setEstimatedHours] = useState('');

  const handleCreatePath = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newPath = await createPath.mutateAsync({
        title,
        description: description || undefined,
        difficulty,
        estimated_hours: estimatedHours ? parseInt(estimatedHours, 10) : undefined,
      });
      setIsModalOpen(false);
      resetForm();
      success('Learning path created successfully');
      navigate(`/paths/${newPath.id}`);
    } catch (err) {
      console.error('Failed to create path:', err);
      showError('Failed to create learning path. Please try again.');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDifficulty('beginner');
    setEstimatedHours('');
  };

  const visiblePaths = (tab === 'mine' ? paths : tab === 'following' ? following.data : discovery.data) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Learning Paths</h1>
        </div>
        <SkeletonDeckGrid count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning Paths</h1>
          <p className="text-gray-500 mt-1">Organize courses into structured learning journeys</p>
        </div>
      </div>

      <nav aria-label="Path collections" className="flex flex-wrap gap-3">
        <Button aria-pressed={tab === 'mine'} variant={tab === 'mine' ? 'primary' : 'secondary'} onClick={() => setTab('mine')}>My Paths</Button>
        <Button aria-pressed={tab === 'following'} variant={tab === 'following' ? 'primary' : 'secondary'} onClick={() => setTab('following')}>Following</Button>
        <Button aria-pressed={tab === 'discover'} variant={tab === 'discover' ? 'primary' : 'secondary'} onClick={() => setTab('discover')}>Public & shared paths</Button>
      </nav>
      {tab === 'following' && <p className="text-sm text-gray-600">Paths you follow. Deleted paths and paths you can no longer access are removed from this list.</p>}
      {(tab === 'discover' && discovery.isError || tab === 'following' && following.isError) && <p role="alert">Could not load paths. Please try again.</p>}
      {(tab === 'following' && following.isLoading || tab === 'discover' && discovery.isLoading) ? <SkeletonDeckGrid count={3} /> :
        tab !== 'mine' && visiblePaths.length === 0 ? <div className="rounded-lg border p-8 text-center space-y-3">
          <p>{tab === 'following' ? 'You are not following any paths yet.' : 'No public or shared paths are available. Ask a path owner to share with your email.'}</p>
          {tab === 'following' && <Button onClick={() => setTab('discover')}>Discover paths to follow</Button>}
        </div> : <PathList paths={visiblePaths} onCreatePath={() => setIsModalOpen(true)} />}


      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title="Create Learning Path"
      >
        <form onSubmit={handleCreatePath} className="space-y-4">
          <Input
            id="title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Production Engineer"
            required
          />
          <Textarea
            id="description"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
              <select aria-label="Difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as CourseDifficulty)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <Input
              id="estimated_hours"
              label="Est. Hours (optional)"
              type="number"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="40"
              min={1}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createPath.isPending}>
              Create Path
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
