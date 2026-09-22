import {
  loadOwnerContext,
  relatorioCustos,
  consultarRDO,
  consultarDocumentos,
  consultarMateriais,
  consultarFotos,
} from "../memory/context.js";

/** Uma obra consolidada (derivada — não há tabela de obras no modelo). */
export interface ObraResumo {
  nome: string;
  gasto: number;
  custos: number;
  rdos: number;
  materiais: number;
  documentos: number;
  fotos: number;
  ultimaAtividade: string | null;
}

/**
 * Lista consolidada de obras do usuário, agregando os nomes de obra que
 * aparecem em memórias/custos/RDO/materiais/documentos/fotos e somando os
 * indicadores de cada uma. Ordena por gasto (maior primeiro).
 */
export async function buildObras(userWa: string): Promise<ObraResumo[]> {
  const [ctx, custos, rdos, docs, materiais, fotos] = await Promise.all([
    loadOwnerContext(userWa),
    relatorioCustos(userWa, {}),
    consultarRDO(userWa, {}),
    consultarDocumentos(userWa, { incluirArquivados: true }),
    consultarMateriais(userWa, {}),
    consultarFotos(userWa, {}),
  ]);

  const mapa = new Map<string, ObraResumo>();
  const tocar = (nome: string | null | undefined): ObraResumo | null => {
    const n = (nome ?? "").trim();
    if (!n) return null;
    const k = n.toLowerCase();
    let o = mapa.get(k);
    if (!o) {
      o = { nome: n, gasto: 0, custos: 0, rdos: 0, materiais: 0, documentos: 0, fotos: 0, ultimaAtividade: null };
      mapa.set(k, o);
    }
    return o;
  };
  const marcarData = (o: ObraResumo, data: string | null) => {
    if (data && (!o.ultimaAtividade || data > o.ultimaAtividade)) o.ultimaAtividade = data;
  };

  for (const nome of ctx.obras) tocar(nome);
  for (const it of custos.itens) {
    const o = tocar(it.obra);
    if (o) {
      o.gasto += Number(it.valor) || 0;
      o.custos += 1;
      marcarData(o, it.data);
    }
  }
  for (const r of rdos) {
    const o = tocar(r.obra);
    if (o) {
      o.rdos += 1;
      marcarData(o, r.data);
    }
  }
  for (const m of materiais) {
    const o = tocar(m.obra);
    if (o) o.materiais += 1;
  }
  for (const d of docs) {
    const o = tocar(d.obra);
    if (o) o.documentos += 1;
  }
  for (const f of fotos) {
    const o = tocar(f.obra);
    if (o) {
      o.fotos += 1;
      marcarData(o, f.data);
    }
  }

  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
}
