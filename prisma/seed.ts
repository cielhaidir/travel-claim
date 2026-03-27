import {
  PrismaClient,
  BailoutCategory,
  BailoutStatus,
  ClaimStatus,
  ClaimType,
  InventoryBucketType,
  InventoryTrackingMode,
  InventoryUnitCondition,
  InventoryUnitStatus,
  InventoryUsageType,
  JournalSourceType,
  JournalStatus,
  TravelStatus,
  TravelType,
  type Role,
} from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";
import { bootstrapTenantAccounting } from "../src/lib/accounting/bootstrap";
import {
  ensureTenantRoleCatalog,
  getTenantSystemRoleId,
} from "../src/server/auth/permission-store";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PASSWORD = "password123";

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function syncUserRoles(
  users: Array<{ id: string; role: Role; tenantId: string }>,
) {
  for (const user of users) {
    await prisma.userRole.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  }
}

async function ensureTenantBootstrap() {
  await prisma.$executeRaw`
    INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
    VALUES (md5(random()::text || clock_timestamp()::text), 'root', 'Root Tenant', true, NOW(), NOW())
    ON CONFLICT ("slug") DO UPDATE
    SET "name" = EXCLUDED."name", "isRoot" = true, "updatedAt" = NOW()
  `;

  await prisma.$executeRaw`
    INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
    VALUES (md5(random()::text || clock_timestamp()::text), 'default', 'Default Tenant', false, NOW(), NOW())
    ON CONFLICT ("slug") DO UPDATE
    SET "name" = EXCLUDED."name", "updatedAt" = NOW()
  `;

  const rows = await prisma.$queryRaw<Array<{ slug: string; id: string }>>`
    SELECT "slug", "id" FROM "Tenant" WHERE "slug" IN ('root', 'default')
  `;

  return {
    rootTenantId: rows.find((row) => row.slug === "root")?.id ?? "",
    defaultTenantId: rows.find((row) => row.slug === "default")?.id ?? "",
  };
}

async function backfillTenantOwnership(defaultTenantId: string) {
  await prisma.$executeRaw`UPDATE "Department" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Project" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "TravelRequest" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "TravelParticipant" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Bailout" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Approval" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Claim" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Attachment" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "Notification" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "AuditLog" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "ChartOfAccount" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "BalanceAccount" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "JournalTransaction" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  await prisma.$executeRaw`UPDATE "UserRole" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
}

async function upsertDefaultMembership(
  userId: string,
  role: Role,
  tenantId: string,
  isDefault = true,
) {
  const customRoleId = await getTenantSystemRoleId(prisma, tenantId, role);

  await prisma.tenantMembership.upsert({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    update: {
      role,
      customRoleId,
      status: "ACTIVE",
      isDefault,
      activatedAt: new Date(),
      invitedAt: null,
      suspendedAt: null,
      suspendedReason: null,
    },
    create: {
      userId,
      tenantId,
      role,
      customRoleId,
      status: "ACTIVE",
      isDefault,
      activatedAt: new Date(),
    },
  });
}

async function pruneMemberships(userId: string, allowedTenantIds: string[]) {
  await prisma.tenantMembership.deleteMany({
    where: {
      userId,
      tenantId: {
        notIn: allowedTenantIds,
      },
    },
  });
}

