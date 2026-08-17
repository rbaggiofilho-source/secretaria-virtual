/**
 * Helpers de data/hora centralizados no fuso do dono (America/Sao_Paulo por
 * padrão). Toda a lógica de "agora" e formatação passa por aqui para garantir
 * que a secretária sempre raciocine no fuso certo.
 */

import { getEnv } from "../config/env";

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
