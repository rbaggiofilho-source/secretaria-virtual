import { sessionFromRequest } from "../../src/auth/session.js";
import { consultarRDO, getUsuario } from "../../src/memory/context.js";
import { buscarObraPorNome } from "../../src/memory/obras.js";
import { buildRdoPdf } from "../../src/pdf/rdo.js";
import { corsHeaders, json, preflight } from "../../src/auth/http.js";

/**
 * GET /api/app/rdo-pdf?obra=<obra> (Bearer) — gera e baixa o PDF do Diário de
 * Obra de uma obra (todos os dias registrados). Escopo por token no servidor.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);

    const obra = (new URL(request.url).searchParams.get("obra") ?? "").trim();
    if (!obra) return json(request, { error: "obra_obrigatoria" }, 400);

    try {
      const rdos = await consultarRDO(wa, { obra });
      if (rdos.length === 0) return json(request, { ok: false, error: "sem_rdo" }, 404);

      // Enriquece o cabeçalho com o cadastro estruturado da obra + nome do usuário.
      const [cad, usuario] = await Promise.all([buscarObraPorNome(wa, obra), getUsuario(wa)]);
      const bytes = await buildRdoPdf({
        obra: cad?.nome ?? obra,
        rdos,
        cliente: cad?.cliente ?? null,
        endereco: cad?.endereco ?? null,
        responsavel: usuario?.nome ?? null,
        emitidoPor: usuario?.nome ?? null,
      });
      const nomeArq = `RDO-${obra.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
      return new Response(bytes as unknown as ArrayBuffer, {
        status: 200,
        headers: {
          ...corsHeaders(request),
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${nomeArq}"`,
        },
      });
    } catch (err) {
      console.error("[app] rdo-pdf:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
