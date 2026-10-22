import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminAudit, adminMemberships, user } from "../database/schema";
import { createProvisioningRuntime } from "./server";

const identitySchema = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120),
});

/** Creates only a fresh account; an existing account is never silently promoted. */
export async function provisionAdmin(input: {
  email: string;
  name: string;
  password: string;
}) {
  const identity = identitySchema.parse(input);
  if (input.password.length < 12 || input.password.length > 128)
    throw new Error("Invalid administrator password length");
  const runtime = createProvisioningRuntime();
  try {
    const [existing] = await runtime.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, identity.email.toLowerCase()));
    if (existing)
      throw new Error("Account already exists; no role change was made");
    let created: Awaited<ReturnType<typeof runtime.auth.api.signUpEmail>>;
    try {
      created = await runtime.auth.api.signUpEmail({
        body: {
          email: identity.email.toLowerCase(),
          name: identity.name,
          password: input.password,
        },
      });
    } catch {
      throw new Error("Account could not be provisioned");
    }
    if (!created?.user.id) throw new Error("Account could not be provisioned");
    try {
      await runtime.db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ emailVerified: true })
          .where(eq(user.id, created.user.id));
        await tx.insert(adminMemberships).values({ userId: created.user.id });
        await tx.insert(adminAudit).values({
          actorUserId: created.user.id,
          action: "admin.provision",
          targetType: "user",
          targetId: created.user.id,
        });
      });
    } catch {
      await runtime.db
        .delete(user)
        .where(eq(user.id, created.user.id))
        .catch(() => undefined);
      throw new Error("Administrator provisioning did not complete");
    }
    return { userId: created.user.id };
  } finally {
    await runtime.pool.end();
  }
}
