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
      to: normalizeRecipient(to),
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    const detail = await safeErrorText(res);
    throw new Error(`Falha ao enviar mensagem no WhatsApp (${res.status}): ${detail}`);
  }
}

/**
 * Ajusta o "nono dígito" dos celulares brasileiros antes de enviar.
 *
 * O `wa_id` que a Meta entrega no webhook vem SEM o 9 inicial do celular
 * (ex.: 554888088057), mas a lista de destinatários permitidos do modo de
 * desenvolvimento guarda o número COM o 9 (5548988088057). A comparação é
 * literal, então responder ao wa_id cru resulta em
 * "(#131030) Recipient phone number not in allowed list".
 *
 * Regra: 55 + DDD (2) + 8 dígitos começando em 6-9 é celular antigo — insere
 * o 9. Fixos (2-5) e números já com 9 dígitos ficam intactos, assim como
 * qualquer número de outro país.
 */
function normalizeRecipient(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (!digits.startsWith("55") || digits.length !== 12) return digits || to;

  const ddd = digits.slice(2, 4);
  const local = digits.slice(4);
  if (!/^[6-9]/.test(local)) return digits;

  return `55${ddd}9${local}`;
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
