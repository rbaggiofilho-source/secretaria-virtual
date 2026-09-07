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

/** Busca uma foto específica do usuário pelo id (para reenviar o arquivo). */
export async function getFoto(userWa: string, id: number): Promise<FotoRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_fotos")
    .select("*")
    .eq("user_wa", userWa)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar foto: ${error.message}`);
  return (data as FotoRow | null) ?? null;
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

/** Usuário autorizado da Rosana (linha em secretaria_usuarios). */
export interface UsuarioRow {
  user_wa: string;
  nome: string;
  calendar_id: string | null;
  contextos: string | null;
  dono: boolean;
  ativo: boolean;
}

/** Busca o usuário pelo wa_id. Retorna null se não cadastrado. */
export async function getUsuario(userWa: string): Promise<UsuarioRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, nome, calendar_id, contextos, dono, ativo")
    .eq("user_wa", userWa)
    .maybeSingle();

  if (error) {
    // Falha de infra não pode virar "acesso negado" silencioso: propaga.
    throw new Error(`Falha ao buscar usuário: ${error.message}`);
  }
  return (data as UsuarioRow | null) ?? null;
}

/**
 * Gera as variantes de wa_id de um número BR de celular. A Meta pode entregar
 * COM ou SEM o nono dígito, então guardamos as duas formas (12 e 13 dígitos)
 * para o mesmo usuário — igual fizemos com a Malu.
 */
export function waIdVariants(input: string): string[] {
  const d = input.replace(/\D/g, "");
  const out = new Set<string>();
  if (d) out.add(d);
  // BR celular: 55 + DDD(2) + numero. 13 dígitos = com 9; 12 = sem 9.
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") {
    out.add(d.slice(0, 4) + d.slice(5)); // remove o 9 -> 12 dígitos
  } else if (d.startsWith("55") && d.length === 12) {
    out.add(d.slice(0, 4) + "9" + d.slice(4)); // insere o 9 -> 13 dígitos
  }
  return [...out];
}

export interface CadastroInput {
  nomeCompleto: string;
  cpf?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  whatsappInput: string;
}

/**
 * Cria/atualiza o cadastro de um usuário do beta (uma linha por variante de
 * wa_id). status='ativo', dono=false. Retorna os wa_ids gravados.
 */
export async function registrarCadastro(dados: CadastroInput): Promise<string[]> {
  const supabase = getSupabase();
  const waIds = waIdVariants(dados.whatsappInput);
  if (waIds.length === 0) throw new Error("Número de WhatsApp inválido.");

  const nome = dados.nomeCompleto.trim().split(/\s+/)[0] || dados.nomeCompleto.trim();
  const rows = waIds.map((user_wa) => ({
    user_wa,
    nome,
    nome_completo: dados.nomeCompleto.trim(),
    cpf: dados.cpf?.trim() || null,
    endereco: dados.endereco?.trim() || null,
    profissao: dados.profissao?.trim() || null,
    status: "ativo",
    ativo: true,
    dono: false,
  }));

  const { error } = await supabase
    .from("secretaria_usuarios")
    .upsert(rows, { onConflict: "user_wa" });
  if (error) throw new Error(`Falha ao gravar cadastro: ${error.message}`);
  return waIds;
}

/* ---------- Documentos e prazos da obra ---------- */

export type TipoDocumento =
  | "alvara"
  | "art"
  | "rrt"
  | "aso"
  | "licenca"
  | "seguro"
  | "contrato"
  | "certidao"
  | "outro";

export interface DocumentoRow {
  id: number;
  user_wa: string;
  obra: string | null;
  tipo: TipoDocumento;
  descricao: string;
  numero: string | null;
  emissao: string | null;
  vencimento: string | null;
  responsavel: string | null;
  status: "ativo" | "arquivado";
  lembrete_event_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Registra um documento/prazo da obra (alvará, ART, ASO, licença, etc.). */
export async function registrarDocumento(
  userWa: string,
  params: {
    tipo?: TipoDocumento;
    descricao: string;
    obra?: string | null;
    numero?: string | null;
    emissao?: string | null;
    vencimento?: string | null;
    responsavel?: string | null;
  },
): Promise<DocumentoRow> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = {
    user_wa: userWa,
    tipo: params.tipo ?? "outro",
    descricao: params.descricao,
    obra: params.obra ?? null,
    numero: params.numero ?? null,
    emissao: params.emissao ?? null,
    vencimento: params.vencimento ?? null,
    responsavel: params.responsavel ?? null,
  };

  const { data, error } = await supabase
    .from("secretaria_documentos")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar documento: ${error.message}`);
  return data as DocumentoRow;
}

