import { z } from "zod";
import {
  TravelStatus,
  ClaimStatus,
  ApprovalStatus,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
  financeProcedure,
} from "@/server/api/trpc";

export const dashboardRouter = createTRPCRouter({
  // Get user dashboard statistics
  getMyDashboard: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/dashboard/my',
        protect: true,
        tags: ['Dashboard'],
        summary: 'Get my dashboard statistics',
      }
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get counts in parallel
    const [
      myTravelRequests,
      myClaims,
      pendingApprovals,
      unreadNotifications,
      myTeamTravelRequests,
    ] = await Promise.all([
      // My travel requests count by status
      ctx.db.travelRequest.groupBy({
        by: ["status"],
        where: {
          requesterId: userId,
          deletedAt: null,
        },
        _count: true,
      }),
      // My claims count by status
      ctx.db.claim.groupBy({
        by: ["status"],
        where: {
          submitterId: userId,
          deletedAt: null,
        },
        _count: true,
      }),
      // Pending approvals for me
      ctx.db.approval.count({
        where: {
          approverId: userId,
          status: ApprovalStatus.PENDING,
        },
      }),
      // Unread notifications
      ctx.db.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
      // Team travel requests (if supervisor)
      ctx.db.travelRequest.count({
        where: {
          requester: {
            supervisorId: userId,
          },
          status: {
            in: [TravelStatus.DRAFT, TravelStatus.SUBMITTED],
          },
          deletedAt: null,
        },
      }),
    ]);

    // Get recent travel requests
    const recentTravelRequests = await ctx.db.travelRequest.findMany({
      take: 5,
      where: {
        requesterId: userId,
        deletedAt: null,
      },
      include: {
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get recent claims
    const recentClaims = await ctx.db.claim.findMany({
      take: 5,
      where: {
        submitterId: userId,
        deletedAt: null,
      },
      include: {
        travelRequest: {
          select: {
            requestNumber: true,
            destination: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      travelRequests: {
        total: myTravelRequests.reduce((sum, item) => sum + item._count, 0),
        byStatus: myTravelRequests.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        recent: recentTravelRequests,
      },
      claims: {
        total: myClaims.reduce((sum, item) => sum + item._count, 0),
        byStatus: myClaims.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        recent: recentClaims,
      },
      approvals: {
        pending: pendingApprovals,
      },
      notifications: {
        unread: unreadNotifications,
      },
      team: {
        pendingRequests: myTeamTravelRequests,
      },
    };
  }),

  // Get manager dashboard
  getManagerDashboard: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/dashboard/manager',
        protect: true,
        tags: ['Dashboard'],
        summary: 'Get manager dashboard statistics',
      }
    })
    .input(
      z.object({
        departmentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null,
      };

      // Filter by department if provided
      if (input?.departmentId) {
        where.requester = {
          departmentId: input.departmentId,
        };
      }

      // Get various statistics in parallel
      const [
        travelRequestsByStatus,
        claimsByStatus,
        pendingApprovals,
        recentActivity,
        topSpenders,
        monthlyTrend,
      ] = await Promise.all([
        // Travel requests by status
        ctx.db.travelRequest.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        // Claims by status
        ctx.db.claim.groupBy({
          by: ["status"],
          where: input?.departmentId
            ? {
                submitter: {
                  departmentId: input.departmentId,
                },
                deletedAt: null,
              }
            : { deletedAt: null },
          _count: true,
        }),
        // Pending approvals count
        ctx.db.approval.count({
          where: {
            status: ApprovalStatus.PENDING,
          },
        }),
        // Recent travel requests
        ctx.db.travelRequest.findMany({
          take: 10,
          where,
          include: {
            requester: {
              select: {
                id: true,
                name: true,
                email: true,
                department: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        // Top spenders (users with highest total claims)
        ctx.db.claim.groupBy({
          by: ["submitterId"],
          where: {
            status: ClaimStatus.PAID,
            ...(input?.departmentId && {
              submitter: {
                departmentId: input.departmentId,
              },
            }),
          },
          _sum: {
            amount: true,
          },
          orderBy: {
            _sum: {
              amount: "desc",
            },
          },
          take: 10,
        }),
        // Monthly trend (last 6 months)
        ctx.db.travelRequest.findMany({
          where: {
            ...where,
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
            },
          },
          select: {
            createdAt: true,
            status: true,
          },
        }),
      ]);

      // Get user details for top spenders
      const spenderIds = topSpenders.map((s) => s.submitterId);
      const spenderUsers = await ctx.db.user.findMany({
        where: {
          id: { in: spenderIds },
        },
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          department: {
            select: {
              name: true,
            },
          },
        },
      });

      const topSpendersWithDetails = topSpenders.map((spender) => {
        const user = spenderUsers.find((u) => u.id === spender.submitterId);
        return {
          userId: spender.submitterId,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email,
          employeeId: user?.employeeId,
          department: user?.department?.name,
          totalAmount: spender._sum.amount ?? 0,
        };
      });

      // Calculate monthly trend
      const monthlyData = new Map<string, { submitted: number; approved: number }>();
      monthlyTrend.forEach((request) => {
        const month = request.createdAt.toISOString().slice(0, 7); // YYYY-MM
        if (!monthlyData.has(month)) {
          monthlyData.set(month, { submitted: 0, approved: 0 });
        }
        const data = monthlyData.get(month)!;
        data.submitted += 1;
        if (request.status === TravelStatus.APPROVED) {
          data.approved += 1;
        }
      });

      const monthlyTrendArray = Array.from(monthlyData.entries())
        .map(([month, data]) => ({
          month,
          ...data,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        travelRequests: {
          total: travelRequestsByStatus.reduce((sum, item) => sum + item._count, 0),
          byStatus: travelRequestsByStatus.map((item) => ({
            status: item.status,
            count: item._count,
          })),
        },
        claims: {
          total: claimsByStatus.reduce((sum, item) => sum + item._count, 0),
          byStatus: claimsByStatus.map((item) => ({
            status: item.status,
            count: item._count,
          })),
        },
        approvals: {
          pending: pendingApprovals,
        },
        recentActivity,
        topSpenders: topSpendersWithDetails,
        monthlyTrend: monthlyTrendArray,
      };
    }),

  // Get finance dashboard
  getFinanceDashboard: financeProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/dashboard/finance',
        protect: true,
        tags: ['Dashboard'],
        summary: 'Get finance dashboard statistics',
      }
    })
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const dateFilter: any = {};
      if (input?.startDate || input?.endDate) {
        dateFilter.createdAt = {};
        if (input.startDate) {
          dateFilter.createdAt.gte = input.startDate;
        }
        if (input.endDate) {
          dateFilter.createdAt.lte = input.endDate;
        }
      }

      // Get financial statistics
      const [
        claimsByStatus,
        totalApprovedAmount,
        totalPaidAmount,
        claimsByType,
        claimsByDepartment,
        pendingPayments,
        recentPaidClaims,
      ] = await Promise.all([
        // Claims by status
        ctx.db.claim.groupBy({
          by: ["status"],
          where: {
            deletedAt: null,
            ...dateFilter,
          },
          _count: true,
          _sum: {
            amount: true,
          },
        }),
        // Total approved amount
        ctx.db.claim.aggregate({
          where: {
            status: ClaimStatus.APPROVED,
            deletedAt: null,
            ...dateFilter,
          },
          _sum: {
            amount: true,
          },
        }),
        // Total paid amount
        ctx.db.claim.aggregate({
          where: {
            status: ClaimStatus.PAID,
            deletedAt: null,
            ...dateFilter,
          },
          _sum: {
            amount: true,
          },
        }),
        // Claims by type
        ctx.db.claim.groupBy({
          by: ["claimType"],
          where: {
            deletedAt: null,
            ...dateFilter,
          },
          _count: true,
          _sum: {
            amount: true,
          },
        }),
        // Claims by department
        ctx.db.claim.groupBy({
          by: ["submitterId"],
          where: {
            status: ClaimStatus.PAID,
            deletedAt: null,
            ...dateFilter,
          },
          _sum: {
            amount: true,
          },
        }),
        // Pending payments
        ctx.db.claim.findMany({
          where: {
            status: ClaimStatus.APPROVED,
            deletedAt: null,
          },
          include: {
            submitter: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
                department: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            travelRequest: {
              select: {
                requestNumber: true,
                destination: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        }),
        // Recent paid claims
        ctx.db.claim.findMany({
          take: 10,
          where: {
            status: ClaimStatus.PAID,
            deletedAt: null,
          },
          include: {
            submitter: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
              },
            },
            travelRequest: {
              select: {
                requestNumber: true,
                destination: true,
              },
            },
          },
          orderBy: {
            paidAt: "desc",
          },
        }),
      ]);

      // Calculate department spending
      const submitterIds = claimsByDepartment.map((c) => c.submitterId);
      const submitters = await ctx.db.user.findMany({
        where: {
          id: { in: submitterIds },
        },
        select: {
          id: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const departmentSpending = new Map<string, { name: string; amount: number }>();
      claimsByDepartment.forEach((claim) => {
        const user = submitters.find((u) => u.id === claim.submitterId);
        if (user?.department) {
          const existing = departmentSpending.get(user.department.id);
          const amount = claim._sum.amount ?? 0;
          if (existing) {
            existing.amount += Number(amount);
          } else {
            departmentSpending.set(user.department.id, {
              name: user.department.name,
              amount: Number(amount),
            });
          }
        }
      });

      const departmentSpendingArray = Array.from(departmentSpending.entries())
        .map(([id, data]) => ({
          departmentId: id,
          departmentName: data.name,
          totalAmount: data.amount,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      return {
        overview: {
          totalApproved: totalApprovedAmount._sum.amount ?? 0,
          totalPaid: totalPaidAmount._sum.amount ?? 0,
          pendingPayment: Number(totalApprovedAmount._sum.amount ?? 0) - Number(totalPaidAmount._sum.amount ?? 0),
        },
        claims: {
          byStatus: claimsByStatus.map((item) => ({
            status: item.status,
            count: item._count,
            amount: item._sum.amount ?? 0,
          })),
          byType: claimsByType.map((item) => ({
            type: item.claimType,
            count: item._count,
            amount: item._sum.amount ?? 0,
          })),
        },
        departmentSpending: departmentSpendingArray,
        pendingPayments: {
          count: pendingPayments.length,
          total: pendingPayments.reduce((sum, claim) => sum + Number(claim.amount), 0),
          claims: pendingPayments,
        },
        recentPayments: recentPaidClaims,
      };
    }),

  // Get analytics - Travel trends
  getTravelTrends: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/dashboard/travel-trends',
        protect: true,
        tags: ['Dashboard'],
        summary: 'Get travel trends analytics',
      }
    })
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        departmentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null,
        createdAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      };

      if (input.departmentId) {
        where.requester = {
          departmentId: input.departmentId,
        };
      }

      const [byType, byStatus, byMonth] = await Promise.all([
        // By travel type
        ctx.db.travelRequest.groupBy({
          by: ["travelType"],
          where,
          _count: true,
        }),
        // By status
        ctx.db.travelRequest.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        // By month
        ctx.db.travelRequest.findMany({
          where,
          select: {
            createdAt: true,
            travelType: true,
          },
        }),
      ]);

      // Calculate monthly breakdown
      const monthlyData = new Map<string, Map<string, number>>();
      byMonth.forEach((request) => {
        const month = request.createdAt.toISOString().slice(0, 7);
        if (!monthlyData.has(month)) {
          monthlyData.set(month, new Map());
        }
        const typeMap = monthlyData.get(month)!;
        typeMap.set(request.travelType, (typeMap.get(request.travelType) ?? 0) + 1);
      });

      const monthlyTrend = Array.from(monthlyData.entries())
        .map(([month, types]) => ({
          month,
          ...Object.fromEntries(types),
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        byType: byType.map((item) => ({
          type: item.travelType,
          count: item._count,
        })),
        byStatus: byStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        monthlyTrend,
      };
    }),

  // Get analytics - Expense analysis
  getExpenseAnalysis: financeProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/dashboard/expense-analysis',
        protect: true,
        tags: ['Dashboard'],
        summary: 'Get expense analysis',
      }
    })
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        departmentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null,
        createdAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      };

      if (input.departmentId) {
        where.submitter = {
          departmentId: input.departmentId,
        };
      }

      const [byCategory, averages, totalByMonth] = await Promise.all([
        // Entertainment types
        ctx.db.claim.groupBy({
          by: ["entertainmentType"],
          where: {
            ...where,
            claimType: "ENTERTAINMENT",
            entertainmentType: { not: null },
          },
          _count: true,
          _sum: {
            amount: true,
          },
          _avg: {
            amount: true,
          },
        }),
        // Overall averages
        ctx.db.claim.aggregate({
          where,
          _avg: {
            amount: true,
          },
          _sum: {
            amount: true,
          },
          _count: true,
        }),
        // Total by month
        ctx.db.claim.findMany({
          where,
          select: {
            createdAt: true,
            amount: true,
            claimType: true,
          },
        }),
      ]);

      // Calculate monthly totals
      const monthlyTotals = new Map<string, { entertainment: number; nonEntertainment: number }>();
      totalByMonth.forEach((claim) => {
        const month = claim.createdAt.toISOString().slice(0, 7);
        if (!monthlyTotals.has(month)) {
          monthlyTotals.set(month, { entertainment: 0, nonEntertainment: 0 });
        }
        const data = monthlyTotals.get(month)!;
        if (claim.claimType === "ENTERTAINMENT") {
          data.entertainment += Number(claim.amount);
        } else {
          data.nonEntertainment += Number(claim.amount);
        }
      });

      const monthlyTrend = Array.from(monthlyTotals.entries())
        .map(([month, data]) => ({
          month,
          ...data,
          total: data.entertainment + data.nonEntertainment,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        overview: {
          totalAmount: averages._sum.amount ?? 0,
          averageAmount: averages._avg.amount ?? 0,
          totalClaims: averages._count,
        },
        byCategory: byCategory.map((item) => ({
          category: item.entertainmentType!,
          count: item._count,
          total: item._sum.amount ?? 0,
          average: item._avg.amount ?? 0,
        })),
        monthlyTrend,
      };
    }),
});