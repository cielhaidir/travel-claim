import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create departments first
  const departments = await createDepartments();
  console.log("✅ Departments created");

  // Create users with hierarchy
  const users = await createUsers(departments);
  console.log("✅ Users created");

  // Create Chart of Accounts
  await createChartOfAccounts(users.adminChief);
  console.log("✅ Chart of Accounts created");

  console.log("🎉 Seeding completed successfully!");
  console.log("");
  console.log("📋 Login credentials (all use: password123)");
  console.log("   👔 Director    : director@company.com");
  console.log("   🔑 Admin Chief : admin@company.com");
  console.log("   🛠  Eng Chief  : engineer.chief@company.com");
  console.log("   💼 Sales Chief : sales.chief@company.com");
  console.log("   👤 Eng Staff 1 : engineer.staff1@company.com");
  console.log("   👤 Eng Staff 2 : engineer.staff2@company.com");
  console.log("   👤 Sales Staff1: sales.staff1@company.com");
  console.log("   👤 Sales Staff2: sales.staff2@company.com");
  console.log("   👤 Admin Staff1: admin.staff1@company.com");
  console.log("   👤 Admin Staff2: admin.staff2@company.com");
}

async function createDepartments() {
  // Engineering Department
  const engineeringDept = await prisma.department.upsert({
    where: { code: "ENG" },
    update: { name: "Engineering", description: "Software engineering and technical operations" },
    create: {
      code: "ENG",
      name: "Engineering",
      description: "Software engineering and technical operations",
    },
  });

  // Sales Department
  const salesDept = await prisma.department.upsert({
    where: { code: "SALES" },
    update: { name: "Sales", description: "Sales operations and customer relations" },
    create: {
      code: "SALES",
      name: "Sales",
      description: "Sales operations and customer relations",
    },
  });

  // Administration Department
  const adminDept = await prisma.department.upsert({
    where: { code: "ADMIN" },
    update: { name: "Administration", description: "Administrative and support operations" },
    create: {
      code: "ADMIN",
      name: "Administration",
      description: "Administrative and support operations",
    },
  });

  return { engineeringDept, salesDept, adminDept };
}

