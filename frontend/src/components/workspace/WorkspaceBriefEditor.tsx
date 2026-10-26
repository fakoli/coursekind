import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { Button } from '../common/Button';
import { BriefForm } from './BriefForm';
import { useUpdateWorkspace } from '../../hooks/useWorkspaces';
import type { Workspace, WorkspaceUpdate } from '../../types/workspace';

export function WorkspaceBriefEditor({ workspace }: { workspace: Workspace }) {
  const [brief, setBrief] = useState(workspace.brief);
  const [saved, setSaved] = useState(workspace.brief);
  const [version, setVersion] = useState(workspace.version);
  const save = useUpdateWorkspace(workspace.id);
  const request = useRef<WorkspaceUpdate | null>(null);
  const dirty = JSON.stringify(brief) !== JSON.stringify(saved);
  const stale = save.error instanceof ApiError && save.error.status === 409;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.goal.trim()) return;
    request.current ??= { request_id: crypto.randomUUID(), expected_version: version, brief };
    try {
      const result = await save.mutateAsync(request.current);
      setBrief(result.brief); setSaved(result.brief); setVersion(result.version); request.current = null;
    } catch { /* Render the error and retain the draft and replay key. */ }
  };
  return <form onSubmit={submit} className="bg-white border rounded-xl p-5 space-y-4 min-w-0">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-semibold">Learning brief</h2><span role="status" className="text-sm text-gray-600">{save.isPending ? 'Saving…' : save.error ? 'Save failed' : dirty ? 'Unsaved changes' : 'Saved'}</span></div>
    <BriefForm brief={brief} disabled={save.isPending || workspace.archived} onChange={value => { setBrief(value); request.current = null; save.reset(); }} />
    {save.error && <div role="alert" className="text-red-700 space-y-2"><p>{stale ? 'This workspace changed. Your edits are kept. Reload the saved brief to compare before saving again.' : save.error.message}</p>
      {stale && <><p className="text-sm">Reloading replaces your unsaved edits with the saved version.</p><Button type="button" variant="secondary" onClick={() => { setBrief(workspace.brief); setSaved(workspace.brief); setVersion(workspace.version); request.current = null; save.reset(); }}>Reload saved brief</Button></>}
    </div>}
    {!workspace.archived && <Button type="submit" disabled={save.isPending || !brief.goal.trim() || (!dirty && !save.error) || stale}>{save.isPending ? 'Saving…' : save.error && !stale ? 'Retry' : 'Save brief'}</Button>}
  </form>;
}
