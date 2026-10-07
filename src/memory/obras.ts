import { getSupabase } from "./supabase.js";
import { removeFotos } from "./storage.js";
import { waIdVariants } from "./context.js";

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
 * Busca a obra cadastrada cujo nome mais combina com o termo (case-insensitive,
 * contém). Retorna a mais recentemente atualizada, ou null. Usada pela Rosana
 * no WhatsApp (ex.: "ligue o gps para o island").
 */
export async function buscarObraPorNome(userWa: string, termo: string): Promise<ObraStructRow | null> {
  const t = termo.trim();
  if (!t) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_obras")
    .select("*")
    .eq("user_wa", userWa)
    .ilike("nome", `%${t}%`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Falha ao buscar obra: ${error.message}`);
  return ((data ?? [])[0] as ObraStructRow | undefined) ?? null;
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
  const tabelas = ["secretaria_custos", "secretaria_rdo", "secretaria_materiais", "secretaria_documentos", "secretaria_fotos", "secretaria_eventos", "secretaria_etapas"];
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
 * Casa um nome de obra dito/escrito com uma obra JÁ CADASTRADA (ignorando acento
 * e maiúsculas) e devolve o NOME CANÔNICO — assim "catamarã" cai na obra
 * cadastrada "Catamara" em vez de criar uma obra ad-hoc divergente. Sem match
 * (ou sem nome), devolve o próprio nome. Usado ao gravar lançamentos.
 */
export async function canonizarObra(userWa: string, nome: string | null): Promise<string | null> {
  if (!nome) return null;
  const n = nome.trim();
  if (!n) return null;
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const alvo = norm(n);
  const supabase = getSupabase();
  const { data } = await supabase.from("secretaria_obras").select("nome").in("user_wa", waIdVariants(userWa));
  const obras = ((data ?? []) as { nome: string }[]).filter((o) => o.nome);
  const hit =
    obras.find((o) => norm(o.nome) === alvo) ??
    obras.find((o) => norm(o.nome).includes(alvo) || alvo.includes(norm(o.nome)));
  return hit ? hit.nome : n;
}

/**
 * Exclui uma obra EM CASCATA: o cadastro é a MATRIZ do sistema, então apagar a
 * obra apaga TUDO que é dela — custos, RDO, materiais, documentos, fotos
 * (inclusive os arquivos no Storage) e os eventos/lembretes da agenda vinculados
 * à obra — além do cadastro e da memória kind='obra'. Assim a obra some de TODAS
 * as abas de uma vez (é o espelho do cadastro). Operação destrutiva e sem volta.
 *
 * `recorders` (versão corporativa): quando o ADMIN exclui uma obra da empresa,
 * a cascata dos LANÇAMENTOS alcança também o que a EQUIPE lançou na obra (os
 * wa de todos os membros), não só o do admin. O CADASTRO em si continua sendo o
 * do admin (dono da obra da empresa). Sem `recorders` = só o próprio `userWa`.
 * Retorna um resumo do que foi removido.
 */
export async function excluirObra(
  userWa: string,
  opts: { id?: number | null; nome?: string | null },
  recorders?: string[],
): Promise<{ nome: string | null; fotosArquivos: number }> {
  const supabase = getSupabase();

  // Escopo de wa dos LANÇAMENTOS: equipe (recorders ∪ o próprio) ou só o próprio.
  const was =
    recorders && recorders.length > 0
      ? [...new Set([...recorders, ...waIdVariants(userWa)])]
      : null;
  // Aplica o escopo de wa a uma query (in recorders, ou eq o próprio). Tipagem
  // frouxa de propósito: os builders do Supabase são recursivos e estouram o
  // type-checker (TS2589) se tentamos preservar o tipo genérico aqui.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porWa = (q: any): any => (was ? q.in("user_wa", was) : q.eq("user_wa", userWa));

  // Resolve o NOME da obra (os lançamentos referenciam por nome). Se só veio o
  // id, busca o nome antes de apagar o cadastro.
  let nome = opts.nome?.trim() || null;
  if (!nome && opts.id) {
    const { data } = await supabase
      .from("secretaria_obras")
      .select("nome")
      .eq("user_wa", userWa)
      .eq("id", opts.id)
      .maybeSingle();
    nome = (data as { nome?: string } | null)?.nome ?? null;
  }

  let fotosArquivos = 0;
  if (nome) {
    // 1) Arquivos das fotos: coleta os caminhos ANTES de apagar as linhas.
    const { data: fotos } = await porWa(
      supabase.from("secretaria_fotos").select("caminho"),
    ).eq("obra", nome);
    const caminhos = ((fotos ?? []) as { caminho: string | null }[])
      .map((f) => f.caminho)
      .filter((c): c is string => !!c);

    // 2) Apaga os lançamentos vinculados em todas as tabelas-espelho + os
    //    eventos/lembretes da agenda daquela obra (senão lembretes órfãos
    //    disparariam por uma obra que não existe mais).
    const tabelas = [
      "secretaria_custos",
      "secretaria_rdo",
      "secretaria_materiais",
      "secretaria_documentos",
      "secretaria_fotos",
      "secretaria_eventos",
      "secretaria_etapas",
    ];
    for (const t of tabelas) {
      const { error } = await porWa(supabase.from(t).delete()).eq("obra", nome);
      if (error) console.error(`[obras] excluir cascata em ${t}: ${error.message}`);
    }

    // 3) Remove os arquivos das fotos do Storage (não crítico).
    if (caminhos.length > 0) {
      try {
        fotosArquivos = await removeFotos(caminhos);
      } catch (err) {
        console.error(`[obras] remover fotos do Storage: ${err instanceof Error ? err.message : err}`);
      }
    }

    // 4) Memória kind='obra' com esse nome (também da equipe, quando corporativo).
    await porWa(supabase.from("secretaria_memories").delete().eq("kind", "obra")).eq("content", nome);
  }

  // 5) Cadastro estruturado — é do admin/dono da obra (um registro).
  if (opts.id) {
    const { error } = await supabase.from("secretaria_obras").delete().eq("user_wa", userWa).eq("id", opts.id);
    if (error) throw new Error(`Falha ao excluir obra: ${error.message}`);
  } else if (nome) {
    const { error } = await supabase.from("secretaria_obras").delete().eq("user_wa", userWa).eq("nome", nome);
    if (error) throw new Error(`Falha ao excluir obra: ${error.message}`);
  }

  return { nome, fotosArquivos };
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
