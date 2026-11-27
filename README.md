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

Built for the **AUF AI Educathon 2026** by the Genesis Team.

## Quick start

Requirements: **Node.js 20.9+** (22 recommended). Nothing else — no Visual Studio, Python or database server; the database is SQLite compiled to WebAssembly.

```bash
git clone https://github.com/muhammedhanii/GapMap.git
cd GapMap
npm install
cp .env.example .env.local     # optional: add a free GEMINI_API_KEY for live AI
npm run dev
```

Open http://localhost:3000. For demos and testing on a phone use the fast mode instead:

```bash
npm run demo
```

It builds once (and again only after you pull updates), starts the production server, and prints
the link for phones on the same Wi-Fi. `npm run dev` is for editing code — every page is compiled on
first visit there, so clicks feel slow.

The database is created and filled with demo data automatically on the
first request. Pick an account on the login page — see **[CREDENTIALS.md](CREDENTIALS.md)** for all
accounts (password `GapMap@2026`).

| Command | What it does |
| --- | --- |
| `npm run demo` | **Fast mode** for demos: builds when needed, starts, prints phone link |
| `npm run dev` | Development server (slower; for editing code) |
| `npm run build && npm start` | Production build (set `SESSION_SECRET`) |
| `npm run db:seed` | Reset the database to the demo data (stop the dev server first, or use **Reset demo data** on the login page) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests for the AI guardrails and offline logic |
| `npm run test:e2e` | Playwright: the full hackathon demo flow in a real browser |
| `npm run demo:video` | Records the demo flows slowly (traces; `.webm` with `DEMO_VIDEO=1` after `npx playwright install ffmpeg`) |
| `npx tsx --env-file=.env.local --conditions=react-server scripts/eval-mark-reading.ts <dataset> 5` | Measures reading of real marked papers against the true marks ([CC BY dataset](https://data.mendeley.com/datasets/sf3kvjwknt/1)) |

## Put it online

**From your laptop (instant, free):** install `cloudflared`
(`winget install Cloudflare.cloudflared` on Windows), run the app, then in a second terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints a public `https://….trycloudflare.com` link that works on any phone while the laptop is on.

**Permanent link (free):** on [Render](https://render.com) choose *New → Blueprint*, select this
repository, and paste your `GEMINI_API_KEY` when asked. `render.yaml` sets everything else. On the
free plan the service sleeps after 15 idle minutes (first visit then takes about a minute) and the
demo data is re-created on every restart.

## The demo in 5 minutes

1. **Instructor** (Dr. Karim Nour) → *Courses*: lectures split into slides and tagged by concept; confirm an AI tag.
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
| Guided tours | A short tour on the first visit to the website, the lecturer area and the student app (lights up each part and explains it); replay any time from **Take the tour** |
| Courses & lectures | Upload PDF/Word → slides with text; AI concept tagging (instructor confirms); slide viewer with deep links |
| Paper analysis | Papers are scanned **after the instructor marks them**: GapMap reads the printed questions (and creates them if the exam has none), the handwritten answers and the instructor's own marks, never names or IDs (the student comes from the upload form or the file name). The mark stays the instructor's; the AI diagnoses which criteria are missing and is flagged when its diagnosis disagrees with the mark; Rubric drafting from the model answer; scanned-paper upload (PDF/JPG/PNG/WebP); handwriting transcription with per-line confidence; criterion matching with **verbatim-quote validation**; TA transcription fixes; review queue with keyboard shortcuts; release to students; CSV import of reviewed marks; explanations written only from the linked slide and page-cited (uncited text is flagged and hidden from students); **approval per question**: one click approves every answer no rule flags, flagged ones open one by one |
| Multiple choice | MCQ questions with a key; CSV import of the letter each student chose, scored by rules; **Socratic-style fix**: for every wrong option students actually chose (up to 30 per quiz) the AI writes 2 tap-to-answer questions and a slide hint from the question, its options and the slides only (no student data), cited and checked; the lecturer approves per question; students tap through, with the slide hint after a wrong tap; Tricky questions and self-found rate in Class insights |
| Diagnosis | Follow-up question with **tap replies** written at diagnosis time, each tagged understands / misconception / unclear: rules pick the branch, so no student text reaches the AI; instructor-tagged error types; anonymous student ↔ instructor threads |
| Study loop | **My papers** tab: the whole marked paper (scan, every answer with the instructor's mark, links to the feedback); 5-question study check-in (habits, time, goals) by taps, scored by rules and never sent to the AI; it orders the plan and nudges self-testing over rereading; activity for any concept, built from its slide (experiments drafted once per concept by the AI and cached); explanation checker; fresh test generated for the gap; before/after per concept; “did it help?” feedback |
| Class insights | Gap share by concept and question, misconception clusters with anonymous examples, ambiguous-question flag, decisions log, section filter; **What to re-teach** computed live when 40%+ of the class has a gap; **AI quality**: share of AI feedback approved without edits (target ≥ 80%) |
| Early support | Rule-based alerts for students passing overall but repeatedly missing a prerequisite; actions and usefulness rating |
| Internships (off by default, `SHOW_PARTNERS=true`) | Partner vacancies mapped to concepts; opted-in students ranked by evidence; nomination quotas (instructor 2, TA 1); company portal sees only nominated students |
| Coordinator | Programme overview across courses and sections; class-level CSV export |

## Tech stack

Next.js 16 (App Router, Server Actions, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Motion · SQLite (sql.js / WebAssembly) via Drizzle ORM · JWT sessions (jose) · Gemini API (REST) or Claude API (`@anthropic-ai/sdk`) ·
unpdf / mammoth for lecture files · Playwright + node:test.

Architecture, data model and AI pipelines: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Design system: [docs/design-system.md](docs/design-system.md).

## AI: live and offline

GapMap works with **Google Gemini** (free key from [Google AI Studio](https://aistudio.google.com/apikey),
no credit card) or **Anthropic Claude** (paid). Set `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in
`.env.local`. With a key set, the model reads handwriting, drafts rubrics, matches criteria, runs the
follow-up conversation, writes fresh questions and groups misconceptions. Every call returns
schema-validated JSON; every evidence quote must appear word-for-word in the transcription or it is
dropped, and every explanation must cite a slide it was given and stay close to that slide's text, or it is
flagged for the instructor. The study check-in is scored by rules and never sent to the AI. Without a key, GapMap runs deterministic **demo mode** logic so every screen still works
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

## Measured on real papers

On 5 papers from a public CC BY 4.0 dataset of real, hand-marked exams (20 MCQs + 15 short answers;
[Mendeley Data](https://data.mendeley.com/datasets/sf3kvjwknt/1)), GapMap read the chosen MCQ letter correctly
**99% of the time (99/100)**. Reading the lecturer's handwritten marks on short answers was the hard part: the
first run read 64% exactly, mostly confusing a written "1" with a tick. The prompt now treats a written number as
the mark and reports unclear marks as missing, so they are flagged for the lecturer instead of being guessed. The
dataset is not included in this repository; one of its CSV files contains real student names and should not be used.

## Privacy

Students see only their own released feedback. Anonymous threads never expose the student's identity
to staff. Companies see only students who opted in **and** were nominated by faculty. Marks always come from the
instructor's own marking on the paper: the AI reads them, diagnoses what is missing and explains it from the
slides, and the instructor approves before students see anything. The AI is never asked for names or IDs. Page 1 of each uploaded PDF (the cover with the name) is dropped before it is stored or read, unless the lecturer unticks it. Uploaded scans are served only to the course's staff
and to the student they belong to. See CREDENTIALS.md for how secrets are handled.
