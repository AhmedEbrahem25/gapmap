import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./db/schema";

export const SESSION_COOKIE = "gapmap_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0123456789");
  }
  return new TextEncoder().encode(value);
}

export type SessionPayload = { userId: string; role: Role };

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.role !== "string") return null;
    return { userId: payload.userId, role: payload.role as Role };
  } catch {
    return null;
  }
}

/**
 * Secure cookies only work over https. Decide from the scheme the browser used
 * (Origin of the sign-in POST, or the proxy's X-Forwarded-Proto), so the same
 * build works on https (tunnel, hosting) and on http (localhost, phone on Wi-Fi).
 */
export function isSecureRequest(origin: string | null, forwardedProto: string | null) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (origin?.startsWith("https://")) return true;
  if (origin?.startsWith("http://")) return false;
  if (forwardedProto) return forwardedProto.split(",")[0]!.trim() === "https";
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: MAX_AGE_SECONDS };
}

export function homeFor(role: Role) {
  switch (role) {
    case "student":
      return "/student";
    case "coordinator":
      return "/coordinator";
    case "company":
      return "/company";
    default:
      return "/instructor";
  }
}
