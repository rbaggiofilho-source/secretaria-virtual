/**
 * Planos da Rosana (assinatura mensal). Fonte da verdade dos preços no backend
 * — a landing/cadastro exibe os mesmos valores, mas quem cobra é o servidor.
 */

export type PlanoId = "essencial" | "profissional";

export interface Plano {
  id: PlanoId;
  nome: string;
  valor: number; // mensal, em BRL
}

export const PLANOS: Record<PlanoId, Plano> = {
  essencial: { id: "essencial", nome: "Rosana Essencial", valor: 89.9 },
  profissional: { id: "profissional", nome: "Rosana Profissional", valor: 169.9 },
};

/** Resolve o plano por id, com fallback no Profissional. */
export function resolvePlano(id: string | null | undefined): Plano {
  const plano = id ? PLANOS[id as PlanoId] : undefined;
  return plano ?? PLANOS.profissional;
}
