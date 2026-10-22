import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const infrastructurePaths = [
  "./src/app",
  "./src/composition",
  "./src/infrastructure",
  "./src/integrations",
  "./src/worker",
];

const modulesRoot = path.join(process.cwd(), "src/modules");
const modulePaths = existsSync(modulesRoot)
  ? readdirSync(modulesRoot, { withFileTypes: true })
      .filter((country) => country.isDirectory())
      .flatMap((country) =>
        readdirSync(path.join(modulesRoot, country.name), {
          withFileTypes: true,
        })
          .filter((section) => section.isDirectory())
          .map((section) => `./src/modules/${country.name}/${section.name}`),
      )
  : [];

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/platform",
              from: [
                ...infrastructurePaths,
                "./src/ui",
                "./src/elections",
                "./src/modules",
              ],
              message:
                "La piattaforma non dipende da UI, infrastruttura o moduli elettorali.",
            },
            {
              target: "./src/elections",
              from: [...infrastructurePaths, "./src/ui", "./src/modules"],
              message:
                "Il dominio elettorale condiviso non dipende da adapter o moduli.",
            },
            {
              target: "./src/modules",
              from: infrastructurePaths,
              message: "I moduli non importano dettagli tecnici o rotte.",
            },
            {
              target: [
                "./src/modules/**/domain/**",
                "./src/modules/**/application/**",
                "./src/modules/**/forecasting/**",
                "./src/modules/**/definition.ts",
              ],
              from: "./src/ui",
              message:
                "Soltanto la presentazione del modulo può usare la UI comune.",
            },
            {
              target: "./src/ui",
              from: [
                "./src/infrastructure",
                "./src/integrations",
                "./src/worker",
                "./src/modules",
              ],
              message:
                "I componenti comuni ricevono dati di presentazione, non servizi o adapter.",
            },
            ...modulePaths.flatMap((target) =>
              modulePaths
                .filter((source) => source !== target)
                .map((source) => ({
                  target,
                  from: source,
                  message:
                    "Un modulo non importa gli interni di un altro modulo.",
                })),
            ),
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/platform/**/*.{ts,tsx}",
      "src/elections/**/*.{ts,tsx}",
      "src/modules/**/domain/**/*.{ts,tsx}",
      "src/modules/**/forecasting/**/*.{ts,tsx}",
      "src/modules/**/definition.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
              ],
              message: "Il dominio non importa framework web.",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "pg", "pg-boss"],
              message: "Il dominio non importa persistenza o coda.",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    ".tools/**",
    "dist-worker/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
