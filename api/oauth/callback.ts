import {
  destinoDoUsuario,
  getOAuthToken,
  getUsuarioVariantes,
  saveOAuthToken,
} from "../../src/memory/context.js";
import { consumirNonce, exchangeCode, oauthConfigured, verifyState } from "../../src/oauth/google.js";
import { sendTextMessage } from "../../src/whatsapp/client.js";
import { errorPage, successPage } from "../../src/oauth/page.js";

/**
 * Retorno do Google após o consentimento. Validamos o state (para saber quem
 * é o usuário e recusar chamadas forjadas), trocamos o `code` por tokens e
 * guardamos o refresh_token. A partir daí, a Rosana usa a agenda dele.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    if (!oauthConfigured()) {
      return errorPage("Conexão indisponível", "A conexão de agenda não está configurada.", 503);
    }

    const url = new URL(request.url);
    const err = url.searchParams.get("error");
    if (err) {
      return errorPage(
        "Autorização não concluída",
        "Você cancelou ou negou o acesso à agenda. Se foi sem querer, peça o link de novo à Rosana e tente outra vez.",
        400,
      );
    }

    const code = url.searchParams.get("code") ?? "";
    const state = (url.searchParams.get("state") ?? "").replace(/[^A-Za-z0-9._-]/g, "");
    const st = verifyState(state);
    if (!st || !code) {
      return errorPage(
        "Link inválido",
        "Não consegui validar este retorno. Peça um novo link para a Rosana no WhatsApp.",
        400,
      );
    }

    const waId = st.wa;
    try {
      // Uso único: cada link conecta uma agenda UMA vez.
      if (!(await consumirNonce(st.n, waId))) {
        return errorPage(
          "Link já utilizado",
          "Este link de conexão já foi usado ou expirou. Peça um novo para a Rosana no WhatsApp (mande “conectar agenda”).",
          400,
        );
      }
      const tokens = await exchangeCode(code);

      // O Google só manda refresh_token na primeira autorização (ou com
      // prompt=consent). Se não vier, reaproveitamos o que já estava salvo;
      // se também não houver, pedimos para refazer.
      let refreshToken = tokens.refreshToken;
      if (!refreshToken) {
        const existente = await getOAuthToken(waId);
        refreshToken = existente?.refresh_token ?? null;
      }
      if (!refreshToken) {
        return errorPage(
          "Quase lá",
          "Faltou uma permissão para a Rosana lembrar do acesso. Peça o link de novo e, na tela do Google, confirme o acesso à agenda.",
          400,
        );
      }

      await saveOAuthToken(waId, {
        refreshToken,
        accessToken: tokens.accessToken,
        expiry: tokens.expiry,
        scope: tokens.scope,
        email: tokens.email,
      });
      console.log("[oauth] agenda conectada para um usuário.");
      // Avisa no WhatsApp QUAL conta foi conectada: se não foi a pessoa, ela
      // percebe na hora (defesa contra link vazado).
      const usuario = await getUsuarioVariantes(waId).catch(() => null);
      await sendTextMessage(
        usuario ? destinoDoUsuario(usuario) : waId,
        `✅ Agenda conectada${tokens.email ? `: ${tokens.email}` : ""}. ` +
          "Se não foi você que conectou, me avise e mande “conectar agenda” para trocar.",
      ).catch((e) =>
        console.error(`[oauth] aviso de conexão falhou: ${e instanceof Error ? e.message : String(e)}`),
      );
      return successPage(tokens.email);
    } catch (e) {
      console.error(`[oauth] falha no callback: ${e instanceof Error ? e.message : String(e)}`);
      return errorPage(
        "Ops!",
        "Tive um problema ao conectar sua agenda. Tente de novo em instantes pelo link da Rosana.",
        500,
      );
    }
  },
};
