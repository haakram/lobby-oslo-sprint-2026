import "server-only";
import { z } from "zod";

const required = z.string().trim().min(1, "is missing");

const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const budget = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return 5;
    const usd = Number(value);
    if (!Number.isFinite(usd) || usd <= 0) {
      ctx.addIssue({ code: "custom", message: "must be a positive number of USD" });
      return z.NEVER;
    }
    return usd;
  });

const schema = z.object({
  ANTHROPIC_API_KEY: required,
  ELEVENLABS_API_KEY: required,
  ELEVENLABS_AGENT_ID: optional,
  APP_CLAUDE_BUDGET_USD: budget,
});

export type ServerEnv = z.infer<typeof schema>;

const voiceSchema = z.object({
  ELEVENLABS_API_KEY: required,
  ELEVENLABS_AGENT_ID: optional,
});

export type VoiceEnv = z.infer<typeof voiceSchema>;

/** Parses, or throws an error that names the variables at fault and never includes a value. */
function parse<T extends z.ZodType>(schema: T, input: Record<string, string | undefined>): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map(
    (issue) => `${String(issue.path[0])} ${issue.code === "invalid_type" ? "is missing" : issue.message}`,
  );
  throw new Error(
    `Server environment is not set up: ${problems.join("; ")}. Add it to .env.local, or to the Vercel project settings.`,
  );
}

/**
 * Server-side configuration, read fresh from process.env on every call.
 * Errors name the variables at fault and never include a value.
 */
export function serverEnv(): ServerEnv {
  return parse(schema, {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID: process.env.ELEVENLABS_AGENT_ID,
    APP_CLAUDE_BUDGET_USD: process.env.APP_CLAUDE_BUDGET_USD,
  });
}

/** Only what the voice token needs, so voice works on a deploy without the Anthropic key. */
export function voiceEnv(): VoiceEnv {
  return parse(voiceSchema, {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID: process.env.ELEVENLABS_AGENT_ID,
  });
}
