import type Anthropic from "@anthropic-ai/sdk";
import {
  createCalendarEvent,
  searchCalendarEvents,
  updateCalendarEvent,
  type CalendarAuth,
} from "../calendar/google.js";
import { oauthConfigured, signState } from "../oauth/google.js";
import { buildRdoPdf } from "../pdf/rdo.js";
import { sendDocumentMessage, sendTextMessage, uploadMedia } from "../whatsapp/client.js";
import {
  consultarFotos,
  consultarRDO,
  getOAuthToken,
  getPending,
  registrarCusto,
  registrarFoto,
  registrarRDO,
  relatorioCustos,
  saveMemory,
  type CategoriaCusto,
  type EfetivoItem,
  type TipoFoto,
  type UsuarioRow,
} from "../memory/context.js";
import { getEnv } from "../config/env.js";
import type { MemoryKind } from "../memory/supabase.js";

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
      "Cria um evento no calendário PESSOAL do usuário (sempre o pessoal, nunca calendário de empresa). Use datas em ISO 8601 com offset do fuso America/Sao_Paulo (ex.: 2026-08-15T09:00:00-03:00). Em caso de erro, avise o usuário.",
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
    name: "conectar_agenda",
    description:
      "Envia ao usuário um link para ele conectar a PRÓPRIA agenda do Google à Rosana (login/autorização Google). Use quando o usuário ainda não tem a agenda conectada e quer criar/ver compromissos, ou quando ele pedir para conectar/trocar a agenda (inclusive se pedir 'outro link' / 'de novo' — SEMPRE chame a tool de novo, nunca reaproveite um link anterior). O PRÓPRIO SISTEMA já envia o link numa mensagem separada; você NÃO deve escrever, copiar nem inventar a URL — só confirme em 1 frase que enviou.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
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
      "Lista as pendências abertas do usuário, opcionalmente filtradas por obra/local.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra/local (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_custo",
    description:
      "Lança um custo/gasto numa OBRA (centro de custo). Use quando o usuário disser que pagou/gastou algo numa obra (ex.: 'paguei 3000 de pedreiro na CCC'). Valor em reais (número). categoria: material, mao_de_obra, equipamento, servico ou outro. data em YYYY-MM-DD só se ele mencionar um dia diferente de hoje.",
    input_schema: {
      type: "object",
      properties: {
        valor: { type: "number", description: "Valor em reais (ex.: 3000.50)" },
        obra: { type: "string", description: "Obra/centro de custo (use o apelido se houver)" },
        categoria: {
          type: "string",
          enum: ["material", "mao_de_obra", "equipamento", "servico", "outro"],
          description: "Categoria do gasto",
        },
        descricao: { type: "string", description: "Descrição curta (opcional)" },
        data: { type: "string", description: "Data do gasto em YYYY-MM-DD (opcional)" },
      },
      required: ["valor"],
      additionalProperties: false,
    },
  },
  {
    name: "relatorio_custos",
    description:
      "Gera o total de custos e a divisão por categoria, opcionalmente por obra e intervalo de datas. Use quando o usuário perguntar quanto gastou (ex.: 'quanto já gastei na CCC esse mês?'). Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_rdo",
    description:
      "Registra o Relatório Diário de Obra (RDO) de uma obra num dia, a partir do relato do usuário (geralmente um áudio no fim do dia). Extraia clima, efetivo (mão de obra por função), atividades executadas, ocorrências e materiais recebidos. Envie SEMPRE o conteúdo completo do dia — reenviar substitui o RDO daquele dia. data em YYYY-MM-DD só se ele mencionar outro dia que não hoje. Se a obra não estiver clara, pergunte antes.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra do relatório (use o apelido se houver)" },
        data: { type: "string", description: "Data do RDO em YYYY-MM-DD (opcional, padrão hoje)" },
        clima: { type: "string", description: "Condições do tempo (opcional)" },
        efetivo: {
          type: "array",
          description: "Mão de obra presente por função",
          items: {
            type: "object",
            properties: {
              funcao: { type: "string", description: "Ex.: pedreiro, servente, carpinteiro" },
              qtd: { type: "integer", description: "Quantidade de pessoas nessa função" },
            },
            required: ["funcao", "qtd"],
            additionalProperties: false,
          },
        },
        atividades: { type: "string", description: "Atividades/serviços executados no dia" },
        ocorrencias: { type: "string", description: "Ocorrências, atrasos, problemas (opcional)" },
        materiais: { type: "string", description: "Materiais recebidos/entregas (opcional)" },
      },
      required: ["obra"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_rdo",
    description:
      "Consulta os RDOs registrados, por obra e/ou intervalo de datas. Use quando o usuário pedir o diário de uma obra ou um resumo do período. Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_foto",
    description:
      "Registra uma imagem que o usuário enviou (foto da obra ou nota fiscal). Você VÊ a imagem: gere uma descrição objetiva do que aparece. tipo: 'foto_obra' (andamento, serviço, problema) ou 'nota_fiscal'. Associe à obra (pergunte se não estiver claro). Se for NOTA FISCAL de um gasto de obra, ALÉM disso chame registrar_custo com o valor e itens lidos. data em YYYY-MM-DD só se diferente de hoje.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra associada (use o apelido se houver)" },
        tipo: {
          type: "string",
          enum: ["foto_obra", "nota_fiscal", "outro"],
          description: "Tipo da imagem",
        },
        descricao: { type: "string", description: "Descrição objetiva do que aparece na imagem" },
        data: { type: "string", description: "Data em YYYY-MM-DD (opcional)" },
      },
      required: ["descricao"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_fotos",
    description:
      "Lista o registro fotográfico (descrições), por obra, tipo e/ou intervalo de datas. Use quando o usuário perguntar o que foi fotografado/registrado numa obra. Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        tipo: {
          type: "string",
          enum: ["foto_obra", "nota_fiscal", "outro"],
          description: "Filtrar por tipo (opcional)",
        },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "gerar_rdo_pdf",
    description:
      "Gera o PDF do Diário de Obra (RDO) de uma obra e ENVIA como documento no WhatsApp do usuário. Use quando ele(a) pedir o PDF/relatório do diário (ex.: 'me manda o PDF do diário da CCC desse mês'). Informe obra e, se ele delimitar, o período (desde/ate em YYYY-MM-DD). Depois de chamar, confirme por texto que o PDF foi enviado.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra do relatório (use o apelido se houver)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: ["obra"],
      additionalProperties: false,
    },
  },
];

