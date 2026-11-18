# 0001 — S0 decisions that refine the plan

Date: 2026-11-18. Status: accepted for the MVP; revisit after the demo.

The plan (`docs/requirements/GapMap_Complete_Project_Plan_EN.md`) is the source of truth. These are
the places S0 fills a gap or simplifies it, with the reason.

## 1. `IMPORT_ROW` staging table (fills a gap)

The API has `PATCH /imports/{id}/rows/{row_id}` (FR-22), but the ERD has no table for rows under
review. We added `import_rows`: the raw CSV row, its validation errors and its status.

`submissions` and `answers` are created **only when the batch is approved**. Analysis reads only
`answers`, so it can never see unapproved data (FR-23, TC-19) without any extra check.

## 2. Error type comes from tagged wrong options (makes FR-27 concrete)

A wrong MCQ choice does not reveal its cause on its own. Each option in `questions.options` can carry
an `error_type` set by the instructor when building the exam:

```json
{"key": "A", "text": "The Scrum Master", "error_type": "conceptual"}
```

If a student picks a tagged wrong option, analysis suggests that type as a *likely* cause, with the
option as evidence. Untagged options give `unknown` (BR-07). No LLM is needed, so it works with the
LLM off (NFR-05).

## 3. Simplifications for the 10-day schedule

| Plan says | S0 does | Why / when to revisit |
|---|---|---|
| Alembic migrations | `Base.metadata.create_all` + `python -m app.seed` reset | Schema changes daily; nobody has production data. Add Alembic only if it is needed after the demo. |
| pgvector + embeddings | No embedding column yet; the Postgres image already includes pgvector | Slides come from the approved Concept→Slide mapping (plan 7.6). Keyword search is enough to *suggest* slides. Embeddings are P1. |
| Background jobs for materials | PDF processing runs inside the upload request | A lecture PDF takes about a second with PyMuPDF. |
| Coordinator sees "authorized" courses | Coordinator sees all courses at course level | No coordinator↔course table yet. Student-level endpoints must still deny coordinators (TC-27). |
| — | Tests use in-memory SQLite | Fast and needs no Docker. Models stay portable (string enums, `Uuid`, `JSON`). |

## 4. Seed creates an approved results import

`python -m app.seed` loads `data/sample/exam1_results.csv` as an already-approved import, so the
analysis and report slices (S3+) can start before the import UI (S2) exists. For the live demo of the
import flow, run `python -m app.seed --no-results` and upload the same CSV through the UI.

## 5. AI explanations (S6, P1)

- One explanation per concept, not per student. It is grounded in the approved slides, which are
  the same for every student, and a per-concept cache keeps cost and wait time near zero after the
  first request. It also keeps student data out of the prompt by construction (BR-12).
- Structured output (`explanation`, `key_points`, `cited_pages`) so citations can be checked:
  any cited page that was not sent is dropped (FR-35).
- The plan page loads first and the explanation loads after it. Any failure (no key, network,
  refusal, malformed output) returns `status: "unavailable"` and the card is hidden (NFR-05, TC-18).
- `ConceptExplanation` and `audit_logs.course_id` are new: run `python -m app.seed` on local databases.
