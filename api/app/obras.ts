import { sessionFromRequest } from "../../src/auth/session.js";
import { buildObras } from "../../src/app/obras.js";
import { loadOwnerContext, saveMemory } from "../../src/memory/context.js";
import { json, preflight, readJson } from "../../src/auth/http.js";

/**
 * GET  /api/app/obras (Bearer) — lista consolidada de obras do usuário.
 * POST /api/app/obras { nome } — registra uma nova obra (memória kind='obra').
 * A entrada de dados "de verdade" segue no WhatsApp; isto só permite iniciar
 * uma obra pelo painel para começar a organizar.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);

    try {
      if (request.method === "GET") {
        return json(request, { ok: true, obras: await buildObras(wa) });
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const nome = (typeof body.nome === "string" ? body.nome : "").trim();
        if (!nome) return json(request, { ok: false, error: "nome_obrigatorio" }, 400);
        const ctx = await loadOwnerContext(wa);
        const jaExiste = ctx.obras.some((o) => o.trim().toLowerCase() === nome.toLowerCase());
        if (!jaExiste) await saveMemory(wa, "obra", nome);
        return json(request, { ok: true, criada: !jaExiste });
      }
      return json(request, { error: "method_not_allowed" }, 405);
    } catch (err) {
      console.error("[app] obras:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
