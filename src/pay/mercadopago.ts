import process from "node:process";

/**
 * Integração com o Mercado Pago — ASSINATURAS (preapproval), cobrança recorrente
 * mensal no cartão. Lê o token direto de process.env (opcional): sem
 * MERCADOPAGO_ACCESS_TOKEN a integração fica INERTE (o cadastro grava o lead e o
 * site mostra "em breve"). Assim dá pra subir o fluxo pronto e só ligar quando
 * as credenciais entrarem na Vercel.
 *
 * Fluxo: criarAssinatura() cria uma preapproval "pending" e devolve o init_point
 * (URL do checkout do MP); o usuário autoriza a recorrência lá. O MP então chama
 * a notification_url (nosso webhook), que consulta a preapproval e ativa o
 * usuário quando o status vira "authorized".
 */

const MP_API = "https://api.mercadopago.com";

export function mpToken(): string | null {
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  return t || null;
}

export function mpConfigured(): boolean {
  return !!mpToken();
}

export interface CriarAssinaturaInput {
  email: string;
  reason: string; // nome do plano (aparece pro cliente)
  valor: number; // mensal, BRL
  externalReference: string; // wa canônico do usuário (correlaciona o webhook)
  backUrl: string; // pra onde o MP devolve o usuário após autorizar
  notificationUrl: string; // nosso webhook
}

export interface AssinaturaCriada {
  id: string;
  initPoint: string;
}

/** Cria uma assinatura (preapproval) e devolve o link do checkout. */
export async function criarAssinatura(input: CriarAssinaturaInput): Promise<AssinaturaCriada> {
  const token = mpToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN ausente");

  const body = {
    reason: input.reason,
    external_reference: input.externalReference,
    payer_email: input.email,
    back_url: input.backUrl,
    notification_url: input.notificationUrl,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: Number(input.valor.toFixed(2)),
      currency_id: "BRL",
    },
  };

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`MP preapproval falhou (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const id = String(data.id ?? "");
  const initPoint = String(data.init_point ?? data.sandbox_init_point ?? "");
  if (!id || !initPoint) throw new Error("MP não devolveu id/init_point");
  return { id, initPoint };
}

// ---------------------------------------------------------------------------
// Pagamento ÚNICO (Checkout Pro) — pacotes extras de uso
// ---------------------------------------------------------------------------

export interface CriarCheckoutInput {
  itemId: string;
  titulo: string;
  valor: number; // BRL
  externalReference: string;
  notificationUrl: string;
  backUrl: string;
}

/** Cria uma preferência de pagamento único e devolve o link do checkout. */
export async function criarCheckout(input: CriarCheckoutInput): Promise<{ id: string; initPoint: string }> {
  const token = mpToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN ausente");
  const body = {
    items: [
      {
        id: input.itemId,
        title: input.titulo,
        quantity: 1,
        unit_price: Number(input.valor.toFixed(2)),
        currency_id: "BRL",
      },
    ],
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    back_urls: { success: input.backUrl, failure: input.backUrl, pending: input.backUrl },
    auto_return: "approved",
  };
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`MP preference falhou (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const id = String(data.id ?? "");
  const initPoint = String(data.init_point ?? data.sandbox_init_point ?? "");
  if (!id || !initPoint) throw new Error("MP não devolveu id/init_point");
  return { id, initPoint };
}

export interface PagamentoStatus {
  id: string;
  status: string; // approved | pending | rejected | refunded | ...
  externalReference: string | null;
  valor: number;
}

/** Consulta um pagamento (usado pelo webhook dos pacotes). */
export async function consultarPagamento(id: string): Promise<PagamentoStatus | null> {
  const token = mpToken();
  if (!token) return null;
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    id: String(d.id ?? id),
    status: String(d.status ?? ""),
    externalReference: (d.external_reference as string | null) ?? null,
    valor: Number(d.transaction_amount ?? 0),
  };
}

export interface CobrancaAssinatura {
  id: string;
  preapprovalId: string | null;
  externalReference: string | null;
  valor: number;
  reason: string | null;
  /** Pagamento gerado pela cobrança (só existe depois de cobrar). */
  pagamentoId: string | null;
  pagamentoStatus: string | null; // approved | rejected | pending ...
}

/**
 * Consulta uma cobrança RECORRENTE da assinatura (GET /authorized_payments/{id}),
 * avisada pelo MP no tópico `subscription_authorized_payment`. Campos conforme o
 * SDK oficial (mercadopago v3, InvoiceResponse).
 */
export async function consultarCobrancaAssinatura(id: string): Promise<CobrancaAssinatura | null> {
  const token = mpToken();
  if (!token) return null;
  const res = await fetch(`${MP_API}/authorized_payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const pg = (d.payment ?? null) as { id?: unknown; status?: unknown } | null;
  return {
    id: String(d.id ?? id),
    preapprovalId: (d.preapproval_id as string | null) ?? null,
    externalReference: (d.external_reference as string | null) ?? null,
    valor: Number(d.transaction_amount ?? 0),
    reason: (d.reason as string | null) ?? null,
    pagamentoId: pg?.id != null ? String(pg.id) : null,
    pagamentoStatus: pg?.status != null ? String(pg.status) : null,
  };
}

export interface AssinaturaStatus {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  externalReference: string | null;
  payerEmail: string | null;
}

/** Consulta o estado atual de uma assinatura (usado pelo webhook). */
export async function consultarAssinatura(id: string): Promise<AssinaturaStatus | null> {
  const token = mpToken();
  if (!token) return null;
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    id: String(d.id ?? id),
    status: String(d.status ?? ""),
    externalReference: (d.external_reference as string | null) ?? null,
    payerEmail: (d.payer_email as string | null) ?? null,
  };
}
