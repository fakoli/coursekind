import { api } from './client';
import type {
  Course,
  CourseCreate,
  CourseDiscoveryFilters,
  CourseDiscoveryResponse,
  CourseResponse,
  CourseUpdate,
  CourseWithModulesResponse,
} from '../types';

export const coursesApi = {
  listShared: () => api.get<CourseResponse[]>('/courses/shared'),
  /** List all courses accessible to the current user */
  list: () => api.get<CourseResponse[]>('/courses'),

  /** List courses authored by the current user */
  listMine: () => api.get<CourseResponse[]>('/courses/mine'),

  /** Browse and search public courses */
  discover: (filters?: CourseDiscoveryFilters) => {
    const params = new URLSearchParams();
    if (filters?.q) params.append('q', filters.q);
    if (filters?.tags) params.append('tags', filters.tags.join(','));
    if (filters?.difficulty) params.append('difficulty', filters.difficulty);
    if (filters?.author_id) params.append('author_id', filters.author_id);
    if (filters?.sort) params.append('sort', filters.sort);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    return api.get<CourseDiscoveryResponse>(`/courses/discover${queryString ? `?${queryString}` : ''}`);
  },

  /** Create a new course */
  create: (data: CourseCreate) => api.post<Course>('/courses', data),

  /** Get a course with its modules */
  get: (courseId: string) => api.get<CourseWithModulesResponse>(`/courses/${courseId}`),

  /** Update course metadata */
  update: (courseId: string, data: CourseUpdate) =>
    api.put<Course>(`/courses/${courseId}`, data),

  /** Delete a course and all its modules */
  delete: (courseId: string) =>
    api.delete<{ message: string }>(`/courses/${courseId}`),
};
