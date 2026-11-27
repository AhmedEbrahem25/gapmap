import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { FadeIn } from "@/components/ui/motion";
import { LoginForm } from "./login-form";
import { demoLogin, resetDemo } from "@/lib/actions/auth";
import { GuidedDemoButton } from "@/components/guided-demo";
import { GraduationCap, Presentation, ClipboardCheck, LineChart, Building2, RotateCcw } from "lucide-react";

import { partnersEnabled } from "@/lib/features";

export const metadata: Metadata = { title: "Sign in" };

const demoAccounts = [
  { email: "dr.karim@gapmap.demo", name: "Dr. Karim Nour", role: "Instructor", icon: Presentation, note: "Review papers, class insights" },
  { email: "mariam@gapmap.demo", name: "Mariam Adel", role: "Student", icon: GraduationCap, note: "The demo student" },
  { email: "ta.nada@gapmap.demo", name: "Nada Lotfy", role: "Teaching assistant", icon: ClipboardCheck, note: "Fix transcriptions, review" },
  { email: "coordinator@gapmap.demo", name: "Dr. Hany Fawzy", role: "Coordinator", icon: LineChart, note: "Programme-level trends" },
  { email: "hr@niledata.demo", name: "Reem Saleh", role: "Partner company", icon: Building2, note: "Vacancies & nominations" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const demo = process.env.DEMO_MODE !== "false";
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-linear-to-br from-primary-600 to-primary-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="grid-dots absolute inset-0 opacity-30" aria-hidden />
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-primary-500/40 blur-3xl" aria-hidden />
        <Link href="/" className="relative">
          <Logo light />
        </Link>
        <FadeIn className="relative max-w-md">
          <p className="text-sm font-semibold tracking-wide text-marker uppercase">From marked paper to next step</p>
          <h1 className="mt-3 text-4xl leading-[1.15] font-bold">Every gap gets a slide, a question and a second chance.</h1>
          <p className="mt-4 text-base leading-6 text-primary-100">
            GapMap reads the exam your class already took, explains each lost mark with the student&apos;s own words, and checks whether
            the next step actually helped.
          </p>
        </FadeIn>
        <div className="relative rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <p className="text-sm text-primary-100">Student wrote</p>
          <p className="font-hand mt-1 text-3xl leading-9">“because it is the student number”</p>
          <p className="mt-3 text-sm text-primary-100">
            <span className="rounded bg-partial-soft px-1.5 py-0.5 text-xs font-semibold text-partial">Partial</span> &nbsp;Explain why no two students can
            share it → <span className="underline decoration-marker underline-offset-4">Lecture 4 · slide 12</span>
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <FadeIn>
            <h2 className="mt-8 text-2xl font-bold lg:mt-0">Sign in to GapMap</h2>
            <p className="mt-1 text-sm text-ink-2">Use your university email.</p>
            {sp.reset ? (
              <p role="status" className="mt-4 rounded-lg bg-met-soft px-3 py-2 text-sm text-met">
                Demo data was reset. Every account is back to its starting state.
              </p>
            ) : null}
            <LoginForm next={next} />
          </FadeIn>

          {demo ? (
            <FadeIn delay={0.1} className="mt-10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase">Demo accounts · one click</p>
                <form action={resetDemo}>
                  <button className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-primary-600" type="submit">
                    <RotateCcw size={12} aria-hidden /> Reset demo data
                  </button>
                </form>
              </div>
              <GuidedDemoButton className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-navy text-sm font-semibold text-white hover:opacity-90" />
              <ul className="mt-3 grid gap-2">
                {demoAccounts.filter((a) => partnersEnabled() || a.role !== "Partner company").map((a) => (
                  <li key={a.email}>
                    <form action={demoLogin}>
                      <input type="hidden" name="email" value={a.email} />
                      <button
                        type="submit"
                        data-tour={`demo-${a.email.split("@")[0]}`}
                        className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:-translate-y-px hover:border-primary-200 hover:shadow-lift"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white">
                          <a.icon size={18} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {a.name} <span className="font-normal text-ink-2">· {a.role}</span>
                          </span>
                          <span className="block truncate text-xs text-ink-2">{a.note}</span>
                        </span>
                        <span className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-primary-600" aria-hidden>
                          →
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-2">
                Password for every demo account: <code className="rounded bg-white px-1.5 py-0.5 font-mono text-ink">GapMap@2026</code>
              </p>
            </FadeIn>
          ) : null}
        </div>
      </main>
    </div>
  );
}
