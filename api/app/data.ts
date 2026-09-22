import { sessionFromRequest } from "../../src/auth/session.js";
import { getEnv } from "../../src/config/env.js";
import { buildDashboard } from "../../src/app/dashboard.js";
import { buildObras } from "../../src/app/obras.js";
import {
  relatorioCustos,
  consultarRDO,
  consultarDocumentos,
  consultarMateriais,
  consultarFotos,
  type MaterialStatus,
  type TipoFoto,
} from "../../src/memory/context.js";
import { salvarObra, excluirObra, type ObraStatus } from "../../src/memory/obras.js";
import { signedFotoUrl } from "../../src/memory/storage.js";
import { json, preflight, readJson } from "../../src/auth/http.js";

/**
 * Roteador único dos DADOS do painel (`?recurso=...`), para caber no limite de
 * funções serverless do plano Hobby da Vercel. Tudo escopado por token no
 * servidor. GET consulta; POST cria (só obras por enquanto).
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);

    const url = new URL(request.url);
    const recurso = url.searchParams.get("recurso") ?? "";
    const p = url.searchParams;

    try {
      if (request.method === "GET") {
        switch (recurso) {
          case "dashboard":
            return json(request, { ok: true, data: await buildDashboard(wa, getEnv().TIMEZONE) });
          case "obras":
            return json(request, { ok: true, obras: await buildObras(wa) });
          case "custos": {
            const rel = await relatorioCustos(wa, {
              obra: p.get("obra"),
              desde: p.get("desde"),
              ate: p.get("ate"),
            });
            return json(request, { ok: true, ...rel });
          }
          case "rdo":
            return json(request, { ok: true, rdos: await consultarRDO(wa, { obra: p.get("obra") }) });
          case "documentos":
            return json(request, {
              ok: true,
              documentos: await consultarDocumentos(wa, {
                obra: p.get("obra"),
                incluirArquivados: p.get("arquivados") === "1",
              }),
            });
          case "materiais":
            return json(request, {
              ok: true,
              materiais: await consultarMateriais(wa, {
                obra: p.get("obra"),
                status: (p.get("status") as MaterialStatus | null) || null,
              }),
            });
          case "fotos": {
            const fotos = await consultarFotos(wa, {
              obra: p.get("obra"),
              tipo: (p.get("tipo") as TipoFoto | null) || null,
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
          }
          default:
            return json(request, { error: "recurso_desconhecido" }, 400);
        }
      }

      if (request.method === "POST") {
        if (recurso === "obras") {
          const body = await readJson(request);
          const nome = (typeof body.nome === "string" ? body.nome : "").trim();
          if (!nome) return json(request, { ok: false, error: "nome_obrigatorio" }, 400);
          const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
          const obra = await salvarObra(wa, {
            id: typeof body.id === "number" ? body.id : null,
            nome,
            cliente: str(body.cliente),
            endereco: str(body.endereco),
            contexto: str(body.contexto),
            data_inicio: str(body.data_inicio),
            data_fim_alvo: str(body.data_fim_alvo),
            status: (str(body.status) as ObraStatus | null),
          });
          return json(request, { ok: true, obra });
        }
        return json(request, { error: "recurso_desconhecido" }, 400);
      }

      if (request.method === "DELETE") {
        if (recurso === "obras") {
          const body = await readJson(request);
          const id = typeof body.id === "number" ? body.id : null;
          const nome = typeof body.nome === "string" ? body.nome : null;
          if (!id && !nome) return json(request, { error: "faltam_dados" }, 400);
          await excluirObra(wa, { id, nome });
          return json(request, { ok: true });
        }
        return json(request, { error: "recurso_desconhecido" }, 400);
      }

      return json(request, { error: "method_not_allowed" }, 405);
    } catch (err) {
      console.error(`[app] data(${recurso}):`, err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
