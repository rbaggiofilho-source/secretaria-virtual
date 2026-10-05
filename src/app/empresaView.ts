import {
  relatorioCustos,
  consultarRDO,
  consultarDocumentos,
  consultarMateriais,
  consultarFotos,
  type EfetivoItem,
} from "../memory/context.js";
import { listarObrasEmpresa } from "../memory/empresa.js";
import type { EscopoPainel } from "../corp/escopo.js";
import type { DashboardData } from "./dashboard.js";
import type { ObraResumo } from "./obras.js";

/**
 * Visão do painel para o ENGENHEIRO (membro de empresa): reaproveita as leituras
 * de context.ts com o escopo por obra (lê dados de QUALQUER membro, restrito às
 * obras atribuídas). NÃO toca no fluxo pessoal — é um caminho separado.
 */

function somaEfetivo(efetivo: EfetivoItem[] | null | undefined): number {
  if (!Array.isArray(efetivo)) return 0;
  return efetivo.reduce((s, e) => s + (Number(e?.qtd) || 0), 0);
}

function inicioDoMes(tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value ?? "1970";
  const m = p.find((x) => x.type === "month")?.value ?? "01";
  return `${y}-${m}-01`;
}

/** Cartões de obra (drill) com contadores, só das obras atribuídas ao engenheiro. */
export async function buildObrasEmpresa(esc: EscopoPainel): Promise<ObraResumo[]> {
  const [obrasEmpresa, custos, rdos, docs, materiais, fotos] = await Promise.all([
    listarObrasEmpresa(esc.empresaId),
    relatorioCustos("", {}, esc.leitura),
    consultarRDO("", {}, esc.leitura),
    consultarDocumentos("", { incluirArquivados: true }, esc.leitura),
    consultarMateriais("", {}, esc.leitura),
    consultarFotos("", {}, esc.leitura),
  ]);

  const acessiveis = new Set(esc.obras.map((n) => n.trim().toLowerCase()));
  const mapa = new Map<string, ObraResumo>();
  const chave = (n: string) => n.trim().toLowerCase();
  const base = (nome: string): ObraResumo => ({
    id: null, nome, cliente: null, endereco: null, contexto: null,
    dataInicio: null, dataFimAlvo: null, status: null,
    gasto: 0, custos: 0, rdos: 0, materiais: 0, documentos: 0, fotos: 0, ultimaAtividade: null,
  });
  const tocar = (nome: string | null | undefined): ObraResumo | null => {
    const n = (nome ?? "").trim();
    if (!n || !acessiveis.has(chave(n))) return null;
    let o = mapa.get(chave(n));
    if (!o) { o = base(n); mapa.set(chave(n), o); }
    return o;
  };
  const marcar = (o: ObraResumo, d: string | null) => { if (d && (!o.ultimaAtividade || d > o.ultimaAtividade)) o.ultimaAtividade = d; };

  // Cadastro da obra (nome/cliente/endereço/status) — fonte primária dos campos.
  for (const e of obrasEmpresa) {
    const o = tocar(e.nome);
    if (o) { o.id = e.id; o.cliente = e.cliente; o.endereco = e.endereco; o.status = (e.status as ObraResumo["status"]) ?? null; }
  }
  for (const it of custos.itens) { const o = tocar(it.obra); if (o) { o.gasto += Number(it.valor) || 0; o.custos += 1; marcar(o, it.data); } }
  for (const r of rdos) { const o = tocar(r.obra); if (o) { o.rdos += 1; marcar(o, r.data); } }
  for (const m of materiais) { const o = tocar(m.obra); if (o) o.materiais += 1; }
  for (const d of docs) { const o = tocar(d.obra); if (o) o.documentos += 1; }
  for (const f of fotos) { const o = tocar(f.obra); if (o) { o.fotos += 1; marcar(o, f.data); } }

  return [...mapa.values()].sort((a, b) => (a.id != null) !== (b.id != null) ? (a.id != null ? -1 : 1) : b.gasto - a.gasto);
}

/** Dashboard (Visão geral) do engenheiro, escopado às obras dele. */
export async function buildDashboardEmpresa(esc: EscopoPainel, tz = "America/Sao_Paulo"): Promise<DashboardData> {
  const mesInicio = inicioDoMes(tz);
  const [custosAll, custosMes, rdos, docs, materiais, fotos] = await Promise.all([
    relatorioCustos("", {}, esc.leitura),
    relatorioCustos("", { desde: mesInicio }, esc.leitura),
    consultarRDO("", {}, esc.leitura),
    consultarDocumentos("", {}, esc.leitura),
    consultarMateriais("", {}, esc.leitura),
    consultarFotos("", {}, esc.leitura),
  ]);

  const obrasMap = new Map<string, DashboardData["obras"][number]>();
  const chave = (n: string) => n.trim().toLowerCase();
  const tocar = (nome: string | null | undefined) => {
    const n = (nome ?? "").trim();
    if (!n) return null;
    let o = obrasMap.get(chave(n));
    if (!o) { o = { nome: n, gasto: 0, custos: 0, rdos: 0, ultimaAtividade: null }; obrasMap.set(chave(n), o); }
    return o;
  };
  for (const nome of esc.obras) tocar(nome);
  for (const it of custosAll.itens) { const o = tocar(it.obra); if (o) { o.gasto += Number(it.valor) || 0; o.custos += 1; if (!o.ultimaAtividade || it.data > o.ultimaAtividade) o.ultimaAtividade = it.data; } }
  for (const r of rdos) { const o = tocar(r.obra); if (o) { o.rdos += 1; if (!o.ultimaAtividade || r.data > o.ultimaAtividade) o.ultimaAtividade = r.data; } }
  for (const m of materiais) tocar(m.obra);
  const obras = [...obrasMap.values()].sort((a, b) => b.gasto - a.gasto);

  const hoje = new Date();
  const limite = new Date(hoje.getTime() + 15 * 86400000);
  const prazosProximos = docs.filter((d) => d.vencimento && new Date(d.vencimento) >= new Date(hoje.toDateString()) && new Date(d.vencimento) <= limite).length;
  const rdosMes = rdos.filter((r) => r.data >= mesInicio).length;

  return {
    stats: { obrasAtivas: obras.length, custoTotal: custosAll.total, custoMes: custosMes.total, rdosMes, prazosProximos },
    obras,
    custosPorCategoria: Object.entries(custosAll.porCategoria).map(([categoria, valor]) => ({ categoria, valor })),
    custoTotal: custosAll.total,
    rdos: rdos.slice(0, 8).map((r) => ({ id: r.id, data: r.data, obra: r.obra, clima: r.clima, efetivo: somaEfetivo(r.efetivo), atividades: r.atividades })),
    documentosProximos: docs.filter((d) => d.vencimento).slice(0, 8).map((d) => ({ tipo: d.tipo, descricao: d.descricao, obra: d.obra, vencimento: d.vencimento })),
    contadores: { fotos: fotos.length, materiais: materiais.length, pendencias: 0 },
  };
}
