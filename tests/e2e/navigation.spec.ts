import { expect, test } from "@playwright/test";

test("navigates the registered hierarchy and explains the empty state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Polls");
  await expect(
    page.getByRole("heading", { name: "Nessun dato acquisito" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /USA/ }).click();
  await expect(page).toHaveURL(/\/usa$/);
  await page.getByRole("link", { name: /Midterms/ }).click();
  await expect(page).toHaveURL(/\/usa\/midterms$/);
  await page.getByRole("link", { name: /2026/ }).click();
  await expect(page).toHaveURL(/\/usa\/midterms\/2026$/);
  await expect(
    page.getByRole("navigation", { name: "Percorso" }).getByRole("link"),
  ).toHaveCount(3);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://polls.simone.ooo/usa/midterms/2026",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(
    page.getByRole("heading", { name: "Nessun dato acquisito" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("%");
});

test("does not expose future or legacy pages", async ({ request }) => {
  for (const path of [
    "/italy",
    "/midterms",
    "/usa/unknown",
    "/usa/midterms/2028",
    "/admin",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
