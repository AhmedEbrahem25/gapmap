import { test, expect } from "@playwright/test";

test("guided demo: the landing tour hands over, then the visitor plays both roles", async ({ page }) => {
  await page.goto("/");
  // The first dev compile can be slow: click until the page is interactive and the tour opens.
  await expect(async () => {
    await page.getByRole("button", { name: "Take the tour" }).first().click();
    await expect(page.locator("#tour-title")).toHaveText("Welcome to GapMap", { timeout: 2000 });
  }).toPass({ timeout: 60000 });
  const tour = page.getByRole("dialog");
  for (const title of ["How it works", "For lecturers", "For students", "Private and in control", "See the whole story"]) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#tour-title")).toHaveText(title);
  }
  await tour.getByRole("button", { name: "Start the guided demo" }).click();

  // The lecturer: every step is an action the visitor takes.
  const guide = page.getByRole("dialog", { name: "Guided demo" });
  await page.waitForURL(/\/login/);
  await expect(guide).toContainText("1 of 12");
  await page.getByRole("button", { name: /Dr\. Karim Nour/ }).click();
  await expect(guide).toContainText("2 of 12");
  await page.getByRole("link", { name: "Exams" }).first().click();
  await expect(guide).toContainText("3 of 12");
  await page.getByRole("link", { name: "Review · Midterm exam" }).click();
  await expect(guide).toContainText("4 of 12");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("5 of 12");
  await page.locator('[data-tour="student-explanation"] summary').click();
  await expect(guide).toContainText("It quotes his own slide");
  await page.locator('[data-tour="approve-answer"] button').click();
  await expect(guide).toContainText("Approved. Mariam still sees nothing.");
  await page.locator('[data-tour="release"] button').click();
  await expect(guide).toContainText("Released to students.");
  await page.getByRole("button", { name: "Sign out" }).first().click();

  // The student.
  await expect(guide).toContainText("9 of 12");
  await page.getByRole("button", { name: /Mariam Adel/ }).click();
  await expect(guide).toContainText("10 of 12");
  // Whatever her next step is (it depends on earlier runs), the lit-up button opens it.
  await page.locator('[data-tour="next-step"] :is(a, button)').last().click();
  await expect(guide).toContainText(/1[12] of 12/);
  if ((await guide.textContent())?.includes("11 of 12")) {
    // Tap through: wrong taps show a hint, so keep trying the choices until the explanation shows.
    for (let i = 0; i < 12 && !(await page.locator('[data-tour="fix-done"]').count()); i++) {
      const choices = page.locator('[data-tour="taps"] button');
      const n = await choices.count();
      if (n) await choices.nth(i % n).click();
      await page.waitForTimeout(400);
    }
    await expect(guide).toContainText("She found it herself.");
  }
  await expect(guide).toContainText("12 of 12");
  await guide.getByRole("button", { name: "Finish" }).click();
  await expect(guide).toBeHidden();
});
