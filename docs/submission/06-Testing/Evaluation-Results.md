# Evaluation results

Plan Section 14 says: *do not claim an accuracy figure that was not measured*. This page reports
what was measured, how, and what was not.

## 1. Functional correctness

| Measure | Result |
|---|---|
| Automated tests | 131 of 131 pass (20 Nov 2026) |
| Plan test cases | 26 of 27 pass; TC-17 (OCR) not applicable |
| Smoke test of the demo journey | 23 of 23 steps pass locally (20 Nov); CI runs it on Docker + PostgreSQL for every pull request |
| Class aggregation | Recounted independently from the raw CSV in `test_aggregation_matches_the_sample_csv`; matches |

## 2. Performance (NFR-09)

Measured on 20 November 2026 against the local development server (uvicorn, SQLite) on a laptop
with an Intel Core i7-8850H, with the demo dataset. Wall-clock time per API call,
measured from a Python client over `127.0.0.1`.

| Operation | Time | Runs (median) |
|---|---|---|
| Upload and validate the 180-row results CSV | 39 ms | 1 |
| Approve the import (creates 20 submissions, 180 answers) | 43 ms | 1 |
| Run the analysis (scores, diagnoses, recovery plans) | 44 ms | 1 |
| Class analytics | 11 ms | 20 |
| Student report | 9 ms | 20 |
| Upload and process a 12-page lecture PDF (text and page images) | 342 ms | 3 |

All are far below anything a user would notice. Lecture processing therefore runs inside the upload
request, without a background job queue (ADR 0001 §3). These figures are for one course and 20
students; they were not measured at larger scale, on PostgreSQL, or with the AI explanation
(which depends on the Claude API's response time; it is cached after the first request per concept).

## 3. Learning gain in the demo

In the demo, STU001 scores 33.3% on Agile and 33.3% on Scrum Roles in the exam. On the retest the
screenshots show 100% and 66.7%: a gain of +66.7 and +33.3 percentage points.

**This is not evidence that GapMap improves learning.** The retest answers were entered to
demonstrate the screen, and the students are synthetic. It shows only that the calculation and
display work as specified (FR-43, FR-44, TC-24).

## 4. AI evaluation: not yet measured

| Metric (plan 14) | Status | What is needed |
|---|---|---|
| OCR character/word error rate | Not applicable | OCR is out of scope |
| Extraction accuracy | Not applicable for CSV | CSV values are read exactly; validation is tested |
| Concept mapping agreement | Not measured | The instructor's own question→concept mapping to compare with (issue #1) |
| Slide retrieval Precision@K | Not measured | A reference set of correct slides per concept from the instructor. Today slides come only from approved mappings, so this would measure the mapping, not a retrieval model |
| Diagnosis agreement | Not measured | The instructor's judgement of the likely cause for a sample of wrong answers |
| Explanation quality | Not measured | A real API key, then instructor review of each concept's explanation |
| Learning gain | Not measured | Real students, equivalent exam and retest items, ideally a comparison group |

### How to measure them after the demo

1. The instructor fills in, for each concept, the slides that explain it and, for 30 or more wrong
   answers, the cause they believe.
2. Compare with GapMap's output: Precision@3 for slides, and agreement (Cohen's κ) for causes.
3. Report the numbers with the sample size, in this file.

## 5. Usability

Not tested with real users yet. The team walked through every screen following the demo script. The
plan (Section 14) asks for an instructor and students to try it; this should happen before any claim
about ease of use.
