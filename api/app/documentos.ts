import { sessionFromRequest } from "../../src/auth/session.js";
import { consultarDocumentos } from "../../src/memory/context.js";
import { json, preflight } from "../../src/auth/http.js";

/** GET /api/app/documentos?obra= (Bearer) — documentos/prazos do usuário. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    const url = new URL(request.url);
    try {
      const documentos = await consultarDocumentos(wa, {
        obra: url.searchParams.get("obra"),
        incluirArquivados: url.searchParams.get("arquivados") === "1",
      });
      return json(request, { ok: true, documentos });
    } catch (err) {
      console.error("[app] documentos:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
