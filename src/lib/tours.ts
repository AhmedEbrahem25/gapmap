/**
 * The guided tours. Each step lights up the element with data-tour="<target>"; a step without a target
 * (or whose element is hidden, e.g. the sidebar on a phone) shows as a centred card.
 */
export type TourStep = { target?: string; eyebrow?: string; title: string; body: string; done?: string };

export const tours = {
  landing: [
    { title: "Welcome to GapMap", body: "See what each student got wrong, and how to fix it." },
    { target: "how", title: "How it works", body: "The lecturer marks. GapMap explains each gap from the slides." },
    { target: "instructors", title: "For lecturers", body: "Approve a whole question in one click." },
    { target: "students", title: "For students", body: "One next step. Fix it in 2 taps." },
    { target: "principles", title: "Private and in control", body: "The AI never grades and never sees names." },
    { target: "try", title: "Try it", body: "One click, no sign-up.", done: "Got it" },
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
