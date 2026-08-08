import "server-only";

import type { AiProvider } from "./types";
import { AiNotConfiguredError } from "./types";
import { createClaudeProvider } from "./providers/claude";

/**
 * Resolve the configured AI provider. Swap providers via the AI_PROVIDER env var
 * (default "claude"). Throws AiNotConfiguredError when the provider isn't usable.
 */
export function getAiProvider(opts: {
  /** Number format for the amounts in the prompt. */
  locale: string;
  /** The language the recommendations must be written in. */
  language: string;
}): AiProvider {
  const provider = (process.env.AI_PROVIDER || "claude").toLowerCase();
  switch (provider) {
    case "claude":
      return createClaudeProvider(opts.locale, opts.language);
    default:
      throw new AiNotConfiguredError(`Unknown AI_PROVIDER: "${provider}"`);
  }
}
