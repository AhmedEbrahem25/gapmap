# Workflows

The plan's workflows (Section 7) as they run in the built system. Steps the plan describes but the app
doesn't do are marked.

## Instructor

```mermaid
flowchart LR
  A[Log in] --> Z[New course,<br/>enrol students]
  Z --> B[Course page]
  B --> C[Upload PDF or Word]
  C --> N[Concepts: define,<br/>find and approve slides]
  N --> E
  C --> D[Pages extracted<br/>text + image]
  B --> E[New exam:<br/>questions, options,<br/>key, concept, tags]
  E --> F[Approve answer key]
  F --> G[Import CSV/Excel]
  G --> H{Errors?}
  H -- yes --> I[Edit or delete rows]
  I --> H
  H -- no --> J[Approve results]
  J --> K[Run analysis]
  K --> L[Student results<br/>and reports]
  K --> M[Class analytics]
```

Every step runs in the app. Student accounts themselves come from the seed.

## Student

```mermaid
flowchart LR
  A[Log in] --> B[Open my report]
  B --> C[Weak concepts<br/>with slides]
  C --> D[Open my plan]
  D --> E[Read explanation<br/>if AI is on]
  D --> F[Open slide,<br/>mark reviewed]
  D --> G[Practice with<br/>feedback]
  D --> H[Retest]
  H --> I[Before/after<br/>per concept]
```

## Course ingestion

Upload → check the type (.pdf or .docx) and size (25 MB) → Word is converted to PDF → each page's
text and title are extracted and the page is rendered to an image (PyMuPDF) → one `slide_chunks` row
per page → status `ready`, or `failed` with the reason.

Concept→slide suggestions use keyword matching on each page's title and text (name words count more
than description words, title matches double). Not built: chunking below page level, embeddings.

## Results import and verification

```mermaid
sequenceDiagram
  actor I as Instructor
  participant W as Web app
  participant A as API
  participant DB as Database
  I->>W: Upload results file
  W->>A: POST /exams/{id}/imports
  A->>A: Parse .csv/.xlsx, check columns
  A->>A: Validate each row: student enrolled, question exists,<br/>answer is an option, no duplicate, score ≤ max,<br/>score vs key (warning)
  A->>DB: Save import_batch + import_rows (pending)
  A-->>W: Counts, errors, warnings
  loop Until no errors
    I->>W: Edit or delete a row
    W->>A: PATCH or DELETE /imports/{id}/rows/{row}
    A->>DB: Re-validate, audit
  end
  I->>W: Approve results
  W->>A: POST /imports/{id}/approve
  A->>DB: Create submissions + answers, audit
```

Analysis reads only `answers`, which exist only after approval, so unapproved data can't reach it
(ADR 0001 §1).

## Analysis

Approved answers → compare with the key → group by the question's concept → percentage per concept
with question count → status (weak if under 60% on 2 or more questions) → likely cause from the tag on
the chosen wrong option → save a diagnosis per wrong answer → create a recovery plan per student with
weak concepts, with up to 3 approved slides per concept plus a practice task.

Slides come only from the instructor-approved concept→slide mapping. The plan's fallback to semantic
search is not built.

## Recovery and retest

```mermaid
sequenceDiagram
  actor S as Student
  participant W as Web app
  participant A as API
  participant L as Claude API
  S->>W: Open plan
  W->>A: GET /recovery-plans/{id}
  A-->>W: Concepts, slides, tasks
  W->>A: GET /concepts/{id}/explanation
  alt Cached for these slides
    A-->>W: Explanation
  else Not cached and AI is on
    A->>L: Concept + approved slide text only
    L-->>A: explanation, key points, cited pages
    A->>A: Drop cited pages that weren't sent
    A-->>W: Explanation
  else AI off or failure
    A-->>W: status: unavailable (card hidden)
  end
  S->>W: Take the retest
  W->>A: POST /retests
  A-->>W: 3 retest-only items per weak concept
  S->>W: Submit answers
  W->>A: POST /retests/{id}/submit
  W->>A: GET /retests/{id}/results
  A-->>W: Exam % vs retest % per concept
```

## Class analytics

Approved answers → wrong-answer rate per concept and per question, with counts → students below the
threshold per concept → most common wrong option and its tag → concepts at or above a 40% error rate
are suggested for re-teaching, with that evidence.