async function createUsers(departments: Awaited<ReturnType<typeof createDepartments>>) {
  const password = "password123";
  const hashedPassword = await bcrypt.hash(password, 10);

  // Clear any stale employeeIds that may conflict (from a previous seed run
  // using different emails). We null them out so the upserts below can
  // reassign them cleanly.
  const reservedEmployeeIds = [
    "EMP001", "EMP002", "EMP003", "EMP004", "EMP005",
    "EMP006", "EMP007", "EMP008", "EMP009", "EMP010",
  ];
  await prisma.user.updateMany({
    where: { employeeId: { in: reservedEmployeeIds } },
    data: { employeeId: null },
  });

  // ─────────────────────────────────────────────────────────
  // DIRECTOR (1 person — top of hierarchy, no department)
  // ─────────────────────────────────────────────────────────
  const director = await prisma.user.upsert({
    where: { email: "director@company.com" },
    update: { name: "Budi Hartono", role: "DIRECTOR", employeeId: "EMP001" },
    create: {
      email: "director@company.com",
      name: "Budi Hartono",
      employeeId: "EMP001",
      role: "DIRECTOR",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000001",
    },
  });
  console.log(`   👔 Director     : director@company.com / ${password}`);

  // ─────────────────────────────────────────────────────────
  // ADMIN GROUP — Chief + 2 Members
  // ─────────────────────────────────────────────────────────
  const adminChief = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: { name: "Diana Kusuma", role: "ADMIN", departmentId: departments.adminDept.id, supervisorId: director.id },
    create: {
      email: "admin@company.com",
      name: "Diana Kusuma",
      employeeId: "EMP002",
      role: "ADMIN",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000002",
      departmentId: departments.adminDept.id,
      supervisorId: director.id,
    },
  });
  console.log(`   🔑 Admin Chief  : admin@company.com / ${password}`);

  const adminStaff1 = await prisma.user.upsert({
    where: { email: "admin.staff1@company.com" },
    update: { supervisorId: adminChief.id },
    create: {
      email: "admin.staff1@company.com",
      name: "Budi Santoso",
      employeeId: "EMP003",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000003",
      departmentId: departments.adminDept.id,
      supervisorId: adminChief.id,
    },
  });
  console.log(`   👤 Admin Staff 1: admin.staff1@company.com / ${password}`);

  const adminStaff2 = await prisma.user.upsert({
    where: { email: "admin.staff2@company.com" },
    update: { supervisorId: adminChief.id },
    create: {
      email: "admin.staff2@company.com",
      name: "Sari Dewi",
      employeeId: "EMP004",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000004",
      departmentId: departments.adminDept.id,
      supervisorId: adminChief.id,
    },
  });
  console.log(`   👤 Admin Staff 2: admin.staff2@company.com / ${password}`);

  // ─────────────────────────────────────────────────────────
  // SALES GROUP — Chief + 2 Members
  // ─────────────────────────────────────────────────────────
  const salesChief = await prisma.user.upsert({
    where: { email: "sales.chief@company.com" },
    update: { supervisorId: director.id },
    create: {
      email: "sales.chief@company.com",
      name: "Reza Pratama",
      employeeId: "EMP005",
      role: "SUPERVISOR",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000005",
      departmentId: departments.salesDept.id,
      supervisorId: director.id,
    },
  });
  console.log(`   💼 Sales Chief  : sales.chief@company.com / ${password}`);

  const salesStaff1 = await prisma.user.upsert({
    where: { email: "sales.staff1@company.com" },
    update: { supervisorId: salesChief.id },
    create: {
      email: "sales.staff1@company.com",
      name: "Andi Wijaya",
      employeeId: "EMP006",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000006",
      departmentId: departments.salesDept.id,
      supervisorId: salesChief.id,
    },
  });
  console.log(`   👤 Sales Staff 1: sales.staff1@company.com / ${password}`);

  const salesStaff2 = await prisma.user.upsert({
    where: { email: "sales.staff2@company.com" },
    update: { supervisorId: salesChief.id },
    create: {
      email: "sales.staff2@company.com",
      name: "Rina Kusuma",
      employeeId: "EMP007",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000007",
      departmentId: departments.salesDept.id,
      supervisorId: salesChief.id,
    },
  });
  console.log(`   👤 Sales Staff 2: sales.staff2@company.com / ${password}`);

  // ─────────────────────────────────────────────────────────
  // ENGINEER GROUP — Chief + 2 Members
  // ─────────────────────────────────────────────────────────
  const engineerChief = await prisma.user.upsert({
    where: { email: "engineer.chief@company.com" },
    update: { supervisorId: director.id },
    create: {
      email: "engineer.chief@company.com",
      name: "Deni Hermawan",
      employeeId: "EMP008",
      role: "SUPERVISOR",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000008",
      departmentId: departments.engineeringDept.id,
      supervisorId: director.id,
    },
  });
  console.log(`   🛠  Eng Chief   : engineer.chief@company.com / ${password}`);

  const engineerStaff1 = await prisma.user.upsert({
    where: { email: "engineer.staff1@company.com" },
    update: { supervisorId: engineerChief.id },
    create: {
      email: "engineer.staff1@company.com",
      name: "Tia Rahayu",
      employeeId: "EMP009",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000009",
      departmentId: departments.engineeringDept.id,
      supervisorId: engineerChief.id,
    },
  });
  console.log(`   👤 Eng Staff 1  : engineer.staff1@company.com / ${password}`);

  const engineerStaff2 = await prisma.user.upsert({
    where: { email: "engineer.staff2@company.com" },
    update: { supervisorId: engineerChief.id },
    create: {
      email: "engineer.staff2@company.com",
      name: "Fajar Nugroho",
      employeeId: "EMP010",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628111000010",
      departmentId: departments.engineeringDept.id,
      supervisorId: engineerChief.id,
    },
  });
  console.log(`   👤 Eng Staff 2  : engineer.staff2@company.com / ${password}`);

  return {
    director,
    adminChief, adminStaff1, adminStaff2,
    salesChief, salesStaff1, salesStaff2,
    engineerChief, engineerStaff1, engineerStaff2,
  };
}

