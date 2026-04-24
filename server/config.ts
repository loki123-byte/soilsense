// Centralized config loader for server-side environment variables
// Loads .env in development and exposes typed config values with defaults.
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  // Load .env file if present for local development
  dotenv.config();
}

export const config = {
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || null,
  GOOGLE_GEMINI_API_KEY:
    process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || null,
  PING_MESSAGE: process.env.PING_MESSAGE || "ping",
};

export function missingKeys() {
  const missing: string[] = [];
  if (!config.GOOGLE_GEMINI_API_KEY) missing.push("GOOGLE_GEMINI_API_KEY");
  if (!config.PERPLEXITY_API_KEY) missing.push("PERPLEXITY_API_KEY");
  if (!config.OPENROUTER_API_KEY) missing.push("OPENROUTER_API_KEY");
  return missing;
}

export function ensureConfig() {
  const miss = missingKeys();
  return { ok: miss.length === 0, missing: miss };
}
