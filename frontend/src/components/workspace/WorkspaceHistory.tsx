import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '../../api/workspaces';
import { useAuthContext } from '../common/AuthContext';
import { Button } from '../common/Button';
import { EditorialValue } from './ChangeReview';
import type { WorkspaceRevision } from '../../types/workspace';

export function WorkspaceHistory({
  workspaceId,
  disabled,
  onChanged,
}: {
  workspaceId: string;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuthContext();
  const history = useQuery({
    queryKey: ['workspace-history', user?.id, workspaceId],
    queryFn: () => workspacesApi.history(workspaceId),
  });
  return (
    <section
      aria-label="Workspace history"
      className="bg-white rounded-xl border p-5 space-y-4 min-w-0"
    >
      <h2 className="text-xl font-semibold">History and restore</h2>
      <p>
        Restore writes a new history entry. Study attempts, ratings, practice, sharing and credit
        records stay intact. No generation refund is promised.
      </p>
      {history.isPending && <p role="status">Loading history…</p>}
      {history.error && (
        <p role="alert">History unavailable. Current source access may have changed.</p>
      )}
      {!history.error && history.data?.length === 0 && (
        <p>No recorded changes yet. Earlier manual edits are not reconstructed.</p>
      )}
      {!history.error && history.data?.map((revision) => (
        <HistoryEntry
          key={revision.id}
          revision={revision}
          workspaceId={workspaceId}
          disabled={disabled}
          onChanged={async () => {
            await history.refetch();
            await onChanged();
          }}
        />
      ))}
    </section>
  );
}
function HistoryEntry({
  revision,
  workspaceId,
  disabled,
  onChanged,
}: {
  revision: WorkspaceRevision;
  workspaceId: string;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const request = useRef<{
    request_id: string;
    expected_current_fingerprint: string;
  } | null>(null);
  async function restore() {
    if (!revision.current_fingerprint) return;
    request.current ??= {
      request_id: crypto.randomUUID(),
      expected_current_fingerprint: revision.current_fingerprint,
    };
    setBusy(true);
    setError('');
    try {
      await workspacesApi.restore(workspaceId, revision.id, request.current);
      setDone(true);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="border-t pt-3 space-y-2 min-w-0">
      <p className="font-medium">
        {revision.kind === 'creation'
          ? 'Created material'
          : revision.parent_revision_id
            ? 'Restored content'
            : 'Applied content'}{' '}
        · {new Date(revision.created_at).toLocaleString()}
      </p>
      <p>
        {revision.after.length} recorded object
        {revision.after.length === 1 ? '' : 's'}
      </p>
      {revision.kind === 'creation' ? (
        <p>Creation recorded. Not restorable: created objects are kept.</p>
      ) : (
        <details>
          <summary>Compare recorded fields</summary>
          {revision.before.map((before, index) => (
            <div key={before.target.resource_id} className="space-y-2">
              {(revision.touched_fields[index] || []).map((name) => (
                <div key={name}>
                  <p className="font-medium">{name.replaceAll('_', ' ')}</p>
                  <p>Before</p>
                  <EditorialValue name={name} value={before.fields[name]} />
                  <p>After</p>
                  <EditorialValue name={name} value={revision.after[index]?.fields[name]} />
                </div>
              ))}
            </div>
          ))}
        </details>
      )}
      {revision.before.map(
        (before, index) =>
          revision.touched_fields[index]?.includes('flashcards') && (
            <p key={before.target.resource_id}>
              Current{' '}
              {Array.isArray(revision.current_snapshots?.[index]?.fields.flashcards)
                ? (revision.current_snapshots![index].fields.flashcards as unknown[]).length
                : 'recorded'}{' '}
              cards → restore to{' '}
              {Array.isArray(before.fields.flashcards) ? before.fields.flashcards.length : 0} cards,
              preserving their recorded identities.
            </p>
          ),
      )}
      {revision.restorable && (
        <Button
          variant="secondary"
          disabled={disabled || busy || done}
          onClick={() => void restore()}
        >
          Restore prior content · free
        </Button>
      )}
      {done && <p role="status">Restored as a new history entry.</p>}
      {error && (
        <p role="alert">
          {error} Your history is kept. Review the current content before trying again.
        </p>
      )}
    </article>
  );
}
