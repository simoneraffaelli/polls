import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("confini degli import", () => {
  it("blocca una dipendenza relativa dal dominio verso l'app", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText('import "../../app/page";', {
      filePath: "src/platform/countries/example.ts",
    });
    expect(
      result.messages.some(
        (message) => message.ruleId === "import/no-restricted-paths",
      ),
    ).toBe(true);
  }, 15_000);

  it("blocca la stessa dipendenza attraverso l'alias", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText('import "@/app/page";', {
      filePath: "src/platform/countries/example.ts",
    });
    expect(
      result.messages.some(
        (message) => message.ruleId === "import/no-restricted-paths",
      ),
    ).toBe(true);
  }, 15_000);

  it("blocca Next.js nel dominio", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText('import Link from "next/link";', {
      filePath: "src/platform/countries/example.ts",
    });
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  }, 15_000);
});
