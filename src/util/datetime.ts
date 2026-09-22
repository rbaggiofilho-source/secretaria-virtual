/**
 * Helpers de data/hora centralizados no fuso do dono (America/Sao_Paulo por
 * padrão). Toda a lógica de "agora" e formatação passa por aqui para garantir
 * que a secretária sempre raciocine no fuso certo.
 */

import { getEnv } from "../config/env.js";

export function timezone(): string {
  return getEnv().TIMEZONE;
}

/** Data/hora atual formatada de forma legível no fuso do dono. */
export function nowInTimezone(): string {
  const tz = timezone();
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  return `${formatted} (${tz})`;
}

/** ISO 8601 do "agora", útil para o modelo ancorar datas relativas. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Data de hoje no fuso do dono, no formato "YYYY-MM-DD". */
export function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Converte "YYYY-MM-DD" em timestamp UTC (meia-noite). */
function utcMidnight(isoDate: string): number {
  const p = isoDate.split("-");
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** Soma (ou subtrai, com n negativo) dias a uma data "YYYY-MM-DD". */
export function addDays(isoDate: string, n: number): string {
  const dt = new Date(utcMidnight(isoDate));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas "YYYY-MM-DD" (b - a). */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((utcMidnight(bIso) - utcMidnight(aIso)) / 86400000);
}

/**
 * Soma (ou subtrai) meses a uma data "YYYY-MM-DD", com CLAMP para o último dia
 * do mês de destino (ex.: 31/01 + 1 mês → 28/02, não 03/03). Assim "daqui a um
 * mês" cai numa data válida sempre.
 */
export function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = alvo.getUTCFullYear();
  const tm = alvo.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return new Date(Date.UTC(ty, tm, dia)).toISOString().slice(0, 10);
}

/**
 * Dia da semana em pt-BR (ex.: "terça-feira") de uma data "YYYY-MM-DD" ou de um
 * datetime ISO com offset. CÁLCULO DETERMINÍSTICO — o modelo não deve deduzir
 * dia da semana de cabeça (erra). Para data sem hora, ancora ao meio-dia no
 * fuso para não escorregar de dia.
 */
export function weekdayBr(iso: string): string {
  const base = iso.includes("T") ? iso : `${iso}T12:00:00-03:00`;
  const dt = new Date(base);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone(),
    weekday: "long",
  }).format(dt);
}

/**
 * Bloco de datas de referência JÁ CALCULADAS (próximos `dias` dias a partir de
 * hoje, no fuso do dono), com dia da semana. Serve para o modelo ANCORAR datas
 * relativas ("amanhã", "sexta", "dia 25", "semana que vem") sem fazer conta de
 * cabeça — ele erra tanto o dia da semana quanto a própria data. Marca hoje,
 * amanhã e depois de amanhã explicitamente.
 */
export function datasReferencia(dias = 16): string {
  const hoje = todayIsoDate();
  const linhas: string[] = [];
  for (let i = 0; i < dias; i++) {
    const d = addDays(hoje, i);
    let rotulo = "";
    if (i === 0) rotulo = "   ← HOJE";
    else if (i === 1) rotulo = "   ← amanhã";
    else if (i === 2) rotulo = "   ← depois de amanhã";
    linhas.push(`  ${d}  ${weekdayBr(d)}${rotulo}`);
  }
  return linhas.join("\n");
}

/**
 * Formata uma data "YYYY-MM-DD" (sem hora) de forma legível em pt-BR, ex.:
 * "terça-feira, 18/08/2026". Constrói a data ao meio-dia UTC para não sofrer
 * deslocamento de dia por fuso.
 */
export function formatDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dt);
}
