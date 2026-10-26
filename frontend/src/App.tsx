import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/common/AuthProvider';
import { useAuthContext } from './components/common/AuthContext';
import { ToastProvider } from './components/common/ToastProvider';
import { LiveRegionProvider } from './components/common/LiveRegion';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { LearningPaths } from './pages/LearningPaths';
import { LearningPathDetail } from './pages/LearningPathDetail';
import { Courses } from './pages/Courses';
import { CourseDetail } from './pages/CourseDetail';
import { CourseEditor } from './pages/CourseEditor';
import { ModuleViewer } from './pages/ModuleViewer';
import { ModuleEditor } from './pages/ModuleEditor';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { Home, BookOpen, Settings as SettingsIcon, LogOut, Map, Library, Shield } from 'lucide-react';
import clsx from 'clsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

function Layout() {
  const { user, logout } = useAuthContext();
  const location = useLocation();

  const isAdmin = user?.role === 'admin';

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/paths', icon: Map, label: 'Paths' },
    { to: '/courses', icon: Library, label: 'Courses' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
    ...(isAdmin ? [{ to: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  // Check if current path matches nav item (handles nested routes)
  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Skip to main content
      </a>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-700 transition-colors">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-gray-900">Study Buddy</span>
              </Link>
            </div>
            <div className="hidden sm:flex sm:items-center sm:gap-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    isActive(to)
                      ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className={clsx('w-4 h-4', isActive(to) && 'text-indigo-600')} />
                  {label}
                </Link>
              ))}
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb" aria-label="Mobile navigation">
        <div className="flex justify-around px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 flex-1 transition-all',
                isActive(to)
                  ? 'text-indigo-600'
                  : 'text-gray-500'
              )}
            >
              <div className={clsx(
                'p-1.5 rounded-lg transition-colors',
                isActive(to) ? 'bg-indigo-100' : ''
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={clsx(
                'text-[10px] font-medium truncate',
                isActive(to) ? 'text-indigo-600' : 'text-gray-500'
              )}>
                {label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <LiveRegionProvider>
              <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              {/* Learning Paths */}
              <Route path="/paths" element={<LearningPaths />} />
              <Route path="/paths/:pathId" element={<LearningPathDetail />} />
              {/* Courses */}
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/new" element={<CourseEditor />} />
              <Route path="/courses/:courseId" element={<CourseDetail />} />
              <Route path="/courses/:courseId/edit" element={<CourseEditor />} />
              <Route path="/courses/:courseId/modules/new" element={<ModuleEditor />} />
              <Route path="/courses/:courseId/modules/:moduleId" element={<ModuleViewer />} />
              <Route path="/courses/:courseId/modules/:moduleId/edit" element={<ModuleEditor />} />
              <Route path="/settings" element={<Settings />} />
              {/* Admin */}
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
              </Routes>
            </LiveRegionProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
