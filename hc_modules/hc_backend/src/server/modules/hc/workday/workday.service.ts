import type {
  WorkdayBulkUpsertInput,
  WorkdayListByPeriodInput,
  WorkdaySyncImpactedAttendanceInput,
} from "@/server/modules/hc/workday/workday.schema";
import type { WorkdayRepository } from "@/server/modules/hc/workday/workday.repository";
import type { Paginated } from "@/server/modules/hc/shared/hc.types";
import { isWeekend, toDateOnlyUtc } from "@/server/modules/hc/shared/date.util";

export class WorkdayService {
  constructor(private readonly repo: WorkdayRepository) {}

  async bulkUpsert(input: WorkdayBulkUpsertInput) {
    const unique = new Set<string>();
    for (const item of input.items) {
      const key = toDateOnlyUtc(item.workDate).toISOString().slice(0, 10);
      if (unique.has(key)) throw new Error(`Duplicate date in payload: ${key}`);
      unique.add(key);
    }

    return this.repo.bulkUpsert(
      input.items.map((item) => ({
        workDate: toDateOnlyUtc(item.workDate),
        isWorkday: item.isWorkday,
        workType: item.workType,
        description: item.description ?? null,
      })),
    );
  }

  async listByPeriod(input: WorkdayListByPeriodInput): Promise<Paginated<Awaited<ReturnType<WorkdayRepository["bulkUpsert"]>>[number]>> {
    if (input.endDate < input.startDate) throw new Error("endDate must be >= startDate");
    const skip = (input.page - 1) * input.pageSize;

    const [data, total] = await Promise.all([
      this.repo.list({
        startDate: toDateOnlyUtc(input.startDate),
        endDate: toDateOnlyUtc(input.endDate),
        isWorkday: input.isWorkday,
        skip,
        take: input.pageSize,
      }),
      this.repo.count({
        startDate: toDateOnlyUtc(input.startDate),
        endDate: toDateOnlyUtc(input.endDate),
        isWorkday: input.isWorkday,
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

  async syncImpactedAttendance(input: WorkdaySyncImpactedAttendanceInput): Promise<{ updated: number }> {
    if (input.endDate < input.startDate) throw new Error("endDate must be >= startDate");

    const startDate = toDateOnlyUtc(input.startDate);
    const endDate = toDateOnlyUtc(input.endDate);

    const [workdays, attendanceRows] = await Promise.all([
      this.repo.listWorkdaysInRange(startDate, endDate),
      this.repo.listAttendanceInRange(startDate, endDate),
    ]);

    const map = new Map(workdays.map((w) => [w.workDate.toISOString().slice(0, 10), w.isWorkday]));
    let updated = 0;

    for (const row of attendanceRows) {
      const key = row.attendanceDate.toISOString().slice(0, 10);
      const isWorkday = map.has(key) ? map.get(key)! : !isWeekend(row.attendanceDate);

      if (!isWorkday && row.attendanceStatus === "absent") {
        await this.repo.updateAttendanceStatus(row.id, "holiday");
        updated += 1;
      }

      if (isWorkday && row.attendanceStatus === "holiday" && !row.checkInAt && !row.checkOutAt) {
        await this.repo.updateAttendanceStatus(row.id, "absent");
        updated += 1;
      }
    }

    return { updated };
  }
}
