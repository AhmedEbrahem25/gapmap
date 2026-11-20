# Abstract

After an exam, a student usually gets a grade and perhaps a corrected paper. The grade does not say
which concept was misunderstood, why, or which part of the lectures to review. The instructor, for
their part, cannot analyse every student's mistakes by hand to find out what the class needs
re-taught.

GapMap turns an exam result into a learning recovery plan. The instructor uploads the lecture
slides, defines the course's concepts and approves the slides that explain each one, builds the
exam with an answer key and tags each question with the concept it assesses, then imports the
students' answers from a CSV or Excel file. Every row is validated, and nothing is used
until the instructor approves it. GapMap then scores each student per concept, suggests a likely
cause for each wrong answer from the option the student picked, and links each weak concept to the
exact lecture slide (file and page) the instructor approved for it. Each student gets a plan ordered
by priority, practice questions from an approved bank and a short retest with new questions; the
result is shown as a before/after change in percentage points. The instructor gets class analytics
that flag the concepts most of the class missed, with the evidence.

The core analysis is deterministic and works with no AI service. An optional AI layer (Claude) writes
a short explanation of each weak concept from that concept's approved slides only, receives no
student data, and cannot cite a page it was not given.

The system was built as a modular monolith (React, FastAPI, PostgreSQL) for the AI Educathon 2026 at
Alamein International University. It is covered by 131 automated tests: 26 of the plan's 27 test
cases pass, and the remaining one (OCR) is out of scope. A smoke test of the whole demo journey runs
on Docker Compose for every pull request. It has been demonstrated on one pilot course (Software
Engineering) with 20 synthetic students. Accuracy against the instructor's own judgement has not been
measured yet.
