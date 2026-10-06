import { getSupabase } from "./supabase.js";

/**
 * Etapas (fases) de uma obra — a "sub-matriz" dentro da obra. Cada lançamento
 * (foto/custo/RDO/documento/material/evento) pode ser etiquetado com uma etapa
 * pelo NOME, dentro da obra (mesmo padrão de obra-por-nome). O registro das
 * etapas fica em `secretaria_etapas` (permite etapa VAZIA, ordem e renomear).
 * Fase 1: o registro é por `user_wa` de quem cria (o escopo corporativo das
 * etapas é refinamento da Fase 2).
 */

export type EtapaStatus = "planejada" | "em_andamento" | "concluida";

export interface EtapaRow {
  id: number;
  user_wa: string;
  obra: string;
  nome: string;
  ordem: number;
  status: EtapaStatus;
  created_at: string;
}

/** Lista as etapas de uma obra, na ordem definida. */
export async function listarEtapas(userWa: string, obra: string): Promise<EtapaRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_etapas")
    .select("*")
    .eq("user_wa", userWa)
    .eq("obra", obra)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar etapas: ${error.message}`);
  return (data ?? []) as EtapaRow[];
}

/**
 * Cria uma etapa (find-or-create por user_wa+obra+nome, case-insensitive). Se já
 * existir, devolve a existente (sem duplicar). Ordem padrão = fim da lista.
 */
export async function criarEtapa(
  userWa: string,
  obra: string,
  nome: string,
  opts?: { ordem?: number; status?: EtapaStatus },
): Promise<EtapaRow> {
  const supabase = getSupabase();
  const o = obra.trim();
  const n = nome.trim();
  if (!o || !n) throw new Error("obra_e_nome_obrigatorios");

  const { data: existente } = await supabase
    .from("secretaria_etapas")
    .select("*")
    .eq("user_wa", userWa)
    .eq("obra", o)
    .ilike("nome", n)
    .maybeSingle();
  if (existente) return existente as EtapaRow;

  let ordem = opts?.ordem;
  if (ordem === undefined) {
    const { data: ult } = await supabase
      .from("secretaria_etapas")
      .select("ordem")
      .eq("user_wa", userWa)
      .eq("obra", o)
      .order("ordem", { ascending: false })
      .limit(1);
    ordem = ((ult?.[0]?.ordem as number | undefined) ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("secretaria_etapas")
    .insert({ user_wa: userWa, obra: o, nome: n, ordem, status: opts?.status ?? "planejada" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao criar etapa: ${error.message}`);
  return data as EtapaRow;
}

/**
 * Resolve a etapa de um lançamento: se veio `etapa` (e `obra`), garante que a
 * etapa existe (cria se preciso) e devolve o NOME CANÔNICO para gravar na coluna
 * `etapa` do lançamento. Sem obra/etapa → null (lançamento sem etapa).
 */
export async function resolverOuCriarEtapa(
  userWa: string,
  obra: string | null | undefined,
  etapa: string | null | undefined,
): Promise<string | null> {
  if (!obra || !etapa) return null;
  const e = etapa.trim();
  if (!e) return null;
  const row = await criarEtapa(userWa, obra, e);
  return row.nome;
}
