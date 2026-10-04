/**
 * Tipos mínimos do payload do webhook da WhatsApp Cloud API.
 * Cobrimos só o que usamos (texto e áudio). O payload real tem muito mais
 * campos, mas mantemos o tipo enxuto e defensivo.
 */

export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppAudioMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "audio";
  audio: { id: string; mime_type?: string; voice?: boolean };
}

export interface WhatsAppImageMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "image";
  image: { id: string; mime_type?: string; caption?: string; sha256?: string };
}

/**
 * Resposta a uma mensagem interativa (o usuário tocou num botão de resposta
 * rápida ou escolheu um item de lista). A Meta devolve o título escolhido.
 */
export interface WhatsAppInteractiveMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "interactive";
  interactive: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

export interface WhatsAppOtherMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Texto escolhido numa mensagem interativa (botão/lista) — tratado como se o
 * usuário tivesse digitado o título. Vazio se não for uma resposta interativa.
 */
export function interactiveReplyText(message: WhatsAppMessage): string {
  if (message.type !== "interactive") return "";
  const it = (message as WhatsAppInteractiveMessage).interactive;
  return (it?.button_reply?.title ?? it?.list_reply?.title ?? "").trim();
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppAudioMessage
  | WhatsAppImageMessage
  | WhatsAppInteractiveMessage
  | WhatsAppOtherMessage;

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

/** Extrai a primeira mensagem de usuário do payload (ignora status/entregas). */
export function extractFirstMessage(
  payload: WhatsAppWebhookPayload,
): { message: WhatsAppMessage; contactName?: string } | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const messages = value?.messages;
      if (messages && messages.length > 0) {
        const contactName = value?.contacts?.[0]?.profile?.name;
        return { message: messages[0]!, contactName };
      }
    }
  }
  return null;
}
