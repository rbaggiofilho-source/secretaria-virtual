import { getEnv } from "../../src/config/env.js";
import { json, preflight, readJson } from "../../src/auth/http.js";
import { resolvePlano } from "../../src/pay/planos.js";
import { mpConfigured, criarAssinatura, consultarAssinatura } from "../../src/pay/mercadopago.js";
import {
  registrarLeadPagamento,
  atualizarAssinatura,
  normalizarWaBR,
} from "../../src/memory/assinaturas.js";

/**
 * Pagamento/assinatura (Mercado Pago). Endpoint PÚBLICO (sem token): serve tanto
 * o cadastro+checkout do site (?acao=assinar) quanto o webhook do MP
 * (?acao=webhook). Fica num arquivo só pra respeitar o teto de 12 funções
 * serverless do plano Hobby (ver CLAUDE.md).
 *
 * Sem MERCADOPAGO_ACCESS_TOKEN na env, ?acao=assinar grava o lead como pendente
 * e devolve { aguardandoIntegracao: true } (o site mostra "em breve").
 */

const PAINEL_BACK_URL = "https://userosana.com.br/entrar?assinatura=ok";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const url = new URL(request.url);
    const acao = url.searchParams.get("acao") ?? "";
    try {
      if (acao === "assinar" && request.method === "POST") return await assinar(request);
      if (acao === "webhook") return await webhook(request, url);
      return json(request, { error: "acao_desconhecida" }, 400);
    } catch (err) {
      console.error(`[pay] ${acao}:`, err instanceof Error ? err.message : err);
      return json(request, { ok: false, error: "erro_interno" }, 500);
    }
  },
};

async function assinar(request: Request): Promise<Response> {
  const body = await readJson(request);
  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim();
  const whatsapp = String(body.whatsapp ?? body.telefone ?? "").trim();
  const cpf = String(body.cpf ?? "").trim();
  const endereco = String(body.endereco ?? "").trim();
  const profissao = String(body.profissao ?? "").trim();
  const plano = resolvePlano(String(body.plano ?? ""));

  if (!nome || nome.split(/\s+/).length < 2) return json(request, { ok: false, error: "nome_invalido" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(request, { ok: false, error: "email_invalido" }, 400);
  const waNorm = normalizarWaBR(whatsapp);
  if (waNorm.length < 12 || waNorm.length > 13 || !waNorm.startsWith("55")) {
    return json(request, { ok: false, error: "whatsapp_invalido" }, 400);
  }

  const { canonical } = await registrarLeadPagamento({
    nomeCompleto: nome,
    cpf,
    endereco,
    profissao,
    email,
    whatsappInput: waNorm,
    plano: plano.id,
  });

  // Sem credenciais do MP: guarda o lead e sinaliza "em breve".
  if (!mpConfigured()) {
    return json(request, { ok: true, aguardandoIntegracao: true });
  }

  const base = getEnv().PUBLIC_BASE_URL.replace(/\/+$/, "");
  const assinatura = await criarAssinatura({
    email,
    reason: plano.nome,
    valor: plano.valor,
    externalReference: canonical,
    backUrl: PAINEL_BACK_URL,
    notificationUrl: `${base}/api/app/pay?acao=webhook`,
  });
  await atualizarAssinatura(canonical, { status: "pendente", preapprovalId: assinatura.id, ativo: false });
  return json(request, { ok: true, init_point: assinatura.initPoint });
}

async function webhook(request: Request, url: URL): Promise<Response> {
  // O MP notifica por query (IPN legado) e/ou por corpo JSON (webhooks).
  let id = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  let topic = url.searchParams.get("type") || url.searchParams.get("topic") || "";
  if (request.method === "POST") {
    const body = (await readJson(request)) as { data?: { id?: unknown }; id?: unknown; type?: unknown; topic?: unknown };
    id = String(body?.data?.id ?? body?.id ?? id ?? "");
    topic = String(body?.type ?? body?.topic ?? topic ?? "");
  }

  // Só interessam eventos de assinatura (preapproval).
  if (!id) return json(request, { ok: true, ignored: true });
  if (topic && !/preapproval|subscription/i.test(topic)) return json(request, { ok: true, ignored: true });

  const info = await consultarAssinatura(id);
  if (!info || !info.externalReference) return json(request, { ok: true, semRef: true });

  const authorized = info.status === "authorized";
  await atualizarAssinatura(info.externalReference, {
    status: info.status,
    preapprovalId: id,
    ativo: authorized,
  });
  return json(request, { ok: true });
}
