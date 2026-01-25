import { prisma } from "@/db/client";

export const listTeams = () => prisma.team.findMany();

export const getTeamById = (id: string) =>
  prisma.team.findUnique({ where: { id } });

export const getDefaultTeam = () => prisma.team.findFirst();
