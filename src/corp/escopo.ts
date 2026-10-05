import type { LeituraEscopo } from "../memory/context.js";
import {
  empresaComoAdmin,
  listarObrasEmpresa,
  membershipAtiva,
  obrasAtribuidas,
  wasDosMembros,
} from "../memory/empresa.js";
import { listObrasStruct } from "../memory/obras.js";

/**
 * Escopo efetivo de LEITURA na versão corporativa (Fase 3). O compartilhamento é
 * POR OBRA: lê os lançamentos de QUALQUER membro da empresa (`recorders`),
 * restrito às obras acessíveis (`obras`, por NOME).
 *  - ENGENHEIRO (membro ativo não-admin): obras = as atribuídas pelo admin.
 *  - ADMIN: obras = todas as da empresa + as pessoais dele (vê o que a equipe
 *    lançou + os próprios dados). Usado SÓ no painel.
 * Usuário pessoal (sem empresa) = null (fluxo pessoal, sem regressão).
 */
export interface EscopoPainel {
  empresaId: number;
  empresaNome: string;
  papel: "admin" | "engenheiro";
  obras: string[];
  leitura: LeituraEscopo;
}

/** Escopo do ENGENHEIRO (null se for admin ou não-membro). Serve painel E agente. */
export async function resolverEscopoEngenheiro(wa: string): Promise<EscopoPainel | null> {
  const m = await membershipAtiva(wa);
  if (!m || m.membro.papel === "admin") return null;
  const [obras, recorders] = await Promise.all([
    obrasAtribuidas(m.empresa.id, wa),
    wasDosMembros(m.empresa.id),
  ]);
  return { empresaId: m.empresa.id, empresaNome: m.empresa.nome, papel: "engenheiro", obras, leitura: { recorders, obras } };
}

/** Escopo do ADMIN (null se não administra empresa). SÓ para o painel. */
export async function resolverEscopoAdmin(wa: string): Promise<EscopoPainel | null> {
  const empresa = await empresaComoAdmin(wa);
  if (!empresa) return null;
  const [obrasEmpresa, pessoais, recorders] = await Promise.all([
    listarObrasEmpresa(empresa.id),
    listObrasStruct(wa),
    wasDosMembros(empresa.id),
  ]);
  const obras = [...new Set([...obrasEmpresa.map((o) => o.nome), ...pessoais.map((o) => o.nome)])];
  return { empresaId: empresa.id, empresaNome: empresa.nome, papel: "admin", obras, leitura: { recorders, obras } };
}

/** Escopo do PAINEL: engenheiro ou admin (o que se aplicar); null = pessoal. */
export async function resolverEscopoPainel(wa: string): Promise<EscopoPainel | null> {
  return (await resolverEscopoEngenheiro(wa)) ?? (await resolverEscopoAdmin(wa));
}
