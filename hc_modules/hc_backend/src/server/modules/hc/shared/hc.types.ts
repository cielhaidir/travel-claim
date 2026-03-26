export type HcRequestStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type HcLeaveType = "annual" | "sick" | "unpaid" | "maternity" | "paternity" | "special";
export type HcAttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "leave"
  | "holiday"
  | "sick"
  | "remote";
export type HcAttendanceSource = "mobile" | "web" | "machine" | "import";
export type HcWorkType = "regular" | "weekend" | "holiday" | "collective_leave";
export type HcPayrollComponentCategory = "earning" | "deduction" | "employer_cost" | "benefit";
export type HcPayrollCalculationMethod = "fixed" | "percentage" | "manual" | "formula";
export type HcPayrollPaidBy = "employee" | "company" | "shared";
export type HcPayrollTaxTreatment = "taxable" | "non_taxable" | "tax_deduction" | "informational";
export type HcPayrollPeriodStatus = "open" | "processing" | "finalized" | "cancelled";
export type HcPayrollRunStatus = "draft" | "calculated" | "posted" | "cancelled";
export type HcPayrollProrationMethod = "calendar_day" | "workday" | "none";

export type PaginationInput = {
  page: number;
  pageSize: number;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