async function hasInventoryBatchFoundation() {
  const tables = await prisma.$queryRaw<Array<{ receipt_batch_table: string | null; receipt_batch_column: string | null }>>`
    SELECT
      to_regclass('public."InventoryReceiptBatch"')::text AS receipt_batch_table,
      (
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'InventoryItemUnit'
          AND column_name = 'receiptBatchId'
        LIMIT 1
      ) AS receipt_batch_column
  `;

  const row = tables[0];
  return Boolean(row?.receipt_batch_table && row?.receipt_batch_column);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting database seeding (master data only)…\n");

  const pw = await hash(PASSWORD);
  const { rootTenantId, defaultTenantId } = await ensureTenantBootstrap();
  await ensureTenantRoleCatalog(prisma, rootTenantId);
  await ensureTenantRoleCatalog(prisma, defaultTenantId);
  await backfillTenantOwnership(defaultTenantId);

  // ── 1. Departments (no chiefId yet — set after users are created) ───────────
  console.log("📂 Creating departments…");
  const deptSales = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: defaultTenantId, code: "SALES" } },
    update: {
      name: "Sales",
      description: "Sales operations and customer relations",
    },
    create: {
      tenantId: defaultTenantId,
      code: "SALES",
      name: "Sales",
      description: "Sales operations and customer relations",
    },
  });
  const deptEng = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: defaultTenantId, code: "ENG" } },
    update: {
      name: "Engineering",
      description: "Software engineering and technical operations",
    },
    create: {
      tenantId: defaultTenantId,
      code: "ENG",
      name: "Engineering",
      description: "Software engineering and technical operations",
    },
  });
  const deptFinance = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: defaultTenantId, code: "FIN" } },
    update: {
      name: "Finance",
      description: "Finance and accounting",
    },
    create: {
      tenantId: defaultTenantId,
      code: "FIN",
      name: "Finance",
      description: "Finance and accounting",
    },
  });
  const deptAdmin = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: defaultTenantId, code: "ADMIN" } },
    update: {
      name: "Administration",
      description: "Administrative and support operations",
    },
    create: {
      tenantId: defaultTenantId,
      code: "ADMIN",
      name: "Administration",
      description: "Administrative and support operations",
    },
  });
  console.log("  ✅ 4 departments ready\n");

  // ── 2. Clear reserved employeeIds to avoid unique conflicts on re-seed ───────
  const reservedIds = [
    "EMP001",
    "EMP002",
    "EMP003",
    "EMP010",
    "EMP011",
    "EMP012",
    "EMP020",
    "EMP021",
    "EMP022",
    "EMP030",
    "EMP031",
    "EMP040",
    "EMP041",
  ];
  await prisma.user.updateMany({
    where: { employeeId: { in: reservedIds } },
    data: { employeeId: null },
  });

  // ── 3. Users ─────────────────────────────────────────────────────────────────
  console.log("👤 Creating users…");

  const rootUser = await prisma.user.upsert({
    where: { email: "root@company.com" },
    update: {
      name: "Root User",
      role: "ROOT" as unknown as Role,
      employeeId: "ROOT001",
    },
    create: {
      email: "root@company.com",
      name: "Root User",
      employeeId: "ROOT001",
      role: "ROOT" as unknown as Role,
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111999001",
    },
  });
  console.log("  🌐 Root User      : root@company.com        (ROOT001)");

  // ── 3a. Executive / C-level (no department, top of hierarchy) ────────────────
  const executive = await prisma.user.upsert({
    where: { email: "executive@company.com" },
    update: { name: "Pak Hendra Wijaya", role: "ADMIN", employeeId: "EMP001" },
    create: {
      email: "executive@company.com",
      name: "Pak Hendra Wijaya",
      employeeId: "EMP001",
      role: "ADMIN",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000001",
    },
  });
  console.log(`  👑 Executive/Admin : executive@company.com   (EMP001)`);

  // ── 3b. Director (reports to executive) ──────────────────────────────────────
  const director = await prisma.user.upsert({
    where: { email: "director@company.com" },
    update: {
      name: "Ibu Ratna Sari",
      role: "DIRECTOR",
      employeeId: "EMP002",
      supervisorId: executive.id,
    },
    create: {
      email: "director@company.com",
      name: "Ibu Ratna Sari",
      employeeId: "EMP002",
      role: "DIRECTOR",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000002",
      supervisorId: executive.id,
    },
  });
  console.log(
    `  👔 Director        : director@company.com    (EMP002) → supervisor: executive`,
  );

  // ── 3c. Finance Department ────────────────────────────────────────────────────
  // Finance Chief (SALES_CHIEF used as "dept chief" role; role=MANAGER for finance head)
  const financeChief = await prisma.user.upsert({
    where: { email: "finance.chief@company.com" },
    update: {
      name: "Dewi Anggraeni",
      role: "MANAGER",
      employeeId: "EMP003",
      departmentId: deptFinance.id,
      supervisorId: director.id,
    },
    create: {
      email: "finance.chief@company.com",
      name: "Dewi Anggraeni",
      employeeId: "EMP003",
      role: "MANAGER",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000003",
      departmentId: deptFinance.id,
      supervisorId: director.id,
    },
  });
  console.log(
    `  🏦 Finance Chief   : finance.chief@company.com  (EMP003) → supervisor: director`,
  );

  const financeStaff1 = await prisma.user.upsert({
    where: { email: "finance.staff1@company.com" },
    update: { supervisorId: financeChief.id, departmentId: deptFinance.id },
    create: {
      email: "finance.staff1@company.com",
      name: "Bambang Nugroho",
      employeeId: "EMP010",
      role: "FINANCE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000010",
      departmentId: deptFinance.id,
      supervisorId: financeChief.id,
    },
  });
  console.log(
    `  👤 Finance Staff 1 : finance.staff1@company.com (EMP010) → supervisor: finance.chief`,
  );

  const financeStaff2 = await prisma.user.upsert({
    where: { email: "finance.staff2@company.com" },
    update: { supervisorId: financeChief.id, departmentId: deptFinance.id },
    create: {
      email: "finance.staff2@company.com",
      name: "Sri Wahyuni",
      employeeId: "EMP011",
      role: "FINANCE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000011",
      departmentId: deptFinance.id,
      supervisorId: financeChief.id,
    },
  });
  console.log(
    `  👤 Finance Staff 2 : finance.staff2@company.com (EMP011) → supervisor: finance.chief`,
  );

  // ── 3d. Sales Department ──────────────────────────────────────────────────────
  const salesChief = await prisma.user.upsert({
    where: { email: "sales.chief@company.com" },
    update: {
      name: "Reza Pratama",
      role: "SALES_CHIEF",
      employeeId: "EMP020",
      departmentId: deptSales.id,
      supervisorId: director.id,
    },
    create: {
      email: "sales.chief@company.com",
      name: "Reza Pratama",
      employeeId: "EMP020",
      role: "SALES_CHIEF",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000020",
      departmentId: deptSales.id,
      supervisorId: director.id,
    },
  });
  console.log(
    `  💼 Sales Chief     : sales.chief@company.com    (EMP020) → supervisor: director`,
  );

  const salesStaff1 = await prisma.user.upsert({
    where: { email: "sales.staff1@company.com" },
    update: { supervisorId: salesChief.id, departmentId: deptSales.id },
    create: {
      email: "sales.staff1@company.com",
      name: "Andi Wijaya",
      employeeId: "EMP021",
      role: "SALES_EMPLOYEE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000021",
      departmentId: deptSales.id,
      supervisorId: salesChief.id,
    },
  });
  console.log(
    `  👤 Sales Staff 1   : sales.staff1@company.com   (EMP021) → supervisor: sales.chief`,
  );

  const salesStaff2 = await prisma.user.upsert({
    where: { email: "sales.staff2@company.com" },
    update: { supervisorId: salesChief.id, departmentId: deptSales.id },
    create: {
      email: "sales.staff2@company.com",
      name: "Rina Kusuma",
      employeeId: "EMP022",
      role: "SALES_EMPLOYEE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000022",
      departmentId: deptSales.id,
      supervisorId: salesChief.id,
    },
  });
  console.log(
    `  👤 Sales Staff 2   : sales.staff2@company.com   (EMP022) → supervisor: sales.chief`,
  );

  // ── 3e. Engineering Department ────────────────────────────────────────────────
  const engChief = await prisma.user.upsert({
    where: { email: "engineer.chief@company.com" },
    update: {
      name: "Deni Hermawan",
      role: "SUPERVISOR",
      employeeId: "EMP030",
      departmentId: deptEng.id,
      supervisorId: director.id,
    },
    create: {
      email: "engineer.chief@company.com",
      name: "Deni Hermawan",
      employeeId: "EMP030",
      role: "SUPERVISOR",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000030",
      departmentId: deptEng.id,
      supervisorId: director.id,
    },
  });
  console.log(
    `  🛠  Eng Chief      : engineer.chief@company.com  (EMP030) → supervisor: director`,
  );

  const engStaff1 = await prisma.user.upsert({
    where: { email: "engineer.staff1@company.com" },
    update: { supervisorId: engChief.id, departmentId: deptEng.id },
    create: {
      email: "engineer.staff1@company.com",
      name: "Tia Rahayu",
      employeeId: "EMP031",
      role: "EMPLOYEE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000031",
      departmentId: deptEng.id,
      supervisorId: engChief.id,
    },
  });
  console.log(
    `  👤 Eng Staff 1     : engineer.staff1@company.com (EMP031) → supervisor: engineer.chief`,
  );

  const engStaff2 = await prisma.user.upsert({
    where: { email: "engineer.staff2@company.com" },
    update: { supervisorId: engChief.id, departmentId: deptEng.id },
    create: {
      email: "engineer.staff2@company.com",
      name: "Fajar Nugroho",
      employeeId: "EMP032",
      role: "EMPLOYEE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000032",
      departmentId: deptEng.id,
      supervisorId: engChief.id,
    },
  });
  console.log(
    `  👤 Eng Staff 2     : engineer.staff2@company.com (EMP032) → supervisor: engineer.chief`,
  );

  // ── 3f. Administration Department ─────────────────────────────────────────────
  const adminChief = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {
      name: "Diana Kusuma",
      role: "ADMIN",
      employeeId: "EMP040",
      departmentId: deptAdmin.id,
      supervisorId: director.id,
    },
    create: {
      email: "admin@company.com",
      name: "Diana Kusuma",
      employeeId: "EMP040",
      role: "ADMIN",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000040",
      departmentId: deptAdmin.id,
      supervisorId: director.id,
    },
  });
  console.log(
    `  🔑 Admin Chief     : admin@company.com            (EMP040) → supervisor: director`,
  );

  const adminStaff1 = await prisma.user.upsert({
    where: { email: "admin.staff1@company.com" },
    update: { supervisorId: adminChief.id, departmentId: deptAdmin.id },
    create: {
      email: "admin.staff1@company.com",
      name: "Budi Santoso",
      employeeId: "EMP041",
      role: "EMPLOYEE",
      password: pw,
      emailVerified: new Date(),
      phoneNumber: "+628111000041",
      departmentId: deptAdmin.id,
      supervisorId: adminChief.id,
    },
  });
  console.log(
    `  👤 Admin Staff 1   : admin.staff1@company.com     (EMP041) → supervisor: admin`,
  );

  console.log("\n✅ All users created\n");

  await syncUserRoles([
    { id: rootUser.id, role: "ADMIN", tenantId: defaultTenantId },
    { id: executive.id, role: executive.role, tenantId: defaultTenantId },
    { id: director.id, role: director.role, tenantId: defaultTenantId },
    { id: financeChief.id, role: financeChief.role, tenantId: defaultTenantId },
    { id: financeStaff1.id, role: financeStaff1.role, tenantId: defaultTenantId },
    { id: financeStaff2.id, role: financeStaff2.role, tenantId: defaultTenantId },
    { id: salesChief.id, role: salesChief.role, tenantId: defaultTenantId },
    { id: salesStaff1.id, role: salesStaff1.role, tenantId: defaultTenantId },
    { id: salesStaff2.id, role: salesStaff2.role, tenantId: defaultTenantId },
    { id: engChief.id, role: engChief.role, tenantId: defaultTenantId },
    { id: engStaff1.id, role: engStaff1.role, tenantId: defaultTenantId },
    { id: engStaff2.id, role: engStaff2.role, tenantId: defaultTenantId },
    { id: adminChief.id, role: adminChief.role, tenantId: defaultTenantId },
    { id: adminStaff1.id, role: adminStaff1.role, tenantId: defaultTenantId },
  ]);
  console.log("  ✅ UserRole rows synchronized from legacy role\n");

  await upsertDefaultMembership(rootUser.id, "ROOT", rootTenantId, false);
  await upsertDefaultMembership(rootUser.id, "ADMIN", defaultTenantId, true);
  await upsertDefaultMembership(executive.id, executive.role, defaultTenantId);
  await upsertDefaultMembership(director.id, director.role, defaultTenantId);
  await upsertDefaultMembership(
    financeChief.id,
    financeChief.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    financeStaff1.id,
    financeStaff1.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    financeStaff2.id,
    financeStaff2.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    salesChief.id,
    salesChief.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    salesStaff1.id,
    salesStaff1.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    salesStaff2.id,
    salesStaff2.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(engChief.id, engChief.role, defaultTenantId);
  await upsertDefaultMembership(engStaff1.id, engStaff1.role, defaultTenantId);
  await upsertDefaultMembership(engStaff2.id, engStaff2.role, defaultTenantId);
  await upsertDefaultMembership(
    adminChief.id,
    adminChief.role,
    defaultTenantId,
  );
  await upsertDefaultMembership(
    adminStaff1.id,
    adminStaff1.role,
    defaultTenantId,
  );
  await pruneMemberships(rootUser.id, [rootTenantId, defaultTenantId]);
  await pruneMemberships(executive.id, [defaultTenantId]);
  await pruneMemberships(director.id, [defaultTenantId]);
  await pruneMemberships(financeChief.id, [defaultTenantId]);
  await pruneMemberships(financeStaff1.id, [defaultTenantId]);
  await pruneMemberships(financeStaff2.id, [defaultTenantId]);
  await pruneMemberships(salesChief.id, [defaultTenantId]);
  await pruneMemberships(salesStaff1.id, [defaultTenantId]);
  await pruneMemberships(salesStaff2.id, [defaultTenantId]);
  await pruneMemberships(engChief.id, [defaultTenantId]);
  await pruneMemberships(engStaff1.id, [defaultTenantId]);
  await pruneMemberships(engStaff2.id, [defaultTenantId]);
  await pruneMemberships(adminChief.id, [defaultTenantId]);
  await pruneMemberships(adminStaff1.id, [defaultTenantId]);
  console.log("  ✅ TenantMembership rows synchronized\n");

  // ── 4. Wire Department.chiefId ────────────────────────────────────────────────
  console.log("🔗 Wiring department chiefs…");
  await prisma.department.update({
    where: { id: deptSales.id },
    data: { chiefId: salesChief.id },
  });
  await prisma.department.update({
    where: { id: deptEng.id },
    data: { chiefId: engChief.id },
  });
  await prisma.department.update({
    where: { id: deptFinance.id },
    data: { chiefId: financeChief.id },
  });
  await prisma.department.update({
    where: { id: deptAdmin.id },
    data: { chiefId: adminChief.id },
  });
  console.log("  ✅ Sales    dept chief → sales.chief");
  console.log("  ✅ Eng      dept chief → engineer.chief");
  console.log("  ✅ Finance  dept chief → finance.chief");
  console.log("  ✅ Admin    dept chief → admin\n");

  // ── 5. Chart of Accounts (master data) ───────────────────────────────────────
  console.log("💰 Creating Chart of Accounts…");
  await createChartOfAccounts(adminChief.id, defaultTenantId);
  await prisma.$executeRaw`UPDATE "ChartOfAccount" SET "tenantId" = ${defaultTenantId} WHERE "tenantId" IS NULL`;
  console.log("  ✅ Chart of Accounts ready\n");

  // ── 6. Inventory sample data ────────────────────────────────────────────────
  console.log("📦 Creating inventory sample data…");
  await createInventorySampleData({
    tenantId: defaultTenantId,
    adminUserId: adminChief.id,
    salesUserId: salesStaff1.id,
  });
  console.log("  ✅ Inventory sample data ready\n");

  // ── 7. CRM sample data ───────────────────────────────────────────────────────
  console.log("🤝 Creating CRM sample data…");
  await createCrmSampleData({
    tenantId: defaultTenantId,
    primaryOwnerId: salesStaff1.id,
    primaryOwnerName: salesStaff1.name ?? "Andi Wijaya",
    secondaryOwnerId: salesStaff2.id,
    secondaryOwnerName: salesStaff2.name ?? "Rina Kusuma",
  });
  console.log("  ✅ CRM sample data ready\n");

  // ── 8. Balance accounts, projects, travel, claims, bailouts, journals ───────
  console.log("📚 Creating accounting and transaction sample data…");
  await createSampleBusinessData({
    tenantId: defaultTenantId,
    adminUserId: adminChief.id,
    financeUserId: financeStaff1.id,
    salesRequesterId: salesStaff1.id,
    engineerRequesterId: engStaff1.id,
  });
  console.log("  ✅ Sample accounting and transaction data ready\n");

  // ── 9. Summary ────────────────────────────────────────────────────────────────
  console.log("🎉 Seeding completed!\n");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("  All passwords : password123");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("");
  console.log("  Hierarchy:");
  console.log("  executive@company.com   (ADMIN / C-Level)");
  console.log("  └─ director@company.com  (DIRECTOR)");
  console.log(
    "     ├─ finance.chief@company.com   (MANAGER)  ← Finance dept chief",
  );
  console.log("     │  ├─ finance.staff1@company.com (FINANCE)");
  console.log("     │  └─ finance.staff2@company.com (FINANCE)");
  console.log(
    "     ├─ sales.chief@company.com     (SALES_CHIEF) ← Sales dept chief",
  );
  console.log("     │  ├─ sales.staff1@company.com   (SALES_EMPLOYEE)");
  console.log("     │  └─ sales.staff2@company.com   (SALES_EMPLOYEE)");
  console.log(
    "     ├─ engineer.chief@company.com  (SUPERVISOR) ← Eng dept chief",
  );
  console.log("     │  ├─ engineer.staff1@company.com (EMPLOYEE)");
  console.log("     │  └─ engineer.staff2@company.com (EMPLOYEE)");
  console.log(
    "     └─ admin@company.com           (ADMIN)    ← Admin dept chief",
  );
  console.log("        └─ admin.staff1@company.com  (EMPLOYEE)");
  console.log("");
  console.log("  Approval chain examples:");
  console.log("  sales.staff1 submits TravelRequest (SALES_EMPLOYEE, Rule A):");
  console.log("    seq=1 DEPT_CHIEF  → sales.chief");
  console.log("    seq=2 DIRECTOR    → director");
  console.log("    seq=3 EXECUTIVE   → executive");
  console.log("");
  console.log("  engineer.staff1 submits TravelRequest (EMPLOYEE, Rule C):");
  console.log("    seq=1 DEPT_CHIEF  → engineer.chief");
  console.log("    seq=2 DIRECTOR    → director");
  console.log("    seq=3 EXECUTIVE   → executive");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
  );

  // suppress unused-variable warnings
  void [
    financeStaff2,
    salesStaff1,
    salesStaff2,
    engStaff1,
    engStaff2,
    adminStaff1,
  ];
}

// ─── Chart of Accounts & Sample Data ───────────────────────────────────────

async function findCoaByCode(tenantId: string, code: string) {
  const coa = await prisma.chartOfAccount.findFirst({
    where: { tenantId, code, isActive: true },
  });

  if (!coa) {
    throw new Error(`COA ${code} tidak ditemukan saat seeding`);
  }

  return coa;
}

