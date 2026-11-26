# Architecture

GapMap is one Next.js application: server-rendered pages, Server Actions for mutations, Route
Handlers for uploads and downloads, and background work scheduled with `after()` so a large upload
never blocks the screen.

```
Browser (instructor web · student mobile web · coordinator · company)
   │  pages, server actions
   ▼
Next.js 16 app ──► proxy.ts (optimistic role routing) ──► requireRole() in every page/action (DAL)
   │                                   │
   │ uploads (/api/lectures, /api/papers, /api/import-csv)       after(): processLecture / processPaper
   ▼                                   ▼
SQLite (Drizzle)  ◄────────────  lib/jobs.ts  ──►  lib/ai/pipelines.ts ──► Claude API (or offline fallback)
storage/ (scans, lecture files, served by /api/files/[id] with access checks)
```

## Request flow for one paper

1. `POST /api/papers` stores the scan and creates a `papers` row (`uploaded`).
2. `after()` → `processPaper`: `segmented` → Claude vision transcribes each answer by question with a
   confidence score and the words it was unsure about → `transcribed`.
3. For every answer, `analyseAnswer` → `matchAnswer` returns met / partial / missing per criterion,
   the evidence quote, the gap, suggested marks, an error type and (if ambiguous) one follow-up
   question. Quotes that are not verbatim substrings of the transcription are dropped and the
   confidence is lowered.
4. The review queue shows everything; the instructor edits and approves. **Release** makes approved
   answers visible to students and records concept attempts (which feed mastery, insights and alerts).

## Data model

The **concept** is the spine: slides, criteria, questions, attempts, alerts and vacancies all point to
concepts, which is what lets every feature link a gap to a slide and to a skill.

| Table | Purpose |
| --- | --- |
| `users`, `universities`, `companies`, `enrollments` | People, tenants and course membership (role + section) |
| `courses`, `concepts` (with prerequisite), `lectures`, `slides`, `slide_concepts` (suggested/confirmed) | Course material |
| `exams`, `questions`, `criteria` (marks, concept, slide) | Assessment and rubric |
| `papers` (status pipeline), `answers` (transcription, confidence, follow-up, review), `criterion_results` (status, evidence, gap, marks) | Paper analysis |
| `followups` (chat + branch), `study_profiles`, `activities`, `practice_items`, `attempts` | Student learning loop |
| `misconceptions`, `question_flags`, `class_decisions` | Class insights |
| `threads`, `thread_messages` | Anonymous discussion (alias only exposed to staff) |
| `alerts` | Early support |
| `vacancies`, `nominations` | Internship evidence |
| `audit_log` | Logins, approvals, edits, releases, nominations |

Schema: `src/lib/db/schema.ts`. Migrations: `drizzle/` (`npm run db:generate` after schema edits).

## AI pipelines (`src/lib/ai`)

| Pipeline | Function | Model tier |
| --- | --- | --- |
| Concept tagging of slides | `tagSlides` | fast |
| Rubric drafting | `draftRubric` | reasoning |
| Handwriting transcription | `transcribePaper` (PDF or image) | vision |
| Criterion matching + follow-up question | `matchAnswer` | reasoning |
| Diagnosis conversation | `followupTurn` | fast |
| Study profile | `buildProfile` | fast |
| Activity choice | `chooseActivity` (rules) | — |
| Explanation check | `checkSubmission` | fast |
| Fresh question + grading | `generateRetest`, `gradeRetest` | reasoning |
| Misconception clustering | `clusterMisconceptions` | reasoning |
| Early alerts | `computeAlerts` in `lib/alerts.ts` (rules) | — |

Guardrails: one forced tool call per request so output is structured; zod validation with one retry;
verbatim-quote validation; marks clamped to each criterion's maximum; the AI never releases anything;
offline fallback in `fallback.ts` with the same output shapes.

## Security

- Sessions: HS256 JWT in an `httpOnly`, `sameSite=lax` cookie (secure in production), 7-day expiry.
- `proxy.ts` does optimistic redirects only; every page and server action re-checks the role and
  course access (`requireRole`, `assertCourseAccess`, `examWithAccess`, `ownAnswer`).
- Students only ever query their own released answers. Staff thread queries never select the student id.
- Upload type and size limits; storage paths are resolved and checked against the storage root.

## Scaling notes

SQLite keeps the hackathon build self-contained. For a multi-university deployment, switch Drizzle to
PostgreSQL (+ pgvector for slide retrieval), move `storage/` to S3-compatible object storage, and move
`after()` jobs to a queue (e.g. a worker on Redis) for batches of hundreds of papers.
