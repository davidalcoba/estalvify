// Prisma client singleton with Neon serverless adapter
// Prisma v7 requires passing the adapter to PrismaClient at runtime
// Docs: https://pris.ly/d/prisma7-client-config

import { PrismaClient } from "@/app/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

// Prevent multiple PrismaClient instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // PrismaNeon accepts a PoolConfig object directly
  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
