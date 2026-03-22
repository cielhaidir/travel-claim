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
