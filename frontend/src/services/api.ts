import type {
  AnalysisSummary,
  AuditEntry,
  BankItemInput,
  BankOverview,
  ClassAnalytics,
  ConceptDetail,
  ConceptExplanation,
  ConceptInput,
  Course,
  CourseDetail,
  Exam,
  ExamDetail,
  ImportDetail,
  ImportRowPatch,
  ImportSummary,
  Material,
  QuestionInput,
  Page,
  PracticeCheck,
  BankQuestion,
  RecoveryPlan,
  Retest,
  RetestResults,
  SlideSuggestion,
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
  bank: (conceptId: string) => request<BankOverview>(`/concepts/${conceptId}/bank-questions`),
  addBankItem: (conceptId: string, body: BankItemInput) =>
    request<BankOverview>(`/concepts/${conceptId}/bank-questions`, { method: "POST", body: JSON.stringify(body) }),
  updateBankItem: (itemId: string, body: BankItemInput) =>
    request<BankOverview>(`/bank-questions/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
  approveBankItem: (itemId: string) => request<BankOverview>(`/bank-questions/${itemId}/approve`, { method: "POST" }),
  withdrawBankItem: (itemId: string) => request<BankOverview>(`/bank-questions/${itemId}/withdraw`, { method: "POST" }),
  deleteBankItem: (itemId: string) => request<BankOverview>(`/bank-questions/${itemId}`, { method: "DELETE" }),
  concepts: (courseId: string) => request<ConceptDetail[]>(`/courses/${courseId}/concepts`),
  createConcept: (courseId: string, body: ConceptInput) =>
    request<ConceptDetail>(`/courses/${courseId}/concepts`, { method: "POST", body: JSON.stringify(body) }),
  updateConcept: (conceptId: string, body: ConceptInput) =>
    request<ConceptDetail>(`/concepts/${conceptId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteConcept: (conceptId: string) => request<void>(`/concepts/${conceptId}`, { method: "DELETE" }),
  slideSuggestions: (conceptId: string) => request<SlideSuggestion[]>(`/concepts/${conceptId}/slide-suggestions`),
  approveSlide: (conceptId: string, slideChunkId: string) =>
    request<ConceptDetail>(`/concepts/${conceptId}/slides/${slideChunkId}`, { method: "PUT" }),
  removeSlide: (conceptId: string, slideChunkId: string) =>
    request<ConceptDetail>(`/concepts/${conceptId}/slides/${slideChunkId}`, { method: "DELETE" }),
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
  createExam: (courseId: string, title: string) =>
    request<ExamDetail>(`/courses/${courseId}/exams`, { method: "POST", body: JSON.stringify({ title }) }),
  exam: (examId: string) => request<ExamDetail>(`/exams/${examId}`),
  addQuestion: (examId: string, q: QuestionInput) =>
    request<ExamDetail>(`/exams/${examId}/questions`, { method: "POST", body: JSON.stringify(q) }),
  updateQuestion: (questionId: string, q: QuestionInput) =>
    request<ExamDetail>(`/questions/${questionId}`, { method: "PUT", body: JSON.stringify(q) }),
  deleteQuestion: (questionId: string) => request<ExamDetail>(`/questions/${questionId}`, { method: "DELETE" }),
  approveKey: (examId: string) => request<ExamDetail>(`/exams/${examId}/approve-key`, { method: "POST" }),
  reopenExam: (examId: string) => request<ExamDetail>(`/exams/${examId}/reopen`, { method: "POST" }),
  imports: (examId: string) => request<ImportSummary[]>(`/exams/${examId}/imports`),
  uploadResults: (examId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<ImportDetail>(`/exams/${examId}/imports`, { method: "POST", body });
  },
  importDetail: (importId: string) => request<ImportDetail>(`/imports/${importId}`),
  correctRow: (importId: string, rowId: string, patch: ImportRowPatch) =>
    request<ImportDetail>(`/imports/${importId}/rows/${rowId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteRow: (importId: string, rowId: string) =>
    request<ImportDetail>(`/imports/${importId}/rows/${rowId}`, { method: "DELETE" }),
  approveImport: (importId: string) => request<ImportDetail>(`/imports/${importId}/approve`, { method: "POST" }),
  rejectImport: (importId: string) => request<ImportDetail>(`/imports/${importId}/reject`, { method: "POST" }),
  explanation: (conceptId: string) => request<ConceptExplanation>(`/concepts/${conceptId}/explanation`),
  auditLog: (courseId: string) => request<AuditEntry[]>(`/courses/${courseId}/audit-log`),
  analytics: (courseId: string, examId?: string) =>
    request<ClassAnalytics>(`/courses/${courseId}/analytics${examId ? `?exam_id=${examId}` : ""}`),
};
