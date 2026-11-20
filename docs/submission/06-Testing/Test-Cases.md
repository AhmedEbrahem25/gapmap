# Test cases

The 27 test cases from plan Section 14, with their expected result and status. The test that checks
each one is listed in [../../test-results.md](../../test-results.md), which is kept up to date with
each run, so it is not repeated here.

Last run: **20 November 2026, 131 tests passed** (`cd backend && pytest`).

| ID | Scenario | Expected | Status |
|---|---|---|---|
| TC-01 | Instructor valid login | Login succeeds | Pass |
| TC-02 | Student opens another student's report | Access denied | Pass |
| TC-03 | Upload valid PDF | File saved and processed | Pass (also Word) |
| TC-04 | Unsupported file | Clear validation error | Pass (6 file types) |
| TC-05 | Valid CSV | Preview displayed | Pass |
| TC-06 | CSV missing `student_ref` | Import rejected with explanation | Pass |
| TC-07 | Unknown question ID | Invalid row reported | Pass |
| TC-08 | Duplicate student-question row | Duplicate detected | Pass |
| TC-09 | Approve import | Status becomes Approved | Pass |
| TC-10 | Analyze approved MCQ | Scores and concepts calculated | Pass |
| TC-11 | Retrieve concept slide | Real file and page reference | Pass |
| TC-12 | No matching slide | System says there is no suitable source | Pass |
| TC-13 | Generate plan | Plan linked to weak concepts | Pass |
| TC-14 | Complete practice | Completion saved | Pass |
| TC-15 | Submit retest | Result saved | Pass |
| TC-16 | Instructor dashboard | Correct aggregation | Pass (recounted from the raw CSV) |
| TC-17 | OCR low confidence | Human verification required | N/A: OCR out of scope |
| TC-18 | LLM unavailable | Core CSV analysis still works | Pass |
| TC-19 | Analysis on an unapproved import | Blocked with a clear message | Pass |
| TC-20 | Student not enrolled opens a course | Access denied | Pass |
| TC-21 | Answer outside the question's options | Invalid row reported | Pass |
| TC-22 | CSV score differs from the computed score | Mismatch flagged; official score unchanged | Pass |
| TC-23 | Concept with fewer than 2 questions | "Not enough data", not "weak" | Pass |
| TC-24 | Retest after the exam | Learning gain in percentage points | Pass |
| TC-25 | Unapproved AI-generated question | Not served to students | Pass |
| TC-26 | Approval and edit actions | Recorded in the audit log | Pass |
| TC-27 | Coordinator opens a student-level report | Denied; aggregated view only | Pass |

**Result: 26 pass, 1 not applicable.**

## Beyond the plan's list

Besides the TCs, the 131 tests cover:

- Role-based access on courses for every role (7 tests), plus access checks on reports, plans,
  retests, imports, answer keys and the audit log.
- The rules of the demo dataset: at least 2 questions per concept, a valid key and a concept on every
  question, separate approved practice and retest items, approved slide mappings (8 tests).
- Import edge cases: an empty or unknown student, a score out of range or not a number, a blank
  answer (warning), `.xlsx` files, CSVs with a byte-order mark or in the Arabic Windows encoding
  (cp1256), a new import replacing earlier results, and row edits being audited.
- The AI layer: grounded output, citations of unsent pages being dropped, caching and refresh when
  the approved slides change, no call when a concept has no approved slide, failures and empty
  output becoming "unavailable", the fallback on refusal, and a prompt with no student data.
- Concepts and slides: create, rename, duplicate names, deleting a concept in use, keyword suggestions,
  approving and removing slides (and the student report changing with them), a slide from another
  course, and access for every role (10 tests).
- Word upload: page breaks, headings, long sections, and a file with no text.

Word upload with Arabic text was checked by hand in the browser (see test-results.md).
