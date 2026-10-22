import { expect, test } from "@playwright/test";

const questionId = process.env.E2E_SCENARIO_ID;
if (process.env.CI === "true" && !questionId)
  throw new Error("CI scenario E2E requires a synthetic published question");
test.skip(!questionId, "Scenario E2E requires a disposable published fixture");

test("shows the published forecast, uncertainty and actual publication history", async ({
  page,
}) => {
  await page.goto("/usa/midterms/2026");
  const forecast = page.locator("article.content-section").filter({
    has: page.getByRole("heading", { name: "Maggioranza dei seggi" }),
  });
  await expect(forecast).toBeVisible();
  await expect(
    forecast.getByText("Modello sperimentale", { exact: false }),
  ).toBeVisible();
  await expect(forecast.getByText("Probabilità degli esiti")).toBeVisible();
  await expect(
    forecast.getByRole("table", { name: /Distribuzione seggi per partito/ }),
  ).toBeVisible();
  await expect(forecast.getByText("Provenienza degli input")).toBeVisible();
  await forecast.getByText("Cronologia delle pubblicazioni").click();
  await expect(forecast.getByText(/Run 1.*pubblicato/)).toBeVisible();
  await expect(
    forecast.getByText(/Maggioranza dei seggi: A:.*probabilità del modello/),
  ).toHaveCount(2);
});

test("calculates a bounded personal scenario without changing the published run", async ({
  page,
}) => {
  await page.goto(`/usa/midterms/2026/scenarios?question=${questionId}`);
  await expect(
    page.getByRole("heading", { name: "Maggioranza dei seggi" }),
  ).toBeVisible();
  const calculator = page.locator(
    'section[aria-labelledby="scenario-calculator-title"]',
  );
  await expect(
    calculator.getByRole("heading", { name: "Scenario personale" }),
  ).toBeVisible();
  const published = page
    .getByText(/Maggioranza dei seggi: A: probabilità del modello/)
    .first();
  const original = await published.textContent();
  await calculator
    .getByRole("button", { name: "Calcola 1.000 simulazioni" })
    .click();
  await expect(
    calculator.getByText(/Scenario dell’utente con variazione di 0.0/),
  ).toBeVisible();
  await expect(
    calculator.getByText(/Maggioranza dei seggi: A: probabilità del modello/),
  ).toBeVisible();
  const slider = calculator.getByRole("slider");
  for (let step = 0; step < 4; step += 1) await slider.press("ArrowRight");
  await expect(
    calculator.getByText(/Scenario dell’utente con variazione/),
  ).toHaveCount(0);
  await calculator
    .getByRole("button", { name: "Calcola 1.000 simulazioni" })
    .click();
  await expect(
    calculator.getByText(/Scenario dell’utente con variazione di 2.0/),
  ).toBeVisible();
  await calculator.getByRole("button", { name: "Annulla e azzera" }).click();
  await expect(
    calculator.getByText(/Scenario dell’utente con variazione/),
  ).toHaveCount(0);
  expect(await published.textContent()).toBe(original);
});
