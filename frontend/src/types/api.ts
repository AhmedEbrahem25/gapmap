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
  weak_threshold_percent: number;
}

export interface SlideRef {
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
