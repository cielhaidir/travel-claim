import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PASSWORD = "password123";

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting database seeding (master data only)…\n");

  const pw = await hash(PASSWORD);

  // ── 1. Departments (no chiefId yet — set after users are created) ───────────
  console.log("📂 Creating departments…");
  const deptSales = await prisma.department.upsert({
    where: { code: "SALES" },
    update: { name: "Sales", description: "Sales operations and customer relations" },
    create: { code: "SALES", name: "Sales", description: "Sales operations and customer relations" },
  });
  const deptEng = await prisma.department.upsert({
    where: { code: "ENG" },
    update: { name: "Engineering", description: "Software engineering and technical operations" },
    create: { code: "ENG", name: "Engineering", description: "Software engineering and technical operations" },
  });
  const deptFinance = await prisma.department.upsert({
    where: { code: "FIN" },
    update: { name: "Finance", description: "Finance and accounting" },
    create: { code: "FIN", name: "Finance", description: "Finance and accounting" },
  });
  const deptAdmin = await prisma.department.upsert({
    where: { code: "ADMIN" },
    update: { name: "Administration", description: "Administrative and support operations" },
    create: { code: "ADMIN", name: "Administration", description: "Administrative and support operations" },
  });
  console.log("  ✅ 4 departments ready\n");

  // ── 2. Clear reserved employeeIds to avoid unique conflicts on re-seed ───────
  const reservedIds = [
    "EMP001", "EMP002", "EMP003",
    "EMP010", "EMP011", "EMP012",
    "EMP020", "EMP021", "EMP022",
    "EMP030", "EMP031",
    "EMP040", "EMP041",
  ];
  await prisma.user.updateMany({
    where: { employeeId: { in: reservedIds } },
    data: { employeeId: null },
  });

  // ── 3. Users ─────────────────────────────────────────────────────────────────
  console.log("👤 Creating users…");

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
  console.log(`  👔 Director        : director@company.com    (EMP002) → supervisor: executive`);

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
  console.log(`  🏦 Finance Chief   : finance.chief@company.com  (EMP003) → supervisor: director`);

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
  console.log(`  👤 Finance Staff 1 : finance.staff1@company.com (EMP010) → supervisor: finance.chief`);

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
  console.log(`  👤 Finance Staff 2 : finance.staff2@company.com (EMP011) → supervisor: finance.chief`);

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
  console.log(`  💼 Sales Chief     : sales.chief@company.com    (EMP020) → supervisor: director`);

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
  console.log(`  👤 Sales Staff 1   : sales.staff1@company.com   (EMP021) → supervisor: sales.chief`);

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
  console.log(`  👤 Sales Staff 2   : sales.staff2@company.com   (EMP022) → supervisor: sales.chief`);

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
  console.log(`  🛠  Eng Chief      : engineer.chief@company.com  (EMP030) → supervisor: director`);

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
  console.log(`  👤 Eng Staff 1     : engineer.staff1@company.com (EMP031) → supervisor: engineer.chief`);

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
  console.log(`  👤 Eng Staff 2     : engineer.staff2@company.com (EMP032) → supervisor: engineer.chief`);

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
  console.log(`  🔑 Admin Chief     : admin@company.com            (EMP040) → supervisor: director`);

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
  console.log(`  👤 Admin Staff 1   : admin.staff1@company.com     (EMP041) → supervisor: admin`);

  console.log("\n✅ All users created\n");

  // ── 4. Wire Department.chiefId ────────────────────────────────────────────────
  console.log("🔗 Wiring department chiefs…");
  await prisma.department.update({ where: { id: deptSales.id },   data: { chiefId: salesChief.id } });
  await prisma.department.update({ where: { id: deptEng.id },     data: { chiefId: engChief.id } });
  await prisma.department.update({ where: { id: deptFinance.id }, data: { chiefId: financeChief.id } });
  await prisma.department.update({ where: { id: deptAdmin.id },   data: { chiefId: adminChief.id } });
  console.log("  ✅ Sales    dept chief → sales.chief");
  console.log("  ✅ Eng      dept chief → engineer.chief");
  console.log("  ✅ Finance  dept chief → finance.chief");
  console.log("  ✅ Admin    dept chief → admin\n");

  // ── 5. Chart of Accounts (master data) ───────────────────────────────────────
  console.log("💰 Creating Chart of Accounts…");
  await createChartOfAccounts(adminChief.id);
  console.log("  ✅ Chart of Accounts ready\n");

  // ── 6. Summary ────────────────────────────────────────────────────────────────
  console.log("🎉 Seeding completed!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  All passwords : password123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("  Hierarchy:");
  console.log("  executive@company.com   (ADMIN / C-Level)");
  console.log("  └─ director@company.com  (DIRECTOR)");
  console.log("     ├─ finance.chief@company.com   (MANAGER)  ← Finance dept chief");
  console.log("     │  ├─ finance.staff1@company.com (FINANCE)");
  console.log("     │  └─ finance.staff2@company.com (FINANCE)");
  console.log("     ├─ sales.chief@company.com     (SALES_CHIEF) ← Sales dept chief");
  console.log("     │  ├─ sales.staff1@company.com   (SALES_EMPLOYEE)");
  console.log("     │  └─ sales.staff2@company.com   (SALES_EMPLOYEE)");
  console.log("     ├─ engineer.chief@company.com  (SUPERVISOR) ← Eng dept chief");
  console.log("     │  ├─ engineer.staff1@company.com (EMPLOYEE)");
  console.log("     │  └─ engineer.staff2@company.com (EMPLOYEE)");
  console.log("     └─ admin@company.com           (ADMIN)    ← Admin dept chief");
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
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // suppress unused-variable warnings
  void [financeStaff2, salesStaff1, salesStaff2, engStaff1, engStaff2, adminStaff1];
}