async function createInventorySeedCoas(input: {
  tenantId: string;
  userId: string;
}) {
  const assetParent = await findCoaByCode(input.tenantId, "1000");

  const stockCoa = await prisma.chartOfAccount.upsert({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: "1150" },
    },
    update: {
      name: "Persediaan Barang Dagang",
      accountType: "ASSET",
      category: "Aset",
      subcategory: "Persediaan",
      parentId: assetParent.id,
      isActive: true,
      description: "Akun persediaan untuk barang yang tersedia untuk dijual.",
      updatedById: input.userId,
    },
    create: {
      tenantId: input.tenantId,
      code: "1150",
      name: "Persediaan Barang Dagang",
      accountType: "ASSET",
      category: "Aset",
      subcategory: "Persediaan",
      parentId: assetParent.id,
      isActive: true,
      description: "Akun persediaan untuk barang yang tersedia untuk dijual.",
      createdById: input.userId,
      updatedById: input.userId,
    },
  });

  const tempAssetCoa = await prisma.chartOfAccount.upsert({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: "1151" },
    },
    update: {
      name: "Aset Sementara Inventory",
      accountType: "ASSET",
      category: "Aset",
      subcategory: "Aset Sementara",
      parentId: assetParent.id,
      isActive: true,
      description:
        "Akun aset sementara untuk barang yang belum diputuskan menjadi stok jual atau dipakai internal.",
      updatedById: input.userId,
    },
    create: {
      tenantId: input.tenantId,
      code: "1151",
      name: "Aset Sementara Inventory",
      accountType: "ASSET",
      category: "Aset",
      subcategory: "Aset Sementara",
      parentId: assetParent.id,
      isActive: true,
      description:
        "Akun aset sementara untuk barang yang belum diputuskan menjadi stok jual atau dipakai internal.",
      createdById: input.userId,
      updatedById: input.userId,
    },
  });

  const cogsCoa = await prisma.chartOfAccount.upsert({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: "5100" },
    },
    update: {
      name: "Beban Pokok Penjualan",
      accountType: "EXPENSE",
      category: "Beban",
      subcategory: "COGS",
      isActive: true,
      description: "Akun biaya pokok penjualan untuk issue stok penjualan.",
      updatedById: input.userId,
    },
    create: {
      tenantId: input.tenantId,
      code: "5100",
      name: "Beban Pokok Penjualan",
      accountType: "EXPENSE",
      category: "Beban",
      subcategory: "COGS",
      isActive: true,
      description: "Akun biaya pokok penjualan untuk issue stok penjualan.",
      createdById: input.userId,
      updatedById: input.userId,
    },
  });

  return { stockCoa, tempAssetCoa, cogsCoa };
}

