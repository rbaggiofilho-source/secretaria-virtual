import { getEnv } from "../src/config/env.js";
import { handleIncomingMessage } from "../src/pipeline.js";
import { isValidSignature } from "../src/whatsapp/signature.js";
import { extractFirstMessage, type WhatsAppWebhookPayload } from "../src/whatsapp/types.js";

/**
 * Webhook único da WhatsApp Cloud API.
 *   GET  -> handshake de verificação da Meta (hub.challenge / hub.verify_token)
 *   POST -> recepção de mensagens (valida X-Hub-Signature-256 antes de processar)
 *
 * Usamos a assinatura Web (Request -> Response) em vez de (VercelRequest,
 * VercelResponse) por um motivo específico: o runtime @vercel/node consome o
 * stream do corpo antes de chamar o handler, e `config.api.bodyParser` é
 * convenção do Next.js — não é respeitada em funções soltas em /api. Sem os
 * bytes exatos recebidos, o HMAC do X-Hub-Signature-256 nunca bate (o corpo
 * re-serializado a partir do JSON já parseado tem bytes diferentes).
 * Com `Request`, `await request.text()` devolve o corpo bruto tal como veio.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === "GET") return handleVerification(request);
      if (request.method === "POST") return await handlePost(request);
      return new Response("Method Not Allowed", { status: 405 });
    } catch (err) {
      // Nunca vaza detalhes/segredos ao chamador; loga a mensagem apenas.
      console.error(
        `[webhook] Erro inesperado: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Responde 200 para a Meta não ficar reenviando indefinidamente.
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  },
};

/** GET /webhook — verificação inicial exigida pela Meta. */
function handleVerification(request: Request): Response {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (err) {
    // Erro de configuração: mostra só o nome da variável (nunca valores/segredos)
    // para diagnóstico direto no navegador.
    return new Response(
      `Erro de configuração: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    );
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** POST /webhook — recebe e processa mensagens. */
async function handlePost(request: Request): Promise<Response> {
  console.log("[webhook] POST recebido da Meta.");
  const env = getEnv();

  // Corpo BRUTO, byte a byte como a Meta enviou — é o que a assinatura cobre.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? undefined;

  if (!isValidSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
    // Loga só metadados (nunca o segredo nem a assinatura) para diagnóstico.
    console.warn(
      `[webhook] Assinatura inválida — payload rejeitado. ` +
        `header=${signature ? "presente" : "ausente"} ` +
        `rawBodyBytes=${Buffer.byteLength(rawBody, "utf8")}`,
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const extracted = extractFirstMessage(payload);
  if (!extracted) {
    // Provavelmente um evento de status (entregue/lido) — só reconhece.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Processa a mensagem e só então confirma. maxDuration=60s cobre STT+Claude.
  await handleIncomingMessage(extracted.message);
  return new Response("EVENT_RECEIVED", { status: 200 });
}
