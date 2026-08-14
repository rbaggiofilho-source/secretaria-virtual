import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "../src/config/env.ts";
import { handleIncomingMessage } from "../src/pipeline.ts";
import { isValidSignature } from "../src/whatsapp/signature.ts";
import { extractFirstMessage, type WhatsAppWebhookPayload } from "../src/whatsapp/types.ts";

/**
 * Webhook único da WhatsApp Cloud API.
 *   GET  -> handshake de verificação da Meta (hub.challenge / hub.verify_token)
 *   POST -> recepção de mensagens (valida X-Hub-Signature-256 antes de processar)
 *
 * O body parser da Vercel é desligado para termos o corpo BRUTO exato,
 * necessário para validar a assinatura HMAC.
 */
export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    if (req.method === "GET") return handleVerification(req, res);
    if (req.method === "POST") return await handlePost(req, res);
    res.status(405).send("Method Not Allowed");
  } catch (err) {
    // Nunca vaza detalhes/segredos ao chamador; loga a mensagem apenas.
    console.error(
      `[webhook] Erro inesperado: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Responde 200 para a Meta não ficar reenviando indefinidamente.
    res.status(200).send("EVENT_RECEIVED");
  }
}

/** GET /webhook — verificação inicial exigida pela Meta. */
function handleVerification(req: VercelRequest, res: VercelResponse): void {
  const env = getEnv();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.status(403).send("Forbidden");
}

/** POST /webhook — recebe e processa mensagens. */
async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const env = getEnv();
  const rawBody = await readRawBody(req);

  const signature = req.headers["x-hub-signature-256"];
  const sig = Array.isArray(signature) ? signature[0] : signature;

  if (!isValidSignature(rawBody, sig, env.WHATSAPP_APP_SECRET)) {
    console.warn("[webhook] Assinatura inválida — payload rejeitado.");
    res.status(401).send("Invalid signature");
    return;
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).send("Bad JSON");
    return;
  }

  const extracted = extractFirstMessage(payload);
  if (!extracted) {
    // Provavelmente um evento de status (entregue/lido) — só reconhece.
    res.status(200).send("EVENT_RECEIVED");
    return;
  }

  // Processa a mensagem e só então confirma. maxDuration=60s cobre STT+Claude.
  await handleIncomingMessage(extracted.message);
  res.status(200).send("EVENT_RECEIVED");
}

/** Lê o corpo bruto da requisição (body parser desligado). */
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
