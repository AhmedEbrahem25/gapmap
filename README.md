# GapMap

Turns an exam result into a diagnosis of each student's weak concepts, links each gap to the exact
lecture slide, and gives targeted practice and a retest. Instructors see which concepts the class
struggles with.

AI Educathon 2026 · Alamein International University · demo on **28 Nov 2026**.
Full plan: [docs/requirements/GapMap_Complete_Project_Plan_EN.md](docs/requirements/GapMap_Complete_Project_Plan_EN.md).
Decisions that refine it: [docs/decisions/](docs/decisions/).

## Quick start (Docker)

```bash
cp .env.example .env          # then set JWT_SECRET
docker compose up --build
docker compose exec backend python -m app.seed
```

- App: http://localhost:5173
- API docs (Swagger): http://localhost:8000/docs. Use **Authorize** with a demo email as the username.

## Quick start (without Docker)

The backend falls back to SQLite when `DATABASE_URL` is not set.

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
python -m app.seed
uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

## Demo data

`python -m app.seed` **wipes the database** and recreates the demo state from plan Section 18:

- Course *Software Engineering (SE301)* with a 12-slide lecture PDF (text and page images extracted)
- 3 concepts: Agile, Scrum Roles, Requirements, each with instructor-approved slide mappings
- *Midterm Quiz 1*: 9 MCQs, 3 per concept, with the answer key and tagged wrong options
- Question bank: 3 practice + 3 retest items per concept (approved), plus 1 pending AI draft
- 20 synthetic students `STU001`–`STU020`, with results imported and approved
  (`data/sample/exam1_results.csv`). STU001 misses Q1, Q2, Q4 and Q5; most of the class misses Scrum Roles.

Use `--no-results` to skip the results import and demo the upload live. Two sample files:

- `data/sample/exam1_results.csv`: clean, 180 rows
- `data/sample/exam1_results_with_errors.csv`: the same results with 3 errors to fix on the review
  screen (an answer outside the options, an unknown question, a duplicate row) and 1 warning
  (an official score that disagrees with the answer key)

| Account | Email |
|---|---|
| Instructor | `instructor@gapmap.test` |
| Student | `stu001@gapmap.test` … `stu020@gapmap.test` |
| Coordinator | `coordinator@gapmap.test` |
| Admin | `admin@gapmap.test` |
| Second instructor (for permission tests) | `instructor2@gapmap.test` |

Every demo account uses the password from `DEMO_PASSWORD` in `.env`.

## AI explanations (optional)

Recovery plans show a short explanation of each weak concept, written by Claude (`claude-opus-5-5`)
from that concept's approved slides only. Set `ANTHROPIC_API_KEY` in `.env` to turn it on. Without
it, plans show the slides and practice as usual and the explanation card is simply hidden.

- Only the concept and slide text are sent, never student data (BR-12).
- Pages the model cites that were not sent are dropped (FR-35).
- One explanation per concept is cached and regenerated when its approved slides change.
- If a safety classifier declines, the request is retried on Anthropic's recommended fallback model
  (`fallbacks: "default"`).

## Tests

```bash
cd backend && pytest
```

The suite covers the plan's test cases (TC-xx in the test names), role-based access, and the demo
dataset's own rules (at least 2 questions per concept, separate practice and retest items,
approved slide mappings).

## Layout

```text
backend/app/
  api/        HTTP routes (one file per module)
  core/       config, database, security, auth dependencies
  models/     SQLAlchemy models (the full plan ERD + import_rows)
  schemas/    Pydantic request/response models
  services/   domain logic: scoring and import validation (pure), analysis, recovery,
              class analytics, imports, exams, PDF and Word ingestion
  seed/       demo dataset, lecture PDF builder, results CSV generator
frontend/src/
  pages/ components/ features/ services/ types/
data/sample/     results CSVs (Long Format, plan 9.6), clean and with errors
data/templates/  empty CSV template for instructors
docs/            plan, decisions
```

After adding endpoints, regenerate the frontend API types while the backend is running:
`cd frontend && npm run gen:api`.

## Build order (vertical slices)

| Slice | Scope | Status |
|---|---|---|
| S0 | Skeleton, login/JWT, roles, seed, Docker Compose | done; Docker Compose not yet run end to end |
| S1 | PDF or Word upload → pages and images → Slide Viewer | done |
| S2 | Exam builder + answer key → CSV/Excel import → validation → correct → approve | done |
| S3 | Analysis → per-concept performance → student report with real slides | done |
| S4 | Recovery plan → practice → retest → learning gain | done |
| S5 | Instructor class analytics with re-teaching suggestions | done |
| S6 | P1: grounded LLM explanation per concept, audit log screen | done; explanations need `ANTHROPIC_API_KEY` |
