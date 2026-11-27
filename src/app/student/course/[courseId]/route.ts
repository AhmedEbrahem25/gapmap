import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { studentCourses } from "@/lib/data";
import { COURSE_COOKIE } from "@/lib/student";

/** Switches the course a student is looking at, then returns to the page they came from. */
export async function GET(req: Request, ctx: RouteContext<"/student/course/[courseId]">) {
  const { courseId } = await ctx.params;
  const user = await getCurrentUser();
  const next = new URL(req.url).searchParams.get("next") ?? "/student";
  // A relative Location: behind a host's proxy, req.url carries the internal address (e.g. localhost:10000).
  const res = new NextResponse(null, { status: 303, headers: { Location: next.startsWith("/student") ? next : "/student" } });
  if (user?.role === "student" && studentCourses(user.id).some((c) => c.course.id === courseId)) {
    res.cookies.set(COURSE_COOKIE, courseId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 180 });
  }
  return res;
}
