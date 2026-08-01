// Pure parsing/validation of the model's JSON response into AiRecommendation[].
// Validated with zod so a malformed response is rejected rather than rendered.

import { z } from "zod";
import type { AiRecommendation } from "./types";

const MAX_RECOMMENDATIONS = 6;

const recommendationSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
  category: z.string().max(80).optional(),
  // Coerce unknown severities to "info" rather than failing the whole parse.
  severity: z.enum(["info", "warning", "alert"]).catch("info"),
});

const responseSchema = z.object({
  recommendations: z.array(recommendationSchema),
});

/** JSON schema for Anthropic structured outputs (output_config.format). */
export const RECOMMENDATIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          category: { type: "string" },
          severity: { type: "string", enum: ["info", "warning", "alert"] },
        },
        required: ["title", "body", "severity"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export function parseRecommendations(json: string): AiRecommendation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  const result = responseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("AI response did not match the expected shape");
  }

  return result.data.recommendations.slice(0, MAX_RECOMMENDATIONS).map((r) => ({
    title: r.title,
    body: r.body,
    category: r.category,
    severity: r.severity,
  }));
}
