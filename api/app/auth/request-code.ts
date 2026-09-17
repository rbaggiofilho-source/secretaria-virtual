import { requestLoginCode } from "../../../src/auth/codes.js";
import { json, preflight, readJson } from "../../../src/auth/http.js";

/**
 * POST /api/app/auth/request-code  { whatsapp: "5548..." }
 * Gera e envia (pela Rosana, no WhatsApp) um código de acesso, se o número for
 * de um usuário autorizado e ativo. Nunca revela se o número existe de forma
 * que ajude um atacante: a resposta é neutra em todos os casos exceto cooldown.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

    const body = await readJson(request);
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
    if (!whatsapp.replace(/\D/g, "")) {
      return json(request, { error: "numero_invalido" }, 400);
    }

    try {
      const result = await requestLoginCode(whatsapp);
      if (result.ok) return json(request, { ok: true, nome: result.nome });

      if (result.reason === "muito_cedo") {
        return json(request, { ok: false, error: "muito_cedo" }, 429);
      }
      if (result.reason === "envio_falhou") {
        return json(request, { ok: false, error: "envio_falhou" }, 502);
      }
      // nao_autorizado: resposta neutra (não confirma se o número existe).
      return json(request, { ok: false, error: "nao_autorizado" }, 403);
    } catch (err) {
      console.error("[auth] request-code:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
