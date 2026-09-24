import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __dorakPrisma?: PrismaClient };
export const db = g.__dorakPrisma ?? new PrismaClient();
g.__dorakPrisma = db;
