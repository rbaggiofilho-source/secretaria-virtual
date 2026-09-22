import { getSupabase } from "./supabase.js";
import { waIdVariants } from "./context.js";

/**
 * Camada de dados das ASSINATURAS/onboarding pago. Grava o lead do cadastro do
 * site em secretaria_usuarios como PENDENTE (ativo=false) até o pagamento
 * confirmar, e depois liga/desliga o acesso conforme o status da assinatura no
 * Mercado Pago. Uma linha por variante de wa_id (nono dígito incerto). O DONO é
 * blindado (nunca é rebaixado por esse fluxo).
 */

/** Normaliza um número BR digitado (com/sem 55) para a forma com 55. */
export function normalizarWaBR(input: string): string {
  let d = (input || "").replace(/\D/g, "");
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) d = "55" + d;
  return d;
}

export interface LeadPagamentoInput {
  nomeCompleto: string;
  cpf?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  email: string;
  whatsappInput: string; // já normalizado (com 55)
  plano: string;
}

/**
 * Cria/atualiza o lead do cadastro como PENDENTE de pagamento (ativo=false).
 * Retorna as variantes gravadas e o wa canônico (menor variante), usado como
 * external_reference no Mercado Pago. Não mexe em linhas de dono.
 */
export async function registrarLeadPagamento(
  dados: LeadPagamentoInput,
): Promise<{ waIds: string[]; canonical: string }> {
  const supabase = getSupabase();
  const waIds = waIdVariants(dados.whatsappInput);
  if (waIds.length === 0) throw new Error("Número de WhatsApp inválido.");
  const canonical = [...waIds].sort()[0] ?? waIds[0]!;
  const nome = dados.nomeCompleto.trim().split(/\s+/)[0] || dados.nomeCompleto.trim();

  // Blinda o dono: não sobrescreve/rebaixa linhas com dono=true.
  const { data: existentes } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa,dono")
    .in("user_wa", waIds);
  const donos = new Set((existentes ?? []).filter((r) => (r as { dono?: boolean }).dono).map((r) => (r as { user_wa: string }).user_wa));
  const alvo = waIds.filter((w) => !donos.has(w));
  if (alvo.length === 0) return { waIds, canonical };

  const rows = alvo.map((user_wa) => ({
    user_wa,
    nome,
    nome_completo: dados.nomeCompleto.trim(),
    cpf: dados.cpf?.trim() || null,
    endereco: dados.endereco?.trim() || null,
    profissao: dados.profissao?.trim() || null,
    email: dados.email.trim() || null,
    plano: dados.plano,
    status: "pendente_pagamento",
    assinatura_status: "pendente",
    ativo: false,
    dono: false,
  }));

  const { error } = await supabase
    .from("secretaria_usuarios")
    .upsert(rows, { onConflict: "user_wa" });
  if (error) throw new Error(`Falha ao gravar lead: ${error.message}`);
  return { waIds, canonical };
}

/**
 * Atualiza o estado da assinatura de um usuário (todas as variantes do wa),
 * ligando/desligando o acesso. Não mexe em linhas de dono.
 */
export async function atualizarAssinatura(
  externalRefWa: string,
  patch: { status: string; preapprovalId?: string | null; ativo: boolean },
): Promise<void> {
  const supabase = getSupabase();
  const waIds = waIdVariants(externalRefWa);
  const upd: Record<string, unknown> = {
    assinatura_status: patch.status,
    ativo: patch.ativo,
    assinatura_em: new Date().toISOString(),
    status: patch.ativo ? "ativo" : "pendente_pagamento",
  };
  if (patch.preapprovalId !== undefined) upd.mp_preapproval_id = patch.preapprovalId;

  const { error } = await supabase
    .from("secretaria_usuarios")
    .update(upd)
    .in("user_wa", waIds)
    .eq("dono", false);
  if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
}
