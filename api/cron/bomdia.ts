import { getEnv } from "../../src/config/env.js";
import { registrarAcao } from "../../src/memory/acoes.js";
import { getConfig } from "../../src/memory/config.js";
import {
  marcarResumoEnviado,
  usuariosAtivosParaNudge,
  usuariosParaResumo,
} from "../../src/memory/context.js";
import {
  lembretesVencidos,
  listarEventos,
  marcarLembreteEnviado,
} from "../../src/memory/eventos.js";
import { horaAgoraHHMM, horaBr, todayIsoDate, weekdayBr } from "../../src/util/datetime.js";
import { sendTextMessage } from "../../src/whatsapp/client.js";

/**
 * "Bom dia" diário (gatilho de hábito). Roda pela Vercel Cron (seg–sex, 8h BRT).
 * Envia SÓ para quem mandou mensagem nas últimas 24h (regra da janela de 24h da
 * Meta) e está com o nudge ligado. Protegido pelo CRON_SECRET.
 *
 * IMPORTANTE: isto NÃO recupera quem sumiu (fora da janela de 24h) — é para
 * manter o hábito de quem já está ativo.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const env = getEnv();

    const auth = request.headers.get("authorization");

    // Duas funções no mesmo endpoint (limite de 12 funções serverless do Hobby):
    //   ?acao=lembretes  → dispara lembretes vencidos (chamado 1×/min pelo pg_cron
    //                      do Supabase; autentica pelo token do banco OU pelo
    //                      CRON_SECRET — p/ teste manual).
    //   (padrão)         → "bom dia" diário (Vercel Cron, 1×/dia; CRON_SECRET).
    const acao = new URL(request.url).searchParams.get("acao");
    if (acao === "lembretes") {
      const token = await getConfig("cron_lembretes_token").catch(() => null);
      const okCron = !!env.CRON_SECRET && auth === `Bearer ${env.CRON_SECRET}`;
      const okToken = !!token && auth === `Bearer ${token}`;
      if (!okCron && !okToken) return new Response("Unauthorized", { status: 401 });
      // Tique de minuto: dispara lembretes vencidos E os resumos diários no
      // horário escolhido por cada usuário.
      const lemb = await dispararLembretes();
      const res = await dispararResumos();
      return new Response(JSON.stringify({ ok: true, lembretes: lemb, resumos: res }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // "Bom dia": só a Vercel Cron (Authorization: Bearer CRON_SECRET).
    if (!env.CRON_SECRET) {
      return new Response("CRON_SECRET não configurado.", { status: 500 });
    }
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const usuarios = await usuariosAtivosParaNudge();
      const hoje = todayIsoDate();
      const dia = weekdayBr(hoje);
      let enviados = 0;

      for (const u of usuarios) {
        try {
          // Agenda de hoje (agenda interna da Rosana). Único "lembrete" viável
          // no cron diário do Hobby; não derruba o bom dia se falhar.
          let agendaBloco = "";
          try {
            const evs = await listarEventos(
              u.user_wa,
              `${hoje}T00:00:00-03:00`,
              `${hoje}T23:59:59-03:00`,
            );
            if (evs.length > 0) {
              const linhas = evs
                .map((e) => `• ${horaBr(e.inicio)} — ${e.titulo}${e.local ? ` (${e.local})` : ""}`)
                .join("\n");
              agendaBloco = `\n\n📅 *Sua agenda de hoje:*\n${linhas}`;
            }
          } catch (err) {
            console.error(
              `[bomdia] falha ao ler agenda de um usuário: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          await sendTextMessage(u.user_wa, montarBomDia(u.nome, dia, agendaBloco));
          enviados++;
        } catch (err) {
          console.error(
            `[bomdia] falha ao enviar para um usuário: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      console.log(`[bomdia] elegíveis=${usuarios.length} enviados=${enviados}`);
      return new Response(JSON.stringify({ ok: true, elegiveis: usuarios.length, enviados }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(`[bomdia] erro: ${err instanceof Error ? err.message : String(err)}`);
      return new Response("erro", { status: 500 });
    }
  },
};

/**
 * Dispara os lembretes VENCIDOS (de todos os usuários). Chamado de minuto em
 * minuto pelo pg_cron do Supabase. Só considera lembretes vencidos nas últimas
 * ~2h: se não entregou nesse prazo (ex.: fora da janela de 24h do WhatsApp),
 * para de tentar. Marca como enviado só em caso de sucesso.
 */
