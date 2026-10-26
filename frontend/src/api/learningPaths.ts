import { api } from './client';
import type {
  LearningPath,
  LearningPathCreate,
  LearningPathResponse,
  LearningPathUpdate,
  LearningPathWithCoursesResponse,
} from '../types';

export const learningPathsApi = {
  listFollowing: () => api.get<LearningPathResponse[]>('/paths/following'),
  follow: (id: string) => api.post<{ is_following: boolean }>(`/paths/${id}/follow`, {}),
  unfollow: (id: string) => api.delete<{ is_following: boolean }>(`/paths/${id}/follow`),
  /** List all learning paths accessible to the current user */
  list: () => api.get<LearningPathResponse[]>('/paths'),

  /** List learning paths owned by the current user */
  listMine: () => api.get<LearningPathResponse[]>('/paths/mine'),

  /** Create a new learning path */
  create: (data: LearningPathCreate) => api.post<LearningPath>('/paths', data),

  /** Get a learning path with its courses */
  get: (pathId: string) => api.get<LearningPathWithCoursesResponse>(`/paths/${pathId}`),

  /** Update learning path metadata */
  update: (pathId: string, data: LearningPathUpdate) =>
    api.put<LearningPath>(`/paths/${pathId}`, data),

  /** Delete a learning path */
  delete: (pathId: string) =>
    api.delete<{ message: string }>(`/paths/${pathId}`),

  /** Add a course to a learning path */
  addCourse: (pathId: string, courseId: string) =>
    api.post<LearningPath>(`/paths/${pathId}/courses`, { course_id: courseId }),

  /** Remove a course from a learning path */
  removeCourse: (pathId: string, courseId: string) =>
    api.delete<LearningPath>(`/paths/${pathId}/courses/${courseId}`),

  /** Reorder courses in a learning path */
  reorderCourses: (pathId: string, courseIds: string[]) =>
    api.put<LearningPath>(`/paths/${pathId}/courses/reorder`, { course_ids: courseIds }),
};
