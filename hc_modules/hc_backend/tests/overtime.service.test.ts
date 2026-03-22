import test from "node:test";
import assert from "node:assert/strict";
import { OvertimeService } from "../src/server/modules/hc/overtime/overtime.service";
import type { OvertimeRepository, OvertimeRequestRow } from "../src/server/modules/hc/overtime/overtime.repository";

function createRepo() {
  const rows: OvertimeRequestRow[] = [];
  const logs: Array<{ actorUserId: string; action: string }> = [];

  const repo: OvertimeRepository = {
    async findActiveUserById(userId) {
      return userId === "u-1" ? { id: userId } : null;
    },
    async hasApprovedLeaveOnDate() {
      return false;
    },
    async create(input) {
      rows.push(input);
      return input;
    },
    async findById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async update(id, patch) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error("Request not found");
      rows[idx] = { ...rows[idx], ...patch } as OvertimeRequestRow;
      return rows[idx]!;
    },
    async list() {
      return rows;
    },
    async count() {
      return rows.length;
    },
    async createApprovalLog(input) {
      logs.push({ actorUserId: input.actorUserId, action: input.action });
    },
  };

  return { repo, rows, logs };
}

test("overtime submit stores request with userId and logs actorUserId", async () => {
  const { repo, rows, logs } = createRepo();
  const service = new OvertimeService(repo);

  const result = await service.submit({
    userId: "u-1",
    overtimeDate: new Date("2026-03-17T00:00:00.000Z"),
    startTime: new Date("2026-03-17T10:00:00.000Z"),
    endTime: new Date("2026-03-17T12:00:00.000Z"),
    reason: "Deployment support",
  });

  assert.equal(result.userId, "u-1");
  assert.equal(rows[0]?.status, "submitted");
  assert.deepEqual(logs[0], { actorUserId: "u-1", action: "submit" });
});
