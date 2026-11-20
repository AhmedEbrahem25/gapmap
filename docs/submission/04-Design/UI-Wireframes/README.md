# UI screens

Screenshots of the built app (not wireframes), captured on 20 November 2026 from the demo dataset at
1440 px wide. The app uses one layout throughout: a top bar with the user's name and role, a
back link, a page title with one primary action, and content in cards and tables.

UX rules from plan Section 13 and where they show:

| Rule | Where |
|---|---|
| A clear primary action on every screen | Dark-blue button: *Approve results*, *View plan*, *Take the retest* |
| Show the source next to the recommendation | Every slide link shows the file name and page |
| Show the data status | *Pending review* badge on imports; *ready* on lectures; *Needs review* / *On track* on concepts |
| The diagnosis is probabilistic | "Likely cause" with the evidence underneath |
| Error messages say what to fix | Import errors name the line and the valid values |

## Shared

**Login** (`/login`). Email and password, plus one-click demo accounts.

![Login](01-login.png)

## Instructor

**Course page** (`/courses/:id`). Counts, concepts, exams with their actions, lecture files.

![Course page, instructor](02-course-instructor.png)

**Exam builder** (`/exams/:id/edit`). Questions with options, the key (✓) and the error type tagged on
each wrong option.

![Exam builder](04-exam-builder.png)

**Import review** (`/exams/:id/import`). The errors file from the demo: 181 rows, 3 to fix, 1 warning.
Filter, edit or delete rows, then approve or reject.

![Import review](05-import-review.png)

**Student results** (`/exams/:id/results`). One row per student with the concepts that need review.

![Student results](06-exam-results.png)

**Student report** (`/exams/:id/students/:studentId`). STU001: score per concept with question
counts, approved slides per concept, and each question with the likely cause and evidence.

![Student report](07-student-report.png)

**Slide viewer** (`/materials/:id/pages/:page`). The real page image with its file and page number;
the extracted text is below.

![Slide viewer](08-slide-viewer.png)

**Class analytics** (`/courses/:id/analytics`). The re-teaching suggestion with evidence, wrong
answers by concept against the 40% line, and by question with the most common wrong answer.

![Class analytics](13-class-analytics.png)

**Concepts and slides** (`/courses/:id/concepts`). Each concept with its question count and approved
slides, which can be removed.

![Concepts and slides](15-concepts.png)

**Finding slides.** *Find slides* lists the lecture pages that match the concept's words, best first,
with the words that matched. *Show all pages* lists the rest.

![Slide suggestions](16-concept-suggestions.png)

**Audit log** (`/courses/:id/audit`). Approvals and edits, newest first.

![Audit log](14-audit-log.png)

## Student (STU001)

**Course page** (`/courses/:id`). *Open my report* and the lecture files.

![Course page, student](03-course-student.png)

**Recovery plan** (`/plans/:id`). Weak concepts, weakest first, each with slides to mark as reviewed
and a practice task, then the retest. With an API key, an explanation card appears under each
concept. These screenshots were taken without one.

![Recovery plan](09-recovery-plan.png)

**Practice** (`/plans/:id/practice/:conceptId`). Approved practice items with **Check**: right or
wrong, the correct answer and a link to the slide.

![Practice](10-practice.png)

**Retest** (`/retests/:id`). Six new items, three per weak concept, submitted once.

![Retest](11-retest.png)

**Retest results** (`/retests/:id/results`). Exam % against retest % per concept, the change in
percentage points, and the caution that it is an early sign, not proof.

![Retest results](12-retest-results.png)

## Not built

Course creation; the course comes from the seed.
