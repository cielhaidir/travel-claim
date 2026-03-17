import { COAType, type Prisma } from "../../../generated/prisma";

type CoaTemplate = {
  code: string;
  name: string;
  accountType: COAType;
  category: string;
  subcategory?: string;
  parentCode?: string;
  description: string;
};

type BalanceAccountTemplate = {
  code: string;
  name: string;
  defaultChartOfAccountCode: string;
  description: string;
};

const DEFAULT_COA_TEMPLATE: CoaTemplate[] = [
  {
    code: "1000",
    name: "Kas dan Setara Kas",
    accountType: COAType.ASSET,
    category: "Assets",
    description: "Kelompok akun kas dan setara kas",
  },
  {
    code: "1110",
    name: "Kas Kecil",
    accountType: COAType.ASSET,
    category: "Assets",
    subcategory: "Cash",
    parentCode: "1000",
    description: "Akun kas kecil kantor",
  },
  {
    code: "1120",
    name: "Bank Operasional",
    accountType: COAType.ASSET,
    category: "Assets",
    subcategory: "Bank",
    parentCode: "1000",
    description: "Akun bank operasional utama",
  },
  {
    code: "1130",
    name: "Uang Muka Perjalanan",
    accountType: COAType.ASSET,
    category: "Assets",
    subcategory: "Advance",
    parentCode: "1000",
    description: "Akun uang muka untuk bailout perjalanan dinas",
  },
  {
    code: "3000",
    name: "Ekuitas",
    accountType: COAType.EQUITY,
    category: "Equity",
    description: "Kelompok akun ekuitas",
  },
  {
    code: "3100",
    name: "Saldo Awal",
    accountType: COAType.EQUITY,
    category: "Equity",
    subcategory: "Opening Balance",
    parentCode: "3000",
    description: "Akun saldo awal modal atau ekuitas",
  },
  {
    code: "6000",
    name: "Operating Expenses",
    accountType: COAType.EXPENSE,
    category: "Operating",
    description: "Kelompok akun beban operasional",
  },
  {
    code: "6100",
    name: "Travel & Transportation",
    accountType: COAType.EXPENSE,
    category: "Travel",
    parentCode: "6000",
    description: "Kelompok biaya perjalanan dan transportasi",
  },
  {
    code: "6110",
    name: "Airfare",
    accountType: COAType.EXPENSE,
    category: "Travel",
    subcategory: "Transportation",
    parentCode: "6100",
    description: "Biaya tiket pesawat",
  },
  {
    code: "6120",
    name: "Ground Transportation",
    accountType: COAType.EXPENSE,
    category: "Travel",
    subcategory: "Transportation",
    parentCode: "6100",
    description: "Biaya taksi, rental, BBM, dan parkir",
  },
  {
    code: "6130",
    name: "Accommodation",
    accountType: COAType.EXPENSE,
    category: "Travel",
    subcategory: "Lodging",
    parentCode: "6100",
    description: "Biaya hotel dan penginapan",
  },
  {
    code: "6200",
    name: "Meals & Entertainment",
    accountType: COAType.EXPENSE,
    category: "Entertainment",
    parentCode: "6000",
    description: "Kelompok biaya makan dan entertainment",
  },
  {
    code: "6210",
    name: "Business Meals",
    accountType: COAType.EXPENSE,
    category: "Entertainment",
    subcategory: "Meals",
    parentCode: "6200",
    description: "Biaya makan untuk keperluan bisnis",
  },
  {
    code: "6220",
    name: "Client Entertainment",
    accountType: COAType.EXPENSE,
    category: "Entertainment",
    subcategory: "Hospitality",
    parentCode: "6200",
    description: "Biaya entertainment untuk klien dan prospek",
  },
  {
    code: "6300",
    name: "Communication Expenses",
    accountType: COAType.EXPENSE,
    category: "Communication",
    parentCode: "6000",
    description: "Kelompok biaya komunikasi",
  },
  {
    code: "6310",
    name: "Phone Billing",
    accountType: COAType.EXPENSE,
    category: "Communication",
    subcategory: "Phone",
    parentCode: "6300",
    description: "Biaya pulsa dan telepon",
  },
  {
    code: "6400",
    name: "Employee Support Expenses",
    accountType: COAType.EXPENSE,
    category: "People",
    parentCode: "6000",
    description: "Kelompok biaya dukungan karyawan",
  },
  {
    code: "6410",
    name: "Overtime Meals",
    accountType: COAType.EXPENSE,
    category: "People",
    subcategory: "Meals",
    parentCode: "6400",
    description: "Biaya makan lembur karyawan",
  },
  {
    code: "6420",
    name: "BPJS Health",
    accountType: COAType.EXPENSE,
    category: "People",
    subcategory: "Benefits",
    parentCode: "6400",
    description: "Biaya BPJS kesehatan",
  },
  {
    code: "6500",
    name: "Office & Equipment",
    accountType: COAType.EXPENSE,
    category: "Operations",
    parentCode: "6000",
    description: "Kelompok biaya peralatan dan operasional kantor",
  },
  {
    code: "6510",
    name: "Equipment & Stationery",
    accountType: COAType.EXPENSE,
    category: "Operations",
    subcategory: "Supplies",
    parentCode: "6500",
    description: "Biaya peralatan kerja dan alat tulis kantor",
  },
  {
    code: "6520",
    name: "Motorcycle Service",
    accountType: COAType.EXPENSE,
    category: "Operations",
    subcategory: "Vehicle",
    parentCode: "6500",
    description: "Biaya servis kendaraan operasional roda dua",
  },
  {
    code: "6990",
    name: "Other Expenses",
    accountType: COAType.EXPENSE,
    category: "Operating",
    subcategory: "Other",
    parentCode: "6000",
    description: "Biaya operasional lain-lain",
  },
];

