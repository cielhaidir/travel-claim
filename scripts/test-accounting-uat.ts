import { TRPCClientError } from "@trpc/client";
import { createCaller } from "../src/server/api/root";
import { resolveEffectivePermissions } from "../src/server/auth/permission-store";
import { db } from "../src/server/db";
import { Role, MembershipStatus, JournalSourceType, JournalStatus } from "../generated/prisma";

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
  if (!condition) throw new Error(message);
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

async function makeCaller(input: {
  userId: string;
  email: string;
  name: string | null;
  employeeId: string | null;
  role: Role;
  activeTenantId: string | null;
  isRoot?: boolean;
}) {
  const memberships = await getMemberships(input.userId);
  const isRoot = input.isRoot ?? input.role === Role.ROOT;
  const permissions = await resolveEffectivePermissions(db, {
    tenantId: input.activeTenantId,
    roles: [input.role],
    isRoot,
  });
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
        permissions,
        isRoot,
        memberships,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

function pass(label: string) {
  console.log(`✅ ${label}`);
}

async function main() {
  console.log("🧪 Accounting UAT smoke test dimulai...");

  const rootUser = await db.user.findUnique({
    where: { email: "root@company.com" },
    select: { id: true, email: true, name: true, employeeId: true, role: true },
  });
  const financeUser = await db.user.findUnique({
    where: { email: "finance.staff1@company.com" },
    select: { id: true, email: true, name: true, employeeId: true, role: true },
  });

  assert(rootUser, "Root user tidak ditemukan. Jalankan seed dulu.");
  assert(financeUser, "Finance user tidak ditemukan. Jalankan seed dulu.");

  const rootCaller = await makeCaller({
    userId: rootUser.id,
    email: rootUser.email ?? "",
    name: rootUser.name,
    employeeId: rootUser.employeeId,
    role: rootUser.role,
    activeTenantId: null,
    isRoot: true,
  });

  const suffix = Date.now().toString().slice(-6);
  const tenantName = `UAT Accounting Tenant ${suffix}`;
  const tenant = await rootCaller.tenant.create({
    name: tenantName,
    slug: `uat-accounting-tenant-${suffix}`,
  }) as { id: string; slug: string; name: string };
  assert(tenant.id, "Gagal membuat tenant uji.");
  pass("Tenant baru berhasil dibuat via router");

  await rootCaller.tenant.upsertMembership({
    tenantId: tenant.id,
    userId: financeUser.id,
    role: Role.FINANCE,
    status: MembershipStatus.ACTIVE,
    isDefault: false,
  });
  pass("Finance user berhasil di-assign ke tenant uji");

  const financeCaller = await makeCaller({
    userId: financeUser.id,
    email: financeUser.email ?? "",
    name: financeUser.name,
    employeeId: financeUser.employeeId,
    role: financeUser.role,
    activeTenantId: tenant.id,
  });

  const coaResult = await financeCaller.chartOfAccount.getAll({ limit: 100 }) as { accounts: Array<{ id: string; code: string; name: string; accountType: string }> };
  assert(coaResult.accounts.length > 0, "COA default tenant baru tidak muncul.");
  const bankCoa = coaResult.accounts.find((a) => a.code === "1120");
  const cashCoa = coaResult.accounts.find((a) => a.code === "1110");
  const expenseCoa = coaResult.accounts.find((a) => a.code === "6110");
  assert(bankCoa && cashCoa && expenseCoa, "COA default penting tenant baru belum lengkap.");
  pass("Bootstrap COA tenant baru berjalan otomatis");

  const balanceList = await financeCaller.balanceAccount.list({ limit: 100 }) as { balanceAccounts: Array<{ id: string; code: string; name: string; balance: number }> };
  const bankOps = balanceList.balanceAccounts.find((a) => a.code === "BANK-OPS");
  assert(bankOps, "Balance account default BANK-OPS tidak ditemukan.");
  pass("Bootstrap balance account tenant baru berjalan otomatis");

  const createdBalance = await financeCaller.balanceAccount.create({
    code: "BANK-CAD-UAT",
    name: "Rekening Cadangan UAT",
    balance: 10_000_000,
    defaultChartOfAccountId: bankCoa.id,
    description: "Akun saldo untuk smoke test UAT",
    isActive: true,
  }) as { id: string; code: string; balance: number };
  assert(createdBalance.code === "BANK-CAD-UAT", "Gagal membuat balance account manual.");
  pass("Create balance account manual berhasil");

  const adjusted = await financeCaller.balanceAccount.adjustBalance({
    id: createdBalance.id,
    amount: 500_000,
    entryType: "CREDIT",
    chartOfAccountId: cashCoa.id,
    description: "Top up saldo awal UAT",
    referenceNumber: "UAT-ADJ-001",
  }) as { balanceAccount: { id: string; balance: number } };
  assert(Number(adjusted.balanceAccount.balance) === 10_500_000, `Saldo hasil adjustment tidak sesuai. Aktual ${adjusted.balanceAccount.balance}`);
  pass("Adjustment manual balance account berhasil dan saldo berubah");

  const detail = await financeCaller.balanceAccount.getById({ id: createdBalance.id }) as {
    journalTransactions: Array<{ transactionNumber: string; amount: number; entryType: string }>;
  };
  assert(detail.journalTransactions.length > 0, "Histori mutasi akun saldo tidak muncul.");
  pass("Histori mutasi akun saldo tampil");

  const draft = await financeCaller.journalEntry.createDraft({
    transactionDate: new Date(),
    description: "Jurnal manual UAT",
    sourceType: JournalSourceType.MANUAL,
    lines: [
      {
        chartOfAccountId: expenseCoa.id,
        debitAmount: 250_000,
        creditAmount: 0,
      },
      {
        chartOfAccountId: bankCoa.id,
        balanceAccountId: createdBalance.id,
        debitAmount: 0,
        creditAmount: 250_000,
      },
    ],
  }) as { id: string; status: JournalStatus };
  assert(draft.status === JournalStatus.DRAFT, "Draft jurnal manual gagal dibuat.");
  pass("Draft jurnal manual berhasil dibuat");

  const posted = await financeCaller.journalEntry.post({ id: draft.id }) as { id: string; status: JournalStatus };
  assert(posted.status === JournalStatus.POSTED, "Jurnal manual gagal diposting.");
  pass("Posting jurnal manual berhasil");

  const journalList = await financeCaller.journalEntry.list({ limit: 100, status: JournalStatus.POSTED }) as {
    journalEntries: Array<{
      id: string;
      sourceType?: JournalSourceType | null;
      lines: Array<{ debitAmount: number; creditAmount: number; chartOfAccount: { code: string; accountType: string } }>;
    }>;
  };
  const postedJournal = journalList.journalEntries.find((j) => j.id === draft.id);
  assert(postedJournal, "Jurnal posted tidak muncul di daftar jurnal.");
  const debit = postedJournal.lines.reduce((sum, line) => sum + Number(line.debitAmount ?? 0), 0);
  const credit = postedJournal.lines.reduce((sum, line) => sum + Number(line.creditAmount ?? 0), 0);
  assert(Math.abs(debit - credit) < 0.001, "Jurnal posted tidak balance.");
  pass("Jurnal muncul di daftar dan debit = kredit");

  const updatedBalance = await financeCaller.balanceAccount.getById({ id: createdBalance.id }) as { balance: number };
  assert(Number(updatedBalance.balance) === 10_250_000, `Saldo akun setelah posting jurnal tidak sesuai. Aktual ${updatedBalance.balance}`);
  pass("Posting jurnal memengaruhi saldo balance account dengan benar");

  const expenseTotals = journalList.journalEntries
    .flatMap((j) => j.lines)
    .filter((line) => line.chartOfAccount.accountType === "EXPENSE")
    .reduce((sum, line) => sum + Number(line.debitAmount ?? 0) - Number(line.creditAmount ?? 0), 0);
  assert(expenseTotals >= 250_000, "Data dasar expense summary tidak terbentuk sesuai ekspektasi.");
  pass("Data dasar expense summary / trial balance / ledger tersedia dari jurnal");

  const otherTenant = await db.tenant.findUnique({ where: { slug: "default" }, select: { id: true } });
  assert(otherTenant, "Default tenant tidak ditemukan.");
  const financeCallerDefault = await makeCaller({
    userId: financeUser.id,
    email: financeUser.email ?? "",
    name: financeUser.name,
    employeeId: financeUser.employeeId,
    role: financeUser.role,
    activeTenantId: otherTenant.id,
  });

  try {
    await financeCallerDefault.balanceAccount.getById({ id: createdBalance.id });
    throw new Error("Cross-tenant access tidak terblokir untuk balance account detail.");
  } catch (error) {
    const msg = error instanceof TRPCClientError ? error.message : error instanceof Error ? error.message : String(error);
    if (!msg.toLowerCase().includes("not found") && !msg.toLowerCase().includes("tidak ditemukan")) {
      throw error;
    }
  }
  pass("Tenant isolation balance account detail bekerja");

  console.log("🎉 Accounting UAT smoke test selesai: PASS");
}

main()
  .catch((error) => {
    console.error("❌ Accounting UAT smoke test gagal:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
