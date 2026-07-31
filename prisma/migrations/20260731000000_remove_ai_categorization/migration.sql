-- Retire the unimplemented AI categorization stack.
-- The `ai_category_suggestions` table and the `AiSuggestionStatus` enum were
-- scaffolded but never wired up (no code ever wrote to them). Removing them
-- keeps the schema honest. The `CategorizationSource.AI` value is intentionally
-- kept as a reserved value for a future AI-assisted flow.

-- Drop the suggestions table (also removes its own FKs and unique index).
DROP TABLE IF EXISTS "ai_category_suggestions";

-- Drop the now-unused enum type.
DROP TYPE IF EXISTS "AiSuggestionStatus";
