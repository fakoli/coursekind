import { useQuery } from '@tanstack/react-query';
import { userSettingsApi, type AIConnectionStatus } from '../api/userSettings';

/** Check the server-side Anvil router connection status */
export function useAIConnection() {
  return useQuery({
    queryKey: ['ai-connection'],
    queryFn: () => userSettingsApi.checkAIConnection(),
    retry: false,
  });
}

export type { AIConnectionStatus };

export function useAIPreferences(userId?: string) {
  return useQuery({queryKey:['ai-preferences',userId],queryFn:userSettingsApi.getPreferences,retry:false});
}
