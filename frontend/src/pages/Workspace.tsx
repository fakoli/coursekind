import { MaterialReview } from '../components/workspace/MaterialReview';
import { RevisionPanel } from '../components/workspace/RevisionPanel';
import { WorkspaceHistory } from '../components/workspace/WorkspaceHistory';
import { PlanPanel } from '../components/workspace/PlanPanel';
import { BuildPanel } from '../components/workspace/BuildPanel';
import { useWorkspaceActivity } from '../hooks/useWorkspaceActivity';
import { ApiError } from '../api/client';
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
  const denied =
    workspace.error instanceof ApiError && [401, 403, 404].includes(workspace.error.status);
  if (denied || !workspace.data || workspace.data.owner_id !== user?.id)
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Workspace unavailable</h1>
        <p>It may have been removed or belong to a different account.</p>
        <Button variant="secondary" onClick={() => void workspace.refetch()}>
          Retry loading
        </Button>
        <Link className="block underline text-indigo-700" to="/workspaces">
          Back to workspaces
        </Link>
      </div>
    );
  return <WorkspaceDetail key={`${user.id}:${workspaceId}`} workspace={workspace.data} />;
}
function WorkspaceDetail({ workspace }: { workspace: WorkspaceData }) {
  const { user } = useAuthContext();
  const preferences = useAIPreferences(user?.id);
  const archive = useUpdateWorkspace(workspace.id);
  const activity = useWorkspaceActivity(workspace.id);
  const request = useRef<WorkspaceUpdate | null>(null);
  const briefDisclosure = useRef<HTMLDetailsElement>(null);
  const planDisclosure = useRef<HTMLDetailsElement>(null);
  const sectionDisclosures = useRef<Record<string, HTMLDetailsElement | null>>({});
  const latestPlan = activity.plans.data?.[0];
  const appliedPlan = latestPlan?.status === 'applied';
  const planOpen = latestPlan ? !appliedPlan : workspace.course_ids.length === 0;
  const nextSection = workspace.course_ids.length ? 'build' : 'plan';
  const openSection = (section: string) => {
    if (section === 'brief' && briefDisclosure.current) briefDisclosure.current.open = true;
    if (sectionDisclosures.current[section]) sectionDisclosures.current[section]!.open = true;
    if (section === 'plan' && planDisclosure.current) planDisclosure.current.open = true;
  };
  const [archiveError, setArchiveError] = useState('');
  const [confirmedArchive, setConfirmedArchive] = useState<WorkspaceData | null>(null);
  const handleArchive = async () => {
    request.current ??= {
      request_id: crypto.randomUUID(),
      expected_version: workspace.version,
      archived: !workspace.archived,
    };
    try {
      const result = await archive.mutateAsync(request.current);
      setConfirmedArchive(result);
      request.current = null;
      setArchiveError('');
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not archive workspace');
    }
  };
  return (
    <div className="space-y-6">
      <Link to="/workspaces" className="text-indigo-700 underline">
        Back to workspaces
      </Link>
      <header className="flex flex-wrap justify-between gap-4 items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{workspace.brief.goal}</h1>
          <p className="mt-2 text-gray-600">
            {workspace.archived ? 'Archived workspace' : 'Private workspace'} · Current action:{' '}
            {workspace.archived ? 'View saved material' : 'Review a plan or build a lesson'}
          </p>
        </div>
        <Button
          variant="secondary"
          isLoading={archive.isPending}
          onClick={() => void handleArchive()}
        >
          {workspace.archived ? 'Restore workspace' : 'Archive workspace'}
        </Button>
      </header>
      {archiveError && (
        <p role="alert" className="text-red-700">
          {archiveError} Your linked courses are kept. Try again or reload the workspace.
        </p>
      )}
      <nav aria-label="Workspace sections" className="flex flex-wrap gap-4">
        {['brief', 'plan', 'build', 'revision', 'review', 'history'].map((section) => (
          <a
            key={section}
            className="underline text-indigo-700"
            href={`#workspace-${section}`}
            onClick={() => openSection(section)}
          >
            {section[0].toUpperCase() + section.slice(1)}
          </a>
        ))}
      </nav>
      <p role="status" className="text-sm text-gray-600">
        {
          (activity.jobs.data || []).filter((job) => ['queued', 'running'].includes(job.state))
            .length
        }{' '}
        active jobs ·{' '}
        {
          (activity.jobs.data || []).filter((job) =>
            ['partial', 'failed', 'interrupted'].includes(job.state),
          ).length
        }{' '}
        jobs needing attention. Saved drafts and retry controls are in their Plan, Build or Revision
        section.
      </p>
      {!workspace.archived && (
        <a
          className="inline-block rounded bg-indigo-700 text-white px-4 py-2"
          href={`#workspace-${nextSection}`}
          onClick={() => openSection(nextSection)}
        >
          {nextSection === 'build'
            ? 'Next: build or recover a lesson'
            : 'Next: generate and review a plan'}
        </a>
      )}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <WorkspaceOutline workspace={workspace} />

        <aside
          className="bg-white border rounded-xl p-5 space-y-3 min-w-0"
          aria-label="Workspace assistant"
        >
          <h2 className="font-semibold text-lg">Assistant</h2>
          <p className="text-sm break-words">
            {preferences.data
              ? `Selected: ${preferences.data.provider} / ${preferences.data.model}`
              : preferences.isPending
                ? 'Loading provider selection…'
                : 'Provider selection unavailable.'}
          </p>
          <Link to="/settings" className="text-indigo-700 underline">
            AI settings
          </Link>
          <p className="text-sm text-gray-600">
            Your saved brief is ready to guide your course. Use the linked material to edit or
            study.
          </p>
        </aside>
      </div>
      <details
        id="workspace-brief"
        ref={briefDisclosure}
        className="rounded-xl border bg-white p-4 scroll-mt-20"
      >
        <summary className="cursor-pointer font-semibold">
          Saved brief · edit goal and defaults
        </summary>
        <WorkspaceBriefEditor workspace={workspace} confirmedArchive={confirmedArchive} />
      </details>
      {activity.jobs.error || activity.plans.error ? (
        <p role="alert">Saved plans and jobs unavailable. Reload to check current source access.</p>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          <details
            id="workspace-plan"
            ref={planDisclosure}
            open={planOpen}
            className="scroll-mt-20"
          >
            <summary className="cursor-pointer font-semibold mb-3">
              {appliedPlan
                ? 'Applied plan · reopen to review or refine'
                : 'Plan · review before creating material'}
            </summary>
            <PlanPanel
              workspace={workspace}
              plans={activity.plans.data || []}
              jobs={(activity.jobs.data || []).filter((j) => j.kind === 'plan')}
              preferences={preferences.data}
              onChanged={activity.refresh}
            />
          </details>
          <div id="workspace-build" className="scroll-mt-20">
            <BuildPanel
              workspace={workspace}
              jobs={(activity.jobs.data || []).filter((j) => j.kind === 'build')}
              preferences={preferences.data}
              onChanged={activity.refresh}
            />
          </div>
          <details
            id="workspace-revision"
            ref={(node) => {
              sectionDisclosures.current.revision = node;
            }}
            className="scroll-mt-20 border rounded-xl p-4"
          >
            <summary className="cursor-pointer font-semibold mb-3">
              Revise saved material · drafts and retry
            </summary>
            <RevisionPanel
              workspace={workspace}
              jobs={(activity.jobs.data || []).filter((j) => j.kind === 'revision')}
              preferences={preferences.data}
              onChanged={activity.refresh}
            />
          </details>
          <details
            id="workspace-review"
            ref={(node) => {
              sectionDisclosures.current.review = node;
            }}
            className="scroll-mt-20 border rounded-xl p-4"
          >
            <summary className="cursor-pointer font-semibold mb-3">
              Review with Jev · optional advisory
            </summary>
            <MaterialReview workspaceId={workspace.id} />
          </details>
          <details
            id="workspace-history"
            ref={(node) => {
              sectionDisclosures.current.history = node;
            }}
            className="scroll-mt-20 border rounded-xl p-4"
          >
            <summary className="cursor-pointer font-semibold mb-3">
              History · compare and restore
            </summary>
            <WorkspaceHistory
              workspaceId={workspace.id}
              disabled={workspace.archived}
              onChanged={activity.refresh}
            />
          </details>
        </div>
      )}
    </div>
  );
}
