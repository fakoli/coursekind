import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { progressApi, type UpdateModuleProgressRequest } from '../api/progress';

// New hooks for path/course/module progress

export function useDashboardStats() {
  return useQuery({
    queryKey: ['progress', 'dashboard'],
    queryFn: progressApi.getDashboardStats,
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ['progress', 'activity', limit],
    queryFn: () => progressApi.getRecentActivity(limit),
  });
}

export function useNextUp(limit = 3) {
  return useQuery({
    queryKey: ['progress', 'next-up', limit],
    queryFn: () => progressApi.getNextUp(limit),
  });
}

export function useCourseProgress(courseId: string) {
  return useQuery({
    queryKey: ['progress', 'courses', courseId],
    queryFn: () => progressApi.getCourseProgress(courseId),
    enabled: !!courseId,
  });
}

export function usePathProgress(pathId: string) {
  return useQuery({
    queryKey: ['progress', 'paths', pathId],
    queryFn: () => progressApi.getPathProgress(pathId),
    enabled: !!pathId,
  });
}

export function useModuleProgress(courseId: string, moduleId: string) {
  return useQuery({
    queryKey: ['progress', 'modules', courseId, moduleId],
    queryFn: () => progressApi.getModuleProgress(courseId, moduleId),
    enabled: !!courseId && !!moduleId,
  });
}

export function useUpdateModuleProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    // Keep card reviews, quiz submissions and completion in order. Parallel
    // read-modify-write requests can otherwise overwrite a newer progress state.
    scope: { id: 'module-progress' },
    mutationFn: ({
      courseId,
      moduleId,
      data,
    }: {
      courseId: string;
      moduleId: string;
      data: UpdateModuleProgressRequest;
    }) => {
      data.event_id ??= crypto.randomUUID();
      return progressApi.updateModuleProgress(courseId, moduleId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

// Legacy hooks (deprecated)

/** @deprecated Use useDashboardStats instead */
export function useProgressStats() {
  return useQuery({
    queryKey: ['progress', 'stats'],
    queryFn: progressApi.getStats,
  });
}

export function useSessions(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['progress', 'sessions', limit, offset],
    queryFn: () => progressApi.getSessions(limit, offset),
  });
}

/** @deprecated Use useCourseProgress instead */
export function useTopicMastery() {
  return useQuery({
    queryKey: ['progress', 'topics'],
    queryFn: progressApi.getTopics,
  });
}
