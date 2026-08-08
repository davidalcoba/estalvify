import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiRecommendation, FinancialSummary } from "../types";
import { AiNotConfiguredError } from "../types";
import { summaryToPrompt, recommendationsSystemPrompt } from "../summary";
import { parseRecommendations } from "../parse";

const DEFAULT_MODEL = "claude-opus-5";

/**
 * Anthropic-backed provider. Sends only the anonymized summary text; the API key
 * stays server-side. Throws AiNotConfiguredError when no key is set so callers
 * can degrade gracefully.
 */
export function createClaudeProvider(locale: string, language: string): AiProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  return {
    async generateRecommendations(
      summary: FinancialSummary
    ): Promise<AiRecommendation[]> {
      const userPrompt = [
        summaryToPrompt(summary, locale),
        "",
        'Respond with ONLY a JSON object of the form {"recommendations":[{"title":"...","body":"...","category":"...","severity":"info|warning|alert"}]}.',
        "Do not include any prose outside the JSON.",
      ].join("\n");

      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        system: recommendationsSystemPrompt(language),
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();

      return parseRecommendations(extractJson(text));
    },
  };
}

/** Pull the JSON object out of a response that may wrap it in prose or fences. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate.trim();
  return candidate.slice(start, end + 1);
}
