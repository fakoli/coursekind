import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, it, expect } from 'vitest';
import { AIPreferences } from './AIPreferences';
import { userSettingsApi } from '../../api/userSettings';

vi.mock('../../api/userSettings', () => ({ userSettingsApi: {
  getPreferences: vi.fn(), models: vi.fn(), validate: vi.fn(), savePreferences: vi.fn(), deleteCredential: vi.fn(),
} }));

it('shows unavailable stored model honestly and requires explicit selection', async () => {
  vi.mocked(userSettingsApi.getPreferences).mockResolvedValue({ provider:'anvil',model:'llm.missing',is_configured:true,credential_mask:null,credentials:{},accounting:'application_credits',automatic_fallback:false });
  vi.mocked(userSettingsApi.models).mockResolvedValue({models:['llm.primary'],is_available:true,message:'Advertised'});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AIPreferences userId="u" /></QueryClientProvider>);
  expect(await screen.findByText(/Selected model is unavailable/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Save AI preferences'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Model'),{target:{value:'llm.primary'}});
  await waitFor(() => expect(screen.getByRole('button',{name:'Save AI preferences'})).toBeEnabled());
});

it('offers authorized local subscription without API key and distinguishes inference check', async () => {
  vi.mocked(userSettingsApi.getPreferences).mockResolvedValue({ provider:'anvil',model:'llm.primary',is_configured:true,credential_mask:null,credentials:{},accounting:'application_credits',automatic_fallback:false,codex_subscription_available:true });
  vi.mocked(userSettingsApi.models).mockResolvedValue({models:['gpt-6-luna'],is_available:true,message:'Advertised'});
  vi.mocked(userSettingsApi.validate).mockResolvedValue({models:['gpt-6-luna'],is_valid:true,message:'Inference check succeeded for gpt-6-luna.'});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AIPreferences userId="owner" /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Provider'),{target:{value:'codex_subscription'}});
  expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  expect(screen.getByText(/Configured candidates are not proof/)).toBeInTheDocument();
  await screen.findByRole('option',{name:'gpt-6-luna'});
  fireEvent.change(screen.getByLabelText('Model'),{target:{value:'gpt-6-luna'}});
  fireEvent.click(screen.getByRole('button',{name:'Check selected model'}));
  expect(await screen.findByText('Inference check succeeded for gpt-6-luna.')).toBeInTheDocument();
  expect(userSettingsApi.validate).toHaveBeenCalledWith('codex_subscription',undefined,'gpt-6-luna');
});

it('hides the subscription option when the operator has not authorized this account', async () => {
  vi.mocked(userSettingsApi.getPreferences).mockResolvedValue({ provider:'anvil',model:'llm.primary',is_configured:true,credential_mask:null,credentials:{},accounting:'application_credits',automatic_fallback:false,codex_subscription_available:false });
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AIPreferences userId="other" /></QueryClientProvider>);
  await screen.findByLabelText('Provider');
  expect(screen.queryByRole('option',{name:'Codex (local subscription)'})).not.toBeInTheDocument();
});
