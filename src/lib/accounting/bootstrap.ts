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
    name: "Aset Lancar",
    accountType: COAType.ASSET,
    category: "Aset",
    description: "Kelompok akun aset lancar untuk kas, bank, uang muka, dan piutang operasional",
  },
  {
    code: "1100",
    name: "Kas dan Bank",
    accountType: COAType.ASSET,
    category: "Aset",
    parentCode: "1000",
    description: "Kelompok akun kas dan bank operasional",
  },
  {
    code: "1110",
    name: "Kas Kecil",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Kas",
    parentCode: "1100",
    description: "Akun kas kecil untuk kebutuhan operasional harian",
  },
  {
    code: "1120",
    name: "Bank Operasional",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Bank",
    parentCode: "1100",
    description: "Akun bank operasional utama perusahaan",
  },
  {
    code: "1130",
    name: "Piutang dan Uang Muka",
    accountType: COAType.ASSET,
    category: "Aset",
    parentCode: "1000",
    description: "Kelompok akun uang muka dan piutang operasional",
  },
  {
    code: "1131",
    name: "Uang Muka Perjalanan Dinas",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Uang Muka",
    parentCode: "1130",
    description: "Akun uang muka perjalanan dinas untuk pencairan bailout sebelum settlement",
  },
  {
    code: "1132",
    name: "Piutang Karyawan",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Piutang",
    parentCode: "1130",
    description: "Tagihan kepada karyawan, termasuk selisih uang muka yang belum dikembalikan",
  },
  {
    code: "1133",
    name: "Uang Muka Operasional Lain",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Uang Muka",
    parentCode: "1130",
    description: "Uang muka operasional selain perjalanan dinas",
  },
  {
    code: "1140",
    name: "Pajak Dibayar di Muka",
    accountType: COAType.ASSET,
    category: "Aset",
    parentCode: "1000",
    description: "Kelompok akun pajak dibayar di muka dan pajak masukan",
  },
  {
    code: "1141",
    name: "PPN Masukan",
    accountType: COAType.ASSET,
    category: "Aset",
    subcategory: "Pajak",
    parentCode: "1140",
    description: "PPN masukan yang dapat dikreditkan bila relevan",
  },
  {
    code: "2000",
    name: "Kewajiban Lancar",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    description: "Kelompok akun kewajiban jangka pendek perusahaan",
  },
  {
    code: "2100",
    name: "Hutang Operasional",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    parentCode: "2000",
    description: "Kelompok hutang operasional perusahaan",
  },
  {
    code: "2110",
    name: "Hutang Karyawan",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    subcategory: "Hutang Operasional",
    parentCode: "2100",
    description: "Kewajiban perusahaan kepada karyawan atas reimbursement atau selisih settlement",
  },
  {
    code: "2120",
    name: "Hutang Akrual",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    subcategory: "Akrual",
    parentCode: "2100",
    description: "Akun akrual biaya yang sudah terjadi namun belum dibayar",
  },
  {
    code: "2200",
    name: "Hutang Pajak",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    parentCode: "2000",
    description: "Kelompok akun hutang pajak perusahaan",
  },
  {
    code: "2210",
    name: "Hutang PPh 21",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    subcategory: "Pajak",
    parentCode: "2200",
    description: "Hutang PPh Pasal 21 bila dibutuhkan",
  },
  {
    code: "2220",
    name: "Hutang PPh 23",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    subcategory: "Pajak",
    parentCode: "2200",
    description: "Hutang PPh Pasal 23 bila dibutuhkan",
  },
  {
    code: "2230",
    name: "Hutang PPN",
    accountType: COAType.LIABILITY,
    category: "Liabilitas",
    subcategory: "Pajak",
    parentCode: "2200",
    description: "Hutang PPN keluaran bila dibutuhkan",
  },
  {
    code: "3000",
    name: "Ekuitas",
    accountType: COAType.EQUITY,
    category: "Ekuitas",
    description: "Kelompok akun ekuitas perusahaan",
  },
  {
    code: "3100",
    name: "Saldo Awal",
    accountType: COAType.EQUITY,
    category: "Ekuitas",
    subcategory: "Saldo Awal",
    parentCode: "3000",
    description: "Akun pembukaan saldo awal atau ekuitas pembentukan perusahaan",
  },
  {
    code: "3200",
    name: "Modal dan Laba Ditahan",
    accountType: COAType.EQUITY,
    category: "Ekuitas",
    subcategory: "Modal",
    parentCode: "3000",
    description: "Kelompok modal disetor dan laba ditahan",
  },
  {
    code: "6000",
    name: "Beban Operasional",
    accountType: COAType.EXPENSE,
    category: "Beban",
    description: "Kelompok akun beban operasional perusahaan",
  },
  {
    code: "6100",
    name: "Beban Perjalanan Dinas",
    accountType: COAType.EXPENSE,
    category: "Beban",
    parentCode: "6000",
    description: "Kelompok biaya perjalanan dinas dan transportasi",
  },
  {
    code: "6110",
    name: "Beban Tiket",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Perjalanan",
    parentCode: "6100",
    description: "Biaya tiket pesawat, kereta, atau moda perjalanan utama",
  },
  {
    code: "6120",
    name: "Beban Transport Lokal",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Perjalanan",
    parentCode: "6100",
    description: "Biaya taksi, rental, BBM, tol, dan parkir",
  },
  {
    code: "6130",
    name: "Beban Hotel dan Akomodasi",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Perjalanan",
    parentCode: "6100",
    description: "Biaya hotel, penginapan, dan akomodasi lainnya",
  },
  {
    code: "6140",
    name: "Beban Uang Harian dan Konsumsi Perjalanan",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Perjalanan",
    parentCode: "6100",
    description: "Biaya makan dan uang harian dalam perjalanan dinas",
  },
  {
    code: "6200",
    name: "Beban Entertainment",
    accountType: COAType.EXPENSE,
    category: "Beban",
    parentCode: "6000",
    description: "Kelompok biaya jamuan bisnis dan relasi",
  },
  {
    code: "6210",
    name: "Beban Jamuan Bisnis",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Entertainment",
    parentCode: "6200",
    description: "Biaya makan dan jamuan untuk keperluan bisnis",
  },
  {
    code: "6220",
    name: "Beban Relasi dan Entertainment Klien",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Entertainment",
    parentCode: "6200",
    description: "Biaya entertainment untuk klien, prospek, atau relasi bisnis",
  },
  {
    code: "6230",
    name: "Beban Hadiah dan Souvenir",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Entertainment",
    parentCode: "6200",
    description: "Biaya hadiah, souvenir, dan pemberian terkait relasi bisnis",
  },
  {
    code: "6290",
    name: "Beban Entertainment Lainnya",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Entertainment",
    parentCode: "6200",
    description: "Biaya entertainment lain yang tidak masuk kategori utama",
  },
  {
    code: "6300",
    name: "Beban Komunikasi",
    accountType: COAType.EXPENSE,
    category: "Beban",
    parentCode: "6000",
    description: "Kelompok biaya komunikasi dan konektivitas",
  },
  {
    code: "6310",
    name: "Beban Telepon dan Pulsa",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Komunikasi",
    parentCode: "6300",
    description: "Biaya pulsa, telepon, dan komunikasi seluler",
  },
  {
    code: "6400",
    name: "Beban Karyawan",
    accountType: COAType.EXPENSE,
    category: "Beban",
    parentCode: "6000",
    description: "Kelompok biaya dukungan dan kesejahteraan karyawan",
  },
  {
    code: "6410",
    name: "Beban Makan Lembur",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Karyawan",
    parentCode: "6400",
    description: "Biaya makan lembur karyawan",
  },
  {
    code: "6420",
    name: "Beban BPJS Kesehatan",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Karyawan",
    parentCode: "6400",
    description: "Biaya BPJS kesehatan yang ditanggung perusahaan",
  },
  {
    code: "6500",
    name: "Beban Operasional Kantor",
    accountType: COAType.EXPENSE,
    category: "Beban",
    parentCode: "6000",
    description: "Kelompok biaya peralatan dan operasional kantor",
  },
  {
    code: "6510",
    name: "Beban ATK dan Peralatan",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Operasional Kantor",
    parentCode: "6500",
    description: "Biaya alat tulis kantor dan peralatan kerja bernilai kecil",
  },
  {
    code: "6520",
    name: "Beban Servis Kendaraan Operasional",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Operasional Kantor",
    parentCode: "6500",
    description: "Biaya servis kendaraan operasional roda dua atau sejenisnya",
  },
  {
    code: "6590",
    name: "Beban Operasional Lain-lain",
    accountType: COAType.EXPENSE,
    category: "Beban",
    subcategory: "Operasional Kantor",
    parentCode: "6500",
    description: "Biaya operasional lain yang tidak masuk kelompok utama",
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
    description: "Rekening bank operasional utama perusahaan",
  },
];

export async function bootstrapAccountingCatalog(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
  },
): Promise<void> {
  const { userId } = input;

  for (const template of DEFAULT_COA_TEMPLATE) {
    await tx.chartOfAccount.upsert({
      where: {
        code: template.code,
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
        `Missing default Chart of Account ${template.defaultChartOfAccountCode} for accounting bootstrap`,
      );
    }

    await tx.balanceAccount.upsert({
      where: {
        code: template.code,
      },
      update: {
        name: template.name,
        defaultChartOfAccountId: defaultChartOfAccount.id,
        description: template.description,
        isActive: true,
      },
      create: {
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
