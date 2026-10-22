import { provisionAdmin } from "../infrastructure/auth/provision";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  if (!email || !name || !password || process.argv.length !== 2) {
    throw new Error(
      "Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD in the process environment; do not pass secrets as arguments",
    );
  }
  const result = await provisionAdmin({ email, name, password });
  process.stdout.write(`Administrator provisioned: ${result.userId}\n`);
}

main().catch((error: unknown) => {
  const safeMessages = new Set([
    "Account already exists; no role change was made",
    "Invalid administrator password length",
    "Account could not be provisioned",
    "Administrator provisioning did not complete",
  ]);
  const message =
    error instanceof Error && safeMessages.has(error.message)
      ? error.message
      : "Administrator provisioning failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