async function createCrmSampleData(input: {
  tenantId: string;
  primaryOwnerId: string;
  primaryOwnerName: string;
  secondaryOwnerId: string;
  secondaryOwnerName: string;
}) {
  const organizations = [
    {
      id: "seed-crm-org-1",
      company: "PT Nusantara Digital Solusi",
      name: "Nusantara Digital Solusi",
      email: "hello@nusantaradigital.co.id",
      phone: "+62215111001",
      segment: "ENTERPRISE" as const,
      city: "Jakarta",
      ownerName: input.primaryOwnerName,
      status: "ACTIVE" as const,
      totalValue: 485000000,
      website: "https://nusantaradigital.co.id",
      annualRevenue: 2500000000,
      employeeCount: "TWO_HUNDRED_ONE_TO_FIVE_HUNDRED" as const,
      industry: "TECHNOLOGY" as const,
      notes: "Prospek existing untuk solusi network, managed service, dan endpoint refresh.",
      lastContactAt: new Date("2026-03-24T09:00:00.000Z"),
    },
    {
      id: "seed-crm-org-2",
      company: "PT Sinar Retail Indonesia",
      name: "Sinar Retail Indonesia",
      email: "procurement@sinarretail.co.id",
      phone: "+62316122002",
      segment: "SMB" as const,
      city: "Surabaya",
      ownerName: input.secondaryOwnerName,
      status: "VIP" as const,
      totalValue: 175000000,
      website: "https://sinarretail.co.id",
      annualRevenue: 980000000,
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      industry: "RETAIL" as const,
      notes: "Sering repeat order untuk switch, access point, dan printer cabang.",
      lastContactAt: new Date("2026-03-23T08:30:00.000Z"),
    },
    {
      id: "seed-crm-org-3",
      company: "Universitas Cakrawala Mandiri",
      name: "Universitas Cakrawala Mandiri",
      email: "it.procurement@ucm.ac.id",
      phone: "+62247433003",
      segment: "EDUCATION" as const,
      city: "Semarang",
      ownerName: input.primaryOwnerName,
      status: "ACTIVE" as const,
      totalValue: 92000000,
      website: "https://ucm.ac.id",
      annualRevenue: 750000000,
      employeeCount: "ELEVEN_TO_FIFTY" as const,
      industry: "EDUCATION" as const,
      notes: "Sedang evaluasi pengadaan perangkat lab dan wifi kampus.",
      lastContactAt: new Date("2026-03-21T13:00:00.000Z"),
    },
    {
      id: "seed-crm-org-4",
      company: "Dinas Kominfo Kota Maju",
      name: "Dinas Kominfo Kota Maju",
      email: "lpse@kotamaju.go.id",
      phone: "+62711444004",
      segment: "GOVERNMENT" as const,
      city: "Palembang",
      ownerName: input.secondaryOwnerName,
      status: "ACTIVE" as const,
      totalValue: 310000000,
      website: "https://kominfo.kotamaju.go.id",
      annualRevenue: 1200000000,
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      industry: "GOVERNMENT" as const,
      notes: "Target peluang pengadaan command center dan jaringan kantor dinas.",
      lastContactAt: new Date("2026-03-20T10:15:00.000Z"),
    },
  ];

  for (const organization of organizations) {
    await prisma.crmCustomer.upsert({
      where: { id: organization.id },
      update: {
        tenantId: input.tenantId,
        company: organization.company,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        segment: organization.segment,
        city: organization.city,
        ownerName: organization.ownerName,
        status: organization.status,
        totalValue: organization.totalValue,
        website: organization.website,
        annualRevenue: organization.annualRevenue,
        employeeCount: organization.employeeCount,
        industry: organization.industry,
        notes: organization.notes,
        lastContactAt: organization.lastContactAt,
        deletedAt: null,
      },
      create: {
        id: organization.id,
        tenantId: input.tenantId,
        company: organization.company,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        segment: organization.segment,
        city: organization.city,
        ownerName: organization.ownerName,
        status: organization.status,
        totalValue: organization.totalValue,
        website: organization.website,
        annualRevenue: organization.annualRevenue,
        employeeCount: organization.employeeCount,
        industry: organization.industry,
        notes: organization.notes,
        lastContactAt: organization.lastContactAt,
      },
    });
  }

  const contacts = [
    {
      id: "seed-crm-contact-1",
      customerId: "seed-crm-org-1",
      firstName: "Budi",
      lastName: "Hartono",
      name: "Budi Hartono",
      title: "Head of IT Infrastructure",
      email: "budi.hartono@nusantaradigital.co.id",
      phone: "+628121111001",
      department: "IT Infrastructure",
      gender: "MALE" as const,
      designation: "Head of IT Infrastructure",
      address: "Jl. HR Rasuna Said, Jakarta Selatan",
      isPrimary: true,
      notes: "PIC utama untuk evaluasi network refresh dan endpoint management.",
    },
    {
      id: "seed-crm-contact-2",
      customerId: "seed-crm-org-1",
      firstName: "Maya",
      lastName: "Lestari",
      name: "Maya Lestari",
      title: "Procurement Manager",
      email: "maya.lestari@nusantaradigital.co.id",
      phone: "+628121111002",
      department: "Procurement",
      gender: "FEMALE" as const,
      designation: "Procurement Manager",
      address: "Jl. HR Rasuna Said, Jakarta Selatan",
      isPrimary: false,
      notes: "Terlibat saat negosiasi harga dan administrasi vendor onboarding.",
    },
    {
      id: "seed-crm-contact-3",
      customerId: "seed-crm-org-2",
      firstName: "Rizky",
      lastName: "Saputra",
      name: "Rizky Saputra",
      title: "IT Supervisor",
      email: "rizky.saputra@sinarretail.co.id",
      phone: "+628121111003",
      department: "IT Operations",
      gender: "MALE" as const,
      designation: "IT Supervisor",
      address: "Jl. Basuki Rahmat, Surabaya",
      isPrimary: true,
      notes: "Membutuhkan rollout access point untuk 12 toko baru.",
    },
    {
      id: "seed-crm-contact-4",
      customerId: "seed-crm-org-3",
      firstName: "Nadia",
      lastName: "Putri",
      name: "Nadia Putri",
      title: "Kepala Lab Komputer",
      email: "nadia.putri@ucm.ac.id",
      phone: "+628121111004",
      department: "Laboratorium Komputer",
      gender: "FEMALE" as const,
      designation: "Kepala Lab Komputer",
      address: "Jl. Veteran, Semarang",
      isPrimary: true,
      notes: "Fokus pada demo access point dan laptop lab.",
    },
    {
      id: "seed-crm-contact-5",
      customerId: "seed-crm-org-4",
      firstName: "Arif",
      lastName: "Prabowo",
      name: "Arif Prabowo",
      title: "PPK Infrastruktur",
      email: "arif.prabowo@kotamaju.go.id",
      phone: "+628121111005",
      department: "Infrastruktur Digital",
      gender: "MALE" as const,
      designation: "PPK Infrastruktur",
      address: "Jl. Merdeka, Palembang",
      isPrimary: true,
      notes: "PIC teknis untuk tender command center tahap awal.",
    },
  ];

  for (const contact of contacts) {
    await prisma.crmContact.upsert({
      where: { id: contact.id },
      update: {
        tenantId: input.tenantId,
        customerId: contact.customerId,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        department: contact.department,
        firstName: contact.firstName,
        lastName: contact.lastName,
        gender: contact.gender,
        designation: contact.designation,
        address: contact.address,
        isPrimary: contact.isPrimary,
        isActive: true,
        notes: contact.notes,
        deletedAt: null,
      },
      create: {
        id: contact.id,
        tenantId: input.tenantId,
        customerId: contact.customerId,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        department: contact.department,
        firstName: contact.firstName,
        lastName: contact.lastName,
        gender: contact.gender,
        designation: contact.designation,
        address: contact.address,
        isPrimary: contact.isPrimary,
        isActive: true,
        notes: contact.notes,
      },
    });
  }

  const leads = [
    {
      id: "seed-crm-lead-1",
      customerId: "seed-crm-org-1",
      firstName: "Budi",
      lastName: "Hartono",
      name: "Budi Hartono",
      company: "PT Nusantara Digital Solusi",
      email: "budi.hartono@nusantaradigital.co.id",
      phone: "+62215111001",
      mobileNo: "+628121111001",
      gender: "MALE" as const,
      status: "QUALIFIED" as const,
      website: "https://nusantaradigital.co.id",
      employeeCount: "TWO_HUNDRED_ONE_TO_FIVE_HUNDRED" as const,
      annualRevenue: 2500000000,
      industry: "TECHNOLOGY" as const,
      ownerId: input.primaryOwnerId,
      ownerName: input.primaryOwnerName,
      stage: "QUALIFIED" as const,
      value: 185000000,
      probability: 70,
      source: "REFERRAL" as const,
      priority: "HIGH" as const,
      expectedCloseDate: new Date("2026-04-15T00:00:00.000Z"),
      lastActivityAt: new Date("2026-03-24T09:00:00.000Z"),
      convertedToDealAt: null,
      notes: "Sudah presentasi solusi SD-WAN dan endpoint protection. Menunggu final BoQ.",
    },
    {
      id: "seed-crm-lead-2",
      customerId: "seed-crm-org-2",
      firstName: "Rizky",
      lastName: "Saputra",
      name: "Rizky Saputra",
      company: "PT Sinar Retail Indonesia",
      email: "rizky.saputra@sinarretail.co.id",
      phone: "+62316122002",
      mobileNo: "+628121111003",
      gender: "MALE" as const,
      status: "CONTACTED" as const,
      website: "https://sinarretail.co.id",
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      annualRevenue: 980000000,
      industry: "RETAIL" as const,
      ownerId: input.secondaryOwnerId,
      ownerName: input.secondaryOwnerName,
      stage: "NEW" as const,
      value: 76000000,
      probability: 40,
      source: "WEBSITE" as const,
      priority: "MEDIUM" as const,
      expectedCloseDate: new Date("2026-04-28T00:00:00.000Z"),
      lastActivityAt: new Date("2026-03-23T10:00:00.000Z"),
      convertedToDealAt: null,
      notes: "Sudah initial contact, customer minta opsi rollout access point untuk 12 toko.",
    },
    {
      id: "seed-crm-lead-3",
      customerId: "seed-crm-org-3",
      firstName: "Nadia",
      lastName: "Putri",
      name: "Nadia Putri",
      company: "Universitas Cakrawala Mandiri",
      email: "nadia.putri@ucm.ac.id",
      phone: "+62247433003",
      mobileNo: "+628121111004",
      gender: "FEMALE" as const,
      status: "NURTURE" as const,
      website: "https://ucm.ac.id",
      employeeCount: "ELEVEN_TO_FIFTY" as const,
      annualRevenue: 750000000,
      industry: "EDUCATION" as const,
      ownerId: input.primaryOwnerId,
      ownerName: input.primaryOwnerName,
      stage: "NEW" as const,
      value: 92000000,
      probability: 25,
      source: "EVENT" as const,
      priority: "MEDIUM" as const,
      expectedCloseDate: new Date("2026-05-10T00:00:00.000Z"),
      lastActivityAt: new Date("2026-03-21T13:00:00.000Z"),
      convertedToDealAt: null,
      notes: "Follow up setelah campus technology expo. Butuh pilot area perpustakaan.",
    },
    {
      id: "seed-crm-lead-4",
      customerId: "seed-crm-org-4",
      firstName: "Arif",
      lastName: "Prabowo",
      name: "Arif Prabowo",
      company: "Dinas Kominfo Kota Maju",
      email: "arif.prabowo@kotamaju.go.id",
      phone: "+62711444004",
      mobileNo: "+628121111005",
      gender: "MALE" as const,
      status: "QUALIFIED" as const,
      website: "https://kominfo.kotamaju.go.id",
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      annualRevenue: 1200000000,
      industry: "GOVERNMENT" as const,
      ownerId: input.secondaryOwnerId,
      ownerName: input.secondaryOwnerName,
      stage: "PROPOSAL" as const,
      value: 310000000,
      probability: 65,
      source: "PARTNER" as const,
      priority: "HIGH" as const,
      expectedCloseDate: new Date("2026-05-20T00:00:00.000Z"),
      lastActivityAt: new Date("2026-03-20T10:15:00.000Z"),
      convertedToDealAt: null,
      notes: "Sudah survey lokasi dan customer minta draft proposal command center.",
    },
    {
      id: "seed-crm-lead-5",
      customerId: "seed-crm-org-1",
      firstName: "Maya",
      lastName: "Lestari",
      name: "Maya Lestari",
      company: "PT Nusantara Digital Solusi",
      email: "maya.lestari@nusantaradigital.co.id",
      phone: "+62215111001",
      mobileNo: "+628121111002",
      gender: "FEMALE" as const,
      status: "CONVERTED" as const,
      website: "https://nusantaradigital.co.id",
      employeeCount: "TWO_HUNDRED_ONE_TO_FIVE_HUNDRED" as const,
      annualRevenue: 2500000000,
      industry: "TECHNOLOGY" as const,
      ownerId: input.primaryOwnerId,
      ownerName: input.primaryOwnerName,
      stage: "QUALIFIED" as const,
      value: 145000000,
      probability: 85,
      source: "OUTBOUND" as const,
      priority: "HIGH" as const,
      expectedCloseDate: new Date("2026-04-05T00:00:00.000Z"),
      lastActivityAt: new Date("2026-03-25T11:00:00.000Z"),
      convertedToDealAt: new Date("2026-03-25T11:00:00.000Z"),
      notes: "Lead lama yang sudah dikonversi menjadi deal pengadaan laptop enterprise.",
    },
  ];

  for (const lead of leads) {
    await prisma.crmLead.upsert({
      where: { id: lead.id },
      update: {
        tenantId: input.tenantId,
        customerId: lead.customerId,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        mobileNo: lead.mobileNo,
        gender: lead.gender,
        status: lead.status,
        website: lead.website,
        employeeCount: lead.employeeCount,
        annualRevenue: lead.annualRevenue,
        industry: lead.industry,
        ownerId: lead.ownerId,
        stage: lead.stage,
        value: lead.value,
        probability: lead.probability,
        source: lead.source,
        priority: lead.priority,
        ownerName: lead.ownerName,
        expectedCloseDate: lead.expectedCloseDate,
        lastActivityAt: lead.lastActivityAt,
        convertedToDealAt: lead.convertedToDealAt,
        notes: lead.notes,
        deletedAt: null,
      },
      create: {
        id: lead.id,
        tenantId: input.tenantId,
        customerId: lead.customerId,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        mobileNo: lead.mobileNo,
        gender: lead.gender,
        status: lead.status,
        website: lead.website,
        employeeCount: lead.employeeCount,
        annualRevenue: lead.annualRevenue,
        industry: lead.industry,
        ownerId: lead.ownerId,
        stage: lead.stage,
        value: lead.value,
        probability: lead.probability,
        source: lead.source,
        priority: lead.priority,
        ownerName: lead.ownerName,
        expectedCloseDate: lead.expectedCloseDate,
        lastActivityAt: lead.lastActivityAt,
        convertedToDealAt: lead.convertedToDealAt,
        notes: lead.notes,
      },
    });
  }

  const deals = [
    {
      id: "seed-crm-deal-1",
      customerId: "seed-crm-org-1",
      contactId: "seed-crm-contact-2",
      leadId: "seed-crm-lead-5",
      title: "Enterprise Laptop Refresh 2026",
      company: "PT Nusantara Digital Solusi",
      ownerId: input.primaryOwnerId,
      ownerName: input.primaryOwnerName,
      status: "NEGOTIATION" as const,
      website: "https://nusantaradigital.co.id",
      employeeCount: "TWO_HUNDRED_ONE_TO_FIVE_HUNDRED" as const,
      annualRevenue: 2500000000,
      industry: "TECHNOLOGY" as const,
      firstName: "Maya",
      lastName: "Lestari",
      primaryEmail: "maya.lestari@nusantaradigital.co.id",
      primaryMobileNo: "+628121111002",
      gender: "FEMALE" as const,
      stage: "NEGOTIATION" as const,
      value: 145000000,
      probability: 80,
      source: "OUTBOUND" as const,
      expectedCloseDate: new Date("2026-04-05T00:00:00.000Z"),
      closedAt: null,
      lostReason: null,
      notes: "Harga final sedang dinegosiasikan dengan procurement dan finance customer.",
      lastActivityAt: new Date("2026-03-25T11:00:00.000Z"),
    },
    {
      id: "seed-crm-deal-2",
      customerId: "seed-crm-org-4",
      contactId: "seed-crm-contact-5",
      leadId: null,
      title: "Command Center Phase 1",
      company: "Dinas Kominfo Kota Maju",
      ownerId: input.secondaryOwnerId,
      ownerName: input.secondaryOwnerName,
      status: "PROPOSAL_QUOTATION" as const,
      website: "https://kominfo.kotamaju.go.id",
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      annualRevenue: 1200000000,
      industry: "GOVERNMENT" as const,
      firstName: "Arif",
      lastName: "Prabowo",
      primaryEmail: "arif.prabowo@kotamaju.go.id",
      primaryMobileNo: "+628121111005",
      gender: "MALE" as const,
      stage: "PROPOSAL" as const,
      value: 310000000,
      probability: 65,
      source: "PARTNER" as const,
      expectedCloseDate: new Date("2026-05-20T00:00:00.000Z"),
      closedAt: null,
      lostReason: null,
      notes: "Draft proposal dan RAB internal sedang finalisasi untuk diajukan minggu depan.",
      lastActivityAt: new Date("2026-03-20T10:15:00.000Z"),
    },
    {
      id: "seed-crm-deal-3",
      customerId: "seed-crm-org-2",
      contactId: "seed-crm-contact-3",
      leadId: null,
      title: "Retail Store WiFi Rollout",
      company: "PT Sinar Retail Indonesia",
      ownerId: input.secondaryOwnerId,
      ownerName: input.secondaryOwnerName,
      status: "QUALIFICATION" as const,
      website: "https://sinarretail.co.id",
      employeeCount: "FIFTY_ONE_TO_TWO_HUNDRED" as const,
      annualRevenue: 980000000,
      industry: "RETAIL" as const,
      firstName: "Rizky",
      lastName: "Saputra",
      primaryEmail: "rizky.saputra@sinarretail.co.id",
      primaryMobileNo: "+628121111003",
      gender: "MALE" as const,
      stage: "DISCOVERY" as const,
      value: 76000000,
      probability: 45,
      source: "WEBSITE" as const,
      expectedCloseDate: new Date("2026-04-28T00:00:00.000Z"),
      closedAt: null,
      lostReason: null,
      notes: "Masuk pipeline deal kecil-menengah untuk ekspansi toko Q2.",
      lastActivityAt: new Date("2026-03-23T10:00:00.000Z"),
    },
  ];

  for (const deal of deals) {
    await prisma.crmDeal.upsert({
      where: { id: deal.id },
      update: {
        tenantId: input.tenantId,
        customerId: deal.customerId,
        contactId: deal.contactId,
        leadId: deal.leadId,
        title: deal.title,
        company: deal.company,
        ownerId: deal.ownerId,
        ownerName: deal.ownerName,
        status: deal.status,
        website: deal.website,
        employeeCount: deal.employeeCount,
        annualRevenue: deal.annualRevenue,
        industry: deal.industry,
        firstName: deal.firstName,
        lastName: deal.lastName,
        primaryEmail: deal.primaryEmail,
        primaryMobileNo: deal.primaryMobileNo,
        gender: deal.gender,
        stage: deal.stage,
        value: deal.value,
        probability: deal.probability,
        source: deal.source,
        expectedCloseDate: deal.expectedCloseDate,
        closedAt: deal.closedAt,
        lostReason: deal.lostReason,
        notes: deal.notes,
        lastActivityAt: deal.lastActivityAt,
        deletedAt: null,
      },
      create: {
        id: deal.id,
        tenantId: input.tenantId,
        customerId: deal.customerId,
        contactId: deal.contactId,
        leadId: deal.leadId,
        title: deal.title,
        company: deal.company,
        ownerId: deal.ownerId,
        ownerName: deal.ownerName,
        status: deal.status,
        website: deal.website,
        employeeCount: deal.employeeCount,
        annualRevenue: deal.annualRevenue,
        industry: deal.industry,
        firstName: deal.firstName,
        lastName: deal.lastName,
        primaryEmail: deal.primaryEmail,
        primaryMobileNo: deal.primaryMobileNo,
        gender: deal.gender,
        stage: deal.stage,
        value: deal.value,
        probability: deal.probability,
        source: deal.source,
        expectedCloseDate: deal.expectedCloseDate,
        closedAt: deal.closedAt,
        lostReason: deal.lostReason,
        notes: deal.notes,
        lastActivityAt: deal.lastActivityAt,
      },
    });
  }

  const tasks = [
    {
      id: "seed-crm-task-1",
      leadId: "seed-crm-lead-1",
      dealId: null,
      title: "Kirim final BoQ dan pricing",
      description: "Lengkapi item SD-WAN, endpoint protection, dan opsi support tahunan.",
      status: "OPEN" as const,
      assigneeId: input.primaryOwnerId,
      assigneeName: input.primaryOwnerName,
      dueDate: new Date("2026-03-29T09:00:00.000Z"),
      priority: "HIGH" as const,
    },
    {
      id: "seed-crm-task-2",
      leadId: "seed-crm-lead-2",
      dealId: null,
      title: "Jadwalkan site survey 3 toko sampel",
      description: "Perlu validasi coverage dan estimasi jumlah AP per toko.",
      status: "IN_PROGRESS" as const,
      assigneeId: input.secondaryOwnerId,
      assigneeName: input.secondaryOwnerName,
      dueDate: new Date("2026-03-30T10:00:00.000Z"),
      priority: "MEDIUM" as const,
    },
    {
      id: "seed-crm-task-3",
      leadId: "seed-crm-lead-4",
      dealId: null,
      title: "Follow up draft proposal kominfo",
      description: "Pastikan format proposal sesuai template pemerintah daerah.",
      status: "OPEN" as const,
      assigneeId: input.secondaryOwnerId,
      assigneeName: input.secondaryOwnerName,
      dueDate: new Date("2026-04-01T08:00:00.000Z"),
      priority: "HIGH" as const,
    },
    {
      id: "seed-crm-task-4",
      leadId: null,
      dealId: "seed-crm-deal-1",
      title: "Negosiasi termin pembayaran",
      description: "Usulkan DP 40%, delivery 50%, retention 10% setelah BAST.",
      status: "IN_PROGRESS" as const,
      assigneeId: input.primaryOwnerId,
      assigneeName: input.primaryOwnerName,
      dueDate: new Date("2026-03-28T15:00:00.000Z"),
      priority: "HIGH" as const,
    },
    {
      id: "seed-crm-task-5",
      leadId: null,
      dealId: "seed-crm-deal-2",
      title: "Finalisasi RAB internal",
      description: "Sinkronkan BOM, jasa instalasi, dan margin sebelum proposal dikirim.",
      status: "OPEN" as const,
      assigneeId: input.secondaryOwnerId,
      assigneeName: input.secondaryOwnerName,
      dueDate: new Date("2026-03-31T13:00:00.000Z"),
      priority: "HIGH" as const,
    },
    {
      id: "seed-crm-task-6",
      leadId: null,
      dealId: "seed-crm-deal-3",
      title: "Validasi kebutuhan rollout 12 toko",
      description: "Kumpulkan data layout toko dan existing internet link tiap lokasi.",
      status: "COMPLETED" as const,
      assigneeId: input.secondaryOwnerId,
      assigneeName: input.secondaryOwnerName,
      dueDate: new Date("2026-03-22T16:00:00.000Z"),
      priority: "MEDIUM" as const,
    },
  ];

  for (const task of tasks) {
    await prisma.crmTask.upsert({
      where: { id: task.id },
      update: {
        tenantId: input.tenantId,
        leadId: task.leadId,
        dealId: task.dealId,
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        priority: task.priority,
        deletedAt: null,
      },
      create: {
        id: task.id,
        tenantId: input.tenantId,
        leadId: task.leadId,
        dealId: task.dealId,
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        priority: task.priority,
      },
    });
  }

  const notes = [
    {
      id: "seed-crm-note-1",
      leadId: "seed-crm-lead-1",
      dealId: null,
      title: "Meeting discovery hasil positif",
      content: "Customer setuju lanjut ke tahap final BoQ dan meminta opsi support 24/7.",
      writerId: input.primaryOwnerId,
      writerName: input.primaryOwnerName,
      createdAt: new Date("2026-03-24T09:30:00.000Z"),
    },
    {
      id: "seed-crm-note-2",
      leadId: "seed-crm-lead-2",
      dealId: null,
      title: "Butuh estimasi rollout bertahap",
      content: "Client ingin rollout dibagi dua batch agar cashflow proyek lebih aman.",
      writerId: input.secondaryOwnerId,
      writerName: input.secondaryOwnerName,
      createdAt: new Date("2026-03-23T10:30:00.000Z"),
    },
    {
      id: "seed-crm-note-3",
      leadId: "seed-crm-lead-4",
      dealId: null,
      title: "Permintaan template proposal pemerintah",
      content: "Tim customer mengirim contoh format proposal yang harus diikuti untuk pengajuan internal.",
      writerId: input.secondaryOwnerId,
      writerName: input.secondaryOwnerName,
      createdAt: new Date("2026-03-20T10:45:00.000Z"),
    },
    {
      id: "seed-crm-note-4",
      leadId: null,
      dealId: "seed-crm-deal-1",
      title: "Negosiasi harga putaran kedua",
      content: "Procurement minta opsi diskon 3% jika payment terms dipercepat menjadi 30 hari.",
      writerId: input.primaryOwnerId,
      writerName: input.primaryOwnerName,
      createdAt: new Date("2026-03-25T11:15:00.000Z"),
    },
    {
      id: "seed-crm-note-5",
      leadId: null,
      dealId: "seed-crm-deal-2",
      title: "Status proposal command center",
      content: "Draft proposal 80% selesai, menunggu angka jasa implementasi dari tim presales.",
      writerId: input.secondaryOwnerId,
      writerName: input.secondaryOwnerName,
      createdAt: new Date("2026-03-21T14:30:00.000Z"),
    },
    {
      id: "seed-crm-note-6",
      leadId: null,
      dealId: "seed-crm-deal-3",
      title: "Site data toko sudah masuk",
      content: "7 dari 12 layout toko sudah diterima, sisanya menyusul pekan depan.",
      writerId: input.secondaryOwnerId,
      writerName: input.secondaryOwnerName,
      createdAt: new Date("2026-03-22T16:30:00.000Z"),
    },
  ];

  for (const note of notes) {
    await prisma.crmNote.upsert({
      where: { id: note.id },
      update: {
        tenantId: input.tenantId,
        leadId: note.leadId,
        dealId: note.dealId,
        title: note.title,
        content: note.content,
        writerId: note.writerId,
        writerName: note.writerName,
        createdAt: note.createdAt,
        deletedAt: null,
      },
      create: {
        id: note.id,
        tenantId: input.tenantId,
        leadId: note.leadId,
        dealId: note.dealId,
        title: note.title,
        content: note.content,
        writerId: note.writerId,
        writerName: note.writerName,
        createdAt: note.createdAt,
      },
    });
  }

  const activities = [
    {
      id: "seed-crm-activity-1",
      customerId: "seed-crm-org-1",
      leadId: "seed-crm-lead-1",
      dealId: null,
      title: "Discovery meeting onsite",
      description: "Diskusi kebutuhan SD-WAN dan endpoint security untuk 5 cabang.",
      type: "MEETING" as const,
      ownerName: input.primaryOwnerName,
      scheduledAt: new Date("2026-03-24T09:00:00.000Z"),
      completedAt: new Date("2026-03-24T10:30:00.000Z"),
    },
    {
      id: "seed-crm-activity-2",
      customerId: "seed-crm-org-2",
      leadId: "seed-crm-lead-2",
      dealId: null,
      title: "Initial qualification call",
      description: "Mendapat jumlah toko target dan kebutuhan coverage wifi awal.",
      type: "CALL" as const,
      ownerName: input.secondaryOwnerName,
      scheduledAt: new Date("2026-03-23T10:00:00.000Z"),
      completedAt: new Date("2026-03-23T10:20:00.000Z"),
    },
    {
      id: "seed-crm-activity-3",
      customerId: "seed-crm-org-3",
      leadId: "seed-crm-lead-3",
      dealId: null,
      title: "Expo follow-up email",
      description: "Mengirim company profile, katalog access point, dan opsi pilot project.",
      type: "EMAIL" as const,
      ownerName: input.primaryOwnerName,
      scheduledAt: new Date("2026-03-21T13:00:00.000Z"),
      completedAt: new Date("2026-03-21T13:05:00.000Z"),
    },
    {
      id: "seed-crm-activity-4",
      customerId: "seed-crm-org-4",
      leadId: "seed-crm-lead-4",
      dealId: null,
      title: "Site survey command center",
      description: "Tim sales dan presales survey ruang NOC dan jaringan eksisting.",
      type: "MEETING" as const,
      ownerName: input.secondaryOwnerName,
      scheduledAt: new Date("2026-03-20T10:15:00.000Z"),
      completedAt: new Date("2026-03-20T12:00:00.000Z"),
    },
    {
      id: "seed-crm-activity-5",
      customerId: "seed-crm-org-1",
      leadId: "seed-crm-lead-5",
      dealId: "seed-crm-deal-1",
      title: "Lead converted to deal",
      description: "Opportunity laptop refresh dipindahkan ke pipeline deal untuk negosiasi final.",
      type: "STAGE_CHANGE" as const,
      ownerName: input.primaryOwnerName,
      scheduledAt: new Date("2026-03-25T11:00:00.000Z"),
      completedAt: new Date("2026-03-25T11:00:00.000Z"),
    },
    {
      id: "seed-crm-activity-6",
      customerId: "seed-crm-org-1",
      leadId: null,
      dealId: "seed-crm-deal-1",
      title: "Negotiation review call",
      description: "Bahas payment terms, diskon volume, dan target PO minggu depan.",
      type: "CALL" as const,
      ownerName: input.primaryOwnerName,
      scheduledAt: new Date("2026-03-25T15:00:00.000Z"),
      completedAt: new Date("2026-03-25T15:30:00.000Z"),
    },
    {
      id: "seed-crm-activity-7",
      customerId: "seed-crm-org-4",
      leadId: null,
      dealId: "seed-crm-deal-2",
      title: "Proposal preparation",
      description: "Koordinasi internal untuk finalisasi RAB dan timeline implementasi.",
      type: "FOLLOW_UP" as const,
      ownerName: input.secondaryOwnerName,
      scheduledAt: new Date("2026-03-21T14:00:00.000Z"),
      completedAt: new Date("2026-03-21T14:30:00.000Z"),
    },
    {
      id: "seed-crm-activity-8",
      customerId: "seed-crm-org-2",
      leadId: null,
      dealId: "seed-crm-deal-3",
      title: "Requirement checklist completed",
      description: "Checklist rollout tiap toko sudah hampir lengkap untuk buat proposal awal.",
      type: "TASK" as const,
      ownerName: input.secondaryOwnerName,
      scheduledAt: new Date("2026-03-22T16:00:00.000Z"),
      completedAt: new Date("2026-03-22T16:00:00.000Z"),
    },
  ];

  for (const activity of activities) {
    await prisma.crmActivity.upsert({
      where: { id: activity.id },
      update: {
        tenantId: input.tenantId,
        customerId: activity.customerId,
        leadId: activity.leadId,
        dealId: activity.dealId,
        title: activity.title,
        description: activity.description,
        type: activity.type,
        ownerName: activity.ownerName,
        scheduledAt: activity.scheduledAt,
        completedAt: activity.completedAt,
        deletedAt: null,
      },
      create: {
        id: activity.id,
        tenantId: input.tenantId,
        customerId: activity.customerId,
        leadId: activity.leadId,
        dealId: activity.dealId,
        title: activity.title,
        description: activity.description,
        type: activity.type,
        ownerName: activity.ownerName,
        scheduledAt: activity.scheduledAt,
        completedAt: activity.completedAt,
      },
    });
  }

  console.log(`    Organizations : ${organizations.length}`);
  console.log(`    Contacts      : ${contacts.length}`);
  console.log(`    Leads         : ${leads.length}`);
  console.log(`    Deals         : ${deals.length}`);
  console.log(`    Tasks         : ${tasks.length}`);
  console.log(`    Notes         : ${notes.length}`);
}

