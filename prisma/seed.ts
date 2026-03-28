import {
  PrismaClient,
  BailoutCategory,
  BailoutStatus,
  BusinessFlowType,
  ClaimStatus,
  ClaimType,
  GoodsReceiptStatus,
  InventoryBucketType,
  InventoryItemType,
  InventoryTrackingMode,
  InventoryUnitCondition,
  InventoryUnitStatus,
  InventoryUsageType,
  JournalSourceType,
  JournalStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  SalesInvoiceStatus,
  SalesOrderStatus,
  SalesQuotationStatus,
  TravelStatus,
  TravelType,
  VendorInvoiceMatchType,
  VendorInvoiceStatus,
  DeliveryOrderStatus,
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

  console.log("🧾 Creating purchase & sales relational sample data…");
  await createPurchaseSalesSeedData({
    salesStaff1Id: salesStaff1.id,
    salesStaff1Name: salesStaff1.name ?? "Sales Staff 1",
    salesStaff2Id: salesStaff2.id,
    salesStaff2Name: salesStaff2.name ?? "Sales Staff 2",
    adminUserId: adminChief.id,
    adminUserName: adminChief.name ?? "Admin Chief",
    financeDeptId: deptFinance.id,
  });
  console.log("  ✅ Purchase & sales sample data ready\n");

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

async function createPurchaseSalesSeedData(input: {
  salesStaff1Id: string;
  salesStaff1Name: string;
  salesStaff2Id: string;
  salesStaff2Name: string;
  adminUserId: string;
  adminUserName: string;
  financeDeptId: string;
}) {
  const {
    salesStaff1Id,
    salesStaff1Name,
    salesStaff2Id,
    salesStaff2Name,
    adminUserId,
    adminUserName,
    financeDeptId,
  } = input;

  const vendorOne = await prisma.crmCustomer.upsert({
    where: { id: "seed-vendor-1" },
    update: {
      company: "PT Infra Solusi Teknologi",
      isVendor: true,
      isCustomer: false,
      ownerName: adminUserName,
      status: "ACTIVE",
      email: "procurement@infrasolusi.co.id",
      phone: "+62217119991",
      city: "Jakarta",
    },
    create: {
      id: "seed-vendor-1",
      company: "PT Infra Solusi Teknologi",
      isVendor: true,
      isCustomer: false,
      ownerName: adminUserName,
      status: "ACTIVE",
      email: "procurement@infrasolusi.co.id",
      phone: "+62217119991",
      city: "Jakarta",
    },
  });

  const vendorTwo = await prisma.crmCustomer.upsert({
    where: { id: "seed-vendor-2" },
    update: {
      company: "PT Jaringan Data Nusantara",
      isVendor: true,
      isCustomer: false,
      ownerName: adminUserName,
      status: "ACTIVE",
      email: "sales@jaringandata.co.id",
      phone: "+62227119992",
      city: "Bandung",
    },
    create: {
      id: "seed-vendor-2",
      company: "PT Jaringan Data Nusantara",
      isVendor: true,
      isCustomer: false,
      ownerName: adminUserName,
      status: "ACTIVE",
      email: "sales@jaringandata.co.id",
      phone: "+62227119992",
      city: "Bandung",
    },
  });

  const customerOne = await prisma.crmCustomer.findUniqueOrThrow({ where: { id: "seed-crm-customer-1" } });
  const customerTwo = await prisma.crmCustomer.findUniqueOrThrow({ where: { id: "seed-crm-customer-3" } });

  const warehouseMain = await prisma.warehouse.upsert({
    where: { code: "WH-UTAMA" },
    update: { name: "Gudang Perangkat IT", description: "Stok perangkat jaringan, server, dan hardware resale.", isActive: true },
    create: { code: "WH-UTAMA", name: "Gudang Perangkat IT", description: "Stok perangkat jaringan, server, dan hardware resale.", isActive: true },
  });
  const warehouseWest = await prisma.warehouse.upsert({
    where: { code: "WH-BARAT" },
    update: { name: "Gudang Staging Proyek", description: "Area staging perangkat dan persiapan implementasi proyek client.", isActive: true },
    create: { code: "WH-BARAT", name: "Gudang Staging Proyek", description: "Area staging perangkat dan persiapan implementasi proyek client.", isActive: true },
  });

  const itemOne = await prisma.inventoryItem.upsert({
    where: { sku: "SKU-SWITCH-001" },
    update: {
      name: "Managed Switch 24 Port Gigabit",
      description: "Switch managed untuk implementasi jaringan kantor dan cabang.",
      unitOfMeasure: "Unit",
      category: "Networking",
      brand: "Cisco",
      model: "CBS250-24T-4G",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 3750000,
      reorderPoint: 2,
      isActive: true,
    },
    create: {
      sku: "SKU-SWITCH-001",
      name: "Managed Switch 24 Port Gigabit",
      description: "Switch managed untuk implementasi jaringan kantor dan cabang.",
      unitOfMeasure: "Unit",
      category: "Networking",
      brand: "Cisco",
      model: "CBS250-24T-4G",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 3750000,
      reorderPoint: 2,
      isActive: true,
    },
  });
  const itemTwo = await prisma.inventoryItem.upsert({
    where: { sku: "SKU-AP-001" },
    update: {
      name: "Access Point WiFi 6 Indoor",
      description: "Access point untuk deploy jaringan wireless kantor dan retail outlet.",
      unitOfMeasure: "Unit",
      category: "Networking",
      brand: "Ubiquiti",
      model: "U6+",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 1850000,
      reorderPoint: 4,
      isActive: true,
    },
    create: {
      sku: "SKU-AP-001",
      name: "Access Point WiFi 6 Indoor",
      description: "Access point untuk deploy jaringan wireless kantor dan retail outlet.",
      unitOfMeasure: "Unit",
      category: "Networking",
      brand: "Ubiquiti",
      model: "U6+",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 1850000,
      reorderPoint: 4,
      isActive: true,
    },
  });
  const itemThree = await prisma.inventoryItem.upsert({
    where: { sku: "SKU-SVC-IMPLEMENT-001" },
    update: {
      name: "Jasa Implementasi & Konfigurasi Jaringan",
      description: "Jasa implementasi onsite untuk instalasi perangkat, konfigurasi VLAN, SSID, dan testing.",
      unitOfMeasure: "Paket",
      category: "Professional Service",
      brand: "Internal Service",
      model: "Implementation Package",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.SALE,
      itemType: InventoryItemType.SERVICE,
      isStockTracked: false,
      isActive: true,
    },
    create: {
      sku: "SKU-SVC-IMPLEMENT-001",
      name: "Jasa Implementasi & Konfigurasi Jaringan",
      description: "Jasa implementasi onsite untuk instalasi perangkat, konfigurasi VLAN, SSID, dan testing.",
      unitOfMeasure: "Paket",
      category: "Professional Service",
      brand: "Internal Service",
      model: "Implementation Package",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.SALE,
      itemType: InventoryItemType.SERVICE,
      isStockTracked: false,
      isActive: true,
    },
  });
  const itemFour = await prisma.inventoryItem.upsert({
    where: { sku: "SKU-FW-001" },
    update: {
      name: "Next Gen Firewall Appliance",
      description: "Firewall appliance untuk security gateway kantor dan cabang.",
      unitOfMeasure: "Unit",
      category: "Security",
      brand: "Fortinet",
      model: "FortiGate 40F",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 6750000,
      reorderPoint: 1,
      isActive: true,
    },
    create: {
      sku: "SKU-FW-001",
      name: "Next Gen Firewall Appliance",
      description: "Firewall appliance untuk security gateway kantor dan cabang.",
      unitOfMeasure: "Unit",
      category: "Security",
      brand: "Fortinet",
      model: "FortiGate 40F",
      trackingMode: InventoryTrackingMode.QUANTITY,
      usageType: InventoryUsageType.BOTH,
      itemType: InventoryItemType.HARDWARE,
      standardCost: 6750000,
      reorderPoint: 1,
      isActive: true,
    },
  });

  const pr1Payload = {
    vendorId: vendorOne.id,
    requesterId: adminUserId,
    requesterName: adminUserName,
    departmentId: financeDeptId,
    departmentName: "Finance",
    neededDate: new Date("2026-04-08"),
    status: PurchaseRequestStatus.CONVERTED,
    procurementMode: BusinessFlowType.GOODS,
    priority: "HIGH",
    budgetType: "PROJECT_PROCUREMENT",
    subtotalAmount: 26100000,
    totalAmount: 26100000,
    convertedAt: new Date("2026-03-27"),
    notes: "Pengadaan perangkat jaringan untuk proyek implementasi client retail.",
  };

  const pr1 = await prisma.purchaseRequest.upsert({
    where: { requestNumber: "PR-2026-00001" },
    update: pr1Payload,
    create: {
      requestNumber: "PR-2026-00001",
      ...pr1Payload,
    },
  });

  const pr1Line1Payload = {
    purchaseRequestId: pr1.id,
    inventoryItemId: itemOne.id,
    warehouseId: warehouseMain.id,
    lineNumber: 1,
    description: "Managed switch untuk rollout jaringan core outlet.",
    qtyRequested: 4,
    qtyOrdered: 4,
    unitPriceEstimate: 3750000,
    lineTotalEstimate: 15000000,
  };
  const pr1Line1 = await prisma.purchaseRequestLine.upsert({
    where: { id: "seed-pr-line-1" },
    update: pr1Line1Payload,
    create: { id: "seed-pr-line-1", ...pr1Line1Payload },
  });

  const pr1Line2Payload = {
    purchaseRequestId: pr1.id,
    inventoryItemId: itemTwo.id,
    warehouseId: warehouseMain.id,
    lineNumber: 2,
    description: "Access point untuk kebutuhan wireless area outlet dan backoffice.",
    qtyRequested: 6,
    qtyOrdered: 6,
    unitPriceEstimate: 1850000,
    lineTotalEstimate: 11100000,
  };
  const pr1Line2 = await prisma.purchaseRequestLine.upsert({
    where: { id: "seed-pr-line-2" },
    update: pr1Line2Payload,
    create: { id: "seed-pr-line-2", ...pr1Line2Payload },
  });

  const po1Payload = {
    purchaseRequestId: pr1.id,
    vendorId: vendorOne.id,
    buyerId: adminUserId,
    buyerName: adminUserName,
    orderDate: new Date("2026-03-27"),
    expectedDate: new Date("2026-04-08"),
    status: PurchaseOrderStatus.ISSUED,
    procurementMode: BusinessFlowType.GOODS,
    requiresReceipt: true,
    subtotalAmount: 26100000,
    totalAmount: 26100000,
    notes: "PO perangkat jaringan untuk proyek client retail.",
    issuedAt: new Date("2026-03-27"),
  };
  const po1 = await prisma.purchaseOrder.upsert({
    where: { orderNumber: "PO-2026-00001" },
    update: po1Payload,
    create: {
      orderNumber: "PO-2026-00001",
      ...po1Payload,
    },
  });

  const po1Line1Payload = {
    purchaseOrderId: po1.id,
    purchaseRequestLineId: pr1Line1.id,
    inventoryItemId: itemOne.id,
    warehouseId: warehouseMain.id,
    lineNumber: 1,
    description: "Managed switch untuk rollout jaringan core outlet.",
    qtyOrdered: 4,
    qtyReceived: 4,
    qtyInvoiced: 4,
    unitPrice: 3750000,
    lineTotal: 15000000,
  };
  const po1Line1 = await prisma.purchaseOrderLine.upsert({
    where: { id: "seed-po-line-1" },
    update: po1Line1Payload,
    create: { id: "seed-po-line-1", ...po1Line1Payload },
  });

  const po1Line2Payload = {
    purchaseOrderId: po1.id,
    purchaseRequestLineId: pr1Line2.id,
    inventoryItemId: itemTwo.id,
    warehouseId: warehouseMain.id,
    lineNumber: 2,
    description: "Access point untuk kebutuhan wireless area outlet dan backoffice.",
    qtyOrdered: 6,
    qtyReceived: 6,
    qtyInvoiced: 6,
    unitPrice: 1850000,
    lineTotal: 11100000,
  };
  const po1Line2 = await prisma.purchaseOrderLine.upsert({
    where: { id: "seed-po-line-2" },
    update: po1Line2Payload,
    create: { id: "seed-po-line-2", ...po1Line2Payload },
  });

  const gr1Payload = {
    purchaseOrderId: po1.id,
    vendorId: vendorOne.id,
    warehouseId: warehouseMain.id,
    receiptDate: new Date("2026-03-28"),
    status: GoodsReceiptStatus.RECEIVED,
    notes: "Penerimaan perangkat jaringan untuk staging proyek.",
    receivedAt: new Date("2026-03-28"),
  };
  const gr1 = await prisma.goodsReceipt.upsert({
    where: { receiptNumber: "GR-2026-00001" },
    update: gr1Payload,
    create: { receiptNumber: "GR-2026-00001", ...gr1Payload },
  });

  const gr1Line1Payload = {
    goodsReceiptId: gr1.id,
    purchaseOrderLineId: po1Line1.id,
    inventoryItemId: itemOne.id,
    warehouseId: warehouseMain.id,
    lineNumber: 1,
    qtyOrdered: 4,
    qtyReceived: 4,
    qtyAccepted: 4,
    qtyRejected: 0,
    unitCost: 3750000,
    notes: "Switch diterima lengkap dan siap staging.",
  };
  const gr1Line1 = await prisma.goodsReceiptLine.upsert({
    where: { id: "seed-gr-line-1" },
    update: gr1Line1Payload,
    create: { id: "seed-gr-line-1", ...gr1Line1Payload },
  });

  const gr1Line2Payload = {
    goodsReceiptId: gr1.id,
    purchaseOrderLineId: po1Line2.id,
    inventoryItemId: itemTwo.id,
    warehouseId: warehouseMain.id,
    lineNumber: 2,
    qtyOrdered: 6,
    qtyReceived: 6,
    qtyAccepted: 6,
    qtyRejected: 0,
    unitCost: 1850000,
    notes: "Access point diterima lengkap dan lolos pengecekan fisik.",
  };
  const gr1Line2 = await prisma.goodsReceiptLine.upsert({
    where: { id: "seed-gr-line-2" },
    update: gr1Line2Payload,
    create: { id: "seed-gr-line-2", ...gr1Line2Payload },
  });

  const vi1Payload = {
    vendorId: vendorOne.id,
    purchaseOrderId: po1.id,
    goodsReceiptId: gr1.id,
    invoiceDate: new Date("2026-03-29"),
    dueDate: new Date("2026-04-12"),
    status: VendorInvoiceStatus.READY_TO_PAY,
    matchType: VendorInvoiceMatchType.THREE_WAY,
    subtotalAmount: 26100000,
    totalAmount: 26100000,
    notes: "Invoice vendor untuk perangkat jaringan proyek retail.",
    readyToPayAt: new Date("2026-03-29"),
  };
  const vi1 = await prisma.vendorInvoice.upsert({
    where: { invoiceNumber: "VINV-2026-00001" },
    update: vi1Payload,
    create: { invoiceNumber: "VINV-2026-00001", ...vi1Payload },
  });

  await prisma.vendorInvoiceLine.upsert({
    where: { id: "seed-vi-line-1" },
    update: { vendorInvoiceId: vi1.id, purchaseOrderLineId: po1Line1.id, goodsReceiptLineId: gr1Line1.id, inventoryItemId: itemOne.id, lineNumber: 1, description: "Managed switch rollout jaringan.", qtyBilled: 4, unitPrice: 3750000, lineTotal: 15000000 },
    create: { id: "seed-vi-line-1", vendorInvoiceId: vi1.id, purchaseOrderLineId: po1Line1.id, goodsReceiptLineId: gr1Line1.id, inventoryItemId: itemOne.id, lineNumber: 1, description: "Managed switch rollout jaringan.", qtyBilled: 4, unitPrice: 3750000, lineTotal: 15000000 },
  });
  await prisma.vendorInvoiceLine.upsert({
    where: { id: "seed-vi-line-2" },
    update: { vendorInvoiceId: vi1.id, purchaseOrderLineId: po1Line2.id, goodsReceiptLineId: gr1Line2.id, inventoryItemId: itemTwo.id, lineNumber: 2, description: "Access point wireless rollout.", qtyBilled: 6, unitPrice: 1850000, lineTotal: 11100000 },
    create: { id: "seed-vi-line-2", vendorInvoiceId: vi1.id, purchaseOrderLineId: po1Line2.id, goodsReceiptLineId: gr1Line2.id, inventoryItemId: itemTwo.id, lineNumber: 2, description: "Access point wireless rollout.", qtyBilled: 6, unitPrice: 1850000, lineTotal: 11100000 },
  });

  const sq1Payload = {
    customerId: customerOne.id,
    salesOwnerId: salesStaff1Id,
    salesOwnerName: salesStaff1Name,
    issueDate: new Date("2026-03-27"),
    validUntil: new Date("2026-04-10"),
    status: SalesQuotationStatus.APPROVED,
    fulfillmentMode: BusinessFlowType.GOODS,
    subtotalAmount: 43100000,
    totalAmount: 43100000,
    notes: "Penawaran perangkat jaringan untuk rollout cabang retail.",
    approvedAt: new Date("2026-03-28"),
  };
  const sq1 = await prisma.salesQuotation.upsert({
    where: { quotationNumber: "QT-2026-00001" },
    update: sq1Payload,
    create: { quotationNumber: "QT-2026-00001", ...sq1Payload },
  });

  const sq1Line1Payload = {
    salesQuotationId: sq1.id,
    inventoryItemId: itemOne.id,
    warehouseId: warehouseWest.id,
    lineNumber: 1,
    description: "Managed switch untuk rollout jaringan outlet.",
    qtyQuoted: 4,
    unitPrice: 6500000,
    lineTotal: 26000000,
  };
  const sq1Line1 = await prisma.salesQuotationLine.upsert({
    where: { id: "seed-sq-line-1" },
    update: sq1Line1Payload,
    create: { id: "seed-sq-line-1", ...sq1Line1Payload },
  });

  const sq1Line2Payload = {
    salesQuotationId: sq1.id,
    inventoryItemId: itemTwo.id,
    warehouseId: warehouseWest.id,
    lineNumber: 2,
    description: "Access point WiFi 6 untuk area outlet dan backoffice.",
    qtyQuoted: 6,
    unitPrice: 2850000,
    lineTotal: 17100000,
  };
  const sq1Line2 = await prisma.salesQuotationLine.upsert({
    where: { id: "seed-sq-line-3" },
    update: sq1Line2Payload,
    create: { id: "seed-sq-line-3", ...sq1Line2Payload },
  });

  const so1Payload = {
    quotationId: sq1.id,
    customerId: customerOne.id,
    salesOwnerId: salesStaff1Id,
    salesOwnerName: salesStaff1Name,
    orderDate: new Date("2026-03-28"),
    plannedShipDate: new Date("2026-03-30"),
    status: SalesOrderStatus.DELIVERED,
    fulfillmentMode: BusinessFlowType.GOODS,
    requiresDelivery: true,
    subtotalAmount: 43100000,
    totalAmount: 43100000,
    notes: "SO rollout jaringan cabang retail.",
    deliveredAt: new Date("2026-03-30"),
  };
  const so1 = await prisma.salesOrder.upsert({
    where: { salesOrderNumber: "SO-2026-00001" },
    update: so1Payload,
    create: { salesOrderNumber: "SO-2026-00001", ...so1Payload },
  });

  const so1Line1Payload = {
    salesOrderId: so1.id,
    salesQuotationLineId: sq1Line1.id,
    inventoryItemId: itemOne.id,
    warehouseId: warehouseWest.id,
    lineNumber: 1,
    description: "Managed switch untuk rollout jaringan outlet.",
    qtyOrdered: 4,
    qtyDelivered: 4,
    qtyInvoiced: 4,
    unitPrice: 6500000,
    lineTotal: 26000000,
  };
  const so1Line1 = await prisma.salesOrderLine.upsert({
    where: { id: "seed-so-line-1" },
    update: so1Line1Payload,
    create: { id: "seed-so-line-1", ...so1Line1Payload },
  });

  const so1Line2Payload = {
    salesOrderId: so1.id,
    salesQuotationLineId: sq1Line2.id,
    inventoryItemId: itemTwo.id,
    warehouseId: warehouseWest.id,
    lineNumber: 2,
    description: "Access point WiFi 6 untuk area outlet dan backoffice.",
    qtyOrdered: 6,
    qtyDelivered: 6,
    qtyInvoiced: 6,
    unitPrice: 2850000,
    lineTotal: 17100000,
  };
  const so1Line2 = await prisma.salesOrderLine.upsert({
    where: { id: "seed-so-line-2" },
    update: so1Line2Payload,
    create: { id: "seed-so-line-2", ...so1Line2Payload },
  });

  const do1Payload = {
    salesOrderId: so1.id,
    customerId: customerOne.id,
    warehouseId: warehouseWest.id,
    shipDate: new Date("2026-03-29"),
    deliveredAt: new Date("2026-03-30"),
    status: DeliveryOrderStatus.DELIVERED,
    carrierName: "Project Deployment Team",
    destinationAddress: "Jakarta",
  };
  const do1 = await prisma.deliveryOrder.upsert({
    where: { deliveryOrderNumber: "DO-2026-00001" },
    update: do1Payload,
    create: { deliveryOrderNumber: "DO-2026-00001", ...do1Payload },
  });

  const do1Line1 = await prisma.deliveryOrderLine.upsert({
    where: { id: "seed-do-line-1" },
    update: { deliveryOrderId: do1.id, salesOrderLineId: so1Line1.id, inventoryItemId: itemOne.id, warehouseId: warehouseWest.id, lineNumber: 1, qtyOrdered: 4, qtyShipped: 4, qtyDelivered: 4 },
    create: { id: "seed-do-line-1", deliveryOrderId: do1.id, salesOrderLineId: so1Line1.id, inventoryItemId: itemOne.id, warehouseId: warehouseWest.id, lineNumber: 1, qtyOrdered: 4, qtyShipped: 4, qtyDelivered: 4 },
  });
  const do1Line2 = await prisma.deliveryOrderLine.upsert({
    where: { id: "seed-do-line-2" },
    update: { deliveryOrderId: do1.id, salesOrderLineId: so1Line2.id, inventoryItemId: itemTwo.id, warehouseId: warehouseWest.id, lineNumber: 2, qtyOrdered: 6, qtyShipped: 6, qtyDelivered: 6 },
    create: { id: "seed-do-line-2", deliveryOrderId: do1.id, salesOrderLineId: so1Line2.id, inventoryItemId: itemTwo.id, warehouseId: warehouseWest.id, lineNumber: 2, qtyOrdered: 6, qtyShipped: 6, qtyDelivered: 6 },
  });

  const si1Payload = {
    customerId: customerOne.id,
    salesOrderId: so1.id,
    deliveryOrderId: do1.id,
    issueDate: new Date("2026-03-31"),
    dueDate: new Date("2026-04-14"),
    status: SalesInvoiceStatus.SENT,
    subtotalAmount: 43100000,
    totalAmount: 43100000,
    notes: "Invoice perangkat jaringan dan deployment outlet retail.",
  };
  const si1 = await prisma.salesInvoice.upsert({
    where: { salesInvoiceNumber: "SINV-2026-00001" },
    update: si1Payload,
    create: { salesInvoiceNumber: "SINV-2026-00001", ...si1Payload },
  });

  await prisma.salesInvoiceLine.upsert({
    where: { id: "seed-si-line-1" },
    update: { salesInvoiceId: si1.id, salesOrderLineId: so1Line1.id, deliveryOrderLineId: do1Line1.id, inventoryItemId: itemOne.id, lineNumber: 1, qtyInvoiced: 4, unitPrice: 6500000, lineTotal: 26000000 },
    create: { id: "seed-si-line-1", salesInvoiceId: si1.id, salesOrderLineId: so1Line1.id, deliveryOrderLineId: do1Line1.id, inventoryItemId: itemOne.id, lineNumber: 1, qtyInvoiced: 4, unitPrice: 6500000, lineTotal: 26000000 },
  });
  await prisma.salesInvoiceLine.upsert({
    where: { id: "seed-si-line-2" },
    update: { salesInvoiceId: si1.id, salesOrderLineId: so1Line2.id, deliveryOrderLineId: do1Line2.id, inventoryItemId: itemTwo.id, lineNumber: 2, qtyInvoiced: 6, unitPrice: 2850000, lineTotal: 17100000 },
    create: { id: "seed-si-line-2", salesInvoiceId: si1.id, salesOrderLineId: so1Line2.id, deliveryOrderLineId: do1Line2.id, inventoryItemId: itemTwo.id, lineNumber: 2, qtyInvoiced: 6, unitPrice: 2850000, lineTotal: 17100000 },
  });

  const sq2Payload = {
    customerId: customerTwo.id,
    salesOwnerId: salesStaff2Id,
    salesOwnerName: salesStaff2Name,
    issueDate: new Date("2026-03-27"),
    validUntil: new Date("2026-04-15"),
    status: SalesQuotationStatus.NEGOTIATION,
    fulfillmentMode: BusinessFlowType.SERVICE,
    subtotalAmount: 18500000,
    totalAmount: 18500000,
    notes: "Penawaran jasa implementasi dan hardening jaringan untuk rumah sakit.",
  };
  const sq2 = await prisma.salesQuotation.upsert({
    where: { quotationNumber: "QT-2026-00002" },
    update: sq2Payload,
    create: { quotationNumber: "QT-2026-00002", ...sq2Payload },
  });

  await prisma.salesQuotationLine.upsert({
    where: { id: "seed-sq-line-2" },
    update: { salesQuotationId: sq2.id, inventoryItemId: itemThree.id, warehouseId: warehouseWest.id, lineNumber: 1, description: "Paket implementasi, konfigurasi, testing, dan handover dokumentasi.", qtyQuoted: 1, unitPrice: 18500000, lineTotal: 18500000 },
    create: { id: "seed-sq-line-2", salesQuotationId: sq2.id, inventoryItemId: itemThree.id, warehouseId: warehouseWest.id, lineNumber: 1, description: "Paket implementasi, konfigurasi, testing, dan handover dokumentasi.", qtyQuoted: 1, unitPrice: 18500000, lineTotal: 18500000 },
  });

  await prisma.salesOrder.updateMany({
    where: { quotationId: sq2.id },
    data: {
      fulfillmentMode: BusinessFlowType.SERVICE,
      requiresDelivery: false,
      plannedShipDate: null,
    },
  });

  const pr2Payload = {
    vendorId: vendorTwo.id,
    requesterId: adminUserId,
    requesterName: adminUserName,
    departmentId: financeDeptId,
    departmentName: "Finance",
    neededDate: new Date("2026-04-12"),
    status: PurchaseRequestStatus.APPROVED,
    procurementMode: BusinessFlowType.GOODS,
    priority: "MEDIUM",
    budgetType: "BUFFER_STOCK",
    subtotalAmount: 13500000,
    totalAmount: 13500000,
    approvedAt: new Date("2026-03-28"),
    notes: "Pengadaan buffer stock firewall appliance untuk kebutuhan proyek dan support client.",
  };
  const pr2 = await prisma.purchaseRequest.upsert({
    where: { requestNumber: "PR-2026-00002" },
    update: pr2Payload,
    create: {
      requestNumber: "PR-2026-00002",
      ...pr2Payload,
    },
  });

  await prisma.purchaseRequestLine.upsert({
    where: { id: "seed-pr-line-3" },
    update: { purchaseRequestId: pr2.id, inventoryItemId: itemFour.id, warehouseId: warehouseMain.id, lineNumber: 1, description: "Firewall cadangan untuk kebutuhan implementasi cepat dan support client.", qtyRequested: 2, qtyOrdered: 0, unitPriceEstimate: 6750000, lineTotalEstimate: 13500000 },
    create: { id: "seed-pr-line-3", purchaseRequestId: pr2.id, inventoryItemId: itemFour.id, warehouseId: warehouseMain.id, lineNumber: 1, description: "Firewall cadangan untuk kebutuhan implementasi cepat dan support client.", qtyRequested: 2, qtyOrdered: 0, unitPriceEstimate: 6750000, lineTotalEstimate: 13500000 },
  });
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





