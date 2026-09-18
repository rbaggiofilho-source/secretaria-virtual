import { PRECOS, type Preco } from "../data/precos-referencia.js";

/**
 * Busca na base de preços de REFERÊNCIA (média de mercado). É conhecimento
 * estático compartilhado — ajuda a Rosana a estimar orçamentos. NÃO é cotação
 * real do fornecedor do usuário.
 */

export type { Preco };

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Busca por termo (ex.: "cimento", "vergalhão 10", "tinta acrílica"). Casa todas
 * as palavras contra item/subcategoria/categoria/especificação; dá bônus quando
 * o item contém o termo inteiro. Retorna os melhores (até `limite`).
 */
export function buscarPrecos(termo: string, limite = 8): Preco[] {
  const t = norm(termo).trim();
  if (!t) return [];
  const palavras = t.split(/\s+/);

  const scored = PRECOS.map((p) => {
    const hay = norm(`${p.item} ${p.subcategoria} ${p.categoria} ${p.especificacao}`);
    let score = 0;
    for (const w of palavras) if (hay.includes(w)) score++;
    if (norm(p.item).includes(t)) score += 2;
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limite).map((x) => x.p);
}
