import { api } from './client';
import type {
  CourseProgressStatus,
  DashboardStats,
  ModuleProgress,
  QuizQuestionData,
  NextUpResponse,
  PathProgressStatus,
  ProgressStats,
  RecentActivityResponse,
  SessionsResponse,
  TopicMasteryResponse,
} from '../types';

export type ModuleProgressAction = 'start' | 'complete' | 'read_content' | 'review_flashcard' | 'submit_quiz' | 'practice' | 'save_state';

export interface UpdateModuleProgressRequest {
  action: ModuleProgressAction;
  event_id?: string;
  flashcard_id?: string;
  time_spent_seconds?: number;
  quiz_answers?: Record<string, number>;
  practice_code?: string;
  practice_result?: { success: boolean; output?: string; error?: string };
  extra_quiz_questions?: QuizQuestionData[];
  quiz_score?: number;
  time_spent_minutes?: number;
}

export const progressApi = {
  // New dashboard endpoints
  getDashboardStats: () => api.get<DashboardStats>('/progress/dashboard'),

  getRecentActivity: (limit = 20) =>
    api.get<RecentActivityResponse>(`/progress/activity?limit=${limit}`),

  getNextUp: (limit = 3) =>
    api.get<NextUpResponse>(`/progress/next-up?limit=${limit}`),

  getCourseProgress: (courseId: string) =>
    api.get<CourseProgressStatus>(`/progress/courses/${courseId}`),

  getPathProgress: (pathId: string) =>
    api.get<PathProgressStatus>(`/progress/paths/${pathId}`),

  getModuleProgress: (courseId: string, moduleId: string) =>
    api.get<ModuleProgress | null>(`/progress/modules/${courseId}/${moduleId}`),

  updateModuleProgress: (courseId: string, moduleId: string, data: UpdateModuleProgressRequest) =>
    api.post<ModuleProgress>(`/progress/modules/${courseId}/${moduleId}`, data),

  // Legacy endpoints (deprecated)
  /** @deprecated Use getDashboardStats instead */
  getStats: () => api.get<ProgressStats>('/progress/stats'),

  getSessions: (limit = 20, offset = 0) =>
    api.get<SessionsResponse>(`/progress/sessions?limit=${limit}&offset=${offset}`),

  /** @deprecated Use getCourseProgress instead */
  getTopics: () => api.get<TopicMasteryResponse>('/progress/topics'),
};
