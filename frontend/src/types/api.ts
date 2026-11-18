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
  page_number: number;
  page_count: number;
  title: string | null;
  content: string;
  image_url: string | null;
}
