# User stories

User stories US-01 to US-12 from plan Section 6, with what a user can do in the built system.
Screens are shown in [../04-Design/UI-Wireframes/](../04-Design/UI-Wireframes/README.md).

| ID | As a | I want | So that | Status | In the app |
|---|---|---|---|---|---|
| US-01 | Instructor | to create a course | I can set up the subject | Done | Home page → **New course**; then the **Students** card → enrol by reference |
| US-02 | Instructor | to upload a lecture PDF | the content becomes searchable | Done | Course page → **Upload PDF or Word** |
| US-03 | Instructor | to define concepts | I can link questions to topics | Done | Course page → **Manage concepts and slides** → **New concept**, then **Find slides** → **Approve** |
| US-04 | Instructor | to create an exam and an answer key | the system knows the correct answers | Done | Course page → **New exam** → add questions with options, key and concept → **Approve answer key** |
| US-05 | Instructor | to upload a CSV | I can enter the students' results | Done | Exam → **Import results** → upload `.csv` or `.xlsx` |
| US-06 | Instructor | to review the data | I can correct import errors | Done | Review table: filter **To fix** / **Warnings**, edit or delete rows, then **Approve results** or **Reject** |
| US-07 | Student | to view my report | I know my weak points | Done | Course → **Open my report** |
| US-08 | Student | to open the recommended slides | I review from the right source | Done | Report or plan → slide link → slide viewer with page image and extracted text |
| US-09 | Student | to solve practice questions | I can train on the concepts | Done | Plan → **Start practice**: instant feedback with a link to the slide that explains it |
| US-10 | Student | to take a retest | I can measure my improvement | Done | Plan → **Take the retest** → before/after per concept |
| US-11 | Instructor | to view class analytics | I know the difficult topics | Done | Course → **Class analytics** |
| US-12 | Admin | to manage permissions | I can protect the data | Seed only | Roles are assigned by the seed; there is no admin screen (out of MVP scope, plan 2.2) |

## Acceptance criteria (plan Section 4.4)

| Criterion | Met | Evidence |
|---|---|---|
| The instructor creates a course and uploads a PDF | Yes | `test_an_instructor_creates_a_course_they_teach`, TC-03 |
| The system stores the text and the page number | Yes | TC-03, `slide_chunks` |
| The instructor creates an exam and an answer key | Yes | `test_build_an_exam_then_import_results` |
| A valid CSV is imported; an invalid one is rejected with a clear message | Yes | TC-05, TC-06 |
| Analysis cannot run on unapproved data | Yes | TC-19 |
| The system calculates performance per concept | Yes | TC-10 |
| The system returns real slides | Yes | TC-11 |
| The student sees the recovery plan and takes the retest | Yes | TC-13, TC-15 |
| The retest result is saved and compared with the original | Yes | TC-15, TC-24 |
| A student cannot open another student's report | Yes | TC-02 |
| The instructor sees class analytics | Yes | TC-16 |
| Official grades are never changed automatically | Yes | TC-22 |
