import { getSupabase, type MemoryKind, type MemoryRow } from "./supabase.js";
import { listarArquivosDoUsuario, removeFotos } from "./storage.js";
import { cifrar, decifrar } from "../util/crypto.js";

/**
 * Camada de acesso à memória. Todas as funções são escopadas por user_wa
 * (o número do dono) para nunca misturar contexto entre pessoas.
 */

// Mensagens carregadas em TODA requisição (coerência de curto prazo). Pequeno de
// propósito: histórico grande em cada chamada explode o custo do Claude. Para
// revisar dias anteriores sob demanda, existe loadHistorySince + tool revisar_conversa.
const RECENT_HISTORY_LIMIT = 30;

/** Tamanho de página ao ler tabelas (o PostgREST corta em 1000 linhas por padrão). */
const PAGINA = 1000;

/**
 * Lê TODAS as linhas de uma consulta, paginando com range(). Sem isso, o
 * Supabase devolve no máximo 1000 linhas em silêncio — e somas/listas saem
 * erradas (ex.: total de custos acima de 1000 lançamentos).
 */
export async function todasAsLinhas<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  maximo = 20000,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < maximo; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return out;
}

/**
 * Filtro por obra. `exata` = nome exato (sem diferenciar maiúsculas), usado
 * pelo painel e pelo PDF do RDO — antes era sempre "contém", e "Casa" trazia
 * também "Casa Praia" (misturando obras no RDO que vai para o cliente).
 * Sem `exata`, busca parcial (WhatsApp), com curingas escapados.
 */
function padraoObra(obra: string, exata?: boolean): string {
  const t = likeEscape(obra.trim());
  return exata ? t : `%${t}%`;
}

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

/**
 * Panorama consolidado de TUDO que está salvo do usuário (para o comando
 * "me mostra tudo que você tem"/auditoria). Reúne memória + pendências +
 * documentos + materiais + contadores de custos/fotos/RDO em uma passada.
 * Custos/fotos/RDO entram como CONTAGEM (podem ser muitos); o resto vem inteiro.
 */
export interface Panorama {
  fatos: string[];
  obras: string[];
  apelidos: string[];
  preferencias: string[];
  pendencias: Array<{ content: string; obra: string | null }>;
  documentos: Array<{ tipo: string; descricao: string; obra: string | null; vencimento: string | null }>;
  materiais: Array<{ item: string; obra: string | null; status: string }>;
  custos: { total: number; lancamentos: number };
  fotos: number;
  rdos: number;
}

