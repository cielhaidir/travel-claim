import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AuditAction } from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

export const attachmentRouter = createTRPCRouter({
  // Get attachments by claim ID
  getByClaim: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/attachments/by-claim/{claimId}',
        protect: true,
        tags: ['Attachments'],
        summary: 'Get attachments by claim ID',
      },
      mcp: {
        enabled: true,
        name: "list_claim_attachments",
        description: "List all attachments for a specific claim",
      },
    })
    .input(z.object({ claimId: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Verify access to claim
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.claimId },
        include: {
          travelRequest: {
            include: {
              participants: true,
            },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Check access rights
      const isSubmitter = claim.submitterId === ctx.session.user.id;
      const isRequester = claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isSubmitter && !isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view attachments for this claim",
        });
      }

      return ctx.db.attachment.findMany({
        where: {
          claimId: input.claimId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  // Get attachment by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/attachments/{id}',
        protect: true,
        tags: ['Attachments'],
        summary: 'Get attachment by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const attachment = await ctx.db.attachment.findUnique({
        where: { id: input.id },
        include: {
          claim: {
            include: {
              submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
              travelRequest: {
                include: {
                  requester: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, image: true } },
                  participants: true,
                },
              },
            },
          },
        },
      });

      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found",
        });
      }

      // Check access rights
      const isSubmitter = attachment.claim.submitterId === ctx.session.user.id;
      const isRequester = attachment.claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = attachment.claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isSubmitter && !isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this attachment",
        });
      }

      return attachment;
    }),

  // Create attachment metadata (actual file upload would be handled separately via upload endpoint)
  create: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/attachments',
        protect: true,
        tags: ['Attachments'],
        summary: 'Create attachment metadata',
      },
      mcp: {
        enabled: true,
        name: "add_claim_attachment",
        description: "Add an attachment to a claim with metadata",
      },
    })
    .input(
      z.object({
        claimId: z.string(),
        filename: z.string(),
        originalName: z.string(),
        mimeType: z.string(),
        fileSize: z.number().positive(),
        storageUrl: z.string(),
        storageProvider: z.string().default("local"),
        ocrExtractedData: z.any().optional(),
        ocrConfidence: z.number().min(0).max(100).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Verify claim exists and user has access
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.claimId },
        include: {
          travelRequest: {
            include: {
              participants: true,
            },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Check if user can add attachments to this claim
      const isSubmitter = claim.submitterId === ctx.session.user.id;
      const isRequester = claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );

      if (!isSubmitter && !isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to add attachments to this claim",
        });
      }

      // Can only add attachments to DRAFT or REVISION claims
      if (!["DRAFT", "REVISION"].includes(claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only add attachments to claims in DRAFT or REVISION status",
        });
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (input.fileSize > maxSize) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File size exceeds maximum allowed size of 10MB",
        });
      }

      // Validate mime type (allow images and PDFs)
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
      ];

      if (!allowedTypes.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File type not allowed. Only images and PDFs are accepted",
        });
      }

      const attachment = await ctx.db.attachment.create({
        data: {
          claimId: input.claimId,
          filename: input.filename,
          originalName: input.originalName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          storageUrl: input.storageUrl,
          storageProvider: input.storageProvider,
          ocrExtractedData: input.ocrExtractedData,
          ocrConfidence: input.ocrConfidence,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Attachment",
          entityId: attachment.id,
          metadata: {
            claimId: input.claimId,
            filename: input.filename,
            fileSize: input.fileSize,
          },
        },
      });

      return attachment;
    }),

  // Update attachment metadata (e.g., OCR data)
  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/attachments/{id}',
        protect: true,
        tags: ['Attachments'],
        summary: 'Update attachment metadata',
      }
    })
    .input(
      z.object({
        id: z.string(),
        ocrExtractedData: z.any().optional(),
        ocrConfidence: z.number().min(0).max(100).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const attachment = await ctx.db.attachment.findUnique({
        where: { id },
        include: {
          claim: {
            include: {
              submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
            },
          },
        },
      });

      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found",
        });
      }

      // Only claim submitter or admin can update
      const canUpdate =
        attachment.claim.submitterId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN";

      if (!canUpdate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this attachment",
        });
      }

      const updated = await ctx.db.attachment.update({
        where: { id },
        data: updateData,
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Attachment",
          entityId: id,
          metadata: {
            updates: updateData,
          },
        },
      });

      return updated;
    }),

  // Delete attachment (soft delete)
  delete: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/attachments/{id}',
        protect: true,
        tags: ['Attachments'],
        summary: 'Delete attachment',
      },
      mcp: {
        enabled: true,
        name: "delete_claim_attachment",
        description: "Delete an attachment from a claim",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const attachment = await ctx.db.attachment.findUnique({
        where: { id: input.id },
        include: {
          claim: {
            include: {
              submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
            },
          },
        },
      });

      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found",
        });
      }

      // Only claim submitter or admin can delete
      const canDelete =
        attachment.claim.submitterId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN";

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this attachment",
        });
      }

      // Can only delete attachments from DRAFT or REVISION claims
      if (!["DRAFT", "REVISION"].includes(attachment.claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete attachments from claims in DRAFT or REVISION status",
        });
      }

      const updated = await ctx.db.attachment.update({
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
          entityType: "Attachment",
          entityId: input.id,
          metadata: {
            claimId: attachment.claimId,
            filename: attachment.filename,
          },
        },
      });

      // TODO: Delete actual file from storage

      return updated;
    }),

  // Get download URL (generates a signed URL for secure download)
  getDownloadUrl: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({
      url: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      expiresIn: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const attachment = await ctx.db.attachment.findUnique({
        where: { id: input.id },
        include: {
          claim: {
            include: {
              travelRequest: {
                include: {
                  participants: true,
                },
              },
            },
          },
        },
      });

      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found",
        });
      }

      // Check access rights
      const isSubmitter = attachment.claim.submitterId === ctx.session.user.id;
      const isRequester = attachment.claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = attachment.claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isSubmitter && !isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to download this attachment",
        });
      }

      // TODO: Generate signed URL for secure download
      // For now, return the storage URL directly
      // In production, you would generate a time-limited signed URL
      return {
        url: attachment.storageUrl,
        filename: attachment.originalName,
        mimeType: attachment.mimeType,
        expiresIn: 3600, // 1 hour
      };
    }),

  // Batch create attachments
  createBatch: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        attachments: z.array(
          z.object({
            filename: z.string(),
            originalName: z.string(),
            mimeType: z.string(),
            fileSize: z.number().positive(),
            storageUrl: z.string(),
            storageProvider: z.string().default("local"),
          })
        ),
      })
    )
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify claim
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.claimId },
        include: {
          travelRequest: {
            include: {
              participants: true,
            },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Check authorization
      const isSubmitter = claim.submitterId === ctx.session.user.id;
      const isRequester = claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );

      if (!isSubmitter && !isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to add attachments to this claim",
        });
      }

      // Check claim status
      if (!["DRAFT", "REVISION"].includes(claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only add attachments to claims in DRAFT or REVISION status",
        });
      }

      // Validate all files
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
      ];

      for (const file of input.attachments) {
        if (file.fileSize > maxSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File ${file.originalName} exceeds maximum size of 10MB`,
          });
        }

        if (!allowedTypes.includes(file.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File ${file.originalName} has invalid type. Only images and PDFs are allowed`,
          });
        }
      }

      // Create attachments
      const created = await ctx.db.attachment.createMany({
        data: input.attachments.map((file) => ({
          claimId: input.claimId,
          ...file,
        })),
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Attachment",
          entityId: input.claimId,
          metadata: {
            action: "batch_create",
            count: created.count,
            claimId: input.claimId,
          },
        },
      });

      return {
        count: created.count,
      };
    }),
});