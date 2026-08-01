import "server-only";

import type { AiProvider } from "./types";
import { AiNotConfiguredError } from "./types";
import { createClaudeProvider } from "./providers/claude";

/**
 * Resolve the configured AI provider. Swap providers via the AI_PROVIDER env var
 * (default "claude"). Throws AiNotConfiguredError when the provider isn't usable.
 */
export function getAiProvider(opts: { locale: string }): AiProvider {
  const provider = (process.env.AI_PROVIDER || "claude").toLowerCase();
  switch (provider) {
    case "claude":
      return createClaudeProvider(opts.locale);
    default:
      throw new AiNotConfiguredError(`Unknown AI_PROVIDER: "${provider}"`);
  }
}
