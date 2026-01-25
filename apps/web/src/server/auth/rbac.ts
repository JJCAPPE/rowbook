import { Role } from "@rowbook/shared";

export const isCoachRole = (role: Role) => role === "COACH" || role === "ADMIN";

export const isAthleteRole = (role: Role) => role === "ATHLETE";
