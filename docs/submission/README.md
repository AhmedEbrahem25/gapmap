# GapMap: final documentation package

AI Educathon 2026 · Alamein International University · demo on 28 November 2026.

This folder is the submission package from plan Section 20. It describes the system **as built**:
every requirement has a status, and gaps are stated rather than hidden. Where a document already
exists elsewhere in the repository it is linked, not copied. The original analysis is the project
plan, [../requirements/GapMap_Complete_Project_Plan_EN.md](../requirements/GapMap_Complete_Project_Plan_EN.md).

## Start here

- **In one page:** [Abstract](01-Introduction/Abstract.md)
- **What was and wasn't built:** [Functional requirements](02-Requirements/Functional-Requirements.md)
  and [Scope and limitations](01-Introduction/Scope-and-Limitations.md)
- **What it looks like:** [UI screens](04-Design/UI-Wireframes/README.md)
- **Run it:** [Setup guide](05-Implementation/Setup-Guide.md)

## Contents

| Folder | Documents |
|---|---|
| 01 Introduction | [Abstract](01-Introduction/Abstract.md) · [Problem statement](01-Introduction/Problem-Statement.md) · [Objectives](01-Introduction/Objectives.md) · [Scope and limitations](01-Introduction/Scope-and-Limitations.md) |
| 02 Requirements | [SRS](02-Requirements/SRS.md) · [Functional](02-Requirements/Functional-Requirements.md) · [Non-functional](02-Requirements/Non-Functional-Requirements.md) · [User stories](02-Requirements/User-Stories.md) |
| 03 Analysis | [Use cases](03-Analysis/Use-Cases.md) · [Workflows](03-Analysis/Workflows.md) · [Business rules](03-Analysis/Business-Rules.md) |
| 04 Design | [Architecture](04-Design/Architecture.md) · [ERD](04-Design/ERD.md) · [API design](04-Design/API-Design.md) · [UI screens](04-Design/UI-Wireframes/README.md) |
| 05 Implementation | [Setup guide](05-Implementation/Setup-Guide.md) · [Database guide](05-Implementation/Database-Guide.md) · [User guide](05-Implementation/User-Guide.md) |
| 06 Testing | [Test plan](06-Testing/Test-Plan.md) · [Test cases](06-Testing/Test-Cases.md) · [Evaluation results](06-Testing/Evaluation-Results.md) |
| 07 Deployment | [Deployment guide](07-Deployment/Deployment-Guide.md) |
| 08 Presentation | [Demo script and slides](08-Presentation/Demo-Script.md) · `Slides.pdf` (to export, see that page) |

Related documents elsewhere in `docs/`:

- [decisions/0001-hackathon-decisions.md](../decisions/0001-hackathon-decisions.md): where the build
  refines or simplifies the plan, and why.
- [test-results.md](../test-results.md): each test case mapped to the test that checks it.
- [demo-script.md](../demo-script.md): the live demo, step by step.

## Status at a glance (20 November 2026)

| | |
|---|---|
| Functional requirements | 43 of 47 done (one of them P1), 2 partial, 2 out of scope (OCR); every P0 requirement is done |
| Plan test cases | 26 of 27 pass; OCR not applicable |
| Automated tests | 144 pass; the demo journey also runs on Docker + PostgreSQL in CI |
| Accuracy against the instructor's judgement | Not measured yet |

## Still to do before submission

- [ ] Export the deck to `08-Presentation/Slides.pdf`.
- [ ] Record the backup demo video.
- [ ] Instructor review of concepts, answer key and question bank (issue #1). Then measure accuracy
      as described in [Evaluation results](06-Testing/Evaluation-Results.md).
- [ ] Have a teammate who did not write it follow the [Setup guide](05-Implementation/Setup-Guide.md)
      on a clean machine.

## Mapping to the suggested report chapters (plan Section 20)

| Chapter | Source in this package |
|---|---|
| 1 Introduction | 01-Introduction |
| 2 Background and problem definition | [Problem statement](01-Introduction/Problem-Statement.md) |
| 3 Proposed solution | [Abstract](01-Introduction/Abstract.md), [Workflows](03-Analysis/Workflows.md) |
| 4 Requirements analysis | 02-Requirements |
| 5 System analysis and UML diagrams | 03-Analysis |
| 6 System design and architecture | [Architecture](04-Design/Architecture.md), [API design](04-Design/API-Design.md), [UI screens](04-Design/UI-Wireframes/README.md) |
| 7 Database design | [ERD](04-Design/ERD.md), [Database guide](05-Implementation/Database-Guide.md) |
| 8 AI components and methodology | [Architecture § The AI component](04-Design/Architecture.md#the-ai-component), [Business rules](03-Analysis/Business-Rules.md) |
| 9 Implementation | 05-Implementation |
| 10 Testing and evaluation | 06-Testing |
| 11 Security, privacy and limitations | [Architecture § Security](04-Design/Architecture.md#security), [Non-functional](02-Requirements/Non-Functional-Requirements.md), [Scope and limitations](01-Introduction/Scope-and-Limitations.md) |
| 12 Conclusion and future work | [Evaluation results](06-Testing/Evaluation-Results.md), [Deployment guide](07-Deployment/Deployment-Guide.md) |