async function createInventorySampleData(input: {
  tenantId: string;
  adminUserId: string;
  salesUserId: string;
}) {
  const batchFoundationAvailable = await hasInventoryBatchFoundation();

  const { stockCoa, tempAssetCoa, cogsCoa } = await createInventorySeedCoas({
    tenantId: input.tenantId,
    userId: input.adminUserId,
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: "MAIN-WH" },
    },
    update: {
      name: "Gudang Pusat",
      description: "Gudang utama untuk stok jual dan aset sementara.",
      isActive: true,
    },
    create: {
      tenantId: input.tenantId,
      code: "MAIN-WH",
      name: "Gudang Pusat",
      description: "Gudang utama untuk stok jual dan aset sementara.",
      isActive: true,
    },
  });

  const branchWarehouse = await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: "SITE-WH" },
    },
    update: {
      name: "Gudang Site / Operasional",
      description: "Gudang untuk buffer stok proyek dan penggunaan operasional.",
      isActive: true,
    },
    create: {
      tenantId: input.tenantId,
      code: "SITE-WH",
      name: "Gudang Site / Operasional",
      description: "Gudang untuk buffer stok proyek dan penggunaan operasional.",
      isActive: true,
    },
  });

  const items = [
    {
      sku: "INV-ROUTER-001",
      name: "Router Mikrotik RB750",
      category: "Networking",
      unitOfMeasure: "PCS",
      description: "Router untuk stok jual dan kebutuhan implementasi lapangan.",
      brand: "Mikrotik",
      model: "RB750",
      manufacturerPartNumber: "RB750GR3",
      barcode: "8990000001001",
      technicalSpecs: "5x Gigabit Ethernet, compact router, cocok untuk branch office.",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      standardCost: 850000,
      minStock: 2,
      reorderPoint: 4,
      warehouseId: mainWarehouse.id,
      saleQty: 8,
      tempQty: 2,
      reclassifyQty: 1,
    },
    {
      sku: "INV-SWITCH-001",
      name: "Switch 8 Port Gigabit",
      category: "Networking",
      unitOfMeasure: "PCS",
      description: "Switch unmanaged 8 port untuk kebutuhan distribusi jaringan.",
      brand: "TP-Link",
      model: "TL-SG108",
      manufacturerPartNumber: "TL-SG108",
      barcode: "8990000001002",
      technicalSpecs: "8-port unmanaged gigabit switch, desktop/rackmount metal casing.",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      standardCost: 475000,
      minStock: 3,
      reorderPoint: 5,
      warehouseId: mainWarehouse.id,
      saleQty: 6,
      tempQty: 4,
      reclassifyQty: 2,
    },
    {
      sku: "INV-AP-001",
      name: "Access Point Indoor",
      category: "Wireless",
      unitOfMeasure: "PCS",
      description: "Access point indoor untuk deployment kantor dan pelanggan.",
      brand: "Ubiquiti",
      model: "UAP-AC-Lite",
      manufacturerPartNumber: "UAP-AC-LITE",
      barcode: "8990000001003",
      technicalSpecs: "Dual-band indoor AP, PoE powered, ceiling mount.",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      standardCost: 920000,
      minStock: 2,
      reorderPoint: 3,
      warehouseId: branchWarehouse.id,
      saleQty: 5,
      tempQty: 1,
      reclassifyQty: 0,
    },
    {
      sku: "INV-LAPTOP-001",
      name: "Laptop Dell Latitude 5440",
      category: "Laptop",
      unitOfMeasure: "UNIT",
      description: "Laptop bisnis untuk penjualan enterprise dan operasional internal.",
      brand: "Dell",
      model: "Latitude 5440",
      manufacturerPartNumber: "LAT-5440-I7",
      barcode: "8990000002001",
      technicalSpecs: "Intel Core i7, RAM 16GB, SSD 512GB, 14 inch FHD.",
      trackingMode: InventoryTrackingMode.SERIAL,
      usageType: InventoryUsageType.BOTH,
      standardCost: 12850000,
      minStock: 1,
      reorderPoint: 2,
      warehouseId: mainWarehouse.id,
      saleQty: 3,
      tempQty: 2,
      reclassifyQty: 0,
      serializedUnits: [
        { bucketType: InventoryBucketType.SALE_STOCK, serialNumber: "DL5440-S-001", assetTag: null, condition: InventoryUnitCondition.NEW, assignedToUserId: null },
        { bucketType: InventoryBucketType.SALE_STOCK, serialNumber: "DL5440-S-002", assetTag: null, condition: InventoryUnitCondition.NEW, assignedToUserId: null },
        { bucketType: InventoryBucketType.SALE_STOCK, serialNumber: "DL5440-S-003", assetTag: null, condition: InventoryUnitCondition.NEW, assignedToUserId: null },
        { bucketType: InventoryBucketType.TEMP_ASSET, serialNumber: "DL5440-A-001", assetTag: "AST-LTP-001", condition: InventoryUnitCondition.GOOD, assignedToUserId: input.salesUserId },
        { bucketType: InventoryBucketType.TEMP_ASSET, serialNumber: "DL5440-A-002", assetTag: "AST-LTP-002", condition: InventoryUnitCondition.NEW, assignedToUserId: null },
      ],
    },
    {
      sku: "INV-PRINTER-001",
      name: "Printer Epson L6490",
      category: "Printer",
      unitOfMeasure: "UNIT",
      description: "Printer ink tank untuk kebutuhan operasional cabang dan demo unit.",
      brand: "Epson",
      model: "L6490",
      manufacturerPartNumber: "C11CJ88401",
      barcode: "8990000002002",
      technicalSpecs: "ADF, duplex print, scan/copy/fax, ethernet + wifi.",
      trackingMode: InventoryTrackingMode.BOTH,
      usageType: InventoryUsageType.OPERATIONAL,
      standardCost: 6150000,
      minStock: 1,
      reorderPoint: 1,
      warehouseId: branchWarehouse.id,
      saleQty: 1,
      tempQty: 2,
      reclassifyQty: 0,
      serializedUnits: [
        { bucketType: InventoryBucketType.SALE_STOCK, serialNumber: "EPS-L6490-S-001", assetTag: null, condition: InventoryUnitCondition.NEW, assignedToUserId: null },
        { bucketType: InventoryBucketType.TEMP_ASSET, serialNumber: "EPS-L6490-A-001", assetTag: "AST-PRN-001", condition: InventoryUnitCondition.GOOD, assignedToUserId: null },
        { bucketType: InventoryBucketType.TEMP_ASSET, serialNumber: "EPS-L6490-A-002", assetTag: "AST-PRN-002", condition: InventoryUnitCondition.NEW, assignedToUserId: null },
      ],
    },
  ];

  for (const entry of items) {
    const item = await prisma.inventoryItem.upsert({
      where: {
        tenantId_sku: { tenantId: input.tenantId, sku: entry.sku },
      },
      update: {
        name: entry.name,
        category: entry.category,
        unitOfMeasure: entry.unitOfMeasure,
        description: entry.description,
        brand: entry.brand,
        model: entry.model,
        manufacturerPartNumber: entry.manufacturerPartNumber,
        barcode: entry.barcode,
        technicalSpecs: entry.technicalSpecs,
        trackingMode: entry.trackingMode,
        usageType: entry.usageType,
        isStockTracked: true,
        minStock: entry.minStock,
        reorderPoint: entry.reorderPoint,
        standardCost: entry.standardCost,
        inventoryCoaId: stockCoa.id,
        temporaryAssetCoaId: tempAssetCoa.id,
        cogsCoaId: cogsCoa.id,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId: input.tenantId,
        sku: entry.sku,
        name: entry.name,
        category: entry.category,
        unitOfMeasure: entry.unitOfMeasure,
        description: entry.description,
        brand: entry.brand,
        model: entry.model,
        manufacturerPartNumber: entry.manufacturerPartNumber,
        barcode: entry.barcode,
        technicalSpecs: entry.technicalSpecs,
        trackingMode: entry.trackingMode,
        usageType: entry.usageType,
        isStockTracked: true,
        minStock: entry.minStock,
        reorderPoint: entry.reorderPoint,
        standardCost: entry.standardCost,
        inventoryCoaId: stockCoa.id,
        temporaryAssetCoaId: tempAssetCoa.id,
        cogsCoaId: cogsCoa.id,
        isActive: true,
      },
    });

    if (batchFoundationAvailable) {
      await prisma.inventoryReceiptBatch.deleteMany({
        where: {
          tenantId: input.tenantId,
          inventoryItemId: item.id,
          warehouseId: entry.warehouseId,
        },
      });
    }

    const saleBalance = await prisma.inventoryBalance.upsert({
      where: {
        itemId_warehouseId_bucketType: {
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "SALE_STOCK",
        },
      },
      update: {
        qtyOnHand: entry.saleQty + entry.reclassifyQty,
        qtyReserved: 0,
      },
      create: {
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "SALE_STOCK",
        qtyOnHand: entry.saleQty + entry.reclassifyQty,
        qtyReserved: 0,
      },
    });

    const tempBalance = await prisma.inventoryBalance.upsert({
      where: {
        itemId_warehouseId_bucketType: {
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "TEMP_ASSET",
        },
      },
      update: {
        qtyOnHand: entry.tempQty - entry.reclassifyQty,
        qtyReserved: 0,
      },
      create: {
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "TEMP_ASSET",
        qtyOnHand: entry.tempQty - entry.reclassifyQty,
        qtyReserved: 0,
      },
    });

    const receiptSaleRef = `SEED-RECEIPT-${entry.sku}-SALE`;
    const receiptTempRef = `SEED-RECEIPT-${entry.sku}-TEMP`;

    const saleBatch = batchFoundationAvailable && entry.saleQty > 0
      ? await prisma.inventoryReceiptBatch.create({
          data: {
            tenantId: input.tenantId,
            inventoryItemId: item.id,
            warehouseId: entry.warehouseId,
            bucketType: InventoryBucketType.SALE_STOCK,
            vendorName: entry.sku === "INV-LAPTOP-001" ? "Vendor A" : entry.sku === "INV-PRINTER-001" ? "Vendor Printer Nusantara" : "Vendor Umum A",
            vendorReference: `PO-${entry.sku}-SALE`,
            batchNumber: `BATCH-${entry.sku}-SALE-01`,
            unitCost: entry.standardCost,
            receivedQty: entry.saleQty + entry.reclassifyQty,
            remainingQty: entry.saleQty + entry.reclassifyQty,
            receivedDate: new Date("2026-02-15T08:00:00.000Z"),
            referenceType: "Seeder",
            referenceId: receiptSaleRef,
            notes: `Seed sale stock batch for ${entry.sku}`,
          },
        })
      : null;

    const tempBatch = batchFoundationAvailable && entry.tempQty > 0
      ? await prisma.inventoryReceiptBatch.create({
          data: {
            tenantId: input.tenantId,
            inventoryItemId: item.id,
            warehouseId: entry.warehouseId,
            bucketType: InventoryBucketType.TEMP_ASSET,
            vendorName: entry.sku === "INV-LAPTOP-001" ? "Vendor B" : entry.sku === "INV-PRINTER-001" ? "Vendor Printer Nusantara" : "Vendor Umum B",
            vendorReference: `PO-${entry.sku}-TEMP`,
            batchNumber: `BATCH-${entry.sku}-TEMP-01`,
            unitCost: entry.standardCost,
            receivedQty: Math.max(entry.tempQty, 0),
            remainingQty: Math.max(entry.tempQty - entry.reclassifyQty, 0),
            receivedDate: new Date("2026-02-16T08:00:00.000Z"),
            referenceType: "Seeder",
            referenceId: receiptTempRef,
            notes: `Seed temporary asset batch for ${entry.sku}`,
          },
        })
      : null;

    await prisma.inventoryLedgerEntry.upsert({
      where: { id: `${item.id}-sale-receipt` },
      update: {
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "SALE_STOCK",
        movementType: "RECEIPT",
        referenceType: "Seeder",
        referenceId: receiptSaleRef,
        chartOfAccountId: stockCoa.id,
        quantityBefore: 0,
        quantityChange: entry.saleQty,
        quantityAfter: entry.saleQty,
        unitCost: entry.standardCost,
        totalCost: entry.saleQty * entry.standardCost,
        notes: `Seed manual receipt sale stock for ${entry.sku}`,
        createdById: input.adminUserId,
      },
      create: {
        id: `${item.id}-sale-receipt`,
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "SALE_STOCK",
        movementType: "RECEIPT",
        referenceType: "Seeder",
        referenceId: receiptSaleRef,
        chartOfAccountId: stockCoa.id,
        quantityBefore: 0,
        quantityChange: entry.saleQty,
        quantityAfter: entry.saleQty,
        unitCost: entry.standardCost,
        totalCost: entry.saleQty * entry.standardCost,
        notes: `Seed manual receipt sale stock for ${entry.sku}`,
        createdById: input.adminUserId,
      },
    });

    await prisma.inventoryLedgerEntry.upsert({
      where: { id: `${item.id}-temp-receipt` },
      update: {
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "TEMP_ASSET",
        movementType: "RECEIPT",
        referenceType: "Seeder",
        referenceId: receiptTempRef,
        chartOfAccountId: tempAssetCoa.id,
        quantityBefore: 0,
        quantityChange: entry.tempQty,
        quantityAfter: entry.tempQty,
        unitCost: entry.standardCost,
        totalCost: entry.tempQty * entry.standardCost,
        notes: `Seed manual receipt temporary asset for ${entry.sku}`,
        createdById: input.adminUserId,
      },
      create: {
        id: `${item.id}-temp-receipt`,
        tenantId: input.tenantId,
        itemId: item.id,
        warehouseId: entry.warehouseId,
        bucketType: "TEMP_ASSET",
        movementType: "RECEIPT",
        referenceType: "Seeder",
        referenceId: receiptTempRef,
        chartOfAccountId: tempAssetCoa.id,
        quantityBefore: 0,
        quantityChange: entry.tempQty,
        quantityAfter: entry.tempQty,
        unitCost: entry.standardCost,
        totalCost: entry.tempQty * entry.standardCost,
        notes: `Seed manual receipt temporary asset for ${entry.sku}`,
        createdById: input.adminUserId,
      },
    });

    if (entry.reclassifyQty > 0) {
      const reclassRef = `SEED-RECLASS-${entry.sku}`;
      await prisma.inventoryLedgerEntry.upsert({
        where: { id: `${item.id}-temp-transfer-out` },
        update: {
          tenantId: input.tenantId,
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "TEMP_ASSET",
          movementType: "TRANSFER_OUT",
          referenceType: "SeederReclassification",
          referenceId: reclassRef,
          chartOfAccountId: tempAssetCoa.id,
          quantityBefore: entry.tempQty,
          quantityChange: -entry.reclassifyQty,
          quantityAfter: entry.tempQty - entry.reclassifyQty,
          unitCost: entry.standardCost,
          totalCost: entry.reclassifyQty * entry.standardCost,
          notes: `Seed reclassification from temporary asset to sale stock for ${entry.sku}`,
          createdById: input.adminUserId,
        },
        create: {
          id: `${item.id}-temp-transfer-out`,
          tenantId: input.tenantId,
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "TEMP_ASSET",
          movementType: "TRANSFER_OUT",
          referenceType: "SeederReclassification",
          referenceId: reclassRef,
          chartOfAccountId: tempAssetCoa.id,
          quantityBefore: entry.tempQty,
          quantityChange: -entry.reclassifyQty,
          quantityAfter: entry.tempQty - entry.reclassifyQty,
          unitCost: entry.standardCost,
          totalCost: entry.reclassifyQty * entry.standardCost,
          notes: `Seed reclassification from temporary asset to sale stock for ${entry.sku}`,
          createdById: input.adminUserId,
        },
      });

      await prisma.inventoryLedgerEntry.upsert({
        where: { id: `${item.id}-sale-transfer-in` },
        update: {
          tenantId: input.tenantId,
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "SALE_STOCK",
          movementType: "TRANSFER_IN",
          referenceType: "SeederReclassification",
          referenceId: reclassRef,
          chartOfAccountId: stockCoa.id,
          quantityBefore: entry.saleQty,
          quantityChange: entry.reclassifyQty,
          quantityAfter: entry.saleQty + entry.reclassifyQty,
          unitCost: entry.standardCost,
          totalCost: entry.reclassifyQty * entry.standardCost,
          notes: `Seed reclassification from temporary asset to sale stock for ${entry.sku}`,
          createdById: input.adminUserId,
        },
        create: {
          id: `${item.id}-sale-transfer-in`,
          tenantId: input.tenantId,
          itemId: item.id,
          warehouseId: entry.warehouseId,
          bucketType: "SALE_STOCK",
          movementType: "TRANSFER_IN",
          referenceType: "SeederReclassification",
          referenceId: reclassRef,
          chartOfAccountId: stockCoa.id,
          quantityBefore: entry.saleQty,
          quantityChange: entry.reclassifyQty,
          quantityAfter: entry.saleQty + entry.reclassifyQty,
          unitCost: entry.standardCost,
          totalCost: entry.reclassifyQty * entry.standardCost,
          notes: `Seed reclassification from temporary asset to sale stock for ${entry.sku}`,
          createdById: input.adminUserId,
        },
      });
    }

    if (batchFoundationAvailable && entry.serializedUnits?.length) {
      for (const [index, unit] of entry.serializedUnits.entries()) {
        const seedUnitId = `${entry.sku}-${unit.serialNumber ?? unit.assetTag ?? index}`;
        await prisma.inventoryItemUnit.upsert({
          where: {
            tenantId_serialNumber: {
              tenantId: input.tenantId,
              serialNumber: unit.serialNumber ?? "",
            },
          },
          update: {
            inventoryItemId: item.id,
            warehouseId: entry.warehouseId,
            receiptBatchId: unit.bucketType === InventoryBucketType.SALE_STOCK ? saleBatch?.id : tempBatch?.id,
            bucketType: unit.bucketType,
            assetTag: unit.assetTag,
            batchNumber: unit.bucketType === InventoryBucketType.SALE_STOCK ? saleBatch?.batchNumber ?? `BATCH-${entry.sku}` : tempBatch?.batchNumber ?? `BATCH-${entry.sku}`,
            status: unit.assignedToUserId ? InventoryUnitStatus.ASSIGNED : InventoryUnitStatus.IN_STOCK,
            condition: unit.condition,
            assignedToUserId: unit.assignedToUserId ?? null,
            assignedAt: unit.assignedToUserId ? new Date("2026-03-01T09:00:00.000Z") : null,
            notes: `Seed serialized unit ${seedUnitId}`,
          },
          create: {
            tenantId: input.tenantId,
            inventoryItemId: item.id,
            warehouseId: entry.warehouseId,
            receiptBatchId: unit.bucketType === InventoryBucketType.SALE_STOCK ? saleBatch?.id : tempBatch?.id,
            bucketType: unit.bucketType,
            serialNumber: unit.serialNumber,
            assetTag: unit.assetTag,
            batchNumber: unit.bucketType === InventoryBucketType.SALE_STOCK ? saleBatch?.batchNumber ?? `BATCH-${entry.sku}` : tempBatch?.batchNumber ?? `BATCH-${entry.sku}`,
            status: unit.assignedToUserId ? InventoryUnitStatus.ASSIGNED : InventoryUnitStatus.IN_STOCK,
            condition: unit.condition,
            receivedDate: new Date("2026-02-15T08:00:00.000Z"),
            purchaseDate: new Date("2026-02-10T08:00:00.000Z"),
            warrantyExpiry: new Date("2027-02-10T08:00:00.000Z"),
            assignedToUserId: unit.assignedToUserId ?? null,
            assignedAt: unit.assignedToUserId ? new Date("2026-03-01T09:00:00.000Z") : null,
            notes: `Seed serialized unit ${seedUnitId}`,
          },
        });
      }
    }

    await prisma.auditLog.upsert({
      where: { id: `${item.id}-inventory-seed` },
      update: {
        tenantId: input.tenantId,
        userId: input.adminUserId,
        action: "CREATE",
        entityType: "InventorySeed",
        entityId: item.id,
        changes: {
          after: {
            sku: entry.sku,
            warehouseId: entry.warehouseId,
            saleStock: Number(saleBalance.qtyOnHand),
            temporaryAsset: Number(tempBalance.qtyOnHand),
          },
        },
      },
      create: {
        id: `${item.id}-inventory-seed`,
        tenantId: input.tenantId,
        userId: input.adminUserId,
        action: "CREATE",
        entityType: "InventorySeed",
        entityId: item.id,
        changes: {
          after: {
            sku: entry.sku,
            warehouseId: entry.warehouseId,
            saleStock: Number(saleBalance.qtyOnHand),
            temporaryAsset: Number(tempBalance.qtyOnHand),
          },
        },
      },
    });
  }

  console.log(`    Warehouses : MAIN-WH, SITE-WH`);
  console.log(`    Inventory COA : 1150 Persediaan Barang Dagang`);
  console.log(`    Temp Asset COA: 1151 Aset Sementara Inventory`);
  console.log(`    COGS COA      : 5100 Beban Pokok Penjualan`);
  console.log(`    Sample items  : INV-ROUTER-001, INV-SWITCH-001, INV-AP-001, INV-LAPTOP-001, INV-PRINTER-001`);
  console.log(`    Scenario      : manual receipt split + reclassification + batch/vendor costing seeded`);
  if (!batchFoundationAvailable) {
    console.log(`    Batch status   : schema batch belum diterapkan ke DB, seed batch-specific data dilewati`);
  }

  void input.salesUserId;
}

