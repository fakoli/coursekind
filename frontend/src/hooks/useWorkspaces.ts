import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../components/common/AuthContext';
import { workspacesApi } from '../api/workspaces';
import type { WorkspaceCreate, WorkspaceUpdate } from '../types/workspace';

export function useWorkspaces(archived = false) {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ['workspaces', user?.id, archived],
    queryFn: () => workspacesApi.list(archived),
    enabled: !!user,
  });
}
export function useWorkspace(id: string) {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ['workspace', user?.id, id],
    queryFn: () => workspacesApi.get(id),
    enabled: !!user && !!id,
  });
}
export function useCreateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: WorkspaceCreate) => workspacesApi.create(data),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
export function useUpdateWorkspace(id: string) {
  const client = useQueryClient();
  const { user } = useAuthContext();
  return useMutation({
    mutationFn: (data: WorkspaceUpdate) => workspacesApi.update(id, data),
    onSuccess: (data) => {
      client.setQueryData(['workspace', user?.id, id], data);
      void client.invalidateQueries({ queryKey: ['workspace', user?.id, id] });
      void client.invalidateQueries({ queryKey: ['workspaces', user?.id] });
    },
  });
}
