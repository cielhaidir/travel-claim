import { z } from "zod";

const payrollComponentCategoryEnum = z.enum(["earning", "deduction", "employer_cost", "benefit"]);
const payrollCalculationMethodEnum = z.enum(["fixed", "percentage", "manual", "formula"]);
const payrollPaidByEnum = z.enum(["employee", "company", "shared"]);
const payrollTaxTreatmentEnum = z.enum(["taxable", "non_taxable", "tax_deduction", "informational"]);
const payrollPeriodStatusEnum = z.enum(["open", "processing", "finalized", "cancelled"]);
const payrollRunStatusEnum = z.enum(["draft", "calculated", "posted", "cancelled"]);
const payrollProrationMethodEnum = z.enum(["calendar_day", "workday", "none"]);

export const payrollComponentListSchema = z.object({
  category: payrollComponentCategoryEnum.optional(),
  isActive: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const payrollComponentUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(150),
  category: payrollComponentCategoryEnum,
  calculationMethod: payrollCalculationMethodEnum,
  paidBy: payrollPaidByEnum,
  taxTreatment: payrollTaxTreatmentEnum,
  defaultRate: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).default("IDR"),
  isProrated: z.boolean().default(false),
  prorationMethod: payrollProrationMethodEnum.default("none"),
  isTaxableBenefit: z.boolean().default(false),
  showOnSlip: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  formulaExpression: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

export const payrollEmployeeComponentAssignSchema = z.object({
  userId: z.string().min(1),
  componentId: z.string().uuid(),
  effectiveStartDate: z.coerce.date(),
  effectiveEndDate: z.coerce.date().optional(),
  amount: z.number().min(0).optional(),
  rate: z.number().min(0).max(100).optional(),
  quantity: z.number().min(0).optional(),
  calculationBase: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  remarks: z.string().max(1000).optional(),
});

export const payrollPeriodOpenSchema = z.object({
  periodYear: z.number().int().min(2000).max(9999),
  periodMonth: z.number().int().min(1).max(12),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  payrollDate: z.coerce.date(),
  status: payrollPeriodStatusEnum.default("open"),
  notes: z.string().max(1000).optional(),
});

export const payrollRunGenerateSchema = z.object({
  periodId: z.string().uuid(),
  runType: z.enum(["regular", "thr", "bonus", "correction"]).default("regular"),
  userIds: z.array(z.string().min(1)).min(1).optional(),
  includeAttendanceDeduction: z.boolean().default(true),
  includeOvertime: z.boolean().default(true),
  includeLeaveDeduction: z.boolean().default(true),
  recalculateExisting: z.boolean().default(false),
  triggeredByUserId: z.string().min(1),
});

export const payrollRunFinalizeSchema = z.object({
  runId: z.string().uuid(),
  finalizedByUserId: z.string().min(1),
  status: payrollRunStatusEnum.default("posted"),
  notes: z.string().max(1000).optional(),
});

export const payrollSlipGetSchema = z.object({
  runId: z.string().uuid(),
  userId: z.string().min(1),
});

export type PayrollComponentListInput = z.infer<typeof payrollComponentListSchema>;
export type PayrollComponentUpsertInput = z.infer<typeof payrollComponentUpsertSchema>;
export type PayrollEmployeeComponentAssignInput = z.infer<typeof payrollEmployeeComponentAssignSchema>;
export type PayrollPeriodOpenInput = z.infer<typeof payrollPeriodOpenSchema>;
export type PayrollRunGenerateInput = z.infer<typeof payrollRunGenerateSchema>;
export type PayrollRunFinalizeInput = z.infer<typeof payrollRunFinalizeSchema>;
export type PayrollSlipGetInput = z.infer<typeof payrollSlipGetSchema>;
