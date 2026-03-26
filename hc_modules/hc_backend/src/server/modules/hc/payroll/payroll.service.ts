import type {
  PayrollComponentListInput,
  PayrollComponentUpsertInput,
  PayrollEmployeeComponentAssignInput,
  PayrollPeriodOpenInput,
  PayrollRunFinalizeInput,
  PayrollRunGenerateInput,
  PayrollSlipGetInput,
} from "@/server/modules/hc/payroll/payroll.schema";
import type {
  EmployeePayrollComponentRow,
  PayrollComponentRow,
  PayrollRepository,
} from "@/server/modules/hc/payroll/payroll.repository";
import type { Paginated } from "@/server/modules/hc/shared/hc.types";

function toPayrollComponentRow(input: PayrollComponentUpsertInput): PayrollComponentRow {
  return {
    id: input.id ?? crypto.randomUUID(),
    code: input.code,
    name: input.name,
    category: input.category,
    calculationMethod: input.calculationMethod,
    paidBy: input.paidBy,
    taxTreatment: input.taxTreatment,
    defaultRate: input.defaultRate ?? null,
    currency: input.currency,
    isProrated: input.isProrated,
    prorationMethod: input.prorationMethod,
    isTaxableBenefit: input.isTaxableBenefit,
    showOnSlip: input.showOnSlip,
    sortOrder: input.sortOrder,
    formulaExpression: input.formulaExpression ?? null,
    notes: input.notes ?? null,
    isActive: input.isActive,
  };
}

function toEmployeeComponentRow(input: PayrollEmployeeComponentAssignInput): EmployeePayrollComponentRow {
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    componentId: input.componentId,
    effectiveStartDate: input.effectiveStartDate,
    effectiveEndDate: input.effectiveEndDate ?? null,
    amount: input.amount ?? null,
    rate: input.rate ?? null,
    quantity: input.quantity ?? null,
    calculationBase: input.calculationBase ?? null,
    metadata: input.metadata ?? null,
    remarks: input.remarks ?? null,
  };
}

export class PayrollService {
  constructor(private readonly repo: PayrollRepository) {}

  async listComponents(input: PayrollComponentListInput): Promise<Paginated<PayrollComponentRow>> {
    const skip = (input.page - 1) * input.pageSize;
    const [data, total] = await Promise.all([
      this.repo.listComponents({
        category: input.category,
        isActive: input.isActive,
        skip,
        take: input.pageSize,
      }),
      this.repo.countComponents({
        category: input.category,
        isActive: input.isActive,
      }),
    ]);

    return {
      data,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }

  async upsertComponent(input: PayrollComponentUpsertInput) {
    if (input.calculationMethod === "percentage" && input.defaultRate == null) {
      throw new Error("defaultRate is required for percentage component");
    }

    if (input.calculationMethod === "formula" && !input.formulaExpression) {
      throw new Error("formulaExpression is required for formula component");
    }

    return this.repo.upsertComponent(toPayrollComponentRow(input));
  }

  async assignEmployeeComponent(input: PayrollEmployeeComponentAssignInput) {
    if (input.effectiveEndDate && input.effectiveEndDate < input.effectiveStartDate) {
      throw new Error("effectiveEndDate must be after effectiveStartDate");
    }

    return this.repo.assignEmployeeComponent(toEmployeeComponentRow(input));
  }

  async openPeriod(input: PayrollPeriodOpenInput) {
    if (input.endDate < input.startDate) {
      throw new Error("endDate must be after startDate");
    }

    return this.repo.openPeriod({
      id: crypto.randomUUID(),
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      startDate: input.startDate,
      endDate: input.endDate,
      payrollDate: input.payrollDate,
      status: input.status,
      notes: input.notes ?? null,
    });
  }

  async generateRun(input: PayrollRunGenerateInput) {
    return this.repo.createRun({
      id: crypto.randomUUID(),
      periodId: input.periodId,
      runType: input.runType,
      status: "draft",
      triggeredByUserId: input.triggeredByUserId,
      finalizedByUserId: null,
      finalizedAt: null,
      notes: null,
    });
  }

  async finalizeRun(input: PayrollRunFinalizeInput) {
    return {
      runId: input.runId,
      status: input.status,
      finalizedByUserId: input.finalizedByUserId,
      notes: input.notes,
    };
  }

  async getSlip(input: PayrollSlipGetInput) {
    return this.repo.getSlipLines({
      runId: input.runId,
      userId: input.userId,
    });
  }
}
