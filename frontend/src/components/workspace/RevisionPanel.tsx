import { CreditPreflight } from './CreditPreflight';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '../common/AuthContext';
import { useCourses } from '../../hooks/useCourses';
import { useWorkspaceModules } from '../../hooks/useWorkspaceActivity';
import { workspacesApi } from '../../api/workspaces';
import { Button } from '../common/Button';
import { WorkspaceJobs } from './WorkspaceJobs';
import { ChangeReview } from './ChangeReview';
import type { AIPreferenceData } from '../../api/userSettings';
import type {
  ChangeSet,
  ResourceSnapshot,
  RevisionRequest,
  RevisionScope,
  ResourceTarget,
  Workspace,
  WorkspaceJob,
} from '../../types/workspace';

const scopes: { value: RevisionScope; label: string; cost: number }[] = [
  { value: 'lesson', label: 'Lesson only', cost: 25 },
  { value: 'flashcards', label: 'Flashcards only', cost: 8 },
  { value: 'quiz', label: 'Quiz only', cost: 10 },
  { value: 'course_metadata', label: 'Course details', cost: 10 },
  { value: 'course_outline', label: 'Existing course outline', cost: 10 },
  { value: 'path_references', label: 'Path references', cost: 10 },
];
export function RevisionPanel({
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
  const { user } = useAuthContext();
  const courses = useCourses();
  const modules = useWorkspaceModules(workspace);
  const snapshots = useQuery({
    queryKey: ['workspace-snapshots', user?.id, workspace.id],
    queryFn: () => workspacesApi.snapshots(workspace.id),
  });
  const manualDrafts = useQuery({
    queryKey: ['workspace-changes', user?.id, workspace.id],
    queryFn: () => workspacesApi.changes(workspace.id),
  });
  const [scope, setScope] = useState<RevisionScope>('lesson');
  const [targetId, setTargetId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [count, setCount] = useState(5);
  const [reuse, setReuse] = useState<string[]>([]);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const openReview = (id: string, trigger?: HTMLElement) => {
    reviewTrigger.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setReview(id);
  };
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<RevisionRequest | null>(null);
  const kind = scope.startsWith('course_')
    ? 'course'
    : scope === 'path_references'
      ? 'path'
      : 'module';
  const choices =
    kind === 'module'
      ? (modules.data || []).map((m) => ({
          id: m.id,
          title: m.title,
          course_id: m.course_id,
        }))
      : kind === 'course'
        ? (courses.data || [])
            .filter(
              (c) =>
                workspace.course_ids.includes(c.id) &&
                c.author_id === user?.id &&
                c.source !== 'filesystem',
            )
            .map((c) => ({ id: c.id, title: c.title, course_id: null }))
        : workspace.path_id
          ? [
              {
                id: workspace.path_id,
                title: 'Linked learning path',
                course_id: null,
              },
            ]
          : [];
  const selected = choices.find((c) => c.id === targetId) || choices[0];
  const activity = scope === 'quiz' || scope === 'flashcards';
  const running = jobs.some((j) => ['queued', 'running'].includes(j.state));
  const pathSnapshot = !snapshots.error && snapshots.data?.find((s) => s.target.kind === 'path');
  async function generate() {
    if (!selected) return;
    const target: ResourceTarget = {
      kind,
      resource_id: selected.id,
      course_id: selected.course_id,
    };
    const data = {
      target,
      scope,
      instruction,
      ...(activity ? { count } : {}),
      reuse_course_ids: scope === 'path_references' ? reuse : [],
    };
    if (
      !request.current ||
      JSON.stringify({ ...request.current, request_id: undefined }) !== JSON.stringify(data)
    )
      request.current = { ...data, request_id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await workspacesApi.revise(workspace.id, request.current);
      request.current = null;
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start revision');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Revise learning material" className="space-y-4 min-w-0">
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Revise selected content</h2>
        <p>Choose one scope. Existing module IDs stay in place; use a plan to add new material.</p>
        <p className="text-sm">
          {preferences
            ? `${preferences.provider} / ${preferences.model}`
            : 'Provider selection unavailable'}{' '}
          ·{' '}
          {preferences?.provider === 'anvil'
            ? `${scopes.find((s) => s.value === scope)!.cost} application credits`
            : '0 Anvil credits; external provider charges may apply'}{' '}
          per validated revision. Review and Apply are separate steps.
        </p>
        <CreditPreflight
          provider={preferences?.provider}
          cost={scopes.find((s) => s.value === scope)!.cost}
        />
        <fieldset disabled={workspace.archived || busy} className="space-y-3">
          <label className="block">
            Revision scope
            <select
              className="block border p-2 rounded w-full"
              value={scope}
              onChange={(e) => {
                const value = e.target.value as RevisionScope;
                setScope(value);
                setTargetId('');
                setCount(value === 'quiz' ? 3 : 5);
              }}
            >
              {scopes
                .filter((s) => s.value !== 'path_references' || workspace.path_id)
                .map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            Revision target
            <select
              className="block border p-2 rounded w-full"
              value={selected?.id || ''}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {!choices.length && <option value="">No editable linked target</option>}
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Revision instructions
            <textarea
              className="block border rounded p-2 w-full"
              maxLength={4000}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          {activity && (
            <label className="block">
              Revision count
              <input
                className="border rounded p-2 ml-2 w-20"
                type="number"
                min={1}
                max={scope === 'quiz' ? 10 : 20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
          )}
          {scope === 'path_references' && (
            <fieldset className="space-y-2">
              <legend>Allowed resulting courses, including retained references</legend>
              <p>
                Choose every course that may remain. Unselected courses cannot appear in the
                proposed path.
              </p>
              {courses.data?.map((c) => (
                <label key={c.id} className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={reuse.includes(c.id)}
                    onChange={(e) =>
                      setReuse(
                        e.target.checked ? [...reuse, c.id] : reuse.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.title}
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>
        <Button
          disabled={
            workspace.archived ||
            busy ||
            running ||
            !selected ||
            !instruction.trim() ||
            !preferences?.is_configured ||
            (activity &&
              (!Number.isInteger(count) || count < 1 || count > (scope === 'quiz' ? 10 : 20)))
          }
          onClick={() => void generate()}
        >
          Generate scoped revision
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
      {pathSnapshot && (
        <PathReferences
          key={pathSnapshot.fingerprint}
          snapshot={pathSnapshot}
          workspaceId={workspace.id}
          titles={Object.fromEntries((courses.data || []).map((c) => [c.id, c.title]))}
          disabled={workspace.archived}
          onReview={(id, trigger) => {
            openReview(id, trigger);
            void manualDrafts.refetch();
          }}
        />
      )}
      {manualDrafts.error && <p role="alert">Saved manual drafts unavailable. Historical source access may have changed.</p>}
      {(manualDrafts.error ? [] : manualDrafts.data || [])
        .filter((change) => !change.origin_job_id && change.status === 'ready')
        .map((change) => (
          <Button key={change.id} variant="secondary" onClick={() => openReview(change.id)}>
            Review saved manual change · {new Date(change.created_at).toLocaleString()}
          </Button>
        ))}
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
function PathReferences({
  snapshot,
  workspaceId,
  titles,
  disabled,
  onReview,
}: {
  snapshot: ResourceSnapshot;
  workspaceId: string;
  titles: Record<string, string>;
  disabled?: boolean;
  onReview: (id: string, trigger: HTMLElement) => void;
}) {
  const original = snapshot.fields.course_ids as string[];
  const [ids, setIds] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{
    request_id: string;
    patches: ChangeSet['patches'];
  } | null>(null);
  function move(index: number, offset: number) {
    const next = [...ids];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setIds(next);
  }
  async function review(trigger: HTMLElement) {
    const patches = [
      {
        target: snapshot.target,
        expected_fingerprint: snapshot.fingerprint,
        fields: { course_ids: ids },
      },
    ];
    if (!request.current || JSON.stringify(request.current.patches) !== JSON.stringify(patches))
      request.current = { request_id: crypto.randomUUID(), patches };
    setBusy(true);
    setError('');
    try {
      const change = await workspacesApi.manualChange(workspaceId, request.current);
      request.current = null;
      onReview(change.id, trigger);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare path edit');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Edit path references" className="bg-white border rounded-xl p-5 space-y-3">
      <h3 className="font-semibold">Reorder or remove path references · free</h3>
      <p>
        Removing a reference keeps the source course, its modules and all learner progress. Review
        before applying.
      </p>
      <ol className="space-y-2">
        {ids.map((id, index) => (
          <li key={id} className="flex flex-wrap items-center gap-2">
            <span>{titles[id] || id}</span>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Move ${titles[id] || id} up`}
              disabled={disabled || busy || index === 0}
              onClick={() => move(index, -1)}
            >
              Up
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Move ${titles[id] || id} down`}
              disabled={disabled || busy || index === ids.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Remove reference to ${titles[id] || id}`}
              disabled={disabled || busy}
              onClick={() => setIds(ids.filter((item) => item !== id))}
            >
              Remove reference
            </Button>
          </li>
        ))}
      </ol>
      <Button
        disabled={disabled || busy || JSON.stringify(ids) === JSON.stringify(original)}
        onClick={(event) => void review(event.currentTarget)}
      >
        Review path changes · free
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
