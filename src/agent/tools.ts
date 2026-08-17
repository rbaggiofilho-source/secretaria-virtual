import type Anthropic from "@anthropic-ai/sdk";
import {
  createCalendarEvent,
  searchCalendarEvents,
  updateCalendarEvent,
} from "../calendar/google";
import { getPending, saveMemory } from "../memory/context";
import type { MemoryKind } from "../memory/supabase";

/**
 * Definição das tools que o Claude pode chamar (function calling) e o
 * dispatcher que as executa. Cada tool retorna string (vira tool_result).
 *
 * Falhas são capturadas e devolvidas como resultado com marcador de erro,
 * para que a secretária AVISE o dono em vez de descartar em silêncio.
 */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_calendar_event",
    description:
      "Cria um evento no calendário PESSOAL do Ricardo (sempre pessoal, nunca ENGETEC). Use datas em ISO 8601 com offset do fuso America/Sao_Paulo (ex.: 2026-08-15T09:00:00-03:00). Em caso de erro, avise o Ricardo.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do compromisso" },
        start_iso: { type: "string", description: "Início em ISO 8601 com offset" },
        end_iso: { type: "string", description: "Fim em ISO 8601 com offset" },
        location: { type: "string", description: "Endereço/local (opcional)" },
        description: { type: "string", description: "Detalhes (opcional)" },
        reminder_minutes: {
          type: "integer",
          description: "Minutos antes para lembrete (opcional)",
        },
      },
      required: ["title", "start_iso", "end_iso"],
      additionalProperties: false,
    },
  },
  {
    name: "update_calendar_event",
    description:
      "Atualiza um evento existente no calendário pessoal. Use search_calendar_events antes para obter o event_id.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "ID do evento a atualizar" },
        start_iso: { type: "string", description: "Novo início ISO 8601 (opcional)" },
        end_iso: { type: "string", description: "Novo fim ISO 8601 (opcional)" },
        title: { type: "string", description: "Novo título (opcional)" },
        location: { type: "string", description: "Novo local (opcional)" },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_calendar_events",
    description:
      "Busca eventos do calendário pessoal numa janela de tempo. Use antes de atualizar um evento existente.",
    input_schema: {
      type: "object",
      properties: {
        start_iso: { type: "string", description: "Início da janela ISO 8601" },
        end_iso: { type: "string", description: "Fim da janela ISO 8601" },
      },
      required: ["start_iso", "end_iso"],
      additionalProperties: false,
    },
  },
  {
    name: "save_memory",
    description:
      "Salva uma memória de longo prazo. kind: 'fato', 'obra', 'apelido', 'pendencia' ou 'preferencia'. Para pendências, informe 'obra' quando fizer sentido.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["fato", "obra", "apelido", "pendencia", "preferencia"],
        },
        content: { type: "string", description: "Conteúdo da memória" },
        obra: {
          type: "string",
          description: "Obra/local associado (opcional, útil em pendências)",
        },
      },
      required: ["kind", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "get_pending",
    description:
      "Lista as pendências abertas do Ricardo, opcionalmente filtradas por obra/local.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra/local (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

/**
 * Executa uma tool call. Retorna { text, isError }.
 * Nunca lança: erros viram tool_result com is_error para o modelo avisar o dono.
 */
export async function runTool(
  userWa: string,
  name: string,
  input: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  try {
    switch (name) {
      case "create_calendar_event": {
        const ev = await createCalendarEvent({
          title: String(input.title),
          startIso: String(input.start_iso),
          endIso: String(input.end_iso),
          location: input.location ? String(input.location) : undefined,
          description: input.description ? String(input.description) : undefined,
          reminderMinutes:
            typeof input.reminder_minutes === "number"
              ? input.reminder_minutes
              : undefined,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            event_id: ev.id,
            title: ev.title,
            start: ev.start,
            end: ev.end,
            link: ev.htmlLink,
          }),
        };
      }

      case "update_calendar_event": {
        const ev = await updateCalendarEvent({
          eventId: String(input.event_id),
          startIso: input.start_iso ? String(input.start_iso) : undefined,
          endIso: input.end_iso ? String(input.end_iso) : undefined,
          title: input.title ? String(input.title) : undefined,
          location: input.location ? String(input.location) : undefined,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            event_id: ev.id,
            title: ev.title,
            start: ev.start,
            end: ev.end,
          }),
        };
      }

      case "search_calendar_events": {
        const events = await searchCalendarEvents(
          String(input.start_iso),
          String(input.end_iso),
        );
        return { isError: false, text: JSON.stringify({ ok: true, events }) };
      }

      case "save_memory": {
        const row = await saveMemory(
          userWa,
          input.kind as MemoryKind,
          String(input.content),
          input.obra ? String(input.obra) : null,
        );
        return {
          isError: false,
          text: JSON.stringify({ ok: true, id: row.id, kind: row.kind }),
        };
      }

      case "get_pending": {
        const rows = await getPending(
          userWa,
          input.obra ? String(input.obra) : null,
        );
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            pendencias: rows.map((r) => ({
              id: r.id,
              content: r.content,
              obra: r.obra,
            })),
          }),
        };
      }

      default:
        return { isError: true, text: `Tool desconhecida: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Marcado como erro para o modelo AVISAR o dono (regra: nada em silêncio).
    return { isError: true, text: JSON.stringify({ ok: false, error: message }) };
  }
}
