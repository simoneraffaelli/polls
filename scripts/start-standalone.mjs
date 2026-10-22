import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = join(projectRoot, ".next", "standalone");
const serverFile = join(standaloneRoot, "server.js");
const staticSource = join(projectRoot, ".next", "static");

if (!existsSync(serverFile) || !existsSync(staticSource)) {
  throw new Error("Build standalone assente: eseguire prima pnpm build.");
}

process.env.HOSTNAME ??= "127.0.0.1";

mkdirSync(join(standaloneRoot, ".next"), { recursive: true });
cpSync(staticSource, join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});

const publicSource = join(projectRoot, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  });
}

await import(pathToFileURL(serverFile).href);
