# Hackathon demo script (≈ 5 minutes)

Before you start: `npm run db:seed` (or **Reset demo data** on the login page), open
http://localhost:3000/login in one window and keep a second, phone-sized window ready for the student.

| # | Who | Do | Say |
| --- | --- | --- | --- |
| 1 | Dr. Salma Nour | Courses → L4 → Confirm the AI tag on slide 12 | “Every slide knows the concept it teaches, so every lost mark can point to it.” |
| 2 | Instructor | Exams → Rubric (Q3) | “The model answer became criteria, each linked to a slide. The instructor edits; the AI only drafts.” |
| 3 | Instructor | Review → Mariam, Q3 | “Handwriting on the left, transcription below, uncertain words underlined. C2 is partial — and here are her exact words. The AI suggests one follow-up question.” → **Approve & next** → **Release** |
| 4 | Mariam (mobile) | Home | “One next step, not a wall of feedback. The slide is one tap away.” |
| 5 | Mariam | Answer one quick question → choose a reply | “Two students could write the same answer for different reasons. One question tells them apart.” Show **Try the other reply** if time. |
| 6 | Mariam | Activity (set the study profile if asked) → explain → Check | “She learns by experimenting, so she breaks the rule herself: two rows, same ID, update one.” |
| 7 | Mariam | Take a fresh test → answer | “A new question on a new table. Partial → Met, per concept.” |
| 8 | Instructor | Class insights | “16 students described the column instead of the rule. Q4 may be worded ambiguously. Decide: reteach next lecture.” |
| 9 | Instructor | Alerts, Internships | “Youssef passes overall but keeps missing foreign keys — joins depend on them. Later, faculty can nominate students for internships with assessed evidence.” |

**Sample answers to type**

- Activity: `Both rows have the same StudentID 1042, so the update changed both of them.`
- Fresh test: `CourseCode, because no two courses can share a code, and it never changes and can't be empty.`

**Backup plan**

- No internet: leave `ANTHROPIC_API_KEY` empty — demo mode runs every step offline with the seeded data.
- Something went wrong mid-demo: **Reset demo data** on the login page (≈1 second).
- Keep a screen recording of the full flow (`npm run test:e2e -- --headed` is a good way to rehearse it).
