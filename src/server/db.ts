import { env } from "@/env";
import { PrismaClient } from "../../generated/prisma";

const shouldQuietLogs =
  process.env.QUIET_TEST_LOGS === "1" || env.NODE_ENV === "test";

const requiredDelegates = ["crmCustomer", "crmLead", "crmActivity"] as const;

const createPrismaClient = () =>
  new PrismaClient({
    log: shouldQuietLogs
      ? ["error"]
      : env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

function hasRequiredDelegates(client: ReturnType<typeof createPrismaClient>) {
  const candidate = client as ReturnType<typeof createPrismaClient> &
    Record<string, unknown>;
  return requiredDelegates.every((key) => key in candidate);
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

const existingPrisma = globalForPrisma.prisma;

if (
  existingPrisma &&
  env.NODE_ENV !== "production" &&
  !hasRequiredDelegates(existingPrisma)
) {
  void existingPrisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
