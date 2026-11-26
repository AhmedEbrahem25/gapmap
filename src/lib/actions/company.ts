"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { audit } from "@/lib/data";

export async function requestInterview(formData: FormData) {
  const user = await requireRole("company");
  const id = String(formData.get("nominationId"));
  const n = db
    .select({ n: s.nominations, companyId: s.vacancies.companyId })
    .from(s.nominations)
    .innerJoin(s.vacancies, eq(s.vacancies.id, s.nominations.vacancyId))
    .where(eq(s.nominations.id, id))
    .get();
  if (!n || n.companyId !== user.companyId) return;
  const status = formData.get("decision") === "decline" ? "declined" : "interview";
  db.update(s.nominations).set({ status }).where(eq(s.nominations.id, id)).run();
  audit(user.id, `nomination_${status}`, id);
  revalidatePath("/company");
}

export async function createVacancy(formData: FormData) {
  const user = await requireRole("company");
  if (!user.companyId) return;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!title || !skills.length) return;
  const concepts = db.select().from(s.concepts).all();
  const conceptIds = concepts
    .filter((c) => skills.some((sk) => sk.toLowerCase().includes(c.name.toLowerCase().replace(/s$/, "")) || c.name.toLowerCase().includes(sk.toLowerCase())))
    .map((c) => c.id);
  db.insert(s.vacancies)
    .values({
      id: crypto.randomUUID(),
      companyId: user.companyId,
      title,
      description: description || title,
      skills,
      conceptIds,
      closes: String(formData.get("closes") ?? "") || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    })
    .run();
  revalidatePath("/company");
}

export async function closeVacancy(formData: FormData) {
  const user = await requireRole("company");
  const id = String(formData.get("vacancyId"));
  db.update(s.vacancies).set({ status: "closed" }).where(and(eq(s.vacancies.id, id), eq(s.vacancies.companyId, user.companyId ?? "-"))).run();
  revalidatePath("/company");
}
