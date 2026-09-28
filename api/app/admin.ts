import { json, preflight, readJson } from "../../src/auth/http.js";
import {
  adminFromRequest,
  bootstrapAdmin,
  verifyAdminLogin,
  signAdminToken,
  getAdmin,
  changeAdminPassword,
} from "../../src/auth/admin.js";
import { validarSenha } from "../../src/auth/hash.js";
import {
  buildOverview,
  listUsuariosAdmin,
  setUsuarioAtivo,
  setUsuarioPlano,
} from "../../src/admin/metrics.js";
import { listPlanos, upsertPlano } from "../../src/pay/planos-db.js";
import { getPacote, normalizarPlanoId, PACOTES } from "../../src/pay/planos.js";
import { creditarPacote } from "../../src/pay/pacotes.js";

/**
 * Painel de ADMINISTRAÇÃO da Rosana. Endpoint único (teto de 12 funções da
 * Vercel). Tudo escopado por token de admin, EXCETO:
 *  - ?recurso=planos-public (GET): planos ativos para a landing/cadastro (sem token).
 *  - ?acao=bootstrap|login (POST): criação do 1º acesso e login (sem token).
 *
 * As demais ações exigem `Authorization: Bearer <admin token>`.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const url = new URL(request.url);
    const acao = url.searchParams.get("acao") ?? "";
    const recurso = url.searchParams.get("recurso") ?? "";

    try {
      // ----- Público (sem token) -----
      if (recurso === "planos-public" && request.method === "GET") {
        return json(request, { ok: true, planos: await listPlanos(false), pacotes: Object.values(PACOTES) });
      }
      if (acao === "bootstrap" && request.method === "POST") return await bootstrap(request);
      if (acao === "login" && request.method === "POST") return await login(request);

      // ----- Daqui pra baixo exige admin -----
      const email = adminFromRequest(request);
      if (!email) return json(request, { ok: false, error: "nao_autenticado" }, 401);

      if (acao === "session" && request.method === "GET") {
        const admin = await getAdmin(email);
        return json(request, { ok: true, admin: { email, nome: admin?.nome ?? "Administrador" } });
      }
      if (acao === "change-password" && request.method === "POST") {
        return await trocarSenha(request, email);
      }

      if (request.method === "GET") {
        switch (recurso) {
          case "overview":
            return json(request, { ok: true, data: await buildOverview() });
          case "usuarios":
            return json(request, { ok: true, usuarios: await listUsuariosAdmin() });
          case "planos":
            return json(request, { ok: true, planos: await listPlanos(true), pacotes: Object.values(PACOTES) });
          default:
            return json(request, { error: "recurso_desconhecido" }, 400);
        }
      }

      if (request.method === "POST") {
        if (acao === "set-usuario") {
          const body = await readJson(request);
          const userWa = String(body.user_wa ?? "");
          if (!userWa) return json(request, { error: "faltam_dados" }, 400);
          await setUsuarioAtivo(userWa, Boolean(body.ativo));
          return json(request, { ok: true });
        }
        if (acao === "set-usuario-plano") {
          const body = await readJson(request);
          const userWa = String(body.user_wa ?? "");
          const plano = normalizarPlanoId(String(body.plano ?? ""));
          if (!userWa || !plano) return json(request, { error: "faltam_dados" }, 400);
          await setUsuarioPlano(userWa, plano);
          return json(request, { ok: true });
        }
        if (acao === "conceder-pacote") {
          // Cortesia/venda manual (ex.: enquanto o Mercado Pago não está ligado).
          const body = await readJson(request);
          const userWa = String(body.user_wa ?? "");
          const pacote = getPacote(String(body.pacote ?? ""));
          if (!userWa || !pacote) return json(request, { error: "faltam_dados" }, 400);
          await creditarPacote({ userWa, pacoteId: pacote.id, origem: "admin" });
          return json(request, { ok: true });
        }
        if (acao === "set-plano") {
          const body = await readJson(request);
          const id = String(body.id ?? "");
          if (!id) return json(request, { error: "faltam_dados" }, 400);
          const valorNum = body.valor !== undefined ? Number(body.valor) : undefined;
          if (valorNum !== undefined && (!Number.isFinite(valorNum) || valorNum < 0)) {
            return json(request, { error: "valor_invalido" }, 400);
          }
          // Limites: inteiro ≥ 0; limite_obras aceita null (= ilimitado).
          const lim = (v: unknown): number | undefined => {
            if (v === undefined) return undefined;
            const n = Math.floor(Number(v));
            return Number.isFinite(n) && n >= 0 ? n : undefined;
          };
          const plano = await upsertPlano({
            id,
            nome: body.nome !== undefined ? String(body.nome) : undefined,
            valor: valorNum,
            descricao: body.descricao !== undefined ? String(body.descricao) : undefined,
            ativo: body.ativo !== undefined ? Boolean(body.ativo) : undefined,
            ordem: body.ordem !== undefined ? Number(body.ordem) : undefined,
            limite_mensagens: lim(body.limite_mensagens),
            limite_fotos: lim(body.limite_fotos),
            limite_audio_min: lim(body.limite_audio_min),
            limite_obras:
              body.limite_obras === null || body.limite_obras === ""
                ? null
                : lim(body.limite_obras),
          });
          return json(request, { ok: true, plano });
        }
        return json(request, { error: "acao_desconhecida" }, 400);
      }

      return json(request, { error: "method_not_allowed" }, 405);
    } catch (err) {
      console.error(`[admin] ${acao || recurso}:`, err instanceof Error ? err.message : err);
      return json(request, { ok: false, error: "erro_interno" }, 500);
    }
  },
};

async function bootstrap(request: Request): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim();
  const senha = String(body.senha ?? "");
  const token = String(body.token ?? "");
  const nome = body.nome !== undefined ? String(body.nome) : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(request, { ok: false, error: "email_invalido" }, 400);
  const erroSenha = validarSenha(senha);
  if (erroSenha) return json(request, { ok: false, error: erroSenha }, 400);

  const r = await bootstrapAdmin({ email, senha, token, nome });
  if (!r.ok) {
    const status = r.reason === "token_invalido" || r.reason === "bootstrap_desativado" ? 403 : 400;
    return json(request, { ok: false, error: r.reason }, status);
  }
  return json(request, { ok: true, token: signAdminToken(email.toLowerCase()), admin: { email: email.toLowerCase(), nome: nome ?? "Administrador" } });
}

async function login(request: Request): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim();
  const senha = String(body.senha ?? "");
  const r = await verifyAdminLogin(email, senha);
  if (!r.ok) return json(request, { ok: false, error: "credenciais" }, 401);
  return json(request, { ok: true, token: signAdminToken(r.email), admin: { email: r.email, nome: r.nome } });
}

async function trocarSenha(request: Request, email: string): Promise<Response> {
  const body = await readJson(request);
  const senhaAtual = String(body.senhaAtual ?? "");
  const novaSenha = String(body.novaSenha ?? "");
  const erroSenha = validarSenha(novaSenha);
  if (erroSenha) return json(request, { ok: false, error: erroSenha }, 400);
  const r = await changeAdminPassword(email, senhaAtual, novaSenha);
  if (!r.ok) return json(request, { ok: false, error: r.reason }, r.reason === "credenciais" ? 401 : 400);
  return json(request, { ok: true });
}
