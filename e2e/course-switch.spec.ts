import { test, expect } from "@playwright/test";

test("a student switches course from the chips, on every tab", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Mariam Adel/ }).click();
  await page.waitForURL(/\/student/);
  const chips = page.getByRole("navigation", { name: "Course" });
  for (const path of ["/student", "/student/plan", "/student/practice"]) {
    await page.goto(path);
    await chips.getByRole("link", { name: "Software Engineering" }).click();
    await expect(chips.getByRole("link", { name: "Software Engineering" })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await chips.getByRole("link", { name: "Database Systems" }).click();
    await expect(chips.getByRole("link", { name: "Database Systems" })).toHaveAttribute("aria-current", "page");
  }
});
