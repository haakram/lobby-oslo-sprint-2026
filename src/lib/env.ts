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

const publicUrl = optional.transform((value, ctx) => {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "must be an https:// URL" });
    return z.NEVER;
  }
  if (url.protocol !== "https:") {
    ctx.addIssue({ code: "custom", message: "must be an https:// URL" });
    return z.NEVER;
  }
  return value.replace(/\/+$/, "");
});

const toolSecret = optional.refine((value) => value === undefined || value.length >= 24, {
  message: "must be at least 24 characters",
});

const receptionSchema = z.object({
  ELEVENLABS_API_KEY: required,
  ELEVENLABS_RECEPTION_AGENT_ID: optional,
  RECEPTION_PUBLIC_URL: publicUrl,
  RECEPTION_TOOL_SECRET: toolSecret,
});

export type ReceptionEnv = z.infer<typeof receptionSchema>;

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

/**
 * The team's receptionist agent at ElevenLabs. An agent id is a name, not a secret: starting a
 * conversation needs a token our server signs with ELEVENLABS_API_KEY (the agent has auth enabled),
 * and changing the agent needs that key too. Set ELEVENLABS_RECEPTION_AGENT_ID to use another agent.
 */
export const RECEPTION_AGENT_ID_DEFAULT = "agent_5901m6v2qbmrebhvp01v3wpkd3xm";

/** What the receptionist needs: its own agent id, and for webhook tools a public URL and a secret. */
export function receptionEnv(): ReceptionEnv {
  return parse(receptionSchema, {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_RECEPTION_AGENT_ID: process.env.ELEVENLABS_RECEPTION_AGENT_ID || RECEPTION_AGENT_ID_DEFAULT,
    RECEPTION_PUBLIC_URL: process.env.RECEPTION_PUBLIC_URL,
    RECEPTION_TOOL_SECRET: process.env.RECEPTION_TOOL_SECRET,
  });
}
