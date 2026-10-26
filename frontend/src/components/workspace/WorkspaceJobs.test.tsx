import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderJourney } from '../../test/journeyApi';
import { installWorkspaceBuildApi, jobFixture } from '../../test/workspaceBuildApi';
import { WorkspaceJobs } from './WorkspaceJobs';
import { workspacesApi } from '../../api/workspaces';
import type { AIPreferenceData } from '../../api/userSettings';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it.each(['anvil', 'openai'])('discloses the current retry selection after changing from %s, selected cost and quota', async (prior) => {
  installWorkspaceBuildApi();
  const original = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => input.endsWith('/auth/tokens')
    ? Promise.resolve(new Response(JSON.stringify({ balance: 40 }))) : original(input, init));
  const job = jobFixture();
  job.provider = prior;
  job.model = 'prior-model';
  job.state = 'failed';
  job.steps = [{ ...job.steps[0], state: 'failed', output_ref: null, credits: 0 },
    { ...job.steps[0], id: 's2', state: 'failed', output_ref: null, credits: 0 }];
  const retry = vi.spyOn(workspacesApi, 'retry').mockResolvedValue(job);
  const next = prior === 'anvil' ? 'openai' : 'anvil';
  function Harness() {
    const [provider, setProvider] = useState(prior);
    return <><button onClick={() => setProvider(next)}>Change Settings selection</button>
      <WorkspaceJobs jobs={[job]} preferences={{ provider, model: provider === prior ? 'prior-model' : 'next-model', is_configured: true } as AIPreferenceData}
        onChanged={async () => {}} onReview={() => {}} /></>;
  }
  renderJourney(<Harness />, '/', '/');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Retry step 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change Settings selection' }));
  expect(screen.getByText(`Step 2: New inference · ${next} / next-model.`)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`Selected retry: at most ${next === 'anvil' ? 25 : 0} application credits`))).toBeInTheDocument();
  await screen.findByText('Available Anvil budget: 40 application credits.');
  expect(screen.getByText(/may already have external charges/)).toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry selected steps' }));
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  expect(retry.mock.calls[0][2].step_ids).toEqual(['s2']);
});

it('offers saved-output finalization with its original provider and debit even without current credentials', async () => {
  installWorkspaceBuildApi();
  const job = jobFixture();
  job.state = 'failed';
  job.steps[0] = { ...job.steps[0], state: 'failed', output_ref: null, credits: 0,
    finalize_only: true, provider: 'anvil', model: 'saved-model', operation_credits: 25 };
  const retry = vi.spyOn(workspacesApi, 'retry').mockResolvedValue(job);
  renderJourney(<WorkspaceJobs jobs={[job]} preferences={{ provider: 'openai', model: 'unconfigured', is_configured: false } as AIPreferenceData}
    onChanged={async () => {}} onReview={() => {}} />, '/', '/');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Retry step 1' }));
  expect(screen.getByText(/Finalize saved output · anvil \/ saved-model/)).toHaveTextContent('No model call or current credentials needed');
  expect(screen.getByText(/Selected retry: at most 25 application credits/)).toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Retry selected steps' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
});
