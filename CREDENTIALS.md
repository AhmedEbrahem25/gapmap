# GapMap — accounts and secrets

> **This repository is public.** This file lists only the **demo accounts** that the seed script
> creates on your own machine. Real secrets (API keys, the session secret, database URLs) never go
> in git — put them in `.env.local`, which is ignored. See [Real secrets](#real-secrets) below.

## Demo accounts

Every demo account uses the same password:

```
GapMap@2026
```

| Role | Name | Email | What to show with it |
| --- | --- | --- | --- |
| Instructor | Dr. Salma Nour | `dr.salma@gapmap.demo` | Course & lectures, rubric, paper upload, **review queue**, class insights, discussions, alerts, internships |
| Student (demo student) | Mariam Adel | `mariam@gapmap.demo` | Report → follow-up question → study profile → activity → fresh test |
| Teaching assistant | Karim Lotfy | `ta.karim@gapmap.demo` | Same course as the instructor; nomination quota of 1 |
| Coordinator | Dr. Hany Fawzy | `coordinator@gapmap.demo` | Programme overview, class-level CSV export (no individual papers) |
| Partner company | Reem Saleh (Nile Data Labs, demo) | `hr@niledata.demo` | Vacancies, faculty nominations, request interview |
| Platform admin | GapMap Admin | `admin@gapmap.demo` | Sees every course in the instructor area |

Other students (all with the same password) follow the pattern
`firstname.lastname@student.gapmap.demo`, for example:

| Student | Email | Why they are interesting |
| --- | --- | --- |
| Youssef Kamal | `youssef.kamal@student.gapmap.demo` | Has an **early-support alert** on Foreign keys |
| Nour Hassan | `nour.hassan@student.gapmap.demo` | Full marks — top internship candidate |
| Ahmed Samir | `ahmed.samir@student.gapmap.demo` | Already nominated; company requested an interview |
| Omar Khaled | `omar.khaled@student.gapmap.demo` | Asked an anonymous question about Q3 |
| Salma Ibrahim | `salma.ibrahim@student.gapmap.demo` | Open anonymous question about Q4 wording |

The login page also has **one-click demo buttons** and a **Reset demo data** link (both only when
`DEMO_MODE` is not `false`).

## Real secrets

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Where to get it |
| --- | --- | --- |
| `SESSION_SECRET` | **Yes in production** (≥ 32 characters) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GEMINI_API_KEY` | **Free** live AI (handwriting, matching, follow-ups) | https://aistudio.google.com/apikey — sign in with a Google account, *Create API key*. No credit card. |
| `GEMINI_MODEL` / `GEMINI_MODEL_FAST` | Optional | Defaults `gemini-flash-latest` / `gemini-flash-lite-latest`; if a name is retired GapMap picks a current Flash model automatically |
| `ANTHROPIC_API_KEY` | Paid alternative to Gemini | https://platform.claude.com/settings/keys (needs prepaid credits) |
| `ANTHROPIC_MODEL` / `ANTHROPIC_MODEL_FAST` | Optional | Defaults: `claude-sonnet-5-5` / `claude-haiku-5-5` |
| `AI_PROVIDER` | Optional | `gemini` or `anthropic` when both keys are set (Gemini wins by default) |
| `DATABASE_PATH` | Optional | Defaults to `data/gapmap.db` |
| `STORAGE_DIR` | Optional | Where uploads are stored; defaults to `storage/` |
| `DEMO_MODE` | Optional | Set to `false` in a real deployment to hide demo logins and reset |
| `COOKIE_SECURE` | Optional | Set to `false` only when demoing a production build over plain `http://` on a LAN IP |

> **Privacy note for the free Gemini tier:** Google may use free-tier prompts to improve its products.
> Use it with the demo data or anonymised papers. For real students' papers, use a paid tier
> (Gemini paid or Claude) under an agreement with the university.

Keep the team's real values in a password manager (for example a shared 1Password or Bitwarden
vault), not in this repo, chat, or screenshots. If a key is ever committed, rotate it immediately.
