import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../common/AuthContext';
import { Button } from '../common/Button';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { workspacesApi } from '../../api/workspaces';

export function ChangeReview({
  workspaceId,
  changeId,
  onDismiss,
  onChanged,
  disabled,
}: {
  workspaceId: string;
  changeId: string;
  onDismiss: () => void;
  onChanged: () => Promise<void>;
  disabled?: boolean;
}) {
  const { user } = useAuthContext();
  const change = useQuery({
    queryKey: ['workspace-change', user?.id, workspaceId, changeId],
    queryFn: () => workspacesApi.change(workspaceId, changeId),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<string | null>(null);
  async function apply() {
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      await workspacesApi.applyChange(workspaceId, changeId, request.current);
      request.current = null;
      await change.refetch();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply draft');
    } finally {
      setBusy(false);
    }
  }
  if (change.error) return <p role="alert">Draft unavailable. Source access may have changed.</p>;
  if (!change.data) return <p role="status">Loading draft…</p>;
  return (
    <section aria-label="Draft review" className="rounded-xl border p-5 bg-white space-y-3 min-w-0">
      <h3 className="text-xl font-semibold">Review module draft</h3>
      <p className="text-sm">
        Applying saves this lesson and an immutable before/after history record. Unrequested
        activities and practice stay in place.
      </p>
      {change.data.patches.map((p) => (
        <div key={p.target.resource_id} className="space-y-3 min-w-0">
          <MarkdownRenderer content={p.fields.content_markdown} />
          {p.fields.flashcards && (
            <details>
              <summary>{p.fields.flashcards.length} proposed flashcards</summary>
              <ul>
                {p.fields.flashcards.map((c) => (
                  <li key={c.id || c.front} className="border p-2">
                    <strong>{c.front}</strong>
                    <p>{c.back}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {p.fields.quiz && (
            <details>
              <summary>{p.fields.quiz.questions.length} proposed quiz questions</summary>
              <ol>
                {p.fields.quiz.questions.map((q, i) => (
                  <li key={i} className="border p-2">
                    <strong>{q.question}</strong>
                    <p>{q.options.join(' · ')}</p>
                    <p>Answer: {q.options[q.correct_index]}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {change.data?.status === 'applied' && (
            <Link
              className="text-indigo-700 underline block"
              to={`/courses/${p.target.course_id}/modules/${p.target.resource_id}`}
            >
              Study this module
            </Link>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3 flex-wrap">
        {change.data.status === 'ready' ? (
          <Button disabled={disabled || busy} onClick={() => void apply()}>
            Apply draft · free
          </Button>
        ) : (
          <p role="status">Draft applied. History saved.</p>
        )}
        <Button variant="secondary" onClick={onDismiss}>
          Dismiss review
        </Button>
      </div>
    </section>
  );
}
