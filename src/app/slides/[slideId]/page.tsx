import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/motion";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Lecture slide" };

export default async function SlidePage({ params, searchParams }: PageProps<"/slides/[slideId]">) {
  const user = await requireRole();
  const { slideId } = await params;
  const sp = await searchParams;
  const row = db
    .select({ slide: s.slides, lecture: s.lectures })
    .from(s.slides)
    .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
    .where(eq(s.slides.id, slideId))
    .get();
  if (!row) notFound();
  const { slide, lecture } = row;
  const allowed =
    staffCourses(user).some((c) => c.id === lecture.courseId) ||
    !!db
      .select()
      .from(s.enrollments)
      .where(and(eq(s.enrollments.courseId, lecture.courseId), eq(s.enrollments.userId, user.id)))
      .get();
  if (!allowed) notFound();

  const siblings = db.select({ id: s.slides.id, page: s.slides.page }).from(s.slides).where(eq(s.slides.lectureId, lecture.id)).orderBy(asc(s.slides.page)).all();
  const idx = siblings.findIndex((x) => x.id === slide.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const tags = db
    .select({ name: s.concepts.name, status: s.slideConcepts.status })
    .from(s.slideConcepts)
    .innerJoin(s.concepts, eq(s.concepts.id, s.slideConcepts.conceptId))
    .where(eq(s.slideConcepts.slideId, slide.id))
    .all();
  const back = typeof sp.from === "string" && sp.from.startsWith("/") ? sp.from : user.role === "student" ? "/student" : `/instructor/courses/${lecture.courseId}?lecture=${lecture.id}`;
  const keep = typeof sp.from === "string" ? `?from=${encodeURIComponent(sp.from)}` : "";
  const bullets = slide.body.split(/(?<=[.:;])\s+(?=[A-Z{])/).filter(Boolean);

  return (
    <div className="min-h-screen bg-ground">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-8">
        <Link href={back} className="inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink hover:bg-ground">
          <ArrowLeft size={18} aria-hidden /> Back
        </Link>
        <Logo className="hidden sm:inline-flex" />
        <span className="text-sm text-ink-2">
          Lecture {lecture.number} · slide {slide.page} of {siblings.length}
        </span>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 sm:px-8">
        <FadeIn key={slide.id}>
          <article className="relative aspect-[16/10] w-full overflow-hidden rounded-sheet border border-line bg-white p-6 shadow-lift sm:p-12">
            <div className="absolute top-0 left-0 h-1.5 w-full bg-primary-600" aria-hidden />
            <p className="text-xs font-semibold tracking-[0.06em] text-primary-700 uppercase">
              L{lecture.number} · {lecture.title}
            </p>
            <h1 className="mt-3 text-2xl leading-tight font-bold sm:text-4xl">{slide.title}</h1>
            <ul className="mt-5 flex flex-col gap-3 text-base leading-relaxed text-[#1f2937] sm:text-lg">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marker" aria-hidden />
                  <span className={/SELECT|PRIMARY KEY|JOIN/.test(b) ? "font-mono text-sm sm:text-base" : ""}>{b}</span>
                </li>
              ))}
            </ul>
          </article>
        </FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t.name} tone={t.status === "suggested" ? "ai" : "primary"}>
                {t.name}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            {prev ? (
              <Link href={`/slides/${prev.id}${keep}`} aria-label="Previous slide" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:bg-ground">
                <ChevronLeft size={18} />
              </Link>
            ) : null}
            {next ? (
              <Link href={`/slides/${next.id}${keep}`} aria-label="Next slide" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:bg-ground">
                <ChevronRight size={18} />
              </Link>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
