import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../components/common/AuthContext';
import { workspacesApi } from '../api/workspaces';
import type { Workspace } from '../types/workspace';
import { coursesApi } from '../api/courses';
import { modulesApi } from '../api/modules';

export function useWorkspaceActivity(id: string) {
  const { user } = useAuthContext();
  const client = useQueryClient();
  const jobDiscovery = useQuery({
    queryKey: ['workspace-jobs', user?.id, id],
    queryFn: () => workspacesApi.discoverJobs(id),
    enabled: !!user,
    refetchInterval: (query) =>
      query.state.data?.items.some((j) => ['queued', 'running'].includes(j.state)) ? 2000 : false,
  });
  const planDiscovery = useQuery({
    queryKey: ['workspace-plans', user?.id, id],
    queryFn: () => workspacesApi.discoverPlans(id),
    enabled: !!user,
  });
  const jobs = { ...jobDiscovery, data: jobDiscovery.data?.items };
  const plans = { ...planDiscovery, data: planDiscovery.data?.items };
  const outputs = jobs.data
    ?.flatMap((j) => j.steps.map((s) => s.output_ref))
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    if (outputs) {
      void client.invalidateQueries({ queryKey: ['workspace-plans', user?.id, id] });
      void client.invalidateQueries({ queryKey: ['workspace-budget', user?.id] });
    }
  }, [outputs, client, user?.id, id]);
  const refresh = async () => {
    await Promise.all(
      [
        'workspace-budget',
        'workspace',
        'workspaces',
        'workspace-jobs',
        'workspace-plans',
        'workspace-history',
        'workspace-review',
        'workspace-review-sources',
        'workspace-snapshots',
        'workspace-change',
        'workspace-changes',
        'workspace-build-modules',
        'course',
        'courses',
        'modules',
        'module',
        'path',
        'paths',
        'progress',
        'flashcard-ratings',
        'user',
        'auth',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  };
  return {
    jobs, plans, refresh,
    unavailableJobs: jobDiscovery.data?.unavailable_count || 0,
    unavailablePlans: planDiscovery.data?.unavailable_count || 0,
  };
}

export function useWorkspaceModules(workspace: Workspace) {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ['workspace-build-modules', user?.id, workspace.id, workspace.course_ids],
    enabled: !!user,
    queryFn: async () => {
      const courses = await Promise.all(workspace.course_ids.map((id) => coursesApi.get(id)));
      const owned = courses.filter(
        (c) => c.course.author_id === user?.id && c.course.source !== 'filesystem',
      );
      const modules = await Promise.all(
        owned.flatMap((c) => c.modules.map((m) => modulesApi.get(c.course.id, m.id))),
      );
      return modules;
    },
  });
}
