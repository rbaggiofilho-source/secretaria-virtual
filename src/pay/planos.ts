/**
 * Planos da Rosana (assinatura mensal): o que cada um LIBERA e quanto pode USAR.
 * Fonte da verdade dos RECURSOS (quais funções) e dos limites/preços PADRÃO. O
 * preço cobrado e os limites podem ser ajustados pelo admin em
 * secretaria_planos (ver planos-db.ts); aqui fica o fallback que nunca falha.
 *
 * Por que há LIMITE de uso: o custo da IA é por mensagem (~US$ 0,015–0,02 com
 * cache de prompt). Sem teto, um usuário pesado no plano de R$ 49 dá prejuízo.
 * REGRA DE PREÇO: margem ≥ 48% no PIOR caso (cota inteira consumida), já
 * descontando ~11% de taxas (Mercado Pago + imposto) ⇒ preço ≥ custo máx / 0,41.
 * Custo máx. (US$ 0,02/msg + US$ 0,005/foto + Groq, câmbio R$ 5,60): Agenda
 * ~R$ 20 → R$ 49; Obra ~R$ 48 → R$ 119; Construtora ~R$ 93 → R$ 229.
 * Quem bater o limite compra um PACOTE extra (ou sobe de plano).
 */

export type PlanoId = "agenda" | "obra" | "construtora";

/** Grupos de funções liberadas por plano (as tools do agente mapeiam pra cá). */
export type Recurso =
  | "base" // agenda, lembretes, memória, pendências, GPS, cadastro de obras
  | "custos" // lançar custo + relatório
  | "revisar" // revisar a conversa dos últimos dias
  | "rdo" // Diário de Obra + PDF
  | "fotos" // foto de obra / nota fiscal (visão) + arquivo
  | "documentos" // alvará, ART/RRT, ASO com lembrete
  | "preco_referencia" // orçamento pela base de mercado
  | "materiais" // compras, cotações, fornecedores
  | "preco_proprio"; // orçamento com os preços REAIS do próprio usuário

export interface Limites {
  /** Mensagens (texto/áudio/foto) processadas pela IA por mês. */
  mensagens: number;
  /** Fotos/notas fiscais por mês (0 = recurso fora do plano). */
  fotos: number;
  /** Minutos de áudio transcritos por mês. */
  audioMin: number;
  /** Obras distintas; null = ilimitado. */
  obras: number | null;
}

export interface Plano {
  id: PlanoId;
  nome: string;
  valor: number; // mensal, em BRL
  recursos: Recurso[];
  limites: Limites;
}

const RECURSOS_AGENDA: Recurso[] = ["base", "custos"];
const RECURSOS_OBRA: Recurso[] = [
  ...RECURSOS_AGENDA,
  "revisar",
  "rdo",
  "fotos",
  "documentos",
  "preco_referencia",
];
const RECURSOS_CONSTRUTORA: Recurso[] = [...RECURSOS_OBRA, "materiais", "preco_proprio"];

export const PLANOS: Record<PlanoId, Plano> = {
  agenda: {
    id: "agenda",
    nome: "Rosana Agenda",
    valor: 49,
    recursos: RECURSOS_AGENDA,
    limites: { mensagens: 250, fotos: 0, audioMin: 30, obras: 1 },
  },
  obra: {
    id: "obra",
    nome: "Rosana Obra",
    valor: 119,
    recursos: RECURSOS_OBRA,
    limites: { mensagens: 400, fotos: 50, audioMin: 180, obras: 5 },
  },
  construtora: {
    id: "construtora",
    nome: "Rosana Construtora",
    valor: 229,
    recursos: RECURSOS_CONSTRUTORA,
    limites: { mensagens: 700, fotos: 300, audioMin: 600, obras: null },
  },
};

export const PLANO_IDS: PlanoId[] = ["agenda", "obra", "construtora"];

