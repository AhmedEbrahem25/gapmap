# Objectives

## Project objectives

| # | Objective | Status |
|---|---|---|
| O1 | Import exam results from CSV or Excel, validate every row, and let the instructor correct and approve them before any analysis | Met |
| O2 | Score each student per concept, and mark a concept as weak only with enough evidence (at least 2 questions) | Met |
| O3 | Suggest a likely cause for each wrong answer, presented as a hypothesis with its evidence | Met |
| O4 | Link each weak concept to real lecture slides (file and page) approved by the instructor, and never invent a source | Met |
| O5 | Give each student a prioritised recovery plan with practice and a retest made of new questions | Met |
| O6 | Report learning gain in percentage points, as an early indicator rather than proof of mastery | Met |
| O7 | Show the instructor which concepts the class struggles with, with evidence, and suggest what to re-teach | Met |
| O8 | Keep the core working with no AI service; use AI only for grounded explanations (P1) | Met. Not yet tested with a real API key |
| O9 | Protect student data: role-based access, no student data sent to the AI, an audit log of approvals and edits | Met |
| O10 | Run the whole demo reproducibly with Docker Compose | Met |
| O11 | Measure accuracy (slide-link precision, diagnosis agreement) against the instructor's judgement | Not started: needs the instructor's reference judgements |

## Success criterion

The plan (Section 24) defines success as *one reliable journey*, from uploading content and results,
through review, analysis and slide retrieval, to the student's plan, the retest and the instructor's
analytics. This journey runs end to end in the browser and in the automated smoke test
(`scripts/smoke_test.py`, 26 steps, run in CI on every pull request).
