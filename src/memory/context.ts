import { getSupabase, type MemoryKind, type MemoryRow } from "./supabase";

/**
 * Camada de acesso à memória. Todas as funções são escopadas por user_wa
 * (o número do dono) para nunca misturar contexto entre pessoas.
 */

const RECENT_HISTORY_LIMIT = 12;

export interface OwnerContext {
  fatos: string[];
  obras: string[];
  apelidos: string[];
  preferencias: string[];
  pendenciasAbertas: MemoryRow[];
}

/** Carrega fatos, obras, apelidos, preferências e pendências abertas. */
export async function loadOwnerContext(userWa: string): Promise<OwnerContext> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_memories")
    .select("*")
    .eq("user_wa", userWa)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar contexto do Supabase: ${error.message}`);
  }

  const rows = (data ?? []) as MemoryRow[];
  return {
    fatos: rows.filter((r) => r.kind === "fato").map((r) => r.content),
    obras: rows.filter((r) => r.kind === "obra").map((r) => r.content),
    apelidos: rows.filter((r) => r.kind === "apelido").map((r) => r.content),
    preferencias: rows.filter((r) => r.kind === "preferencia").map((r) => r.content),
    pendenciasAbertas: rows.filter(
      (r) => r.kind === "pendencia" && r.status === "aberta",
    ),
  };
}

/** Salva uma nova memória (fato/obra/apelido/pendencia/preferencia). */
export async function saveMemory(
  userWa: string,
  kind: MemoryKind,
  content: string,
  obra?: string | null,
): Promise<MemoryRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_memories")
    .insert({ user_wa: userWa, kind, content, obra: obra ?? null })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar memória: ${error.message}`);
  }
  return data as MemoryRow;
}

/** Lista pendências abertas, opcionalmente filtradas por obra/local. */
export async function getPending(
  userWa: string,
  obra?: string | null,
): Promise<MemoryRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_memories")
    .select("*")
    .eq("user_wa", userWa)
    .eq("kind", "pendencia")
    .eq("status", "aberta")
    .order("created_at", { ascending: false });

  if (obra) {
    query = query.ilike("obra", `%${obra}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar pendências: ${error.message}`);
  }
  return (data ?? []) as MemoryRow[];
}

/** Carrega as últimas mensagens da conversa (mais antigas primeiro). */
export async function loadRecentHistory(
  userWa: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_conversations")
    .select("role, content, created_at")
    .eq("user_wa", userWa)
    .order("created_at", { ascending: false })
    .limit(RECENT_HISTORY_LIMIT);

  if (error) {
    throw new Error(`Falha ao carregar histórico: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
  // Vieram do mais recente para o mais antigo; invertemos para ordem cronológica.
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

/** Registra uma mensagem no histórico de conversa. */
export async function appendConversation(
  userWa: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_conversations")
    .insert({ user_wa: userWa, role, content });
  if (error) {
    // Não derruba o fluxo por falha de log de histórico, mas registra.
    console.error("Falha ao gravar histórico de conversa:", error.message);
  }
}