export async function panoramaUsuario(userWa: string): Promise<Panorama> {
  const [ctx, docs, mats, custos, fotos, rdos] = await Promise.all([
    loadOwnerContext(userWa),
    consultarDocumentos(userWa, {}),
    consultarMateriais(userWa, {}),
    relatorioCustos(userWa, {}),
    consultarFotos(userWa, {}),
    consultarRDO(userWa, {}),
  ]);
  return {
    fatos: ctx.fatos,
    obras: ctx.obras,
    apelidos: ctx.apelidos,
    preferencias: ctx.preferencias,
    pendencias: ctx.pendenciasAbertas.map((p) => ({ content: p.content, obra: p.obra })),
    documentos: docs.map((d) => ({
      tipo: d.tipo,
      descricao: d.descricao,
      obra: d.obra,
      vencimento: d.vencimento,
    })),
    materiais: mats.map((m) => ({ item: m.item, obra: m.obra, status: m.status })),
    custos: { total: custos.total, lancamentos: custos.itens.length },
    fotos: fotos.length,
    rdos: rdos.length,
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

/**
 * Salva VÁRIAS memórias de uma vez (ex.: uma lista de pendências passada numa
 * única mensagem). Um único insert atômico — evita que o modelo "resuma" a
 * lista em texto em vez de gravar item a item. Retorna quantas foram salvas.
 */
export async function saveMemories(
  userWa: string,
  itens: Array<{ kind: MemoryKind; content: string; obra?: string | null }>,
): Promise<number> {
  if (itens.length === 0) return 0;
  const supabase = getSupabase();
  const rows = itens.map((i) => ({
    user_wa: userWa,
    kind: i.kind,
    content: i.content,
    obra: i.obra ?? null,
  }));
  const { error } = await supabase.from("secretaria_memories").insert(rows);
  if (error) throw new Error(`Falha ao salvar memórias: ${error.message}`);
  return rows.length;
}

/**
 * Atualiza o CONTEÚDO de uma memória existente (fato/obra/apelido/preferência)
 * — para quando algo muda (obra mudou de fase, trocou o responsável) em vez de
 * acumular fatos contraditórios. Localiza pela busca (texto que aparece no
 * conteúdo atual), pega a mais recente. Retorna a linha atualizada ou null se
 * não achar (aí o agente pede para o usuário esclarecer).
 */
export async function atualizarMemoria(
  userWa: string,
  busca: string,
  novoConteudo: string,
  kind?: MemoryKind | null,
): Promise<MemoryRow | null> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_memories")
    .select("*")
    .eq("user_wa", userWa)
    .ilike("content", `%${likeEscape(busca)}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao buscar memória: ${error.message}`);
  const row = data?.[0] as MemoryRow | undefined;
  if (!row) return null;

  const { data: upd, error: e2 } = await supabase
    .from("secretaria_memories")
    .update({ content: novoConteudo, updated_at: new Date().toISOString() })
    .eq("user_wa", userWa)
    .eq("id", row.id)
    .select("*")
    .single();
  if (e2) throw new Error(`Falha ao atualizar memória: ${e2.message}`);
  return upd as MemoryRow;
}

/**
 * Marca uma pendência aberta como concluída (localiza pela busca). Assim ela
 * some das listas — corrige o "disse que resolveu mas não fez". Retorna a linha
 * ou null se não encontrar pendência aberta que case.
 */
export async function concluirPendencia(
  userWa: string,
  busca: string,
): Promise<MemoryRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_memories")
    .select("*")
    .eq("user_wa", userWa)
    .eq("kind", "pendencia")
    .eq("status", "aberta")
    .ilike("content", `%${likeEscape(busca)}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Falha ao buscar pendência: ${error.message}`);
  const row = data?.[0] as MemoryRow | undefined;
  if (!row) return null;

  const { data: upd, error: e2 } = await supabase
    .from("secretaria_memories")
    .update({ status: "concluida", updated_at: new Date().toISOString() })
    .eq("user_wa", userWa)
    .eq("id", row.id)
    .select("*")
    .single();
  if (e2) throw new Error(`Falha ao concluir pendência: ${e2.message}`);
  return upd as MemoryRow;
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
    query = query.ilike("obra", padraoObra(obra));
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
 * Carrega um trecho MAIOR do histórico (últimos `dias` dias), SOB DEMANDA — para
 * a Rosana revisar o que foi conversado e caçar compromissos que não foram
 * agendados. Não entra em toda requisição (custo); só quando a tool
 * revisar_conversa é chamada. Ordem cronológica; teto de linhas p/ não estourar.
 */
export async function loadHistorySince(
  userWa: string,
  dias: number,
  maxRows = 300,
): Promise<Array<{ role: "user" | "assistant"; content: string; created_at: string }>> {
  const janela = Math.max(1, Math.min(Math.floor(dias) || 7, 30));
  const desde = new Date(Date.now() - janela * 86400000).toISOString();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_conversations")
    .select("role, content, created_at")
    .eq("user_wa", userWa)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(maxRows);

  if (error) throw new Error(`Falha ao carregar histórico do período: ${error.message}`);
  return (data ?? []) as Array<{ role: "user" | "assistant"; content: string; created_at: string }>;
}

/**
 * "Reivindica" uma mensagem do WhatsApp para processamento, de forma atômica.
 *
 * A Meta reenvia o mesmo evento (mesmo `wa_message_id`) quando não recebe o
 * 200 a tempo. A tabela tem PRIMARY KEY no id: só quem insere primeiro
 * processa. A linha nasce com status='processing' e vira 'done' ao terminar
 * (marcarMensagemProcessada). Se a função morrer no meio (timeout da Vercel),
 * a linha fica 'processing' — e uma REENTREGA depois de PROCESSING_STALE_MS
 * pode retomá-la. Antes, a mensagem era marcada logo de cara e, se a função
 * morresse, a reentrega era descartada: a mensagem sumia sem resposta.
 *
 * Em erro inesperado do banco, retorna true (fail-open): melhor arriscar um
 * raro duplicado do que engolir uma mensagem legítima.
 */
const PROCESSING_STALE_MS = 90 * 1000;

export type ResultadoClaim = "novo" | "ja_processada" | "em_andamento";

export async function claimMessageOnce(messageId: string): Promise<ResultadoClaim> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_processed_messages")
    .insert({ wa_message_id: messageId, status: "processing", claimed_at: new Date().toISOString() });

  if (!error) return "novo";
  if (error.code !== "23505") {
    console.error(`Falha ao registrar dedup da mensagem ${messageId}: ${error.message}`);
    return "novo"; // fail-open
  }

  // Já existe: só retoma se ficou "processing" parado (a função anterior morreu).
  const limite = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();
  const { data, error: e2 } = await supabase
    .from("secretaria_processed_messages")
    .update({ claimed_at: new Date().toISOString() })
    .eq("wa_message_id", messageId)
    .eq("status", "processing")
    .lt("claimed_at", limite)
    .select("wa_message_id");
  if (e2) {
    console.error(`Falha ao retomar mensagem ${messageId}: ${e2.message}`);
    return "em_andamento";
  }
  if (data && data.length > 0) {
    console.warn(`[dedup] Mensagem ${messageId} retomada (processamento anterior não terminou).`);
    return "novo";
  }
  // Não retomou: ou já está 'done', ou ainda 'processing' recente.
  const { data: row } = await supabase
    .from("secretaria_processed_messages")
    .select("status")
    .eq("wa_message_id", messageId)
    .maybeSingle();
  return (row as { status?: string } | null)?.status === "done" ? "ja_processada" : "em_andamento";
}

