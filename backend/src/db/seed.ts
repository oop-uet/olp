import "dotenv/config";
import { db } from "./index.js";
import { users, systemConfig } from "./schema.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

async function seed() {
  console.log("🌱 Seeding database...");

  const now = new Date().toISOString();

  // ─── Seed default admin account ──────────────────────────────────────────────

  const adminId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("admin123", 12);

  await db
    .insert(users)
    .values({
      id: adminId,
      username: "admin",
      email: "admin@uet.vnu.edu.vn",
      passwordHash,
      role: "admin",
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Default admin account created (username: admin)");

  // ─── Seed system_config defaults ─────────────────────────────────────────────

  const configDefaults = [
    {
      key: "warning_threshold",
      value: "3",
      validRange: "1-10",
      updatedAt: now,
      updatedBy: adminId,
    },
    {
      key: "time_limit",
      value: "60",
      validRange: "1-180",
      updatedAt: now,
      updatedBy: adminId,
    },
    {
      key: "max_submissions",
      value: "10",
      validRange: "1-100",
      updatedAt: now,
      updatedBy: adminId,
    },
  ];

  for (const config of configDefaults) {
    await db.insert(systemConfig).values(config).onConflictDoNothing();
  }

  console.log("✅ System configuration defaults seeded");
  console.log("   - warning_threshold: 3 (range 1-10)");
  console.log("   - time_limit: 60 (range 1-180)");
  console.log("   - max_submissions: 10 (range 1-100)");

  console.log("\n🎉 Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
