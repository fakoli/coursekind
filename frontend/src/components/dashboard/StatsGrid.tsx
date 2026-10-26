import {
  BookOpen,
  CheckCircle,
  Clock,
  Flame,
  GraduationCap,
  Target,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../common/Card';
import type { DashboardStats } from '../../types';

interface StatsGridProps {
  stats: DashboardStats;
}

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
}

function StatCard({ icon, value, label, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-600">{label}</div>
        </div>
      </div>
    </div>
  );
}

function formatTime(minutes: number): string {
  minutes = Math.round(minutes * 10) / 10;
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function WelcomeCard() {
  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
      <CardContent className="py-8">
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <img
            src="/images/empty-getting-started.png"
            alt=""
            className="w-32 h-32 object-contain"
            aria-hidden="true"
          />
          <div className="flex-1 text-center lg:text-left">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Ready to start your learning journey?
            </h3>
            <p className="text-gray-600 mb-4 max-w-lg">
              Explore courses, follow learning paths, and track your progress as you master new skills. Your stats will appear here once you begin.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                to="/courses?tab=discover"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Browse Courses
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/paths"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium border border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                View Learning Paths
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsGrid({ stats }: StatsGridProps) {
  // Check if user has no activity (all stats are zero or null)
  const hasNoActivity =
    stats.active_paths === 0 &&
    stats.courses_in_progress === 0 &&
    stats.modules_completed_week === 0 &&
    stats.total_study_time_minutes === 0 &&
    stats.current_streak === 0 &&
    (stats.average_quiz_score === null || stats.average_quiz_score === 0);

  // Show welcome card for new users with no activity
  return (
    <>
    {hasNoActivity && <WelcomeCard />}
    <p className="text-sm text-gray-600">Study days use {stats.timezone ?? 'UTC'}. Sessions group actions until more than 30 minutes idle.</p>
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={<GraduationCap className="w-5 h-5 text-indigo-600" />}
        value={stats.selected_paths ?? 0}
        label="Selected Paths"
        color="bg-indigo-50"
      />
      <StatCard icon={<GraduationCap className="w-5 h-5 text-indigo-600" />} value={stats.active_paths} label="Active Selected Paths" color="bg-indigo-50" />
      <StatCard icon={<CheckCircle className="w-5 h-5 text-green-600" />} value={stats.completed_selected_paths ?? 0} label="Completed Selected Paths" color="bg-green-50" />
      <StatCard icon={<Clock className="w-5 h-5 text-blue-600" />} value={stats.study_sessions_week ?? 0} label="Study Sessions · Last 7 Days" color="bg-blue-50" />
      <StatCard
        icon={<BookOpen className="w-5 h-5 text-blue-600" />}
        value={stats.courses_in_progress}
        label="Courses In Progress"
        color="bg-blue-50"
      />
      <StatCard
        icon={<CheckCircle className="w-5 h-5 text-green-600" />}
        value={stats.modules_completed_week}
        label="Modules This Week"
        color="bg-green-50"
      />
      <StatCard
        icon={<Target className="w-5 h-5 text-purple-600" />}
        value={
          stats.average_quiz_score !== null
            ? `${Math.round(stats.average_quiz_score)}%`
            : '-'
        }
        label="Quiz Average"
        color="bg-purple-50"
      />
      <StatCard
        icon={<Clock className="w-5 h-5 text-amber-600" />}
        value={formatTime(stats.total_study_time_minutes)}
        label="Total Study Time"
        color="bg-amber-50"
      />
      <StatCard
        icon={<Flame className="w-5 h-5 text-rose-600" />}
        value={stats.current_streak}
        label="Day Streak"
        color="bg-rose-50"
      />
    </div>
    </>
  );
}
