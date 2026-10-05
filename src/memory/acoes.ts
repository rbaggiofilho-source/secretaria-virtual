import { getSupabase } from "./supabase.js";

/**
 * Log das AÇÕES PROATIVAS da Rosana (tabela secretaria_acoes): o que ela ENVIOU
 * sozinha pro usuário — lembretes e resumos diários — com status de entrega.
 * Alimenta a aba "O que a Rosana fez por você" (seção "Entregues"). Isolado por
 * user_wa. Os "Programados" (lembretes futuros) vêm de secretaria_eventos.
 */

export type TipoAcao = "lembrete" | "resumo";
export type StatusAcao = "entregue" | "falha";

export interface AcaoRow {
  id: number;
  user_wa: string;
  tipo: TipoAcao | string;
  titulo: string;
  detalhe: string | null;
  status: StatusAcao | string;
  ref: string | null;
  created_at: string;
}

export interface RegistrarAcaoInput {
  tipo: TipoAcao;
  titulo: string;
  detalhe?: string | null;
  status?: StatusAcao;
  ref?: string | null;
}

/**
 * Registra uma ação enviada pela Rosana. NUNCA deve derrubar o fluxo de envio:
 * em caso de erro, apenas loga e segue (o log é secundário à entrega em si).
 */
export async function registrarAcao(userWa: string, input: RegistrarAcaoInput): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("secretaria_acoes").insert({
      user_wa: userWa,
      tipo: input.tipo,
      titulo: input.titulo,
      detalhe: input.detalhe ?? null,
      status: input.status ?? "entregue",
      ref: input.ref ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(`[acoes] falha ao registrar: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Lista as ações recentes do usuário (mais novas primeiro) para o painel. */
export async function listarAcoes(userWa: string, limite = 50): Promise<AcaoRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_acoes")
    .select("*")
    .eq("user_wa", userWa)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao listar ações: ${error.message}`);
  return (data ?? []) as AcaoRow[];
}
