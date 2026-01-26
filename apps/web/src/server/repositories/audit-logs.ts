import { prisma } from "@/db/client";
import { Prisma } from "@prisma/client";

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as Prisma.InputJsonValue;

const toNullableJson = (value?: unknown | null) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.DbNull;
  }
  return toInputJsonValue(value);
};

export const createAuditLog = (data: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown | null;
  after?: unknown | null;
}) =>
  prisma.auditLog.create({
    data: {
      actorId: data.actorId,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      before: toNullableJson(data.before),
      after: toNullableJson(data.after),
    },
  });
