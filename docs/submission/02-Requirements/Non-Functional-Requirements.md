# Non-functional requirements

NFR-01 to NFR-12 from plan Section 4.2, with how the built system meets each.

| ID | Requirement | Status | How / evidence |
|---|---|---|---|
| NFR-01 | Security: role-based access control | Done | Every route checks the user's role (`require_roles`) and course access (`can_access_course`). Students see only enrolled courses and their own data; instructors only their own courses; coordinators course-level data only (TC-27). Tests: `test_courses_rbac.py`, TC-02, TC-20, TC-27 |
| NFR-02 | Privacy: pseudonymous student reference | Done | Imports use `student_ref` (`STU001`), never names or emails. The demo uses synthetic students only |
| NFR-03 | Encryption in transit and at rest | Partial | Passwords are hashed with bcrypt; JWTs are signed (HS256) and expire after 8 hours. TLS and disk encryption depend on the deployment and are **not** set up: the demo runs over plain HTTP on localhost. See the [Deployment-Guide](../07-Deployment/Deployment-Guide.md) |
| NFR-04 | Explainability | Done | Each likely cause names the question, the chosen option and the instructor's tag; each weak concept shows its score, question count and source slides |
| NFR-05 | Reliability: OCR/LLM failure must not break the core | Done | The LLM is optional; any failure (no key, network, refusal, bad output) hides the explanation card and the plan stays complete. TC-18 plus 4 failure cases on the client wrapper |
| NFR-06 | Accuracy: low-confidence data needs human review | Done for CSV | Every import needs approval; rows with errors block approval. OCR confidence is out of scope |
| NFR-07 | Usability | Partial | One primary action per screen, data status shown (pending review / approved), plain-language errors that say what to fix. Not yet tested with real users (plan Section 14) |
| NFR-08 | Maintainability: modular monolith | Done | One FastAPI app with a route module per area (`api/`) and domain logic in `services/`. Pure functions (scoring, import validation) are tested without a database |
| NFR-09 | Performance: measure on the demo dataset | Done | Measured: tens of milliseconds for import, approval, analysis and reports; 0.34 s for a 12-page PDF. See [Evaluation-Results](../06-Testing/Evaluation-Results.md) |
| NFR-10 | Auditability | Done | Approvals, key approval, row edits and deletions, analysis runs, uploads, and concept and slide changes go to `audit_logs`, shown on the audit log screen. TC-26 |
| NFR-11 | Repeatable runs with Docker Compose | Done | `docker compose up --build` plus the seed; CI runs the smoke test on this stack for every pull request |
| NFR-12 | Responsible AI | Done | Official scores are never changed (BR-01, TC-22); causes are hypotheses with evidence (BR-07); no student data goes to the LLM (BR-12) |