/**
 * Ids antigos (antes dos 3 planos) → plano equivalente. Quem já tinha
 * 'essencial'/'profissional' gravado continua funcionando.
 */
const LEGADO: Record<string, PlanoId> = { essencial: "obra", profissional: "construtora" };

/** Normaliza qualquer id (novo, legado ou vazio) para um PlanoId válido. */
export function normalizarPlanoId(id: string | null | undefined): PlanoId | null {
  const s = (id ?? "").trim().toLowerCase();
  if (!s) return null;
  if ((PLANO_IDS as string[]).includes(s)) return s as PlanoId;
  return LEGADO[s] ?? null;
}

/** Resolve o plano por id, com fallback no plano do meio (Obra). */
export function resolvePlano(id: string | null | undefined): Plano {
  return PLANOS[normalizarPlanoId(id) ?? "obra"];
}

// ---------------------------------------------------------------------------
// Pacotes extras (compra avulsa, valem até o fim do mês em que foram comprados)
// ---------------------------------------------------------------------------

export type PacoteId = "mensagens_100" | "mensagens_300" | "fotos_50" | "audio_120";

export interface Pacote {
  id: PacoteId;
  nome: string;
  valor: number; // BRL, pagamento único
  mensagens?: number;
  fotos?: number;
  audioMin?: number;
  /** Recurso que o plano precisa ter para o pacote fazer sentido. */
  exige?: Recurso;
}

/**
 * Mesma regra dos planos: margem ≥ 48% no pior caso (IA ~R$ 0,11/mensagem,
 * Groq ~R$ 0,62/hora de áudio), já descontando ~11% de taxas.
 */
export const PACOTES: Record<PacoteId, Pacote> = {
  mensagens_100: { id: "mensagens_100", nome: "+100 mensagens", valor: 27.9, mensagens: 100 },
  mensagens_300: { id: "mensagens_300", nome: "+300 mensagens", valor: 82.9, mensagens: 300 },
  fotos_50: { id: "fotos_50", nome: "+50 fotos e notas fiscais", valor: 9.9, fotos: 50, exige: "fotos" },
  audio_120: { id: "audio_120", nome: "+2 horas de áudio", valor: 9.9, audioMin: 120 },
};

export function getPacote(id: string | null | undefined): Pacote | null {
  return PACOTES[(id ?? "") as PacoteId] ?? null;
}

// ---------------------------------------------------------------------------
// Planos CORPORATIVOS (versão empresa) — assinatura por TETO de membros.
// A empresa agrupa vários WhatsApps; o preço escala com o nº de assentos.
// PREÇOS PLACEHOLDER (ajustar com o dono): ~R$ 165/assento, com desconto por
// volume. Editáveis aqui (como `precos-referencia`, é dado versionado no git).
// Regra de margem dos planos pessoais continua valendo por assento.
// ---------------------------------------------------------------------------

export type PlanoEmpresaId = "equipe_3" | "equipe_5" | "equipe_10";

export interface PlanoEmpresa {
  id: PlanoEmpresaId;
  nome: string;
  tetoMembros: number; // inclui o admin
  valor: number; // mensal, BRL
}

export const PLANOS_EMPRESA: Record<PlanoEmpresaId, PlanoEmpresa> = {
  equipe_3: { id: "equipe_3", nome: "Rosana Equipe (até 3)", tetoMembros: 3, valor: 497 },
  equipe_5: { id: "equipe_5", nome: "Rosana Equipe (até 5)", tetoMembros: 5, valor: 797 },
  equipe_10: { id: "equipe_10", nome: "Rosana Equipe (até 10)", tetoMembros: 10, valor: 1490 },
};

export const PLANOS_EMPRESA_IDS: PlanoEmpresaId[] = ["equipe_3", "equipe_5", "equipe_10"];

export function getPlanoEmpresa(id: string | null | undefined): PlanoEmpresa | null {
  return PLANOS_EMPRESA[(id ?? "") as PlanoEmpresaId] ?? null;
}
