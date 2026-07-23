/**
 * Reset all demo account passwords to "123".
 * Usage: tsx scripts/reset-password.ts
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { workspaceUsers } from "../db/schema";

async function main() {
  const { getDb } = await import("../db");
  const db = await getDb();

  const password = "123";
  const passwordHash = await bcrypt.hash(password, 10);

  // Query existing users first
  const users = await db.select({ email: workspaceUsers.email, passwordHash: workspaceUsers.passwordHash }).from(workspaceUsers);
  console.log(`Found ${users.length} users in workspace_users table`);
  for (const u of users) {
    const matches = await bcrypt.compare(password, u.passwordHash);
    console.log(`  ${u.email}: hash=${u.passwordHash.slice(0, 20)}... matches "123"=${matches}`);
  }

  // Update all passwords to "123"
  for (const u of users) {
    await db.update(workspaceUsers).set({ passwordHash }).where(eq(workspaceUsers.email, u.email));
  }

  // Verify
  const updated = await db.select({ email: workspaceUsers.email, passwordHash: workspaceUsers.passwordHash }).from(workspaceUsers);
  for (const u of updated) {
    const matches = await bcrypt.compare(password, u.passwordHash);
    console.log(`  [AFTER] ${u.email}: matches "123"=${matches}`);
  }

  console.log(`\n✅ All ${users.length} user passwords have been reset to "${password}"`);
}

main().catch(err => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
