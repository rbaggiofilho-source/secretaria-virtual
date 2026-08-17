import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "../src/config/env.js";
import { handleIncomingMessage } from "../src/pipeline.js";
import { isValidSignature } from "../src/whatsapp/signature.js";
import { extractFirstMessage, type WhatsAppWebhookPayload } from "../src/whatsapp/types.js";

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
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (err) {
    // Erro de configuração: mostra só o nome da variável (nunca valores/segredos)
    // para diagnóstico direto no navegador.
    res
      .status(500)
      .send(`Erro de configuração: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
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
  console.log("[webhook] POST recebido da Meta.");
  const env = getEnv();
  const rawBody = await readRawBody(req);

  const signature = req.headers["x-hub-signature-256"];
  const sig = Array.isArray(signature) ? signature[0] : signature;

  if (!isValidSignature(rawBody, sig, env.WHATSAPP_APP_SECRET)) {
    // Loga só metadados (nunca o segredo nem a assinatura) para diagnóstico.
    console.warn(
      `[webhook] Assinatura inválida — payload rejeitado. ` +
        `header=${sig ? "presente" : "ausente"} rawBodyBytes=${rawBody.length}`,
    );
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

/**
 * Lê o corpo BRUTO da requisição, sem depender de `config.api.bodyParser`.
 *
 * O runtime @vercel/node nem sempre honra o bodyParser desligado: dependendo
 * da versão ele já consumiu o stream e entregou `req.body` pronto. Nesse caso
 * um `req.on("data"/"end")` nunca dispararia de novo e a função ficaria pendurada
 * até o maxDuration. Por isso a leitura é escalonada, do mais fiel ao menos:
 *   1. `req.rawBody`, quando o runtime preservou os bytes originais;
 *   2. o stream, se ainda não foi consumido;
 *   3. re-serialização de `req.body` (último recurso — pode alterar bytes e,
 *      com isso, invalidar a assinatura HMAC).
 */
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const preserved = (req as VercelRequest & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(preserved)) return preserved;
  if (typeof preserved === "string") return Buffer.from(preserved, "utf8");

  if (!req.readableEnded && !req.complete) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const streamed = Buffer.concat(chunks);
    if (streamed.length > 0) return streamed;
  }

  if (req.body !== undefined && req.body !== null) {
    console.warn(
      "[webhook] Corpo bruto indisponível (body parser do runtime consumiu o stream); " +
        "re-serializando req.body para validar a assinatura.",
    );
    return Buffer.from(
      typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      "utf8",
    );
  }

  return Buffer.alloc(0);
}
