# Software Requirements Specification: GapMap

Version 1.0, 20 November 2026. Describes the system **as built** for the AI Educathon 2026 demo
(28 November 2026). The full original analysis is the project plan
([../../requirements/GapMap_Complete_Project_Plan_EN.md](../../requirements/GapMap_Complete_Project_Plan_EN.md));
this document summarises it and records what was built.

## 1. Introduction

### 1.1 Purpose

GapMap turns approved exam results into a per-student diagnosis by concept, links each gap to the
instructor's lecture slides, and closes the loop with practice and a retest. It also gives the
instructor a class-level view. See the [Abstract](../01-Introduction/Abstract.md) and
[Problem Statement](../01-Introduction/Problem-Statement.md).

### 1.2 Scope

One pilot course, multiple-choice exams, CSV/Excel results import, PDF and Word lectures. Full scope
and limitations: [Scope-and-Limitations.md](../01-Introduction/Scope-and-Limitations.md).

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Concept | A topic an exam question assesses (for example *Scrum Roles*) |
| Slide chunk | One lecture page: its text, title, page number and rendered image |
| Concept→slide mapping | A link from a concept to a slide that explains it, with a status (`suggested` or `approved`) |
| Weak concept | A concept scored below the threshold (60%, configurable) on at least 2 questions |
| Likely cause | The error type the instructor tagged on the wrong option a student chose; a hypothesis, never a verdict |
| Question bank | Approved practice and retest items per concept, kept separate from exam questions and from each other |
| Learning gain | Retest score minus exam score on the same concept, in percentage points |

The plan's glossary (Section 23) defines the rest.

## 2. Overall description

### 2.1 Users and roles

| Role | Can do |
|---|---|
| Instructor | Upload lectures, build exams and answer keys, import and approve results, run analysis, view every student's report, class analytics and the audit log, for their own courses |
| Student | View their own report, recovery plan, slides, practice and retest, for enrolled courses |
| Coordinator | View every course and its class analytics (aggregated); denied every student-level report and plan (TC-27) |
| Admin | Instructor rights on every course |

Accounts and roles come from the seed script (plan Section 3, MVP assumption).

### 2.2 Operating environment

- Browser: a current Chrome, Edge or Firefox.
- Server: Docker Compose (PostgreSQL 16, FastAPI backend, Vite frontend), or Python 3.12+ and
  Node 24 (the version CI and the Docker image use) locally with SQLite.
- Optional: an Anthropic API key for grounded explanations.

### 2.3 Constraints

- Ten days of build time, a team of four, demo on 28 November 2026.
- No guaranteed OCR, so CSV/Excel is the only results path.
- Real exams and student data are not sent to external services without the university's approval;
  the demo uses synthetic data.

### 2.4 Assumptions

- An instructor reviews the concepts, answer key and question bank (open: issue #1).
- Each concept is measured by at least 2 questions.
- A student's `student_ref` in the results file matches an enrolled account.

## 3. Requirements

- Functional: [Functional-Requirements.md](Functional-Requirements.md): FR-01 to FR-47 with status.
- Non-functional: [Non-Functional-Requirements.md](Non-Functional-Requirements.md): NFR-01 to NFR-12.
- User stories and acceptance criteria: [User-Stories.md](User-Stories.md).
- Business rules: [../03-Analysis/Business-Rules.md](../03-Analysis/Business-Rules.md): BR-01 to BR-12.

## 4. External interfaces

- **User interface:** a web app for instructors and students. See the
  [UI screens](../04-Design/UI-Wireframes/README.md).
- **API:** REST over HTTP with JSON, JWT bearer authentication. See
  [API-Design.md](../04-Design/API-Design.md).
- **Results file:** long format, one row per student and question (`student_ref, question_id, answer,
  score`), as `.csv` or `.xlsx`. Template: `data/templates/results_template.csv`.
- **LLM:** the Anthropic Messages API (`claude-opus-5-5`), optional. It receives only a concept name
  and that concept's approved slide text.

## 5. Verification

Each requirement's verification is listed in its table. Test plan and results:
[../06-Testing/](../06-Testing/Test-Plan.md).