/** Marca a mensagem como concluída (reentregas futuras são ignoradas). */
export async function marcarMensagemProcessada(messageId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_processed_messages")
    .update({ status: "done" })
    .eq("wa_message_id", messageId);
  if (error) console.error(`Falha ao concluir dedup da mensagem ${messageId}: ${error.message}`);
}

/** Limpeza: apaga registros de dedup antigos (a Meta não reenvia após dias). */
export async function limparMensagensProcessadas(dias = 30): Promise<void> {
  const supabase = getSupabase();
  const limite = new Date(Date.now() - dias * 86400000).toISOString();
  const { error } = await supabase
    .from("secretaria_processed_messages")
    .delete()
    .lt("created_at", limite);
  if (error) console.error(`Falha ao limpar dedup antigo: ${error.message}`);
}

/* ---------- Trava por usuário (mensagens em sequência) ---------- */

/**
 * Trava simples por usuário (tabela secretaria_locks) para que duas mensagens
 * seguidas do MESMO usuário (ex.: áudio + foto) não sejam processadas em
 * paralelo — o que cruzava o histórico e embaralhava a ordem das respostas.
 * Espera até `esperaMs`; se não conseguir, segue assim mesmo (nunca trava a
 * resposta). A trava expira sozinha após `duracaoMs` (função morta).
 */
export async function adquirirTravaUsuario(
  userWa: string,
  esperaMs = 20000,
  duracaoMs = 70000,
): Promise<boolean> {
  const supabase = getSupabase();
  const inicio = Date.now();
  // do/while: tenta pelo menos uma vez, mesmo com espera 0.
  do {
    try {
      const ate = new Date(Date.now() + duracaoMs).toISOString();
      const { error } = await supabase.from("secretaria_locks").insert({ user_wa: userWa, ate });
      if (!error) return true;
      if (error.code !== "23505") throw new Error(error.message);
      // Existe: toma se já expirou.
      const { data } = await supabase
        .from("secretaria_locks")
        .update({ ate })
        .eq("user_wa", userWa)
        .lt("ate", new Date().toISOString())
        .select("user_wa");
      if (data && data.length > 0) return true;
    } catch (err) {
      console.error(`[trava] falha: ${err instanceof Error ? err.message : String(err)}`);
      return false; // sem trava, mas segue
    }
    if (Date.now() - inicio + 700 >= esperaMs) break;
    await new Promise((r) => setTimeout(r, 700));
  } while (Date.now() - inicio < esperaMs);
  console.warn("[trava] tempo de espera esgotado; processando sem trava.");
  return false;
}

