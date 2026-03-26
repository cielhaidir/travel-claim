import type {
  HcPayrollCalculationMethod,
  HcPayrollComponentCategory,
  HcPayrollPaidBy,
  HcPayrollPeriodStatus,
  HcPayrollProrationMethod,
  HcPayrollRunStatus,
  HcPayrollTaxTreatment,
} from "@/server/modules/hc/shared/hc.types";

export type PayrollComponentRow = {
  id: string;
  code: string;
  name: string;
  category: HcPayrollComponentCategory;
  calculationMethod: HcPayrollCalculationMethod;
  paidBy: HcPayrollPaidBy;
  taxTreatment: HcPayrollTaxTreatment;
  defaultRate: number | null;
  currency: string;
  isProrated: boolean;
  prorationMethod: HcPayrollProrationMethod;
  isTaxableBenefit: boolean;
  showOnSlip: boolean;
  sortOrder: number;
  formulaExpression: string | null;
  notes: string | null;
  isActive: boolean;
};

export type EmployeePayrollComponentRow = {
  id: string;
  userId: string;
  componentId: string;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  amount: number | null;
  rate: number | null;
  quantity: number | null;
  calculationBase: string | null;
  metadata: Record<string, unknown> | null;
  remarks: string | null;
};

export type PayrollPeriodRow = {
  id: string;
  periodYear: number;
  periodMonth: number;
  startDate: Date;
  endDate: Date;
  payrollDate: Date;
  status: HcPayrollPeriodStatus;
  notes: string | null;
};

export type PayrollRunRow = {
  id: string;
  periodId: string;
  runType: "regular" | "thr" | "bonus" | "correction";
  status: HcPayrollRunStatus;
  triggeredByUserId: string;
  finalizedByUserId: string | null;
  finalizedAt: Date | null;
  notes: string | null;
};

export type PayrollSlipLineRow = {
  id: string;
  runId: string;
  userId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  category: HcPayrollComponentCategory;
  paidBy: HcPayrollPaidBy;
  amount: number;
  rate: number | null;
  quantity: number | null;
  displayOrder: number;
  calculationSnapshot: Record<string, unknown> | null;
};

export type PayrollRepository = {
  listComponents(input: {
    category?: HcPayrollComponentCategory;
    isActive?: boolean;
    skip: number;
    take: number;
  }): Promise<PayrollComponentRow[]>;
  countComponents(input: {
    category?: HcPayrollComponentCategory;
    isActive?: boolean;
  }): Promise<number>;
  upsertComponent(input: PayrollComponentRow): Promise<PayrollComponentRow>;
  assignEmployeeComponent(input: EmployeePayrollComponentRow): Promise<EmployeePayrollComponentRow>;
  openPeriod(input: PayrollPeriodRow): Promise<PayrollPeriodRow>;
  createRun(input: PayrollRunRow): Promise<PayrollRunRow>;
  replaceSlipLines(input: {
    runId: string;
    userId: string;
    lines: PayrollSlipLineRow[];
  }): Promise<void>;
  getSlipLines(input: {
    runId: string;
    userId: string;
  }): Promise<PayrollSlipLineRow[]>;
};
