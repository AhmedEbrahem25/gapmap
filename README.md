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

Use `--no-results` to skip the results import and demo the CSV upload live.

| Account | Email |
|---|---|
| Instructor | `instructor@gapmap.test` |
| Student | `stu001@gapmap.test` … `stu020@gapmap.test` |
| Coordinator | `coordinator@gapmap.test` |
| Admin | `admin@gapmap.test` |
| Second instructor (for permission tests) | `instructor2@gapmap.test` |

Every demo account uses the password from `DEMO_PASSWORD` in `.env`.

## Tests

```bash
cd backend && pytest
```

The suite covers login, role-based access (TC-01, TC-20) and the demo dataset's own rules
(at least 2 questions per concept, separate practice and retest items, approved slide mappings).

## Layout

```text
backend/app/
  api/        HTTP routes (one file per module)
  core/       config, database, security, auth dependencies
  models/     SQLAlchemy models (the full plan ERD + import_rows)
  schemas/    Pydantic request/response models
  services/   domain logic (pdf_ingest.py; analysis, recovery and others to come)
  seed/       demo dataset, lecture PDF builder, results CSV generator
frontend/src/
  pages/ components/ features/ services/ types/
data/sample/     exam1_results.csv (Long Format, plan 9.6)
data/templates/  empty CSV template for instructors
docs/            plan, decisions
```

After adding endpoints, regenerate the frontend API types while the backend is running:
`cd frontend && npm run gen:api`.

## Build order (vertical slices)

| Slice | Scope | Status |
|---|---|---|
| S0 | Skeleton, login/JWT, roles, seed, Docker Compose | done |
| S1 | PDF upload → pages and images → Slide Viewer | `services/pdf_ingest.py` ready; needs the endpoint and UI |
| S2 | Exam + answer key → CSV import → validation → preview/correct → approve | |
| S3 | Analysis → per-concept performance → student report with real slides | can start now on seed data |
| S4 | Recovery plan → practice → retest → learning gain | |
| S5 | Instructor class analytics | |
| S6 | P1: grounded LLM explanation, audit log screen | |