// ─── Chart of Accounts ───────────────────────────────────────────────────────

async function createChartOfAccounts(createdById: string) {
  const upsertCoa = (
    code: string,
    name: string,
    category: string,
    subcategory: string | null,
    parentId: string | null,
    description: string,
  ) =>
    prisma.chartOfAccount.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        accountType: "EXPENSE",
        category,
        subcategory: subcategory ?? undefined,
        parentId: parentId ?? undefined,
        isActive: true,
        description,
        createdById,
        updatedById: createdById,
      },
    });

  // Root
  const root = await upsertCoa("6000", "Operating Expenses", "Operating", null, null, "All operating expenses");
  console.log(`    6000 Operating Expenses`);

  // Travel
  const travel = await upsertCoa("6100", "Travel & Transportation", "Travel", null, root.id, "All travel and transportation related expenses");
  console.log(`    6100 Travel & Transportation`);
  await upsertCoa("6110", "Airfare",                "Travel", "Transportation", travel.id, "Air travel expenses");
  await upsertCoa("6120", "Ground Transportation",  "Travel", "Transportation", travel.id, "Taxi, car rental, fuel, parking expenses");
  await upsertCoa("6130", "Accommodation",          "Travel", "Lodging",         travel.id, "Hotel and lodging expenses");

  // Meals & Entertainment
  const meals = await upsertCoa("6200", "Meals & Entertainment", "Entertainment", null, root.id, "Business meals and entertainment expenses");
  console.log(`    6200 Meals & Entertainment`);
  await upsertCoa("6210", "Business Meals",       "Entertainment", "Meals",        meals.id, "Business-related meal expenses");
  await upsertCoa("6220", "Client Entertainment", "Entertainment", "Hospitality",  meals.id, "Entertainment expenses for clients and prospects");

  // Communication
  const comm = await upsertCoa("6300", "Communication Expenses", "Communication", null, root.id, "Phone, internet, and communication expenses");
  console.log(`    6300 Communication Expenses`);
  await upsertCoa("6310", "Phone & Mobile", "Communication", "Telecommunications", comm.id, "Phone and mobile billing expenses");

  // Office & Supplies
  const office = await upsertCoa("6400", "Office & Supplies", "Office", null, root.id, "Office supplies and equipment expenses");
  console.log(`    6400 Office & Supplies`);
  await upsertCoa("6410", "Stationery & Supplies", "Office", "Supplies", office.id, "Office stationery and supplies");

  // Employee Benefits
  const benefits = await upsertCoa("6500", "Employee Benefits", "Benefits", null, root.id, "Employee benefits and welfare expenses");
  console.log(`    6500 Employee Benefits`);
  await upsertCoa("6510", "BPJS & Health Insurance", "Benefits", "Insurance", benefits.id, "BPJS health insurance and medical benefits");
  await upsertCoa("6520", "Overtime Meals",           "Benefits", "Meals",     benefits.id, "Employee overtime meal allowances");

  // Vehicle
  const vehicle = await upsertCoa("6600", "Vehicle Expenses", "Vehicle", null, root.id, "Vehicle-related expenses");
  console.log(`    6600 Vehicle Expenses`);
  await upsertCoa("6610", "Vehicle Maintenance", "Vehicle", "Maintenance", vehicle.id, "Motorcycle and vehicle maintenance and service");

  // Misc
  await upsertCoa("6900", "Other Expenses", "Miscellaneous", null, root.id, "Other miscellaneous business expenses");
  console.log(`    6900 Other Expenses`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