/** Vincula o id do evento de lembrete (agenda) a um documento já criado. */
export async function setDocumentoLembrete(
  userWa: string,
  documentoId: number,
  eventId: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_documentos")
    .update({ lembrete_event_id: eventId, updated_at: new Date().toISOString() })
    .eq("user_wa", userWa)
    .eq("id", documentoId);
  if (error) {
    console.error(`Falha ao vincular lembrete ao documento ${documentoId}: ${error.message}`);
  }
}

/** Consulta documentos, por obra/tipo, mais próximos do vencimento primeiro. */
export async function consultarDocumentos(
  userWa: string,
  filtros: {
    obra?: string | null;
    tipo?: TipoDocumento | null;
    incluirArquivados?: boolean;
  } = {},
): Promise<DocumentoRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_documentos")
    .select("*")
    .eq("user_wa", userWa)
    .order("vencimento", { ascending: true, nullsFirst: false });

  if (!filtros.incluirArquivados) query = query.eq("status", "ativo");
  if (filtros.obra) query = query.ilike("obra", `%${filtros.obra}%`);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar documentos: ${error.message}`);
  return (data ?? []) as DocumentoRow[];
}

/* ---------- Materiais / compras / cotações ---------- */

export type MaterialStatus =
  | "a_comprar"
  | "cotando"
  | "comprado"
  | "entregue"
  | "cancelado";

export interface Cotacao {
  fornecedor: string;
  valor_unitario: number | null;
  obs?: string | null;
}

export interface MaterialRow {
  id: number;
  user_wa: string;
  obra: string | null;
  item: string;
  quantidade: number | null;
  unidade: string | null;
  status: MaterialStatus;
  fornecedor: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  cotacoes: Cotacao[];
  previsao_entrega: string | null;
  data_compra: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Cria ou atualiza um item de material da obra. Faz find-or-create pelo par
 * (user_wa, obra, item, case-insensitive): assim "cotei mais um fornecedor do
 * cimento" atualiza o mesmo item em vez de duplicar. Cotações são ANEXADAS.
 */
export async function registrarMaterial(
  userWa: string,
  params: {
    item: string;
    obra?: string | null;
    quantidade?: number | null;
    unidade?: string | null;
    status?: MaterialStatus | null;
    fornecedor?: string | null;
    valorUnitario?: number | null;
    valorTotal?: number | null;
    previsaoEntrega?: string | null;
    dataCompra?: string | null;
    observacoes?: string | null;
    novasCotacoes?: Cotacao[] | null;
  },
): Promise<MaterialRow> {
  const supabase = getSupabase();

  // Procura o mesmo item (mesma obra) para atualizar em vez de duplicar.
  let find = supabase
    .from("secretaria_materiais")
    .select("*")
    .eq("user_wa", userWa)
    .ilike("item", params.item)
    .order("created_at", { ascending: false })
    .limit(1);
  find = params.obra ? find.ilike("obra", params.obra) : find.is("obra", null);
  const { data: achado, error: findErr } = await find;
  if (findErr) throw new Error(`Falha ao buscar material: ${findErr.message}`);
  const atual = (achado?.[0] as MaterialRow | undefined) ?? null;

  const cotacoes = [...(atual?.cotacoes ?? []), ...(params.novasCotacoes ?? [])];

  // valor_total: usa o informado; senão calcula de quantidade × valor unitário.
  const qtd = params.quantidade ?? atual?.quantidade ?? null;
  const vUnit = params.valorUnitario ?? atual?.valor_unitario ?? null;
  const valorTotal =
    params.valorTotal ??
    (qtd != null && vUnit != null ? Number(qtd) * Number(vUnit) : atual?.valor_total ?? null);

  const merged: Record<string, unknown> = {
    user_wa: userWa,
    obra: params.obra ?? atual?.obra ?? null,
    item: params.item,
    quantidade: qtd,
    unidade: params.unidade ?? atual?.unidade ?? null,
    status: params.status ?? atual?.status ?? "a_comprar",
    fornecedor: params.fornecedor ?? atual?.fornecedor ?? null,
    valor_unitario: vUnit,
    valor_total: valorTotal,
    cotacoes,
    previsao_entrega: params.previsaoEntrega ?? atual?.previsao_entrega ?? null,
    data_compra: params.dataCompra ?? atual?.data_compra ?? null,
    observacoes: params.observacoes ?? atual?.observacoes ?? null,
    updated_at: new Date().toISOString(),
  };

  if (atual) {
    const { data, error } = await supabase
      .from("secretaria_materiais")
      .update(merged)
      .eq("user_wa", userWa)
      .eq("id", atual.id)
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao atualizar material: ${error.message}`);
    return data as MaterialRow;
  }

  const { data, error } = await supabase
    .from("secretaria_materiais")
    .insert(merged)
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao registrar material: ${error.message}`);
  return data as MaterialRow;
}

/** Lista materiais por obra e/ou status (mais recentes primeiro). */
export async function consultarMateriais(
  userWa: string,
  filtros: { obra?: string | null; status?: MaterialStatus | null } = {},
): Promise<MaterialRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_materiais")
    .select("*")
    .eq("user_wa", userWa)
    .order("updated_at", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", `%${filtros.obra}%`);
  if (filtros.status) query = query.eq("status", filtros.status);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar materiais: ${error.message}`);
  return (data ?? []) as MaterialRow[];
}

