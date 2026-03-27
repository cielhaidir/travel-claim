import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  TravelType,
  TravelStatus,
  BailoutStatus,
  ApprovalLevel,
  ApprovalStatus,
  AuditAction,
  type Prisma,
  type TransportMode,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  permissionProcedure,
  supervisorProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import {
  sendWhatsappPoll,
  buildTravelRequestApprovalPoll,
} from "@/lib/utils/whatsapp";
import {
  generateBailoutNumber,
  generateRequestNumber,
} from "@/lib/utils/numberGenerators";

function applyScope<T extends Record<string, unknown>>(
  _ctx: unknown,
  where: T,
): T {
  return where;
}

export const travelRequestRouter = createTRPCRouter({
  // Get all travel requests with filters
  getAll: permissionProcedure("travel", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/travel-requests",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Get all travel requests",
      },
      mcp: {
        enabled: true,
        name: "list_my_travel_requests",
        description:
          "List all travel requests for the current user that are eligible for claims",
      },
    })
    .input(
      z.object({
        status: z.nativeEnum(TravelStatus).optional(),
        travelType: z.nativeEnum(TravelType).optional(),
        requesterId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.TravelRequestWhereInput = applyScope(ctx, {
        deletedAt: null,
      });

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.travelType) {
        where.travelType = input.travelType;
      }

      if (input?.requesterId) {
        where.requesterId = input.requesterId;
      }

      const andFilters: Prisma.TravelRequestWhereInput[] = [];
      if (input?.startDate) {
        andFilters.push({ startDate: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFilters.push({ endDate: { lte: input.endDate } });
      }
      if (andFilters.length > 0) where.AND = andFilters;

      const requests = await ctx.db.travelRequest.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
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
            orderBy: {
              createdAt: "asc",
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
          bailouts: {
            include: {
              finance: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          project: {
            select: {
              id: true,
              code: true,
              name: true,
              clientName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (requests.length > limit) {
        const nextItem = requests.pop();
        nextCursor = nextItem!.id;
      }

      return {
        requests,
        nextCursor,
      };
    }),

  // Get travel requests by participant employee ID (matches requester OR participants)
  getByParticipantEmployeeId: permissionProcedure("travel", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/travel-requests/by-participant/{employeeId}",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Get travel requests by participant employee ID",
        description:
          "Returns all travel requests where the given employeeId is either the requester or a participant",
      },
      mcp: {
        enabled: true,
        name: "get_travel_requests_by_participant",
        description:
          "Get all travel requests for a given employee ID, whether they are the requester or a participant - used for claim ",
      },
    })
    .input(
      z.object({
        employeeId: z.string().min(1),
        status: z.nativeEnum(TravelStatus).optional(),
        travelType: z.nativeEnum(TravelType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Resolve user by employeeId
      const targetUser = await ctx.db.user.findUnique({
        where: { employeeId: input.employeeId },
        select: { id: true, name: true, email: true, employeeId: true },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No user found with employee ID: ${input.employeeId}`,
        });
      }

      const where: Prisma.TravelRequestWhereInput = {
        deletedAt: null,
        OR: [
          { requesterId: targetUser.id },
          { participants: { some: { userId: targetUser.id } } },
        ],
      };
      applyScope(ctx, where);

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.travelType) {
        where.travelType = input.travelType;
      }

      if (input?.startDate ?? input?.endDate) {
        const andConditions: Prisma.TravelRequestWhereInput[] = [];
        if (input?.startDate) {
          andConditions.push({ startDate: { gte: input.startDate } });
        }
        if (input?.endDate) {
          andConditions.push({ endDate: { lte: input.endDate } });
        }
        where.AND = andConditions;
      }

      const requests = await ctx.db.travelRequest.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                },
              },
            },
          },
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
            orderBy: {
              createdAt: "asc",
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (requests.length > limit) {
        const nextItem = requests.pop();
        nextCursor = nextItem!.id;
      }

      return {
        targetUser,
        requests,
        nextCursor,
      };
    }),

  // Get travel request by ID
  getById: permissionProcedure("travel", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/travel-requests/{id}",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Get travel request by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          requester: {
            include: {
              department: true,
              supervisor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          claims: {
            include: {
              submitter: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          project: true,
          bailouts: {
            include: {
              requester: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      return request;
    }),

  // Get pending approvals for current user
  getPendingApprovals: supervisorProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/travel-requests/pending-approvals",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Get pending approvals for current user",
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
      return ctx.db.travelRequest.findMany({
        where: applyScope(ctx, {
          deletedAt: null,
          approvals: {
            some: {
              approverId: ctx.session.user.id,
              status: ApprovalStatus.PENDING,
            },
          },
        }),
        include: {
          requester: {
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
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          approvals: {
            where: {
              approverId: ctx.session.user.id,
              status: ApprovalStatus.PENDING,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  // Create travel request
  create: permissionProcedure("travel", "create")
    .meta({
      openapi: {
        method: "POST",
        path: "/travel-requests",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Create travel request",
      },
    })
    .input(
      z.object({
        purpose: z.string().min(10),
        destination: z.string().min(1),
        travelType: z.nativeEnum(TravelType),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        // SALES type: wajib pilih project
        projectId: z
          .string()
          .optional()
          .transform((v) => (v === "" ? undefined : v)),
        participantIds: z.array(z.string()).optional(),
        // Bailout saat pengajuan awal (sudah berisi kategori + field spesifik)
        bailouts: z
          .array(
            z.object({
              category: z
                .enum(["TRANSPORT", "HOTEL", "MEAL", "OTHER"])
                .default("OTHER"),
              description: z.string().min(10),
              amount: z.number().positive(),
              // Transport
              transportMode: z.string().optional(),
              carrier: z.string().optional(),
              departureFrom: z.string().optional(),
              arrivalTo: z.string().optional(),
              departureAt: z.coerce.date().optional(),
              arrivalAt: z.coerce.date().optional(),
              flightNumber: z.string().optional(),
              seatClass: z.string().optional(),
              bookingRef: z.string().optional(),
              // Hotel
              hotelName: z.string().optional(),
              hotelAddress: z.string().optional(),
              checkIn: z.coerce.date().optional(),
              checkOut: z.coerce.date().optional(),
              roomType: z.string().optional(),
              // Meal
              mealDate: z.coerce.date().optional(),
              mealLocation: z.string().optional(),
              // Finance assignment
              financeId: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { participantIds, bailouts, ...requestData } = input;

      // Only SALES_EMPLOYEE, SALES_CHIEF, and ADMIN can create a BussTrip
      // const allowedCreatorRoles = ["SALES_EMPLOYEE", "SALES_CHIEF", "ADMIN"];
      // if (!allowedCreatorRoles.includes(ctx.session.user.role)) {
      //   throw new TRPCError({
      //     code: "FORBIDDEN",
      //     message: "Hanya Sales Employee dan Sales Chief yang bisa mengajukan Business Trip",
      //   });
      // }

      // Validate dates
      if (input.startDate >= input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be after start date",
        });
      }

      // For SALES type, projectId is required
      if (input.travelType === TravelType.SALES && !input.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Travel type SALES harus memilih Project",
        });
      }

      // Generate request number
      const year = new Date().getFullYear();
      const requestNumber = await generateRequestNumber(ctx.db, year);

      // Prepare bailout number counter — use max existing to avoid conflicts
      let bailoutNumberCursor = await generateBailoutNumber(
        ctx.db,
        year,
      );

      // Create request with nested bailout entries and participants
      const request = await ctx.db.travelRequest.create({
        data: {
          requestNumber,
          requesterId: ctx.session.user.id,
          ...requestData,
          participants: participantIds
            ? {
                create: participantIds.map((userId) => ({
                  userId,
                })),
              }
            : undefined,
          bailouts: bailouts
            ? {
                create: bailouts.map((b) => {
                  const {
                    category,
                    description,
                    amount,
                    transportMode,
                    ...rest
                  } = b;
                  const nextBailoutNumber = bailoutNumberCursor;
                  const nextSeq =
                    Number.parseInt(
                      nextBailoutNumber.split("-").at(-1) ?? "0",
                      10,
                    ) + 1;
                  bailoutNumberCursor = `BLT-${year}-${String(nextSeq).padStart(5, "0")}`;
                  return {
                    bailoutNumber: nextBailoutNumber,
                    requesterId: ctx.session.user.id,
                    category,
                    description,
                    amount,
                    transportMode: transportMode as TransportMode | undefined,
                    ...rest,
                  };
                }),
              }
            : undefined,
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
              departmentId: true,
              phoneNumber: true,
              image: true,
            },
          },
          participants: { include: { user: true } },
          bailouts: true,
          project: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "TravelRequest",
          entityId: request.id,
          changes: { after: request },
        },
      });

      return request;
    }),

  // Update travel request (only in DRAFT or REVISION status)
  update: permissionProcedure("travel", "update")
    .meta({
      openapi: {
        method: "PUT",
        path: "/travel-requests/{id}",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Update travel request",
      },
    })
    .input(
      z.object({
        id: z.string(),
        purpose: z.string().min(10).optional(),
        destination: z.string().min(1).optional(),
        travelType: z.nativeEnum(TravelType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        projectId: z
          .string()
          .optional()
          .transform((v) => (v === "" ? undefined : v)),
        participantIds: z.array(z.string()).optional(),
        bailouts: z
          .array(
            z.object({
              category: z
                .enum(["TRANSPORT", "HOTEL", "MEAL", "OTHER"])
                .default("OTHER"),
              description: z.string().min(10),
              amount: z.number().positive(),
              transportMode: z.string().optional(),
              carrier: z.string().optional(),
              departureFrom: z.string().optional(),
              arrivalTo: z.string().optional(),
              departureAt: z.coerce.date().optional(),
              arrivalAt: z.coerce.date().optional(),
              flightNumber: z.string().optional(),
              seatClass: z.string().optional(),
              bookingRef: z.string().optional(),
              hotelName: z.string().optional(),
              hotelAddress: z.string().optional(),
              checkIn: z.coerce.date().optional(),
              checkOut: z.coerce.date().optional(),
              roomType: z.string().optional(),
              mealDate: z.coerce.date().optional(),
              mealLocation: z.string().optional(),
              financeId: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, participantIds, bailouts, ...updateData } = input;

      const existing = await ctx.db.travelRequest.findUnique({
        where: { id },
        include: { participants: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      // Only requester can update
      if (existing.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the requester can update this request",
        });
      }

      // Can only update DRAFT or REVISION requests
      if (
        !(
          [TravelStatus.DRAFT, TravelStatus.REVISION] as TravelStatus[]
        ).includes(existing.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update requests in DRAFT or REVISION status",
        });
      }

      // Validate dates if both provided
      if (updateData.startDate && updateData.endDate) {
        if (updateData.startDate >= updateData.endDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End date must be after start date",
          });
        }
      }

      // Update participants if provided
      if (participantIds) {
        await ctx.db.travelParticipant.deleteMany({
          where: applyScope(ctx, { travelRequestId: id }),
        });
      }

      // Update bailouts if provided: delete existing DRAFT ones and recreate
      if (bailouts !== undefined) {
        await ctx.db.bailout.deleteMany({
          where: applyScope(ctx, {
            travelRequestId: id,
            status: BailoutStatus.DRAFT,
          }),
        });
      }

      // Prepare bailout number counter — use max existing to avoid conflicts after deletion
      const year = new Date().getFullYear();
      let bailoutNumberCursor = await generateBailoutNumber(
        ctx.db,
        year,
      );

      const updated = await ctx.db.travelRequest.update({
        where: { id },
        data: {
          ...updateData,
          participants: participantIds
            ? {
                create: participantIds.map((userId) => ({
                  userId,
                })),
              }
            : undefined,
          bailouts: bailouts
            ? {
                create: bailouts.map((b) => {
                  const {
                    category,
                    description,
                    amount,
                    transportMode,
                    ...rest
                  } = b;
                  const nextBailoutNumber = bailoutNumberCursor;
                  const nextSeq =
                    Number.parseInt(
                      nextBailoutNumber.split("-").at(-1) ?? "0",
                      10,
                    ) + 1;
                  bailoutNumberCursor = `BLT-${year}-${String(nextSeq).padStart(5, "0")}`;
                  return {
                    bailoutNumber: nextBailoutNumber,
                    requesterId: ctx.session.user.id,
                    category,
                    description,
                    amount,
                    transportMode: transportMode as TransportMode | undefined,
                    ...rest,
                  };
                }),
              }
            : undefined,
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
              departmentId: true,
              phoneNumber: true,
              image: true,
            },
          },
          participants: { include: { user: true } },
          project: true,
          bailouts: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "TravelRequest",
          entityId: id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  // Submit travel request for approval
  submit: permissionProcedure("travel", "submit")
    .meta({
      openapi: {
        method: "POST",
        path: "/travel-requests/{id}/submit",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Submit travel request for approval",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          requester: {
            include: {
              supervisor: true,
              department: {
                include: {
                  chief: {
                    include: {
                      supervisor: {
                        include: {
                          supervisor: { include: { supervisor: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          project: {
            include: {
              salesLead: {
                include: {
                  supervisor: {
                    include: { supervisor: { include: { supervisor: true } } },
                  },
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the requester can submit this request",
        });
      }

      if (
        !(
          [TravelStatus.DRAFT, TravelStatus.REVISION] as TravelStatus[]
        ).includes(request.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only submit requests in DRAFT or REVISION status",
        });
      }

      // ── Build dynamic approval chain per DYNAMIC_APPROVAL_HIERARCHY.md ──────
      // Entry type includes sequence for chain ordering
      const approvalEntries: {
        sequence: number;
        level: ApprovalLevel;
        approverId: string;
      }[] = [];
      let seq = 1;

      const requesterRole = request.requester.role;
      const isSalesRole =
        requesterRole === "SALES_EMPLOYEE" || requesterRole === "SALES_CHIEF";
      const isSalesTravel =
        request.travelType === "SALES" && !!request.projectId;

      if (!isSalesRole && isSalesTravel && request.project?.salesLead) {
        // Rule B: Regular employee on a sales trip → start with SALES_LEAD (unless requester IS the sales lead)
        const salesLead = request.project.salesLead;
        if (salesLead.id !== request.requesterId) {
          approvalEntries.push({
            sequence: seq++,
            level: ApprovalLevel.SALES_LEAD,
            approverId: salesLead.id,
          });

          // Walk the sales lead's supervisor chain: DEPT_CHIEF → DIRECTOR → SENIOR_DIRECTOR → EXECUTIVE
          let current: {
            id: string;
            supervisorId: string | null;
            supervisor?: typeof salesLead | null;
          } | null = salesLead;
          const levels: ApprovalLevel[] = [
            ApprovalLevel.DEPT_CHIEF,
            ApprovalLevel.DIRECTOR,
            ApprovalLevel.SENIOR_DIRECTOR,
            ApprovalLevel.EXECUTIVE,
          ];
          for (const level of levels) {
            if (!current?.supervisorId) break;
            current = current.supervisor ?? null;
            if (!current) break;
            approvalEntries.push({
              sequence: seq++,
              level,
              approverId: current.id,
            });
          }
        } else {
          // Requester IS the sales lead — start at DEPT_CHIEF via requester's department chief
          const chief = request.requester.department?.chief;
          if (chief) {
            approvalEntries.push({
              sequence: seq++,
              level: ApprovalLevel.DEPT_CHIEF,
              approverId: chief.id,
            });
            let current: {
              id: string;
              supervisorId: string | null;
              supervisor?: typeof chief | null;
            } | null = chief;
            const levels: ApprovalLevel[] = [
              ApprovalLevel.DIRECTOR,
              ApprovalLevel.SENIOR_DIRECTOR,
              ApprovalLevel.EXECUTIVE,
            ];
            for (const level of levels) {
              if (!current?.supervisorId) break;
              current = current.supervisor ?? null;
              if (!current) break;
              approvalEntries.push({
                sequence: seq++,
                level,
                approverId: current.id,
              });
            }
          }
        }
      } else {
        // Rule A (SALES_EMPLOYEE / SALES_CHIEF) or Rule C (non-sales employee, non-sales travel):
        // Chain starts at DEPT_CHIEF then walks supervisor chain upward
        const chief = request.requester.department?.chief;
        if (chief) {
          approvalEntries.push({
            sequence: seq++,
            level: ApprovalLevel.DEPT_CHIEF,
            approverId: chief.id,
          });
          let current: {
            id: string;
            supervisorId: string | null;
            supervisor?: typeof chief | null;
          } | null = chief;
          const levels: ApprovalLevel[] = [
            ApprovalLevel.DIRECTOR,
            ApprovalLevel.SENIOR_DIRECTOR,
            ApprovalLevel.EXECUTIVE,
          ];
          for (const level of levels) {
            if (!current?.supervisorId) break;
            current = current.supervisor ?? null;
            if (!current) break;
            approvalEntries.push({
              sequence: seq++,
              level,
              approverId: current.id,
            });
          }
        }
      }

      // Deduplicate by approverId (same person can't appear twice in the chain)
      const seen = new Set<string>();
      const deduped = approvalEntries
        .filter((e) => {
          if (seen.has(e.approverId)) return false;
          seen.add(e.approverId);
          return true;
        })
        .map((e, idx) => ({ ...e, sequence: idx + 1 })); // resequence after dedup

      // When re-submitting from REVISION, delete the stale approval records first.
      // (They carry unique approvalNumbers — keeping them causes a unique constraint
      // violation when we try to INSERT new ones whose generated numbers collide.)
      if (request.status === TravelStatus.REVISION) {
        await ctx.db.approval.deleteMany({
          where: applyScope(ctx, { travelRequestId: input.id }),
        });
      }

      // Allocate all approval numbers in one shot:
      // Read the current MAX suffix once, then assign offsets 1..N locally.
      // This avoids both the count-after-delete bug and the sequential-read
      // race where two concurrent requests read the same MAX before either inserts.
      const year = new Date().getFullYear();
      const lastApproval = await ctx.db.approval.findFirst({
        where: {
          approvalNumber: { startsWith: `APR-${year}-` },
        },
        orderBy: { approvalNumber: "desc" },
        select: { approvalNumber: true },
      });
      let nextSeq = 1;
      if (lastApproval) {
        const parts = lastApproval.approvalNumber.split("-");
        const lastNum = parseInt(parts[parts.length - 1] ?? "0", 10);
        if (!isNaN(lastNum)) nextSeq = lastNum + 1;
      }

      const approvalsWithNumbers = deduped.map((entry, idx) => ({
        ...entry,
        approvalNumber: `APR-${year}-${String(nextSeq + idx).padStart(5, "0")}`,
      }));

      // Update request and create approvals
      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.SUBMITTED,
          submittedAt: new Date(),
          approvals: {
            create: approvalsWithNumbers,
          },
        },
        include: {
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                  role: true,
                  departmentId: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.SUBMIT,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      await ctx.db.bailout.updateMany({
        where: {
          travelRequestId: input.id,
          deletedAt: null,
          status: "DRAFT",
        },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });

      // Send poll notification only to the FIRST approver (sequence = 1).
      // Subsequent approvers are notified sequentially as each level approves
      // (handled in approval.approveTravelRequest).
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const first = (
          updated.approvals as unknown as Array<{
            approvalNumber: string;
            sequence: number;
            approver: { id: string; name: string | null; email: string | null };
          }>
        ).find((a) => a.sequence === 1);

        if (!first) return;

        const approverWithPhone = await ctx.db.user.findUnique({
          where: { id: first.approver.id },
          select: { phoneNumber: true },
        });
        const phone = approverWithPhone?.phoneNumber;
        if (!phone) return;

        await sendWhatsappPoll(
          buildTravelRequestApprovalPoll(
            first.approvalNumber,
            phone.replace(/^\+/, ""),
            {
              requestNumber: request.requestNumber,
              requesterName:
                request.requester.name ?? request.requester.email ?? "Unknown",
              destination: request.destination,
              purpose: request.purpose,
              startDate: request.startDate,
              endDate: request.endDate,
            },
          ),
        );
      })();

      return updated;
    }),

  // Lock travel request (Finance)
  lock: permissionProcedure("travel", "lock")
    .meta({
      openapi: {
        method: "POST",
        path: "/travel-requests/{id}/lock",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Lock travel request",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.id }),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.status !== TravelStatus.APPROVED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only lock approved travel requests",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.LOCKED,
          lockedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.LOCK,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Close travel request (Finance)
  close: permissionProcedure("travel", "close")
    .meta({
      openapi: {
        method: "POST",
        path: "/travel-requests/{id}/close",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Close travel request",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          claims: {
            where: {
              status: {
                notIn: ["PAID", "REJECTED"],
              },
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.status !== TravelStatus.LOCKED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only close locked travel requests",
        });
      }

      // Check if all claims are settled
      if (request.claims.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot close request with pending claims",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.CLOSED,
          closedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CLOSE,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Delete travel request (soft delete)
  delete: permissionProcedure("travel", "delete")
    .meta({
      openapi: {
        method: "DELETE",
        path: "/travel-requests/{id}",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Delete travel request",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          claims: true,
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this request",
        });
      }

      // Can only delete DRAFT requests
      if (request.status !== TravelStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete requests in DRAFT status",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Get statistics
  getStatistics: managerProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/travel-requests/statistics",
        protect: true,
        tags: ["Travel Requests"],
        summary: "Get travel request statistics",
      },
    })
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        departmentId: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.TravelRequestWhereInput = applyScope(ctx, {
        deletedAt: null,
      });

      if (input?.departmentId) {
        where.requester = {
          departmentId: input.departmentId,
        };
      }

      const andFiltersStats: Prisma.TravelRequestWhereInput[] = [];
      if (input?.startDate) {
        andFiltersStats.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersStats.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersStats.length > 0) where.AND = andFiltersStats;

      const [total, byStatus, byType] = await Promise.all([
        ctx.db.travelRequest.count({ where }),
        ctx.db.travelRequest.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        ctx.db.travelRequest.groupBy({
          by: ["travelType"],
          where,
          _count: true,
        }),
      ]);

      return {
        total,
        byStatus: byStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        byType: byType.map((item) => ({
          type: item.travelType,
          count: item._count,
        })),
      };
    }),

  // Get approved travel requests for current user (for Bailout create modal)
  getApproved: protectedProcedure
    .input(z.object({}).optional())
    .output(z.any())
    .query(async ({ ctx }) => {
      const requests = await ctx.db.travelRequest.findMany({
        where: {
          requesterId: ctx.session.user.id,
          status: TravelStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          id: true,
          requestNumber: true,
          destination: true,
          purpose: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { requests };
    }),
});

