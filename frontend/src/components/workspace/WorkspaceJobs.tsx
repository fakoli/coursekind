import { useRef, useState } from 'react';
import { workspacesApi } from '../../api/workspaces';
import type { AIPreferenceData } from '../../api/userSettings';
import { CreditPreflight } from './CreditPreflight';
import { Button } from '../common/Button';
import type { WorkspaceJob } from '../../types/workspace';

export function WorkspaceJobs({
  jobs,
  onChanged,
  onReview,
  disabled,
  preferences,
}: {
  jobs: WorkspaceJob[];
  onChanged: () => Promise<void>;
  onReview: (id: string) => void;
  disabled?: boolean;
  preferences?: AIPreferenceData;
}) {
  return (
    <div className="space-y-3" aria-label="Saved jobs">
      {jobs.map((job, index) =>
        index > 0 && job.state === 'ready' ? (
          <details key={job.id} className="border rounded p-3">
            <summary className="cursor-pointer">
              Earlier {job.kind} · {job.steps.length} saved draft(s)
            </summary>
            <Job
              job={job}
              onChanged={onChanged}
              onReview={onReview}
              disabled={disabled}
              preferences={preferences}
            />
          </details>
        ) : (
          <Job
            key={job.id}
            job={job}
            onChanged={onChanged}
            onReview={onReview}
            disabled={disabled}
            preferences={preferences}
          />
        ),
      )}
    </div>
  );
}
function Job({
  job,
  onChanged,
  onReview,
  disabled,
  preferences,
}: {
  job: WorkspaceJob;
  onChanged: () => Promise<void>;
  onReview: (id: string) => void;
  disabled?: boolean;
  preferences?: AIPreferenceData;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);
  const running = ['queued', 'running'].includes(job.state);
  const retrySteps = job.steps.filter((step) => selected.includes(step.id));
  const needsInference = retrySteps.some((step) => !step.finalize_only);
  const costsKnown = retrySteps.every((step) => typeof step.operation_credits === 'number');
  const retryCost = retrySteps.reduce((total, step) => {
    const provider = step.finalize_only ? step.provider || job.provider : preferences?.provider;
    return total + (provider === 'anvil' ? step.operation_credits || 0 : 0);
  }, 0);
  async function act(cancel: boolean) {
    const key = JSON.stringify({
      cancel, selected, provider: preferences?.provider, model: preferences?.model,
    });
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      if (cancel) await workspacesApi.cancel(job.workspace_id, job.id, request.current.id);
      else
        await workspacesApi.retry(job.workspace_id, job.id, {
          request_id: request.current.id,
          step_ids: selected,
        });
      request.current = null;
      setSelected([]);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job action failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border rounded p-3 space-y-2 min-w-0">
      <p role="status" className="font-medium break-words">
        {job.kind === 'plan' ? 'Plan' : job.kind === 'revision' ? 'Revision' : 'Build'}: {job.state}{' '}
        · {job.provider} / {job.model}
      </p>
      <ul className="space-y-2">
        {job.steps.map((step, index) => (
          <li key={step.id} className="space-y-1">
            <p>
              Step {index + 1}: {step.state} · {step.credits} application credits · attempt{' '}
              {step.attempt}
            </p>
            {step.provider && (
              <p className="text-sm break-words">
                Output provider: {step.provider} / {step.model}
              </p>
            )}
            {step.safe_error && <p className="text-sm text-amber-800">{step.safe_error}</p>}
            {step.output_ref && (
              <Button size="sm" variant="secondary" onClick={() => onReview(step.output_ref!)}>
                Review {job.kind === 'plan' ? 'plan' : `draft ${index + 1}`}
              </Button>
            )}
            {!running && step.state !== 'ready' && (
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  disabled={disabled || busy}
                  checked={selected.includes(step.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, step.id]
                        : selected.filter((id) => id !== step.id),
                    )
                  }
                />
                Retry step {index + 1}
              </label>
            )}
          </li>
        ))}
      </ul>
      {running ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => void act(true)}
        >
          Cancel remaining steps
        </Button>
      ) : (
        selected.length > 0 && (
          <>
            <div className="text-sm space-y-2" aria-label="Selected retry preview">
              {retrySteps.map((step) => (
                <p key={step.id}>
                  Step {job.steps.indexOf(step) + 1}:{' '}
                  {step.finalize_only
                    ? `Finalize saved output · ${step.provider || job.provider} / ${step.model || job.model}. No model call or current credentials needed; original accounting is retained.`
                    : `New inference · ${preferences ? `${preferences.provider} / ${preferences.model}` : 'provider selection unavailable'}.`}
                </p>
              ))}
              <p>
                {costsKnown
                  ? `Selected retry: at most ${retryCost} application credits when validated output is saved.`
                  : 'Retry cost unavailable. Reload jobs before retrying.'}
              </p>
              <p>
                Interrupted or failed attempts may already have external charges.
                New external inference may incur additional provider charges.
              </p>
              {needsInference && !preferences?.is_configured && (
                <p>Configure the selected provider in Settings before new inference.</p>
              )}
              <CreditPreflight provider="anvil" cost={retryCost} />
            </div>
            <Button
              size="sm"
              disabled={disabled || busy || !costsKnown || (needsInference && !preferences?.is_configured)}
              onClick={() => void act(false)}
            >
              Retry selected steps
            </Button>
          </>
        )
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
