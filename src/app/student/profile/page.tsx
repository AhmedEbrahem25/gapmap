import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { profileFor } from "@/lib/student";
import { PROFILE_QUESTIONS } from "@/lib/profile-questions";
import { StudentHeader } from "@/components/shell/student-header";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveProfile } from "@/lib/actions/student";

export const metadata: Metadata = { title: "How you study" };

const placeholders: Record<string, string> = {
  recent: "I tried the queries myself before reading the slides…",
  stuck: "I look for a worked example, or try changing one thing to see what happens",
  start: "I like to try a small example first",
  time: "About 30 minutes on weekdays",
};

export default async function ProfilePage({ searchParams }: PageProps<"/student/profile">) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const profile = profileFor(user.id);
  const next = typeof sp.next === "string" ? sp.next : "/student/me";
  return (
    <>
      <StudentHeader back={next} eyebrow="Study profile · 1 minute" title="How do you like to study?" />
      <form action={saveProfile} className="flex flex-col gap-4 px-5">
        <input type="hidden" name="next" value={next} />
        <p className="text-sm leading-[21px] text-ink-2">
          GapMap uses this only to choose activities for you. It describes habits, not ability, and you can change it any time.
        </p>
        <Stagger className="flex flex-col gap-4">
          {PROFILE_QUESTIONS.map((q, i) => (
            <StaggerItem key={q.key}>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">
                  <span className="mr-1.5 text-primary-600">{i + 1}.</span>
                  {q.label}
                </span>
                <textarea
                  name={q.key}
                  rows={2}
                  required
                  defaultValue={profile?.answers[q.label] ?? ""}
                  placeholder={placeholders[q.key]}
                  className="resize-none rounded-[10px] border border-[#9ca3af] bg-white px-3 py-2.5 text-[15px] outline-none focus:border-primary-600 focus:shadow-glow"
                />
              </label>
            </StaggerItem>
          ))}
        </Stagger>
        <SubmitButton size="lg" pendingText="Building your profile…">
          Save my study profile
        </SubmitButton>
      </form>
    </>
  );
}
