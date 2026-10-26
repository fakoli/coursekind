import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coursesApi } from '../api/courses';
import type { CourseCreate, CourseDiscoveryFilters, CourseUpdate } from '../types';

/** Fetch all courses accessible to the current user */
export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: coursesApi.list,
  });
}

/** Fetch courses authored by the current user */
export function useMyCourses() {
  return useQuery({
    queryKey: ['courses', 'mine'],
    queryFn: coursesApi.listMine,
  });
}

/** Discover/browse public courses with filters */
export function useDiscoverCourses(filters?: CourseDiscoveryFilters) {
  return useQuery({
    queryKey: ['courses', 'discover', filters],
    queryFn: () => coursesApi.discover(filters),
  });
}

/** Fetch a single course with its modules */
export function useCourse(courseId: string) {
  return useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.get(courseId),
    enabled: !!courseId,
  });
}

/** Create a new course */
export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CourseCreate) => coursesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['paths'] });
    },
  });
}

/** Update a course */
export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, data }: { courseId: string; data: CourseUpdate }) =>
      coursesApi.update(courseId, data),
    onSuccess: (_, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['paths'] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
  });
}

/** Delete a course */
export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (courseId: string) => coursesApi.delete(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['path'] });
      queryClient.invalidateQueries({ queryKey: ['paths'] });
    },
  });
}

export function useSharedCourses() {
  return useQuery({ queryKey: ['courses', 'shared'], queryFn: coursesApi.listShared });
}
