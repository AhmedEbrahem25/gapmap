import { test, expect } from "@playwright/test";

test("guided demo: the landing tour hands over, then the guide follows the story across accounts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take the tour" }).first().click();
  const tour = page.getByRole("dialog");
  for (const title of ["How it works", "For lecturers", "For students", "Private and in control", "See the whole story"]) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#tour-title")).toHaveText(title);
  }
  await tour.getByRole("button", { name: "Start the guided demo" }).click();

  const guide = page.getByRole("dialog", { name: "Guided demo" });
  await page.waitForURL(/\/login/);
  await expect(guide).toContainText("1 of 12");
  await page.getByRole("button", { name: /Dr\. Karim Nour/ }).click();
  await expect(guide).toContainText("2 of 12");
  await page.getByRole("link", { name: "Exams" }).first().click();
  await expect(guide).toContainText("3 of 12");
  await page.getByRole("link", { name: "Review · Midterm exam" }).click();
  await expect(guide).toContainText("4 of 12");
  for (const n of [5, 6, 7, 8]) {
    await guide.getByRole("button", { name: "Next" }).click();
    await expect(guide).toContainText(`${n} of 12`);
  }
  await expect(guide).toContainText("8 of 12");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(guide).toContainText("9 of 12");
  await page.getByRole("button", { name: /Mariam Adel/ }).click();
  await expect(guide).toContainText("10 of 12");
  // Whatever Mariam's next step is (it depends on what earlier runs did), the lit-up button opens it.
  await page.locator('[data-tour="next-step"] :is(a, button)').last().click();
  await expect(guide).toContainText("11 of 12");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("12 of 12");
  await guide.getByRole("button", { name: "Finish" }).click();
  await expect(guide).toBeHidden();
});
