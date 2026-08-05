// Active revocation of a user's access.
//
// ALLOWED_EMAILS and the account-deletion flow both need a way to cut access
// NOW, not when things happen to expire: an app session lives 30 days and an
// MCP refresh token 30 days, so "removed from the allowlist" without this
// helper means "removed in a month". Deleting the Session rows kills every
// device's login on its next request (database sessions — the cookie only
// points at a row); revoking the refresh tokens caps MCP access at the
// remaining lifetime of the last access token (≤ 1 hour).

import { prisma } from "@/lib/prisma";

export async function revokeUserAccess(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.mcpRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
