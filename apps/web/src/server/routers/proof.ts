import { ProofConfirmSchema, ProofUploadRequestSchema } from "@rowbook/shared";
import { TRPCError } from "@trpc/server";
import { isCoachRole } from "@/server/auth/rbac";
import { confirmProofUpload, createProofUpload, getProofViewUrl } from "@/server/services/proof-service";
import { protectedProcedure, router } from "@/server/trpc";
import { z } from "zod";

export const proofRouter = router({
  createUploadUrl: protectedProcedure
    .input(ProofUploadRequestSchema)
    .mutation(async ({ ctx, input }) => createProofUpload(ctx.session.user.id, input)),
  confirmUpload: protectedProcedure
    .input(ProofConfirmSchema)
    .mutation(async ({ ctx, input }) => confirmProofUpload(ctx.session.user.id, input.proofImageId)),
  getSignedViewUrl: protectedProcedure
    .input(z.object({ proofImageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const canViewAll = isCoachRole(ctx.session.user.role);
      return getProofViewUrl(ctx.session.user.id, input.proofImageId, canViewAll);
    }),
});
