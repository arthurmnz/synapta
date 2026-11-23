export type EntityId = number | string;

export type UserRole = 'student' | 'teacher';
export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type RetakeStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type AnalyticsScope = 'latest' | 'all';

export interface UserOut {
  id: EntityId;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TopicOut {
  id: EntityId;
  name: string;
  slug: string;
  description: string | null;
}

export interface TopicCreatePayload {
  name: string;
  description?: string | null;
}

export interface TopicMetricOut {
  topic_id: EntityId;
  topic_name: string;
  total_answers: number;
  correct_answers: number;
  wrong_answers: number;
  accuracy_percentage: number;
}

export interface QuestionOptions {
  A: string;
  B: string;
  C: string;
  D: string;
}

// --- Student types ---

export interface StudentClassroomOut {
  id: EntityId;
  name: string;
  description: string | null;
  teacher_name: string;
  published_lists_count: number;
  enrolled_at: string;
}

export interface AvailableClassroomOut {
  id: EntityId;
  name: string;
  description: string | null;
  teacher_name: string;
  student_count: number;
  published_lists_count: number;
  is_enrolled: boolean;
}

export interface EnrollmentOut {
  classroom_id: EntityId;
  student_id: EntityId;
  enrolled_at: string;
}

export interface StudentListSummaryOut {
  id: EntityId;
  classroom_id: EntityId;
  classroom_name: string;
  teacher_name: string;
  title: string;
  description: string | null;
  question_count: number;
  attempts_used: number;
  max_attempts_available_now: number;
  can_attempt: boolean;
  retake_status: RetakeStatus;
  latest_submission_id: EntityId | null;
  latest_score_percentage: number | null;
}

export interface StudentQuestionOut {
  id: EntityId;
  order_index: number;
  topic_id: EntityId;
  topic_name: string;
  statement: string;
  options: QuestionOptions;
}

export interface StudentPastSubmissionItemOut {
  submission_id: EntityId;
  attempt_number: number;
  score_percentage: number;
  correct_count: number;
  total_questions: number;
  has_teacher_comment: boolean;
  submitted_at: string;
}

export interface StudentListDetailOut {
  id: EntityId;
  classroom_id: EntityId;
  classroom_name: string;
  teacher_name: string;
  title: string;
  description: string | null;
  attempts_used: number;
  next_attempt_number: number;
  can_attempt: boolean;
  retake_status: RetakeStatus;
  questions: StudentQuestionOut[];
  past_submissions: StudentPastSubmissionItemOut[];
}

export interface QuizAnswerInput {
  question_id: EntityId;
  selected_option: OptionKey;
}

export interface SubmitQuizPayload {
  answers: QuizAnswerInput[];
}

export interface StudentSubmissionSummaryOut {
  submission_id: EntityId;
  question_list_id: EntityId;
  question_list_title: string;
  classroom_id: EntityId;
  classroom_name: string;
  attempt_number: number;
  attempts_used_total: number;
  correct_count: number;
  total_questions: number;
  score_percentage: number;
  performance_band: string;
  has_teacher_comment: boolean;
  retake_status: RetakeStatus;
  can_attempt: boolean;
  submitted_at: string;
}

export interface QuestionFeedbackOut {
  question_id: EntityId;
  order_index: number;
  topic_id: EntityId;
  topic_name: string;
  statement: string;
  options: QuestionOptions;
  selected_option: OptionKey;
  correct_option: OptionKey;
  is_correct: boolean;
  explanation: string;
}

export interface SubmissionFeedbackOut {
  submission_id: EntityId;
  question_list_id: EntityId;
  question_list_title: string;
  classroom_id: EntityId;
  classroom_name: string;
  student_id: EntityId;
  student_name: string;
  student_email: string;
  attempt_number: number;
  attempts_used_total: number;
  correct_count: number;
  total_questions: number;
  score_percentage: number;
  performance_band: string;
  teacher_comment: string | null;
  teacher_commented_at: string | null;
  retake_status: RetakeStatus;
  pending_retake_request_id: EntityId | null;
  can_authorize_retake: boolean;
  can_attempt: boolean;
  submitted_at: string;
  topic_breakdown: TopicMetricOut[];
  questions_feedback: QuestionFeedbackOut[];
}

export interface RetakeRequestOut {
  id: EntityId;
  question_list_id: EntityId;
  question_list_title: string;
  classroom_id: EntityId;
  classroom_name: string;
  student_id: EntityId;
  student_name: string;
  student_email: string;
  attempts_used: number;
  last_score_percentage: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'consumed' | RetakeStatus;
  request_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// --- Teacher types ---

export interface TeacherClassroomOut {
  id: EntityId;
  name: string;
  description: string | null;
  student_count: number;
  list_count: number;
  created_at: string;
}

export interface TeacherClassroomPayload {
  name: string;
  description?: string | null;
}

export interface TeacherListSummaryOut {
  id: EntityId;
  classroom_id: EntityId;
  classroom_name: string;
  title: string;
  description: string | null;
  is_published: boolean;
  question_count: number;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface TeacherQuestionOut {
  id: EntityId;
  question_list_id: EntityId;
  topic_id: EntityId;
  topic_name: string;
  order_index: number;
  statement: string;
  options: QuestionOptions;
  correct_option: OptionKey;
  explanation: string;
}

export interface TeacherListDetailOut {
  id: EntityId;
  classroom_id: EntityId;
  classroom_name: string;
  title: string;
  description: string | null;
  is_published: boolean;
  question_count: number;
  submission_count: number;
  has_submissions: boolean;
  created_at: string;
  updated_at: string;
  questions: TeacherQuestionOut[];
}

export interface TeacherListCreatePayload {
  classroom_id: EntityId;
  title: string;
  description?: string | null;
}

export interface TeacherListUpdatePayload {
  title?: string;
  description?: string | null;
  is_published?: boolean;
}

export interface TeacherQuestionCreatePayload {
  topic_id: EntityId;
  statement: string;
  options: QuestionOptions;
  correct_option: OptionKey;
  explanation: string;
  order_index?: number;
}

export interface TeacherQuestionUpdatePayload {
  topic_id?: EntityId;
  statement?: string;
  options?: QuestionOptions;
  correct_option?: OptionKey;
  explanation?: string;
  order_index?: number;
}

export interface TeacherAnalyticsKpisOut {
  total_classrooms: number;
  total_students: number;
  total_published_lists: number;
  total_submissions: number;
  overall_accuracy_percentage: number;
  pending_retake_requests: number;
}

export interface TeacherTopicAnalyticsOut {
  kpis: TeacherAnalyticsKpisOut;
  topics: TopicMetricOut[];
  lowest_performing_topics: TopicMetricOut[];
  highest_performing_topics: TopicMetricOut[];
}

export interface ClassroomRef {
  id: EntityId;
  name: string;
}

export interface TeacherStudentSummaryOut {
  student_id: EntityId;
  name: string;
  email: string;
  classrooms: ClassroomRef[];
  lists_completed_count: number;
  total_attempts_count: number;
  average_score_percentage: number | null;
  last_submitted_at: string | null;
  has_pending_retake: boolean;
}

export interface TeacherStudentSubmissionItemOut {
  submission_id: EntityId;
  question_list_id: EntityId;
  question_list_title: string;
  classroom_id: EntityId;
  classroom_name: string;
  attempt_number: number;
  attempts_on_list: number;
  correct_count: number;
  total_questions: number;
  score_percentage: number;
  teacher_comment: string | null;
  retake_status: RetakeStatus;
  pending_retake_request_id: EntityId | null;
  can_authorize_retake: boolean;
  submitted_at: string;
}

export interface TeacherStudentDetailOut {
  student: {
    id: EntityId;
    name: string;
    email: string;
    classrooms: ClassroomRef[];
  };
  summary: {
    average_score_percentage: number | null;
    lists_completed_count: number;
    total_attempts_count: number;
    strongest_topic: TopicMetricOut | string | null;
    weakest_topic: TopicMetricOut | string | null;
  };
  topic_performance: TopicMetricOut[];
  submissions: TeacherStudentSubmissionItemOut[];
}
