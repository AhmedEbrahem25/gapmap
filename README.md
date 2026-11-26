<p align="center">
  <img src="public/icon.svg" width="64" height="64" alt="GapMap logo">
</p>

<h1 align="center">GapMap</h1>
<p align="center"><strong>Every gap gets a next step.</strong><br>
AI that turns an exam the class already took into a specific next step for each student — and checks whether it helped.</p>

---

A marked paper tells a student where they lost marks. It doesn't tell them what to practise next.
At many universities exams are handwritten and papers are never returned. GapMap reads the completed
papers, matches every answer to the instructor's marking criteria, quotes the student's own words,
links each gap to the lecture slide that teaches it, asks one short follow-up question to find the
real misunderstanding, suggests an activity that fits how the student studies, and measures the
change with a fresh test. Instructors see class-level misconceptions and decide what to reteach.

Built for the **AI Educathon 2026** by Crafnova.

## Quick start

Requirements: **Node.js 20.9+** (22 recommended).

```bash
git clone https://github.com/muhammedhanii/GapMap.git
cd GapMap
npm install
cp .env.example .env.local     # optional: add a free GEMINI_API_KEY for live AI
npm run dev
```

Open http://localhost:3000. The database is created and filled with demo data automatically on the
first request. Pick an account on the login page — see **[CREDENTIALS.md](CREDENTIALS.md)** for all
accounts (password `GapMap@2026`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build (set `SESSION_SECRET`) |
| `npm run db:seed` | Reset the database to the demo data |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests for the AI guardrails and offline logic |
| `npm run test:e2e` | Playwright: the full hackathon demo flow in a real browser |

## The demo in 5 minutes

1. **Instructor** (Dr. Salma Nour) → *Courses*: lectures split into slides and tagged by concept; confirm an AI tag.
2. *Exams → Rubric*: the model answer becomes criteria, each linked to a slide.
3. *Review*: Mariam's handwritten answer beside its transcription; each criterion with her own words,
   what's still missing and the slide. **Approve & next**, then **Release** to students.
4. **Student** (Mariam) → her report opens on one next step with the slide.
5. *Answer one quick question*: “What would happen if two students had the same name?” Each reply leads somewhere different.
6. *Study profile + activity*: an experiment — two students with the same ID, update just one.
7. *Fresh test*: a new question on a new table; **Partial → Met**.
8. **Instructor** → *Class insights*: grouped misconceptions, an ambiguous question flagged, decide to reteach.
9. Previews: *Alerts* (passing but missing a prerequisite) and *Internships* (nominations backed by assessed work).

Full script with talking points and a backup plan: [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md).

## What's inside

| Area | Features |
| --- | --- |
| Courses & lectures | Upload PDF/Word → slides with text; AI concept tagging (instructor confirms); slide viewer with deep links |
| Paper analysis | Rubric drafting from the model answer; scanned-paper upload (PDF/JPG/PNG/WebP); handwriting transcription with per-line confidence; criterion matching with **verbatim-quote validation**; TA transcription fixes; review queue with keyboard shortcuts; release to students; CSV import of reviewed marks |
| Diagnosis | AI follow-up question with branch detection; instructor-tagged error types; anonymous student ↔ instructor threads |
| Study loop | Editable study profile (habits, not personality); activity chosen from gap + reply + profile; explanation checker; fresh test generated for the gap; before/after per concept; “did it help?” feedback |
| Class insights | Gap share by concept and question, misconception clusters with anonymous examples, ambiguous-question flag, decisions log, section filter |
| Early support | Rule-based alerts for students passing overall but repeatedly missing a prerequisite; actions and usefulness rating |
| Internships | Partner vacancies mapped to concepts; opted-in students ranked by evidence; nomination quotas (instructor 2, TA 1); company portal sees only nominated students |
| Coordinator | Programme overview across courses and sections; class-level CSV export |

## Tech stack

Next.js 16 (App Router, Server Actions, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Motion · SQLite via Drizzle ORM · JWT sessions (jose) · Gemini API (REST) or Claude API (`@anthropic-ai/sdk`) ·
unpdf / mammoth for lecture files · Playwright + node:test.

Architecture, data model and AI pipelines: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Design system: [docs/design-system.md](docs/design-system.md).

## AI: live and offline

GapMap works with **Google Gemini** (free key from [Google AI Studio](https://aistudio.google.com/apikey),
no credit card) or **Anthropic Claude** (paid). Set `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in
`.env.local`. With a key set, the model reads handwriting, drafts rubrics, matches criteria, runs the
follow-up conversation, writes fresh questions and groups misconceptions. Every call returns
schema-validated JSON; every evidence quote must appear word-for-word in the transcription or it is
dropped. Without a key, GapMap runs deterministic **demo mode** logic so every screen still works
offline (handwriting must then be typed in by a TA).

## Project structure

```
src/
  app/            routes: / (landing), /login, /instructor/*, /student/*, /coordinator, /company, /slides/*, /api/*
  components/     ui kit, shells, instructor & landing components
  lib/
    ai/           client (structured Claude calls), pipelines, offline fallback, quote validation
    actions/      server actions per role (auth, instructor, student, company)
    db/           Drizzle schema + connection (auto-migrate, auto-seed)
    jobs.ts       lecture ingestion and paper analysis (run after the response)
    alerts.ts     early-support rules
scripts/          demo seed data
drizzle/          SQL migrations
e2e/ tests/       Playwright demo flow, unit tests
docs/             architecture, demo script, design system
```

## Privacy

Students see only their own released feedback. Anonymous threads never expose the student's identity
to staff. Companies see only students who opted in **and** were nominated by faculty. Every AI grade
is a suggestion until an instructor approves it. Uploaded scans are served only to the course's staff
and to the student they belong to. See CREDENTIALS.md for how secrets are handled.
