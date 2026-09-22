import { getSupabase } from "../memory/supabase.js";
import { PLANOS as PLANOS_FALLBACK, type Plano } from "./planos.js";

/**
 * Planos vindos do BANCO (secretaria_planos) — fonte da verdade editável pelo
 * admin. O preço que o backend cobra, o que a landing/cadastro exibem e o que o
 * admin ajusta são o MESMO dado. Se o banco falhar, cai no estático (planos.ts)
 * pra nunca quebrar a venda.
 */

export interface PlanoRow {
  id: string;
  nome: string;
  valor: number;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
}

export async function listPlanos(incluirInativos = false): Promise<PlanoRow[]> {
  try {
    const supabase = getSupabase();
    let query = supabase.from("secretaria_planos").select("*").order("ordem", { ascending: true });
    if (!incluirInativos) query = query.eq("ativo", true);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return fallbackRows(incluirInativos);
    return data.map((r) => ({
      id: String(r.id),
      nome: String(r.nome),
      valor: Number(r.valor),
      descricao: (r.descricao as string | null) ?? null,
      ativo: Boolean(r.ativo),
      ordem: Number(r.ordem),
    }));
  } catch {
    return fallbackRows(incluirInativos);
  }
}

/** Resolve um plano por id (do banco), com fallback no estático. */
export async function getPlanoDb(id: string): Promise<Plano> {
  const planos = await listPlanos(true);
  const achado = planos.find((p) => p.id === id);
  if (achado) return { id: achado.id as Plano["id"], nome: `Rosana ${achado.nome}`, valor: achado.valor };
  return PLANOS_FALLBACK[id as Plano["id"]] ?? PLANOS_FALLBACK.profissional;
}

/** Atualiza (ou cria) um plano — usado pelo admin. */
export async function upsertPlano(input: {
  id: string;
  nome?: string;
  valor?: number;
  descricao?: string | null;
  ativo?: boolean;
  ordem?: number;
}): Promise<PlanoRow> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = { id: input.id, updated_at: new Date().toISOString() };
  if (input.nome !== undefined) patch.nome = input.nome;
  if (input.valor !== undefined) patch.valor = input.valor;
  if (input.descricao !== undefined) patch.descricao = input.descricao;
  if (input.ativo !== undefined) patch.ativo = input.ativo;
  if (input.ordem !== undefined) patch.ordem = input.ordem;
  const { data, error } = await supabase
    .from("secretaria_planos")
    .upsert(patch, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao salvar plano: ${error.message}`);
  return {
    id: String(data.id),
    nome: String(data.nome),
    valor: Number(data.valor),
    descricao: (data.descricao as string | null) ?? null,
    ativo: Boolean(data.ativo),
    ordem: Number(data.ordem),
  };
}

function fallbackRows(incluirInativos: boolean): PlanoRow[] {
  const rows = Object.values(PLANOS_FALLBACK).map((p, i) => ({
    id: p.id,
    nome: p.nome.replace(/^Rosana\s+/, ""),
    valor: p.valor,
    descricao: null,
    ativo: true,
    ordem: i + 1,
  }));
  return incluirInativos ? rows : rows.filter((r) => r.ativo);
}