const DEFAULT_BALANCE_ACCOUNT_TEMPLATE: BalanceAccountTemplate[] = [
  {
    code: "KAS-KECIL",
    name: "Kas Kecil Kantor",
    defaultChartOfAccountCode: "1110",
    description: "Kas kecil untuk kebutuhan operasional harian",
  },
  {
    code: "BANK-OPS",
    name: "Rekening Operasional Utama",
    defaultChartOfAccountCode: "1120",
    description: "Rekening bank operasional utama tenant",
  },
];

export async function bootstrapTenantAccounting(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
  },
): Promise<void> {
  const { tenantId, userId } = input;

  for (const template of DEFAULT_COA_TEMPLATE) {
    await tx.chartOfAccount.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: template.code,
        },
      },
      update: {
        name: template.name,
        accountType: template.accountType,
        category: template.category,
        subcategory: template.subcategory,
        description: template.description,
        isActive: true,
        updatedById: userId,
      },
      create: {
        tenantId,
        code: template.code,
        name: template.name,
        accountType: template.accountType,
        category: template.category,
        subcategory: template.subcategory,
        description: template.description,
        isActive: true,
        createdById: userId,
        updatedById: userId,
      },
    });
  }

  const accounts = await tx.chartOfAccount.findMany({
    where: {
      tenantId,
      code: { in: DEFAULT_COA_TEMPLATE.map((item) => item.code) },
    },
    select: {
      id: true,
      code: true,
      parentId: true,
    },
  });

  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  for (const template of DEFAULT_COA_TEMPLATE) {
    if (!template.parentCode) continue;

    const account = accountByCode.get(template.code);
    const parent = accountByCode.get(template.parentCode);
    if (!account || !parent || account.parentId === parent.id) continue;

    await tx.chartOfAccount.update({
      where: { id: account.id },
      data: {
        parentId: parent.id,
        updatedById: userId,
      },
    });
  }

  for (const template of DEFAULT_BALANCE_ACCOUNT_TEMPLATE) {
    const defaultChartOfAccount = accountByCode.get(template.defaultChartOfAccountCode);
    if (!defaultChartOfAccount) {
      throw new Error(
        `Missing default Chart of Account ${template.defaultChartOfAccountCode} for tenant bootstrap`,
      );
    }

    await tx.balanceAccount.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: template.code,
        },
      },
      update: {
        name: template.name,
        defaultChartOfAccountId: defaultChartOfAccount.id,
        description: template.description,
        isActive: true,
      },
      create: {
        tenantId,
        code: template.code,
        name: template.name,
        balance: 0,
        defaultChartOfAccountId: defaultChartOfAccount.id,
        description: template.description,
        isActive: true,
      },
    });
  }
}
