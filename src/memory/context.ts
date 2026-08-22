import { getSupabase, type MemoryKind, type MemoryRow } from "./supabase.js";

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

/**
 * Marca uma mensagem do WhatsApp como processada, de forma atômica.
 *
 * A Meta reenvia o mesmo evento (mesmo `wa_message_id`) quando não recebe o
 * 200 a tempo. Inserimos o id numa tabela com PRIMARY KEY: se a inserção
 * vencer, somos o primeiro a tratar essa mensagem (retorna true); se colidir
 * (código 23505 = unique_violation), é uma reentrega e deve ser ignorada
 * (retorna false). Isso impede que uma retentativa crie um evento duplicado.
 *
 * Em erro inesperado do banco, retornamos true (fail-open): melhor arriscar um
 * raro duplicado do que engolir uma mensagem legítima do dono.
 */
export async function claimMessageOnce(messageId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_processed_messages")
    .insert({ wa_message_id: messageId });

  if (!error) return true;
  if (error.code === "23505") return false; // já processada (reentrega)

  console.error(`Falha ao registrar dedup da mensagem ${messageId}: ${error.message}`);
  return true; // fail-open
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

/** Categorias de custo aceitas (espelham o CHECK da tabela secretaria_custos). */
export type CategoriaCusto =
  | "material"
  | "mao_de_obra"
  | "equipamento"
  | "servico"
  | "outro";

export interface CustoRow {
  id: number;
  user_wa: string;
  obra: string | null;
  categoria: CategoriaCusto;
  valor: number;
  descricao: string | null;
  data: string;
  created_at: string;
}

/** Lança um custo numa obra (centro de custo). */
export async function registrarCusto(
  userWa: string,
  params: {
    valor: number;
    obra?: string | null;
    categoria?: CategoriaCusto;
    descricao?: string | null;
    data?: string | null;
  },
): Promise<CustoRow> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = {
    user_wa: userWa,
    valor: params.valor,
    obra: params.obra ?? null,
    categoria: params.categoria ?? "outro",
    descricao: params.descricao ?? null,
  };
  if (params.data) row.data = params.data; // senão usa o default (hoje, fuso BR)

  const { data, error } = await supabase
    .from("secretaria_custos")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar custo: ${error.message}`);
  return data as CustoRow;
}

export interface RelatorioCustos {
  total: number;
  porCategoria: Record<string, number>;
  itens: Array<Pick<CustoRow, "id" | "obra" | "categoria" | "valor" | "descricao" | "data">>;
}

/** Relatório de custos, opcionalmente por obra e intervalo de datas (YYYY-MM-DD). */
export async function relatorioCustos(
  userWa: string,
  filtros: { obra?: string | null; desde?: string | null; ate?: string | null } = {},
): Promise<RelatorioCustos> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_custos")
    .select("id, obra, categoria, valor, descricao, data")
    .eq("user_wa", userWa)
    .order("data", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", `%${filtros.obra}%`);
  if (filtros.desde) query = query.gte("data", filtros.desde);
  if (filtros.ate) query = query.lte("data", filtros.ate);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao gerar relatório de custos: ${error.message}`);

  const itens = (data ?? []) as RelatorioCustos["itens"];
  let total = 0;
  const porCategoria: Record<string, number> = {};
  for (const it of itens) {
    const v = Number(it.valor) || 0;
    total += v;
    porCategoria[it.categoria] = (porCategoria[it.categoria] ?? 0) + v;
  }
  return { total, porCategoria, itens };
}

/** Um item do efetivo (mão de obra presente no dia). */
export interface EfetivoItem {
  funcao: string;
  qtd: number;
}

export interface RdoRow {
  id: number;
  user_wa: string;
  obra: string;
  data: string;
  clima: string | null;
  efetivo: EfetivoItem[];
  atividades: string | null;
  ocorrencias: string | null;
  materiais: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Registra (ou atualiza) o RDO de uma obra num dia. Upsert por
 * (user_wa, obra, data): reenviar o mesmo dia SUBSTITUI o registro, então o
 * agente deve mandar o conteúdo completo do dia a cada chamada.
 */
export async function registrarRDO(
  userWa: string,
  params: {
    obra: string;
    data?: string | null;
    clima?: string | null;
    efetivo?: EfetivoItem[] | null;
    atividades?: string | null;
    ocorrencias?: string | null;
    materiais?: string | null;
  },
): Promise<RdoRow> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = {
    user_wa: userWa,
    obra: params.obra,
    clima: params.clima ?? null,
    efetivo: params.efetivo ?? [],
    atividades: params.atividades ?? null,
    ocorrencias: params.ocorrencias ?? null,
    materiais: params.materiais ?? null,
    updated_at: new Date().toISOString(),
  };
  if (params.data) row.data = params.data;

  const { data, error } = await supabase
    .from("secretaria_rdo")
    .upsert(row, { onConflict: "user_wa,obra,data" })
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar RDO: ${error.message}`);
  return data as RdoRow;
}

/** Consulta RDOs por obra e/ou intervalo (YYYY-MM-DD), mais recentes primeiro. */
export async function consultarRDO(
  userWa: string,
  filtros: { obra?: string | null; desde?: string | null; ate?: string | null } = {},
): Promise<RdoRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_rdo")
    .select("*")
    .eq("user_wa", userWa)
    .order("data", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", `%${filtros.obra}%`);
  if (filtros.desde) query = query.gte("data", filtros.desde);
  if (filtros.ate) query = query.lte("data", filtros.ate);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar RDO: ${error.message}`);
  return (data ?? []) as RdoRow[];
}

export type TipoFoto = "foto_obra" | "nota_fiscal" | "outro";

export interface FotoRow {
  id: number;
  user_wa: string;
  obra: string | null;
  data: string;
  tipo: TipoFoto;
  descricao: string | null;
  caminho: string | null;
  created_at: string;
}

/** Registra uma foto/imagem (descrição gerada pela IA + metadados). */
export async function registrarFoto(
  userWa: string,
  params: {
    obra?: string | null;
    tipo?: TipoFoto;
    descricao?: string | null;
    data?: string | null;
    caminho?: string | null;
  },
): Promise<FotoRow> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = {
    user_wa: userWa,
    obra: params.obra ?? null,
    tipo: params.tipo ?? "foto_obra",
    descricao: params.descricao ?? null,
    caminho: params.caminho ?? null,
  };
  if (params.data) row.data = params.data;

  const { data, error } = await supabase
    .from("secretaria_fotos")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar foto: ${error.message}`);
  return data as FotoRow;
}

/** Consulta o registro fotográfico por obra, tipo e/ou intervalo (YYYY-MM-DD). */
export async function consultarFotos(
  userWa: string,
  filtros: {
    obra?: string | null;
    tipo?: TipoFoto | null;
    desde?: string | null;
    ate?: string | null;
  } = {},
): Promise<FotoRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_fotos")
    .select("*")
    .eq("user_wa", userWa)
    .order("data", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", `%${filtros.obra}%`);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.desde) query = query.gte("data", filtros.desde);
  if (filtros.ate) query = query.lte("data", filtros.ate);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar fotos: ${error.message}`);
  return (data ?? []) as FotoRow[];
}
