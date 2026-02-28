import { PrismaClient } from "../app/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const accounts = await prisma.bankAccount.findMany({
    select: {
      id: true,
      name: true,
      iban: true,
      externalAccountId: true,
      type: true,
      isActive: true,
      _count: { select: { transactions: true, balances: true } },
    },
  });

  console.log(JSON.stringify(accounts, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