async function createSampleBusinessData(input: {
  tenantId: string;
  adminUserId: string;
  financeUserId: string;
  salesRequesterId: string;
  engineerRequesterId: string;
}) {
  const { tenantId, adminUserId, financeUserId, salesRequesterId, engineerRequesterId } = input;

  const [cashCoa, bankCoa, advanceCoa, equityCoa, airfareCoa, accommodationCoa] =
    await Promise.all([
      findCoaByCode(tenantId, "1110"),
      findCoaByCode(tenantId, "1120"),
      findCoaByCode(tenantId, "1131"),
      findCoaByCode(tenantId, "3100"),
      findCoaByCode(tenantId, "6110"),
      findCoaByCode(tenantId, "6130"),
    ]);

  const bankOps = await prisma.balanceAccount.upsert({
    where: { tenantId_code: { tenantId, code: "BANK-OPS" } },
    update: {
      name: "Rekening Operasional Utama",
      balance: 46650000,
      defaultChartOfAccountId: bankCoa.id,
      description: "Rekening bank operasional utama perusahaan",
      isActive: true,
    },
    create: {
      tenantId,
      code: "BANK-OPS",
      name: "Rekening Operasional Utama",
      balance: 46650000,
      defaultChartOfAccountId: bankCoa.id,
      description: "Rekening bank operasional utama perusahaan",
      isActive: true,
    },
  });

  const pettyCash = await prisma.balanceAccount.upsert({
    where: { tenantId_code: { tenantId, code: "KAS-KECIL" } },
    update: {
      name: "Kas Kecil Kantor",
      balance: 5000000,
      defaultChartOfAccountId: cashCoa.id,
      description: "Kas kecil untuk kebutuhan operasional harian",
      isActive: true,
    },
    create: {
      tenantId,
      code: "KAS-KECIL",
      name: "Kas Kecil Kantor",
      balance: 5000000,
      defaultChartOfAccountId: cashCoa.id,
      description: "Kas kecil untuk kebutuhan operasional harian",
      isActive: true,
    },
  });

  const project = await prisma.project.upsert({
    where: { tenantId_code: { tenantId, code: "PRJ-SALES-001" } },
    update: {
      name: "Ekspansi Klien Nasional",
      description: "Proyek penjualan untuk kunjungan klien nasional.",
      clientName: "PT Nusantara Digital",
      isActive: true,
    },
    create: {
      tenantId,
      code: "PRJ-SALES-001",
      name: "Ekspansi Klien Nasional",
      description: "Proyek penjualan untuk kunjungan klien nasional.",
      clientName: "PT Nusantara Digital",
      isActive: true,
      salesId: "EMP020",
    },
  });

  const approvedTravelNumber = "TR-2026-00001";
  const lockedTravelNumber = "TR-2026-00002";

  const approvedTravel = await prisma.travelRequest.upsert({
    where: { tenantId_requestNumber: { tenantId, requestNumber: approvedTravelNumber } },
    update: {},
    create: {
      tenantId,
      requestNumber: approvedTravelNumber,
      requesterId: salesRequesterId,
      purpose: "Kunjungan prospek dan presentasi solusi ke klien baru.",
      destination: "Surabaya",
      travelType: TravelType.SALES,
      startDate: new Date("2026-03-20"),
      endDate: new Date("2026-03-22"),
      projectId: project.id,
      status: TravelStatus.APPROVED,
      submittedAt: new Date("2026-03-15"),
    },
  });

  const lockedTravel = await prisma.travelRequest.upsert({
    where: { tenantId_requestNumber: { tenantId, requestNumber: lockedTravelNumber } },
    update: {},
    create: {
      tenantId,
      requestNumber: lockedTravelNumber,
      requesterId: engineerRequesterId,
      purpose: "Implementasi sistem dan pendampingan user di lokasi proyek.",
      destination: "Bandung",
      travelType: TravelType.OPERATIONAL,
      startDate: new Date("2026-03-10"),
      endDate: new Date("2026-03-12"),
      status: TravelStatus.LOCKED,
      submittedAt: new Date("2026-03-05"),
      lockedAt: new Date("2026-03-13"),
    },
  });

  await prisma.travelParticipant.upsert({
    where: {
      travelRequestId_userId: {
        travelRequestId: approvedTravel.id,
        userId: salesRequesterId,
      },
    },
    update: {},
    create: {
      tenantId,
      travelRequestId: approvedTravel.id,
      userId: salesRequesterId,
      role: "Presenter",
    },
  });

  await prisma.travelParticipant.upsert({
    where: {
      travelRequestId_userId: {
        travelRequestId: lockedTravel.id,
        userId: engineerRequesterId,
      },
    },
    update: {},
    create: {
      tenantId,
      travelRequestId: lockedTravel.id,
      userId: engineerRequesterId,
      role: "Implementor",
    },
  });

  const approvedBailoutNumber = "BLT-2026-00001";
  const disbursedBailoutNumber = "BLT-2026-00002";

  await prisma.bailout.upsert({
    where: { tenantId_bailoutNumber: { tenantId, bailoutNumber: approvedBailoutNumber } },
    update: {},
    create: {
      tenantId,
      bailoutNumber: approvedBailoutNumber,
      travelRequestId: approvedTravel.id,
      requesterId: salesRequesterId,
      category: BailoutCategory.HOTEL,
      description: "Uang muka hotel dan transport lokal untuk kunjungan sales.",
      amount: 3500000,
      status: BailoutStatus.APPROVED_DIRECTOR,
      submittedAt: new Date("2026-03-16"),
    },
  });

  const disbursedBailout = await prisma.bailout.upsert({
    where: { tenantId_bailoutNumber: { tenantId, bailoutNumber: disbursedBailoutNumber } },
    update: {},
    create: {
      tenantId,
      bailoutNumber: disbursedBailoutNumber,
      travelRequestId: lockedTravel.id,
      requesterId: engineerRequesterId,
      category: BailoutCategory.TRANSPORT,
      description: "Uang muka tiket pesawat dan akomodasi implementasi Bandung.",
      amount: 2500000,
      status: BailoutStatus.DISBURSED,
      submittedAt: new Date("2026-03-07"),
      disbursedAt: new Date("2026-03-08"),
      disbursementRef: "BANK-TFR-20260308",
      financeId: financeUserId,
      storageUrl: "https://example.com/bailout-proof-bandung.pdf",
    },
  });

  const approvedClaimNumber = "CLM-2026-00001";
  const paidClaimNumber = "CLM-2026-00002";

  await prisma.claim.upsert({
    where: { tenantId_claimNumber: { tenantId, claimNumber: approvedClaimNumber } },
    update: {},
    create: {
      tenantId,
      claimNumber: approvedClaimNumber,
      travelRequestId: lockedTravel.id,
      submitterId: engineerRequesterId,
      claimType: ClaimType.NON_ENTERTAINMENT,
      status: ClaimStatus.APPROVED,
      expenseCategory: "ACCOMMODATION",
      expenseDate: new Date("2026-03-12"),
      expenseDestination: "Bandung",
      amount: 1250000,
      description: "Biaya hotel implementasi di Bandung.",
      coaId: accommodationCoa.id,
    },
  });

  const paidClaim = await prisma.claim.upsert({
    where: { tenantId_claimNumber: { tenantId, claimNumber: paidClaimNumber } },
    update: {},
    create: {
      tenantId,
      claimNumber: paidClaimNumber,
      travelRequestId: lockedTravel.id,
      submitterId: engineerRequesterId,
      claimType: ClaimType.NON_ENTERTAINMENT,
      status: ClaimStatus.PAID,
      expenseCategory: "TRANSPORT",
      expenseDate: new Date("2026-03-11"),
      expenseDestination: "Bandung",
      amount: 850000,
      description: "Tiket pesawat dan transport bandara untuk implementasi.",
      coaId: airfareCoa.id,
      isPaid: true,
      paidAt: new Date("2026-03-14"),
      paidBy: "Finance Staff 1",
      paymentReference: "BANK-TFR-20260314",
      financeId: financeUserId,
    },
  });

  const openingNumber = "JE-2026-00001";
  await prisma.journalEntry.upsert({
    where: { tenantId_journalNumber: { tenantId, journalNumber: openingNumber } },
    update: {},
    create: {
      tenantId,
      journalNumber: openingNumber,
      transactionDate: new Date("2026-03-01"),
      description: "Saldo awal rekening operasional",
      sourceType: JournalSourceType.FUNDING,
      status: JournalStatus.POSTED,
      createdById: adminUserId,
      postedById: adminUserId,
      postedAt: new Date("2026-03-01"),
      lines: {
        create: [
          {
            lineNumber: 1,
            chartOfAccountId: bankCoa.id,
            balanceAccountId: bankOps.id,
            description: "Saldo awal bank operasional",
            debitAmount: 50000000,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            chartOfAccountId: equityCoa.id,
            description: "Modal awal",
            debitAmount: 0,
            creditAmount: 50000000,
          },
        ],
      },
    },
  });

  const pettyCashNumber = "JE-2026-00002";
  await prisma.journalEntry.upsert({
    where: { tenantId_journalNumber: { tenantId, journalNumber: pettyCashNumber } },
    update: {},
    create: {
      tenantId,
      journalNumber: pettyCashNumber,
      transactionDate: new Date("2026-03-02"),
      description: "Pembentukan kas kecil",
      sourceType: JournalSourceType.FUNDING,
      status: JournalStatus.POSTED,
      createdById: adminUserId,
      postedById: adminUserId,
      postedAt: new Date("2026-03-02"),
      lines: {
        create: [
          {
            lineNumber: 1,
            chartOfAccountId: cashCoa.id,
            balanceAccountId: pettyCash.id,
            description: "Kas kecil kantor",
            debitAmount: 5000000,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            chartOfAccountId: bankCoa.id,
            balanceAccountId: bankOps.id,
            description: "Transfer dari rekening operasional",
            debitAmount: 0,
            creditAmount: 5000000,
          },
        ],
      },
    },
  });

  const disbursementJeNumber = "JE-2026-00003";
  await prisma.journalEntry.upsert({
    where: { tenantId_journalNumber: { tenantId, journalNumber: disbursementJeNumber } },
    update: {},
    create: {
      tenantId,
      journalNumber: disbursementJeNumber,
      transactionDate: new Date("2026-03-08"),
      description: `Pencairan bailout ${disbursedBailout.bailoutNumber}`,
      sourceType: JournalSourceType.BAILOUT,
      sourceId: disbursedBailout.id,
      bailoutId: disbursedBailout.id,
      referenceNumber: disbursedBailout.disbursementRef,
      status: JournalStatus.POSTED,
      createdById: financeUserId,
      postedById: financeUserId,
      postedAt: new Date("2026-03-08"),
      lines: {
        create: [
          {
            lineNumber: 1,
            chartOfAccountId: advanceCoa.id,
            description: "Uang muka perjalanan Bandung",
            debitAmount: 2500000,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            chartOfAccountId: bankCoa.id,
            balanceAccountId: bankOps.id,
            description: "Pencairan dari rekening operasional",
            debitAmount: 0,
            creditAmount: 2500000,
          },
        ],
      },
    },
  });

  const claimPaymentJeNumber = "JE-2026-00004";
  await prisma.journalEntry.upsert({
    where: { tenantId_journalNumber: { tenantId, journalNumber: claimPaymentJeNumber } },
    update: {},
    create: {
      tenantId,
      journalNumber: claimPaymentJeNumber,
      transactionDate: new Date("2026-03-14"),
      description: `Pembayaran klaim ${paidClaim.claimNumber}`,
      sourceType: JournalSourceType.CLAIM,
      sourceId: paidClaim.id,
      claimId: paidClaim.id,
      referenceNumber: paidClaim.paymentReference,
      status: JournalStatus.POSTED,
      createdById: financeUserId,
      postedById: financeUserId,
      postedAt: new Date("2026-03-14"),
      lines: {
        create: [
          {
            lineNumber: 1,
            chartOfAccountId: airfareCoa.id,
            description: "Beban tiket pesawat implementasi",
            debitAmount: 850000,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            chartOfAccountId: bankCoa.id,
            balanceAccountId: bankOps.id,
            description: "Pembayaran dari rekening operasional",
            debitAmount: 0,
            creditAmount: 850000,
          },
        ],
      },
    },
  });

  const settlementJeNumber = "JE-2026-00005";
  await prisma.journalEntry.upsert({
    where: { tenantId_journalNumber: { tenantId, journalNumber: settlementJeNumber } },
    update: {},
    create: {
      tenantId,
      journalNumber: settlementJeNumber,
      transactionDate: new Date("2026-03-15"),
      description: `Settlement bailout ${disbursedBailout.bailoutNumber}`,
      sourceType: JournalSourceType.SETTLEMENT,
      sourceId: disbursedBailout.id,
      bailoutId: disbursedBailout.id,
      referenceNumber: "STL-BLT-20260315",
      status: JournalStatus.POSTED,
      createdById: financeUserId,
      postedById: financeUserId,
      postedAt: new Date("2026-03-15"),
      lines: {
        create: [
          {
            lineNumber: 1,
            chartOfAccountId: accommodationCoa.id,
            description: "Pengakuan beban hotel dari uang muka",
            debitAmount: 2500000,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            chartOfAccountId: advanceCoa.id,
            description: "Penutupan uang muka perjalanan",
            debitAmount: 0,
            creditAmount: 2500000,
          },
        ],
      },
    },
  });

  const legacySamples = [
    {
      date: new Date("2026-03-08"),
      description: `Beban bailout: ${disbursedBailout.bailoutNumber}`,
      amount: 2500000,
      entryType: "DEBIT" as const,
      bailoutId: disbursedBailout.id,
      chartOfAccountId: advanceCoa.id,
      balanceAccountId: bankOps.id,
      referenceNumber: disbursedBailout.disbursementRef ?? undefined,
    },
    {
      date: new Date("2026-03-14"),
      description: `Beban klaim: ${paidClaim.claimNumber}`,
      amount: 850000,
      entryType: "DEBIT" as const,
      claimId: paidClaim.id,
      chartOfAccountId: airfareCoa.id,
      balanceAccountId: bankOps.id,
      referenceNumber: paidClaim.paymentReference ?? undefined,
    },
  ];

  for (const sample of legacySamples) {
    const transactionNumber = sample.referenceNumber?.startsWith("BANK-TFR-20260308") ? "JRN-2026-00001" : "JRN-2026-00002";
    await prisma.journalTransaction.upsert({
      where: { tenantId_transactionNumber: { tenantId, transactionNumber } },
      update: {},
      create: {
        tenantId,
        transactionNumber,
        transactionDate: sample.date,
        description: sample.description,
        amount: sample.amount,
        entryType: sample.entryType,
        bailoutId: sample.bailoutId,
        claimId: sample.claimId,
        chartOfAccountId: sample.chartOfAccountId,
        balanceAccountId: sample.balanceAccountId,
        referenceNumber: sample.referenceNumber,
      },
    });
  }
}

async function createChartOfAccounts(createdById: string, tenantId: string) {
  await prisma.$transaction(async (tx) => {
    await bootstrapTenantAccounting(tx, {
      tenantId,
      userId: createdById,
    });
  });

  console.log(`    1000 Kas dan Setara Kas`);
  console.log(`    3000 Ekuitas`);
  console.log(`    6000 Operating Expenses`);
  console.log(`    6100 Travel & Transportation`);
  console.log(`    6200 Meals & Entertainment`);
  console.log(`    6300 Communication Expenses`);
  console.log(`    6400 Employee Support Expenses`);
  console.log(`    6500 Office & Equipment`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
