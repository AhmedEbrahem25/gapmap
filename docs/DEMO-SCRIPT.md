# Hackathon demo script (≈ 5 minutes)

Before you start: `npm run db:seed` (or **Reset demo data** on the login page), open
http://localhost:3000/login in one window and keep a second, phone-sized window ready for the student.
Each area shows a one-minute guided tour the first time it is opened in a browser; use **Take the tour** (website header,
lecturer sidebar, student Me page) to show it again, for example to open the pitch with the website tour.

| # | Who | Do | Say |
| --- | --- | --- | --- |
| 1 | Dr. Karim Nour | Courses → L4 → Confirm the AI tag on slide 12 | “Every slide knows the concept it teaches, so every lost mark can point to it.” |
| 2 | Instructor | Exams → Rubric (Q3) | “The model answer became criteria, each linked to a slide. The instructor edits; the AI only drafts.” |
| 3 | Instructor | Review → Mariam, Q3 | “Dr. Karim marked this paper by hand and scanned it. GapMap read his red-pen mark: the AI does not grade, it finds what is missing. Handwriting on the left, transcription below, uncertain words underlined. C2 is partial — and here are her exact words. The AI suggests one follow-up question.” → **Approve & next** → **Release** |
| 3b | Instructor | Same page → **Approve N for Q3** | “Under each gap, an explanation written only from the slide, with its page. Laila's mark is smudged, so it is flagged. Everything with a clear mark, a readable answer and a cited explanation is approved for the whole question in one click; only flagged answers are opened one by one. That keeps review under 15 minutes.” |
| 4 | Mariam (mobile) | Home | “One next step, not a wall of feedback. The slide is one tap away.” |
| 5 | Mariam | Answer one quick question → choose a reply | “Two students could write the same answer for different reasons. One question tells them apart.” Show **Try the other reply** if time. |
| 6 | Mariam | Activity (if asked, take the 5-tap study check-in and pick “Trying small changes myself”) → explain → Check | “She learns by experimenting, so she breaks the rule herself: two rows, same ID, update one.” |
| 7 | Mariam | Take a fresh test → answer | “A new question on a new table. Partial → Met, per concept.” |
| 7b | Instructor → Mariam | Exams → **Fix chains · Quiz 2** → Approve 1 for Q3; then Mariam → My papers → Quiz 2 → **Fix it in 2 taps** (tap a wrong answer first) | “Rules pick the wrong options students chose. For each one the AI writes two tap questions and a slide hint, from the question and the slides only: no student data. A wrong tap shows the hint; the explanation comes last, so she finds it herself.” |
| 8 | Instructor | Class insights | “What to re-teach is computed: any concept 40%+ of the class misses. The AI-quality tile shows how much AI feedback we approved without edits (target 80%). 16 students described the column instead of the rule. Q4 may be worded ambiguously. Decide: reteach next lecture.” |
| 9 | Instructor | Alerts, Internships | “Youssef passes overall but keeps missing foreign keys — joins depend on them. Later, faculty can nominate students for internships with assessed evidence.” |

**Sample answers to type**

- Activity: `Both rows have the same StudentID 1042, so the update changed both of them.`
- Fresh test: `CourseCode, because no two courses can share a code, and it never changes and can't be empty.`

**Backup plan**

- No internet: leave the AI keys empty — demo mode runs every step offline with the seeded data.
- Something went wrong mid-demo: **Reset demo data** on the login page (≈1 second).
- Keep a screen recording of the full flow (`npm run test:e2e -- --headed` is a good way to rehearse it).