/**
 * Executa uma tool call. Retorna { text, isError }.
 * Nunca lança: erros viram tool_result com is_error para o modelo avisar o dono.
 */
export async function runTool(
  usuario: UsuarioRow,
  name: string,
  input: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const userWa = usuario.user_wa;

  // Auth de calendário resolvida pelo SERVIDOR (nunca pelo modelo), sob demanda:
  // - OAuth: usuário conectou a própria conta Google -> escreve no "primary" dele;
  // - service + calendar_id: usuário compartilhou o calendário (legado);
  // - service + null (só dono): fallback GOOGLE_CALENDAR_ID (Ricardo);
  // - nenhum: SEM calendário — a tool avisa e oferece conectar, nunca cai no
  //   calendário de outra pessoa.
  let calAuthCache: { value: CalendarAuth | null } | undefined;
  async function resolveCalAuth(): Promise<CalendarAuth | null> {
    if (calAuthCache) return calAuthCache.value;
    let value: CalendarAuth | null = null;
    const tok = await getOAuthToken(userWa);
    if (tok) {
      value = { kind: "oauth", refreshToken: tok.refresh_token };
    } else if (usuario.dono || usuario.calendar_id) {
      value = { kind: "service", calendarId: usuario.calendar_id ?? null };
    }
    calAuthCache = { value };
    return value;
  }
  const SEM_CALENDARIO = JSON.stringify({
    ok: false,
    error:
      `A agenda do Google de ${usuario.nome} ainda não está conectada. ` +
      "Chame a tool conectar_agenda e envie o link para o usuário autorizar o acesso à agenda dele.",
  });

  try {
    switch (name) {
      case "conectar_agenda": {
        if (!oauthConfigured()) {
          return {
            isError: true,
            text: JSON.stringify({
              ok: false,
              error:
                "A conexão de agenda por OAuth ainda não está configurada no servidor. Avise o administrador.",
            }),
          };
        }
        // O SERVIDOR envia o link (não o modelo): a assinatura do state tem 43
        // caracteres aleatórios e o modelo corromperia ao transcrever de memória.
        // O state já é URL-safe (base64url + "."), então vai cru, sem encode.
        const url = `${getEnv().PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/oauth/start?s=${signState(userWa)}`;
        await sendTextMessage(
          userWa,
          "Para conectar sua agenda do Google, toque no link abaixo, escolha sua conta e autorize:\n\n" +
            url,
        );
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            enviado: true,
            instrucao:
              "O link JÁ FOI ENVIADO ao usuário numa mensagem separada. NÃO escreva/repita o link nem invente uma URL. Apenas confirme em 1 frase curta que enviou o link e que é só abrir, escolher a conta Google e autorizar (se aparecer aviso de app não verificado, tocar em Avançado → Continuar).",
          }),
        };
      }

      case "create_calendar_event": {
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
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
        }, calAuth);
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
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
        const ev = await updateCalendarEvent({
          eventId: String(input.event_id),
          startIso: input.start_iso ? String(input.start_iso) : undefined,
          endIso: input.end_iso ? String(input.end_iso) : undefined,
          title: input.title ? String(input.title) : undefined,
          location: input.location ? String(input.location) : undefined,
        }, calAuth);
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
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
        const events = await searchCalendarEvents(
          String(input.start_iso),
          String(input.end_iso),
          calAuth,
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

      case "registrar_custo": {
        const row = await registrarCusto(userWa, {
          valor: Number(input.valor),
          obra: input.obra ? String(input.obra) : null,
          categoria: input.categoria
            ? (String(input.categoria) as CategoriaCusto)
            : undefined,
          descricao: input.descricao ? String(input.descricao) : null,
          data: input.data ? String(input.data) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            categoria: row.categoria,
            valor: row.valor,
            data: row.data,
          }),
        };
      }

      case "relatorio_custos": {
        const rel = await relatorioCustos(userWa, {
          obra: input.obra ? String(input.obra) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return { isError: false, text: JSON.stringify({ ok: true, ...rel }) };
      }

      case "registrar_rdo": {
        const efetivo = Array.isArray(input.efetivo)
          ? (input.efetivo as unknown[]).map((e) => {
              const o = (e ?? {}) as Record<string, unknown>;
              return { funcao: String(o.funcao ?? ""), qtd: Number(o.qtd ?? 0) } as EfetivoItem;
            })
          : undefined;
        const row = await registrarRDO(userWa, {
          obra: String(input.obra),
          data: input.data ? String(input.data) : null,
          clima: input.clima ? String(input.clima) : null,
          efetivo,
          atividades: input.atividades ? String(input.atividades) : null,
          ocorrencias: input.ocorrencias ? String(input.ocorrencias) : null,
          materiais: input.materiais ? String(input.materiais) : null,
        });
        const totalEfetivo = row.efetivo.reduce((s, e) => s + (Number(e.qtd) || 0), 0);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            data: row.data,
            efetivo_total: totalEfetivo,
          }),
        };
      }

      case "consultar_rdo": {
        const rows = await consultarRDO(userWa, {
          obra: input.obra ? String(input.obra) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            rdos: rows.map((r) => ({
              data: r.data,
              obra: r.obra,
              clima: r.clima,
              efetivo: r.efetivo,
              atividades: r.atividades,
              ocorrencias: r.ocorrencias,
              materiais: r.materiais,
            })),
          }),
        };
      }

      case "registrar_foto": {
        const row = await registrarFoto(userWa, {
          obra: input.obra ? String(input.obra) : null,
          tipo: input.tipo ? (String(input.tipo) as TipoFoto) : undefined,
          descricao: input.descricao ? String(input.descricao) : null,
          data: input.data ? String(input.data) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            tipo: row.tipo,
            data: row.data,
          }),
        };
      }

      case "consultar_fotos": {
        const rows = await consultarFotos(userWa, {
          obra: input.obra ? String(input.obra) : null,
          tipo: input.tipo ? (String(input.tipo) as TipoFoto) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            fotos: rows.map((r) => ({
              data: r.data,
              obra: r.obra,
              tipo: r.tipo,
              descricao: r.descricao,
            })),
          }),
        };
      }

      case "gerar_rdo_pdf": {
        const obra = String(input.obra);
        const desde = input.desde ? String(input.desde) : null;
        const ate = input.ate ? String(input.ate) : null;
        const rdos = await consultarRDO(userWa, { obra, desde, ate });
        if (rdos.length === 0) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error: "Nenhum RDO encontrado para essa obra/período.",
            }),
          };
        }
        const periodoLabel =
          desde || ate ? `${desde ?? "início"} a ${ate ?? "hoje"}` : undefined;
        const bytes = await buildRdoPdf({ obra, rdos, periodoLabel });
        const slug = obra.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
        const filename = `RDO_${slug || "obra"}.pdf`;
        const mediaId = await uploadMedia(bytes, "application/pdf", filename);
        await sendDocumentMessage(userWa, mediaId, filename, `RDO — ${obra}`);
        return {
          isError: false,
          text: JSON.stringify({ ok: true, enviado: true, dias: rdos.length }),
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
