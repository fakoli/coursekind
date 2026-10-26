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
  goal: '',
  scope: 'course',
  prior_knowledge: '',
  audience: '',
  weekly_hours: null,
  generate_flashcards: true,
  flashcard_count: 5,
  generate_quiz: true,
  quiz_question_count: 3,
};

export interface PlannedModule {
  temp_id: string;
  title: string;
  description: string;
  objectives: string[];
}
export type CourseNode =
  | {
      kind: 'new';
      temp_id: string;
      title: string;
      description: string;
      difficulty: 'beginner' | 'intermediate' | 'advanced';
      modules: PlannedModule[];
    }
  | { kind: 'reuse'; course_id: string };
export interface WorkspacePlan {
  scope: 'course' | 'path';
  title: string;
  description: string;
  assumptions: string[];
  courses: CourseNode[];
}
export interface ResourceTarget {
  kind: 'course' | 'module' | 'path';
  resource_id: string;
  course_id: string | null;
}
export interface ResourceSnapshot {
  target: ResourceTarget;
  fingerprint: string;
  fields: Record<string, unknown>;
}
export interface PlanProposal {
  id: string;
  workspace_id: string;
  owner_id: string;
  version: number;
  plan: WorkspacePlan;
  base_workspace_version: number;
  base_snapshots: ResourceSnapshot[];
  status: 'ready' | 'applied';
  job_id: string | null;
  applied_ids: Record<string, string>;
  reuse_course_ids: string[];
  created_at: string;
}
export interface PlanRequest {
  request_id: string;
  instruction?: string;
  reuse_course_ids?: string[];
  previous_proposal_id?: string;
}
export interface BuildRequest {
  request_id: string;
  module_ids: string[];
  generate_flashcards: boolean;
  flashcard_count: number;
  generate_quiz: boolean;
  quiz_question_count: number;
}
export type JobState =
  'queued' | 'running' | 'ready' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
export interface JobStep {
  id: string;
  target: ResourceTarget | null;
  attempt: number;
  state: JobState;
  credits: number;
  provider?: string;
  model?: string;
  output_ref: string | null;
  safe_error: string | null;
  source_snapshots: ResourceSnapshot[];
}
export interface WorkspaceJob {
  id: string;
  workspace_id: string;
  owner_id: string;
  kind: 'plan' | 'build' | 'revision';
  provider: string;
  model: string;
  state: JobState;
  steps: JobStep[];
  created_at: string;
  updated_at: string;
}
export interface ChangeSet {
  id: string;
  workspace_id: string;
  owner_id: string;
  status: 'ready' | 'applied';
  revision_id: string | null;
  patches: {
    target: ResourceTarget;
    expected_fingerprint: string;
    fields: {
      content_markdown: string;
      flashcards: import('./index').FlashcardData[] | null;
      quiz: import('./index').QuizData | null;
    };
  }[];
  base_snapshots: ResourceSnapshot[];
  origin_job_id: string | null;
  created_at: string;
}
