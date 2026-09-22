import {
  loadOwnerContext,
  relatorioCustos,
  consultarRDO,
  consultarDocumentos,
  consultarMateriais,
  consultarFotos,
} from "../memory/context.js";
import { listObrasStruct, type ObraStatus } from "../memory/obras.js";

/** Uma obra consolidada: cadastro estruturado (se houver) + contadores. */
export interface ObraResumo {
  id: number | null; // id do cadastro estruturado, ou null se ainda não organizada
  nome: string;
  cliente: string | null;
  endereco: string | null;
  contexto: string | null;
  dataInicio: string | null;
  dataFimAlvo: string | null;
  status: ObraStatus | null;
  gasto: number;
  custos: number;
  rdos: number;
  materiais: number;
  documentos: number;
  fotos: number;
  ultimaAtividade: string | null;
}

function vazia(nome: string): ObraResumo {
  return {
    id: null, nome, cliente: null, endereco: null, contexto: null,
    dataInicio: null, dataFimAlvo: null, status: null,
    gasto: 0, custos: 0, rdos: 0, materiais: 0, documentos: 0, fotos: 0, ultimaAtividade: null,
  };
}

export async function buildObras(userWa: string): Promise<ObraResumo[]> {
  const [estruturadas, ctx, custos, rdos, docs, materiais, fotos] = await Promise.all([
    listObrasStruct(userWa),
    loadOwnerContext(userWa),
    relatorioCustos(userWa, {}),
    consultarRDO(userWa, {}),
    consultarDocumentos(userWa, { incluirArquivados: true }),
    consultarMateriais(userWa, {}),
    consultarFotos(userWa, {}),
  ]);

  const mapa = new Map<string, ObraResumo>();
  const chave = (nome: string) => nome.trim().toLowerCase();
  const tocar = (nome: string | null | undefined): ObraResumo | null => {
    const n = (nome ?? "").trim();
    if (!n) return null;
    const k = chave(n);
    let o = mapa.get(k);
    if (!o) { o = vazia(n); mapa.set(k, o); }
    return o;
  };
  const marcarData = (o: ObraResumo, data: string | null) => {
    if (data && (!o.ultimaAtividade || data > o.ultimaAtividade)) o.ultimaAtividade = data;
  };

  // 1) Cadastro estruturado é a fonte primária dos campos.
  for (const e of estruturadas) {
    const o = tocar(e.nome);
    if (o) {
      o.id = e.id;
      o.cliente = e.cliente;
      o.endereco = e.endereco;
      o.contexto = e.contexto;
      o.dataInicio = e.data_inicio;
      o.dataFimAlvo = e.data_fim_alvo;
      o.status = e.status;
    }
  }

  // 2) Obras que aparecem só como memória (ainda não organizadas).
  for (const nome of ctx.obras) tocar(nome);

  // 3) Contadores a partir dos lançamentos.
  for (const it of custos.itens) {
    const o = tocar(it.obra);
    if (o) { o.gasto += Number(it.valor) || 0; o.custos += 1; marcarData(o, it.data); }
  }
  for (const r of rdos) {
    const o = tocar(r.obra);
    if (o) { o.rdos += 1; marcarData(o, r.data); }
  }
  for (const m of materiais) { const o = tocar(m.obra); if (o) o.materiais += 1; }
  for (const d of docs) { const o = tocar(d.obra); if (o) o.documentos += 1; }
  for (const f of fotos) { const o = tocar(f.obra); if (o) { o.fotos += 1; marcarData(o, f.data); } }

  // Organizadas primeiro (têm id), depois por gasto.
  return [...mapa.values()].sort((a, b) => {
    if ((a.id != null) !== (b.id != null)) return a.id != null ? -1 : 1;
    return b.gasto - a.gasto;
  });
}