/* ---------- Tokens do Google OAuth (calendário por usuário) ---------- */

export interface OAuthTokenRow {
  user_wa: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  expiry: string | null;
  scope: string | null;
}

/**
 * Busca o token OAuth do usuário (tolerando as variantes de wa_id). Retorna
 * null se ele ainda não conectou a agenda pelo fluxo OAuth.
 */
export async function getOAuthToken(userWa: string): Promise<OAuthTokenRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_oauth_tokens")
    .select("user_wa, google_email, refresh_token, access_token, expiry, scope")
    .in("user_wa", waIdVariants(userWa))
    .limit(1);

  if (error) throw new Error(`Falha ao buscar token OAuth: ${error.message}`);
  const rows = (data ?? []) as OAuthTokenRow[];
  return rows[0] ?? null;
}

/**
 * Grava/atualiza o token OAuth do usuário em TODAS as variantes de wa_id
 * (igual ao cadastro), para responder qualquer forma que a Meta entregar.
 */
export async function saveOAuthToken(
  userWa: string,
  tok: {
    refreshToken: string;
    accessToken?: string | null;
    expiry?: string | null;
    scope?: string | null;
    email?: string | null;
  },
): Promise<void> {
  const supabase = getSupabase();
  const rows = waIdVariants(userWa).map((wa) => ({
    user_wa: wa,
    provider: "google",
    google_email: tok.email ?? null,
    refresh_token: tok.refreshToken,
    access_token: tok.accessToken ?? null,
    expiry: tok.expiry ?? null,
    scope: tok.scope ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("secretaria_oauth_tokens")
    .upsert(rows, { onConflict: "user_wa" });
  if (error) throw new Error(`Falha ao salvar token OAuth: ${error.message}`);
}
