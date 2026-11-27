import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

export type Role = "student" | "instructor" | "ta" | "coordinator" | "company" | "admin";

/* ───────── People & access ───────── */

export const universities = sqliteTable("universities", {
  id: id(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("pilot"),
  createdAt: createdAt(),
});

export const companies = sqliteTable("companies", {
  id: id(),
  name: text("name").notNull(),
  website: text("website"),
});

export const users = sqliteTable("users", {
  id: id(),
  universityId: text("university_id").references(() => universities.id),
  companyId: text("company_id").references(() => companies.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").$type<Role>().notNull(),
  title: text("title"),
  locale: text("locale").notNull().default("en"),
  recruitOptIn: integer("recruit_opt_in", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const courses = sqliteTable("courses", {
  id: id(),
  universityId: text("university_id").references(() => universities.id),
  code: text("code").notNull(),
  title: text("title").notNull(),
  term: text("term").notNull(),
  instructorId: text("instructor_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const enrollments = sqliteTable("enrollments", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").$type<"student" | "ta" | "instructor">().notNull(),
  section: text("section").notNull().default("A"),
});

/* ───────── Course material ───────── */

export const concepts = sqliteTable("concepts", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  name: text("name").notNull(),
  description: text("description"),
  prerequisiteId: text("prerequisite_id"),
  unit: integer("unit").notNull().default(1),
  /** Activity scenario the AI drafted once for this concept (from its slides only), reused for every student. */
  activityCache: text("activity_cache", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const lectures = sqliteTable("lectures", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name"),
  filePath: text("file_path"),
  status: text("status").$type<"processing" | "ready" | "failed">().notNull().default("ready"),
  progress: integer("progress").notNull().default(100),
  createdAt: createdAt(),
});

export const slides = sqliteTable("slides", {
  id: id(),
  lectureId: text("lecture_id").notNull().references(() => lectures.id),
  page: integer("page").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
});

export const slideConcepts = sqliteTable(
  "slide_concepts",
  {
    slideId: text("slide_id").notNull().references(() => slides.id),
    conceptId: text("concept_id").notNull().references(() => concepts.id),
    status: text("status").$type<"suggested" | "confirmed">().notNull().default("confirmed"),
  },
  (t) => [primaryKey({ columns: [t.slideId, t.conceptId] })],
);

/* ───────── Assessment ───────── */

export const exams = sqliteTable("exams", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  title: text("title").notNull(),
  kind: text("kind").$type<"midterm" | "quiz" | "final" | "practice">().notNull().default("midterm"),
  date: text("date").notNull(),
  status: text("status").$type<"setup" | "processing" | "review" | "released">().notNull().default("setup"),
  createdAt: createdAt(),
});

export const questions = sqliteTable("questions", {
  id: id(),
  examId: text("exam_id").notNull().references(() => exams.id),
  number: integer("number").notNull(),
  prompt: text("prompt").notNull(),
  maxMarks: real("max_marks").notNull(),
  modelAnswer: text("model_answer").notNull().default(""),
  conceptId: text("concept_id").references(() => concepts.id),
});

export const criteria = sqliteTable("criteria", {
  id: id(),
  questionId: text("question_id").notNull().references(() => questions.id),
  code: text("code").notNull(),
  description: text("description").notNull(),
  marks: real("marks").notNull(),
  conceptId: text("concept_id").references(() => concepts.id),
  slideId: text("slide_id").references(() => slides.id),
  aiDrafted: integer("ai_drafted", { mode: "boolean" }).notNull().default(false),
});

export const papers = sqliteTable("papers", {
  id: id(),
  examId: text("exam_id").notNull().references(() => exams.id),
  studentId: text("student_id").references(() => users.id),
  fileName: text("file_name"),
  filePath: text("file_path"),
  mimeType: text("mime_type"),
  section: text("section").notNull().default("A"),
  status: text("status")
    .$type<"uploaded" | "segmented" | "transcribed" | "analysed" | "reviewed" | "released" | "failed">()
    .notNull()
    .default("uploaded"),
  error: text("error"),
  createdAt: createdAt(),
});

export type CriterionStatus = "met" | "partial" | "missing";

export const answers = sqliteTable("answers", {
  id: id(),
  paperId: text("paper_id").notNull().references(() => papers.id),
  questionId: text("question_id").notNull().references(() => questions.id),
  handwriting: text("handwriting"),
  transcription: text("transcription").notNull().default(""),
  confidence: real("confidence").notNull().default(1),
  lowConfidence: text("low_confidence", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  status: text("status").$type<"pending" | "analysed" | "approved" | "released">().notNull().default("pending"),
  /** The mark the instructor wrote on the paper, read from the scan. Null until it is found. The AI never sets marks. */
  paperMarks: real("paper_marks"),
  /** How sure the reader is about paperMarks (1 when typed by a reviewer). */
  paperMarkConfidence: real("paper_mark_confidence").notNull().default(1),
  suggestedMarks: real("suggested_marks"),
  finalMarks: real("final_marks"),
  errorType: text("error_type"),
  followupQuestion: text("followup_question"),
  followupReason: text("followup_reason"),
  followupEnabled: integer("followup_enabled", { mode: "boolean" }).notNull().default(true),
  model: text("model"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
});

export const criterionResults = sqliteTable("criterion_results", {
  id: id(),
  answerId: text("answer_id").notNull().references(() => answers.id),
  criterionId: text("criterion_id").notNull().references(() => criteria.id),
  status: text("status").$type<CriterionStatus>().notNull(),
  evidence: text("evidence").notNull().default(""),
  gap: text("gap").notNull().default(""),
  marks: real("marks").notNull().default(0),
  aiConfidence: real("ai_confidence").notNull().default(0.9),
  edited: integer("edited", { mode: "boolean" }).notNull().default(false),
  /** Short explanation that closes the gap, written only from the cited slide. */
  explanation: text("explanation").notNull().default(""),
  /** Slide the explanation cites. Null with a non-empty explanation means uncited: flagged and hidden from students. */
  citedSlideId: text("cited_slide_id").references(() => slides.id),
});

/* ───────── Student learning loop ───────── */

export type ChatMessage = { role: "assistant" | "student"; text: string; at: number };

export const followups = sqliteTable("followups", {
  id: id(),
  answerId: text("answer_id").notNull().references(() => answers.id),
  studentId: text("student_id").notNull().references(() => users.id),
  messages: text("messages", { mode: "json" }).$type<ChatMessage[]>().notNull().default(sql`'[]'`),
  branch: text("branch").$type<"understands" | "misconception" | "unclear">(),
  identifiedGap: text("identified_gap"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const studyProfiles = sqliteTable("study_profiles", {
  studentId: text("student_id").primaryKey().references(() => users.id),
  answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull(),
  traits: text("traits", { mode: "json" }).$type<string[]>().notNull(),
  preferredActivity: text("preferred_activity").$type<ActivityType>().notNull().default("worked_example"),
  minutesPerDay: integer("minutes_per_day").notNull().default(30),
  summary: text("summary").notNull(),
  updatedAt: createdAt(),
});

export type ActivityType = "experiment" | "mind_map" | "worked_example" | "own_words" | "try_first";

export const activities = sqliteTable("activities", {
  id: id(),
  studentId: text("student_id").notNull().references(() => users.id),
  conceptId: text("concept_id").notNull().references(() => concepts.id),
  answerId: text("answer_id").references(() => answers.id),
  type: text("type").$type<ActivityType>().notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<"todo" | "submitted" | "done">().notNull().default("todo"),
  submission: text("submission"),
  feedback: text("feedback"),
  usefulness: text("usefulness").$type<"a_lot" | "a_little" | "not_really">(),
  priority: integer("priority").notNull().default(1),
  createdAt: createdAt(),
});

export const practiceItems = sqliteTable("practice_items", {
  id: id(),
  studentId: text("student_id").notNull().references(() => users.id),
  conceptId: text("concept_id").notNull().references(() => concepts.id),
  kind: text("kind").$type<"practice" | "retest">().notNull().default("retest"),
  prompt: text("prompt").notNull(),
  criteria: text("criteria", { mode: "json" }).$type<{ code: string; description: string; marks: number }[]>().notNull(),
  answer: text("answer"),
  result: text("result", { mode: "json" }).$type<{ code: string; status: CriterionStatus; evidence: string; gap: string }[]>(),
  score: real("score"),
  maxScore: real("max_score").notNull(),
  feedback: text("feedback"),
  createdAt: createdAt(),
});

export const attempts = sqliteTable("attempts", {
  id: id(),
  studentId: text("student_id").notNull().references(() => users.id),
  conceptId: text("concept_id").notNull().references(() => concepts.id),
  label: text("label").notNull(),
  date: text("date").notNull(),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  source: text("source").$type<"exam" | "quiz" | "practice" | "retest">().notNull(),
});

/* ───────── Instructor insight ───────── */

export const misconceptions = sqliteTable("misconceptions", {
  id: id(),
  questionId: text("question_id").notNull().references(() => questions.id),
  title: text("title").notNull(),
  studentCount: integer("student_count").notNull(),
  examples: text("examples", { mode: "json" }).$type<string[]>().notNull(),
});

export const questionFlags = sqliteTable("question_flags", {
  id: id(),
  questionId: text("question_id").notNull().references(() => questions.id),
  reason: text("reason").notNull(),
  answerCount: integer("answer_count").notNull(),
  decision: text("decision").$type<"clarify" | "revisit_criteria" | "reteach" | null>(),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});

export const classDecisions = sqliteTable("class_decisions", {
  id: id(),
  examId: text("exam_id").notNull().references(() => exams.id),
  conceptId: text("concept_id").references(() => concepts.id),
  decision: text("decision").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const threads = sqliteTable("threads", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  studentId: text("student_id").notNull().references(() => users.id),
  answerId: text("answer_id").references(() => answers.id),
  alias: text("alias").notNull(),
  subject: text("subject").notNull(),
  status: text("status").$type<"open" | "answered" | "closed">().notNull().default("open"),
  createdAt: createdAt(),
});

export const threadMessages = sqliteTable("thread_messages", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => threads.id),
  authorRole: text("author_role").$type<"student" | "instructor">().notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const alerts = sqliteTable("alerts", {
  id: id(),
  courseId: text("course_id").notNull().references(() => courses.id),
  studentId: text("student_id").notNull().references(() => users.id),
  conceptId: text("concept_id").notNull().references(() => concepts.id),
  dependentConcept: text("dependent_concept").notNull(),
  summary: text("summary").notNull(),
  suggestion: text("suggestion").notNull(),
  status: text("status").$type<"open" | "actioned" | "dismissed">().notNull().default("open"),
  action: text("action"),
  useful: integer("useful", { mode: "boolean" }),
  createdAt: createdAt(),
});

/* ───────── Opportunities ───────── */

export const vacancies = sqliteTable("vacancies", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull(),
  conceptIds: text("concept_ids", { mode: "json" }).$type<string[]>().notNull(),
  closes: text("closes").notNull(),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  createdAt: createdAt(),
});

export const nominations = sqliteTable("nominations", {
  id: id(),
  vacancyId: text("vacancy_id").notNull().references(() => vacancies.id),
  studentId: text("student_id").notNull().references(() => users.id),
  nominatedBy: text("nominated_by").notNull().references(() => users.id),
  note: text("note"),
  status: text("status").$type<"nominated" | "interview" | "declined" | "hired">().notNull().default("nominated"),
  createdAt: createdAt(),
});

export const auditLog = sqliteTable("audit_log", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  object: text("object").notNull(),
  at: createdAt(),
});
