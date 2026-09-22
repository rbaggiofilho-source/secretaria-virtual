import { addDays } from "../util/datetime.js";
import {
  loadOwnerContext,
  relatorioCustos,
  consultarRDO,
  consultarDocumentos,
  consultarMateriais,
  consultarFotos,
  getPending,
  type EfetivoItem,
} from "../memory/context.js";

/**
 * Monta o panorama do dashboard web a partir dos dados REAIS do usuário
 * (escopados por user_wa no servidor). Só expõe o que de fato existe hoje no
 * modelo de dados — não há "orçamento/progresso" de obra, então esses campos
 * não são inventados aqui.
 */

export interface DashboardObra {
  nome: string;
  gasto: number;
  custos: number; // nº de lançamentos
  rdos: number;
  ultimaAtividade: string | null; // data ISO (do RDO/custo mais recente)
}

export interface DashboardData {
  stats: {
    obrasAtivas: number;
    custoTotal: number;
    custoMes: number;
    rdosMes: number;
    prazosProximos: number;
  };
  obras: DashboardObra[];
  custosPorCategoria: Array<{ categoria: string; valor: number }>;
  custoTotal: number;
  rdos: Array<{
    id: number;
    data: string;
    obra: string;
    clima: string | null;
    efetivo: number;
    atividades: string | null;
  }>;
  documentosProximos: Array<{
    tipo: string;
    descricao: string;
    obra: string | null;
    vencimento: string | null;
  }>;
  contadores: { fotos: number; materiais: number; pendencias: number };
}

function somaEfetivo(efetivo: EfetivoItem[] | null | undefined): number {
  if (!Array.isArray(efetivo)) return 0;
  return efetivo.reduce((s, e) => s + (Number(e?.qtd) || 0), 0);
}

/** Início do mês corrente (YYYY-MM-DD) no fuso informado. */
function inicioDoMes(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}-01`;
}

export async function buildDashboard(
  userWa: string,
  tz = "America/Sao_Paulo",
): Promise<DashboardData> {
  const mesInicio = inicioDoMes(tz);

  const [ctx, custosAll, custosMes, rdos, docs, materiais, fotos, pendencias] =
    await Promise.all([
      loadOwnerContext(userWa),
      relatorioCustos(userWa, {}),
      relatorioCustos(userWa, { desde: mesInicio }),
      consultarRDO(userWa, {}),
      consultarDocumentos(userWa, {}),
      consultarMateriais(userWa, {}),
      consultarFotos(userWa, {}),
      getPending(userWa),
    ]);

  // ----- Obras: agrega nomes de várias fontes e soma o gasto por obra -----
  const obrasMap = new Map<string, DashboardObra>();
  const chave = (nome: string) => nome.trim().toLowerCase();
  const tocar = (nome: string | null | undefined): DashboardObra | null => {
    const n = (nome ?? "").trim();
    if (!n) return null;
    const k = chave(n);
    let o = obrasMap.get(k);
    if (!o) {
      o = { nome: n, gasto: 0, custos: 0, rdos: 0, ultimaAtividade: null };
      obrasMap.set(k, o);
    }
    return o;
  };

  for (const nome of ctx.obras) tocar(nome);
  for (const it of custosAll.itens) {
    const o = tocar(it.obra);
    if (o) {
      o.gasto += Number(it.valor) || 0;
      o.custos += 1;
      if (!o.ultimaAtividade || it.data > o.ultimaAtividade) o.ultimaAtividade = it.data;
    }
  }
  for (const r of rdos) {
    const o = tocar(r.obra);
    if (o) {
      o.rdos += 1;
      if (!o.ultimaAtividade || r.data > o.ultimaAtividade) o.ultimaAtividade = r.data;
    }
  }
  for (const m of materiais) tocar(m.obra);

  const obras = [...obrasMap.values()].sort((a, b) => b.gasto - a.gasto);

  // ----- Prazos próximos: documentos vencendo nos próximos 15 dias -----
  // Compara datas YYYY-MM-DD no fuso do usuário (antes usava o relógio UTC do
  // servidor e errava o "hoje" entre 21h e 0h em Brasília).
  const hojeIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const limiteIso = addDays(hojeIso, 15);
  const prazosProximos = docs.filter(
    (d) => d.vencimento != null && d.vencimento >= hojeIso && d.vencimento <= limiteIso,
  ).length;

  // RDOs do mês corrente
  const rdosMes = rdos.filter((r) => r.data >= mesInicio).length;

  return {
    stats: {
      obrasAtivas: obras.length,
      custoTotal: custosAll.total,
      custoMes: custosMes.total,
      rdosMes,
      prazosProximos,
    },
    obras,
    custosPorCategoria: Object.entries(custosAll.porCategoria).map(([categoria, valor]) => ({
      categoria,
      valor,
    })),
    custoTotal: custosAll.total,
    rdos: rdos.slice(0, 8).map((r) => ({
      id: r.id,
      data: r.data,
      obra: r.obra,
      clima: r.clima,
      efetivo: somaEfetivo(r.efetivo),
      atividades: r.atividades,
    })),
    documentosProximos: docs
      .filter((d) => d.vencimento)
      .slice(0, 8)
      .map((d) => ({
        tipo: d.tipo,
        descricao: d.descricao,
        obra: d.obra,
        vencimento: d.vencimento,
      })),
    contadores: {
      fotos: fotos.length,
      materiais: materiais.length,
      pendencias: pendencias.length,
    },
  };
}
