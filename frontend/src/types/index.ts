// User types
export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  token_balance: number;
  role?: UserRole;
}

export interface UserCreate {
  email: string;
  name: string;
  password: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// Deck types
export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeckResponse extends Deck {
  card_count: number;
}

export interface DeckWithCards extends Deck {
  cards: Card[];
}

export interface DeckCreate {
  title: string;
  description?: string;
}

export interface DeckUpdate {
  title?: string;
  description?: string;
}

// Card types
export interface Card {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  visual_url: string | null;
  created_at: string;
}

export interface CardCreate {
  front: string;
  back: string;
  visual_url?: string;
}

export interface CardUpdate {
  front?: string;
  back?: string;
  visual_url?: string;
}

// Review types
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Review {
  id: string;
  user_id: string;
  card_id: string;
  difficulty: Difficulty;
  reviewed_at: string;
  next_review_at: string;
}

export interface ReviewCreate {
  card_id: string;
  difficulty: Difficulty;
}

export interface CardWithDeck {
  id: string;
  deck_id: string;
  deck_title: string;
  front: string;
  back: string;
  visual_url: string | null;
  next_review_at: string | null;
}

export interface DueCardsResponse {
  cards: CardWithDeck[];
  total_due: number;
}

export interface ReviewHistoryItem {
  id: string;
  card_id: string;
  card_front: string;
  difficulty: Difficulty;
  reviewed_at: string;
}

export interface ReviewHistoryResponse {
  reviews: ReviewHistoryItem[];
  total: number;
}

// Quiz types
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

export interface Quiz {
  id: string;
  user_id: string;
  deck_id: string | null;
  topic: string | null;
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizGenerateRequest {
  deck_id?: string;
  topic?: string;
  num_questions?: number;
}

export interface QuestionResult {
  question_id: string;
  selected: number;
  correct: number;
  is_correct: boolean;
}

export interface QuizSubmission {
  id: string;
  quiz_id: string;
  user_id: string;
  answers: number[];
  submitted_at: string;
  score: number;
  results: QuestionResult[];
}

export interface QuizSubmitRequest {
  quiz_id: string;
  answers: number[];
}

export interface QuizWithSubmission extends Quiz {
  submission: QuizSubmission | null;
}

// Progress types

/** @deprecated Use DashboardStats instead */
export interface ProgressStats {
  user_id: string;
  total_cards_reviewed: number;
  total_quizzes_completed: number;
  accuracy_rate: number;
  current_streak: number;
  longest_streak: number;
  time_spent_minutes: number;
}

// New progress types for path/course/module tracking

export type ModuleProgressStatusType = 'not_started' | 'in_progress' | 'completed';

export interface ModuleProgressStatus {
  module_id: string;
  module_title: string;
  status: ModuleProgressStatusType;
  started_at: string | null;
  completed_at: string | null;
  content_read: boolean;
  flashcards_reviewed: number;
  flashcards_total: number;
  quiz_score: number | null;
  quiz_attempts: number;
  time_spent_minutes: number;
}

export interface ModuleProgress extends Omit<ModuleProgressStatus, 'module_title' | 'flashcards_total'> {
  id: string;
  user_id: string;
  course_id: string;
  reviewed_card_ids: string[];
  practice_code: string | null;
  extra_quiz_questions: QuizQuestionData[];
  quiz_history: { score: number; answers: Record<string, number>; created_at: string }[];
  practice_history: { code: string; result: { success: boolean; output?: string; error?: string }; created_at: string }[];
}

export interface CourseProgressStatus {
  course_id: string;
  course_title: string;
  total_modules: number;
  completed_modules: number;
  in_progress_modules: number;
  completion_percentage: number;
  average_quiz_score: number | null;
  total_time_spent_minutes: number;
  started_at: string | null;
  last_activity_at: string | null;
  modules: ModuleProgressStatus[];
}

export interface PathProgressStatus {
  path_id: string;
  path_title: string;
  total_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  completion_percentage: number;
  total_time_spent_minutes: number;
  started_at: string | null;
  last_activity_at: string | null;
  courses: CourseProgressStatus[];
}

export interface DashboardStats {
  user_id: string;
  active_paths: number;
  selected_paths: number;
  completed_selected_paths: number;
  study_sessions_week: number;
  timezone: string;
  courses_in_progress: number;
  courses_completed: number;
  modules_completed_week: number;
  modules_completed_month: number;
  modules_completed_total: number;
  average_quiz_score: number | null;
  total_quizzes_taken: number;
  total_study_time_minutes: number;
  study_time_this_week_minutes: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

export type ActivityType = 'module_started' | 'module_completed' | 'quiz_submitted' | 'content_read' | 'flashcard_reviewed' | 'practice';

export interface RecentActivity {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  module_id: string | null;
  module_title: string | null;
  course_id: string | null;
  course_title: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface RecentActivityResponse {
  activities: RecentActivity[];
  total: number;
}

export type NextUpItemType = 'module' | 'course';

export interface NextUpItem {
  item_type: NextUpItemType;
  module_id: string | null;
  module_title: string | null;
  course_id: string;
  course_title: string;
  path_id: string | null;
  path_title: string | null;
  reason: string;
}

export interface NextUpResponse {
  items: NextUpItem[];
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  activity_type: 'review' | 'quiz' | 'reference';
  items_completed: number;
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
}

export interface TopicMastery {
  topic: string;
  deck_id: string | null;
  total_cards: number;
  mastered_cards: number;
  mastery_percentage: number;
  last_reviewed: string | null;
}

export interface TopicMasteryResponse {
  topics: TopicMastery[];
}

// Notification types
export type NotificationChannel = 'email' | 'sms';
export type NotificationType = 'reminder' | 'daily_quiz' | 'hint' | 'encouragement' | 'progress_summary';
export type ReminderFrequency = 'daily' | 'every_other_day' | 'weekly' | 'none';
export type SummaryDay = 'monday' | 'friday' | 'sunday';

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  email_address: string;
  sms_enabled: boolean;
  phone_number: string | null;
  daily_quiz_enabled: boolean;
  daily_quiz_time: string;
  daily_quiz_channel: NotificationChannel;
  reminder_frequency: ReminderFrequency;
  reminder_channel: NotificationChannel;
  progress_summary_enabled: boolean;
  progress_summary_day: SummaryDay;
  progress_summary_channel: NotificationChannel;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  send_encouragement: boolean;
  send_hints: boolean;
}

export interface NotificationPreferencesUpdate {
  email_enabled?: boolean;
  email_address?: string;
  sms_enabled?: boolean;
  phone_number?: string;
  daily_quiz_enabled?: boolean;
  daily_quiz_time?: string;
  daily_quiz_channel?: NotificationChannel;
  reminder_frequency?: ReminderFrequency;
  reminder_channel?: NotificationChannel;
  progress_summary_enabled?: boolean;
  progress_summary_day?: SummaryDay;
  progress_summary_channel?: NotificationChannel;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone?: string;
  send_encouragement?: boolean;
  send_hints?: boolean;
}

// Reference types
export interface Reference {
  id: string;
  title: string;
  description: string | null;
  modules: string[];
  difficulty: string;
}

export interface ReferenceContent {
  id: string;
  title: string;
  content: string;
  flashcards: Array<{ front: string; back: string; visual?: string }>;
  quiz: object | null;
}

export interface ReferencesResponse {
  references: Reference[];
}

// AI types
export interface AIResponse {
  content: string;
  tokens_used: number;
}

export interface ExplainRequest {
  concept: string;
  context?: string;
}

export interface HintRequest {
  question: string;
  current_answer?: string;
  hint_level?: number;
}

export interface ExamplesRequest {
  concept: string;
  num_examples?: number;
}

export interface SimplifyRequest {
  content: string;
}

// ============================================
// Learning Paths & Course Authoring Types
// ============================================

// Course types
export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type CourseVisibility = 'private' | 'unlisted' | 'public';
export type CourseSource = 'filesystem' | 'database';

export interface CourseInstructions {
  purpose: string;
  target_audience: string;
  learning_objectives: string[];
  tone: string;
  additional_context?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty: CourseDifficulty;
  tags: string[];
  visibility: CourseVisibility;
  source: CourseSource;
  author_id: string;
  author_name: string;
  ai_enabled: boolean;
  instructions: CourseInstructions | null;
  times_added: number;
  own_path_count?: number;
  other_path_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CourseResponse extends Course {
  module_count: number;
}

export interface CourseCreate {
  title: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: CourseDifficulty;
  tags?: string[];
  visibility?: CourseVisibility;
  ai_enabled?: boolean;
  instructions?: CourseInstructions;
}

export interface CourseUpdate {
  title?: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: CourseDifficulty;
  tags?: string[];
  visibility?: CourseVisibility;
  ai_enabled?: boolean;
  instructions?: CourseInstructions;
}

export interface CourseDiscoveryFilters {
  q?: string;
  tags?: string[];
  difficulty?: CourseDifficulty;
  author_id?: string;
  sort?: 'popular' | 'newest' | 'alphabetical';
  page?: number;
  limit?: number;
}

export interface CourseDiscoveryResponse {
  courses: CourseResponse[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CourseWithModulesResponse {
  course: Course;
  modules: ModuleSummary[];
}

// Module types
export interface FlashcardData {
  id?: string;
  front: string;
  back: string;
  visual?: string;
}

export interface QuizQuestionData {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

export interface QuizData {
  questions: QuizQuestionData[];
}

export type SandboxLanguage = 'python' | 'javascript';

export interface SandboxData {
  language: SandboxLanguage;
  starter_code: string;
  solution_code?: string;
  instructions?: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  order_index: number;
  content_markdown: string;
  flashcards: FlashcardData[];
  quiz: QuizData | null;
  sandbox: SandboxData | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleSummary {
  objectives?: string[];
  id: string;
  title: string;
  description?: string;
  order_index: number;
  flashcard_count: number;
  has_quiz: boolean;
}

export interface ModuleCreate {
  objectives?: string[];
  title: string;
  description?: string;
  order_index: number;
  content_markdown?: string;
  flashcards?: FlashcardData[];
  quiz?: QuizData;
  sandbox?: SandboxData;
}

export interface ModuleUpdate {
  title?: string;
  description?: string;
  order_index?: number;
  content_markdown?: string;
  flashcards?: FlashcardData[];
  quiz?: QuizData;
  sandbox?: SandboxData | null;
}

// Learning Path types
export interface LearningPath {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty: CourseDifficulty;
  estimated_hours: number | null;
  course_ids: string[];
  visibility: CourseVisibility;
  created_at: string;
  updated_at: string;
}

export interface LearningPathResponse extends LearningPath {
  course_count: number;
}

export interface LearningPathWithCoursesResponse {
  is_following?: boolean;
  unavailable_courses?: { id: string; reason: string }[];
  path: LearningPath;
  courses: CourseResponse[];
}

export interface LearningPathCreate {
  title: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: CourseDifficulty;
  estimated_hours?: number;
  course_ids?: string[];
  visibility?: CourseVisibility;
}

export interface LearningPathUpdate {
  title?: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: CourseDifficulty;
  estimated_hours?: number;
  visibility?: CourseVisibility;
}

// Image upload types
export interface ImageUploadResponse {
  url: string;
  filename: string;
}

// AI Generation types for courses
export interface ModuleSuggestion {
  title: string;
  description: string;
  objectives: string[];
  suggested: boolean;
}

export interface GenerateModuleRequest {
  prompt: string;
  generate_flashcards?: boolean;
  flashcard_count?: number;
  generate_quiz?: boolean;
  quiz_question_count?: number;
  generate_visuals?: boolean;
}

// ============================================
// AI Generation Types (for course authoring)
// ============================================

/** Request to suggest modules for an AI-enabled course */
export interface SuggestModulesRequest {
  course_id: string;
}

/** Response containing suggested modules */
export interface SuggestModulesResponse {
  suggestions: ModuleSuggestion[];
  tokens_used: number;
}

/** Request to generate full module content */
export interface GenerateModuleContentRequest {
  course_id: string;
  module_title: string;
  module_prompt: string;
  generate_flashcards?: boolean;
  flashcard_count?: number;
  generate_quiz?: boolean;
  quiz_question_count?: number;
}

/** Generated module content response */
export interface GeneratedModuleContent {
  content_markdown: string;
  flashcards: FlashcardData[];
  quiz: QuizData | null;
  suggested_visuals: string[];
  tokens_used: number;
}

/** Request to generate flashcards from module content */
export interface GenerateFlashcardsRequest {
  course_id: string;
  module_id: string;
  count?: number;
}

/** Response containing generated flashcards */
export interface GenerateFlashcardsResponse {
  flashcards: FlashcardData[];
  tokens_used: number;
}

/** Request to generate quiz from module content */
export interface GenerateQuizRequest {
  course_id: string;
  module_id: string;
  question_count?: number;
}

/** Response containing generated quiz */
export interface GenerateQuizResponse {
  quiz: QuizData;
  tokens_used: number;
}

/** Visual generation style options */
export type VisualStyle =
  | 'educational_diagram'
  | 'technical_illustration'
  | 'flowchart'
  | 'infographic'
  | 'conceptual';

/** Visual generation model options */
export type VisualModel = 'flash' | 'pro';

/** Visual aspect ratio options */
export type VisualAspect = 'square' | 'landscape' | 'portrait';

/** Request to generate a visual using AI */
export interface GenerateVisualRequest {
  course_id: string;
  module_id: string;
  description: string;
  style?: VisualStyle;
  model?: VisualModel;
  aspect?: VisualAspect;
}

/** Generated visual response */
export interface GeneratedVisual {
  description: string;
  local_path: string;
  url: string;
  markdown_reference: string;
  tokens_used: number;
}

// ============================================
// AI Connection Types
// ============================================

/** Status of the server-side Anvil router connection */
export interface AIConnectionStatus {
  provider: string;
  is_configured: boolean;
  is_reachable: boolean;
  model: string | null;
  message: string;
}

// ============================================
// Admin Types
// ============================================

/** Token transaction record */
export interface TokenTransaction {
  id: string;
  amount: number;
  balance_after: number;
  operation: string;
  reason: string | null;
  admin_id: string | null;
  created_at: string;
}

/** Request to adjust a user's token balance */
export interface AdjustTokensRequest {
  amount: number;
  reason: string;
}

/** Response after adjusting tokens */
export interface AdjustTokensResponse {
  user_id: string;
  previous_balance: number;
  new_balance: number;
  amount: number;
  transaction_id: string;
}

/** Response for user list endpoint */
export interface UserListResponse {
  users: User[];
  total: number;
  skip: number;
  limit: number;
}

/** Response for user detail endpoint */
export interface UserDetailResponse {
  user: User;
  transactions: TokenTransaction[];
}

/** Response for admin stats endpoint */
export interface AdminStatsResponse {
  total_users: number;
  admin_count: number;
  user_count: number;
  total_tokens: number;
}

// ============================================
// Flashcard Rating Types
// ============================================

/** Rating options for flashcards */
export type FlashcardRating = 'easy' | 'medium' | 'hard' | 'unhelpful';

/** Request to rate a flashcard */
export interface RateFlashcardRequest {
  flashcard_index: number;
  flashcard_id?: string;
  rating: FlashcardRating;
}

/** Response after rating a flashcard */
export interface FlashcardRatingResponse {
  flashcard_index: number;
  rating: FlashcardRating;
  updated: boolean;
}

/** A user's rating record for a flashcard */
export interface FlashcardRatingRecord {
  id: string;
  user_id: string;
  course_id: string;
  module_id: string;
  flashcard_index: number;
  flashcard_id?: string;
  rating: FlashcardRating;
  created_at: string;
  updated_at: string;
}

/** Summary of ratings for a module's flashcards */
export interface FlashcardRatingSummary {
  total: number;
  unrated: number;
  easy: number;
  medium: number;
  hard: number;
  unhelpful: number;
}

/** A flashcard with its rating status */
export interface FilteredFlashcard {
  index: number;
  id?: string;
  front: string;
  back: string;
  visual?: string;
  rating?: FlashcardRating;
}

/** Response containing filtered flashcards */
export interface FilteredFlashcardsResponse {
  flashcards: FilteredFlashcard[];
  filter_applied: string;
  total: number;
}

/** Filter options for flashcards */
export type FlashcardFilter = 'all' | 'unrated' | FlashcardRating;
