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
