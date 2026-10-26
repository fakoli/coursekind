import { CreditPreflight } from './CreditPreflight';
import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import { workspacesApi } from '../../api/workspaces';
import { useWorkspaceModules } from '../../hooks/useWorkspaceActivity';
import { WorkspaceJobs } from './WorkspaceJobs';
import { ChangeReview } from './ChangeReview';
import type { AIPreferenceData } from '../../api/userSettings';
import type { BuildRequest, Workspace, WorkspaceJob } from '../../types/workspace';

export function BuildPanel({
  workspace,
  jobs,
  preferences,
  onChanged,
}: {
  workspace: Workspace;
  jobs: WorkspaceJob[];
  preferences?: AIPreferenceData;
  onChanged: () => Promise<void>;
}) {
  const modules = useWorkspaceModules(workspace);
  const [selection, setSelection] = useState<string[] | null>(null);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const openReview = (id: string) => {
    reviewTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReview(id);
  };
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cards, setCards] = useState(workspace.brief.generate_flashcards);
  const [cardCount, setCardCount] = useState(workspace.brief.flashcard_count);
  const [quiz, setQuiz] = useState(workspace.brief.generate_quiz);
  const [quizCount, setQuizCount] = useState(workspace.brief.quiz_question_count);
  const request = useRef<BuildRequest | null>(null);
  const first = modules.data?.find((m) => !m.content_markdown.trim());
  const selected = selection ?? (first ? [first.id] : []);
  const running = jobs.some((j) => ['queued', 'running'].includes(j.state));
  const valid =
    selected.length > 0 &&
    selected.length <= 3 &&
    (!cards || (Number.isInteger(cardCount) && cardCount >= 1 && cardCount <= 20)) &&
    (!quiz || (Number.isInteger(quizCount) && quizCount >= 1 && quizCount <= 10));
  async function build() {
    const data = {
      module_ids: selected,
      generate_flashcards: cards,
      flashcard_count: cards ? cardCount : 5,
      generate_quiz: quiz,
      quiz_question_count: quiz ? quizCount : 3,
    };
    if (
      !request.current ||
      JSON.stringify({ ...request.current, request_id: undefined }) !== JSON.stringify(data)
    )
      request.current = { ...data, request_id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await workspacesApi.build(workspace.id, request.current);
      request.current = null;
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build could not start');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Build learning material" className="space-y-4 min-w-0">
      <div className="border rounded-xl p-5 bg-white space-y-3">
        <h2 className="text-xl font-semibold">Build your first lesson</h2>
        <p className="text-sm">
          Start with one incomplete module, or select up to three. Modules build one at a time and
          remain drafts until you apply them.
        </p>
        <p className="text-sm break-words">
          {preferences
            ? `${preferences.provider} / ${preferences.model}`
            : 'Provider selection unavailable'}{' '}
          ·{' '}
          {preferences?.provider === 'anvil'
            ? `${25 * selected.length} application credits (${selected.length} × 25)`
            : '0 Anvil credits; external provider charges may apply'}
          . Charged when each validated draft is saved.
        </p>
        <CreditPreflight provider={preferences?.provider} cost={25 * selected.length} />
        {modules.isPending && <p role="status">Loading modules…</p>}
        {modules.error && <p role="alert">Modules unavailable. Reload to check current access.</p>}
        {!modules.error && (
          <fieldset disabled={workspace.archived || busy} className="space-y-2">
            <legend className="sr-only">Modules to build</legend>
            {modules.data?.map((m) => (
              <label key={m.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  disabled={selected.length >= 3 && !selected.includes(m.id)}
                  onChange={(e) =>
                    setSelection(
                      e.target.checked ? [...selected, m.id] : selected.filter((id) => id !== m.id),
                    )
                  }
                />
                <span>
                  {m.title}
                  {m.content_markdown.trim() ? ' · has a lesson' : ' · incomplete'}
                </span>
              </label>
            ))}
            {modules.data?.length === 0 && (
              <p>
                Apply a plan or link a course you own to build a lesson. Reused courses remain
                available for study.
              </p>
            )}
            <div className="flex gap-3 flex-wrap">
              <label>
                <input
                  type="checkbox"
                  checked={cards}
                  onChange={(e) => setCards(e.target.checked)}
                />{' '}
                Generate flashcards
              </label>
              <label>
                Flashcards
                <input
                  aria-label="Build flashcard count"
                  className="border rounded p-1 w-20 ml-2"
                  type="number"
                  min={1}
                  max={20}
                  disabled={!cards}
                  value={cardCount}
                  onChange={(e) => setCardCount(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="flex gap-3 flex-wrap">
              <label>
                <input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} />{' '}
                Generate quiz
              </label>
              <label>
                Questions
                <input
                  aria-label="Build question count"
                  className="border rounded p-1 w-20 ml-2"
                  type="number"
                  min={1}
                  max={10}
                  disabled={!quiz}
                  value={quizCount}
                  onChange={(e) => setQuizCount(Number(e.target.value))}
                />
              </label>
            </div>
          </fieldset>
        )}
        <Button
          disabled={
            workspace.archived ||
            busy ||
            running ||
            !valid ||
            !!modules.error ||
            !preferences?.is_configured
          }
          onClick={() => void build()}
        >
          Build selected modules
        </Button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
      <WorkspaceJobs
        preferences={preferences}
        jobs={jobs}
        onChanged={onChanged}
        onReview={openReview}
        disabled={workspace.archived}
      />
      {review && (
        <ChangeReview
          key={review}
          workspaceId={workspace.id}
          changeId={review}
          onDismiss={() => {
            setReview(null);
            reviewTrigger.current?.focus();
          }}
          onChanged={onChanged}
          disabled={workspace.archived}
        />
      )}
    </section>
  );
}
