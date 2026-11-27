/**
 * The guided tours. Each step lights up the element with data-tour="<target>"; a step without a target
 * (or whose element is hidden, e.g. the sidebar on a phone) shows as a centred card.
 */
export type TourStep = { target?: string; eyebrow?: string; title: string; body: string; done?: string; demo?: boolean };

export const tours = {
  landing: [
    { title: "Welcome to GapMap", body: "See what each student got wrong, and how to fix it." },
    { target: "how", title: "How it works", body: "The lecturer marks. GapMap explains each gap from the slides." },
    { target: "instructors", title: "For lecturers", body: "Approve a whole question in one click." },
    { target: "students", title: "For students", body: "One next step. Fix it in 2 taps." },
    { target: "principles", title: "Private and in control", body: "The AI never grades and never sees names." },
    { target: "try", title: "See the whole story", body: "A 2-minute guided demo: lecturer, then student.", done: "Start the guided demo", demo: true },
  ],
  instructor: [
    { target: "nav-courses", title: "Courses", body: "Lectures, slides and students." },
    { target: "nav-exams", title: "Exams", body: "Upload marked papers, approve per question." },
    { target: "nav-insights", title: "Class insights", body: "What the class missed, what to re-teach." },
    { target: "nav-discussions", title: "Discussions", body: "Anonymous questions about a mark." },
    { target: "nav-alerts", title: "Alerts", body: "Students who need help early." },
    { target: "tour-button", title: "Replay", body: "Open this tour again any time.", done: "Start" },
  ],
  student: [
    { target: "next-step", title: "Your next step", body: "The gap that matters most, and how to fix it." },
    { target: "tab-papers", title: "My papers", body: "Your marked papers." },
    { target: "tab-plan", title: "Study plan", body: "What to study next." },
    { target: "tab-practice", title: "Practice", body: "New questions to check you've got it." },
    { target: "tab-ask", title: "Ask", body: "Ask about a mark, anonymously." },
    { target: "tab-me", title: "Me", body: "Your progress. Replay this tour here.", done: "Let's go" },
  ],
} satisfies Record<string, TourStep[]>;

export type TourId = keyof typeof tours;

/**
 * The guided demo: one story across pages and accounts, for judges, where the visitor does each step.
 * `path` is the page the step belongs to; reaching a later step's page moves the guide there.
 * `click`: wait for a click on the lit-up element. `until`: wait for an element with that data-tour to appear.
 * Otherwise the card shows "Next". `ok` is the confirmation shown on the next card.
 */
export type DemoStep = { path: string; target?: string; title: string; body: string; click?: boolean; until?: string; ok?: string };

export const demoSteps: DemoStep[] = [
  { path: "^/login", target: "demo-dr.karim", title: "1 · Be the lecturer", body: "Dr. Karim marked his midterm on paper. Sign in as him.", click: true },
  { path: "^/instructor$", target: "nav-exams", title: "His exams", body: "Open Exams.", click: true },
  { path: "^/instructor/exams$", target: "review-first", title: "The scanned papers", body: "Open the midterm review.", click: true },
  { path: "/review$", target: "scan", title: "His mark, read from the paper", body: "2/4 is his mark. The AI never grades." },
  { path: "/review$", target: "student-explanation", title: "What Mariam will read", body: "Open the explanation.", click: true, ok: "It quotes his own slide, with the page." },
  { path: "/review$", target: "approve-answer", title: "Your call", body: "Looks right? Approve it.", click: true, ok: "Approved. Mariam still sees nothing." },
  { path: "/review$", target: "release", title: "Release", body: "Send the approved feedback.", click: true, ok: "Released to students." },
  { path: "/review$", target: "sign-out", title: "2 · Be the student", body: "Now be Mariam. Sign out.", click: true },
  { path: "^/login", target: "demo-mariam", title: "Be Mariam", body: "Sign in as her.", click: true },
  { path: "^/student$", target: "next-step", title: "Her next step", body: "One thing to do. Tap it.", click: true },
  { path: "^/student/(fix|followup)", target: "taps", title: "Your turn", body: "Tap an answer. Wrong? You get a hint from the slide.", until: "fix-done", ok: "She found it herself." },
  { path: "^/student/(fix|followup|plan|practice)", target: "fix-done", title: "That's GapMap", body: "Lecturer marks → AI explains from slides → student fixes it." },
];
