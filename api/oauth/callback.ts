import { getOAuthToken, saveOAuthToken } from "../../src/memory/context.js";
import { exchangeCode, oauthConfigured, verifyState } from "../../src/oauth/google.js";
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
    const waId = verifyState(state);
    if (!waId || !code) {
      return errorPage(
        "Link inválido",
        "Não consegui validar este retorno. Peça um novo link para a Rosana no WhatsApp.",
        400,
      );
    }

    try {
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
