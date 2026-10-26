import { BookOpen, CheckCircle, FileText, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../common/Card';
import type { RecentActivity, ActivityType } from '../../types';

interface RecentActivityFeedProps {
  activities: RecentActivity[];
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case 'module_started':
      return <PlayCircle className="w-4 h-4 text-blue-500" />;
    case 'module_completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'quiz_submitted':
      return <FileText className="w-4 h-4 text-purple-500" />;
    case 'content_read':
      return <BookOpen className="w-4 h-4 text-orange-500" />;
    case 'practice':
      return <PlayCircle className="w-4 h-4 text-blue-500" />;
    case 'flashcard_reviewed':
      return <FileText className="w-4 h-4 text-blue-500" />;
  }
}

function getActivityLabel(type: ActivityType): string {
  switch (type) {
    case 'module_started':
      return 'Started';
    case 'module_completed':
      return 'Completed';
    case 'quiz_submitted':
      return 'Quiz submitted';
    case 'content_read':
      return 'Read content';
    case 'practice':
      return 'Practiced code';
    case 'flashcard_reviewed':
      return 'Reviewed flashcards';
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentActivityFeed({ activities }: RecentActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="font-medium text-gray-900">Recent Activity</h3>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <img
              src="/images/empty-no-activity.png"
              alt=""
              className="w-32 h-32 mx-auto mb-3 object-contain"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Ready to get started?
            </p>
            <p className="text-sm text-gray-500">
              Your learning activity will appear here as you explore courses.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium text-gray-900">Recent Activity</h3>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="divide-y divide-gray-100">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50"
            >
              <div className="mt-0.5">{getActivityIcon(activity.activity_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    {getActivityLabel(activity.activity_type)}
                  </span>
                  {activity.activity_type === 'quiz_submitted' &&
                    activity.details?.score !== undefined && (
                      <span className="text-xs font-semibold text-purple-600">
                        {Math.round(activity.details.score as number)}%
                      </span>
                    )}
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.module_title || 'Unknown module'}
                </p>
                {activity.course_title && (
                  <p className="text-xs text-gray-500 truncate">
                    {activity.course_title}
                  </p>
                )}
              </div>
              <div className="text-xs text-gray-400 whitespace-nowrap">
                {formatRelativeTime(activity.created_at)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
