import { Link } from 'react-router-dom';
import { useAuthContext } from '../components/common/AuthContext';
import { StreakDisplay } from '../components/dashboard/StreakDisplay';
import { ActionCard } from '../components/dashboard/ActionCard';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed';
import { NextUpPanel } from '../components/dashboard/NextUpPanel';
import {
  useDashboardStats,
  useRecentActivity,
  useNextUp,
} from '../hooks/useProgress';

export function Dashboard() {
  const { user } = useAuthContext();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(10);
  const { data: nextUpData, isLoading: nextUpLoading } = useNextUp(3);

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with greeting and streak */}
      <div
        className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 p-6 lg:p-8"
      >
        <img
          src="/images/dashboard-banner.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30"
          aria-hidden="true"
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="text-white">
            <h1 className="text-2xl font-bold">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-indigo-100">Turn a goal into a course you can keep improving.</p>
            <div className="flex flex-wrap gap-3 mt-4"><Link className="bg-white text-indigo-700 px-4 py-2 rounded-lg font-medium" to="/workspaces">Start with a goal</Link><Link className="border border-white px-4 py-2 rounded-lg font-medium" to="/courses">Continue studying</Link></div>
          </div>
          <div className="lg:w-80">
            <StreakDisplay
              currentStreak={stats?.current_streak ?? 0}
              longestStreak={stats?.longest_streak ?? 0}
              variant="dark"
            />
          </div>
        </div>
      </div>

      {/* Continue Learning - prominent CTA */}
      {!nextUpLoading && (
        <NextUpPanel items={nextUpData?.items ?? []} />
      )}

      {/* Stats Grid */}
      {stats && <StatsGrid stats={stats} />}

      {/* Two-column layout: Activity feed and Action cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!activityLoading && (
            <RecentActivityFeed activities={activityData?.activities ?? []} />
          )}
        </div>
        <div className="space-y-4">
          <ActionCard
            type="paths"
            title="Learning Paths"
            description="Follow structured learning journeys"
            href="/paths"
          />
          <ActionCard
            type="study"
            title="Browse Courses"
            description="Explore and study course modules"
            href="/courses?tab=discover"
          />
          <ActionCard
            type="create"
            title="Create Course"
            description="Author your own course content"
            href="/courses/new"
          />
        </div>
      </div>
    </div>
  );
}
