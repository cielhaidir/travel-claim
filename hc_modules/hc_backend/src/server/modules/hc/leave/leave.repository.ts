import type { HcLeaveType, HcRequestStatus } from "@/server/modules/hc/shared/hc.types";

export type LeaveRequestRow = {
  id: string;
  requestNo: string;
  userId: string;
  leaveType: HcLeaveType;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string | null;
  status: HcRequestStatus;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
};

export type LeaveRepository = {
  findActiveUserById(userId: string): Promise<{ id: string } | null>;
  findById(id: string): Promise<LeaveRequestRow | null>;
  listWorkdays(startDate: Date, endDate: Date): Promise<Array<{ workDate: Date; isWorkday: boolean }>>;
  listConflicts(userId: string, startDate: Date, endDate: Date): Promise<LeaveRequestRow[]>;
  sumApprovedAnnualLeave(userId: string, year: number): Promise<number>;
  create(input: LeaveRequestRow): Promise<LeaveRequestRow>;
  update(id: string, patch: Partial<LeaveRequestRow>): Promise<LeaveRequestRow>;
  upsertAttendanceLeave(userId: string, date: Date): Promise<void>;
  list(input: {
    userId?: string;
    leaveType?: HcLeaveType;
    status?: HcRequestStatus;
    startDate?: Date;
    endDate?: Date;
    skip: number;
    take: number;
  }): Promise<LeaveRequestRow[]>;
  count(input: {
    userId?: string;
    leaveType?: HcLeaveType;
    status?: HcRequestStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number>;
  createApprovalLog(input: {
    moduleName: "leave";
    referenceId: string;
    action: "submit" | "approve" | "reject";
    actorUserId: string;
    notes?: string;
  }): Promise<void>;
};
