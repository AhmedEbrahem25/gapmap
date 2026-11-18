// Hand-written for S0. Once the backend runs, `npm run gen:api` writes src/types/openapi.d.ts
// from FastAPI's schema; prefer those generated types as the API grows.

export type Role = "admin" | "instructor" | "student" | "coordinator";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  student_ref: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Course {
  id: string;
  title: string;
  code: string | null;
  term: string | null;
  instructor_name: string;
}

export interface Concept {
  id: string;
  name: string;
  description: string | null;
}

export interface CourseDetail extends Course {
  student_count: number;
  material_count: number;
  exam_count: number;
  concepts: Concept[];
}

export type MaterialStatus = "uploaded" | "processing" | "ready" | "failed";

export interface Material {
  id: string;
  course_id: string;
  filename: string;
  file_type: string;
  status: MaterialStatus;
  page_count: number | null;
  error: string | null;
  created_at: string;
}

export interface Page {
  material_id: string;
  course_id: string;
  filename: string;
  file_type: "pdf" | "docx";
  page_number: number;
  page_count: number;
  title: string | null;
  content: string;
  image_url: string | null;
}

export type ExamStatus = "draft" | "key_approved" | "analyzed";

export interface Exam {
  id: string;
  course_id: string;
  title: string;
  exam_date: string | null;
  status: ExamStatus;
  question_count: number;
}

export interface AnalysisSummary {
  exam_id: string;
  students: number;
  answers: number;
  score_mismatches: number;
  recovery_plans: number;
  weak_threshold_percent: number;
}

export interface SlideRef {
  slide_chunk_id: string;
  material_id: string;
  filename: string;
  page_number: number;
  title: string | null;
  excerpt: string;
}

export type ConceptStatus = "weak" | "ok" | "not_enough_data";

export interface ConceptReport {
  concept_id: string;
  name: string;
  earned: number;
  max: number;
  percent: number;
  question_count: number;
  status: ConceptStatus;
  slides: SlideRef[];
}

export interface QuestionResult {
  question_code: string;
  prompt: string;
  concept_names: string[];
  your_answer: string | null;
  your_answer_text: string | null;
  correct_answer: string;
  correct_answer_text: string | null;
  score: number;
  max_score: number;
  likely_cause: string | null;
  evidence: string | null;
}

export interface StudentReport {
  exam_id: string;
  exam_title: string;
  course_id: string;
  course_title: string;
  student_id: string;
  student_name: string;
  student_ref: string | null;
  earned: number;
  max: number;
  weak_threshold_percent: number;
  recovery_plan_id: string | null;
  concepts: ConceptReport[];
  questions: QuestionResult[];
}

export interface StudentResultRow {
  student_id: string;
  student_ref: string | null;
  student_name: string;
  earned: number;
  max: number;
  weak_concepts: string[];
}

export interface RecoveryTask {
  id: string;
  task_type: "review_slide" | "practice";
  status: "pending" | "completed";
  slide: SlideRef | null;
}

export interface PlanConcept {
  concept_id: string;
  name: string;
  percent_before: number;
  practice_count: number;
  tasks: RecoveryTask[];
}

export interface RetestSummary {
  id: string;
  status: "in_progress" | "submitted";
  submitted_at: string | null;
  total_score: number | null;
  max_score: number;
}

export interface RecoveryPlan {
  id: string;
  exam_id: string;
  exam_title: string;
  course_id: string;
  status: "active" | "completed";
  concepts: PlanConcept[];
  retest_question_count: number;
  retests: RetestSummary[];
}

export interface BankQuestion {
  id: string;
  concept_id: string;
  prompt: string;
  options: { key: string; text: string }[];
}

export interface PracticeCheck {
  correct: boolean;
  correct_answer: string;
  correct_answer_text: string | null;
  source: SlideRef | null;
}

export interface Retest {
  id: string;
  plan_id: string;
  status: "in_progress" | "submitted";
  questions: BankQuestion[];
}

export interface ConceptGain {
  concept_id: string;
  name: string;
  before_percent: number;
  before_question_count: number;
  after_percent: number;
  after_question_count: number;
  gain_points: number;
}

export interface RetestResults {
  retest_id: string;
  plan_id: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  concepts: ConceptGain[];
  questions: {
    bank_question_id: string;
    concept_name: string;
    prompt: string;
    your_answer: string | null;
    correct_answer: string;
    correct_answer_text: string | null;
    correct: boolean;
  }[];
  note: string;
}

export interface OptionCount {
  key: string;
  text: string;
  count: number;
  is_correct: boolean;
  error_type: string | null;
}

export interface QuestionStat {
  question_code: string;
  prompt: string;
  concept_names: string[];
  responses: number;
  incorrect: number;
  error_rate: number;
  options: OptionCount[];
  top_wrong: OptionCount | null;
}

export interface ConceptStat {
  concept_id: string;
  name: string;
  question_count: number;
  responses: number;
  incorrect: number;
  error_rate: number;
  students_measured: number;
  students_weak: number;
}

export interface ClassAnalytics {
  course_id: string;
  exam: { id: string; title: string; status: ExamStatus } | null;
  exams: { id: string; title: string; status: ExamStatus }[];
  student_count: number;
  weak_threshold_percent: number;
  reteach_threshold_percent: number;
  concepts: ConceptStat[];
  questions: QuestionStat[];
  reteach: { concept_id: string; name: string; error_rate: number; evidence: string[] }[];
}

export type ErrorType =
  | "conceptual"
  | "formula_application"
  | "calculation"
  | "missing_prerequisite"
  | "incomplete_answer"
  | "unknown";

export interface QuestionOption {
  key: string;
  text: string;
  error_type: ErrorType | null;
}

export interface ExamQuestion {
  id: string;
  question_code: string;
  position: number;
  prompt: string;
  options: QuestionOption[];
  answer_key: string | null;
  max_score: number;
  concept_id: string | null;
}

export interface ExamDetail {
  id: string;
  course_id: string;
  title: string;
  exam_date: string | null;
  status: ExamStatus;
  can_reopen: boolean;
  questions: ExamQuestion[];
}

export interface QuestionInput {
  question_code: string;
  prompt: string;
  options: QuestionOption[];
  answer_key: string;
  max_score: number;
  concept_id: string;
}

export interface ImportRow {
  id: string;
  row_number: number;
  student_ref: string | null;
  question_code: string | null;
  answer: string | null;
  score: number | null;
  errors: string[];
  warnings: string[];
  status: "valid" | "invalid" | "corrected";
}

export interface ImportSummary {
  id: string;
  exam_id: string;
  original_filename: string | null;
  status: "pending_review" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  total_rows: number;
  invalid_rows: number;
  warning_rows: number;
  students: number;
}

export interface ImportDetail extends ImportSummary {
  rows: ImportRow[];
}

export interface ImportRowPatch {
  student_ref?: string;
  question_code?: string;
  answer?: string;
  score?: number;
  clear_score?: boolean;
}

export interface ConceptExplanation {
  status: "ready" | "unavailable";
  explanation: string | null;
  key_points: string[];
  sources: SlideRef[];
  model: string | null;
  message: string | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  details: Record<string, unknown> | null;
}
