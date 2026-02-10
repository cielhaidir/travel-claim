import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create departments first
  const departments = await createDepartments();
  console.log("✅ Departments created");

  // Create users with different roles
  const users = await createUsers(departments);
  console.log("✅ Users created");

  // Create travel requests with APPROVED status
  await createTravelRequests(users);
  console.log("✅ Travel requests created");

  console.log("🎉 Seeding completed successfully!");
}

async function createDepartments() {
  // Create Sales Department
  const salesDept = await prisma.department.upsert({
    where: { code: "SALES" },
    update: {},
    create: {
      code: "SALES",
      name: "Sales Department",
      description: "Handles all sales operations and customer relations",
    },
  });

  // Create IT Department
  const itDept = await prisma.department.upsert({
    where: { code: "IT" },
    update: {},
    create: {
      code: "IT",
      name: "IT Department",
      description: "Information Technology and systems management",
    },
  });

  // Create Finance Department
  const financeDept = await prisma.department.upsert({
    where: { code: "FINANCE" },
    update: {},
    create: {
      code: "FINANCE",
      name: "Finance Department",
      description: "Financial operations and accounting",
    },
  });

  // Create HR Department
  const hrDept = await prisma.department.upsert({
    where: { code: "HR" },
    update: {},
    create: {
      code: "HR",
      name: "Human Resources",
      description: "Human resources and employee management",
    },
  });

  return { salesDept, itDept, financeDept, hrDept };
}

async function createUsers(departments: any) {
  const password = "password123"; // Default password for all test users
  const hashedPassword = await bcrypt.hash(password, 10);

  // Admin User
  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      name: "Admin User",
      employeeId: "EMP001",
      role: "ADMIN",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456789",
      departmentId: departments.itDept.id,
    },
  });
  console.log(`   📧 Admin: admin@company.com / ${password}`);

  // Finance User
  const finance = await prisma.user.upsert({
    where: { email: "finance@company.com" },
    update: {},
    create: {
      email: "finance@company.com",
      name: "Finance Manager",
      employeeId: "EMP002",
      role: "FINANCE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456790",
      departmentId: departments.financeDept.id,
    },
  });
  console.log(`   📧 Finance: finance@company.com / ${password}`);

  // Director User
  const director = await prisma.user.upsert({
    where: { email: "director@company.com" },
    update: {},
    create: {
      email: "director@company.com",
      name: "John Director",
      employeeId: "EMP003",
      role: "DIRECTOR",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456791",
      departmentId: departments.salesDept.id,
    },
  });
  console.log(`   📧 Director: director@company.com / ${password}`);

  // Manager User
  const manager = await prisma.user.upsert({
    where: { email: "manager@company.com" },
    update: {},
    create: {
      email: "manager@company.com",
      name: "Jane Manager",
      employeeId: "EMP004",
      role: "MANAGER",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456792",
      departmentId: departments.salesDept.id,
      supervisorId: director.id,
    },
  });
  console.log(`   📧 Manager: manager@company.com / ${password}`);

  // Supervisor User
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@company.com" },
    update: {},
    create: {
      email: "supervisor@company.com",
      name: "Bob Supervisor",
      employeeId: "EMP005",
      role: "SUPERVISOR",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456793",
      departmentId: departments.salesDept.id,
      supervisorId: manager.id,
    },
  });
  console.log(`   📧 Supervisor: supervisor@company.com / ${password}`);

  // Employee Users
  const employee1 = await prisma.user.upsert({
    where: { email: "employee1@company.com" },
    update: {},
    create: {
      email: "employee1@company.com",
      name: "Alice Employee",
      employeeId: "EMP006",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456794",
      departmentId: departments.salesDept.id,
      supervisorId: supervisor.id,
    },
  });
  console.log(`   📧 Employee 1: employee1@company.com / ${password}`);

  const employee2 = await prisma.user.upsert({
    where: { email: "employee2@company.com" },
    update: {},
    create: {
      email: "employee2@company.com",
      name: "Charlie Employee",
      employeeId: "EMP007",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456795",
      departmentId: departments.itDept.id,
      supervisorId: supervisor.id,
    },
  });
  console.log(`   📧 Employee 2: employee2@company.com / ${password}`);

  const employee3 = await prisma.user.upsert({
    where: { email: "employee3@company.com" },
    update: {},
    create: {
      email: "employee3@company.com",
      name: "David Employee",
      employeeId: "EMP008",
      role: "EMPLOYEE",
      password: hashedPassword,
      emailVerified: new Date(),
      phoneNumber: "+628123456796",
      departmentId: departments.hrDept.id,
      supervisorId: supervisor.id,
    },
  });
  console.log(`   📧 Employee 3: employee3@company.com / ${password}`);

  return {
    admin,
    finance,
    director,
    manager,
    supervisor,
    employee1,
    employee2,
    employee3,
  };
}

async function createTravelRequests(users: any) {
  // Create APPROVED travel requests for different users
  const approvedRequest1 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-001",
      requesterId: users.employee1.id,
      purpose: "Client meeting and product demo in Jakarta",
      destination: "Jakarta",
      travelType: "SALES",
      startDate: new Date("2024-03-15"),
      endDate: new Date("2024-03-17"),
      estimatedBudget: 5000000,
      status: "APPROVED",
      projectName: "Project Alpha",
      customerName: "PT. Tech Solutions",
      salesPerson: "Alice Employee",
      submittedAt: new Date("2024-03-01"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest1.requestNumber} for ${users.employee1.phoneNumber}`);

  const approvedRequest2 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-002",
      requesterId: users.employee2.id,
      purpose: "Training session on new technology stack",
      destination: "Surabaya",
      travelType: "TRAINING",
      startDate: new Date("2024-04-10"),
      endDate: new Date("2024-04-12"),
      estimatedBudget: 3500000,
      status: "APPROVED",
      submittedAt: new Date("2024-03-20"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest2.requestNumber} for ${users.employee2.phoneNumber}`);

  const approvedRequest3 = await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-003",
      requesterId: users.supervisor.id,
      purpose: "Quarterly business review meeting",
      destination: "Bandung",
      travelType: "MEETING",
      startDate: new Date("2024-05-05"),
      endDate: new Date("2024-05-07"),
      estimatedBudget: 4000000,
      status: "APPROVED",
      submittedAt: new Date("2024-04-15"),
    },
  });
  console.log(`   ✈️  Approved Travel Request: ${approvedRequest3.requestNumber} for ${users.supervisor.phoneNumber}`);

  // Create some non-APPROVED requests for comparison
  await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-004",
      requesterId: users.employee3.id,
      purpose: "Site visit for operational assessment",
      destination: "Bali",
      travelType: "OPERATIONAL",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-06-03"),
      estimatedBudget: 6000000,
      status: "SUBMITTED",
      submittedAt: new Date("2024-05-15"),
    },
  });
  console.log(`   📝 Submitted Travel Request: TR-2024-004 (not APPROVED)`);

  await prisma.travelRequest.create({
    data: {
      requestNumber: "TR-2024-005",
      requesterId: users.employee1.id,
      purpose: "Follow-up meeting with existing clients",
      destination: "Semarang",
      travelType: "SALES",
      startDate: new Date("2024-07-10"),
      endDate: new Date("2024-07-12"),
      estimatedBudget: 3000000,
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