import type { LeituraEscopo } from "../memory/context.js";
import {
  membershipAtiva,
  obrasAtribuidas,
  wasDosMembros,
} from "../memory/empresa.js";

/**
 * Escopo efetivo do usuário para LEITURA no painel (Fase 3). Hoje aplica o
 * compartilhamento POR OBRA apenas para o ENGENHEIRO (membro ativo não-admin):
 * ele lê os lançamentos de QUALQUER membro da empresa, restrito às obras que o
 * admin atribuiu a ele. Admin e usuário pessoal seguem no fluxo pessoal
 * (escopo = null) — sem regressão. A agregação do admin virá numa etapa seguinte.
 */
export interface EscopoPainel {
  empresaId: number;
  empresaNome: string;
  obras: string[]; // nomes das obras acessíveis
  leitura: LeituraEscopo; // { recorders, obras } para as consultas
}

/** Resolve o escopo de empresa do engenheiro, ou null (pessoal/admin). */
export async function resolverEscopoPainel(wa: string): Promise<EscopoPainel | null> {
  const m = await membershipAtiva(wa);
  if (!m) return null; // não é membro ativo de nenhuma empresa
  if (m.membro.papel === "admin") return null; // admin usa o fluxo pessoal (por ora)

  const [obras, recorders] = await Promise.all([
    obrasAtribuidas(m.empresa.id, wa),
    wasDosMembros(m.empresa.id),
  ]);
  return {
    empresaId: m.empresa.id,
    empresaNome: m.empresa.nome,
    obras,
    leitura: { recorders, obras },
  };
}
