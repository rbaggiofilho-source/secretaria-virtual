import { getSupabase } from "./supabase.js";

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
  for (const t of tabelas) {
    const { error } = await supabase.from(t).update({ obra: newNome }).eq("user_wa", userWa).eq("obra", oldNome);
    if (error) console.error(`[obras] rename em ${t}: ${error.message}`);
  }
  // Memória kind='obra' guarda o nome no content.
  const { error: mErr } = await supabase
    .from("secretaria_memories")
    .update({ content: newNome })
    .eq("user_wa", userWa)
    .eq("kind", "obra")
    .eq("content", oldNome);
  if (mErr) console.error(`[obras] rename memória: ${mErr.message}`);
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
    // Atualização: se o nome mudou, cascata nos lançamentos vinculados.
    const { data: atual } = await supabase
      .from("secretaria_obras")
      .select("nome")
      .eq("user_wa", userWa)
      .eq("id", input.id)
      .maybeSingle();
    const nomeAntigo = (atual as { nome?: string } | null)?.nome;
    if (nomeAntigo && nomeAntigo !== nome) await renameObraLinks(userWa, nomeAntigo, nome);

    const { data, error } = await supabase
      .from("secretaria_obras")
      .update(campos)
      .eq("user_wa", userWa)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao atualizar obra: ${error.message}`);
    return data as ObraStructRow;
  }

  // Criação: se já existe uma obra com esse nome, atualiza-a (evita duplicar).
  const { data, error } = await supabase
    .from("secretaria_obras")
    .upsert({ user_wa: userWa, ...campos }, { onConflict: "user_wa,nome" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao criar obra: ${error.message}`);
  return data as ObraStructRow;
}
