import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  NotificationChannel,
  NotificationStatus,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "@/server/api/trpc";

export const notificationRouter = createTRPCRouter({
  // Get user's notifications
  getMy: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/notifications/my',
        protect: true,
        tags: ['Notifications'],
        summary: 'Get my notifications',
      }
    })
    .input(
      z.object({
        status: z.nativeEnum(NotificationStatus).optional(),
        channel: z.nativeEnum(NotificationChannel).optional(),
        unreadOnly: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        userId: ctx.session.user.id,
      };

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.channel) {
        where.channel = input.channel;
      }

      if (input?.unreadOnly) {
        where.readAt = null;
      }

      const notifications = await ctx.db.notification.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (notifications.length > limit) {
        const nextItem = notifications.pop();
        nextCursor = nextItem!.id;
      }

      return {
        notifications,
        nextCursor,
      };
    }),

  // Get unread count
  getUnreadCount: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/notifications/unread-count',
        protect: true,
        tags: ['Notifications'],
        summary: 'Get unread count',
      }
    })
    .input(z.object({}))
    .output(z.number())
    .query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: {
        userId: ctx.session.user.id,
        readAt: null,
      },
    });
  }),

  // Get notification by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/notifications/{id}',
        protect: true,
        tags: ['Notifications'],
        summary: 'Get notification by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      // Only user can view their own notifications
      if (notification.userId !== ctx.session.user.id && ctx.session.user.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this notification",
        });
      }

      return notification;
    }),

  // Create notification (admin only, typically called by system)
  create: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/notifications',
        protect: true,
        tags: ['Notifications'],
        summary: 'Create notification',
      }
    })
    .input(
      z.object({
        userId: z.string(),
        title: z.string(),
        message: z.string(),
        channel: z.nativeEnum(NotificationChannel),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        actionUrl: z.string().optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
        templateId: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Verify user exists
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const notification = await ctx.db.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          message: input.message,
          channel: input.channel,
          entityType: input.entityType,
          entityId: input.entityId,
          actionUrl: input.actionUrl,
          priority: input.priority ?? "NORMAL",
          templateId: input.templateId,
        },
      });

      // TODO: Queue notification for delivery based on channel

      return notification;
    }),

  // Batch create notifications
  createBatch: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/notifications/batch',
        protect: true,
        tags: ['Notifications'],
        summary: 'Batch create notifications',
      }
    })
    .input(
      z.object({
        userIds: z.array(z.string()),
        title: z.string(),
        message: z.string(),
        channel: z.nativeEnum(NotificationChannel),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        actionUrl: z.string().optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
      })
    )
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userIds, ...notificationData } = input;

      // Verify all users exist
      const users = await ctx.db.user.findMany({
        where: {
          id: { in: userIds },
          deletedAt: null,
        },
      });

      if (users.length !== userIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some users not found",
        });
      }

      // Create notifications
      const created = await ctx.db.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          ...notificationData,
        })),
      });

      // TODO: Queue notifications for delivery

      return {
        count: created.count,
      };
    }),

  // Mark notification as read
  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({
        where: { id: input.id },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      if (notification.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to modify this notification",
        });
      }

      return ctx.db.notification.update({
        where: { id: input.id },
        data: {
          readAt: new Date(),
        },
      });
    }),

  // Mark all notifications as read
  markAllAsRead: protectedProcedure
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx }) => {
    const updated = await ctx.db.notification.updateMany({
      where: {
        userId: ctx.session.user.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      count: updated.count,
    };
  }),

  // Mark multiple notifications as read
  markManyAsRead: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      })
    )
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify all notifications belong to user
      const notifications = await ctx.db.notification.findMany({
        where: {
          id: { in: input.ids },
        },
      });

      const unauthorized = notifications.some(
        (n) => n.userId !== ctx.session.user.id
      );

      if (unauthorized) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to modify some notifications",
        });
      }

      const updated = await ctx.db.notification.updateMany({
        where: {
          id: { in: input.ids },
          userId: ctx.session.user.id,
        },
        data: {
          readAt: new Date(),
        },
      });

      return {
        count: updated.count,
      };
    }),

  // Delete notification (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({
        where: { id: input.id },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      if (notification.userId !== ctx.session.user.id && ctx.session.user.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this notification",
        });
      }

      // For notifications, we typically do a hard delete rather than soft delete
      return ctx.db.notification.delete({
        where: { id: input.id },
      });
    }),

  // Delete all read notifications
  deleteAllRead: protectedProcedure
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx }) => {
    const deleted = await ctx.db.notification.deleteMany({
      where: {
        userId: ctx.session.user.id,
        readAt: { not: null },
      },
    });

    return {
      count: deleted.count,
    };
  }),

  // Update notification status (for system tracking)
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(NotificationStatus),
        sentAt: z.coerce.date().optional(),
        deliveredAt: z.coerce.date().optional(),
        failedAt: z.coerce.date().optional(),
        errorMessage: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const notification = await ctx.db.notification.findUnique({
        where: { id },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      return ctx.db.notification.update({
        where: { id },
        data: updateData,
      });
    }),

  // Get notification statistics (admin)
  getStatistics: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        channel: z.nativeEnum(NotificationChannel).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {};

      if (input?.channel) {
        where.channel = input.channel;
      }

      if (input?.startDate || input?.endDate) {
        where.AND = [];
        if (input.startDate) {
          where.AND.push({ createdAt: { gte: input.startDate } });
        }
        if (input.endDate) {
          where.AND.push({ createdAt: { lte: input.endDate } });
        }
      }

      const [total, byStatus, byChannel, byPriority] = await Promise.all([
        ctx.db.notification.count({ where }),
        ctx.db.notification.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        ctx.db.notification.groupBy({
          by: ["channel"],
          where,
          _count: true,
        }),
        ctx.db.notification.groupBy({
          by: ["priority"],
          where,
          _count: true,
        }),
      ]);

      const readCount = await ctx.db.notification.count({
        where: {
          ...where,
          readAt: { not: null },
        },
      });

      return {
        total,
        readCount,
        unreadCount: total - readCount,
        byStatus: byStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        byChannel: byChannel.map((item) => ({
          channel: item.channel,
          count: item._count,
        })),
        byPriority: byPriority.map((item) => ({
          priority: item.priority,
          count: item._count,
        })),
      };
    }),

  // Resend failed notification
  resend: adminProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({
        where: { id: input.id },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      if (notification.status !== NotificationStatus.FAILED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only resend failed notifications",
        });
      }

      // Reset notification status
      const updated = await ctx.db.notification.update({
        where: { id: input.id },
        data: {
          status: NotificationStatus.PENDING,
          failedAt: null,
          errorMessage: null,
        },
      });

      // TODO: Queue notification for redelivery

      return updated;
    }),
});