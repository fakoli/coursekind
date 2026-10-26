import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesApi } from '../api/modules';
import type { ModuleCreate, ModuleUpdate } from '../types';

/** Fetch all modules for a course */
export function useModules(courseId: string) {
  return useQuery({
    queryKey: ['modules', courseId],
    queryFn: () => modulesApi.list(courseId),
    enabled: !!courseId,
  });
}

/** Fetch a single module */
export function useModule(courseId: string, moduleId: string) {
  return useQuery({
    queryKey: ['module', courseId, moduleId],
    queryFn: () => modulesApi.get(courseId, moduleId),
    enabled: !!courseId && !!moduleId,
  });
}

/** Create a new module */
export function useCreateModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, data }: { courseId: string; data: ModuleCreate }) =>
      modulesApi.create(courseId, data),
    onSuccess: (_, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
    },
  });
}

/** Create multiple modules in a single request */
export function useBatchCreateModules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, modules }: { courseId: string; modules: ModuleCreate[] }) =>
      modulesApi.batchCreate(courseId, modules),
    onSuccess: (_, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
    },
  });
}

/** Update a module */
export function useUpdateModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      courseId,
      moduleId,
      data,
    }: {
      courseId: string;
      moduleId: string;
      data: ModuleUpdate;
    }) => modulesApi.update(courseId, moduleId, data),
    onSuccess: (_, { courseId, moduleId }) => {
      queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
      queryClient.invalidateQueries({ queryKey: ['module', courseId, moduleId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Delete a module */
export function useDeleteModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, moduleId }: { courseId: string; moduleId: string }) =>
      modulesApi.delete(courseId, moduleId),
    onSuccess: (_, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
    },
  });
}

/** Reorder modules in a course */
export function useReorderModules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, moduleIds }: { courseId: string; moduleIds: string[] }) =>
      modulesApi.reorder(courseId, moduleIds),
    onSuccess: (_, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['modules', courseId] });
    },
  });
}
