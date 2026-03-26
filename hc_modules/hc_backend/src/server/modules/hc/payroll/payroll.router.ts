import {
  payrollComponentListSchema,
  payrollComponentUpsertSchema,
  payrollEmployeeComponentAssignSchema,
  payrollPeriodOpenSchema,
  payrollRunFinalizeSchema,
  payrollRunGenerateSchema,
  payrollSlipGetSchema,
} from "@/server/modules/hc/payroll/payroll.schema";

export const payrollRouterContract = {
  listComponents: payrollComponentListSchema,
  upsertComponent: payrollComponentUpsertSchema,
  assignEmployeeComponent: payrollEmployeeComponentAssignSchema,
  openPeriod: payrollPeriodOpenSchema,
  generateRun: payrollRunGenerateSchema,
  finalizeRun: payrollRunFinalizeSchema,
  getSlip: payrollSlipGetSchema,
};
