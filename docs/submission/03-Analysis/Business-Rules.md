# Business rules

BR-01 to BR-12 from plan Section 4.3, with where each is enforced and the test that checks it.

| ID | Rule | Enforced by | Test |
|---|---|---|---|
| BR-01 | An official grade changes only with the instructor's approval | The file's `score` is stored as `official_score`; GapMap's own result goes in `computed_score`. Analysis never writes `official_score`, and a disagreement is a warning, not a change | `test_tc10_…` (official scores unchanged), `test_tc22_score_mismatch_is_flagged_and_kept` |
| BR-02 | An approved answer key must exist before evaluation | Importing results is refused while the exam is still a draft ("Approve the answer key before importing results."); approving the key checks that every question has a valid key and a concept | `test_build_an_exam_then_import_results` |
| BR-03 | Every question is linked to at least one concept | `concept_id` is required when adding a question; key approval re-checks it | `test_every_question_has_a_concept_and_a_valid_key` |
| BR-04 | Every slide recommendation has a real reference | A slide reference is built only from a stored `slide_chunks` row with its file name and page | TC-11 |
| BR-05 | A student does not see anyone else's data | Student endpoints use the logged-in user; instructor endpoints check course ownership | TC-02, TC-20, TC-27 |
| BR-06 | Low-confidence OCR is pending verification | Out of scope (no OCR). Every import is pending until approved | N/A |
| BR-07 | The cause of an error is a hypothesis; "unknown" is allowed | Shown as "likely cause" with evidence; an untagged wrong option gives `unknown` | `test_likely_cause_untagged_is_unknown`, `test_wrong_answers_get_an_evidence_backed_likely_cause` |
| BR-08 | Retest questions are new and target the same concept | Retest items come from the bank's `retest` items for the plan's weak concepts | TC-15 |
| BR-09 | No training of external models on student data without authorization | No student data is sent to any external service (see BR-12) | `test_prompt_contains_no_student_data` |
| BR-10 | Retest items differ from exam and practice questions | Bank items have one `usage`, practice or retest; exam questions are a separate table. A retest item can't be checked as practice | `test_bank_has_separate_approved_practice_and_retest_per_concept`, `test_retest_items_cannot_be_checked_as_practice` |
| BR-11 | AI-generated questions are flagged and reviewed; only approved ones are served | `bank_questions.origin` and `review_status`; practice and retest select `approved` only | TC-25, `test_one_pending_ai_question_exists_for_tc25` |
| BR-12 | Data sent to an LLM contains no student names, emails or references | The prompt is built from the concept and its approved slides only; explanations are per concept, not per student, so no student data can enter the prompt | `test_prompt_contains_no_student_data` |

## Calculation rules (plan Section 12)

| Rule | Value in the built system | Setting |
|---|---|---|
| MCQ correctness | Case- and whitespace-insensitive match with the key | `services/scoring.py` |
| Concept performance | Earned points ÷ max points on the concept × 100 | |
| Weak concept | Below 60%, on at least 2 questions; otherwise "not enough data" | `WEAK_THRESHOLD_PERCENT`, `MIN_QUESTIONS_PER_CONCEPT` |
| Class error rate | Incorrect answers ÷ all answers on the concept × 100, always shown with the counts | |
| Re-teaching suggestion | Class error rate of 40% or more | `RETEACH_ERROR_RATE_PERCENT` |
| Learning gain | Retest % − exam % on the same concept, in percentage points, computed before rounding | |

The thresholds are provisional, as the plan says, and should be tuned with the instructor on real
pilot data. All are settings in `backend/app/core/config.py` and can be overridden from `.env`.
