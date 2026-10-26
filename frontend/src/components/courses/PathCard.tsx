import { usePathProgress } from '../../hooks/useProgress';
import { CourseImage } from '../common/CourseImage';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, MoreVertical, Play, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../common/Card';
import type { LearningPathResponse, CourseDifficulty } from '../../types';

interface PathCardProps {
  path: LearningPathResponse;
  onOptions?: () => void;
  progress?: {
    completedCourses: number;
    totalCourses: number;
    isEnrolled: boolean;
  };
}

const difficultyColors: Record<CourseDifficulty, { bg: string; text: string }> = {
  beginner: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  intermediate: { bg: 'bg-amber-100', text: 'text-amber-700' },
  advanced: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const defaultThumbnails: Record<CourseDifficulty, string> = {
  beginner: '/images/default-thumb-beginner.png',
  intermediate: '/images/default-thumb-intermediate.png',
  advanced: '/images/default-thumb-advanced.png',
};

export function PathCard({ path, onOptions, progress }: PathCardProps) {
  const { data: savedProgress } = usePathProgress(path.id);
  const colors = difficultyColors[path.difficulty];
  const progressPercent = savedProgress?.completion_percentage ?? (progress && progress.totalCourses > 0
    ? Math.round((progress.completedCourses / progress.totalCourses) * 100)
    : 0);
  const isComplete = savedProgress ? savedProgress.completion_percentage === 100 : progress && progress.completedCourses === progress.totalCourses && progress.totalCourses > 0;

  return (
    <Link to={`/paths/${path.id}`}>
      <Card className="card-interactive h-full group">
        <CardContent className="flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <CourseImage
                src={path.thumbnail_url || defaultThumbnails[path.difficulty]}
                alt=""
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                  {path.title}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Status badge */}
              {progress?.isEnrolled && !isComplete && (
                <span className="flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                  <Play className="w-3 h-3" />
                  In Progress
                </span>
              )}
              {isComplete && (
                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  <CheckCircle className="w-3 h-3" />
                  Complete
                </span>
              )}
              {onOptions && (
                <button
                  className="p-1 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  aria-label="Path options"
                  onClick={(e) => {
                    e.preventDefault();
                    onOptions();
                  }}
                >
                  <MoreVertical className="w-4 h-4 text-gray-400" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {path.description && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {path.description}
            </p>
          )}

          {/* Progress bar (only shown if enrolled) */}
          {(savedProgress || progress?.isEnrolled) && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-600 font-medium">
                  {savedProgress?.completed_courses ?? progress?.completedCourses ?? 0} of {savedProgress?.total_courses ?? progress?.totalCourses ?? 0} courses completed
                </span>
                <span className={`font-semibold ${isComplete ? 'text-green-600' : 'text-indigo-600'}`}>
                  {progressPercent}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isComplete ? 'bg-green-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              <span>{path.course_count} {path.course_count === 1 ? 'course' : 'courses'}</span>
            </div>
            {path.estimated_hours && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" aria-hidden="true" />
                <span>~{path.estimated_hours}h</span>
              </div>
            )}
            <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
              {path.difficulty}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
