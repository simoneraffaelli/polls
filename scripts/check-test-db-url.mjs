const value = process.env.TEST_DATABASE_URL;
if (!value) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL integration tests",
  );
}

let parsed;
try {
  parsed = new URL(value);
} catch {
  throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
}

const databaseName = decodeURIComponent(parsed.pathname.slice(1));
if (
  !/^(postgres|postgresql):$/.test(parsed.protocol) ||
  !/test/i.test(databaseName)
) {
  throw new Error("TEST_DATABASE_URL must identify a dedicated test database");
}
