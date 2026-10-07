import process from "node:process";

/**
 * Emissor de NFS-e: NFE.io (REST v1). Campos e cabeçalhos conforme o SDK oficial
 * `nfe-io` v6: POST /v1/companies/{companyId}/serviceinvoices com o header
 * `X-NFE-APIKEY`; a emissão é ASSÍNCRONA (202 + Location) e o andamento vem em
 * `flowStatus` (Issued / IssueFailed / Waiting...). PUT .../sendemail manda a
 * nota para o e-mail do tomador.
 *
 * Opcional como o Mercado Pago: lê direto de process.env. Sem NFSE_API_KEY +
 * NFSE_COMPANY_ID + NFSE_CITY_SERVICE_CODE fica INERTE — as notas ficam na fila
 * (`aguardando_emissor`) e saem sozinhas quando as variáveis entrarem.
 */

const API = "https://api.nfe.io/v1";

interface NfseConfig {
  apiKey: string;
  companyId: string;
  cityServiceCode: string;
  federalServiceCode: string | null;
  cnaeCode: string | null;
}

function env(nome: string): string | null {
  const v = (process.env[nome] ?? "").trim();
  return v || null;
}

export function nfseConfig(): NfseConfig | null {
  const apiKey = env("NFSE_API_KEY");
  const companyId = env("NFSE_COMPANY_ID");
  const cityServiceCode = env("NFSE_CITY_SERVICE_CODE");
  if (!apiKey || !companyId || !cityServiceCode) return null;
  return {
    apiKey,
    companyId,
    cityServiceCode,
    federalServiceCode: env("NFSE_FEDERAL_SERVICE_CODE"),
    cnaeCode: env("NFSE_CNAE_CODE"),
  };
}

export function nfseConfigured(): boolean {
  return nfseConfig() !== null;
}

/** Manda a nota por e-mail ao tomador? (desligue se o painel da NFE.io já envia). */
export function nfseEnviarEmail(): boolean {
  return (env("NFSE_ENVIAR_EMAIL") ?? "true").toLowerCase() !== "false";
}

export interface Tomador {
  nome: string;
  documento: string; // CPF (11) ou CNPJ (14), só dígitos
  email: string;
}

export interface EmitirInput {
  tomador: Tomador;
  descricao: string;
  valor: number; // BRL
  /** Nosso id único (a NFE.io guarda e permite buscar por ele). */
  externalId: string;
}

export type FlowStatus =
  | "Issued"
  | "IssueFailed"
  | "Cancelled"
  | "CancelFailed"
  | string;

function headers(cfg: NfseConfig): Record<string, string> {
  return {
    "X-NFE-APIKEY": cfg.apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Pede a emissão. Devolve o id da nota na NFE.io (a emissão segue assíncrona). */
export async function emitirNfse(input: EmitirInput): Promise<{ id: string; flowStatus: FlowStatus | null }> {
  const cfg = nfseConfig();
  if (!cfg) throw new Error("Emissor de NFS-e não configurado");
  const doc = input.tomador.documento.replace(/\D/g, "");
  const body: Record<string, unknown> = {
    borrower: {
      type: doc.length === 14 ? "LegalEntity" : "NaturalPerson",
      name: input.tomador.nome,
      federalTaxNumber: Number(doc),
      email: input.tomador.email,
      address: { country: "BRA" },
    },
    externalId: input.externalId,
    cityServiceCode: cfg.cityServiceCode,
    description: input.descricao,
    servicesAmount: Number(input.valor.toFixed(2)),
  };
  if (cfg.federalServiceCode) body.federalServiceCode = cfg.federalServiceCode;
  if (cfg.cnaeCode) body.cnaeCode = cfg.cnaeCode;

  const res = await fetch(`${API}/companies/${encodeURIComponent(cfg.companyId)}/serviceinvoices`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(body),
  });
  if (res.status === 202) {
    const location = res.headers.get("location") ?? "";
    const id = /serviceinvoices\/([a-z0-9-]+)/i.exec(location)?.[1];
    if (!id) throw new Error("NFE.io respondeu 202 sem Location com o id da nota");
    return { id, flowStatus: null };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`NFE.io emissão falhou (${res.status}): ${JSON.stringify(data).slice(0, 400)}`);
  }
  const id = String(data.id ?? "");
  if (!id) throw new Error("NFE.io não devolveu o id da nota");
  return { id, flowStatus: (data.flowStatus as string | undefined) ?? null };
}

export interface NotaNfse {
  id: string;
  flowStatus: FlowStatus | null;
  flowMessage: string | null;
  numero: string | null;
}

/** Consulta o andamento de uma nota. */
export async function consultarNfse(id: string): Promise<NotaNfse | null> {
  const cfg = nfseConfig();
  if (!cfg) return null;
  const res = await fetch(
    `${API}/companies/${encodeURIComponent(cfg.companyId)}/serviceinvoices/${encodeURIComponent(id)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    id: String(d.id ?? id),
    flowStatus: (d.flowStatus as string | undefined) ?? null,
    flowMessage: (d.flowMessage as string | undefined) ?? null,
    numero: d.number != null ? String(d.number) : null,
  };
}

/** Envia a nota emitida para o e-mail do tomador. */
export async function enviarEmailNfse(id: string): Promise<boolean> {
  const cfg = nfseConfig();
  if (!cfg) return false;
  const res = await fetch(
    `${API}/companies/${encodeURIComponent(cfg.companyId)}/serviceinvoices/${encodeURIComponent(id)}/sendemail`,
    { method: "PUT", headers: headers(cfg) },
  );
  return res.ok;
}
