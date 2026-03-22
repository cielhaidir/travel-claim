import type {
  LeaveApproveInput,
  LeaveListInput,
  LeaveRejectInput,
  LeaveSubmitInput,
} from "@/server/modules/hc/leave/leave.schema";
import type { LeaveRepository } from "@/server/modules/hc/leave/leave.repository";
import type { Paginated } from "@/server/modules/hc/shared/hc.types";
import { enumerateDateRange, isWeekend } from "@/server/modules/hc/shared/date.util";

const DEFAULT_ANNUAL_QUOTA = 12;

function genRequestNo(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LV-${y}${m}${d}-${r}`;
}

export class LeaveService {
  constructor(private readonly repo: LeaveRepository) {}

  private async calcEffectiveDays(startDate: Date, endDate: Date): Promise<number> {
    const dates = enumerateDateRange(startDate, endDate);
    const workdays = await this.repo.listWorkdays(startDate, endDate);
    const map = new Map(workdays.map((w) => [w.workDate.toISOString().slice(0, 10), w.isWorkday]));

    let days = 0;
    for (const date of dates) {
      const key = date.toISOString().slice(0, 10);
      const isWorkday = map.has(key) ? map.get(key)! : !isWeekend(date);
      if (isWorkday) days += 1;
    }

    return days;
  }

  async submit(input: LeaveSubmitInput) {
    if (input.endDate < input.startDate) throw new Error("endDate must be >= startDate");
    const user = await this.repo.findActiveUserById(input.userId);
    if (!user) throw new Error("User not found or inactive");

    const effectiveDays = await this.calcEffectiveDays(input.startDate, input.endDate);
    if (effectiveDays <= 0) throw new Error("No effective leave day in selected range");

    const conflicts = await this.repo.listConflicts(input.userId, input.startDate, input.endDate);
    if (conflicts.length > 0) throw new Error("Conflicting leave request exists");

    if (input.leaveType === "annual") {
      const used = await this.repo.sumApprovedAnnualLeave(input.userId, input.startDate.getUTCFullYear());
      const remaining = DEFAULT_ANNUAL_QUOTA - used;
      if (effectiveDays > remaining) throw new Error(`Annual quota exceeded. Remaining: ${remaining}`);
    }

    const row = await this.repo.create({
      id: crypto.randomUUID(),
      requestNo: genRequestNo(new Date()),
      userId: input.userId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: effectiveDays,
      reason: input.reason ?? null,
      status: "submitted",
      approvedByUserId: null,
      approvedAt: null,
      rejectionReason: null,
    });

    await this.repo.createApprovalLog({
      moduleName: "leave",
      referenceId: row.id,
      action: "submit",
      actorUserId: input.userId,
      notes: "Leave submitted",
    });

    return row;
  }

  async approve(input: LeaveApproveInput) {
    const request = await this.repo.findById(input.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "submitted") throw new Error("Only submitted request can be approved");

    if (request.leaveType === "annual") {
      const used = await this.repo.sumApprovedAnnualLeave(request.userId, request.startDate.getUTCFullYear());
      const remaining = DEFAULT_ANNUAL_QUOTA - used;
      if (request.totalDays > remaining) throw new Error(`Annual quota exceeded. Remaining: ${remaining}`);
    }

    const updated = await this.repo.update(request.id, {
      status: "approved",
      approvedByUserId: input.approverId,
      approvedAt: new Date(),
      rejectionReason: null,
    });

    const dates = enumerateDateRange(request.startDate, request.endDate);
    for (const date of dates) {
      await this.repo.upsertAttendanceLeave(request.userId, date);
    }

    await this.repo.createApprovalLog({
      moduleName: "leave",
      referenceId: updated.id,
      action: "approve",
      actorUserId: input.approverId,
      notes: input.notes,
    });

    return updated;
  }

  async reject(input: LeaveRejectInput) {
    const request = await this.repo.findById(input.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "submitted") throw new Error("Only submitted request can be rejected");

    const updated = await this.repo.update(request.id, {
      status: "rejected",
      rejectionReason: input.rejectionReason,
    });

    await this.repo.createApprovalLog({
      moduleName: "leave",
      referenceId: updated.id,
      action: "reject",
      actorUserId: input.approverId,
      notes: input.rejectionReason,
    });

    return updated;
  }

  async list(input: LeaveListInput): Promise<Paginated<Awaited<ReturnType<LeaveRepository["findById"]>> extends infer T ? Exclude<T, null> : never>> {
    const skip = (input.page - 1) * input.pageSize;

    const [data, total] = await Promise.all([
      this.repo.list({
        userId: input.userId,
        leaveType: input.leaveType,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        skip,
        take: input.pageSize,
      }),
      this.repo.count({
        userId: input.userId,
        leaveType: input.leaveType,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
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
}
