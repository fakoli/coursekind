import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '../../api/workspaces';
import { useAuthContext } from '../common/AuthContext';
import { Button } from '../common/Button';
import type { MaterialReviewRequest, ReviewSource } from '../../types/workspace';
import type { QuizData } from '../../types';

const labels = {
  answer_supported: 'Answer supported',
  answer_ambiguous: 'Answer ambiguous',
  objective_aligned: 'Objective aligned',
};
function validDimensions(value: Record<string, number> | null | undefined) {
  return (
    !!value &&
    Object.keys(value).length === 3 &&
    Object.keys(labels).every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        value[key] >= 0 &&
        value[key] <= 1,
    )
  );
}

export function MaterialReview({
  workspaceId,
  changeId,
}: {
  workspaceId: string;
  changeId?: string;
}) {
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [acceptedSelection, setAcceptedSelection] = useState(0);
  const client = useQueryClient();
  const sources = useQuery({
    queryKey: ['workspace-review-sources', user?.id, workspaceId, current ? undefined : changeId],
    queryFn: () => workspacesApi.reviewSources(workspaceId, current ? undefined : changeId),
    enabled: open,
  });
  const source =
    sources.data?.sources.find((s) => s.snapshot.target.resource_id === sourceId) ||
    sources.data?.sources[0];
  return (
    <section
      aria-label={changeId ? 'Draft advisory review' : 'Material advisory review'}
      className="rounded-xl border bg-white p-5 space-y-3 min-w-0"
    >
      <h3 className="text-lg font-semibold">Optional material review</h3>
      <p>
        Jev gives advisory probabilities about one quiz item. No Anvil credits are used; TypeSafe
        provider charges may apply. Study, scores and completion are unaffected.
      </p>
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Select material for TypeSafe review
        </Button>
      ) : (
        <>
          {sources.isPending && <p>Loading accessible material…</p>}
          {sources.error ? (
            <p role="alert">Review source unavailable. Reload to check current access.</p>
          ) : (
            <>
              {sources.data && !sources.data.configured && (
                <p>
                  TypeSafe review is not configured or is disabled. Your material remains available
                  to study and edit.
                </p>
              )}
              {sources.data && !source && <p>No module material is available for review yet.</p>}
              {source && (
                <>
                  <label className="block">
                    Review module
                    <select
                      className="block w-full border rounded p-2"
                      value={source.snapshot.target.resource_id}
                      onChange={(e) => setSourceId(e.target.value)}
                    >
                      {sources.data?.sources.map((s) => (
                        <option
                          key={s.snapshot.target.resource_id}
                          value={s.snapshot.target.resource_id}
                        >
                          {String(s.snapshot.fields.title || 'Module')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SelectedMaterial
                    key={`${source.snapshot.target.resource_id}:${source.change_id}:${acceptedSelection}`}
                    workspaceId={workspaceId}
                    source={source}
                    configured={!!sources.data?.configured}
                    onCurrent={async () => {
                      // Reset all selection state only after the user accepts a fresh read.
                      // Background refreshes must keep the previous result visibly stale.
                      await client.fetchQuery({
                        queryKey: ['workspace-review-sources', user?.id, workspaceId, undefined],
                        queryFn: () => workspacesApi.reviewSources(workspaceId),
                        staleTime: 0,
                      });
                      setCurrent(true);
                      setAcceptedSelection((version) => version + 1);
                    }}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function SelectedMaterial({
  workspaceId,
  source,
  configured,
  onCurrent,
}: {
  workspaceId: string;
  source: ReviewSource;
  configured: boolean;
  onCurrent: () => Promise<void>;
}) {
  const { user } = useAuthContext();
  const client = useQueryClient();
  const fields = source.snapshot.fields;
  const lesson = typeof fields.content_markdown === 'string' ? fields.content_markdown : '';
  const objectives = (fields.objectives || []) as string[];
  const questions = (fields.quiz as QuizData | null)?.questions || [];
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(lesson.length, 8000));
  const [objective, setObjective] = useState(objectives[0] || '');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const request = useRef<MaterialReviewRequest | null>(null);
  const resultFocus = useRef<HTMLDivElement>(null);
  const review = useQuery({
    queryKey: ['workspace-review', user?.id, workspaceId, reviewId],
    queryFn: () => workspacesApi.getReview(workspaceId, reviewId!),
    enabled: !!reviewId,
    // Read-time staleness/access checks do not trigger inference.
    refetchInterval: reviewId ? 10000 : false,
  });
  useEffect(() => {
    if (reviewId) resultFocus.current?.focus();
  }, [reviewId]);
  const excerpt = lesson.slice(start - 1, end);
  const question = questions[questionIndex];
  const valid =
    !!question &&
    objectives.includes(objective) &&
    !!objective &&
    !!excerpt.trim() &&
    objective.length <= 1000 &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 1 &&
    end >= start &&
    end <= lesson.length &&
    excerpt.length <= 8000 &&
    question.question.length + question.options.join('').length <= 4000;
  const selected = JSON.stringify({ excerpt, objective, questionIndex });
  const [reviewedSelection, setReviewedSelection] = useState<string | null>(null);
  const changedSelection = reviewedSelection !== null && selected !== reviewedSelection;
  const result = review.data;
  const stale =
    result?.state === 'stale' ||
    changedSelection ||
    (!!result && result.revision_marker !== source.revision_marker);
  const successful = result?.state === 'ready' && validDimensions(result.dimensions) && !stale;
  async function send(refresh = false) {
    if (!valid || !configured || busy) return;
    const input = {
      change_id: source.change_id,
      target: source.snapshot.target,
      question_index: questionIndex,
      lesson_excerpt: excerpt,
      objective,
      expected_fingerprint: source.snapshot.fingerprint,
      expected_revision_marker: source.revision_marker,
      refresh,
    };
    if (
      !request.current ||
      JSON.stringify({ ...request.current, request_id: undefined }) !== JSON.stringify(input)
    )
      request.current = { ...input, request_id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      const result = await workspacesApi.review(workspaceId, request.current);
      request.current = null;
      client.setQueryData(['workspace-review', user?.id, workspaceId, result.id], result);
      setReviewedSelection(selected);
      setReviewId(result.id);
      queueMicrotask(() => resultFocus.current?.focus());
    } catch {
      setError(
        'Review could not complete. Your material is kept. Check current material or retry; an external charge may already have occurred.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!lesson || !objectives.length || !questions.length ? (
        <p>This module needs a lesson, learning objective and quiz question before review.</p>
      ) : (
        <form
          aria-label="Selected material disclosure"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block">
            Review objective
            <select
              className="block w-full border rounded p-2"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            >
              {objectives.map((o, i) => (
                <option key={i} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Review question
            <select
              className="block w-full border rounded p-2"
              value={questionIndex}
              onChange={(e) => setQuestionIndex(Number(e.target.value))}
            >
              {questions.map((q, i) => (
                <option key={i} value={i}>
                  Question {i + 1}
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>Full source lesson ({lesson.length} characters)</summary>
            <pre className="whitespace-pre-wrap break-words max-h-64 overflow-auto">{lesson}</pre>
          </details>
          <p>
            Choose excerpt boundaries from the source lesson. Maximum 8,000 characters; the text
            itself is read-only.
          </p>
          <div className="flex gap-3 flex-wrap">
            <label>
              Excerpt start character
              <input
                type="number"
                className="block border rounded p-2 w-32"
                min={1}
                max={lesson.length}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <label>
              Excerpt end character
              <input
                type="number"
                className="block border rounded p-2 w-32"
                min={start}
                max={lesson.length}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="block">
            Selected lesson excerpt
            <textarea className="block w-full border rounded p-2 h-36" readOnly value={excerpt} />
          </label>
          <div className="border rounded p-3 space-y-2 break-words">
            <p className="font-medium">Selected question sent to TypeSafe</p>
            <p>{question?.question}</p>
            <ul>
              {question?.options.map((o, i) => (
                <li key={i}>
                  {o}
                  {i === question.correct_index ? ' · Marked answer' : ''}
                </li>
              ))}
            </ul>
          </div>
          <p>
            The action below sends exactly this excerpt, selected objective, question, options and
            marked answer to TypeSafe using Jev 1.14.0. It sends no learner history or account
            details.
          </p>
          {!valid && (
            <p>
              Select valid source boundaries and material within the review limits: objective 1,000
              characters; question and options 4,000 characters.
            </p>
          )}
          <Button type="submit" disabled={!valid || !configured || busy}>
            Send selected material to TypeSafe for review
          </Button>
        </form>
      )}
      {busy && <p>Reviewing selected material…</p>}
      {error && <p role="alert">{error}</p>}
      {reviewId && (
        <div
          ref={resultFocus}
          role="status"
          aria-label="Material review result"
          tabIndex={-1}
          className="border rounded p-3 space-y-2 focus:outline-indigo-600"
        >
          {review.error ? (
            <p>Review unavailable. Source access may have changed.</p>
          ) : stale ? (
            <>
              <p>Review stale. The material or selection has changed.</p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await onCurrent();
                  } catch {
                    setError(
                      'Current material could not be loaded. Retry when source access is available.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Review current material
              </Button>
            </>
          ) : successful ? (
            <>
              <h4 className="font-semibold">Advisory</h4>
              <p>These probabilities are not a guarantee of correctness.</p>
              <ul>
                {Object.entries(labels).map(([key, label]) => (
                  <li key={key}>
                    {label}: {Math.round(result!.dimensions![key] * 100)}%
                  </li>
                ))}
              </ul>
              <p>
                {result!.model} · {result!.usage?.input_tokens ?? 0} input /{' '}
                {result!.usage?.output_tokens ?? 0} output tokens
              </p>
              <Button
                variant="secondary"
                disabled={busy || !configured || !valid}
                onClick={() => void send(true)}
              >
                Refresh TypeSafe review
              </Button>
            </>
          ) : (
            <>
              <p>Review unavailable. Your material is kept.</p>
              <Button
                variant="secondary"
                disabled={busy || !configured || !valid}
                onClick={() => void send(true)}
              >
                Retry TypeSafe review
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
