// TEMPORARY DIAGNOSTIC — capture server-side render/action errors.
//
// Production masks thrown Server Component / Server Action errors, so a failing
// server action surfaces on the client only as the generic "An error occurred
// in the Server Components render". Next's onRequestError hook receives the real
// error (message, digest, stack) server-side; we persist it to sync_logs so it
// can be read back out of band. Remove once the recurring-action failure is
// diagnosed.

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string> },
  context: { routerKind?: string; routePath?: string; routeType?: string },
): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const err = error as { message?: string; digest?: string; stack?: string };
    const parts = [
      `path=${request?.path ?? "?"} method=${request?.method ?? "?"}`,
      `route=${context?.routePath ?? "?"} type=${context?.routeType ?? "?"} kind=${context?.routerKind ?? "?"}`,
      `digest=${err?.digest ?? "-"}`,
      `msg=${err?.message ?? String(error)}`,
      `stack=${(err?.stack ?? "").slice(0, 1500)}`,
    ].join(" | ");
    await prisma.syncLog.create({
      data: {
        status: "FAILED",
        syncDate: new Date(),
        errorMessage: `REQERR ${parts}`.slice(0, 4000),
      },
    });
  } catch {
    // Never let diagnostics break the request path.
  }
}
