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
