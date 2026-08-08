// An error whose message is a DICTIONARY KEY rather than a sentence.
//
// Domain modules throw failures that end up in front of the user (the invite
// form, the members list), so the text cannot be baked in at the throw site —
// it depends on the member's language, which only the request boundary knows.
// The thrower names the condition; the server action renders it.

import type { MessageKey } from "@/lib/i18n/dictionaries/en";
import type { MessageVars, Translator } from "@/lib/i18n/translate";

export class AppError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly vars?: MessageVars,
  ) {
    // The key doubles as the `message`, so a log line still identifies it.
    super(key);
    this.name = "AppError";
  }
}

/**
 * Renders an unknown thrown value as a message for the user. Anything that is
 * not an `AppError` is a bug rather than a condition we chose to explain, so
 * it collapses to the generic string instead of leaking an internal message.
 */
export function describeError(err: unknown, t: Translator): string {
  if (err instanceof AppError) return t(err.key, err.vars);
  return t("common.error");
}
