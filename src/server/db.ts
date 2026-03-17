import { env } from "@/env";
import { PrismaClient } from "../../generated/prisma";

const shouldQuietLogs =
  process.env.QUIET_TEST_LOGS === "1" || env.NODE_ENV === "test";

const createPrismaClient = () =>
  new PrismaClient({
    log: shouldQuietLogs
      ? ["error"]
      : env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
