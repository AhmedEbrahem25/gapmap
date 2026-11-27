import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { FileSpreadsheet, ScanLine, TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { examWithAccess } from "@/lib/data";
import { examQuestions } from "@/lib/jobs";
import { aiEnabled } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { UploadDropzone } from "@/components/instructor/upload-dropzone";
import { LiveRefresh } from "@/components/live-refresh";
import { ExamSteps } from "../steps";

export const metadata: Metadata = { title: "Student papers" };

const busy = ["uploaded", "segmented", "transcribed"];

export default async function UploadPage({ params }: PageProps<"/instructor/exams/[examId]/upload">) {
  const user = await requireRole("instructor", "ta", "admin");
  const { examId } = await params;
  const { exam, course } = examWithAccess(user, examId);
  const questions = examQuestions(examId);
  const papers = db
    .select({ paper: s.papers, student: s.users.name })
    .from(s.papers)
    .leftJoin(s.users, eq(s.users.id, s.papers.studentId))
    .where(eq(s.papers.examId, examId))
    .orderBy(asc(s.papers.createdAt))
    .all();
  const answers = papers.length
    ? db.select({ paperId: s.answers.paperId, transcription: s.answers.transcription, lowConfidence: s.answers.lowConfidence, status: s.answers.status }).from(s.answers).where(inArray(s.answers.paperId, papers.map((p) => p.paper.id))).all()
    : [];
  const students = db
    .select({ id: s.users.id, name: s.users.name, section: s.enrollments.section })
    .from(s.enrollments)
    .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
    .where(and(eq(s.enrollments.courseId, course.id), eq(s.enrollments.role, "student")))
    .orderBy(asc(s.users.name))
    .all();
  const sections = Array.from(new Set([...students.map((x) => x.section), ...papers.map((p) => p.paper.section)])).sort();
  const processing = papers.some((p) => busy.includes(p.paper.status));
  const ready = answers.filter((a) => a.status === "analysed").length;
  const recent = papers.filter((p) => p.paper.filePath).slice(-6).reverse();

  return (
    <>
      <LiveRefresh active={processing} />
      <PageHeader crumb={<>Exams / {course.title}</>} title={`${exam.title} · written answers`} />
      <ExamSteps examId={examId} current="upload" done={["rubric", ...(papers.length ? ["upload"] : [])]} />

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Upload" className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
          <UploadDropzone
            endpoint="/api/papers"
            fields={{ examId }}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            title="Upload marked papers"
            hint={`Scan each paper after you mark it: one PDF or photo per student. GapMap reads the printed questions, the handwritten answer and your mark, never the student's name. Leave the cover page out, and pick the student below or name files like mariam-adel.pdf.${aiEnabled() ? "" : " Demo mode: add a free GEMINI_API_KEY to read scans; otherwise a TA types the answer and your mark in."}`}
            icon={<ScanLine size={28} aria-hidden />}
          >
            <div className="mb-3 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">Section</span>
                <select name="section" className="h-9 rounded-lg border border-[#9ca3af] px-2">
                  {sections.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">Student (single paper)</span>
                <select name="studentId" className="h-9 max-w-[220px] rounded-lg border border-[#9ca3af] px-2">
                  <option value="">Match from the file name</option>
                  {students.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </UploadDropzone>

          {recent.length ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Latest uploads</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {recent.map((p) => (
                  <li key={p.paper.id} className="flex items-center justify-between gap-3 border-t border-line-2 pt-2 first:border-0 first:pt-0">
                    <span className="min-w-0 truncate">
                      {p.paper.fileName} <span className="text-ink-2">· {p.student ?? "student not matched yet"}</span>
                    </span>
                    {p.paper.status === "failed" ? (
                      <Badge tone="missing" className="max-w-[240px] truncate">
                        Failed: {p.paper.error}
                      </Badge>
                    ) : busy.includes(p.paper.status) ? (
                      <Badge tone="primary">Processing · {p.paper.status}</Badge>
                    ) : (
                      <Badge tone="met">Ready</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-ink-2" aria-hidden />
              <h2 className="text-sm font-semibold">No scans? Import reviewed marks</h2>
            </div>
            <p className="text-[13px] text-ink-2">
              CSV with columns <code className="font-mono">email,{questions.map((q) => `Q${q.number}`).join(",")}</code>. Imported marks are released straight away and count towards mastery and alerts.
            </p>
            <UploadDropzone endpoint="/api/import-csv" fields={{ examId }} accept=".csv,text/csv" title="Drop a CSV of marks" hint="One row per student" multiple={false} icon={<FileSpreadsheet size={24} aria-hidden />} />
          </Card>
        </section>

        <Stagger className="flex w-full flex-col gap-4 lg:max-w-[400px]">
          {sections.map((sec) => {
            const ps = papers.filter((p) => p.paper.section === sec && p.paper.fileName !== null && !p.paper.fileName.endsWith(".csv"));
            const ids = new Set(ps.map((p) => p.paper.id));
            const as = answers.filter((a) => ids.has(a.paperId));
            const split = ps.filter((p) => p.paper.status !== "uploaded").length;
            const read = ps.filter((p) => !["uploaded", "segmented"].includes(p.paper.status)).length;
            const matched = ps.filter((p) => ["analysed", "reviewed", "released"].includes(p.paper.status)).length;
            const hard = as.filter((a) => a.status === "analysed" && a.lowConfidence.length > 0).reduce((n, a) => n + a.lowConfidence.length, 0);
            const pctOf = (n: number) => (ps.length ? (n / ps.length) * 100 : 0);
            return (
              <StaggerItem key={sec}>
                <Card className="flex flex-col gap-3.5 p-5">
                  <div className="flex items-center justify-between">
                    <strong className="text-[15px]">
                      Section {sec} · {ps.length} papers
                    </strong>
                    <Badge tone={ps.some((p) => busy.includes(p.paper.status)) ? "primary" : "met"}>{ps.some((p) => busy.includes(p.paper.status)) ? "Processing" : "Ready"}</Badge>
                  </div>
                  {[
                    ["Split by question", split],
                    ["Answers and your marks read", read],
                    ["Diagnosed against criteria", matched],
                  ].map(([label, n], i) => (
                    <div key={label as string} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span>{label}</span>
                        <span>
                          {n} / {ps.length}
                        </span>
                      </div>
                      <AnimatedBar value={pctOf(n as number)} color={pctOf(n as number) >= 100 ? "#0F766E" : "#B51834"} delay={0.1 + i * 0.1} />
                    </div>
                  ))}
                  {hard ? (
                    <p className="flex gap-1.5 text-[13px] leading-5 text-partial">
                      <TriangleAlert size={16} className="shrink-0" aria-hidden /> {hard} line{hard > 1 ? "s were" : " was"} hard to read and {hard > 1 ? "are" : "is"} waiting for a TA.
                    </p>
                  ) : null}
                </Card>
              </StaggerItem>
            );
          })}
          <ButtonLink href={`/instructor/exams/${examId}/review`} size="lg">
            Start reviewing ({ready} ready)
          </ButtonLink>
        </Stagger>
      </div>
    </>
  );
}
