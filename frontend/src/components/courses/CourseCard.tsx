import { CourseImage } from '../common/CourseImage';
import { Link } from 'react-router-dom';
import { Users, Sparkles, MoreVertical, Plus } from 'lucide-react';
import { Card, CardContent } from '../common/Card';
import type { CourseResponse, CourseDifficulty } from '../../types';

interface CourseCardProps {
  course: CourseResponse;
  onOptions?: () => void;
  onAddToPath?: () => void;
  showAuthor?: boolean;
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

export function CourseCard({ course, onOptions, onAddToPath, showAuthor = true }: CourseCardProps) {
  const colors = difficultyColors[course.difficulty];

  return (
    <div className="group min-w-0">
      <Card className="card-interactive h-full hover:shadow-md transition-shadow">
        <CardContent className="flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <CourseImage
                src={course.thumbnail_url || defaultThumbnails[course.difficulty]}
                alt=""
                className="w-10 h-10 shrink-0 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                    <Link to={`/courses/${course.id}`} className="focus:underline">{course.title}</Link>
                  </h3>
                  {course.ai_enabled && (
                    <span title="AI-Assisted Course">
                      <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    </span>
                  )}
                </div>
                {showAuthor && (
                  <p className="text-xs text-gray-500">by {course.author_name}</p>
                )}
              </div>
            </div>
            {onOptions && (
              <button
                className="p-1.5 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                aria-label="Course options"
                onClick={(e) => {
                  e.preventDefault();
                  onOptions();
                }}
              >
                <MoreVertical className="w-4 h-4 text-gray-400" aria-hidden="true" />
              </button>
            )}
          </div>

          {course.description && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {course.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {course.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium"
              >
                {tag}
              </span>
            ))}
            {course.tags.length > 3 && (
              <span className="text-xs text-gray-400 self-center">+{course.tags.length - 3}</span>
            )}
          </div>

          <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <span>{course.module_count} {course.module_count === 1 ? 'module' : 'modules'}</span>
              {(
                <div className="flex min-w-0 items-start gap-1">
                  <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{course.times_added} path references · {course.own_path_count ?? 0} by author · {course.other_path_count ?? 0} by others</span>
                </div>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
              {course.difficulty}
            </span>
          </div>

          {onAddToPath && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onAddToPath();
              }}
              className="mt-3 w-full py-2.5 px-3 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add to Path
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
