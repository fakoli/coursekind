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

it('shows a retired stored subscription and requires an explicit replacement without catalog traffic', async () => {
  vi.clearAllMocks();
  vi.mocked(userSettingsApi.getPreferences).mockResolvedValue({provider:'codex_subscription',model:'old-model',is_configured:false,unavailable_reason:'Codex subscription is retired. Choose a provider explicitly.',credential_mask:null,credentials:{},accounting:'provider_billed',automatic_fallback:false});
  vi.mocked(userSettingsApi.models).mockResolvedValue({models:['llm.primary'],is_available:true,message:'Advertised'});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AIPreferences userId="retired" /></QueryClientProvider>);
  expect(await screen.findByText(/Codex subscription is retired/)).toBeInTheDocument();
  expect(screen.getByLabelText('Provider')).toHaveValue('codex_subscription');
  expect(userSettingsApi.models).not.toHaveBeenCalled();
  expect(userSettingsApi.savePreferences).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Provider'),{target:{value:'anvil'}});
  await waitFor(()=>expect(userSettingsApi.models).toHaveBeenCalledWith('anvil'));
  expect(userSettingsApi.savePreferences).not.toHaveBeenCalled();
});
