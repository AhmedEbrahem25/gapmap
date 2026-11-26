import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { key: "rubric", label: "Model answer & rubric", href: "" },
  { key: "upload", label: "Student papers", href: "/upload" },
  { key: "review", label: "Review & release", href: "/review" },
] as const;

export function ExamSteps({ examId, current, done }: { examId: string; current: (typeof steps)[number]["key"]; done: string[] }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-2 text-sm">
      {steps.map((st, i) => {
        const isCurrent = st.key === current;
        const isDone = done.includes(st.key) && !isCurrent;
        return (
          <li key={st.key}>
            <Link
              href={`/instructor/exams/${examId}${st.href}`}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-3.5 py-2 font-semibold transition",
                isCurrent ? "bg-primary-600 text-white shadow-[0_6px_16px_-6px_rgb(36_69_216/0.6)]" : isDone ? "bg-met-soft text-met" : "border border-line bg-white font-normal text-[#374151] hover:border-primary-200",
              )}
            >
              {isDone ? <Check size={14} strokeWidth={3} aria-hidden /> : <span>{i + 1}</span>}
              {st.label}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
