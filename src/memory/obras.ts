import { getSupabase } from "./supabase.js";
import { likeEscape } from "./context.js";

/**
 * Cadastro estruturado de obras (tabela secretaria_obras). Os lançamentos
 * (custos/RDO/materiais/documentos/fotos) e as memórias kind='obra' referenciam
 * a obra pelo NOME (string), então renomear uma obra faz cascata aqui para não
 * orfanar dados.
 */

export type ObraStatus = "ativa" | "pausada" | "concluida";

export interface ObraStructRow {
  id: number;
  user_wa: string;
  nome: string;
  cliente: string | null;
  endereco: string | null;
  contexto: string | null;
  data_inicio: string | null;
  data_fim_alvo: string | null;
  status: ObraStatus;
  created_at: string;
  updated_at: string;
}

export interface ObraInput {
  id?: number | null;
  nome: string;
  cliente?: string | null;
  endereco?: string | null;
  contexto?: string | null;
  data_inicio?: string | null;
  data_fim_alvo?: string | null;
  status?: ObraStatus | null;
}

/** Lista o cadastro estruturado de obras do usuário. */
export async function listObrasStruct(userWa: string): Promise<ObraStructRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_obras")
    .select("*")
    .eq("user_wa", userWa)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar obras: ${error.message}`);
  return (data ?? []) as ObraStructRow[];
}

/**
 * Busca a obra cadastrada pelo nome (sem diferenciar maiúsculas). Tenta
 * primeiro o nome EXATO; sem `exata`, cai para "contém" (mais recente). Usada
 * pela Rosana no WhatsApp (ex.: "ligue o gps para o island") e pelo PDF do RDO
 * (este com `exata`, para não pegar cliente/endereço de outra obra).
 */
export async function buscarObraPorNome(
  userWa: string,
  termo: string,
  opts: { exata?: boolean } = {},
): Promise<ObraStructRow | null> {
  const t = termo.trim();
  if (!t) return null;
  const supabase = getSupabase();
  const padroes = opts.exata ? [likeEscape(t)] : [likeEscape(t), `%${likeEscape(t)}%`];
  for (const padrao of padroes) {
    const { data, error } = await supabase
      .from("secretaria_obras")
      .select("*")
      .eq("user_wa", userWa)
      .ilike("nome", padrao)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Falha ao buscar obra: ${error.message}`);
    const row = (data ?? [])[0] as ObraStructRow | undefined;
    if (row) return row;
  }
  return null;
}

/**
 * Renomeia uma obra em TODOS os lugares que a referenciam pelo nome (cascata),
 * para não perder o vínculo dos lançamentos ao editar o nome no painel.
 */
export async function renameObraLinks(
  userWa: string,
  oldNome: string,
  newNome: string,
): Promise<void> {
  if (!oldNome || oldNome === newNome) return;
  const supabase = getSupabase();
  const tabelas = ["secretaria_custos", "secretaria_rdo", "secretaria_materiais", "secretaria_documentos", "secretaria_fotos"];
  const falhas: string[] = [];
  for (const t of tabelas) {
    const { error } = await supabase.from(t).update({ obra: newNome }).eq("user_wa", userWa).eq("obra", oldNome);
    if (error) {
      console.error(`[obras] rename em ${t}: ${error.message}`);
      falhas.push(t);
    }
  }
  // Memória kind='obra' guarda o nome no content.
  const { error: mErr } = await supabase
    .from("secretaria_memories")
    .update({ content: newNome })
    .eq("user_wa", userWa)
    .eq("kind", "obra")
    .eq("content", oldNome);
  if (mErr) {
    console.error(`[obras] rename memória: ${mErr.message}`);
    falhas.push("secretaria_memories");
  }
  // Nada em silêncio: se parte da cascata falhou, o chamador fica sabendo.
  if (falhas.length > 0) throw new Error(`Renomeação incompleta em: ${falhas.join(", ")}`);
}

/**
 * Exclui o CADASTRO de uma obra (registro estruturado e a memória kind='obra'
 * com esse nome). NÃO apaga os lançamentos vinculados (custos/RDO/materiais/
 * documentos/fotos) — dados financeiros/operacionais não somem em silêncio.
 */
export async function excluirObra(
  userWa: string,
  opts: { id?: number | null; nome?: string | null },
): Promise<void> {
  const supabase = getSupabase();
  let nomeCadastro: string | null = null;
  if (opts.id) {
    const { data, error } = await supabase
      .from("secretaria_obras")
      .delete()
      .eq("user_wa", userWa)
      .eq("id", opts.id)
      .select("nome");
    if (error) throw new Error(`Falha ao excluir obra: ${error.message}`);
    nomeCadastro = ((data ?? [])[0] as { nome?: string } | undefined)?.nome ?? null;
  }
  const nome = opts.nome?.trim() || nomeCadastro;
  if (nome) {
    await supabase
      .from("secretaria_memories")
      .delete()
      .eq("user_wa", userWa)
      .eq("kind", "obra")
      .eq("content", nome);
  }
}

/**
 * Cria ou atualiza uma obra. Em atualização com mudança de nome, faz a cascata.
 * Retorna a linha salva.
 */
export async function salvarObra(userWa: string, input: ObraInput): Promise<ObraStructRow> {
  const supabase = getSupabase();
  const nome = input.nome.trim();
  if (!nome) throw new Error("nome_obrigatorio");

  const campos = {
    nome,
    cliente: input.cliente?.trim() || null,
    endereco: input.endereco?.trim() || null,
    contexto: input.contexto?.trim() || null,
    data_inicio: input.data_inicio || null,
    data_fim_alvo: input.data_fim_alvo || null,
    status: (input.status as ObraStatus) || "ativa",
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: atual } = await supabase
      .from("secretaria_obras")
      .select("nome")
      .eq("user_wa", userWa)
      .eq("id", input.id)
      .maybeSingle();
    const nomeAntigo = (atual as { nome?: string } | null)?.nome;

    // Renomear para um nome que JÁ É de outra obra: recusa ANTES de mexer em
    // qualquer coisa. Antes a cascata rodava primeiro, o update falhava no
    // unique(user_wa,nome) e os lançamentos iam parar na outra obra.
    if (nomeAntigo !== nome) {
      const { data: conflito } = await supabase
        .from("secretaria_obras")
        .select("id")
        .eq("user_wa", userWa)
        .eq("nome", nome)
        .neq("id", input.id)
        .limit(1);
      if (conflito && conflito.length > 0) throw new Error("nome_em_uso");
    }

    // Primeiro o cadastro (falha aqui não mexe nos lançamentos), depois a cascata.
    const { data, error } = await supabase
      .from("secretaria_obras")
      .update(campos)
      .eq("user_wa", userWa)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao atualizar obra: ${error.message}`);
    if (nomeAntigo && nomeAntigo !== nome) await renameObraLinks(userWa, nomeAntigo, nome);
    return data as ObraStructRow;
  }

  // Criação: se já existe uma obra com esse nome, recusa (antes o upsert
  // sobrescrevia cliente/endereço da obra existente com os campos do form novo).
  const { data, error } = await supabase
    .from("secretaria_obras")
    .insert({ user_wa: userWa, ...campos })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("nome_em_uso");
    throw new Error(`Falha ao criar obra: ${error.message}`);
  }
  return data as ObraStructRow;
}
