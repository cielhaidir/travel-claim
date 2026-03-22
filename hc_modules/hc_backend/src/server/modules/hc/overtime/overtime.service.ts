import type {
  OvertimeApproveInput,
  OvertimeListInput,
  OvertimeRejectInput,
  OvertimeSubmitInput,
} from "@/server/modules/hc/overtime/overtime.schema";
import type { OvertimeRepository } from "@/server/modules/hc/overtime/overtime.repository";
import type { Paginated } from "@/server/modules/hc/shared/hc.types";

function genRequestNo(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `OT-${y}${m}${d}-${r}`;
}

export class OvertimeService {
  constructor(private readonly repo: OvertimeRepository) {}

  async submit(input: OvertimeSubmitInput) {
    if (input.endTime <= input.startTime) throw new Error("endTime must be after startTime");
    const user = await this.repo.findActiveUserById(input.userId);
    if (!user) throw new Error("User not found or inactive");

    const onLeave = await this.repo.hasApprovedLeaveOnDate(input.userId, input.overtimeDate);
    if (onLeave) throw new Error("Cannot submit overtime while on approved leave");

    const durationMinutes = Math.floor((input.endTime.getTime() - input.startTime.getTime()) / 60000);
    if (durationMinutes <= 0) throw new Error("Duration must be greater than 0");

    const row = await this.repo.create({
      id: crypto.randomUUID(),
      requestNo: genRequestNo(new Date()),
      userId: input.userId,
      overtimeDate: input.overtimeDate,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes,
      reason: input.reason,
      status: "submitted",
      approvedByUserId: null,
      approvedAt: null,
      rejectionReason: null,
    });

    await this.repo.createApprovalLog({
      moduleName: "overtime",
      referenceId: row.id,
      action: "submit",
      actorUserId: input.userId,
      notes: "Overtime submitted",
    });

    return row;
  }

  async approve(input: OvertimeApproveInput) {
    const request = await this.repo.findById(input.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "submitted") throw new Error("Only submitted request can be approved");

    const updated = await this.repo.update(request.id, {
      status: "approved",
      approvedByUserId: input.approverId,
      approvedAt: new Date(),
      rejectionReason: null,
    });

    await this.repo.createApprovalLog({
      moduleName: "overtime",
      referenceId: updated.id,
      action: "approve",
      actorUserId: input.approverId,
      notes: input.notes,
    });

    return updated;
  }

  async reject(input: OvertimeRejectInput) {
    const request = await this.repo.findById(input.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "submitted") throw new Error("Only submitted request can be rejected");

    const updated = await this.repo.update(request.id, {
      status: "rejected",
      rejectionReason: input.rejectionReason,
    });

    await this.repo.createApprovalLog({
      moduleName: "overtime",
      referenceId: updated.id,
      action: "reject",
      actorUserId: input.approverId,
      notes: input.rejectionReason,
    });

    return updated;
  }

  async list(input: OvertimeListInput): Promise<Paginated<Awaited<ReturnType<OvertimeRepository["findById"]>> extends infer T ? Exclude<T, null> : never>> {
    const skip = (input.page - 1) * input.pageSize;
    const [data, total] = await Promise.all([
      this.repo.list({
        userId: input.userId,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        skip,
        take: input.pageSize,
      }),
      this.repo.count({
        userId: input.userId,
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
