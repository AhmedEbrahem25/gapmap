import Link from "next/link";
import {
  ScanLine,
  Sparkles,
  MessageCircleQuestion,
  LineChart,
  ShieldCheck,
  Quote,
  Languages,
  UserCheck,
  BookOpen,
  FlaskConical,
  BellRing,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn, Reveal } from "@/components/ui/motion";
import { HeroDemo } from "@/components/landing/hero-demo";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/session";

const steps = [
  { icon: ScanLine, title: "Upload the marked papers", body: "Lecture slides, the model answer and the scanned handwritten papers. Arabic and English." },
  { icon: Sparkles, title: "AI reads and matches", body: "Each answer is checked against every marking criterion, quoting the student's own words and linking the slide." },
  { icon: UserCheck, title: "The instructor approves", body: "Nothing reaches a student until it has been reviewed. Edits are one click; the AI only suggests." },
  { icon: MessageCircleQuestion, title: "One question, one next step", body: "A short follow-up finds the real gap, then an activity that fits how the student learns." },
  { icon: LineChart, title: "A fresh test proves it", body: "A new question on the same gap shows whether studying helped — per concept, per student, per class." },
];

const instructorFeatures = [
  { icon: BookOpen, title: "Slides tagged by concept", body: "Every lost mark links to the exact slide that teaches it." },
  { icon: Sparkles, title: "Misconceptions grouped", body: "Answers that share the same misunderstanding, with anonymous examples." },
  { icon: BellRing, title: "Early support alerts", body: "Students who pass overall but keep missing a prerequisite." },
  { icon: Briefcase, title: "Evidence for internships", body: "Nominate students to partner companies using assessed work." },
];

const studentFeatures = [
  { icon: Quote, title: "Feedback in your own words", body: "See what you wrote, what you got right and what's still missing." },
  { icon: FlaskConical, title: "Activities that fit you", body: "Experiment, map ideas or follow an example — your choice, always editable." },
  { icon: MessageCircleQuestion, title: "Ask without your name", body: "Question a marking comment anonymously; the instructor sees the answer, not you." },
  { icon: LineChart, title: "See yourself improve", body: "Fresh tests show the change for every concept." },
];

const principles = [
  { icon: UserCheck, title: "Instructor in control", body: "Every grade and nomination is a human decision." },
  { icon: Quote, title: "Evidence, not guesses", body: "Quotes must appear word-for-word in the transcription." },
  { icon: ShieldCheck, title: "Private by design", body: "Students see only themselves; classmates stay anonymous." },
  { icon: Languages, title: "Arabic & English", body: "Handwriting in either language, with RTL support." },
];

