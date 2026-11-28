import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { profileFor } from "@/lib/student";
import { PROFILE_QUESTIONS } from "@/lib/profile-questions";
import { StudentHeader } from "@/components/shell/student-header";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetProfile, saveProfile } from "@/lib/actions/student";

export const metadata: Metadata = { title: "How you study" };

export default async function ProfilePage({ searchParams }: PageProps<"/student/profile">) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const profile = profileFor(user.id);
  const next = typeof sp.next === "string" ? sp.next : "/student/me";
  return (
    <>
      <StudentHeader back={next} eyebrow="Study check-in · 5 questions" title="How do you like to study?" />
      <form action={saveProfile} className="flex flex-col gap-4 px-5">
        <input type="hidden" name="next" value={next} />
        <p className="text-sm leading-[21px] text-ink-2">
          Five taps, and you can skip any of them. GapMap uses this only to order your plan and choose activities. It describes habits, not ability, stays on GapMap&apos;s server and is never sent to the AI.
        </p>
        <Stagger className="flex flex-col gap-4">
          {PROFILE_QUESTIONS.map((q, i) => (
            <StaggerItem key={q.key}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">
                  <span className="mr-1.5 text-primary-600">{i + 1}.</span>
                  {q.label}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <label key={o.value} className="cursor-pointer">
                      <input type="radio" name={q.key} value={o.value} defaultChecked={profile?.answers[q.key] === o.value} className="peer sr-only" />
                      <span className="inline-flex min-h-10 items-center rounded-full border border-[#9ca3af] bg-white px-3.5 text-sm transition peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:font-semibold peer-checked:text-primary-800 peer-focus-visible:shadow-glow">
                        {o.label}
                      </span>
                    </label>
                  ))}
                  <label className="cursor-pointer">
                    <input type="radio" name={q.key} value="skip" defaultChecked={!!profile && !profile.answers[q.key]} className="peer sr-only" />
                    <span className="inline-flex min-h-10 items-center rounded-full border border-dashed border-[#9ca3af] bg-white px-3.5 text-sm text-ink-2 transition peer-checked:border-ink-2 peer-checked:bg-ground peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:shadow-glow">
                      Skip
                    </span>
                  </label>
                </div>
              </fieldset>
            </StaggerItem>
          ))}
        </Stagger>
        <SubmitButton size="lg" pendingText="Saving…">
          Save my study profile
        </SubmitButton>
      </form>
      {profile ? (
        <form action={resetProfile} className="mt-3 flex flex-col items-center gap-1 px-5 pb-4">
          <SubmitButton variant="ghost" size="sm" pendingText="Resetting…">
            Reset my check-in
          </SubmitButton>
          <p className="text-center text-xs text-ink-2">Deletes these answers. Your marks and practice stay.</p>
        </form>
      ) : null}
    </>
  );
}
