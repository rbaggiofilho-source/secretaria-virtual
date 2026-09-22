import { sessionFromRequest } from "../../src/auth/session.js";
import { consultarFotos, type TipoFoto } from "../../src/memory/context.js";
import { signedFotoUrl } from "../../src/memory/storage.js";
import { json, preflight } from "../../src/auth/http.js";

/**
 * GET /api/app/fotos?obra=&tipo= (Bearer) — registro fotográfico do usuário.
 * Cada foto vem com uma URL temporária (assinada) para exibição no painel;
 * o bucket continua privado.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    try {
      const fotos = await consultarFotos(wa, {
        obra: url.searchParams.get("obra"),
        tipo: (tipo as TipoFoto | null) || null,
      });
      const comUrl = await Promise.all(
        fotos.map(async (f) => ({
          id: f.id,
          obra: f.obra,
          tipo: f.tipo,
          descricao: f.descricao,
          data: f.data,
          url: await signedFotoUrl(f.caminho),
        })),
      );
      return json(request, { ok: true, fotos: comUrl });
    } catch (err) {
      console.error("[app] fotos:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