async function dispararLembretes(): Promise<{ vencidos: number; enviados: number }> {
  const agora = Date.now();
  const desde = new Date(agora - 2 * 60 * 60 * 1000).toISOString();
  const ate = new Date(agora).toISOString();

  let vencidos: Awaited<ReturnType<typeof lembretesVencidos>> = [];
  try {
    vencidos = await lembretesVencidos(desde, ate);
  } catch (err) {
    console.error(`[lembretes] erro ao buscar: ${err instanceof Error ? err.message : String(err)}`);
    return { vencidos: 0, enviados: 0 };
  }

  let enviados = 0;
  for (const ev of vencidos) {
    try {
      const corpo = `⏰ *Lembrete:* ${ev.titulo}` + (ev.local ? `\n📍 ${ev.local}` : "");
      await sendTextMessage(ev.user_wa, corpo);
      await marcarLembreteEnviado(ev.id);
      await registrarAcao(ev.user_wa, {
        tipo: "lembrete",
        titulo: ev.titulo,
        detalhe: ev.local,
        status: "entregue",
        ref: String(ev.id),
      });
      enviados++;
    } catch (err) {
      // Não marca como enviado: tenta de novo no próximo minuto (até sair da
      // janela de 2h). Pode falhar se o usuário estiver fora da janela de 24h.
      console.error(
        `[lembretes] falha ao enviar um lembrete: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (vencidos.length > 0) console.log(`[lembretes] vencidos=${vencidos.length} enviados=${enviados}`);
  return { vencidos: vencidos.length, enviados };
}

/**
 * Resumo diário ("bom dia" com a agenda de hoje) no HORÁRIO escolhido por cada
 * usuário (`resumo_hora`). Chamado a cada minuto; envia a quem já passou do
 * horário hoje e ainda não recebeu. Só dias úteis. Dedup por data (resumo_ultimo).
 */
async function dispararResumos(): Promise<{ elegiveis: number; enviados: number }> {
  const hoje = todayIsoDate();
  const dia = weekdayBr(hoje);
  if (dia === "sábado" || dia === "domingo") return { elegiveis: 0, enviados: 0 };

  let usuarios: Array<{ user_wa: string; nome: string }> = [];
  try {
    usuarios = await usuariosParaResumo(horaAgoraHHMM(), hoje);
  } catch (err) {
    console.error(`[resumo] erro ao buscar: ${err instanceof Error ? err.message : String(err)}`);
    return { elegiveis: 0, enviados: 0 };
  }

  let enviados = 0;
  for (const u of usuarios) {
    try {
      await sendTextMessage(u.user_wa, montarBomDia(u.nome, dia, await agendaDeHoje(u.user_wa, hoje)));
      await marcarResumoEnviado(u.user_wa, hoje);
      await registrarAcao(u.user_wa, {
        tipo: "resumo",
        titulo: "Resumo diário",
        detalhe: `Bom dia + agenda de ${dia}`,
        status: "entregue",
      });
      enviados++;
    } catch (err) {
      console.error(`[resumo] falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (usuarios.length > 0) console.log(`[resumo] elegiveis=${usuarios.length} enviados=${enviados}`);
  return { elegiveis: usuarios.length, enviados };
}

/** Bloco "Sua agenda de hoje" (vazio se não há eventos ou se falhar). */
async function agendaDeHoje(userWa: string, hoje: string): Promise<string> {
  try {
    const evs = await listarEventos(userWa, `${hoje}T00:00:00-03:00`, `${hoje}T23:59:59-03:00`);
    if (evs.length === 0) return "";
    const linhas = evs
      .map((e) => `• ${horaBr(e.inicio)} — ${e.titulo}${e.local ? ` (${e.local})` : ""}`)
      .join("\n");
    return `\n\n📅 *Sua agenda de hoje:*\n${linhas}`;
  } catch (err) {
    console.error(`[resumo] falha ao ler agenda: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

/** Mensagem curta, calorosa e útil — com um leve tempero pelo dia da semana. */
function montarBomDia(nome: string, dia: string, agendaBloco: string): string {
  const primeiro = nome.split(/\s+/)[0] || nome;
  const tempero =
    dia === "sexta-feira"
      ? "Sextou! 🎉 Bora fechar a semana."
      : dia === "segunda-feira"
        ? "Semana nova começando. 💪"
        : `Hoje é ${dia}.`;
  if (agendaBloco) {
    return `${primeiro}, bom dia! ${tempero}${agendaBloco}\n\nQuer que eu te ajude com mais alguma coisa? 👷`;
  }
  return (
    `${primeiro}, bom dia! ${tempero}\n\n` +
    "Como posso te ajudar hoje? Quer ver sua *agenda de hoje* ou suas *pendências*? " +
    "É só me falar. 👷"
  );
}
