import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { learningPathsApi } from '../api/learningPaths';
import type { LearningPathCreate, LearningPathUpdate } from '../types';

// A path's live membership also defines its workspaces' current editable links.
function invalidateWorkspaceLinks(client: QueryClient) {
  void client.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string'
      && query.queryKey[0].startsWith('workspace'),
  });
}

/** Fetch all learning paths accessible to the current user */
export function useLearningPaths() {
  return useQuery({
    queryKey: ['paths'],
    queryFn: learningPathsApi.list,
  });
}

/** Fetch learning paths owned by the current user */
export function useMyLearningPaths() {
  return useQuery({
    queryKey: ['paths', 'mine'],
    queryFn: learningPathsApi.listMine,
  });
}

/** Fetch a single learning path with its courses */
export function useLearningPath(pathId: string) {
  return useQuery({
    queryKey: ['path', pathId],
    queryFn: () => learningPathsApi.get(pathId),
    enabled: !!pathId,
  });
}

/** Create a new learning path */
export function useCreateLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LearningPathCreate) => learningPathsApi.create(data),
    onSuccess: () => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Update a learning path */
export function useUpdateLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pathId, data }: { pathId: string; data: LearningPathUpdate }) =>
      learningPathsApi.update(pathId, data),
    onSuccess: (_, { pathId }) => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['path', pathId] });
    },
  });
}

/** Delete a learning path */
export function useDeleteLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pathId: string) => learningPathsApi.delete(pathId),
    onSuccess: () => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Add a course to a learning path */
export function useAddCourseToPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pathId, courseId }: { pathId: string; courseId: string }) =>
      learningPathsApi.addCourse(pathId, courseId),
    onSuccess: (_, { pathId }) => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['path', pathId] });
      // Also invalidate course discovery since times_added may have changed
      queryClient.invalidateQueries({ queryKey: ['courses', 'discover'] });
    },
  });
}

/** Remove a course from a learning path */
export function useRemoveCourseFromPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pathId, courseId }: { pathId: string; courseId: string }) =>
      learningPathsApi.removeCourse(pathId, courseId),
    onSuccess: (_, { pathId }) => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['path', pathId] });
      queryClient.invalidateQueries({ queryKey: ['courses', 'discover'] });
    },
  });
}

/** Reorder courses in a learning path */
export function useReorderCoursesInPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pathId, courseIds }: { pathId: string; courseIds: string[] }) =>
      learningPathsApi.reorderCourses(pathId, courseIds),
    onSuccess: (_, { pathId }) => {
      invalidateWorkspaceLinks(queryClient);
      queryClient.invalidateQueries({ queryKey: ['path', pathId] });
    },
  });
}

export function useFollowingPaths() {
  return useQuery({ queryKey: ['paths', 'following'], queryFn: learningPathsApi.listFollowing });
}

export function useFollowPath() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ pathId, following }: { pathId: string; following: boolean }) =>
      following ? learningPathsApi.follow(pathId) : learningPathsApi.unfollow(pathId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['paths'] });
      client.invalidateQueries({ queryKey: ['path'] });
      client.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
