# Demo script (4-5 minutes)

Follows the storyboard in plan Section 18. Every step below was run end to end on the demo data.

## Before you present

```bash
docker compose up -d
docker compose exec backend python -m app.seed --no-results
```

`--no-results` resets everything and leaves the results to be imported live. Then:

- **Window 1 (instructor):** http://localhost:5173, log in as `instructor@gapmap.test`.
- **Window 2 (student, private window):** http://localhost:5173, log in as `stu001@gapmap.test`.
- Password for both: `DEMO_PASSWORD` from `.env`.
- Have `data/sample/exam1_results_with_errors.csv` ready to upload.
- AI explanations need `ANTHROPIC_API_KEY` in `.env`. Open STU001's plan once before presenting
  so the explanations are cached and appear instantly. Without a key the card stays hidden and
  everything else works.

## The run

| # | Say | Do (window) |
|---|---|---|
| 1 | "A student gets a grade but doesn't know what to review." | Show the course page. (1) |
| 2 | "The instructor uploads the exam results." | Exams → **Import results** → upload `exam1_results_with_errors.csv`. (1) |
| 3 | "Nothing is official until it's checked." | It shows **3 to fix, 1 with warnings**. Open **To fix**: line 30, answer `E` is not an option → Edit to `B`, score `1`, Save. Line 62, unknown question `Q10` → Edit to `Q7`, Save. Line 86, duplicate → Delete. Open **Warnings**: the official score is kept, never overwritten. **Approve results**. (1) |
| 4 | "Now each student's gaps, and the class's." | **Run the analysis from the course page** → **Run analysis** → **View results**. STU001 needs review in Agile and Scrum Roles. Open STU001: 33% on both, with likely causes and evidence. (1) |
| 5 | "Every gap links to the real slide." | In STU001's report, under Scrum Roles, open **The Scrum Master**: the real file and page 7. (1) |
| 6 | "The student gets a plan, not just a grade." | Course → **Open my report** → **Open my plan**. Show the explanation (cited pages), **Mark as reviewed** on one slide, **Start practice**, answer one question wrong to show the feedback and source link. (2) |
| 7 | "Then a short retest with new questions." | Back to plan → **Take the retest** → answer → **Submit**. Show before/after per concept in percentage points and the note that it is an early sign, not proof. (2) |
| 8 | "The instructor sees what to re-teach." | Course → **Class analytics**: Scrum Roles is flagged with evidence (73% of 60 answers wrong, 17 of 20 students, most common wrong answer and its likely cause). (1) |
| 9 | "GapMap turns the exam from the end of assessment into the start of better learning." | |

## If something goes wrong

- **Reset in 5 seconds:** `docker compose exec backend python -m app.seed --no-results`, then log in again.
- **Skip the live import:** `docker compose exec backend python -m app.seed` loads the results
  already approved; start at step 4.
- **No network or no API key:** explanations are hidden; say that the plan works without the AI
  and the explanation is an extra (NFR-05).
- **Docker problem:** run without Docker (README, "Quick start (without Docker)").
- **Last resort:** play the recorded backup video.
