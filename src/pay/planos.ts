/**
 * Planos da Rosana (assinatura mensal): o que cada um LIBERA e quanto pode USAR.
 * Fonte da verdade dos RECURSOS (quais funções) e dos limites/preços PADRÃO. O
 * preço cobrado e os limites podem ser ajustados pelo admin em
 * secretaria_planos (ver planos-db.ts); aqui fica o fallback que nunca falha.
 *
 * Por que há LIMITE de uso: o custo da IA é por mensagem (~US$ 0,015–0,02 com
 * cache de prompt). Sem teto, um usuário pesado no plano de R$ 49 dá prejuízo.
 * Os limites abaixo mantêm o custo de IA ≤ ~50% do preço líquido MESMO com a
 * cota inteira consumida. Quem bater o limite compra um PACOTE extra (ou sobe
 * de plano).
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
    valor: 89,
    recursos: RECURSOS_OBRA,
    limites: { mensagens: 400, fotos: 50, audioMin: 180, obras: 5 },
  },
  construtora: {
    id: "construtora",
    nome: "Rosana Construtora",
    valor: 159,
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
 * Preços com margem ≥ 2× o custo de pior caso (IA ~R$ 0,11/mensagem, Groq
 * ~R$ 0,62/hora de áudio) já descontando taxa do Mercado Pago + imposto.
 */
export const PACOTES: Record<PacoteId, Pacote> = {
  mensagens_100: { id: "mensagens_100", nome: "+100 mensagens", valor: 19.9, mensagens: 100 },
  mensagens_300: { id: "mensagens_300", nome: "+300 mensagens", valor: 49.9, mensagens: 300 },
  fotos_50: { id: "fotos_50", nome: "+50 fotos/notas fiscais", valor: 9.9, fotos: 50, exige: "fotos" },
  audio_120: { id: "audio_120", nome: "+2 horas de áudio", valor: 9.9, audioMin: 120 },
};

export function getPacote(id: string | null | undefined): Pacote | null {
  return PACOTES[(id ?? "") as PacoteId] ?? null;
}
