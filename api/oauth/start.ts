import { buildAuthUrl, oauthConfigured, verifyState } from "../../src/oauth/google.js";
import { errorPage } from "../../src/oauth/page.js";

/**
 * Início do fluxo OAuth. A Rosana manda ao usuário um link deste endpoint com
 * um `s` (state assinado que identifica o wa_id). Aqui validamos o state e
 * redirecionamos para a tela de consentimento do Google. Ficar no NOSSO domínio
 * deixa o link curto e permite mostrar um erro amigável se algo estiver errado.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    if (!oauthConfigured()) {
      return errorPage(
        "Conexão indisponível",
        "A conexão de agenda ainda não está configurada. Avise o Ricardo.",
        503,
      );
    }

    const url = new URL(request.url);
    const state = url.searchParams.get("s") ?? "";
    const waId = verifyState(state);
    if (!waId) {
      return errorPage(
        "Link expirado",
        "Este link de conexão expirou ou é inválido. Peça um novo para a Rosana no WhatsApp (mande “conectar agenda”).",
        400,
      );
    }

    // Redireciona para o consentimento do Google (leg do Google, state fresco).
    return new Response(null, { status: 302, headers: { Location: buildAuthUrl(waId) } });
  },
};
