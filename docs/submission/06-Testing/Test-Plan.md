# Test plan

## Objectives

1. Prove the one end-to-end journey works (plan Section 24).
2. Cover every test case in plan Section 14 with an automated test, or say why not.
3. Prove the rules that protect students and grades: access control, no unapproved data in analysis,
   official scores never changed, no student data sent to the AI, no invented sources.

## Levels

| Level (plan 14) | What | How | Where |
|---|---|---|---|
| Unit | Import validation, scoring, concept performance, likely cause | pytest on pure functions, no database | `test_import_validation.py`, `test_scoring.py` |
| Integration | API + database + file upload | pytest with FastAPI's test client and in-memory SQLite, seeded per test | `test_materials*.py`, `test_exams_imports.py`, `test_analysis.py`, `test_recovery.py`, `test_class_analytics.py`, `test_explanations.py` |
| Permissions | Student isolation, course access, coordinator limits | pytest, one test per role and endpoint group | `test_courses_rbac.py`, TC-02, TC-20, TC-27 |
| Data | The demo dataset obeys the plan's rules | pytest on the seed | `test_seed_data.py` |
| System | The whole demo journey on the real stack | `scripts/smoke_test.py`, 25 steps, against Docker Compose with PostgreSQL | CI job `e2e` |
| Manual end to end | The journeys through the UI | A person follows [../../demo-script.md](../../demo-script.md) | Results in [../../test-results.md](../../test-results.md) |
| Usability | An instructor and students try it | Not done yet | — |
| AI evaluation | Slide retrieval precision, diagnosis agreement | Not done yet: needs the instructor's reference judgements (issue #1) | — |

The Claude API is never called in tests. The client is replaced by fakes that return good output,
cite pages that were not sent, refuse, time out or return malformed output.

## Tools

pytest (backend), FastAPI `TestClient`, httpx (smoke test), GitHub Actions (CI), the TypeScript
compiler and the Vite build as the frontend's type check. There are no frontend unit tests;
frontend behaviour is covered by the smoke test of the API it uses and by the manual browser checks.

## Environments

| Environment | Database | Used for |
|---|---|---|
| Developer machine | SQLite in memory | `pytest` |
| GitHub Actions `backend` | SQLite in memory | `pytest` on every push and pull request |
| GitHub Actions `frontend` | — | `npm ci && npm run build` (type check and bundle) |
| GitHub Actions `e2e` | PostgreSQL 16 in Docker Compose | Seed, smoke test, and a check that the frontend is served |

## Entry and exit criteria

- **Before merging a pull request:** all three CI jobs pass.
- **Feature freeze (end of 26 Nov):** every P0 test case passes; the demo script has been run end to
  end in the browser on the Docker stack.
- **Release candidate (27 Nov):** a clean reseed, the smoke test and one full rehearsal pass on the
  demo machine.

## Definition of done (plan Section 21)

Each slice was merged only when it had a test for the main case and a failure case, permissions had
been reviewed, the frontend was connected, it had been tried in the full workflow, and the README
was updated. Slice-by-slice history: the merged pull requests on GitHub (S0 to S7).
