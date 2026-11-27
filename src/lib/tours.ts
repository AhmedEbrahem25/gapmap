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
 * The guided demo: one story across pages and accounts, for judges. `path` is the page the step belongs to;
 * the guide jumps ahead by itself when the visitor reaches a later step's page. `click` steps wait for the
 * visitor to click the lit-up element instead of showing "Next".
 */
export type DemoStep = { path: string; target?: string; title: string; body: string; click?: boolean };

export const demoSteps: DemoStep[] = [
  { path: "^/login", target: "demo-dr.karim", title: "1 · The lecturer", body: "Dr. Karim marked his midterm on paper. Sign in as him.", click: true },
  { path: "^/instructor$", target: "nav-exams", title: "His exams", body: "Open Exams.", click: true },
  { path: "^/instructor/exams$", target: "review-first", title: "The scanned papers", body: "Open the midterm review.", click: true },
  { path: "/review$", target: "scan", title: "His mark, read from the scan", body: "The mark is his. The AI never grades." },
  { path: "/review$", target: "diagnosis", title: "Why the marks were lost", body: "Each gap explained from his own slide, with the page." },
  { path: "/review$", target: "approve-question", title: "One click per question", body: "Only flagged answers need a look." },
  { path: "/review$", target: "release", title: "Release", body: "Students see nothing before this." },
  { path: "/review$", target: "sign-out", title: "2 · The student", body: "Now see it as Mariam. Sign out.", click: true },
  { path: "^/login", target: "demo-mariam", title: "The student", body: "Sign in as Mariam.", click: true },
  { path: "^/student$", target: "next-step", title: "One next step", body: "Not a wall of feedback. Tap the button.", click: true },
  { path: "^/student/(fix|followup|plan|practice)", title: "She works on her own gap", body: "She only taps. Hints come from the slide." },
  { path: "^/student/(fix|followup|plan|practice)", title: "That's GapMap", body: "Lecturer marks → AI explains from slides → student fixes." },
];
