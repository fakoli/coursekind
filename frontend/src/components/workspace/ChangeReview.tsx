import { MaterialReview } from './MaterialReview';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../common/AuthContext';
import { Button } from '../common/Button';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { workspacesApi } from '../../api/workspaces';
import { coursesApi } from '../../api/courses';
import { ApiError } from '../../api/client';
import { useAIPreferences } from '../../hooks/useUserSettings';

function AuthorizedCourseReference({ id }: { id: string }) {
  const { user } = useAuthContext();
  const course = useQuery({
    queryKey: ['workspace-reference-title', user?.id, id],
    queryFn: () => coursesApi.get(id),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const title = !course.isFetching && !course.error && user ? course.data?.course.title : null;
  return (
    <Link className="underline" to={`/courses/${id}`}>
      {title || 'Course reference (title unavailable)'}
    </Link>
  );
}

export function EditorialValue({ name, value }: { name: string; value: unknown }) {
  if (name === 'content_markdown' && typeof value === 'string')
    return value ? <MarkdownRenderer content={value} /> : <p>Empty lesson</p>;
  if (value == null) return <p>None</p>;
  if (name === 'quiz') {
    const quiz = value as import('../../types').QuizData;
    return (
      <div>
        <p>{quiz.questions.length} quiz questions</p>
        <ol className="list-decimal pl-5 space-y-3">
          {quiz.questions.map((question, index) => (
            <li key={index}>
              <p className="font-medium">{question.question}</p>
              <ul className="list-disc pl-5">
                {question.options.map((option, optionIndex) => (
                  <li key={optionIndex}>
                    {option}
                    {optionIndex === question.correct_index ? ' · Correct answer' : ''}
                  </li>
                ))}
              </ul>
              {question.explanation && <p>{question.explanation}</p>}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (name === 'flashcards') {
    const cards = value as import('../../types').FlashcardData[];
    return (
      <div>
        <p>{cards.length} flashcards</p>
        <ol className="space-y-2">
          {cards.map((card, index) => (
            <li key={card.id || index} className="border rounded p-2">
              <p className="font-medium">{card.front}</p>
              <p>{card.back}</p>
              <p className="whitespace-pre-wrap break-words">
                Visual: <span>{card.visual || 'No visual'}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (name === 'outline') {
    const outline = value as {
      id: string;
      title: string;
      description: string;
      objectives: string[];
    }[];
    return (
      <ol className="list-decimal pl-5 space-y-2">
        {outline.map((item) => (
          <li key={item.id}>
            <p className="font-medium">{item.title}</p>
            <p>{item.description}</p>
            <ul>
              {item.objectives.map((objective, index) => (
                <li key={index}>{objective}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );
  }
  if (Array.isArray(value))
    return value.length ? (
      <ul className="list-disc pl-5">
        {value.map((item, index) => (
          <li key={index} className="break-words">
            {name === 'course_ids' ? <AuthorizedCourseReference id={String(item)} /> : String(item)}
          </li>
        ))}
      </ul>
    ) : (
      <p>None</p>
    );
  return <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
}
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
  const preferences = useAIPreferences(user?.id);
  const change = useQuery({
    queryKey: ['workspace-change', user?.id, workspaceId, changeId],
    queryFn: () => workspacesApi.change(workspaceId, changeId),
  });
  const reviewRegion = useRef<HTMLElement>(null);
  const loadedChangeId = change.data?.id;
  useEffect(() => {
    if (loadedChangeId) reviewRegion.current?.focus();
  }, [loadedChangeId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const request = useRef<string | null>(null);
  const regenerateRequest = useRef<string | null>(null);
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
      setConflict(err instanceof ApiError && err.status === 409);
      setError(err instanceof Error ? err.message : 'Could not apply draft');
    } finally {
      setBusy(false);
    }
  }
  async function regenerate() {
    if (!change.data?.revision_request) return;
    regenerateRequest.current ??= crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      await workspacesApi.revise(workspaceId, {
        ...change.data.revision_request,
        request_id: regenerateRequest.current,
      });
      regenerateRequest.current = null;
      await onChanged();
      setError(
        'Fresh revision requested. Review its saved job when ready. Your earlier proposal is kept.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate');
    } finally {
      setBusy(false);
    }
  }
  if (change.error) return <p role="alert">Draft unavailable. Source access may have changed.</p>;
  if (!change.data) return <p role="status">Loading draft…</p>;
  const proposal = change.data;
  return (
    <section
      ref={reviewRegion}
      tabIndex={-1}
      aria-label="Draft review"
      className="rounded-xl border p-5 bg-white space-y-3 min-w-0"
    >
      <h3 className="text-xl font-semibold">Review content changes</h3>
      <p>
        {proposal.patches.length} object
        {proposal.patches.length === 1 ? '' : 's'} affected. Only the fields shown below change.
      </p>
      <p className="text-sm">
        Practice, study events, quiz attempts, ratings, sharing and credit history are preserved.
        Applying and restoring are free; generation charges are not refunded.
      </p>
      {proposal.patches.map((p, index) => {
        const before = (proposal.before?.[index] || proposal.base_snapshots[index])?.fields || {};
        return (
          <article key={p.target.resource_id} className="space-y-3 min-w-0 border-t pt-3">
            <h4 className="font-semibold">{String(before.title || p.target.kind)}</h4>
            {Object.entries(p.fields)
              .filter(([, value]) => value !== undefined)
              .map(([name, value]) => (
                <section key={name} aria-label={`${name} comparison`}>
                  <h5 className="font-medium">
                    {name === 'content_markdown'
                      ? 'Lesson'
                      : name === 'course_ids'
                        ? 'Course references'
                        : name.replaceAll('_', ' ')}
                  </h5>
                  <div className="grid md:grid-cols-2 gap-3">
                    <details className="min-w-0">
                      <summary>Before</summary>
                      <EditorialValue name={name} value={before[name]} />
                    </details>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Proposed</p>
                      <EditorialValue name={name} value={value} />
                    </div>
                  </div>
                  {name === 'flashcards' && Array.isArray(value) && (
                    <p>
                      Current {Array.isArray(before.flashcards) ? before.flashcards.length : 0}{' '}
                      cards → {value.length} proposed cards. New cards get new identities; retained
                      cards keep their ratings.
                    </p>
                  )}
                  {name === 'course_ids' && (
                    <p>
                      Only path references change. Source courses and their learner progress remain
                      intact.
                    </p>
                  )}
                </section>
              ))}
            {proposal.status === 'applied' && p.target.kind === 'module' && (
              <Link
                className="text-indigo-700 underline block"
                to={`/courses/${p.target.course_id}/modules/${p.target.resource_id}`}
              >
                Study this module
              </Link>
            )}
            {conflict && (
              <Link
                className="underline block"
                to={
                  p.target.kind === 'module'
                    ? `/courses/${p.target.course_id}/modules/${p.target.resource_id}`
                    : p.target.kind === 'course'
                      ? `/courses/${p.target.resource_id}`
                      : `/paths/${p.target.resource_id}`
                }
              >
                Review current {p.target.kind}
              </Link>
            )}
          </article>
        );
      })}
      {proposal.status === 'ready' && proposal.patches.some((p) => p.target.kind === 'module') && (
        <MaterialReview workspaceId={workspaceId} changeId={changeId} />
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {conflict && (
        <div className="space-y-2">
          {proposal.revision_request && (
            <>
              <p>
                Regeneration uses {preferences.data?.provider || 'your selected provider'} /{' '}
                {preferences.data?.model || 'selected model'} ·{' '}
                {preferences.data?.provider === 'anvil'
                  ? `${proposal.revision_request.scope === 'lesson' ? 25 : proposal.revision_request.scope === 'flashcards' ? 8 : 10} application credits`
                  : '0 Anvil credits; external provider charges may apply'}
                .
              </p>
              <Button
                disabled={disabled || busy || !preferences.data?.is_configured}
                onClick={() => void regenerate()}
              >
                Regenerate against current version
              </Button>
            </>
          )}
          {!proposal.revision_request && (
            <Button
              variant="secondary"
              onClick={() => {
                onDismiss();
              }}
            >
              Choose a fresh build or manual edit
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        {proposal.status === 'ready' ? (
          <Button disabled={disabled || busy || conflict} onClick={() => void apply()}>
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