export async function liberarTravaUsuario(userWa: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("secretaria_locks").delete().eq("user_wa", userWa);
  if (error) console.error(`[trava] falha ao liberar: ${error.message}`);
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

/**
 * Procura um custo IGUAL (mesmo valor, obra e data) lançado nos últimos
 * `minutos` — sinal de duplicata (nota fiscal reenviada, pedido repetido).
 */
export async function buscarCustoRecente(
  userWa: string,
  params: { valor: number; obra: string | null; data: string | null },
  minutos = 15,
): Promise<Pick<CustoRow, "id" | "obra" | "valor" | "descricao" | "data"> | null> {
  if (!Number.isFinite(params.valor)) return null;
  const supabase = getSupabase();
  let q = supabase
    .from("secretaria_custos")
    .select("id, obra, valor, descricao, data")
    .eq("user_wa", userWa)
    .eq("valor", params.valor)
    .gt("created_at", new Date(Date.now() - minutos * 60000).toISOString())
    .limit(1);
  q = params.obra ? q.ilike("obra", likeEscape(params.obra.trim())) : q.is("obra", null);
  if (params.data) q = q.eq("data", params.data);
  const { data, error } = await q;
  if (error) throw new Error(`Falha ao checar duplicata de custo: ${error.message}`);
  return ((data ?? [])[0] as Pick<CustoRow, "id" | "obra" | "valor" | "descricao" | "data"> | undefined) ?? null;
}

export interface RelatorioCustos {
  total: number;
  porCategoria: Record<string, number>;
  itens: Array<Pick<CustoRow, "id" | "obra" | "categoria" | "valor" | "descricao" | "data">>;
}

/** Relatório de custos, opcionalmente por obra e intervalo de datas (YYYY-MM-DD). */
export async function relatorioCustos(
  userWa: string,
  filtros: { obra?: string | null; obraExata?: boolean; desde?: string | null; ate?: string | null } = {},
): Promise<RelatorioCustos> {
  const supabase = getSupabase();
  const montar = (de: number, ate: number) => {
    let query = supabase
      .from("secretaria_custos")
      .select("id, obra, categoria, valor, descricao, data")
      .eq("user_wa", userWa)
      .order("data", { ascending: false })
      .order("id", { ascending: false });
    if (filtros.obra) query = query.ilike("obra", padraoObra(filtros.obra, filtros.obraExata));
    if (filtros.desde) query = query.gte("data", filtros.desde);
    if (filtros.ate) query = query.lte("data", filtros.ate);
    return query.range(de, ate);
  };

  let itens: RelatorioCustos["itens"];
  try {
    itens = await todasAsLinhas<RelatorioCustos["itens"][number]>(montar);
  } catch (err) {
    throw new Error(`Falha ao gerar relatório de custos: ${err instanceof Error ? err.message : String(err)}`);
  }
  let total = 0;
  const porCategoria: Record<string, number> = {};
  for (const it of itens) {
    const v = Number(it.valor) || 0;
    total += v;
    porCategoria[it.categoria] = (porCategoria[it.categoria] ?? 0) + v;
  }
  // Arredonda em centavos (evita 0,1+0,2 = 0,30000000000000004 no total).
  total = Math.round(total * 100) / 100;
  for (const k of Object.keys(porCategoria)) porCategoria[k] = Math.round(porCategoria[k]! * 100) / 100;
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

/** Junta dois textos do RDO sem duplicar (se um contém o outro, fica o maior). */
function juntarTexto(antigo: string | null, novo: string | null | undefined): string | null {
  const a = antigo?.trim() || "";
  const n = novo?.trim() || "";
  if (!n) return a || null;
  if (!a) return n;
  const la = a.toLowerCase();
  const ln = n.toLowerCase();
  if (ln.includes(la)) return n;
  if (la.includes(ln)) return a;
  return `${a}\n${n}`;
}

/**
 * Registra o RDO de uma obra num dia (único por user_wa+obra+data).
 *   modo "complementar" (padrão): se o dia já tem RDO, JUNTA — anexa
 *     atividades/ocorrências/materiais (sem duplicar texto repetido) e mescla o
 *     efetivo por função (a quantidade nova de uma função substitui a antiga).
 *     Antes, um segundo áudio do mesmo dia APAGAVA o primeiro relato.
 *   modo "substituir": troca o conteúdo do dia pelo enviado (correções).
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
    modo?: "complementar" | "substituir";
  },
): Promise<RdoRow> {
  const supabase = getSupabase();
  const data = params.data || todayIsoDateSP();

  let atual: RdoRow | null = null;
  if (params.modo !== "substituir") {
    const { data: rows, error } = await supabase
      .from("secretaria_rdo")
      .select("*")
      .eq("user_wa", userWa)
      .eq("obra", params.obra)
      .eq("data", data)
      .limit(1);
    if (error) throw new Error(`Falha ao ler RDO do dia: ${error.message}`);
    atual = ((rows ?? [])[0] as RdoRow | undefined) ?? null;
  }

  let efetivo: EfetivoItem[] = params.efetivo ?? [];
  if (atual) {
    const mapa = new Map<string, EfetivoItem>();
    for (const e of atual.efetivo ?? []) mapa.set(e.funcao.trim().toLowerCase(), e);
    for (const e of params.efetivo ?? []) mapa.set(e.funcao.trim().toLowerCase(), e);
    efetivo = [...mapa.values()];
  }

  const row: Record<string, unknown> = {
    user_wa: userWa,
    obra: params.obra,
    data,
    clima: params.clima ?? atual?.clima ?? null,
    efetivo,
    atividades: atual ? juntarTexto(atual.atividades, params.atividades) : params.atividades ?? null,
    ocorrencias: atual ? juntarTexto(atual.ocorrencias, params.ocorrencias) : params.ocorrencias ?? null,
    materiais: atual ? juntarTexto(atual.materiais, params.materiais) : params.materiais ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: salvo, error } = await supabase
    .from("secretaria_rdo")
    .upsert(row, { onConflict: "user_wa,obra,data" })
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar RDO: ${error.message}`);
  return salvo as RdoRow;
}

/** Hoje (YYYY-MM-DD) no fuso de São Paulo — igual ao default da coluna. */
function todayIsoDateSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TIMEZONE?.trim() || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Consulta RDOs por obra e/ou intervalo (YYYY-MM-DD), mais recentes primeiro. */
export async function consultarRDO(
  userWa: string,
  filtros: { obra?: string | null; obraExata?: boolean; desde?: string | null; ate?: string | null } = {},
): Promise<RdoRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_rdo")
    .select("*")
    .eq("user_wa", userWa)
    .order("data", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", padraoObra(filtros.obra, filtros.obraExata));
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
    obraExata?: boolean;
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

  if (filtros.obra) query = query.ilike("obra", padraoObra(filtros.obra, filtros.obraExata));
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
  profissao: string | null;
  dono: boolean;
  ativo: boolean;
  nudge_diario: boolean;
  /** Forma do número como a Meta entrega (para mensagens iniciadas por nós). */
  wa_envio?: string | null;
}

/** Busca o usuário pelo wa_id. Retorna null se não cadastrado. */
export async function getUsuario(userWa: string): Promise<UsuarioRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, nome, calendar_id, contextos, profissao, dono, ativo, nudge_diario, wa_envio")
    .eq("user_wa", userWa)
    .maybeSingle();

  if (error) {
    // Falha de infra não pode virar "acesso negado" silencioso: propaga.
    throw new Error(`Falha ao buscar usuário: ${error.message}`);
  }
  return (data as UsuarioRow | null) ?? null;
}

/**
 * Liga/desliga o "bom dia" diário para o usuário (todas as variantes de wa_id).
 */
export async function setNudgeDiario(userWa: string, ativar: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({ nudge_diario: ativar })
    .in("user_wa", waIdVariants(userWa));
  if (error) throw new Error(`Falha ao configurar lembrete diário: ${error.message}`);
}

/**
 * Usuários elegíveis para o "bom dia" diário: ATIVOS, com nudge ligado, que
 * mandaram uma mensagem nas últimas 24h (regra da Meta — só dá para enviar texto
 * livre dentro da janela de 24h). Deduplica por pessoa (variantes de wa_id),
 * mantendo o wa_id que esteve ativo.
 */
export async function usuariosAtivosParaNudge(): Promise<
  Array<{ user_wa: string; nome: string; wa_envio: string | null }>
> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1) wa_ids que mandaram mensagem (role=user) nas últimas 24h.
  let conv: Array<{ user_wa: string }>;
  try {
    conv = await todasAsLinhas<{ user_wa: string }>((de, ate) =>
      supabase
        .from("secretaria_conversations")
        .select("user_wa")
        .eq("role", "user")
        .gt("created_at", desde)
        .order("id", { ascending: true })
        .range(de, ate),
    );
  } catch (err) {
    throw new Error(`Falha ao buscar ativos: ${err instanceof Error ? err.message : String(err)}`);
  }
  const ativos = [...new Set(conv.map((r) => r.user_wa))];
  if (ativos.length === 0) return [];

  // 2) desses, os usuários ativos com nudge ligado.
  const { data: users, error: e2 } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, nome, wa_envio")
    .in("user_wa", ativos)
    .eq("ativo", true)
    .eq("nudge_diario", true);
  if (e2) throw new Error(`Falha ao filtrar usuários do nudge: ${e2.message}`);

  // 3) dedup por pessoa (variantes) — não mandar duas vezes.
  const vistos = new Set<string>();
  const out: Array<{ user_wa: string; nome: string; wa_envio: string | null }> = [];
  for (const u of (users ?? []) as Array<{ user_wa: string; nome: string; wa_envio: string | null }>) {
    const chave = waIdVariants(u.user_wa).sort()[0] ?? u.user_wa;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(u);
  }
  return out;
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

