import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { SESSION_COOKIE, verifySession, homeFor } from "./session";
import type { Role } from "./db/schema";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  companyId: string | null;
  recruitOptIn: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    companyId: user.companyId,
    recruitOptIn: user.recruitOptIn,
  };
});

/** Data Access Layer guard: every page and action calls this before touching data. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // A valid cookie whose user is gone (e.g. after "Reset demo data") must be cleared, or /login bounces straight back.
  if (!user) redirect((await cookies()).has(SESSION_COOKIE) ? "/login?expired=1" : "/login");
  if (roles.length && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
