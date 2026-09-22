import { autenticar, signSession } from "../../src/auth/session.js";
import { requestLoginCode, verifyLoginCode } from "../../src/auth/codes.js";
import { verifyLogin, setPassword, validarSenha } from "../../src/auth/password.js";
import { consumirLimite, ipDaRequisicao } from "../../src/auth/ratelimit.js";
import { canonicalWa, registrarLead, type UsuarioRow } from "../../src/memory/context.js";
import { json, preflight, readJson } from "../../src/auth/http.js";
import { getEnv } from "../../src/config/env.js";
import { sendTextMessage } from "../../src/whatsapp/client.js";

/**
 * Roteador único de AUTENTICAÇÃO do painel (`?acao=...`), para caber no limite
 * de funções serverless do plano Hobby da Vercel.
 *   GET  ?acao=session
 *   POST ?acao=login | request-code | set-password | change-password | lead
 *
 * Anti-enumeração: login e request-code respondem IGUAL para número
 * cadastrado ou não (antes, request-code devolvia 403 vs. ok + o NOME da
 * pessoa, e login distinguia "sem senha" de "senha errada").
 * Rate limit por IP em todas as ações públicas.
 */

const MIN = 60 * 1000;
const HORA = 60 * MIN;

function usuarioPublico(u: UsuarioRow) {
  return { nome: u.nome, dono: u.dono, contextos: u.contextos, profissao: u.profissao };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const acao = new URL(request.url).searchParams.get("acao") ?? "";

    try {
      // ---- session (GET) ----
      if (request.method === "GET") {
        if (acao !== "session") return json(request, { error: "acao_desconhecida" }, 400);
        const sessao = await autenticar(request);
        if (!sessao) return json(request, { ok: false }, 401);
        return json(request, { ok: true, usuario: usuarioPublico(sessao.usuario) });
      }

      if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
      const ip = ipDaRequisicao(request);
      const body = await readJson(request);
      const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
      const digitos = whatsapp.replace(/\D/g, "");

      // ---- login (número + senha) ----
      if (acao === "login") {
        const senha = typeof body.senha === "string" ? body.senha : "";
        if (!digitos || !senha) return json(request, { ok: false, error: "faltam_dados" }, 400);
        if (!(await consumirLimite(`login_ip:${ip}`, 30, 15 * MIN))) {
          return json(request, { ok: false, error: "bloqueado" }, 429);
        }
        const r = await verifyLogin(whatsapp, senha);
        if (!r.ok) {
          // "sem_senha" vira "credenciais": não revela se o número existe/tem senha.
          const erro = r.reason === "bloqueado" ? "bloqueado" : "credenciais";
          return json(request, { ok: false, error: erro }, erro === "bloqueado" ? 429 : 401);
        }
        return json(request, {
          ok: true,
          token: signSession(r.usuario.user_wa, r.versao),
          usuario: usuarioPublico(r.usuario),
        });
      }

      // ---- request-code (OTP para criar/redefinir senha) ----
      if (acao === "request-code") {
        if (!digitos) return json(request, { error: "numero_invalido" }, 400);
        if (!(await consumirLimite(`otp_ip:${ip}`, 10, HORA))) {
          return json(request, { ok: false, error: "muito_cedo" }, 429);
        }
        const r = await requestLoginCode(whatsapp);
        // Resposta IDÊNTICA para qualquer número (cadastrado ou não, com ou sem
        // cooldown/limite/falha de envio): nada aqui revela se o número existe.
        // O motivo real fica só no log do servidor.
        if (!r.ok && r.reason !== "nao_autorizado") console.warn(`[auth] request-code: ${r.reason}`);
        return json(request, { ok: true });
      }

      // ---- set-password (com código do WhatsApp) ----
      if (acao === "set-password") {
        const code = typeof body.code === "string" ? body.code : "";
        const senha = typeof body.senha === "string" ? body.senha : "";
        if (!whatsapp || !code || !senha) return json(request, { error: "faltam_dados" }, 400);
        const problema = validarSenha(senha);
        if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);
        if (!(await consumirLimite(`otp_verif_ip:${ip}`, 30, HORA))) {
          return json(request, { ok: false, error: "limite_diario" }, 429);
        }
        const check = await verifyLoginCode(whatsapp, code);
        if (!check.ok) {
          // Qualquer falha vira "invalido" (anti-enumeração: sem código, expirado,
          // excedeu, limite ou número não cadastrado respondem igual).
          return json(request, { ok: false, error: "invalido" }, 401);
        }
        const versao = await setPassword(check.usuario.user_wa, senha);
        return json(request, {
          ok: true,
          token: signSession(check.usuario.user_wa, versao),
          usuario: usuarioPublico(check.usuario),
        });
      }

      // ---- change-password (logado, exige senha atual) ----
      if (acao === "change-password") {
        const sessao = await autenticar(request);
        if (!sessao) return json(request, { ok: false, error: "nao_autenticado" }, 401);
        const senhaAtual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
        const novaSenha = typeof body.novaSenha === "string" ? body.novaSenha : "";
        if (!senhaAtual || !novaSenha) return json(request, { error: "faltam_dados" }, 400);
        const problema = validarSenha(novaSenha);
        if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);
        const r = await verifyLogin(sessao.wa, senhaAtual);
        if (!r.ok) {
          const reason = r.reason === "bloqueado" ? "bloqueado" : "senha_atual_incorreta";
          return json(request, { ok: false, error: reason }, r.reason === "bloqueado" ? 429 : 401);
        }
        const versao = await setPassword(sessao.wa, novaSenha);
        // As OUTRAS sessões caem (versão nova); esta recebe um token novo.
        return json(request, { ok: true, token: signSession(sessao.wa, versao) });
      }

      // ---- lead (interesse vindo do /cadastro do site, antes do pagamento) ----
      if (acao === "lead") {
        if (!(await consumirLimite(`lead_ip:${ip}`, 5, HORA))) {
          return json(request, { ok: false, error: "muito_cedo" }, 429);
        }
        const str = (v: unknown, max = 200) =>
          typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
        const nome = str(body.nome);
        const telefone = str(body.telefone, 30);
        if (!nome || !telefone) return json(request, { ok: false, error: "faltam_dados" }, 400);
        await registrarLead({
          nome,
          telefone: canonicalWa(telefone),
          email: str(body.email),
          cpf: str(body.cpf, 20),
          endereco: str(body.endereco, 300),
          profissao: str(body.profissao, 100),
          plano: str(body.plano, 30),
        });
        // Avisa o dono (best-effort: fora da janela de 24h a Meta não entrega).
        const dono = getEnv().ALLOWED_WHATSAPP_NUMBER;
        if (dono) {
          await sendTextMessage(
            dono,
            `🆕 Novo interessado pelo site: ${nome} (${telefone})` +
              (str(body.plano, 30) ? ` — plano ${str(body.plano, 30)}` : "") +
              ". Está na tabela secretaria_leads.",
          ).catch(() => undefined);
        }
        return json(request, { ok: true });
      }

      return json(request, { error: "acao_desconhecida" }, 400);
    } catch (err) {
      console.error(`[auth] router(${acao}):`, err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
