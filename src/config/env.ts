import { z } from "zod";
import process from "node:process";

/**
 * Carrega e valida TODAS as variáveis de ambiente uma única vez.
 * Em ambiente serverless (Vercel/Cloudflare) as env vars ligam em tempo de
 * request, então lemos process.env dentro de getEnv() e cacheamos o resultado.
 *
 * Nenhum segredo é logado. Se algo essencial faltar, falhamos cedo com uma
 * mensagem clara (sem vazar valores).
 */

const EnvSchema = z
  .object({
    // WhatsApp
    WHATSAPP_TOKEN: z.string().min(1, "WHATSAPP_TOKEN é obrigatório"),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID é obrigatório"),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_VERIFY_TOKEN é obrigatório"),
    WHATSAPP_APP_SECRET: z.string().min(1, "WHATSAPP_APP_SECRET é obrigatório"),
    ALLOWED_WHATSAPP_NUMBER: z.string().optional(),

    // Anthropic
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY é obrigatório"),
    ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),

    // STT (tolerante a maiúsculas/minúsculas, ex.: "Groq" -> "groq")
    STT_PROVIDER: z
      .preprocess(
        (v) => (typeof v === "string" ? v.toLowerCase() : v),
        z.enum(["groq", "openai"]),
      )
      .default("groq"),
    GROQ_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    GROQ_STT_MODEL: z.string().default("whisper-large-v3"),
    OPENAI_STT_MODEL: z.string().default("whisper-1"),

    // Google Calendar
    GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID é obrigatório"),
    GOOGLE_SERVICE_ACCOUNT_JSON: z
      .string()
      .min(1, "GOOGLE_SERVICE_ACCOUNT_JSON é obrigatório"),

    // Supabase
    SUPABASE_URL: z.string().url("SUPABASE_URL deve ser uma URL válida"),
    SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY é obrigatório"),

    // Geral
    TIMEZONE: z.string().default("America/Sao_Paulo"),
  })
  .superRefine((env, ctx) => {
    // A chave do provedor de STT escolhido precisa existir.
    if (env.STT_PROVIDER === "groq" && !env.GROQ_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STT_PROVIDER=groq exige GROQ_API_KEY",
        path: ["GROQ_API_KEY"],
      });
    }
    if (env.STT_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STT_PROVIDER=openai exige OPENAI_API_KEY",
        path: ["OPENAI_API_KEY"],
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  // Normaliza os valores: remove espaços/quebras de linha acidentais nas pontas
  // (evita que um espaço colado por engano invalide enum ou quebre um token).
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") normalized[key] = value.trim();
  }

  const parsed = EnvSchema.safeParse(normalized);
  if (!parsed.success) {
    // Lista só os NOMES das variáveis com problema — nunca os valores.
    const problems = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}