export default async function Landing() {
  const user = await getCurrentUser();
  const appHref = user ? homeFor(user.role) : "/login";
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="GapMap home">
            <Logo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-medium text-[#374151] md:flex">
            <a href="#how" className="hover:text-primary-600">
              How it works
            </a>
            <a href="#instructors" className="hover:text-primary-600">
              Instructors
            </a>
            <a href="#students" className="hover:text-primary-600">
              Students
            </a>
            <a href="#pricing" className="hover:text-primary-600">
              Universities
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? null : (
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold hover:bg-ground sm:block">
                Sign in
              </Link>
            )}
            <ButtonLink href={appHref}>{user ? "Open GapMap" : "Try the demo"}</ButtonLink>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="grid-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <FadeIn>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-600" /> AI for learning from exams already taken
              </span>
              <h1 className="mt-5 text-[40px] leading-[1.08] font-bold tracking-tight text-navy sm:text-[56px]">
                Every gap gets a <span className="relative whitespace-nowrap text-primary-600">next step<svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden><path d="M2 7 Q 60 1 100 5 T 198 4" stroke="#FDBA74" strokeWidth="4" fill="none" strokeLinecap="round" /></svg></span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-ink-2">
                A marked paper tells students where they lost marks. GapMap tells them what to practise next — using their own answer, the
                instructor&apos;s marking criteria and the lecture slides — then checks whether it helped.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={appHref} size="lg">
                  {user ? "Open GapMap" : "Try the live demo"} <ArrowRight size={18} aria-hidden />
                </ButtonLink>
                <ButtonLink href="#how" variant="secondary" size="lg">
                  See how it works
                </ButtonLink>
              </div>
              <p className="mt-5 text-sm text-ink-2">Works with handwritten papers that are never returned to students.</p>
            </FadeIn>
            <FadeIn delay={0.15}>
              <HeroDemo />
            </FadeIn>
          </div>
        </section>

        <section className="border-y border-line bg-ground">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-10 sm:grid-cols-3">
            {[
              ["Handwritten exams", "Most papers are written by hand and never returned."],
              ["A grade, not a plan", "Students see a number, not which idea they're missing."],
              ["Patterns stay hidden", "Instructors can't see which misreading cost the class marks."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 0.08} className="px-2 py-3 sm:px-6">
                <p className="text-sm font-semibold tracking-wide text-partial uppercase">The problem</p>
                <p className="mt-2 text-lg font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-6 text-ink-2">{b}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-primary-600 uppercase">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">From a marked paper to a measured improvement</h2>
          </Reveal>
          <ol className="mt-12 grid gap-5 md:grid-cols-5">
            {steps.map((st, i) => (
              <Reveal key={st.title} delay={i * 0.07}>
                <li className="group relative flex h-full flex-col gap-3 rounded-sheet border border-line bg-white p-5 transition hover:-translate-y-1 hover:shadow-lift">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white">
                    <st.icon size={20} aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-ink-3">Step {i + 1}</span>
                  <h3 className="text-base leading-snug font-semibold">{st.title}</h3>
                  <p className="text-sm leading-6 text-ink-2">{st.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="instructors" className="scroll-mt-20 bg-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <p className="text-sm font-semibold tracking-wide text-marker uppercase">For instructors</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Review a class in an afternoon, then decide what to reteach</h2>
              <p className="mt-4 leading-7 text-[#c7cbd4]">
                Scan beside transcription, each criterion with the student&apos;s own words, one click to approve. Then see which concept and
                which misunderstanding cost the class the most marks.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {instructorFeatures.map((f, i) => (
                <Reveal key={f.title} delay={i * 0.06}>
                  <div className="h-full rounded-sheet border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
                    <f.icon size={20} className="text-marker" aria-hidden />
                    <h3 className="mt-3 font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#c7cbd4]">{f.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="students" className="mx-auto grid max-w-6xl scroll-mt-20 gap-12 px-5 py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="order-2 grid gap-4 sm:grid-cols-2 lg:order-1">
            {studentFeatures.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div className="h-full rounded-sheet border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <f.icon size={20} className="text-primary-600" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-2">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="order-1 lg:order-2">
            <p className="text-sm font-semibold tracking-wide text-met uppercase">For students</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">One next step at a time, never a wall of feedback</h2>
            <p className="mt-4 leading-7 text-ink-2">
              The report opens on the single most useful thing to do next, with the slide beside it. A quick question finds what you were really
              thinking, and a fresh test shows whether it clicked.
            </p>
          </Reveal>
        </section>

        <section className="border-y border-line bg-ground">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
            {principles.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06} className="flex gap-3">
                <p.icon size={22} className="mt-0.5 shrink-0 text-primary-600" aria-hidden />
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-2">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-primary-600 uppercase">For universities</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Start with one course for one term</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {[
              { name: "Pilot", tag: "One term", body: "One or two courses, full paper analysis, student revision and instructor insights. We measure review time and retest gains with you.", cta: "Request a pilot" },
              { name: "University", tag: "Per active student, per term", body: "Every course in a faculty, coordinator analytics, early-support alerts, SSO and data-retention controls.", cta: "Talk to us", featured: true },
              { name: "Partner companies", tag: "After two terms of records", body: "Post vacancies mapped to course skills and receive faculty-reviewed nominations backed by assessed work.", cta: "Join the waitlist" },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 0.08}>
                <div className={`flex h-full flex-col gap-3 rounded-sheet border p-6 ${p.featured ? "border-2 border-primary-600 shadow-lift" : "border-line"}`}>
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <p className="text-sm font-semibold text-primary-700">{p.tag}</p>
                  <p className="flex-1 text-sm leading-6 text-ink-2">{p.body}</p>
                  <ButtonLink href="/login" variant={p.featured ? "primary" : "secondary"}>
                    {p.cta}
                  </ButtonLink>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="px-5 pb-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-primary-700 px-8 py-14 text-white sm:px-14">
            <div className="grid-dots absolute inset-0 opacity-25" aria-hidden />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">See one answer go from paper to progress</h2>
                <p className="mt-2 text-primary-100">Sign in with a demo account — no setup needed.</p>
              </div>
              <ButtonLink href={appHref} size="lg" className="bg-white text-primary-800 hover:bg-primary-50">
                Open the demo <ArrowRight size={18} aria-hidden />
              </ButtonLink>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-2">
          <Logo />
          <p>Built by the Genesis Team for the AUF AI Educathon 2026.</p>
        </div>
      </footer>
    </div>
  );
}
