export interface WorkspaceBrief {
  goal: string;
  scope: 'course' | 'path';
  prior_knowledge: string;
  audience: string;
  weekly_hours: number | null;
  generate_flashcards: boolean;
  flashcard_count: number;
  generate_quiz: boolean;
  quiz_question_count: number;
}
export interface Workspace {
  id: string;
  owner_id: string;
  brief: WorkspaceBrief;
  archived: boolean;
  version: number;
  course_ids: string[];
  path_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface WorkspaceCreate {
  request_id: string;
  brief: WorkspaceBrief;
  source_course_id?: string;
  source_path_id?: string;
}
export interface WorkspaceUpdate {
  request_id: string;
  expected_version: number;
  brief?: WorkspaceBrief;
  archived?: boolean;
}
export const emptyBrief: WorkspaceBrief = {
  goal: '', scope: 'course', prior_knowledge: '', audience: '', weekly_hours: null,
  generate_flashcards: true, flashcard_count: 5, generate_quiz: true, quiz_question_count: 3,
};
