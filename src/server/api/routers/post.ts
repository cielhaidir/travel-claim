import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/posts/hello',
        protect: false,
        tags: ['Posts'],
        summary: 'Get hello greeting',
      }
    })
    .input(z.object({ text: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  // create: protectedProcedure
  //   .input(z.object({ name: z.string().min(1) }))
  //   .mutation(async ({ ctx, input }) => {
  //     return ctx.db.post.create({
  //       data: {
  //         name: input.name,
  //         createdBy: { connect: { id: ctx.session.user.id } },
  //       },
  //     });
  //   }),

  // getLatest: protectedProcedure.query(async ({ ctx }) => {
  //   const post = await ctx.db.post.findFirst({
  //     orderBy: { createdAt: "desc" },
  //     where: { createdBy: { id: ctx.session.user.id } },
  //   });

  //   return post ?? null;
  // }),

  getSecretMessage: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/posts/secret',
        protect: true,
        tags: ['Posts'],
        summary: 'Get secret message',
      }
    })
    .input(z.void())
    .output(z.string())
    .query(() => {
    return "you can now see this secret message!";
  }),
});
