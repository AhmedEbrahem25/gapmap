# Entity-relationship diagram (as built)

Generated from `backend/app/models/`. 22 tables. Every `id` is a UUID. Enums are stored as plain
strings so the same schema runs on PostgreSQL and SQLite.

```mermaid
erDiagram
  users ||--o{ courses : "teaches"
  users ||--o{ course_enrollments : "enrolled as"
  courses ||--o{ course_enrollments : ""
  courses ||--o{ materials : ""
  materials ||--o{ slide_chunks : "one per page"
  courses ||--o{ concepts : ""
  concepts ||--o{ concept_slide_chunks : ""
  slide_chunks ||--o{ concept_slide_chunks : ""
  courses ||--o{ exams : ""
  exams ||--o{ questions : ""
  questions ||--o{ question_concepts : ""
  concepts ||--o{ question_concepts : ""
  exams ||--o{ import_batches : ""
  import_batches ||--o{ import_rows : "staged rows"
  exams ||--o{ submissions : ""
  users ||--o{ submissions : "student"
  import_batches |o--o{ submissions : "approved into"
  submissions ||--o{ answers : ""
  questions ||--o{ answers : ""
  answers ||--o| diagnoses : "likely cause"
  concepts ||--o{ bank_questions : ""
  slide_chunks |o--o{ bank_questions : "source"
  users ||--o{ recovery_plans : "student"
  exams ||--o{ recovery_plans : ""
  recovery_plans ||--o{ recovery_tasks : ""
  concepts ||--o{ recovery_tasks : ""
  slide_chunks |o--o{ recovery_tasks : "slide to review"
  recovery_plans ||--o{ retests : ""
  retests ||--o{ retest_responses : ""
  bank_questions ||--o{ retest_responses : ""
  concepts ||--o| concept_explanations : "cached"
  users |o--o{ audit_logs : "actor"

  users {
    uuid id PK
    string name
    string email UK
    string password_hash
    string role "admin|instructor|student|coordinator"
    string student_ref UK "pseudonymous, students only"
  }
  courses {
    uuid id PK
    uuid instructor_id FK
    string title
    string code
    string term
  }
  course_enrollments {
    uuid course_id PK,FK
    uuid student_id PK,FK
  }
  materials {
    uuid id PK
    uuid course_id FK
    string filename "shown to students"
    string stored_path
    string file_type
    string status "uploaded|processing|ready|failed"
    int page_count
  }
  slide_chunks {
    uuid id PK
    uuid material_id FK
    int page_number "unique per material"
    string title
    text content
    string image_path
  }
  concepts {
    uuid id PK
    uuid course_id FK
    string name
    text description
  }
  concept_slide_chunks {
    uuid concept_id PK,FK
    uuid slide_chunk_id PK,FK
    string mapping_status "suggested|approved"
  }
  exams {
    uuid id PK
    uuid course_id FK
    string title
    date exam_date
    string status "draft|key_approved|analyzed"
  }
  questions {
    uuid id PK
    uuid exam_id FK
    string question_code "Q1, unique per exam"
    text prompt
    string question_type "mcq"
    json options "key, text, error_type"
    float max_score
    string answer_key
  }
  question_concepts {
    uuid question_id PK,FK
    uuid concept_id PK,FK
    float weight
  }
  import_batches {
    uuid id PK
    uuid exam_id FK
    uuid uploaded_by FK
    string source_type "csv"
    string status "pending_review|approved|rejected"
    uuid approved_by FK
  }
  import_rows {
    uuid id PK
    uuid batch_id FK
    int row_number "line in the file"
    string student_ref
    string question_code
    string answer
    float score
    json errors "block approval"
    json warnings "shown only"
    string status "valid|invalid|corrected"
  }
  submissions {
    uuid id PK
    uuid exam_id FK
    uuid student_id FK
    uuid import_batch_id FK
    string approval_status
  }
  answers {
    uuid id PK
    uuid submission_id FK
    uuid question_id FK
    text answer_text
    float official_score "from the file, never changed"
    float computed_score "from the key"
    float confidence "OCR only"
  }
  diagnoses {
    uuid id PK
    uuid answer_id FK,UK
    string error_type
    text evidence
  }
  bank_questions {
    uuid id PK
    uuid concept_id FK
    uuid source_chunk_id FK
    json options
    string answer_key
    string usage "practice|retest"
    string origin "instructor|ai"
    string review_status "pending|approved"
  }
  recovery_plans {
    uuid id PK
    uuid student_id FK
    uuid course_id FK
    uuid exam_id FK
    string status
  }
  recovery_tasks {
    uuid id PK
    uuid plan_id FK
    uuid concept_id FK
    uuid slide_chunk_id FK
    string task_type "review_slide|practice|retest"
    int priority
    string status
  }
  retests {
    uuid id PK
    uuid student_id FK
    uuid plan_id FK
    string status "in_progress|submitted"
    float total_score
  }
  retest_responses {
    uuid id PK
    uuid retest_id FK
    uuid bank_question_id FK
    text answer
    float score
  }
  concept_explanations {
    uuid concept_id PK,FK
    text source_key "ids of the approved slides used"
    json content "explanation, key_points, cited_pages"
    string model
  }
  audit_logs {
    uuid id PK
    uuid actor_id FK
    uuid course_id
    string action "e.g. import.approved"
    string target_type
    uuid target_id
    json details
    datetime timestamp
  }
```

## Differences from the plan's ERD (Section 8.7)

| Change | Why |
|---|---|
| **Added `import_rows`** | Rows under review need a home before they become answers (ADR 0001 §1) |
| **Added `concept_explanations`** | One cached AI explanation per concept (ADR 0001 §5) |
| **Added `audit_logs.course_id`** | Lets the audit screen list a course's actions |
| `questions.options` holds an `error_type` per option | Source of the likely cause (ADR 0001 §2) |
| `recovery_tasks.priority`, `completed_at` | Order the plan; record completion (FR-36, FR-40) |
| `slide_chunks.image_path`; no `embedding` column | Page images for the slide viewer; embeddings are P1 |
| No `ConceptPerformance` table | Per-concept scores are computed on demand; they take milliseconds on the demo data |
