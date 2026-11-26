"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, schema, resetDatabase } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession, homeFor, isSecureRequest } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email: String(formData.get("email") ?? "") };
  const user = db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).get();
  if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) {
    return { error: "That email and password don't match an account.", email: parsed.data.email };
  }
  await startSession(user.id, user.role);
  db.insert(schema.auditLog).values({ id: crypto.randomUUID(), actorId: user.id, action: "login", object: "session" }).run();
  const next = parsed.data.next;
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role));
}

async function startSession(userId: string, role: schema.Role) {
  const token = await signSession({ userId, role });
  const h = await headers();
  const secure = isSecureRequest(h.get("origin"), h.get("x-forwarded-proto"));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(secure));
}

/** One-click demo sign-in. Disabled unless DEMO_MODE is on. */
export async function demoLogin(formData: FormData) {
  if (process.env.DEMO_MODE === "false") redirect("/login");
  const email = String(formData.get("email") ?? "");
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user) redirect("/login");
  await startSession(user.id, user.role);
  redirect(homeFor(user.role));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function resetDemo() {
  if (process.env.DEMO_MODE === "false") return;
  resetDatabase();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?reset=1");
}
