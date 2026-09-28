import { getSupabase } from "../memory/supabase.js";
import {
  PLANOS as PLANOS_FALLBACK,
  PLANO_IDS,
  normalizarPlanoId,
  type Limites,
  type Plano,
  type PlanoId,
} from "./planos.js";

/**
 * Planos vindos do BANCO (secretaria_planos) — fonte da verdade editável pelo
 * admin. O preço que o backend cobra, o que a landing/cadastro exibem, os
 * LIMITES de uso aplicados e o que o admin ajusta são o MESMO dado. Se o banco
 * falhar, cai no estático (planos.ts) pra nunca quebrar a venda nem o uso.
 * Os RECURSOS (quais funções cada plano libera) são sempre do código.
 */

export interface PlanoRow {
  id: string;
  nome: string;
  valor: number;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
  limite_mensagens: number;
  limite_fotos: number;
  limite_audio_min: number;
  /** null = ilimitado */
  limite_obras: number | null;
}

// Cache curto em memória (a função serverless reaproveita entre mensagens).
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; rows: PlanoRow[] } | null = null;

export async function listPlanos(incluirInativos = false): Promise<PlanoRow[]> {
  let rows: PlanoRow[];
  if (cache && Date.now() - cache.at < CACHE_MS) {
    rows = cache.rows;
  } else {
    rows = await carregar();
    cache = { at: Date.now(), rows };
  }
  return incluirInativos ? rows : rows.filter((r) => r.ativo);
}

async function carregar(): Promise<PlanoRow[]> {
  try {
    const { data, error } = await getSupabase()
      .from("secretaria_planos")
      .select("*")
      .in("id", PLANO_IDS)
      .order("ordem", { ascending: true });
    if (error || !data || data.length === 0) return fallbackRows();
    return data.map((r) => toRow(r as Record<string, unknown>));
  } catch {
    return fallbackRows();
  }
}

function toRow(r: Record<string, unknown>): PlanoRow {
  const fb = PLANOS_FALLBACK[normalizarPlanoId(String(r.id)) ?? "obra"].limites;
  const num = (v: unknown, d: number) => (v === null || v === undefined || v === "" ? d : Number(v));
  return {
    id: String(r.id),
    nome: String(r.nome),
    valor: Number(r.valor),
    descricao: (r.descricao as string | null) ?? null,
    ativo: Boolean(r.ativo),
    ordem: Number(r.ordem),
    limite_mensagens: num(r.limite_mensagens, fb.mensagens),
    limite_fotos: num(r.limite_fotos, fb.fotos),
    limite_audio_min: num(r.limite_audio_min, fb.audioMin),
    limite_obras:
      r.limite_obras === undefined ? fb.obras : r.limite_obras === null ? null : Number(r.limite_obras),
  };
}

/**
 * Resolve o plano por id (do banco), com fallback no estático. Aceita ids
 * legados (essencial/profissional). Recursos vêm sempre do código.
 */
export async function getPlanoDb(id: string | null | undefined): Promise<Plano> {
  const pid: PlanoId = normalizarPlanoId(id) ?? "obra";
  const base = PLANOS_FALLBACK[pid];
  const achado = (await listPlanos(true)).find((p) => p.id === pid);
  if (!achado) return base;
  const limites: Limites = {
    mensagens: achado.limite_mensagens,
    fotos: achado.limite_fotos,
    audioMin: achado.limite_audio_min,
    obras: achado.limite_obras,
  };
  return { ...base, nome: `Rosana ${achado.nome}`, valor: achado.valor, limites };
}

/** Atualiza (ou cria) um plano — usado pelo admin. */
export async function upsertPlano(input: {
  id: string;
  nome?: string;
  valor?: number;
  descricao?: string | null;
  ativo?: boolean;
  ordem?: number;
  limite_mensagens?: number;
  limite_fotos?: number;
  limite_audio_min?: number;
  limite_obras?: number | null;
}): Promise<PlanoRow> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = { id: input.id, updated_at: new Date().toISOString() };
  for (const k of [
    "nome",
    "valor",
    "descricao",
    "ativo",
    "ordem",
    "limite_mensagens",
    "limite_fotos",
    "limite_audio_min",
    "limite_obras",
  ] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const { data, error } = await supabase
    .from("secretaria_planos")
    .upsert(patch, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao salvar plano: ${error.message}`);
  cache = null; // o próximo uso já enxerga o valor novo
  return toRow(data as Record<string, unknown>);
}

function fallbackRows(): PlanoRow[] {
  return PLANO_IDS.map((id, i) => {
    const p = PLANOS_FALLBACK[id];
    return {
      id: p.id,
      nome: p.nome.replace(/^Rosana\s+/, ""),
      valor: p.valor,
      descricao: null,
      ativo: true,
      ordem: i + 1,
      limite_mensagens: p.limites.mensagens,
      limite_fotos: p.limites.fotos,
      limite_audio_min: p.limites.audioMin,
      limite_obras: p.limites.obras,
    };
  });
}
