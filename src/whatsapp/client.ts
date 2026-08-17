import { getEnv } from "../config/env.js";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Envia uma mensagem de texto de volta para o usuário no WhatsApp.
 * Deve ser chamado dentro da janela de atendimento de 24h (resposta a uma
 * mensagem do usuário), que é sempre o nosso caso.
 */
export async function sendTextMessage(to: string, body: string): Promise<void> {
  const env = getEnv();
  const url = `${GRAPH_BASE}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      // Responde ao wa_id EXATAMENTE como a Meta entregou. Para celulares
      // brasileiros o wa_id vem sem o 9 (ex.: 554888088057); a Meta resolve a
      // conta internamente. Inserir o 9 manualmente leva a API a aceitar o
      // envio (200) mas nao entregar — a mensagem some em silencio.
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    const detail = await safeErrorText(res);
    throw new Error(`Falha ao enviar mensagem no WhatsApp (${res.status}): ${detail}`);
  }

  // Confirma o envio com o id da mensagem devolvido pela Graph API. A entrega
  // efetiva chega depois, como evento de status no webhook (ver api/webhook.ts).
  const data = (await res.json().catch(() => null)) as
    | { messages?: Array<{ id?: string }> }
    | null;
  const wamid = data?.messages?.[0]?.id;
  console.log(`[whatsapp] Mensagem aceita pela Graph API para ${to} (id=${wamid ?? "?"}).`);
}

/**
 * Baixa uma mídia (áudio) do WhatsApp a partir do media_id.
 * Fluxo em 2 passos exigido pela Graph API:
 *   1) GET /{media_id} -> retorna uma URL temporária da mídia
 *   2) GET nessa URL (com o mesmo token) -> baixa os bytes
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const env = getEnv();

  // 1) Metadados da mídia (inclui a URL de download)
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  if (!metaRes.ok) {
    const detail = await safeErrorText(metaRes);
    throw new Error(`Falha ao obter metadados da mídia (${metaRes.status}): ${detail}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) {
    throw new Error("Metadados da mídia não trouxeram URL de download.");
  }

  // 2) Download dos bytes (a URL exige o mesmo Bearer token)
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  if (!fileRes.ok) {
    const detail = await safeErrorText(fileRes);
    throw new Error(`Falha ao baixar a mídia (${fileRes.status}): ${detail}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type ?? "audio/ogg",
  };
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(sem corpo)";
  }
}
