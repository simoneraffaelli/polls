import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const testDatabase = process.env.PGDATABASE?.includes("test") === true;
const configured = Boolean(email && password && testDatabase);
if (process.env.CI === "true" && !configured) {
  throw new Error(
    "CI admin E2E requires a disposable test database and test credentials",
  );
}
test.skip(
  !configured,
  "Admin E2E needs a provisioned disposable test database",
);

const origin = "http://127.0.0.1:3100";
const headers = { Origin: origin, "Content-Type": "application/json" };

test("authorizes only current administrators for import and respects revocation", async ({
  page,
}) => {
  const anonymous = await page.request.post("/api/admin", {
    headers,
    data: {
      action: "source.enabled",
      sourceId: randomUUID(),
      enabled: true,
      reason: "CI test",
    },
  });
  expect(anonymous.status()).toBe(401);

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(
    page.getByRole("heading", { name: "Amministrazione", level: 1 }),
  ).toBeVisible();

  const overviewResponse = await page.request.get("/api/admin");
  expect(overviewResponse.status()).toBe(200);
  const overview = (await overviewResponse.json()) as {
    sources: { id: string; providerId: string; enabled: boolean }[];
    bindings: { sourceId: string; sectionId: string; enabled: boolean }[];
  };
  const source = overview.sources.find(
    (entry) => entry.providerId === "provider:manual-import",
  );
  expect(source).toBeDefined();
  const binding = overview.bindings.find(
    (entry) =>
      entry.sourceId === source!.id &&
      entry.sectionId === "section:us:midterms",
  );
  expect(binding).toBeDefined();

  const command = async (body: unknown) =>
    page.request.post("/api/admin", { headers, data: body });
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 1,
  });
  let revokedUserId: string | null = null;
  try {
    expect(
      (
        await command({
          action: "source.enabled",
          sourceId: source!.id,
          enabled: true,
          reason: "CI import test",
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await command({
          action: "binding.enabled",
          sourceId: source!.id,
          sectionId: "section:us:midterms",
          enabled: true,
          reason: "CI import test",
        })
      ).status(),
    ).toBe(200);

    const externalId = `ci-${randomUUID()}`;
    const content = JSON.stringify([
      {
        provenance: {
          sourceId: "file-value-ignored",
          sourceUrl: `https://example.org/polls/${externalId}`,
          externalId,
          sourceRevision: "1",
          observed: {
            kind: "date_period",
            startDate: "2026-10-10",
            endDate: "2026-10-12",
          },
          declaredPublication: { kind: "date", date: "2026-10-13" },
          acquiredAt: "2000-01-01T00:00:00Z",
          ingestionRunId: "file-value-ignored",
          parserVersion: "file-value-ignored",
          transformationVersion: "file-value-ignored",
          contentHash: "0".repeat(64),
        },
        pollster: "CI test pollster",
        sponsors: ["CI sponsor"],
        questions: [
          {
            questionId: "generic-ballot",
            wording: null,
            kind: "generic_ballot",
            population: {
              kind: "registered_voters",
              description: "Registered voters",
            },
            sampleGroupId: externalId,
            sampleSize: 1000,
            options: [
              { optionId: "option-a", label: "Option A", percentage: 48 },
              { optionId: "option-b", label: "Option B", percentage: 47 },
            ],
          },
        ],
      },
    ]);
    const payload = {
      sourceId: source!.id,
      sectionId: "section:us:midterms",
      editionId: "edition:us:midterms:2026",
      raceId: null,
      format: "json",
      content,
    };
    const previewResponse = await page.request.post(
      "/api/admin/import/preview",
      { headers, data: payload },
    );
    expect(previewResponse.status()).toBe(200);
    const preview = (await previewResponse.json()) as {
      previewId: string | null;
      preview: { validRows: number; invalidRows: number };
    };
    expect(preview.preview).toMatchObject({ validRows: 1, invalidRows: 0 });
    expect(preview.previewId).toBeTruthy();
    const commitResponse = await page.request.post("/api/admin/import/commit", {
      headers,
      data: {
        ...payload,
        previewId: preview.previewId,
        reason: "CI import test",
      },
    });
    expect(commitResponse.status()).toBe(200);
    expect(await commitResponse.json()).toMatchObject({ saved: 1 });
    const pollsResponse = await page.request.get("/api/admin/polls");
    expect(pollsResponse.status()).toBe(200);
    const pollPage = (await pollsResponse.json()) as {
      items: {
        link_id: string;
        poll_id: string;
        edition_id: string;
        race_id: string | null;
        external_id: string;
      }[];
    };
    const importedLink = pollPage.items.find(
      (item) => item.external_id === externalId,
    );
    expect(importedLink).toBeDefined();
    expect(importedLink).toMatchObject({
      edition_id: payload.editionId,
      race_id: null,
    });
    const unchangedAssociation = await page.request.post("/api/admin/polls", {
      headers,
      data: {
        action: "poll.reassociate",
        scope: { sectionId: payload.sectionId, editionId: payload.editionId },
        pollId: importedLink!.poll_id,
        oldLinkId: importedLink!.link_id,
        raceId: null,
        reason: "CI unchanged association",
      },
    });
    expect(unchangedAssociation.status()).toBe(409);
    const malformedPollCommand = await page.request.post("/api/admin/polls", {
      headers,
      data: '{"action":',
    });
    expect(malformedPollCommand.status()).toBe(400);
    await page.goto("/usa/midterms/2026/polls");
    await expect(page.getByText("CI test pollster")).toBeVisible();

    const account = await pool.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [email!.toLowerCase()],
    );
    expect(account.rows).toHaveLength(1);
    revokedUserId = account.rows[0]!.id;
    await pool.query(
      "UPDATE admin_memberships SET revoked_at = clock_timestamp() WHERE user_id = $1",
      [revokedUserId],
    );
    expect(
      (
        await command({
          action: "source.excluded",
          sourceId: source!.id,
          excluded: true,
          reason: "CI revocation test",
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.get("/api/admin")).status()).toBe(403);
  } finally {
    if (revokedUserId)
      await pool.query(
        "UPDATE admin_memberships SET revoked_at = NULL WHERE user_id = $1",
        [revokedUserId],
      );
    await pool.end();
  }
});
