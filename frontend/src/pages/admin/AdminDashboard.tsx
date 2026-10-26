import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Pagination } from '../../components/common/Pagination';
import { AdminStatsGrid, UserTable, TokenAdjustmentModal } from '../../components/admin';
import { useAdminStats, useAdminUsers } from '../../hooks/useAdmin';
import { useUserSearch } from '../../hooks/useUserSearch';
import { useTokenAdjustment } from '../../hooks/useTokenAdjustment';
import { useAuthContext } from '../../components/common/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { DEFAULTS } from '../../utils/constants';

export function AdminDashboard() {
  const { user, isLoading } = useAuthContext();
  if (isLoading) return <p>Checking admin access…</p>;
  if (user?.role !== 'admin') return <div role="alert">Access denied. Admin privileges required. <Link to="/">Return to Dashboard</Link></div>;
  return <AdminContent />;
}

function AdminContent() {
  // Search and pagination
  const { search, setSearch, debouncedSearch, currentPage, handleKeyDown, goToPage } =
    useUserSearch();

  // Token adjustment
  const tokenAdjustment = useTokenAdjustment();

  // Data fetching
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorObj,
  } = useAdminStats();

  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
    error: usersErrorObj,
  } = useAdminUsers({
    search: debouncedSearch || undefined,
    skip: (currentPage - 1) * DEFAULTS.PAGE_SIZE,
    limit: DEFAULTS.PAGE_SIZE,
  });

  // Error state handling
  if (statsError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">{getErrorMessage(statsErrorObj)}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const totalPages = usersData
    ? Math.max(1, Math.ceil(usersData.total / usersData.limit))
    : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>

      {/* Stats Cards */}
      {stats && <AdminStatsGrid stats={stats} />}

      {/* User Management */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">User Management</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                aria-label="Search users by name or email"
              />
            </div>
          </div>

          {/* User Table */}
          {usersError ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{getErrorMessage(usersErrorObj)}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          ) : usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <>
              <UserTable
                users={usersData?.users || []}
                onAdjustTokens={tokenAdjustment.openModal}
              />

              {usersData && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={usersData.total}
                  itemsPerPage={usersData.limit}
                  displayedItems={usersData.users.length}
                  onPageChange={(page) => goToPage(page, totalPages)}
                  itemLabel="users"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Adjust Tokens Modal */}
      <TokenAdjustmentModal
        user={tokenAdjustment.selectedUser}
        amount={tokenAdjustment.amount}
        reason={tokenAdjustment.reason}
        onAmountChange={tokenAdjustment.setAmount}
        onReasonChange={tokenAdjustment.setReason}
        onClose={tokenAdjustment.closeModal}
        onConfirm={tokenAdjustment.handleAdjust}
        isLoading={tokenAdjustment.isLoading}
        isValid={tokenAdjustment.isValid}
      />
    </div>
  );
}
