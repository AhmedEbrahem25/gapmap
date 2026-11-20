# API design

The authoritative, always-current reference is the generated OpenAPI documentation. When the backend
is running, open **http://localhost:8000/docs** (Swagger UI), click **Authorize**, and use a demo
email as the username. This page gives the conventions and an overview.

## Conventions

| | |
|---|---|
| Base path | `/api` |
| Format | JSON in and out; file uploads are `multipart/form-data` with a `file` field |
| Authentication | `Authorization: Bearer <token>` from `POST /api/auth/login`; tokens expire after 8 hours |
| IDs | UUIDs |
| Errors | `{"detail": "<message>"}`. The message is written for the user and says what to fix |
| Contract | The frontend's types are generated from this API's OpenAPI schema (`npm run gen:api`) |

| Status | Used for |
|---|---|
| 400 | A file that can't be read, the wrong type or too large; a results file missing a column |
| 401 | Missing, invalid or expired token |
| 403 | Logged in but not allowed (wrong role, another student's data, not your course) |
| 404 | Not found, or not in a course you can see |
| 409 | Not allowed in the current state (analysis before approval, import before the key is approved, retest submitted twice) |
| 422 | Request body fails validation (for example a question with one option) |

## Example: log in

```http
POST /api/auth/login
Content-Type: application/json

{"email": "instructor@gapmap.test", "password": "<DEMO_PASSWORD>"}
```

```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "bearer",
  "user": {"id": "…", "name": "Dr. Mona Adel", "email": "instructor@gapmap.test",
           "role": "instructor", "student_ref": null}
}
```

## Example: import results

```bash
curl -X POST http://localhost:8000/api/exams/$EXAM_ID/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data/sample/exam1_results_with_errors.csv"
```

The response is the import with every row, its `errors` (which block approval) and `warnings` (which
don't). Fix rows with `PATCH /api/imports/{id}/rows/{row_id}`, then `POST /api/imports/{id}/approve`.

## Endpoints

**Who:** I = instructor of the course (and admin) · S = the student themselves · E = anyone enrolled
in or able to see the course · C = coordinator.

### Auth

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Anyone | Log in with email and password (JSON) |
| POST | `/auth/token` | Anyone | The same as a form, for Swagger's **Authorize** |
| GET | `/me` | Logged in | The current user |
| GET | `/health` | Anyone | Liveness check, used by CI to wait for the API |

### Courses and materials

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/courses` | Logged in | My courses: taught, enrolled, or all for coordinator and admin |
| GET | `/courses/{id}` | E | Course detail with concepts and counts |
| GET | `/courses/{id}/materials` | E | Lecture files and their status |
| POST | `/courses/{id}/materials` | I | Upload a `.pdf` or `.docx` (25 MB); pages are processed in the request |
| GET | `/materials/{id}/status` | E | Processing status and page count |
| GET | `/materials/{id}/pages/{page}` | E | Page text and title for the slide viewer |
| GET | `/materials/{id}/pages/{page}/image` | E | Rendered page image (PNG) |

### Concepts and slides

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/courses/{id}/concepts` | I | Concepts with approved slides and question counts |
| POST | `/courses/{id}/concepts` | I | Create a concept (name unique in the course, case-insensitive) |
| PUT | `/concepts/{id}` | I | Rename or re-describe a concept |
| DELETE | `/concepts/{id}` | I | Delete an unused concept (409 if questions, the bank or plans use it) |
| GET | `/concepts/{id}/slide-suggestions` | I | Every course page not yet approved for it, best keyword match first, with `score` and `matched_terms` |
| PUT | `/concepts/{id}/slides/{slide_chunk_id}` | I | Approve a slide for the concept |
| DELETE | `/concepts/{id}/slides/{slide_chunk_id}` | I | Remove an approved slide |

### Exams and imports

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/courses/{id}/exams` | E | Exams in the course |
| POST | `/courses/{id}/exams` | I | Create an exam (draft) |
| GET | `/exams/{id}` | I | Exam with questions, options, keys and tags |
| POST | `/exams/{id}/questions` | I | Add a question: code, prompt, options with optional `error_type`, key, `max_score`, `concept_id` |
| PUT | `/questions/{id}` | I | Edit a question (draft only) |
| DELETE | `/questions/{id}` | I | Delete a question (draft only) |
| POST | `/exams/{id}/approve-key` | I | Lock the answer key (BR-02, BR-03) |
| POST | `/exams/{id}/reopen` | I | Back to draft, while no results are approved |
| GET | `/exams/{id}/imports` | I | Import history |
| POST | `/exams/{id}/imports` | I | Upload a `.csv` or `.xlsx` results file; validates every row |
| GET | `/imports/{id}` | I | Import with rows, errors and warnings |
| PATCH | `/imports/{id}/rows/{row_id}` | I | Correct a row; it is re-validated and audited |
| DELETE | `/imports/{id}/rows/{row_id}` | I | Delete a row (for example a duplicate) |
| POST | `/imports/{id}/approve` | I | Approve: create submissions and answers |
| POST | `/imports/{id}/reject` | I | Reject the import |

### Analysis and reports

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/exams/{id}/analyze` | I | Score, diagnose and create recovery plans (409 without approved results) |
| GET | `/exams/{id}/results` | I | One row per student: score and weak concepts |
| GET | `/exams/{id}/students/{student_id}/report` | I | A student's full report |
| GET | `/students/me/reports` | S | My reports |
| GET | `/students/me/reports/{exam_id}` | S | My report for one exam |
| GET | `/courses/{id}/analytics` | I, C | Class analytics and re-teaching suggestions (students denied) |
| GET | `/courses/{id}/audit-log` | I | Approvals and edits, newest first |

### Recovery, practice and retest

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/recovery-plans/{id}` | S, I | The plan: concepts, slides, tasks |
| POST | `/recovery-tasks/{id}/complete` | S | Mark a task complete |
| GET | `/concepts/{id}/explanation` | E | AI explanation, or `status: "unavailable"` (always 200) |
| GET | `/concepts/{id}/practice` | E | Approved practice items, without keys |
| POST | `/practice/{bank_question_id}/check` | E | Check one practice answer; returns the correct answer and its source slide |
| POST | `/retests` | S | Start (or resume) the retest for a plan |
| GET | `/retests/{id}` | S | The retest's questions |
| POST | `/retests/{id}/submit` | S | Submit answers once |
| GET | `/retests/{id}/results` | S, I | Before/after per concept |

## Differences from the plan's contract (Section 9.5)

| Plan endpoint | As built |
|---|---|
| `POST /courses` | Not built: courses are seeded |
| `GET/POST /courses/{id}/concepts`, `POST /concepts/{id}/slides` | Built as the concepts endpoints above; a slide is approved with `PUT /concepts/{id}/slides/{slide_chunk_id}` |
| `PUT /questions/{id}/answer-key` | The key is part of the question (`POST`/`PUT /questions`) and locked with `POST /exams/{id}/approve-key` |
| `GET/POST /concepts/{id}/bank-questions` | Not built: the bank is seeded |
| — | Added: slide suggestions, concept edit and delete, exam detail, question edit/delete, reopen, import history, row delete, exam results, instructor view of a student report, page image, practice check, retest detail, explanation |
