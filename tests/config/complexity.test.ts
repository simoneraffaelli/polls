import { ESLint } from "eslint";
import { expect, it } from "vitest";

it("enforces complexity and size on TypeScript and TSX using the project configuration", async () => {
  const eslint = new ESLint();
  async function violations(source: string, filePath: string) {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.filter((message) =>
      ["complexity", "max-lines-per-function", "max-lines"].includes(
        message.ruleId ?? "",
      ),
    );
  }
  const branches = (count: number) =>
    Array.from(
      { length: count },
      (_, index) => `if (value === ${index}) return ${index};`,
    ).join("\n");
  // A function starts at one path; nineteen decisions reach the allowed boundary.
  expect(
    await violations(
      `export function score(value: number) { ${branches(19)} return -1; }`,
      "src/platform/example.ts",
    ),
  ).toEqual([]);
  const complex = await violations(
    `export function Score({ value }: { value: number }) { ${branches(20)} return <span>{value}</span>; }`,
    "src/ui/example.tsx",
  );
  expect(complex.map((message) => message.ruleId)).toEqual(["complexity"]);
  expect(complex[0].severity).toBe(2);
  const longFunction = await violations(
    `export function score() {\n${"void 0;\n".repeat(199)}}`,
    "src/platform/example.ts",
  );
  expect(longFunction.map((message) => message.ruleId)).toEqual([
    "max-lines-per-function",
  ]);
  const longModule = await violations(
    "void 0;\n".repeat(501),
    "src/platform/example.ts",
  );
  expect(longModule.map((message) => message.ruleId)).toEqual(["max-lines"]);
  expect(
    await violations(
      `${"// explanation\n\n".repeat(501)}export const value = 1;`,
      "src/platform/example.ts",
    ),
  ).toEqual([]);
}, 60_000);