/**
 * wa_id CANÔNICO = chave dos dados em todas as tabelas. Para celular BR usamos
 * a forma SEM o nono dígito (12 dígitos), que é como a Meta entrega o wa_id e
 * como todos os dados históricos já estão gravados. Assim, venha a mensagem com
 * ou sem o 9 (ou o login digitado de qualquer jeito), os dados são os mesmos.
 * O número CRU recebido continua sendo usado só para RESPONDER no WhatsApp.
 */
export function canonicalWa(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return d.slice(0, 4) + d.slice(5);
  return d;
}

/**
 * Registra a forma do número que a Meta entrega (from cru) em todas as
 * variantes do usuário. Mensagens iniciadas por NÓS (código de login, "bom
 * dia", aviso de agenda) vão para esta forma — enviar para a forma errada do
 * nono dígito é aceito pela API (200) mas NÃO entrega.
 */
export async function registrarWaEnvio(userWa: string, from: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({ wa_envio: from })
    .in("user_wa", waIdVariants(userWa));
  if (error) console.error(`Falha ao registrar wa_envio: ${error.message}`);
}

/** Número para mensagens iniciadas por nós: o último `from` visto, ou o cadastro. */
export function destinoDoUsuario(u: Pick<UsuarioRow, "user_wa" | "wa_envio">): string {
  return u.wa_envio || u.user_wa;
}

