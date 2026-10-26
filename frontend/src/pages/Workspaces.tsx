import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../components/common/AuthContext';
import { Button } from '../components/common/Button';
import { BriefForm } from '../components/workspace/BriefForm';
import { useCreateWorkspace, useWorkspaces } from '../hooks/useWorkspaces';
import { emptyBrief, type WorkspaceCreate } from '../types/workspace';

export function Workspaces() {
  const { user } = useAuthContext();
  return <WorkspaceList key={user?.id} />;
}
function WorkspaceList() {
  const navigate = useNavigate();
  const [archived, setArchived] = useState(false);
  const [brief, setBrief] = useState(emptyBrief);
  const workspaces = useWorkspaces(archived);
  const create = useCreateWorkspace();
  const request = useRef<WorkspaceCreate | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.goal.trim()) return;
    request.current ??= { request_id: crypto.randomUUID(), brief };
    try {
      const workspace = await create.mutateAsync(request.current);
      navigate(`/workspaces/${workspace.id}`);
    } catch {
      /* The mutation error is rendered below; the draft stays in memory. */
    }
  };
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Workspaces</h1>
        <p className="text-gray-600 mt-2">
          Turn a goal into a course you can keep improving. Your workspaces are private.
        </p>
      </header>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section className="bg-white border rounded-xl p-5 space-y-4" aria-label="Your workspaces">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Show archived workspaces
          </label>
          {workspaces.isPending ? (
            <p role="status">Loading workspaces…</p>
          ) : workspaces.error ? (
            <div role="alert">
              Could not load workspaces.{' '}
              <Button variant="secondary" onClick={() => void workspaces.refetch()}>
                Retry loading
              </Button>
            </div>
          ) : workspaces.data?.length ? (
            <ul className="space-y-3">
              {workspaces.data.map((w) => (
                <li key={w.id}>
                  <Link
                    className="block p-4 rounded-lg border hover:border-indigo-500 break-words"
                    to={`/workspaces/${w.id}`}
                  >
                    <span className="font-medium text-indigo-700">{w.brief.goal}</span>
                    <span className="block text-sm text-gray-500">
                      {w.brief.scope === 'path' ? 'Learning path' : 'Course'} ·{' '}
                      {w.archived ? 'Archived' : 'Private'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-5 space-y-2">
              <h2 className="font-semibold">
                {archived ? 'No archived workspaces' : 'No workspaces yet'}
              </h2>
              <p>Start with a goal, or create your own material.</p>
              <Link className="text-indigo-700 underline" to="/courses/new">
                Create a course manually
              </Link>
            </div>
          )}
        </section>
        <form onSubmit={submit} className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="text-xl font-semibold">Start with a goal</h2>
          <BriefForm
            brief={brief}
            disabled={create.isPending}
            onChange={(value) => {
              setBrief(value);
              request.current = null;
              create.reset();
            }}
          />
          {create.error && (
            <p role="alert" className="text-red-700">
              {create.error.message}
            </p>
          )}
          <Button type="submit" disabled={!brief.goal.trim()} isLoading={create.isPending}>
            {create.isPending ? 'Creating…' : create.error ? 'Retry' : 'Create workspace'}
          </Button>
          <p className="text-sm text-gray-500">
            Saving a brief is free. You can also{' '}
            <Link to="/courses/new" className="underline text-indigo-700">
              create a course manually
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
