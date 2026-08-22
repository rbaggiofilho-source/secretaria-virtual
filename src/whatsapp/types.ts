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

export interface WhatsAppOtherMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppAudioMessage
  | WhatsAppImageMessage
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
