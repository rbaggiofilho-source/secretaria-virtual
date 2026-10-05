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
  getUsuario,
  getPerfil,
  atualizarPerfil,
  setPreferencias,
  setNudgeDiario,
  type MaterialStatus,
  type TipoFoto,
} from "../../src/memory/context.js";
import { salvarObra, excluirObra, type ObraStatus } from "../../src/memory/obras.js";
import { listarAcoes } from "../../src/memory/acoes.js";
import { lembretesProgramados } from "../../src/memory/eventos.js";
import {
  criarEmpresa,
  criarObraEmpresa,
  definirMembrosDaObra,
  empresaComoAdmin,
  getMembro,
  listarMembros,
  listarObrasEmpresa,
  membrosDaObra,
  obraDaEmpresa,
  removerMembro,
} from "../../src/memory/empresa.js";
import { enviarConvite } from "../../src/corp/convites.js";
import { resolverEscopoPainel } from "../../src/corp/escopo.js";
import { buildDashboardEmpresa, buildObrasEmpresa } from "../../src/app/empresaView.js";
import { signedFotoUrl } from "../../src/memory/storage.js";
import { json, preflight, readJson } from "../../src/auth/http.js";
import { checarObra, resolverDireito, saldoDoUsuario } from "../../src/pay/cota.js";

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
        // Versão corporativa (Fase 3): se o usuário é ENGENHEIRO de uma empresa,
        // as leituras do painel passam a ler os dados COMPARTILHADOS das obras
        // atribuídas a ele (de qualquer membro). Admin/pessoal → esc = null.
        const esc = await resolverEscopoPainel(wa).catch(() => null);
        const le = esc?.leitura;
        switch (recurso) {
          case "dashboard":
            return json(request, {
              ok: true,
              data: esc ? await buildDashboardEmpresa(esc, getEnv().TIMEZONE) : await buildDashboard(wa, getEnv().TIMEZONE),
            });
          case "obras":
            return json(request, { ok: true, obras: esc ? await buildObrasEmpresa(esc) : await buildObras(wa) });
          case "custos": {
            const rel = await relatorioCustos(wa, {
              obra: p.get("obra"),
              desde: p.get("desde"),
              ate: p.get("ate"),
            }, le);
            return json(request, { ok: true, ...rel });
          }
          case "rdo":
            return json(request, { ok: true, rdos: await consultarRDO(wa, { obra: p.get("obra") }, le) });
          case "documentos":
            return json(request, {
              ok: true,
              documentos: await consultarDocumentos(wa, {
                obra: p.get("obra"),
                incluirArquivados: p.get("arquivados") === "1",
              }, le),
            });
          case "materiais":
            return json(request, {
              ok: true,
              materiais: await consultarMateriais(wa, {
                obra: p.get("obra"),
                status: (p.get("status") as MaterialStatus | null) || null,
              }, le),
            });
          case "fotos": {
            const fotos = await consultarFotos(wa, {
              obra: p.get("obra"),
              tipo: (p.get("tipo") as TipoFoto | null) || null,
            }, le);
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
          case "plano": {
            // Plano + saldo do mês (Configurações do painel).
            const usuario = await getUsuario(wa);
            if (!usuario) return json(request, { ok: false, error: "usuario_nao_encontrado" }, 404);
            const direito = await resolverDireito(usuario);
            const saldo = await saldoDoUsuario(usuario, direito);
            const num = (n: number) => (Number.isFinite(n) ? n : null); // null = ilimitado
            return json(request, {
              ok: true,
              plano: {
                id: direito.plano.id,
                nome: direito.plano.nome,
                valor: direito.plano.valor,
                recursos: direito.plano.recursos,
                ilimitado: direito.ilimitado,
                limiteObras: direito.ilimitado ? null : direito.plano.limites.obras,
              },
              uso: {
                mes: saldo.uso.mes,
                mensagens: { usado: saldo.mensagens.usado, limite: num(saldo.mensagens.limite) },
                fotos: { usado: saldo.fotos.usado, limite: num(saldo.fotos.limite) },
                audioMin: {
                  usado: Math.round(saldo.audioSeg.usado / 60),
                  limite: Number.isFinite(saldo.audioSeg.limite) ? Math.round(saldo.audioSeg.limite / 60) : null,
                },
              },
            });
          }
          case "conta": {
            // Aba "Minha conta": cadastro + assinatura + preferências.
            const perfil = await getPerfil(wa);
            if (!perfil) return json(request, { ok: false, error: "usuario_nao_encontrado" }, 404);
            return json(request, { ok: true, conta: perfil });
          }
          case "atividade": {
            // Aba "O que a Rosana fez por você": programados + entregues.
            const [programados, entregues] = await Promise.all([
              lembretesProgramados(wa),
              listarAcoes(wa),
            ]);
            return json(request, {
              ok: true,
              programados: programados.map((e) => ({
                id: e.id,
                titulo: e.titulo,
                local: e.local,
                quando: e.lembrete_em,
                inicio: e.inicio,
              })),
              entregues: entregues.map((a) => ({
                id: a.id,
                tipo: a.tipo,
                titulo: a.titulo,
                detalhe: a.detalhe,
                status: a.status,
                quando: a.created_at,
              })),
            });
          }
          case "empresa": {
            // Painel do admin da empresa. Se o usuário não administra nenhuma,
            // devolve empresa:null (o painel oferece criar).
            const empresa = await empresaComoAdmin(wa);
            if (!empresa) return json(request, { ok: true, empresa: null });
            const [membros, obrasRaw] = await Promise.all([
              listarMembros(empresa.id),
              listarObrasEmpresa(empresa.id),
            ]);
            const obras = await Promise.all(
              obrasRaw.map(async (o) => ({ ...o, membros: await membrosDaObra(o.id) })),
            );
            return json(request, {
              ok: true,
              empresa: {
                id: empresa.id,
                nome: empresa.nome,
                plano: empresa.plano,
                teto_membros: empresa.teto_membros,
                usados: membros.filter((m) => m.status === "ativo" || m.status === "convidado").length,
              },
              membros: membros
                .filter((m) => m.status !== "removido")
                .map((m) => ({
                  id: m.id,
                  user_wa: m.user_wa,
                  nome: m.nome,
                  papel: m.papel,
                  status: m.status,
                })),
              obras,
            });
          }
          default:
            return json(request, { error: "recurso_desconhecido" }, 400);
        }
      }

      if (request.method === "POST") {
        if (recurso === "empresa") {
          const body = await readJson(request);
          const acao = typeof body.acao === "string" ? body.acao : "";
          const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

          // 'criar' é a única ação que NÃO exige empresa prévia.
          if (acao === "criar") {
            const nome = str(body.nome);
            if (!nome) return json(request, { ok: false, error: "nome_obrigatorio" }, 400);
            if (await empresaComoAdmin(wa)) {
              return json(request, { ok: false, error: "ja_tem_empresa" }, 400);
            }
            const teto = typeof body.teto_membros === "number" && body.teto_membros > 0 ? Math.floor(body.teto_membros) : 3;
            const empresa = await criarEmpresa(wa, nome, teto);
            return json(request, { ok: true, empresa: { id: empresa.id, nome: empresa.nome, teto_membros: empresa.teto_membros } });
          }

          // Demais ações exigem ser admin de uma empresa.
          const empresa = await empresaComoAdmin(wa);
          if (!empresa) return json(request, { ok: false, error: "sem_empresa" }, 403);

          if (acao === "convidar") {
            const numero = str(body.numero);
            if (!numero) return json(request, { ok: false, error: "numero_obrigatorio" }, 400);
            const r = await enviarConvite(empresa, numero, str(body.nome) || null);
            if (!r.ok) {
              return json(request, { ok: false, error: r.motivo }, r.motivo === "sem_vaga" ? 403 : 409);
            }
            return json(request, { ok: true });
          }

          if (acao === "remover") {
            const membroId = typeof body.membroId === "number" ? body.membroId : null;
            if (!membroId) return json(request, { ok: false, error: "membro_invalido" }, 400);
            const m = await getMembro(empresa.id, membroId);
            if (!m) return json(request, { ok: false, error: "membro_nao_encontrado" }, 404);
            await removerMembro(empresa.id, membroId);
            return json(request, { ok: true });
          }

          if (acao === "criar_obra") {
            const nome = str(body.nome);
            if (!nome) return json(request, { ok: false, error: "nome_obrigatorio" }, 400);
            const obra = await criarObraEmpresa(empresa, {
              nome,
              cliente: str(body.cliente) || null,
              endereco: str(body.endereco) || null,
            });
            return json(request, { ok: true, obra });
          }

          if (acao === "atribuir") {
            const obraId = typeof body.obraId === "number" ? body.obraId : null;
            const userWas = Array.isArray(body.userWas) ? body.userWas.filter((x: unknown) => typeof x === "string") : [];
            if (!obraId) return json(request, { ok: false, error: "obra_invalida" }, 400);
            if (!(await obraDaEmpresa(empresa.id, obraId))) {
              return json(request, { ok: false, error: "obra_nao_encontrada" }, 404);
            }
            await definirMembrosDaObra(obraId, userWas as string[]);
            return json(request, { ok: true });
          }

          return json(request, { ok: false, error: "acao_desconhecida" }, 400);
        }
        if (recurso === "conta") {
          // Atualiza dados de cadastro + preferências da aba "Minha conta".
          const body = await readJson(request);
          const str = (v: unknown) => (typeof v === "string" ? v : undefined);
          const email = str(body.email);
          if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return json(request, { ok: false, error: "email_invalido" }, 400);
          }
          await atualizarPerfil(wa, {
            nome: str(body.nome),
            nomeCompleto: str(body.nome_completo),
            email,
            profissao: str(body.profissao),
          });
          // Preferências (horário do resumo + antecedência do lembrete).
          const resumoHora = str(body.resumo_hora);
          const antec =
            typeof body.lembrete_antecedencia_min === "number"
              ? body.lembrete_antecedencia_min
              : undefined;
          if ((resumoHora && resumoHora.trim()) || typeof antec === "number") {
            await setPreferencias(wa, {
              resumoHora: resumoHora ? resumoHora.trim() : null,
              antecedenciaMin: typeof antec === "number" ? antec : null,
            });
          }
          // Resumo diário ligado/desligado.
          if (typeof body.nudge_diario === "boolean") await setNudgeDiario(wa, body.nudge_diario);
          const perfil = await getPerfil(wa);
          return json(request, { ok: true, conta: perfil });
        }
        if (recurso === "obras") {
          const body = await readJson(request);
          const nome = (typeof body.nome === "string" ? body.nome : "").trim();
          if (!nome) return json(request, { ok: false, error: "nome_obrigatorio" }, 400);
          const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
          // Obra NOVA passa pelo limite de obras do plano (editar não conta).
          if (typeof body.id !== "number") {
            const usuario = await getUsuario(wa);
            if (usuario) {
              const bloqueio = await checarObra(usuario, await resolverDireito(usuario), nome);
              if (bloqueio) return json(request, { ok: false, error: "limite_obras", mensagem: bloqueio }, 403);
            }
          }
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
