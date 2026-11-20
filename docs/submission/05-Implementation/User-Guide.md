# User guide

How to use GapMap, by role. Screenshots of every screen are in
[../04-Design/UI-Wireframes/](../04-Design/UI-Wireframes/README.md).

## Instructor

### 1. Upload a lecture

Course page → **Upload PDF or Word**. Use a `.pdf` or `.docx` up to 25 MB; export PowerPoint decks
to PDF first. Each page is stored with its text and an image. The file shows **ready** when done.
Click **View slides** to check the pages.

### 2. Build the exam and answer key

Course page → **New exam** → give it a title and date. For each question:

- a code (`Q1`); this is what the results file uses
- the question text and 2 to 8 options, with the correct one marked
- the **concept** it assesses
- optionally, for each wrong option, the **error type** it usually reveals (conceptual
  misunderstanding, formula/application, calculation, missing prerequisite, incomplete answer).
  Students who pick it get that as the *likely cause*; untagged options give "unknown".

Click **Approve answer key** when done. Questions are locked; **Reopen for editing** unlocks them while no results
are approved. Each concept needs at least 2 questions to be judged.

### 3. Import results

Exam → **Import results** → **Upload CSV or Excel**. Use the long format, one row per student and
question:

```csv
student_ref,question_id,answer,score
STU001,Q1,A,0
STU001,Q2,A,0
```

`score` is optional. When present, it is kept as the official score and never changed. **Download
template** gives an empty file.

GapMap checks every row and shows the counts. Then:

- **To fix**: rows that block approval. Click **Edit** to correct the student, question, answer or
  score, or **Delete** a duplicate. Each message names the problem and the valid values.
- **Warnings**: for example a score that disagrees with the answer key. They are shown, kept, and
  don't block approval.
- **Approve results** when nothing is left to fix, or **Reject** to discard the import.

### 4. Run the analysis

Course page → **Run analysis** (or **Re-run analysis** after new results) → **View results**.

### 5. Read the results

- **Student results**: every student's score and the concepts they need to review. Open a row for
  the full report: per-concept scores with question counts, the slides for each weak concept, and
  every question with the student's answer and the likely cause.
- **Class analytics**: concepts suggested for re-teaching, with the error rate, how many students are
  below the threshold, and the most common wrong answer. Below that are rates by concept and by
  question, always with counts.
- **Audit log**: every approval, edit, upload and analysis run, newest first.

## Student

1. **Course page → Open my report.** Your score, each concept marked *Needs review*, *On track* or
   *Not enough data*, and every question with your answer, the correct one and a likely cause. A
   likely cause is a suggestion, not a verdict.
2. **Open my plan.** Your weak concepts, weakest first. For each one:
   - read the explanation, if your course has AI explanations on (its cited pages are links)
   - open each slide and click **Mark as reviewed**
   - **Start practice**: answer, click **Check**, and see the correct answer and the slide that
     explains it. Click **Done practising** at the end.
3. **Take the retest** when you are ready: new questions on the same concepts, submitted once.
4. **Retest results**: your exam % and retest % for each concept and the change in points. Different
   questions can differ in difficulty, so treat it as an early sign of progress.

## Coordinator

Sees every course and its class analytics. Individual student reports and plans are not available to
this role.

## Demo accounts

| Role | Email |
|---|---|
| Instructor | `instructor@gapmap.test` |
| Student | `stu001@gapmap.test` … `stu020@gapmap.test` |
| Coordinator | `coordinator@gapmap.test` |
| Admin | `admin@gapmap.test` |

Password: `DEMO_PASSWORD` from `.env`.
