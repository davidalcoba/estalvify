// GDPR account deletion (right to erasure, art. 17).
//
// Two halves, in this order:
//
//  1. Revoke the PSD2 consents at Enable Banking. Deleting our rows does not
//     end the bank-side authorization — the consent lives with the TPP too, so
//     erasure that skips this leaves an active grant pointing at a user who no
//     longer exists here. Best-effort per connection: an Enable Banking outage
//     must not block the user's right to delete their data (their consent also
//     lapses on its own within 90 days).
//
//  2. Delete every row the user owns. `onDelete: Cascade` on the User relations
//     does most of it, but three tables hold a RESTRICT foreign key into
//     `categories` (transaction_categorizations, category_rules, budget_items),
//     and Postgres enforces those while the user-cascade is still deleting —
//     so they go explicitly first, inside the same transaction as the user row.
//
// What deletion does NOT reach, by design of the platforms underneath: Vercel's
// log retention and Neon's branch/backup history age out on their own schedule.
// The privacy policy documents both.

import { prisma } from "@/lib/prisma";
import { deleteSession } from "@/lib/banking/enable-banking";

export interface DeleteAccountResult {
  /** Enable Banking sessions we could not revoke (count, for the caller's log). */
  consentRevocationFailures: number;
}

export async function deleteUserAccount(
  userId: string,
): Promise<DeleteAccountResult> {
  const connections = await prisma.bankConnection.findMany({
    where: { userId },
    select: { id: true, sessionId: true },
  });

  let consentRevocationFailures = 0;
  for (const connection of connections) {
    try {
      await deleteSession(connection.sessionId);
    } catch {
      // Do not log the error body — Enable Banking errors can echo request
      // details. The count is enough to see it happened.
      consentRevocationFailures += 1;
    }
  }
  if (consentRevocationFailures > 0) {
    console.warn(
      `[account/delete] ${consentRevocationFailures}/${connections.length} PSD2 consent revocation(s) failed; consents lapse on their own within 90 days`,
    );
  }

  await prisma.$transaction([
    prisma.transactionCategorization.deleteMany({
      where: { transaction: { userId } },
    }),
    prisma.budgetItem.deleteMany({ where: { budget: { userId } } }),
    prisma.categoryRule.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { consentRevocationFailures };
}