/** Busca o usuário em qualquer variante do wa_id (com/sem o nono dígito). */
export async function getUsuarioVariantes(userWa: string): Promise<UsuarioRow | null> {
  for (const wa of waIdVariants(userWa)) {
    const u = await getUsuario(wa);
    if (u) return u;
  }
  return null;
}

/** Escapa curingas do LIKE/ILIKE (% _ \) para busca literal. */
export function likeEscape(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => "\\" + c);
}

export interface CadastroInput {
  nomeCompleto: string;
  cpf?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  whatsappInput: string;
}

/**
 * Cria o cadastro de um usuário do beta (uma linha por variante de wa_id).
 * NUNCA sobrescreve um cadastro existente: se o número já existe (em qualquer
 * variante) nada é gravado e retorna { jaExistia: true }. Antes era um upsert
 * com dono=false/ativo=true — qualquer um com o código de convite podia
 * rebaixar o dono (e parar a agenda dele) ou reativar um usuário bloqueado.
 */
export async function registrarCadastro(
  dados: CadastroInput,
): Promise<{ jaExistia: boolean; waIds: string[] }> {
  const supabase = getSupabase();
  const waIds = waIdVariants(dados.whatsappInput);
  if (waIds.length === 0) throw new Error("Número de WhatsApp inválido.");

  const { data: existentes, error: e1 } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa")
    .in("user_wa", waIds)
    .limit(1);
  if (e1) throw new Error(`Falha ao verificar cadastro: ${e1.message}`);
  if (existentes && existentes.length > 0) return { jaExistia: true, waIds };

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

  // ignoreDuplicates: se outra requisição criou no meio-tempo, não sobrescreve.
  const { error } = await supabase
    .from("secretaria_usuarios")
    .upsert(rows, { onConflict: "user_wa", ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao gravar cadastro: ${error.message}`);
  return { jaExistia: false, waIds };
}

/* ---------- Exclusão de conta (LGPD / direito ao esquecimento) ---------- */

export interface ResultadoExclusao {
  arquivos: number;
  registros: Record<string, number>;
  total: number;
}

/**
 * Apaga TODOS os dados do usuário (todas as variantes de wa_id): memória,
 * conversas, custos, RDO, fotos (arquivo + registro), documentos, materiais,
 * tokens do Google e, por fim, a autorização de acesso. Irreversível.
 *
 * Ordem: remove os arquivos do Storage antes de apagar os registros das fotos
 * (senão perderíamos os caminhos), e deixa `secretaria_usuarios` por último
 * (é o que desautoriza o número).
 */
export async function excluirDadosUsuario(userWa: string): Promise<ResultadoExclusao> {
  const supabase = getSupabase();
  const variantes = waIdVariants(userWa);

  // 1) Arquivos do Storage: os referenciados pelos registros E tudo que estiver
  //    sob a pasta do usuário (inclui fotos arquivadas que nunca viraram
  //    registro — antes ficavam órfãs no bucket).
  let arquivos = 0;
  try {
    const { data } = await supabase
      .from("secretaria_fotos")
      .select("caminho")
      .in("user_wa", variantes);
    const caminhos = new Set(
      (data ?? [])
        .map((r) => (r as { caminho: string | null }).caminho)
        .filter((c): c is string => Boolean(c)),
    );
    for (const v of variantes) for (const c of await listarArquivosDoUsuario(v)) caminhos.add(c);
    if (caminhos.size > 0) arquivos = await removeFotos([...caminhos]);
  } catch (err) {
    // Não bloqueia a exclusão dos dados por falha ao limpar arquivos.
    console.error(
      `[exclusao] falha ao remover arquivos: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2) Apaga os registros de todas as tabelas por user_wa.
  const tabelas = [
    "secretaria_memories",
    "secretaria_conversations",
    "secretaria_custos",
    "secretaria_rdo",
    "secretaria_fotos",
    "secretaria_documentos",
    "secretaria_materiais",
    "secretaria_obras",
    "secretaria_oauth_tokens",
    "secretaria_oauth_nonces",
    "secretaria_auth_codes",
    "secretaria_senhas", // derruba as sessões do painel
    "secretaria_usuarios", // por último: desautoriza o número
  ];

  const registros: Record<string, number> = {};
  let total = 0;
  for (const t of tabelas) {
    const { error, count } = await supabase
      .from(t)
      .delete({ count: "exact" })
      .in("user_wa", variantes);
    if (error) throw new Error(`Falha ao excluir de ${t}: ${error.message}`);
    registros[t] = count ?? 0;
    total += count ?? 0;
  }

  console.log(`[exclusao] concluída: ${total} registros, ${arquivos} arquivos.`);
  return { arquivos, registros, total };
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
    obraExata?: boolean;
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
  if (filtros.obra) query = query.ilike("obra", padraoObra(filtros.obra, filtros.obraExata));
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
  /** Custo já lançado a partir deste material (evita lançar duas vezes). */
  custo_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Vincula o custo lançado ao material (para não relançar). */
export async function setMaterialCusto(userWa: string, materialId: number, custoId: number): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_materiais")
    .update({ custo_id: custoId })
    .eq("user_wa", userWa)
    .eq("id", materialId);
  if (error) console.error(`Falha ao vincular custo ao material ${materialId}: ${error.message}`);
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
    .ilike("item", likeEscape(params.item.trim()))
    .order("created_at", { ascending: false })
    .limit(1);
  find = params.obra ? find.ilike("obra", likeEscape(params.obra.trim())) : find.is("obra", null);
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
  filtros: { obra?: string | null; obraExata?: boolean; status?: MaterialStatus | null } = {},
): Promise<MaterialRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("secretaria_materiais")
    .select("*")
    .eq("user_wa", userWa)
    .order("updated_at", { ascending: false });

  if (filtros.obra) query = query.ilike("obra", padraoObra(filtros.obra, filtros.obraExata));
  if (filtros.status) query = query.eq("status", filtros.status);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar materiais: ${error.message}`);
  return (data ?? []) as MaterialRow[];
}

export interface PrecoDoUsuario {
  item: string;
  unidade: string | null;
  obra: string | null;
  preco: number;
  fornecedor: string | null;
  origem: "compra" | "cotacao";
  quando: string | null;
}

/**
 * Preços REAIS que ESTE usuário já praticou (histórico dele em
 * `secretaria_materiais`), para orçamentos personalizados — a "teia de
 * conhecimento" que retroalimenta a Rosana. Reúne o que ele comprou
 * (valor_unitario) e o que cotou (cotacoes[]). São dados REAIS do usuário e
 * têm prioridade sobre a base de referência (média de mercado). Isolado por
 * user_wa (todas as variantes de wa_id). Mais recentes primeiro.
 */
export async function buscarPrecosDoUsuario(
  userWa: string,
  termo: string,
  limite = 6,
): Promise<PrecoDoUsuario[]> {
  const t = (termo ?? "").trim();
  if (!t) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_materiais")
    .select("item, unidade, obra, fornecedor, valor_unitario, cotacoes, data_compra, updated_at")
    .in("user_wa", waIdVariants(userWa))
    .ilike("item", `%${likeEscape(t)}%`)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(`Falha ao buscar preços do usuário: ${error.message}`);

  const pontos: PrecoDoUsuario[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const item = String(row.item ?? "");
    const unidade = (row.unidade as string | null) ?? null;
    const obra = (row.obra as string | null) ?? null;
    const quando = (row.data_compra as string | null) ?? (row.updated_at as string | null) ?? null;

    const vUnit = row.valor_unitario;
    if (vUnit != null && Number(vUnit) > 0) {
      pontos.push({
        item,
        unidade,
        obra,
        preco: Number(vUnit),
        fornecedor: (row.fornecedor as string | null) ?? null,
        origem: "compra",
        quando,
      });
    }

    const cotacoes = Array.isArray(row.cotacoes) ? (row.cotacoes as Cotacao[]) : [];
    for (const c of cotacoes) {
      if (c?.valor_unitario != null && Number(c.valor_unitario) > 0) {
        pontos.push({
          item,
          unidade,
          obra,
          preco: Number(c.valor_unitario),
          fornecedor: c.fornecedor ?? null,
          origem: "cotacao",
          quando,
        });
      }
    }
  }

  return pontos.slice(0, limite);
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
  const row = ((data ?? []) as OAuthTokenRow[])[0];
  if (!row) return null;
  return {
    ...row,
    refresh_token: decifrar(row.refresh_token),
    access_token: row.access_token ? decifrar(row.access_token) : null,
  };
}

/**
 * Remove o token OAuth (todas as variantes). Usado quando o Google responde
 * invalid_grant (token revogado/expirado): o token morto não serve para nada e
 * a Rosana passa a oferecer a reconexão.
 */
export async function deleteOAuthToken(userWa: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_oauth_tokens")
    .delete()
    .in("user_wa", waIdVariants(userWa));
  if (error) throw new Error(`Falha ao remover token OAuth: ${error.message}`);
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
    refresh_token: cifrar(tok.refreshToken),
    access_token: tok.accessToken ? cifrar(tok.accessToken) : null,
    expiry: tok.expiry ?? null,
    scope: tok.scope ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("secretaria_oauth_tokens")
    .upsert(rows, { onConflict: "user_wa" });
  if (error) throw new Error(`Falha ao salvar token OAuth: ${error.message}`);
}

/* ---------- Leads do site (antes do pagamento existir) ---------- */

export interface LeadInput {
  nome: string;
  telefone: string;
  email?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  plano?: string | null;
}

/**
 * Guarda o interesse de quem preencheu o /cadastro do site. Antes, o
 * formulário coletava os dados e os DESCARTAVA (checkout ainda é placeholder),
 * perdendo o lead. NÃO autoriza o número — só registra para contato.
 */
export async function registrarLead(lead: LeadInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("secretaria_leads").insert({
    nome: lead.nome,
    telefone: lead.telefone,
    email: lead.email ?? null,
    cpf: lead.cpf ?? null,
    endereco: lead.endereco ?? null,
    profissao: lead.profissao ?? null,
    plano: lead.plano ?? null,
  });
  if (error) throw new Error(`Falha ao registrar lead: ${error.message}`);
}
