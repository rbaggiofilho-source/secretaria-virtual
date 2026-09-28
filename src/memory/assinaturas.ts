import { getSupabase } from "./supabase.js";
import { canonicalWa, waIdVariants } from "./context.js";

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
 * Cria o lead do cadastro como PENDENTE de pagamento (ativo=false).
 *
 * NUNCA sobrescreve um usuário que já existe (em qualquer variante do número):
 * este endpoint é público, e antes o upsert com ativo=false permitia a qualquer
 * pessoa CORTAR o acesso de um usuário existente só enviando o número dele no
 * formulário. Retorna `existente` para o chamador decidir:
 *   - "ativo": já tem acesso → não cria checkout (vai para o painel);
 *   - "pendente": lead anterior sem pagamento → pode seguir para o checkout;
 *   - null: lead novo gravado agora.
 * `canonical` = wa canônico (sem o nono dígito), usado como external_reference.
 */
export async function registrarLeadPagamento(
  dados: LeadPagamentoInput,
): Promise<{ waIds: string[]; canonical: string; existente: "ativo" | "pendente" | null }> {
  const supabase = getSupabase();
  const waIds = waIdVariants(dados.whatsappInput);
  if (waIds.length === 0) throw new Error("Número de WhatsApp inválido.");
  const canonical = canonicalWa(dados.whatsappInput);
  const nome = dados.nomeCompleto.trim().split(/\s+/)[0] || dados.nomeCompleto.trim();

  const { data: existentes, error: e1 } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, dono, ativo")
    .in("user_wa", waIds);
  if (e1) throw new Error(`Falha ao verificar cadastro: ${e1.message}`);
  if (existentes && existentes.length > 0) {
    const algumAtivo = existentes.some(
      (r) => (r as { ativo?: boolean; dono?: boolean }).ativo || (r as { dono?: boolean }).dono,
    );
    return { waIds, canonical, existente: algumAtivo ? "ativo" : "pendente" };
  }

  const rows = waIds.map((user_wa) => ({
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

  // ignoreDuplicates: se outra requisição criou no meio-tempo, não sobrescreve.
  const { error } = await supabase
    .from("secretaria_usuarios")
    .upsert(rows, { onConflict: "user_wa", ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao gravar lead: ${error.message}`);
  return { waIds, canonical, existente: null };
}

/**
 * Vincula a assinatura recém-criada no Mercado Pago ao lead PENDENTE. Só toca
 * linhas SEM acesso (ativo=false) e que não são do dono — um usuário ativo
 * nunca recebe o vínculo de uma assinatura criada por terceiros.
 */
export async function vincularAssinaturaPendente(
  canonical: string,
  preapprovalId: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({
      mp_preapproval_id: preapprovalId,
      assinatura_status: "pendente",
      assinatura_em: new Date().toISOString(),
    })
    .in("user_wa", waIdVariants(canonical))
    .eq("ativo", false)
    .eq("dono", false);
  if (error) throw new Error(`Falha ao vincular assinatura: ${error.message}`);
}

/**
 * Aplica o status de uma assinatura vindo do Mercado Pago (webhook).
 *   - authorized → LIBERA o acesso das variantes do número (external_reference)
 *     e registra o vínculo. Liberar nunca prejudica ninguém (alguém pagou).
 *   - qualquer outro status → só DESLIGA as linhas VINCULADAS a esta mesma
 *     assinatura (mp_preapproval_id = id). Antes, qualquer status "pendente"
 *     desligava todas as variantes do número: bastava iniciar uma assinatura
 *     com o número de outra pessoa para cortar o acesso dela.
 * Nunca mexe em linhas do dono.
 */
export async function atualizarAssinatura(
  externalRefWa: string,
  patch: { status: string; preapprovalId: string; ativo: boolean },
): Promise<void> {
  const supabase = getSupabase();
  const agora = new Date().toISOString();
  if (patch.ativo) {
    const { error } = await supabase
      .from("secretaria_usuarios")
      .update({
        assinatura_status: patch.status,
        ativo: true,
        assinatura_em: agora,
        status: "ativo",
        mp_preapproval_id: patch.preapprovalId,
      })
      .in("user_wa", waIdVariants(externalRefWa))
      .eq("dono", false);
    if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
    return;
  }
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({
      assinatura_status: patch.status,
      ativo: false,
      assinatura_em: agora,
      status: "pendente_pagamento",
    })
    .in("user_wa", waIdVariants(externalRefWa))
    .eq("mp_preapproval_id", patch.preapprovalId)
    .eq("dono", false);
  if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
}