async function createChartOfAccounts(adminUser: { id: string } | null) {
  if (!adminUser) throw new Error("Admin user not found. Run the admin user seed first.");

  // Create parent expense account
  const expenseAccount = await prisma.chartOfAccount.upsert({
    where: { code: "6000" },
    update: {},
    create: {
      code: "6000",
      name: "Operating Expenses",
      accountType: "EXPENSE",
      category: "Operating",
      isActive: true,
      description: "All operating expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created parent account: ${expenseAccount.code} - ${expenseAccount.name}`);

  // Create travel & transportation expense accounts
  const travelExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6100" },
    update: {},
    create: {
      code: "6100",
      name: "Travel & Transportation",
      accountType: "EXPENSE",
      category: "Travel",
      parentId: expenseAccount.id,
      isActive: true,
      description: "All travel and transportation related expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${travelExpense.code} - ${travelExpense.name}`);

  // Create subcategory accounts under Travel
  await prisma.chartOfAccount.upsert({
    where: { code: "6110" },
    update: {},
    create: {
      code: "6110",
      name: "Airfare",
      accountType: "EXPENSE",
      category: "Travel",
      subcategory: "Transportation",
      parentId: travelExpense.id,
      isActive: true,
      description: "Air travel expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  await prisma.chartOfAccount.upsert({
    where: { code: "6120" },
    update: {},
    create: {
      code: "6120",
      name: "Ground Transportation",
      accountType: "EXPENSE",
      category: "Travel",
      subcategory: "Transportation",
      parentId: travelExpense.id,
      isActive: true,
      description: "Taxi, car rental, fuel, parking expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  await prisma.chartOfAccount.upsert({
    where: { code: "6130" },
    update: {},
    create: {
      code: "6130",
      name: "Accommodation",
      accountType: "EXPENSE",
      category: "Travel",
      subcategory: "Lodging",
      parentId: travelExpense.id,
      isActive: true,
      description: "Hotel and lodging expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create meal & entertainment expense accounts
  const mealExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6200" },
    update: {},
    create: {
      code: "6200",
      name: "Meals & Entertainment",
      accountType: "EXPENSE",
      category: "Entertainment",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Business meals and entertainment expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${mealExpense.code} - ${mealExpense.name}`);

  await prisma.chartOfAccount.upsert({
    where: { code: "6210" },
    update: {},
    create: {
      code: "6210",
      name: "Business Meals",
      accountType: "EXPENSE",
      category: "Entertainment",
      subcategory: "Meals",
      parentId: mealExpense.id,
      isActive: true,
      description: "Business-related meal expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  await prisma.chartOfAccount.upsert({
    where: { code: "6220" },
    update: {},
    create: {
      code: "6220",
      name: "Client Entertainment",
      accountType: "EXPENSE",
      category: "Entertainment",
      subcategory: "Hospitality",
      parentId: mealExpense.id,
      isActive: true,
      description: "Entertainment expenses for clients and prospects",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create communication expense accounts
  const commExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6300" },
    update: {},
    create: {
      code: "6300",
      name: "Communication Expenses",
      accountType: "EXPENSE",
      category: "Communication",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Phone, internet, and communication expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${commExpense.code} - ${commExpense.name}`);

  await prisma.chartOfAccount.upsert({
    where: { code: "6310" },
    update: {},
    create: {
      code: "6310",
      name: "Phone & Mobile",
      accountType: "EXPENSE",
      category: "Communication",
      subcategory: "Telecommunications",
      parentId: commExpense.id,
      isActive: true,
      description: "Phone and mobile billing expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create office & supplies expense accounts
  const officeExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6400" },
    update: {},
    create: {
      code: "6400",
      name: "Office & Supplies",
      accountType: "EXPENSE",
      category: "Office",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Office supplies and equipment expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${officeExpense.code} - ${officeExpense.name}`);

  await prisma.chartOfAccount.upsert({
    where: { code: "6410" },
    update: {},
    create: {
      code: "6410",
      name: "Stationery & Supplies",
      accountType: "EXPENSE",
      category: "Office",
      subcategory: "Supplies",
      parentId: officeExpense.id,
      isActive: true,
      description: "Office stationery and supplies",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create employee benefits expense accounts
  const benefitsExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6500" },
    update: {},
    create: {
      code: "6500",
      name: "Employee Benefits",
      accountType: "EXPENSE",
      category: "Benefits",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Employee benefits and welfare expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${benefitsExpense.code} - ${benefitsExpense.name}`);

  await prisma.chartOfAccount.upsert({
    where: { code: "6510" },
    update: {},
    create: {
      code: "6510",
      name: "BPJS & Health Insurance",
      accountType: "EXPENSE",
      category: "Benefits",
      subcategory: "Insurance",
      parentId: benefitsExpense.id,
      isActive: true,
      description: "BPJS health insurance and medical benefits",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  await prisma.chartOfAccount.upsert({
    where: { code: "6520" },
    update: {},
    create: {
      code: "6520",
      name: "Overtime Meals",
      accountType: "EXPENSE",
      category: "Benefits",
      subcategory: "Meals",
      parentId: benefitsExpense.id,
      isActive: true,
      description: "Employee overtime meal allowances",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create vehicle & maintenance expense accounts
  const vehicleExpense = await prisma.chartOfAccount.upsert({
    where: { code: "6600" },
    update: {},
    create: {
      code: "6600",
      name: "Vehicle Expenses",
      accountType: "EXPENSE",
      category: "Vehicle",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Vehicle-related expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: ${vehicleExpense.code} - ${vehicleExpense.name}`);

  await prisma.chartOfAccount.upsert({
    where: { code: "6610" },
    update: {},
    create: {
      code: "6610",
      name: "Vehicle Maintenance",
      accountType: "EXPENSE",
      category: "Vehicle",
      subcategory: "Maintenance",
      parentId: vehicleExpense.id,
      isActive: true,
      description: "Motorcycle and vehicle maintenance and service",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  // Create miscellaneous expense account
  await prisma.chartOfAccount.upsert({
    where: { code: "6900" },
    update: {},
    create: {
      code: "6900",
      name: "Other Expenses",
      accountType: "EXPENSE",
      category: "Miscellaneous",
      parentId: expenseAccount.id,
      isActive: true,
      description: "Other miscellaneous business expenses",
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  console.log(`   💰 Created account: 6900 - Other Expenses`);

  return { expenseAccount, travelExpense, mealExpense, commExpense, officeExpense, benefitsExpense, vehicleExpense };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createTravelRequests(users: Awaited<ReturnType<typeof createUsers>>) {
  // Create APPROVED travel requests for different users
  const approvedRequest1 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-001",
      requesterId: users.salesStaff1.id,
      purpose: "Client meeting and product demo in Jakarta",
      destination: "Jakarta",
      travelType: "SALES",
      startDate: new Date("2024-03-15"),
      endDate: new Date("2024-03-17"),
      status: "APPROVED",
      submittedAt: new Date("2024-03-01"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest1.requestNumber} for ${users.salesStaff1.phoneNumber}`);

  const approvedRequest2 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-002",
      requesterId: users.engineerStaff1.id,
      purpose: "Training session on new technology stack",
      destination: "Surabaya",
      travelType: "TRAINING",
      startDate: new Date("2024-04-10"),
      endDate: new Date("2024-04-12"),
      status: "APPROVED",
      submittedAt: new Date("2024-03-20"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest2.requestNumber} for ${users.engineerStaff1.phoneNumber}`);

  const approvedRequest3 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-003",
      requesterId: users.salesChief.id,
      purpose: "Quarterly business review meeting",
      destination: "Bandung",
      travelType: "MEETING",
      startDate: new Date("2024-05-05"),
      endDate: new Date("2024-05-07"),
      status: "APPROVED",
      submittedAt: new Date("2024-04-15"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest3.requestNumber} for ${users.salesChief.phoneNumber}`);

  await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-004",
      requesterId: users.engineerStaff2.id,
      purpose: "Site visit for operational assessment",
      destination: "Bali",
      travelType: "OPERATIONAL",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-06-03"),
      status: "SUBMITTED",
      submittedAt: new Date("2024-05-15"),
    },
  });
  console.log(`   📝 Submitted Travel Request: TR-2024-004 (not APPROVED)`);

  await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-005",
      requesterId: users.salesStaff2.id,
      purpose: "Follow-up meeting with existing clients",
      destination: "Semarang",
      travelType: "SALES",
      startDate: new Date("2024-07-10"),
      endDate: new Date("2024-07-12"),
      status: "DRAFT",
    },
  });
  console.log(`   📄 Draft Travel Request: TR-2024-005 (not APPROVED)`);

  return { approvedRequest1, approvedRequest2, approvedRequest3 };
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });