import { postRouter } from "@/server/api/routers/post";
import { departmentRouter } from "@/server/api/routers/department";
import { userRouter } from "@/server/api/routers/user";
import { travelRequestRouter } from "@/server/api/routers/travelRequest";
import { approvalRouter } from "@/server/api/routers/approval";
import { claimRouter } from "@/server/api/routers/claim";
import { attachmentRouter } from "@/server/api/routers/attachment";
import { notificationRouter } from "@/server/api/routers/notification";
import { auditLogRouter } from "@/server/api/routers/auditLog";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { chartOfAccountRouter } from "@/server/api/routers/chartOfAccount";
import { projectRouter } from "@/server/api/routers/project";
import { bailoutRouter } from "@/server/api/routers/bailout";
import { financeRouter } from "@/server/api/routers/finance";
import { journalTransactionRouter } from "@/server/api/routers/journalTransaction";
import { journalEntryRouter } from "@/server/api/routers/journalEntry";
import { balanceAccountRouter } from "@/server/api/routers/balanceAccount";
import { tenantRouter } from "@/server/api/routers/tenant";
import { crmRouter } from "@/server/api/routers/crm";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  department: departmentRouter,
  user: userRouter,
  travelRequest: travelRequestRouter,
  approval: approvalRouter,
  claim: claimRouter,
  attachment: attachmentRouter,
  notification: notificationRouter,
  auditLog: auditLogRouter,
  dashboard: dashboardRouter,
  chartOfAccount: chartOfAccountRouter,
  project: projectRouter,
  bailout: bailoutRouter,
  finance: financeRouter,
  journalTransaction: journalTransactionRouter,
  journalEntry: journalEntryRouter,
  balanceAccount: balanceAccountRouter,
  tenant: tenantRouter,
  crm: crmRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
