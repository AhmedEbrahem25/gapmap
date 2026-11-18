import type {
  AnalysisSummary,
  ClassAnalytics,
  Course,
  CourseDetail,
  Exam,
  Material,
  Page,
  PracticeCheck,
  BankQuestion,
  RecoveryPlan,
  Retest,
  RetestResults,
  StudentReport,
  StudentResultRow,
  TokenResponse,
  User,
} from "../types/api";

const TOKEN_KEY = "gapmap.token";

// Storage can throw (private mode, blocked site data); the app must still work without it.
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* session-only login */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Called on 401 so the auth layer can drop the session (set by AuthProvider).
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init: RequestInit = {}, as: "json" | "blob" = "json"): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(path.startsWith("/api/") ? path : `/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`;
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return as === "blob" ? ((await res.blob()) as T) : res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<User>("/me"),
  courses: () => request<Course[]>("/courses"),
  course: (id: string) => request<CourseDetail>(`/courses/${id}`),
  materials: (courseId: string) => request<Material[]>(`/courses/${courseId}/materials`),
  uploadMaterial: (courseId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<Material>(`/courses/${courseId}/materials`, { method: "POST", body });
  },
  page: (materialId: string, page: number) => request<Page>(`/materials/${materialId}/pages/${page}`),
  // Images need the bearer token, so they are fetched as blobs instead of plain <img src>.
  blob: (url: string) => request<Blob>(url, {}, "blob"),
  exams: (courseId: string) => request<Exam[]>(`/courses/${courseId}/exams`),
  analyze: (examId: string) => request<AnalysisSummary>(`/exams/${examId}/analyze`, { method: "POST" }),
  examResults: (examId: string) => request<StudentResultRow[]>(`/exams/${examId}/results`),
  studentReport: (examId: string, studentId: string) =>
    request<StudentReport>(`/exams/${examId}/students/${studentId}/report`),
  myReport: (examId: string) => request<StudentReport>(`/students/me/reports/${examId}`),
  plan: (planId: string) => request<RecoveryPlan>(`/recovery-plans/${planId}`),
  completeTask: (taskId: string) => request<void>(`/recovery-tasks/${taskId}/complete`, { method: "POST" }),
  practice: (conceptId: string) => request<BankQuestion[]>(`/concepts/${conceptId}/practice`),
  checkPractice: (questionId: string, answer: string) =>
    request<PracticeCheck>(`/practice/${questionId}/check`, { method: "POST", body: JSON.stringify({ answer }) }),
  startRetest: (planId: string) =>
    request<Retest>("/retests", { method: "POST", body: JSON.stringify({ recovery_plan_id: planId }) }),
  retest: (retestId: string) => request<Retest>(`/retests/${retestId}`),
  submitRetest: (retestId: string, answers: Record<string, string>) =>
    request<RetestResults>(`/retests/${retestId}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  retestResults: (retestId: string) => request<RetestResults>(`/retests/${retestId}/results`),
  analytics: (courseId: string, examId?: string) =>
    request<ClassAnalytics>(`/courses/${courseId}/analytics${examId ? `?exam_id=${examId}` : ""}`),
};
