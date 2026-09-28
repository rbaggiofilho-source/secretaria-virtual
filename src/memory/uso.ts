import { getEnv } from "../config/env.js";
import { getSupabase } from "./supabase.js";
import { waIdVariants } from "./context.js";

/**
 * Medição de USO e CUSTO REAL por usuário/mês (tabela secretaria_uso, uma linha
 * por user_wa+mês). Alimenta: (1) os limites dos planos, (2) os pacotes extras
 * comprados no mês e (3) o "consumo" do admin em R$ de verdade — a partir do
 * `usage` que a própria API da Anthropic devolve em cada chamada, não de
 * estimativa.
 *
 * O incremento é atômico no Postgres (RPC secretaria_uso_incrementar), então
 * mensagens simultâneas não se atropelam. A leitura soma as variantes do wa_id
 * (nono dígito), já que o mesmo usuário pode ter duas linhas.
 */

export interface UsoMes {
  mes: string;
  mensagens: number;
  fotos: number;
  audio_seg: number;
  chamadas_ia: number;
  custo_usd: number;
  extra_mensagens: number;
  extra_fotos: number;
  extra_audio_seg: number;
}

export interface UsoDelta {
  mensagens?: number;
  fotos?: number;
  audioSeg?: number;
  chamadasIa?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
  tokensCacheLeitura?: number;
  tokensCacheEscrita?: number;
  custoUsd?: number;
  extraMensagens?: number;
  extraFotos?: number;
  extraAudioSeg?: number;
}

/** Mês corrente no fuso do usuário, "YYYY-MM" (a cota vira no dia 1º). */
export function mesAtual(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getEnv().TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function vazio(mes: string): UsoMes {
  return {
    mes,
    mensagens: 0,
    fotos: 0,
    audio_seg: 0,
    chamadas_ia: 0,
    custo_usd: 0,
    extra_mensagens: 0,
    extra_fotos: 0,
    extra_audio_seg: 0,
  };
}

/** Uso do mês (somando as variantes do wa_id). */
export async function getUsoMes(userWa: string, mes = mesAtual()): Promise<UsoMes> {
  const { data, error } = await getSupabase()
    .from("secretaria_uso")
    .select("*")
    .in("user_wa", waIdVariants(userWa))
    .eq("mes", mes);
  if (error) throw new Error(`Falha ao ler uso: ${error.message}`);
  const total = vazio(mes);
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    total.mensagens += Number(r.mensagens ?? 0);
    total.fotos += Number(r.fotos ?? 0);
    total.audio_seg += Number(r.audio_seg ?? 0);
    total.chamadas_ia += Number(r.chamadas_ia ?? 0);
    total.custo_usd += Number(r.custo_usd ?? 0);
    total.extra_mensagens += Number(r.extra_mensagens ?? 0);
    total.extra_fotos += Number(r.extra_fotos ?? 0);
    total.extra_audio_seg += Number(r.extra_audio_seg ?? 0);
  }
  return total;
}

/** Soma um delta ao uso do mês (atômico). */
export async function incrementarUso(userWa: string, d: UsoDelta, mes = mesAtual()): Promise<void> {
  const { error } = await getSupabase().rpc("secretaria_uso_incrementar", {
    p_user_wa: userWa,
    p_mes: mes,
    p_mensagens: d.mensagens ?? 0,
    p_fotos: d.fotos ?? 0,
    p_audio_seg: Math.round(d.audioSeg ?? 0),
    p_chamadas_ia: d.chamadasIa ?? 0,
    p_tokens_entrada: d.tokensEntrada ?? 0,
    p_tokens_saida: d.tokensSaida ?? 0,
    p_tokens_cache_leitura: d.tokensCacheLeitura ?? 0,
    p_tokens_cache_escrita: d.tokensCacheEscrita ?? 0,
    p_custo_usd: Number((d.custoUsd ?? 0).toFixed(6)),
    p_extra_mensagens: d.extraMensagens ?? 0,
    p_extra_fotos: d.extraFotos ?? 0,
    p_extra_audio_seg: Math.round(d.extraAudioSeg ?? 0),
  });
  if (error) throw new Error(`Falha ao registrar uso: ${error.message}`);
}

/** Uso de todos os usuários num mês (admin: consumo real por usuário). */
export async function listUsoMes(mes = mesAtual()): Promise<Array<UsoMes & { user_wa: string }>> {
  const { data, error } = await getSupabase().from("secretaria_uso").select("*").eq("mes", mes);
  if (error) throw new Error(`Falha ao listar uso: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    user_wa: String(r.user_wa),
    mes: String(r.mes),
    mensagens: Number(r.mensagens ?? 0),
    fotos: Number(r.fotos ?? 0),
    audio_seg: Number(r.audio_seg ?? 0),
    chamadas_ia: Number(r.chamadas_ia ?? 0),
    custo_usd: Number(r.custo_usd ?? 0),
    extra_mensagens: Number(r.extra_mensagens ?? 0),
    extra_fotos: Number(r.extra_fotos ?? 0),
    extra_audio_seg: Number(r.extra_audio_seg ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Custo em US$ a partir do `usage` da API
// ---------------------------------------------------------------------------

/** Preço por 1M tokens (US$). Cache: leitura 0,1×; escrita 5min 1,25×; 1h 2×. */
const PRECOS: Array<{ prefixo: string; entrada: number; saida: number }> = [
  { prefixo: "claude-haiku-4-5", entrada: 1, saida: 5 },
  { prefixo: "claude-sonnet-5", entrada: 2, saida: 10 },
  { prefixo: "claude-sonnet-4", entrada: 3, saida: 15 },
  { prefixo: "claude-opus-5", entrada: 5, saida: 25 },
];

export interface UsageApi {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

export function custoChamadaUsd(model: string, u: UsageApi): number {
  const p = PRECOS.find((x) => model.startsWith(x.prefixo)) ?? PRECOS[0]!;
  const leitura = u.cache_read_input_tokens ?? 0;
  const escritaTotal = u.cache_creation_input_tokens ?? 0;
  const escrita1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const escrita5m = Math.max(0, escritaTotal - escrita1h);
  const porM = 1_000_000;
  return (
    (u.input_tokens * p.entrada +
      leitura * p.entrada * 0.1 +
      escrita5m * p.entrada * 1.25 +
      escrita1h * p.entrada * 2 +
      u.output_tokens * p.saida) /
    porM
  );
}

/** Groq whisper-large-v3: US$ 0,111 por hora de áudio. */
export function custoAudioUsd(segundos: number): number {
  return (Math.max(10, segundos) / 3600) * 0.111;
}
