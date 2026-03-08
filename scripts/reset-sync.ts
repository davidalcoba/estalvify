// Resets lastSyncAt on all active bank accounts so the next sync fetches 90 days
// of history, and deletes abandoned PENDING_REAUTH / PENDING_SETUP connections.
import { PrismaClient } from "../app/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Delete abandoned connections that never completed setup
  const deleted = await prisma.bankConnection.deleteMany({
    where: { status: { in: ["PENDING_REAUTH", "PENDING_SETUP"] } },
  });
  console.log(`Deleted ${deleted.count} abandoned connections`);

  // Reset lastSyncAt on all active accounts so the next sync fetches 90 days
  const reset = await prisma.bankAccount.updateMany({
    where: { isActive: true },
    data: { lastSyncAt: null },
  });
  console.log(`Reset lastSyncAt on ${reset.count} active accounts`);

  await prisma.$disconnect();
}

main().catch(console.error);
