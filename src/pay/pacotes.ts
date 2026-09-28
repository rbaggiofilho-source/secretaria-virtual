import { getEnv } from "../config/env.js";
import type { UsuarioRow } from "../memory/context.js";
import { getSupabase } from "../memory/supabase.js";
import { incrementarUso, mesAtual } from "../memory/uso.js";
import { temRecurso, type Direito } from "./cota.js";
import { consultarPagamento, criarCheckout, mpConfigured } from "./mercadopago.js";
import { getPacote, type Pacote } from "./planos.js";
import { sendTextMessage } from "../whatsapp/client.js";

/**
 * PACOTES EXTRAS de uso (mensagens/fotos/áudio) para quem bateu o limite do
 * plano e não quer subir de plano. Pagamento único (Checkout Pro do Mercado
 * Pago). O crédito vale até o fim do mês da compra (entra em
 * secretaria_uso.extra_* do mês).
 *
 * Idempotência: cada crédito vira uma linha em secretaria_pacotes_compras com
 * mp_payment_id ÚNICO — o MP reenvia notificações, e sem isso o mesmo pagamento
 * creditaria duas vezes.
 */

const BACK_URL = "https://userosana.com.br/?pacote=ok";

export type ResultadoCompra =
  | { ok: true; link: string; pacote: Pacote }
  | { ok: false; motivo: "pacote_invalido" | "fora_do_plano" | "pagamento_indisponivel"; pacote?: Pacote };

/** Gera o link de pagamento de um pacote para o usuário. */
export async function iniciarCompraPacote(
  usuario: UsuarioRow,
  direito: Direito,
  pacoteId: string,
): Promise<ResultadoCompra> {
  const pacote = getPacote(pacoteId);
  if (!pacote) return { ok: false, motivo: "pacote_invalido" };
  if (pacote.exige && !temRecurso(direito, pacote.exige)) {
    return { ok: false, motivo: "fora_do_plano", pacote };
  }
  if (!mpConfigured()) return { ok: false, motivo: "pagamento_indisponivel", pacote };

  const mes = mesAtual();
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/+$/, "");
  const checkout = await criarCheckout({
    itemId: pacote.id,
    titulo: `Rosana — ${pacote.nome}`,
    valor: pacote.valor,
    // pct|<wa>|<pacote>|<mês> — o webhook credita a partir disto.
    externalReference: `pct|${usuario.user_wa}|${pacote.id}|${mes}`,
    notificationUrl: `${base}/api/app/pay?acao=webhook`,
    backUrl: BACK_URL,
  });
  return { ok: true, link: checkout.initPoint, pacote };
}

/**
 * Credita um pacote no mês (idempotente por mpPaymentId). Usado pelo webhook
 * do MP e pelo admin (concessão manual/cortesia, sem mpPaymentId).
 * Devolve false se esse pagamento já tinha sido creditado.
 */
export async function creditarPacote(input: {
  userWa: string;
  pacoteId: string;
  mes?: string;
  origem: "mercadopago" | "admin";
  mpPaymentId?: string | null;
  valor?: number | null;
}): Promise<boolean> {
  const pacote = getPacote(input.pacoteId);
  if (!pacote) throw new Error(`Pacote desconhecido: ${input.pacoteId}`);
  const mes = input.mes ?? mesAtual();

  const { error } = await getSupabase().from("secretaria_pacotes_compras").insert({
    user_wa: input.userWa,
    mes,
    pacote_id: pacote.id,
    valor: input.valor ?? (input.origem === "admin" ? 0 : pacote.valor),
    origem: input.origem,
    mp_payment_id: input.mpPaymentId ?? null,
  });
  if (error) {
    if (error.code === "23505") return false; // já creditado (notificação repetida)
    throw new Error(`Falha ao registrar pacote: ${error.message}`);
  }

  await incrementarUso(
    input.userWa,
    {
      extraMensagens: pacote.mensagens ?? 0,
      extraFotos: pacote.fotos ?? 0,
      extraAudioSeg: (pacote.audioMin ?? 0) * 60,
    },
    mes,
  );
  return true;
}

/**
 * Trata a notificação de PAGAMENTO do MP. Só credita se o pagamento estiver
 * aprovado, for de um pacote (external_reference pct|...) e o valor bater.
 */
export async function processarPagamentoPacote(paymentId: string): Promise<"creditado" | "ignorado" | "repetido"> {
  const pg = await consultarPagamento(paymentId);
  if (!pg || pg.status !== "approved" || !pg.externalReference?.startsWith("pct|")) return "ignorado";
  const [, userWa, pacoteId, mes] = pg.externalReference.split("|");
  const pacote = getPacote(pacoteId);
  if (!userWa || !pacote || !mes) return "ignorado";
  if (pg.valor + 0.01 < pacote.valor) {
    console.warn(`[pacotes] valor pago ${pg.valor} < preço ${pacote.valor} (pagamento ${pg.id})`);
    return "ignorado";
  }
  const novo = await creditarPacote({
    userWa,
    pacoteId: pacote.id,
    mes,
    origem: "mercadopago",
    mpPaymentId: pg.id,
    valor: pg.valor,
  });
  if (novo) {
    // Avisa no WhatsApp (quem compra acabou de falar com a Rosana, então a
    // janela de 24h está aberta). Não crítico.
    try {
      await sendTextMessage(userWa, `Pagamento confirmado! ✅ ${pacote.nome} liberado — pode continuar.`);
    } catch (err) {
      console.error("[pacotes] aviso de crédito:", err instanceof Error ? err.message : err);
    }
  }
  return novo ? "creditado" : "repetido";
}
