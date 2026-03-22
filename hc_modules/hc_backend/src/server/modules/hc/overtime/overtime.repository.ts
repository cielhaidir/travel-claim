import type { HcRequestStatus } from "@/server/modules/hc/shared/hc.types";

export type OvertimeRequestRow = {
  id: string;
  requestNo: string;
  userId: string;
  overtimeDate: Date;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  reason: string;
  status: HcRequestStatus;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
};

export type OvertimeRepository = {
  findActiveUserById(userId: string): Promise<{ id: string } | null>;
  hasApprovedLeaveOnDate(userId: string, overtimeDate: Date): Promise<boolean>;
  create(input: OvertimeRequestRow): Promise<OvertimeRequestRow>;
  findById(id: string): Promise<OvertimeRequestRow | null>;
  update(id: string, patch: Partial<OvertimeRequestRow>): Promise<OvertimeRequestRow>;
  list(input: {
    userId?: string;
    status?: HcRequestStatus;
    startDate?: Date;
    endDate?: Date;
    skip: number;
    take: number;
  }): Promise<OvertimeRequestRow[]>;
  count(input: {
    userId?: string;
    status?: HcRequestStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number>;
  createApprovalLog(input: {
    moduleName: "overtime";
    referenceId: string;
    action: "submit" | "approve" | "reject";
    actorUserId: string;
    notes?: string;
  }): Promise<void>;
};
