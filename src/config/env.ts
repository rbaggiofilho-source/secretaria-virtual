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

    // Google Calendar (conta de serviço — usada pelo dono/legado)
    GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID é obrigatório"),
    GOOGLE_SERVICE_ACCOUNT_JSON: z
      .string()
      .min(1, "GOOGLE_SERVICE_ACCOUNT_JSON é obrigatório"),

    // Google OAuth (por usuário do beta — cada um conecta a própria agenda).
    // Opcionais: se não setados, só o caminho da conta de serviço funciona.
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    // Base pública do app (para montar o redirect do OAuth e links).
    PUBLIC_BASE_URL: z.string().url().default("https://secretaria-virtual-seven.vercel.app"),

    // Supabase
    SUPABASE_URL: z.string().url("SUPABASE_URL deve ser uma URL válida"),
    SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY é obrigatório"),

    // Geral
    TIMEZONE: z.string().default("America/Sao_Paulo"),
    // Segredo do Cron da Vercel (protege o endpoint do "bom dia"). Opcional,
    // mas o endpoint recusa rodar sem ele (evita disparo aberto de mensagens).
    CRON_SECRET: z.string().optional(),

    // Segredo-mestre dos tokens do painel/OAuth/OTP. Opcional: sem ele, cai no
    // WHATSAPP_APP_SECRET (legado). Recomendado definir um próprio, para que
    // rotacionar o segredo da Meta não derrube as sessões (e vice-versa).
    SESSION_SECRET: z.string().optional(),
    // Chave para criptografar os tokens do Google em repouso (AES-256-GCM).
    // Opcional: sem ela os tokens novos são gravados em claro (legado).
    TOKEN_ENC_KEY: z.string().optional(),
    // Versão da Graph API da Meta (ex.: "v21.0"). Configurável para subir de
    // versão sem deploy de código quando a Meta descontinuar a atual.
    WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v21.0"),
    // Código de convite do cadastro beta. SEM default: sem a variável o
    // cadastro fica FECHADO (antes havia um código fixo no código-fonte).
    BETA_INVITE_CODE: z.string().optional(),
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
