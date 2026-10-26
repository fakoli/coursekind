import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext } from '../components/common/AuthContext';
import { Button } from '../components/common/Button';
import { WorkspaceBriefEditor } from '../components/workspace/WorkspaceBriefEditor';
import { WorkspaceOutline } from '../components/workspace/WorkspaceOutline';
import { useWorkspace, useUpdateWorkspace } from '../hooks/useWorkspaces';
import { useAIPreferences } from '../hooks/useUserSettings';
import type { Workspace as WorkspaceData, WorkspaceUpdate } from '../types/workspace';

export function Workspace() {
  const { workspaceId = '' } = useParams();
  const { user } = useAuthContext();
  const workspace = useWorkspace(workspaceId);
  if (workspace.isPending) return <p role="status">Loading workspace…</p>;
  if (workspace.error || !workspace.data || workspace.data.owner_id !== user?.id) return <div className="space-y-3"><h1 className="text-2xl font-bold">Workspace unavailable</h1><p>It may have been removed or belong to a different account.</p><Button variant="secondary" onClick={() => void workspace.refetch()}>Retry loading</Button><Link className="block underline text-indigo-700" to="/workspaces">Back to workspaces</Link></div>;
  return <WorkspaceDetail key={`${user.id}:${workspaceId}`} workspace={workspace.data} />;
}
function WorkspaceDetail({ workspace }: { workspace: WorkspaceData }) {
  const { user } = useAuthContext();
  const preferences = useAIPreferences(user?.id);
  const archive = useUpdateWorkspace(workspace.id);
  const request = useRef<WorkspaceUpdate | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const handleArchive = async () => {
    request.current ??= { request_id: crypto.randomUUID(), expected_version: workspace.version, archived: !workspace.archived };
    try { await archive.mutateAsync(request.current); request.current = null; setArchiveError(''); }
    catch (err) { setArchiveError(err instanceof Error ? err.message : 'Could not archive workspace'); }
  };
  return <div className="space-y-6">
    <Link to="/workspaces" className="text-indigo-700 underline">Back to workspaces</Link>
    <header className="flex flex-wrap justify-between gap-4 items-start">
      <div className="min-w-0"><h1 className="text-2xl font-bold text-gray-900 break-words">{workspace.brief.goal}</h1><p className="mt-2 text-gray-600">{workspace.archived ? 'Archived workspace' : 'Private workspace'} · Current action: {workspace.archived ? 'View saved material' : 'Edit your learning brief'}</p></div>
      <Button variant="secondary" isLoading={archive.isPending} onClick={() => void handleArchive()}>{workspace.archived ? 'Restore workspace' : 'Archive workspace'}</Button>
    </header>
    {archiveError && <p role="alert" className="text-red-700">{archiveError} Your linked courses are kept. Try again or reload the workspace.</p>}
    <div className="grid lg:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_minmax(180px,1fr)] gap-5 items-start">
      <WorkspaceOutline workspace={workspace} />
      <WorkspaceBriefEditor workspace={workspace} />
      <aside className="bg-white border rounded-xl p-5 space-y-3 min-w-0" aria-label="Workspace assistant">
        <h2 className="font-semibold text-lg">Assistant</h2>
        <p className="text-sm break-words">{preferences.data ? `Selected: ${preferences.data.provider} / ${preferences.data.model}` : preferences.isPending ? 'Loading provider selection…' : 'Provider selection unavailable.'}</p>
        <Link to="/settings" className="text-indigo-700 underline">AI settings</Link>
        <p className="text-sm text-gray-600">Your saved brief is ready to guide your course. Use the linked material to edit or study.</p>
      </aside>
    </div>
  </div>;
}
