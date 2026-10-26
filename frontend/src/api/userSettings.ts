import { api } from './client';

export type AIProvider = 'anvil' | 'openai' | 'gemini' | 'anthropic' | 'codex_subscription';
export interface AIPreferenceData {
  provider: AIProvider;
  model: string;
  is_configured: boolean;
  credential_mask: string | null;
  credentials: Partial<Record<AIProvider, {is_configured: boolean; mask: string}>>;
  accounting: 'application_credits' | 'provider_billed' | 'subscription';
  codex_subscription_available?: boolean;
  subscription_connection?: {is_connected: boolean; message: string} | null;
  automatic_fallback: false;
}
export interface AIConnectionStatus {
  provider: string; is_configured: boolean; is_reachable: boolean;
  model: string | null; message: string;
}
export interface ModelCatalog { models: string[]; is_available: boolean; message: string }
export interface PreferenceInput { provider: AIProvider; model: string; api_key?: string }
export const userSettingsApi = {
  checkAIConnection: () => api.get<AIConnectionStatus>('/auth/ai-connection'),
  getPreferences: () => api.get<AIPreferenceData>('/auth/ai-preferences'),
  models: (provider: AIProvider) => api.get<ModelCatalog>(`/auth/ai-preferences/models?provider=${provider}`),
  validate: (provider: AIProvider, api_key?: string, model?: string) => api.post<{models: string[]; is_valid: boolean; message: string}>('/auth/ai-preferences/validate', {provider,api_key,model}),
  savePreferences: (input: PreferenceInput) => api.put<AIPreferenceData>('/auth/ai-preferences',input),
  deleteCredential: (provider: AIProvider) => api.delete<AIPreferenceData>(`/auth/ai-preferences/credentials/${provider}`),
};
