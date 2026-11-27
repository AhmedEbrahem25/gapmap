import { test, expect, type Page } from "@playwright/test";

async function demoLogin(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/login/);
}

test("hackathon demo: one answer from paper to class decision", async ({ page }) => {
  // 1–3 · Instructor reviews Mariam's Q3 and releases it
  await demoLogin(page, "Dr. Karim Nour");
  await expect(page.getByRole("heading", { name: "Database Systems" })).toBeVisible();
  await page.getByRole("link", { name: "Exams" }).first().click();
  await page.getByRole("link", { name: "Review · Midterm exam" }).click();
  await expect(page.getByRole("heading", { name: /Mariam Adel/ })).toBeVisible();
  await expect(page.getByText("because it is the student number").first()).toBeVisible();
  await expect(page.getByText("What would happen if two students had the same name?")).toBeVisible();
  await page.getByRole("button", { name: "Approve & next" }).click();
  await expect(page.getByRole("button", { name: /Release 1 to students/ })).toBeVisible();
  await page.getByRole("button", { name: /Release 1 to students/ }).click();
  await expect(page.getByRole("button", { name: /Release 0 to students/ })).toBeVisible();
  await signOut(page);

  // 4 · Mariam sees her next step
  await demoLogin(page, "Mariam Adel");
  await expect(page.getByText("Your next step")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Primary keys · Q3/ })).toBeVisible();
  await page.getByRole("link", { name: "Answer one quick question" }).click();

  // 5 · Follow-up question → misconception branch
  await page.getByRole("button", { name: /could also share a number/ }).click();
  await expect(page.getByText(/A primary key must be unique/)).toBeVisible();
  await page.getByRole("link", { name: "Start the activity" }).click();

  // 6 · Experiment activity
  await expect(page.getByRole("heading", { name: "Try breaking the rule" })).toBeVisible();
  await page.getByLabel(/why did this happen/i).fill("Both rows have the same StudentID 1042, so the update changed both of them.");
  await page.getByRole("button", { name: "Check my explanation" }).click();
  await expect(page.getByText(/matched both rows/)).toBeVisible();
  await page.getByRole("button", { name: /Take a fresh test/ }).click();

  // 7 · Fresh test shows the change
  await expect(page.getByText(/Course table/)).toBeVisible();
  await page.getByLabel("Your answer").fill("CourseCode, because no two courses can share a code, and it never changes and can't be empty.");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("heading", { name: /you've got it/ })).toBeVisible();
  await page.goto("/student/me");
  await signOut(page);

  // 8 · Instructor decides what to revisit
  await demoLogin(page, "Dr. Karim Nour");
  await page.getByRole("link", { name: "Class insights" }).click();
  await expect(page.getByRole("heading", { name: /Primary keys need another pass/ })).toBeVisible();
  await expect(page.getByText("Describes the column instead of the rule")).toBeVisible();
  await page.getByRole("button", { name: "Reteach next lecture" }).click();
  await expect(page.getByText(/Decision: Reteach in the next lecture/)).toBeVisible();
});

test("socratic-style fix: lecturer approves per question, student taps through", async ({ page }) => {
  // Lecturer: Quiz 2 (MCQ) → MCQ fix chains → approve the drafted chain for Q3
  await demoLogin(page, "Dr. Karim Nour");
  await page.getByRole("link", { name: "Exams" }).first().click();
  await page.getByRole("link", { name: /Fix chains · Quiz 2/ }).click();
  await expect(page.getByText("No student data reaches the AI.")).toBeVisible();
  await expect(page.getByText("Thinks a single empty key value is harmless.")).toBeVisible();
  await page.getByRole("button", { name: "Approve 1 for Q3" }).click();
  await expect(page.getByText("All chains approved").first()).toBeVisible();
  await signOut(page);

  // Mariam: My papers → Quiz 2 → her wrong Q1 → Fix it in 2 taps
  await demoLogin(page, "Mariam Adel");
  await page.getByRole("link", { name: "My papers" }).click();
  await page.getByRole("link", { name: /Quiz 2/ }).click();
  await page.getByRole("link", { name: /Fix it in 2 taps/ }).first().click();
  await expect(page.getByRole("heading", { name: /both called Mariam Adel/ })).toBeVisible();
  await page.getByRole("button", { name: "The one added first" }).click();
  await expect(page.getByText(/Hint from the slide/)).toBeVisible();
  await page.getByRole("button", { name: "The database can't tell them apart" }).click();
  await page.getByRole("button", { name: "No two rows share its value" }).click();
  await expect(page.getByText(/The hint did its job/)).toBeVisible();
  await expect(page.getByText(/A primary key must be unique, must never be NULL/).first()).toBeVisible();
});

test("roles cannot cross into other areas", async ({ page }) => {
  await demoLogin(page, "Mariam Adel");
  await page.goto("/instructor/insights");
  await expect(page).toHaveURL(/\/student/);
  const res = await page.request.get("/api/export?course=x");
  expect(res.status()).toBe(403);
});
