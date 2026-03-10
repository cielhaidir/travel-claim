/**
 * Reset DB script — clears ALL data except master data (Department & ChartOfAccount),
 * then creates a single admin user.
 *
 * Run:  npx tsx prisma/reset-db.ts
 */

import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log("🗑️  Resetting all data (master data preserved)…\n");

  // ── 1. Delete transactional tables in dependency order ────────────────────

  console.log("🔴 Deleting journal transactions…");
  await prisma.journalTransaction.deleteMany({});

  console.log("🔴 Deleting balance accounts…");
  await prisma.balanceAccount.deleteMany({});

  console.log("🔴 Deleting attachments…");
  await prisma.attachment.deleteMany({});

  console.log("🔴 Deleting approvals…");
  await prisma.approval.deleteMany({});

  console.log("🔴 Deleting claims…");
  await prisma.claim.deleteMany({});

  console.log("🔴 Deleting bailouts…");
  await prisma.bailout.deleteMany({});

  console.log("🔴 Deleting travel participants…");
  await prisma.travelParticipant.deleteMany({});

  console.log("🔴 Deleting travel requests…");
  await prisma.travelRequest.deleteMany({});

  console.log("🔴 Deleting projects…");
  await prisma.project.deleteMany({});

  console.log("🔴 Deleting notifications…");
  await prisma.notification.deleteMany({});

  console.log("🔴 Deleting audit logs…");
  await prisma.auditLog.deleteMany({});

  console.log("🔴 Deleting sessions & accounts…");
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});

  console.log("🔴 Deleting user roles…");
  await prisma.userRole.deleteMany({});

  // Clear department chief references before deleting users
  console.log("🔴 Clearing department chief references…");
  await prisma.department.updateMany({ data: { chiefId: null } });

  // Temporarily disable FK checks so we can delete users while keeping ChartOfAccount
  console.log("🔴 Disabling FK constraints temporarily…");
  await prisma.$executeRaw`SET session_replication_role = replica`;

  console.log("🔴 Deleting users…");
  await prisma.user.deleteMany({});

  console.log("🔴 Re-enabling FK constraints…");
  await prisma.$executeRaw`SET session_replication_role = DEFAULT`;

  console.log("\n✅ All data cleared.\n");
  console.log("📂 Master data retained: Department, ChartOfAccount\n");

  // ── 2. Create single admin user ───────────────────────────────────────────

  const pw = await hash(PASSWORD);

  console.log("👤 Creating admin user…\n");

  const admin = await prisma.user.create({
    data: {
      email: "admin@company.com",
      name: "admin",
      employeeId: "EMP001",
      role: "ADMIN",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000001",
    },
  });
  console.log("  🔑 Admin : admin@company.com  (EMP001)");

  // Sync UserRole
  await prisma.$executeRaw`
    INSERT INTO "UserRole" ("userId", "role", "createdAt")
    VALUES (${admin.id}, ${"ADMIN"}::"Role", NOW())
    ON CONFLICT ("userId", "role") DO NOTHING
  `;
  console.log("  ✅ UserRole synced\n");

  // Re-point ChartOfAccount FKs to the new admin user
  console.log("🔗 Re-pointing ChartOfAccount user FKs to admin user…");
  await prisma.$executeRaw`UPDATE "ChartOfAccount" SET "createdById" = ${admin.id}, "updatedById" = ${admin.id}`;
  console.log("  ✅ ChartOfAccount user FKs updated\n");

  // ── 3. Summary ────────────────────────────────────────────────────────────
  console.log("🎉 Reset complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Admin user:");
  console.log("    Email    : admin@company.com");
  console.log("    Password : password123");
  console.log("    Role     : ADMIN");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((e) => {
    console.error("❌ Reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
