/**
 * The guided tours. Each step lights up the element with data-tour="<target>"; a step without a target
 * (or whose element is hidden, e.g. the sidebar on a phone) shows as a centred card.
 */
export type TourStep = { target?: string; eyebrow?: string; title: string; body: string; done?: string };

export const tours = {
  landing: [
    {
      eyebrow: "Welcome",
      title: "Welcome to GapMap",
      body: "An AI tutor that shows each student what they got wrong, why, and how to fix it, using the lecturer's own slides. This one-minute tour shows everything it does.",
    },
    {
      target: "hero",
      eyebrow: "The idea",
      title: "Every gap gets a next step",
      body: "A grade says how many marks were lost. GapMap finds the concept behind each mistake, links the exact slide page and explains it, then checks with a fresh question that the gap is closed.",
    },
    {
      target: "how",
      eyebrow: "How it works",
      title: "From a marked paper to a measured improvement",
      body: "The lecturer marks as usual. GapMap reads the paper and the lecturer's own mark, finds what is missing, explains it from the slides with the page cited, and the lecturer approves before any student sees it.",
    },
    {
      target: "instructors",
      eyebrow: "For lecturers",
      title: "A whole class reviewed in minutes",
      body: "Import a quiz file with its key, approve feedback per question in one click, and see weak concepts, the most common wrong answers and what to re-teach when 40% or more of the class misses it.",
    },
    {
      target: "students",
      eyebrow: "For students",
      title: "One next step, never a wall of feedback",
      body: "Students see their whole marked paper, fix a wrong answer in 2 taps with hints from the slide, follow a study plan built from a 5-question check-in, and prove it with fresh questions.",
    },
    {
      target: "principles",
      eyebrow: "Trust",
      title: "The lecturer stays in control, and student data stays private",
      body: "Marks come from the lecturer or from rules, never from the AI. Every AI text cites a slide or is flagged. The AI never sees names or IDs, and students only ever tap: nothing they type reaches it.",
    },
    {
      target: "try",
      eyebrow: "Try it",
      title: "Try the live demo",
      body: "No sign-up: pick Dr. Karim (lecturer) or Mariam (student) on the next page with one click. Each area has its own short tour, and you can replay any tour later.",
      done: "Got it",
    },
  ],
  instructor: [
    {
      eyebrow: "Welcome",
      title: "Your GapMap, in one minute",
      body: "Here is everything you can do as a lecturer, section by section. You can replay this tour from the sidebar at any time.",
    },
    {
      target: "nav-courses",
      eyebrow: "Courses",
      title: "Courses, lectures and concepts",
      body: "Create a course, upload your lecture PDFs (split into slides and tagged by concept, which you confirm), and enrol students by email.",
    },
    {
      target: "nav-exams",
      eyebrow: "Exams",
      title: "Quizzes and exams",
      body: "Import a quiz file with its key, or upload papers you have already marked: GapMap reads the printed question, the answer and your mark. Multiple choice is scored by rules on your key.",
    },
    {
      target: "nav-exams",
      eyebrow: "Review",
      title: "Approve per question, in one click",
      body: "Every explanation is written only from your slide and cites its page. Answers that are hard to read, unclear or uncited are flagged; everything else is approved for the whole question at once.",
    },
    {
      target: "nav-exams",
      eyebrow: "Socratic-style fix",
      title: "A 2-tap fix for every wrong option",
      body: "For each wrong option students chose, the AI writes two tap questions and a slide hint that lead rather than tell. It sees only the question and your slides, never a student. You approve per question.",
    },
    {
      target: "nav-insights",
      eyebrow: "Class insights",
      title: "What the class missed, and what to re-teach",
      body: "Weak concepts, tricky questions with their most common wrong answer, re-teach flags at 40%, the share of AI text you approved without edits, and how many students found the gap themselves.",
    },
    {
      target: "nav-discussions",
      eyebrow: "Discussions",
      title: "Anonymous questions about a mark",
      body: "Students can ask about a marking comment without their name; you answer the question, not the person.",
    },
    {
      target: "nav-alerts",
      eyebrow: "Alerts",
      title: "Early support",
      body: "Students who pass overall but keep missing a prerequisite, so you can help before the next unit builds on it.",
    },
    {
      target: "tour-button",
      eyebrow: "Help",
      title: "Replay the tour any time",
      body: "This button brings the tour back. Start with Courses, or open an exam to see the review and the 2-tap fixes.",
      done: "Start exploring",
    },
  ],
  student: [
    {
      eyebrow: "Welcome",
      title: "Hi! This is your GapMap",
      body: "It shows what you got wrong, why, and how to fix it, with your lecturer's own slides. Here is a quick look around.",
    },
    {
      target: "next-step",
      eyebrow: "Home",
      title: "Your next step",
      body: "One thing at a time: the gap that matters most, the slide that explains it, and a button to fix it.",
    },
    {
      target: "tab-papers",
      eyebrow: "My papers",
      title: "Your whole marked paper",
      body: "Every answer with your lecturer's mark and what was missing. Taking more than one course? Pick the subject at the top.",
    },
    {
      target: "tab-papers",
      eyebrow: "Fix it in 2 taps",
      title: "Find the mistake yourself",
      body: "For a wrong multiple-choice answer, two quick questions lead you to the idea. Tap a wrong one and you get a hint from the slide; the explanation comes last.",
    },
    {
      target: "tab-plan",
      eyebrow: "Study plan",
      title: "A plan that fits how you study",
      body: "A 5-tap check-in (habits, time, goals) orders your plan and picks activities. It nudges you towards testing yourself instead of rereading.",
    },
    {
      target: "tab-practice",
      eyebrow: "Practice",
      title: "Fresh questions prove it",
      body: "A new question on the same concept shows whether the gap is closed.",
    },
    {
      target: "tab-ask",
      eyebrow: "Ask",
      title: "Ask about a mark, anonymously",
      body: "Your lecturer sees the question, not your name.",
    },
    {
      target: "tab-me",
      eyebrow: "Me",
      title: "Your progress, and this tour",
      body: "Progress by concept and your study profile. You can replay this tour from here.",
      done: "Let's go",
    },
  ],
} satisfies Record<string, TourStep[]>;

export type TourId = keyof typeof tours;
