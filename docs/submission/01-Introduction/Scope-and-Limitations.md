# Scope and limitations

## In scope (built)

- Course creation and enrolment of student accounts by reference.
- One pilot course, *Software Engineering (SE301)*, with three concepts: Agile, Scrum Roles,
  Requirements.
- Lecture upload as **PDF or Word (.docx)**. Each page is stored with its text and a rendered image,
  keeping the original file name and page number.
- A concepts page where the instructor defines concepts and approves the slides for each one, helped
  by keyword suggestions that show which words matched.
- A question bank per concept: the instructor adds, edits, approves, withdraws and deletes practice and
  retest questions.
- An exam builder for **multiple-choice** questions: options, the answer key, one concept per
  question, and an optional error type on each wrong option.
- Results import from **CSV or Excel (.xlsx)** in the long format (`student_ref, question_id, answer,
  score`), with row-level validation, correction, deletion, approval and rejection.
- Per-concept analysis, likely causes, slide links, student reports, recovery plans, practice, retest
  and learning gain.
- Class analytics with re-teaching suggestions, and an audit log.
- Optional grounded explanations written by Claude (P1).
- Four roles: instructor, student, coordinator, admin.

## Out of scope (by plan decision)

Plan Section 2.2 and the priority backlog place these outside the MVP:

- OCR of scanned or handwritten papers (FR-18, FR-20, TC-17).
- Essay grading and question types other than MCQ.
- LMS integration, failure prediction, knowledge tracing, cross-course analytics.
- An admin screen for users and roles. Accounts come from the seed script.
- A native mobile app.

## Limitations of what was built

These are gaps in the as-built system that a reader of the plan might expect. Each is deliberate for
the 10-day build, and listed so nothing is overstated.

| Limitation | Effect | Plan reference |
|---|---|---|
| Student accounts are created by the seed script. Instructors create courses and enrol existing accounts by reference, but nobody can create accounts or reset passwords in the app. | A real pilot needs account provisioning (a roster import or university single sign-on). | US-12, plan Section 3 |
| AI-generated practice questions are not built. The review flow for them is: an AI draft waits for the instructor's approval on the question-bank page. | The seed holds one AI draft to show the flow and prove it isn't served before approval (TC-25). | FR-39, BR-11 |
| No embeddings or semantic search. Slide suggestions use keyword matching; students get only approved slides. | Suggestions miss synonyms and paraphrases, so the instructor may need *Show all pages*. | FR-08, plan 10.4 |
| Word (.docx) is supported instead of PowerPoint (.pptx). | PowerPoint decks must be exported to PDF first. | FR-06 |
| One primary concept per question. | Weighted multi-concept questions are not supported. | Plan Section 12 |
| Schema is created with `create_all`, with no migrations, and the seed wipes the database. | Fine for a demo; a real deployment needs Alembic. | ADR 0001 §3 |
| Docker Compose runs development servers (Vite dev server, `uvicorn --reload`) over plain HTTP. | Not a production deployment. See [Deployment-Guide.md](../07-Deployment/Deployment-Guide.md). | NFR-03 |
| Synthetic students and one exam. | Results show the mechanism, not real-world accuracy. | Plan Section 14 |
| Accuracy (slide-link precision, diagnosis agreement) is not measured. | No accuracy figure is claimed. | Plan Section 14, issue #1 |
| The Claude integration is tested with mocks, not a real API call. | The explanation card's real output is unverified. | TC-18 |
| The audit log shows each action's details as raw JSON. | Readable for a developer, less so for an instructor. | NFR-10 |

Design decisions that narrow the plan are recorded in
[../../decisions/0001-hackathon-decisions.md](../../decisions/0001-hackathon-decisions.md).
