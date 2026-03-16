import { TRPCClientError } from "@trpc/client";
import { bootstrapTenantAccounting } from "../src/lib/accounting/bootstrap";
import { createCaller } from "../src/server/api/root";
import { db } from "../src/server/db";
import { Role, MembershipStatus } from "../generated/prisma";

type SessionMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: Role;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  isDefault: boolean;
  isRootTenant: boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function getMemberships(userId: string): Promise<SessionMembership[]> {
  return db.$queryRaw<SessionMembership[]>`
    SELECT
      tm."tenantId" as "tenantId",
      t."name" as "tenantName",
      t."slug" as "tenantSlug",
      tm."role"::text as "role",
      tm."status"::text as "status",
      tm."isDefault" as "isDefault",
      t."isRoot" as "isRootTenant"
    FROM "TenantMembership" tm
    INNER JOIN "Tenant" t ON t."id" = tm."tenantId"
    WHERE tm."userId" = ${userId}
    ORDER BY tm."createdAt" ASC
  `;
}

async function createCallerForUser(input: {
  userId: string;
  email: string;
  name: string | null;
  employeeId: string | null;
  role: Role;
  activeTenantId: string;
}) {
  const memberships = await getMemberships(input.userId);

  return createCaller({
    db,
    headers: new Headers(),
    session: {
      user: {
        id: input.userId,
        email: input.email,
        name: input.name,
        employeeId: input.employeeId,
        departmentId: null,
        role: input.role,
        roles: [input.role],
        activeTenantId: input.activeTenantId,
        isRoot: input.role === Role.ROOT,
        memberships,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

async function expectTrpcError(label: string, fn: () => Promise<unknown>, includesText: string) {
  try {
    await fn();
  } catch (error) {
    const message =
      error instanceof TRPCClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    if (message.includes(includesText)) {
      console.log(`✅ ${label}`);
      return;
    }

    throw new Error(`${label} gagal. Pesan aktual: ${message}`);
  }

  throw new Error(`${label} gagal. Error yang diharapkan tidak terjadi.`);
}

async function ensureTenantAndMembership(userId: string) {
  const tenant = await db.tenant.upsert({
    where: { slug: "tenant-qa-b" },
    update: { name: "Tenant QA B", deletedAt: null },
    create: {
      slug: "tenant-qa-b",
      name: "Tenant QA B",
      isRoot: false,
    },
  });

  await db.tenantMembership.upsert({
    where: {
      userId_tenantId: {
        userId,
        tenantId: tenant.id,
      },
    },
    update: {
      role: Role.FINANCE,
      status: MembershipStatus.ACTIVE,
      isDefault: false,
      activatedAt: new Date(),
      suspendedAt: null,
      invitedAt: null,
      suspendedReason: null,
    },
    create: {
      userId,
      tenantId: tenant.id,
      role: Role.FINANCE,
      status: MembershipStatus.ACTIVE,
      isDefault: false,
      activatedAt: new Date(),
    },
  });

  await db.$transaction(async (tx) => {
    await bootstrapTenantAccounting(tx, {
      tenantId: tenant.id,
      userId,
    });
  });

  return tenant;
}

async function main() {
  console.log("🔎 Menjalankan integration check multi-tenant...");

  const financeUser = await db.user.findUnique({
    where: { email: "finance.staff1@company.com" },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
    },
  });
  assert(financeUser, "User finance.staff1@company.com tidak ditemukan. Jalankan seed dulu.");

  const defaultTenant = await db.tenant.findUnique({
    where: { slug: "default" },
    select: { id: true, name: true },
  });
  assert(defaultTenant, "Default tenant tidak ditemukan.");

  const tenantB = await ensureTenantAndMembership(financeUser.id);

  const defaultCoa = await db.chartOfAccount.findUnique({
    where: { tenantId_code: { tenantId: defaultTenant.id, code: "6110" } },
    select: { id: true },
  });
  const defaultClaim = await db.claim.findFirst({
    where: { tenantId: defaultTenant.id, deletedAt: null },
    select: { id: true },
  });
  const tenantBCoaExpense = await db.chartOfAccount.findUnique({
    where: { tenantId_code: { tenantId: tenantB.id, code: "6110" } },
    select: { id: true },
  });
  const tenantBCoaBank = await db.chartOfAccount.findUnique({
    where: { tenantId_code: { tenantId: tenantB.id, code: "1120" } },
    select: { id: true },
  });
  const tenantBBalance = await db.balanceAccount.findUnique({
    where: { tenantId_code: { tenantId: tenantB.id, code: "BANK-OPS" } },
    select: { id: true, balance: true },
  });

  assert(defaultCoa, "COA default 6110 tidak ditemukan.");
  assert(defaultClaim, "Claim sample default tenant tidak ditemukan.");
  assert(tenantBCoaExpense, "COA tenant B 6110 tidak ditemukan.");
  assert(tenantBCoaBank, "COA tenant B 1120 tidak ditemukan.");
  assert(tenantBBalance, "Balance account tenant B BANK-OPS tidak ditemukan.");

  const callerTenantB = await createCallerForUser({
    userId: financeUser.id,
    email: financeUser.email ?? "",
    name: financeUser.name,
    employeeId: financeUser.employeeId,
    role: financeUser.role,
    activeTenantId: tenantB.id,
  });

  const tenantBCoaResult = (await callerTenantB.chartOfAccount.getAll()) as {
    accounts: Array<{ id: string }>;
  };
  const tenantBCoas = tenantBCoaResult.accounts;
  assert(tenantBCoas.length > 0, "COA tenant B tidak muncul di scoped query.");
  assert(!tenantBCoas.some((coa) => coa.id === defaultCoa.id), "COA tenant default bocor ke tenant B.");
  console.log("✅ Scoped COA query hanya menampilkan data tenant aktif");

  await expectTrpcError(
    "Tenant B tidak boleh membuat jurnal dengan COA tenant default",
    () =>
      callerTenantB.journalEntry.createDraft({
        transactionDate: new Date(),
        description: "Cross tenant COA test",
        sourceType: "MANUAL",
        lines: [
          {
            chartOfAccountId: defaultCoa.id,
            debitAmount: 1000,
            creditAmount: 0,
          },
          {
            chartOfAccountId: tenantBCoaBank.id,
            balanceAccountId: tenantBBalance.id,
            debitAmount: 0,
            creditAmount: 1000,
          },
        ],
      }),
    "bagan akun",
  );

  await expectTrpcError(
    "Tenant B tidak boleh link claim tenant default ke jurnal draft",
    () =>
      callerTenantB.journalEntry.createDraft({
        transactionDate: new Date(),
        description: "Cross tenant claim test",
        sourceType: "CLAIM",
        claimId: defaultClaim.id,
        sourceId: defaultClaim.id,
        lines: [
          {
            chartOfAccountId: tenantBCoaExpense.id,
            debitAmount: 1000,
            creditAmount: 0,
          },
          {
            chartOfAccountId: tenantBCoaBank.id,
            balanceAccountId: tenantBBalance.id,
            debitAmount: 0,
            creditAmount: 1000,
          },
        ],
      }),
    "Claim tidak ditemukan dalam tenant aktif",
  );

  const draft = await callerTenantB.journalEntry.createDraft({
    transactionDate: new Date(),
    description: "Jurnal manual tenant B",
    sourceType: "MANUAL",
    lines: [
      {
        chartOfAccountId: tenantBCoaExpense.id,
        debitAmount: 2500,
        creditAmount: 0,
      },
      {
        chartOfAccountId: tenantBCoaBank.id,
        balanceAccountId: tenantBBalance.id,
        debitAmount: 0,
        creditAmount: 2500,
      },
    ],
  }) as { id: string; lines: Array<{ balanceAccountId?: string | null }> };
  assert(draft.id, "Gagal membuat draft journal tenant B.");
  console.log("✅ Tenant B dapat membuat draft dengan referensi tenant sendiri");

  await callerTenantB.journalEntry.post({ id: draft.id });
  const postedBalance = await db.balanceAccount.findUnique({
    where: { tenantId_code: { tenantId: tenantB.id, code: "BANK-OPS" } },
    select: { balance: true },
  });
  assert(postedBalance, "Balance tenant B hilang setelah posting.");
  assert(Number(postedBalance.balance) === Number(tenantBBalance.balance) - 2500, "Posting jurnal tenant B tidak mengubah balance tenant B sesuai ekspektasi.");
  console.log("✅ Posting jurnal tenant B hanya memengaruhi balance tenant B");

  const callerDefault = await createCallerForUser({
    userId: financeUser.id,
    email: financeUser.email ?? "",
    name: financeUser.name,
    employeeId: financeUser.employeeId,
    role: financeUser.role,
    activeTenantId: defaultTenant.id,
  });

  await expectTrpcError(
    "Tenant default tidak boleh membaca jurnal tenant B lewat getById",
    () => callerDefault.journalEntry.getById({ id: draft.id }),
    "Jurnal tidak ditemukan",
  );

  console.log("🎉 Semua integration check multi-tenant lolos.");
}

main()
  .catch((error) => {
    console.error("❌ Integration check multi-tenant gagal:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
