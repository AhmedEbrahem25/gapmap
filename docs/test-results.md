# Test results

Plan Section 14 test cases, how each is checked, and the result. Run the suite with
`cd backend && pytest` (121 tests). CI runs it, plus the frontend build, on every pull request.

Last full run: **2026-11-20, 121 passed**.

## Test cases

| TC | Scenario | Checked by | Result |
|---|---|---|---|
| TC-01 | Instructor valid login | `test_auth.py::test_tc01_valid_login_returns_token_and_user` | Pass |
| TC-02 | Student opens another student's report | `test_analysis.py::test_tc02_and_tc27_student_level_reports_are_protected` | Pass |
| TC-03 | Upload valid PDF | `test_materials.py::test_tc03_valid_pdf_is_saved_and_processed`; Word: `test_materials_word.py` | Pass |
| TC-04 | Unsupported file | `test_materials.py::test_tc04_unsupported_file_gets_clear_error` (6 cases) | Pass |
| TC-05 | Valid CSV | `test_exams_imports.py::test_tc05_tc09_sample_csv_imports_and_approves` | Pass |
| TC-06 | CSV missing student_ref | `test_exams_imports.py::test_tc06_missing_column_rejects_the_file`; `test_import_validation.py::test_file_level_errors` | Pass |
| TC-07 | Unknown question ID | `test_import_validation.py::test_tc07_unknown_question_lists_valid_codes`; API: `test_invalid_rows_block_approval_until_corrected` | Pass |
| TC-08 | Duplicate student-question row | `test_import_validation.py::test_tc08_duplicates_are_flagged_after_the_first`; API: same as above | Pass |
| TC-09 | Approve import | `test_exams_imports.py::test_tc05_tc09_sample_csv_imports_and_approves` | Pass |
| TC-10 | Analyze approved MCQ | `test_analysis.py::test_tc10_analysis_scores_stu001_per_concept` | Pass |
| TC-11 | Retrieve concept slide | `test_analysis.py::test_tc11_weak_concepts_link_real_slides` | Pass |
| TC-12 | No matching slide | `test_analysis.py::test_tc12_no_approved_slide_means_no_source_not_an_invented_one` | Pass |
| TC-13 | Generate plan | `test_recovery.py::test_tc13_plan_covers_only_weak_concepts_weakest_first` | Pass |
| TC-14 | Complete practice | `test_recovery.py::test_tc14_completing_a_task_is_saved` | Pass |
| TC-15 | Submit retest | `test_recovery.py::test_tc15_tc24_retest_uses_retest_items_and_reports_gain` | Pass |
| TC-16 | Instructor dashboard | `test_class_analytics.py::test_tc16_scrum_roles_has_highest_error_rate_and_is_suggested`; numbers recounted from the raw CSV in `test_aggregation_matches_the_sample_csv` | Pass |
| TC-17 | OCR low confidence | Not built: OCR is optional in the plan (Section 2.3) and out of this MVP | N/A |
| TC-18 | LLM unavailable | `test_explanations.py::test_tc18_llm_failure_degrades_gracefully` + 4 failure cases on the real client wrapper; checked by hand with no key | Pass |
| TC-19 | Analysis on an unapproved import | `test_analysis.py::test_tc19_analysis_blocked_while_import_pending`, `..._without_approved_results` | Pass |
| TC-20 | Student not enrolled opens a course | `test_courses_rbac.py::test_tc20_student_not_enrolled_is_denied` | Pass |
| TC-21 | Answer outside the options | `test_import_validation.py::test_tc21_answer_outside_options`; API: `test_invalid_rows_block_approval_until_corrected` | Pass |
| TC-22 | CSV score differs from computed | `test_import_validation.py::test_tc22_score_mismatch_is_flagged_and_kept`; API: same as above | Pass |
| TC-23 | Concept with fewer than 2 questions | `test_scoring.py::test_tc23_single_question_concept_is_not_enough_data` | Pass |
| TC-24 | Learning gain after the retest | `test_recovery.py::test_tc15_tc24_...`, `test_gain_is_computed_before_rounding` | Pass |
| TC-25 | Unapproved AI question | `test_recovery.py::test_tc25_practice_serves_approved_items_only_without_keys`; `test_seed_data.py::test_one_pending_ai_question_exists_for_tc25` | Pass |
| TC-26 | Approval and edit actions logged | `test_explanations.py::test_tc26_audit_log_lists_course_actions_newest_first`; `test_exams_imports.py::test_row_edits_are_audited` | Pass |
| TC-27 | Coordinator opens a student-level report | `test_analysis.py::test_tc02_and_tc27_...`; also results list and recovery plans | Pass |

## Business rules with their own tests

| Rule | Checked by |
|---|---|
| BR-01 official grade never changed automatically | `test_tc10_...` (official scores unchanged), `test_tc22_...` |
| BR-02 approved key before evaluation | `test_build_an_exam_then_import_results` |
| BR-03 every question has a concept | `test_every_question_has_a_concept_and_a_valid_key`, `approve_key` checks |
| BR-10 retest items differ from exam and practice | `test_bank_has_separate_approved_practice_and_retest_per_concept`, `test_tc15_...`, `test_retest_items_cannot_be_checked_as_practice` |
| BR-12 no student data sent to the LLM | `test_prompt_contains_no_student_data` |
| FR-35 never invent a source | `test_tc12_...`, `test_explanation_is_grounded_and_never_cites_unsent_pages` |

## Docker Compose with Postgres

The unit tests use SQLite, so the full journey is also run on the real stack.

| What | Result |
|---|---|
| `docker compose up --build`: images build, Postgres healthy, backend and frontend start | Pass (2026-11-18) |
| `python -m app.seed` on Postgres | Pass (2026-11-18) |
| `scripts/smoke_test.py`: 21 steps from importing results with errors to the audit log and a Word upload | Pass (2026-11-18), and in CI on every pull request |
| Frontend container in the browser: login, student report with slides | Pass (2026-11-18) |

## End-to-end checks in the browser

| What | Result |
|---|---|
| Live import demo: upload the errors file, fix 2 rows, delete the duplicate, approve, run analysis | Pass (2026-11-18) |
| Student journey: report, plan, mark reviewed, practice feedback, retest, before/after | Pass (2026-11-18) |
| Instructor: results table, student report, slide links, class analytics, audit log | Pass (2026-11-18) |
| Exam builder: create exam, add tagged question, approve key | Pass (2026-11-18) |
| Word upload with Arabic text, viewed as a student | Pass (2026-11-18) |
| Explanation card with no API key (hidden, plan still complete) | Pass (2026-11-18) |

## Not yet checked

- A real call to the Claude API (no key on the development machine).
- Usability with a real instructor and students (plan Section 14, "Usability").
- AI evaluation metrics from plan Section 14 (slide retrieval precision, diagnosis agreement with the
  instructor): they need the instructor's reference judgements, see issue #1.
