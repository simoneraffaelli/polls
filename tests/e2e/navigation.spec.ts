import { expect, test } from "@playwright/test";

test("navigates the registered hierarchy and explains unavailable data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Polls");
  await expect(page.getByRole("heading", { name: "Paesi" })).toBeVisible();
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
    page.getByRole("heading", { name: "Dati e significati" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("%");
  const views = page.getByRole("navigation", { name: "Viste dell'edizione" });
  await expect(views.getByRole("link")).toHaveCount(6);
  await views.getByRole("link", { name: "Camera" }).click();
  await expect(page).toHaveURL(/\/usa\/midterms\/2026\/house$/);
  await expect(
    page.getByRole("heading", { name: "Gare strutturali" }),
  ).toBeVisible();
  await expect(page.getByText(/registro dei run pubblicati/)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Percorso" }).getByRole("link"),
  ).toHaveCount(4);
  await views.getByRole("link", { name: "Sondaggi" }).click();
  await expect(
    page.getByRole("heading", { name: "Sondaggi acquisiti" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Applica filtri" }),
  ).toBeVisible();
  await views.getByRole("link", { name: "Notizie" }).click();
  await expect(
    page.getByRole("heading", { name: "Documenti dalle fonti" }),
  ).toBeVisible();
  await views.getByRole("link", { name: "Fonti e metodo" }).click();
  await expect(
    page.getByRole("heading", { name: "Fonti e metodo", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\d{1,3}%/);
  await page.goto("/usa/midterms/2026/scenarios");
  await expect(
    page.getByRole("heading", { name: "Scenari", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/snapshot sigillati/)).toBeVisible();
  await page.goto("/usa/midterms/2026/races/house-al-01");
  await expect(
    page.getByRole("heading", { name: "Camera AL-01" }),
  ).toBeVisible();
});

test("offers keyboard access to the content and edition views", async ({
  page,
}) => {
  await page.goto("/usa/midterms/2026");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Vai al contenuto" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page
    .getByRole("navigation", { name: "Viste dell'edizione" })
    .getByRole("link", { name: "Senato" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/usa\/midterms\/2026\/senate$/);
  await expect(page.getByRole("heading", { name: "Senato" })).toBeVisible();
});

test("does not expose future or legacy pages", async ({ request }) => {
  for (const path of [
    "/italy",
    "/midterms",
    "/usa/unknown",
    "/usa/midterms/2028",
    "/usa/midterms/2026/unknown",
    "/usa/midterms/2026/markets",
    "/usa/midterms/2026/races/house-unknown",
    "/usa/midterms/2026/polls/not-a-uuid",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
