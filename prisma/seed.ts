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
import { createCrmSampleData } from "./crm-seed";
import { bootstrapAccountingCatalog } from "../src/lib/accounting/bootstrap";
import {
  ensureRolePermissionCatalog,
} from "../src/server/auth/permission-store";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PASSWORD = "password123";

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log("🌱 Starting database seeding (master data only)…\n");

  const pw = await hash(PASSWORD);
  await ensureRolePermissionCatalog(prisma);

  // ── 1. Departments (no chiefId yet — set after users are created) ───────────
  console.log("📂 Creating departments…");
  const deptSales = await prisma.department.upsert({
    where: { code: "SALES" },
    update: {
      name: "Sales",
      description: "Sales operations and customer relations",
    },
    create: {
      code: "SALES",
      name: "Sales",
      description: "Sales operations and customer relations",
    },
  });
  const deptEng = await prisma.department.upsert({
    where: { code: "ENG" },
    update: {
      name: "Engineering",
      description: "Software engineering and technical operations",
    },
    create: {
      code: "ENG",
      name: "Engineering",
      description: "Software engineering and technical operations",
    },
  });
  const deptFinance = await prisma.department.upsert({
    where: { code: "FIN" },
    update: {
      name: "Finance",
      description: "Finance and accounting",
    },
    create: {
      code: "FIN",
      name: "Finance",
      description: "Finance and accounting",
    },
  });
  const deptAdmin = await prisma.department.upsert({
    where: { code: "ADMIN" },
    update: {
      name: "Administration",
      description: "Administrative and support operations",
    },
    create: {
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
  await createChartOfAccounts(adminChief.id);
  console.log("  ✅ Chart of Accounts ready\n");

  // ── 6. Balance accounts, projects, travel, claims, bailouts, journals ───────
  console.log("📚 Creating accounting and transaction sample data…");
  await createSampleBusinessData({
    adminUserId: adminChief.id,
    financeUserId: financeStaff1.id,
    salesRequesterId: salesStaff1.id,
    engineerRequesterId: engStaff1.id,
  });
  console.log("  ✅ Sample accounting and transaction data ready\n");

  await createCrmSampleData({
    db: prisma,
    salesChief: { id: salesChief.id, name: salesChief.name },
    salesStaff1: { id: salesStaff1.id, name: salesStaff1.name },
    salesStaff2: { id: salesStaff2.id, name: salesStaff2.name },
    director: { id: director.id, name: director.name },
    adminChief: { id: adminChief.id, name: adminChief.name },
  });

  // ── 7. Summary ────────────────────────────────────────────────────────────────
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

async function findCoaByCode(code: string) {
  const coa = await prisma.chartOfAccount.findFirst({
    where: { code, isActive: true },
  });

  if (!coa) {
    throw new Error(`COA ${code} tidak ditemukan saat seeding`);
  }

  return coa;
}

async function createSampleBusinessData(input: {
  adminUserId: string;
  financeUserId: string;
  salesRequesterId: string;
  engineerRequesterId: string;
}) {
  const { adminUserId, financeUserId, salesRequesterId, engineerRequesterId } = input;

  const [cashCoa, bankCoa, advanceCoa, equityCoa, airfareCoa, accommodationCoa] =
    await Promise.all([
      findCoaByCode("1110"),
      findCoaByCode("1120"),
      findCoaByCode("1131"),
      findCoaByCode("3100"),
      findCoaByCode("6110"),
      findCoaByCode("6130"),
    ]);

  const bankOps = await prisma.balanceAccount.upsert({
    where: { code: "BANK-OPS" },
    update: {
      name: "Rekening Operasional Utama",
      balance: 46650000,
      defaultChartOfAccountId: bankCoa.id,
      description: "Rekening bank operasional utama perusahaan",
      isActive: true,
    },
    create: {
      code: "BANK-OPS",
      name: "Rekening Operasional Utama",
      balance: 46650000,
      defaultChartOfAccountId: bankCoa.id,
      description: "Rekening bank operasional utama perusahaan",
      isActive: true,
    },
  });

  const pettyCash = await prisma.balanceAccount.upsert({
    where: { code: "KAS-KECIL" },
    update: {
      name: "Kas Kecil Kantor",
      balance: 5000000,
      defaultChartOfAccountId: cashCoa.id,
      description: "Kas kecil untuk kebutuhan operasional harian",
      isActive: true,
    },
    create: {
      code: "KAS-KECIL",
      name: "Kas Kecil Kantor",
      balance: 5000000,
      defaultChartOfAccountId: cashCoa.id,
      description: "Kas kecil untuk kebutuhan operasional harian",
      isActive: true,
    },
  });

  const project = await prisma.project.upsert({
    where: { code: "PRJ-SALES-001" },
    update: {
      name: "Ekspansi Klien Nasional",
      description: "Proyek penjualan untuk kunjungan klien nasional.",
      clientName: "PT Nusantara Digital",
      isActive: true,
    },
    create: {
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
    where: { requestNumber: approvedTravelNumber },
    update: {},
    create: {
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
    where: { requestNumber: lockedTravelNumber },
    update: {},
    create: {
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
      travelRequestId: lockedTravel.id,
      userId: engineerRequesterId,
      role: "Implementor",
    },
  });

  const approvedBailoutNumber = "BLT-2026-00001";
  const disbursedBailoutNumber = "BLT-2026-00002";

  await prisma.bailout.upsert({
    where: { bailoutNumber: approvedBailoutNumber },
    update: {},
    create: {
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
    where: { bailoutNumber: disbursedBailoutNumber },
    update: {},
    create: {
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
    where: { claimNumber: approvedClaimNumber },
    update: {},
    create: {
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
    where: { claimNumber: paidClaimNumber },
    update: {},
    create: {
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
    where: { journalNumber: openingNumber },
    update: {},
    create: {
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
    where: { journalNumber: pettyCashNumber },
    update: {},
    create: {
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
    where: { journalNumber: disbursementJeNumber },
    update: {},
    create: {
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
    where: { journalNumber: claimPaymentJeNumber },
    update: {},
    create: {
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
    where: { journalNumber: settlementJeNumber },
    update: {},
    create: {
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
      where: { transactionNumber },
      update: {},
      create: {
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

async function createChartOfAccounts(createdById: string) {
  await prisma.$transaction(async (tx) => {
    await bootstrapAccountingCatalog(tx, {
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





