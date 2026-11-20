# Use cases

## Actors

| Actor | Type | Description |
|---|---|---|
| Instructor | Primary | Owns a course: uploads lectures, builds exams, imports and approves results, reads reports and analytics |
| Student | Primary | Enrolled in a course: reads their own report, follows the recovery plan, practises, takes the retest |
| Coordinator | Primary | Reads course-level information; no access to individual students |
| Admin | Primary | Instructor rights on every course |
| Claude API | Secondary, optional | Writes a grounded explanation of a concept from its approved slides |

## Use case diagram (as built)

```mermaid
flowchart LR
  I([Instructor])
  S([Student])
  C([Coordinator])
  L([Claude API])
  subgraph GapMap
    UC1[UC-01 Log in]
    UC2[UC-02 Upload lecture]
    UC3[UC-03 Build exam and answer key]
    UC4[UC-04 Import and verify results]
    UC5[UC-05 Run analysis]
    UC6[UC-06 View student report]
    UC7[UC-07 Follow recovery plan]
    UC8[UC-08 Practise]
    UC9[UC-09 Take retest]
    UC10[UC-10 View class analytics]
    UC11[UC-11 View audit log]
    UC12[UC-12 Open slide]
  end
  I --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC10 & UC11 & UC12
  S --- UC1 & UC6 & UC7 & UC8 & UC9 & UC12
  C --- UC1
  UC7 -. explanation .- L
```

Course creation, concept definition and slide-mapping approval are not use cases of the built app;
the seed script performs them (see [Scope-and-Limitations](../01-Introduction/Scope-and-Limitations.md)).

## UC-04 Import and verify results

| | |
|---|---|
| Actor | Instructor |
| Precondition | The exam's answer key is approved |
| Trigger | The instructor has the results file |
| Main flow | 1. Opens the exam → **Import results**. 2. Uploads a `.csv` or `.xlsx` file. 3. GapMap validates every row and shows the counts: rows, students, to fix, warnings. 4. The instructor filters **To fix**, edits or deletes each invalid row. 5. Reviews **Warnings** (kept, not blocking). 6. Clicks **Approve results**. 7. GapMap creates the submissions and answers and logs the approval |
| Alternative 3a | A required column is missing or the file type is wrong: the whole file is rejected with a message that names the problem (TC-06, TC-04) |
| Alternative 6a | Rows with errors remain: **Approve** is disabled until they are fixed or deleted |
| Alternative 6b | The instructor clicks **Reject**: nothing is imported |
| Postcondition | Approved answers exist; the exam is ready for analysis. Official scores are stored unchanged (BR-01) |

## UC-05 Run analysis

| | |
|---|---|
| Actor | Instructor |
| Precondition | Results are approved |
| Main flow | 1. Clicks **Run analysis** on the course page. 2. GapMap scores every answer against the key, computes each student's performance per concept, records a likely cause for each wrong answer, and creates a recovery plan for every student with a weak concept. 3. Shows the student results table |
| Alternative 1a | No approved results: analysis is refused with a message (TC-19) |
| Postcondition | Reports and plans are available to students. A re-run rebuilds diagnoses and plans, except a plan whose student has already taken a retest, which is kept |

## UC-06 View student report

| | |
|---|---|
| Actors | Instructor (any student in their course), student (their own) |
| Main flow | 1. Opens the report. 2. Sees the score, each concept's percentage, question count and status (needs review / on track / not enough data), the approved slides for each weak concept, and every question with the student's answer, the correct answer and the likely cause with its evidence |
| Alternative | A concept with no approved slide shows no source rather than an invented one (TC-12) |
| Exception | A student opening another student's report, or a coordinator opening any report, is denied (TC-02, TC-27) |

## UC-07 Follow recovery plan

| | |
|---|---|
| Actor | Student |
| Precondition | The student has at least one weak concept |
| Main flow | 1. Opens **My plan**. 2. Sees the weak concepts, weakest first, each with its slides and a practice task. 3. If AI is on, reads a short explanation that cites slide pages. 4. Opens a slide and marks it as reviewed. 5. Goes on to practice (UC-08) or the retest (UC-09) |
| Alternative 3a | AI is off or fails: the explanation card is hidden; the rest of the plan is unchanged (TC-18) |

## UC-08 Practise

| | |
|---|---|
| Actor | Student |
| Main flow | 1. Opens practice for a concept. 2. Answers an approved practice item and clicks **Check**. 3. Sees whether it was right, the correct answer, and a link to the slide that explains it. 4. Clicks **Done practising**: the task is marked complete (TC-14) |
| Rule | Only approved practice items are served, without their answer keys (TC-25) |

## UC-09 Take retest

| | |
|---|---|
| Actor | Student |
| Main flow | 1. Clicks **Take the retest**. 2. Answers 3 new items per weak concept, drawn from retest-only items (BR-10). 3. Submits once. 4. Sees each concept's exam % and retest %, the change in percentage points, and a note that this is an early sign, not proof |
| Alternative 1a | A started retest is resumed with the same questions after a page refresh |

## UC-10 View class analytics

| | |
|---|---|
| Actor | Instructor |
| Main flow | 1. Opens **Class analytics**. 2. Sees concepts suggested for re-teaching, with the error rate, the number of students below the threshold, and the most common wrong answer with its likely cause. 3. Sees wrong-answer rates by concept and by question, always with counts |
