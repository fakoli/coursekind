import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';
import type { NotificationPreferencesUpdate } from '../types';

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: notificationsApi.getPreferences,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: NotificationPreferencesUpdate) =>
      notificationsApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useNotificationHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['notifications', 'history', limit, offset],
    queryFn: () => notificationsApi.getHistory(limit, offset),
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: notificationsApi.testEmail,
  });
}

export function useTestSms() {
  return useMutation({
    mutationFn: notificationsApi.testSms,
  });
}
