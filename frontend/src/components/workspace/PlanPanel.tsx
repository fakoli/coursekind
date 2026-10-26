import { useRef, useState } from 'react';
import { useCourses } from '../../hooks/useCourses';
import { Button } from '../common/Button';
import { workspacesApi } from '../../api/workspaces';
import { PlanReview } from './PlanReview';
import { WorkspaceJobs } from './WorkspaceJobs';
import type { PlanProposal, PlanRequest, Workspace, WorkspaceJob } from '../../types/workspace';
import type { AIPreferenceData } from '../../api/userSettings';

export function PlanPanel({
  workspace,
  plans,
  jobs,
  preferences,
  onChanged,
}: {
  workspace: Workspace;
  plans: PlanProposal[];
  jobs: WorkspaceJob[];
  preferences?: AIPreferenceData;
  onChanged: () => Promise<void>;
}) {
  const courses = useCourses();
  const [instruction, setInstruction] = useState('');
  const [reuseSelection, setReuse] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<PlanRequest | null>(null);
  const proposal = plans.find((p) => p.id === selected) || plans[0];
  const reuse = reuseSelection ?? proposal?.reuse_course_ids ?? [];
  const running = jobs.some((j) => ['queued', 'running'].includes(j.state));
  async function generate() {
    const data = {
      instruction,
      reuse_course_ids: reuse,
      ...(proposal ? { previous_proposal_id: proposal.id } : {}),
    };
    const old = request.current;
    if (!old || JSON.stringify({ ...old, request_id: undefined }) !== JSON.stringify(data))
      request.current = { ...data, request_id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await workspacesApi.plan(workspace.id, request.current!);
      request.current = null;
      setSelected(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan could not start');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Plan your learning" className="space-y-4 min-w-0">
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Plan your learning</h2>
        <p className="text-sm">
          {preferences
            ? `${preferences.provider} / ${preferences.model}`
            : 'Provider selection unavailable'}{' '}
          ·{' '}
          {preferences?.provider === 'anvil'
            ? '10 application credits'
            : '0 Anvil credits; external provider charges may apply'}{' '}
          per validated plan or refinement.
        </p>
        <p className="text-sm text-gray-600">
          Credits are charged when a validated draft is saved. Review and Apply are separate steps.
        </p>
        {workspace.course_ids.length > 0 && workspace.brief.scope === 'course' && (
          <p className="text-sm">This plan adds modules to your linked course.</p>
        )}
        <label className="block">
          {proposal ? 'AI refinement instructions' : 'Additional planning instructions'}
          <textarea
            className="block border rounded p-2 w-full"
            maxLength={4000}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={workspace.archived || busy}
          />
        </label>
        {workspace.brief.scope === 'path' && (
          <fieldset disabled={workspace.archived || busy} className="space-y-2">
            <legend>Explicitly choose existing courses to reuse (up to 3)</legend>
            {courses.data?.map((c) => (
              <label key={c.id} className="flex gap-2 items-start">
                <input
                  type="checkbox"
                  checked={reuse.includes(c.id)}
                  disabled={reuse.length >= 3 && !reuse.includes(c.id)}
                  onChange={(e) =>
                    setReuse(
                      e.target.checked ? [...reuse, c.id] : reuse.filter((id) => id !== c.id),
                    )
                  }
                />
                <span className="break-words">
                  {c.title} · {c.author_name}
                </span>
              </label>
            ))}
            {courses.error && <p>Existing courses unavailable. Retry loading the workspace.</p>}
          </fieldset>
        )}
        <Button
          disabled={workspace.archived || running || busy || !preferences?.is_configured}
          onClick={() => void generate()}
        >
          {proposal ? 'Refine with AI' : 'Generate plan'}
        </Button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
      <WorkspaceJobs
        jobs={jobs}
        onChanged={onChanged}
        onReview={setSelected}
        disabled={workspace.archived}
      />
      {proposal && (
        <PlanReview
          key={`${proposal.id}:${proposal.version}`}
          proposal={proposal}
          onChanged={onChanged}
          disabled={workspace.archived}
        />
      )}
    </section>
  );
}
