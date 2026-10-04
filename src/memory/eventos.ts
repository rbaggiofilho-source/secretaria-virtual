import { getSupabase } from "./supabase.js";

/**
 * Agenda INTERNA da Rosana (tabela secretaria_eventos). É a fonte da verdade dos
 * compromissos: o usuário cria e consulta compromissos SEM precisar conectar o
 * Google. Quando o Google está conectado, o evento é ESPELHADO lá (o id do
 * espelho fica em google_event_id). Tudo isolado por user_wa.
 */

export interface EventoRow {
  id: number;
  user_wa: string;
  titulo: string;
  inicio: string; // ISO (timestamptz)
  fim: string | null;
  local: string | null;
  descricao: string | null;
  obra: string | null;
  lembrete_em: string | null;
  lembrete_enviado: boolean;
  google_event_id: string | null;
  status: "ativo" | "cancelado";
  created_at: string;
  updated_at: string;
}

export interface CriarEventoInput {
  titulo: string;
  inicioIso: string;
  fimIso?: string | null;
  local?: string | null;
  descricao?: string | null;
  obra?: string | null;
  lembreteEmIso?: string | null;
  googleEventId?: string | null;
}

/** Cria um compromisso na agenda interna do usuário. */
export async function criarEvento(userWa: string, input: CriarEventoInput): Promise<EventoRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .insert({
      user_wa: userWa,
      titulo: input.titulo,
      inicio: input.inicioIso,
      fim: input.fimIso ?? null,
      local: input.local ?? null,
      descricao: input.descricao ?? null,
      obra: input.obra ?? null,
      lembrete_em: input.lembreteEmIso ?? null,
      google_event_id: input.googleEventId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao criar evento: ${error.message}`);
  return data as EventoRow;
}

/** Lista compromissos ATIVOS numa janela [desdeIso, ateIso], mais cedo primeiro. */
export async function listarEventos(
  userWa: string,
  desdeIso: string,
  ateIso: string,
): Promise<EventoRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .select("*")
    .eq("user_wa", userWa)
    .eq("status", "ativo")
    .gte("inicio", desdeIso)
    .lte("inicio", ateIso)
    .order("inicio", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Falha ao listar eventos: ${error.message}`);
  return (data ?? []) as EventoRow[];
}

/** Busca um evento interno pelo id (do próprio usuário). */
export async function getEvento(userWa: string, id: number): Promise<EventoRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .select("*")
    .eq("user_wa", userWa)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar evento: ${error.message}`);
  return ((data?.[0] as EventoRow | undefined) ?? null) || null;
}

export interface AtualizarEventoInput {
  titulo?: string | null;
  inicioIso?: string | null;
  fimIso?: string | null;
  local?: string | null;
  lembreteEmIso?: string | null;
  googleEventId?: string | null;
}

/** Atualiza um evento interno (só os campos informados). */
export async function atualizarEvento(
  userWa: string,
  id: number,
  patch: AtualizarEventoInput,
): Promise<EventoRow> {
  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.titulo !== undefined && patch.titulo !== null) campos.titulo = patch.titulo;
  if (patch.inicioIso !== undefined && patch.inicioIso !== null) campos.inicio = patch.inicioIso;
  if (patch.fimIso !== undefined) campos.fim = patch.fimIso;
  if (patch.local !== undefined) campos.local = patch.local;
  if (patch.lembreteEmIso !== undefined) campos.lembrete_em = patch.lembreteEmIso;
  if (patch.googleEventId !== undefined) campos.google_event_id = patch.googleEventId;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .update(campos)
    .eq("user_wa", userWa)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao atualizar evento: ${error.message}`);
  return data as EventoRow;
}

/**
 * Lembretes VENCIDOS a disparar (de TODOS os usuários) — para o agendador de
 * minuto. Janela [desdeIso, ateIso] evita reprocessar lembretes muito antigos
 * (ex.: que não entregaram por estarem fora da janela de 24h do WhatsApp).
 */
export async function lembretesVencidos(
  desdeIso: string,
  ateIso: string,
  limite = 50,
): Promise<EventoRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .select("*")
    .eq("status", "ativo")
    .eq("lembrete_enviado", false)
    .not("lembrete_em", "is", null)
    .gte("lembrete_em", desdeIso)
    .lte("lembrete_em", ateIso)
    .order("lembrete_em", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`Falha ao buscar lembretes vencidos: ${error.message}`);
  return (data ?? []) as EventoRow[];
}

/** Marca um lembrete como enviado (não reenvia). */
export async function marcarLembreteEnviado(id: number): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_eventos")
    .update({ lembrete_enviado: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao marcar lembrete enviado: ${error.message}`);
}

/** Cancela (soft-delete) um evento interno. Retorna o google_event_id, se houver. */
export async function cancelarEvento(userWa: string, id: number): Promise<EventoRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_eventos")
    .update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("user_wa", userWa)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao cancelar evento: ${error.message}`);
  return (data as EventoRow) ?? null;
}
