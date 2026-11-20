# Functional requirements

Requirements FR-01 to FR-47 from plan Section 4.1, with their status in the built system.

**Status:** **Done** = built and tested · **Partial** = built in part, see note · **Not built** ·
**Out of scope** = excluded by the plan (OCR, P2). Test names refer to `backend/tests/`; TC numbers
are mapped to tests in [../../test-results.md](../../test-results.md).

## Authentication and authorization

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-01 | User login | Done | JWT login, `POST /api/auth/login` (TC-01) |
| FR-02 | A role for every user | Done | `users.role`: instructor, student, coordinator, admin; `require_roles` checks routes |
| FR-03 | A student can't see another student's data | Done | TC-02, `test_analysis.py` |
| FR-04 | No access to unauthorized courses | Done | TC-20, `test_courses_rbac.py` (7 tests) |

## Course and materials

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-05 | The instructor creates a course | Done | **New course** on the home page; students are enrolled by reference on the Students page. `POST /api/courses`, `test_courses_admin.py` |
| FR-06 | Upload PDF (PPTX P1) | Done (PDF and Word) | PDF and .docx; PPTX not built. TC-03, TC-04, `test_materials_word.py` |
| FR-07 | Extract text with file name and page number | Done | `pdf_ingest.py`: one `slide_chunks` row per page, with text, title and image |
| FR-08 | Split content into searchable chunks | Partial | One chunk per page, searched by keyword to suggest slides; no embeddings (ADR 0001 §3) |
| FR-09 | The instructor reviews content→concept mapping | Done | Concepts page: keyword suggestions with the matched words, **Approve** and **Remove**; only approved slides reach students. `test_concepts.py` |
| FR-10 | Define concepts and link them to content | Done | Create, rename and describe concepts; a concept in use can't be deleted. `POST /api/courses/{id}/concepts`, `test_concepts.py` |

## Exam and import

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-11 | Create an exam in a course | Done | Exam builder, `POST /api/courses/{id}/exams` |
| FR-12 | Questions, types and scores | Done | MCQ only, 2 to 8 options, `max_score` per question |
| FR-13 | Answer key | Done | Key per question; `POST /api/exams/{id}/approve-key` locks it (BR-02) |
| FR-14 | Import CSV/Excel | Done | `.csv` and `.xlsx`, long format (plan 9.6). TC-05 |
| FR-15 | Validate columns and data before import | Done | `import_validation.py`. TC-06, TC-07, TC-08, TC-21, TC-22 |
| FR-16 | Link each submission to a student | Done | `student_ref` resolved to an enrolled user |
| FR-17 | Store the source and status of each score | Done | `submissions.source_type`, `approval_status`; `answers.official_score` kept apart from `computed_score` |
| FR-18 | PDF/image of corrected papers (P2) | Out of scope | OCR not built (plan 2.3) |

## Extraction and verification

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-19 | Extract each question's answer and score | Done | From the CSV/Excel row |
| FR-20 | Confidence per field when OCR is used | Out of scope | `answers.confidence` exists for the OCR path only |
| FR-21 | Show the original source next to the data | Done | The review table shows each row's line number in the uploaded file and its values as typed |
| FR-22 | The instructor corrects and approves data | Done | Edit, delete, approve, reject. `PATCH /api/imports/{id}/rows/{row_id}` |
| FR-23 | No analysis on unapproved data | Done | Answers exist only after approval (ADR 0001 §1). TC-19 |

## Analysis and diagnosis

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-24 | Compare MCQ answers with the key | Done | `scoring.py`, case- and whitespace-insensitive. TC-10 |
| FR-25 | Link each question to a concept | Done | One primary concept per question (plan Section 12) |
| FR-26 | Performance per concept | Done | Earned ÷ max × 100, with question count. TC-10, TC-23 |
| FR-27 | Suggest an error type when there is evidence | Done | From the error type the instructor tagged on the chosen wrong option (ADR 0001 §2) |
| FR-28 | The five error types | Done | `ErrorType` enum, plus `unknown` |
| FR-29 | Diagnosis shown as a possibility | Done | Labelled "likely cause", with the chosen option as evidence; untagged gives "unknown" (BR-07) |
| FR-30 | Aggregate errors per class | Done | Class analytics. TC-16 |

## Retrieval and recovery

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-31 | Search only approved course materials | Done | Slides come only from approved concept→slide mappings |
| FR-32 | Return file name and page | Done | Every slide reference carries both. TC-11 |
| FR-33 | Show an excerpt or image of the source | Done | Excerpt in reports and plans; page image in the slide viewer |
| FR-34 | Explain why the source was recommended | Partial | The instructor sees the matched words for each suggested slide; students see slides under the concept they explain, with no per-slide reason |
| FR-35 | Never invent a source | Done | No approved slide = no source shown (TC-12); AI citations outside the slides sent are dropped |
| FR-36 | Personal plan ordered by priority | Done | Weak concepts, weakest first. TC-13 |
| FR-37 | Show the concept and recommended slides | Done | Recovery plan screen |
| FR-38 | Explanation based on course materials | Done (P1) | Claude, grounded in approved slides; needs `ANTHROPIC_API_KEY`. TC-18 |
| FR-39 | New practice questions on the concept | Done | Approved question bank, maintained on the question-bank page (add, edit, approve, withdraw, delete). LLM-generated questions not built. `test_question_bank.py` |
| FR-40 | The student marks an activity complete | Done | `POST /api/recovery-tasks/{id}/complete`. TC-14 |
| FR-41 | Create a short retest | Done | 3 retest-only items per weak concept. TC-15 |

## Progress and analytics

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| FR-42 | Store retest attempts | Done | `retests`, `retest_responses` |
| FR-43 | Compare before and after | Done | Per concept, exam vs retest, in percentage points. TC-24 |
| FR-44 | Improvement shown as an indicator, not proof | Done | The results screen says so |
| FR-45 | Dashboard by question and by concept | Done | Class analytics: wrong answers by concept and by question |
| FR-46 | Concepts most involved in errors | Done | Ranked by class error rate, with counts |
| FR-47 | Suggest re-teaching topics with evidence | Done | At or above a 40% class error rate (configurable), with the most common wrong answer and its likely cause |

## Summary

| Status | Count |
|---|---|
| Done | 42 |
| Partial | 2 (FR-08, FR-34) |
| Out of scope | 2 (FR-18, FR-20) |
| Done, P1 | 1 (FR-38) |

All P0 requirements are done. What remains is partial (FR-08 embeddings, FR-34 reasons for students)
or out of scope (OCR); see [Scope-and-Limitations.md](../01-Introduction/Scope-and-Limitations.md).
