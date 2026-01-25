import { prisma } from "@/db/client";

export const createAuditLog = (data: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) =>
  prisma.auditLog.create({
    data: {
      actorId: data.actorId,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      before: data.before ?? null,
      after: data.after ?? null,
    },
  });
