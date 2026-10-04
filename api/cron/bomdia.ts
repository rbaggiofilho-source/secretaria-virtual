import { getEnv } from "../../src/config/env.js";
import { usuariosAtivosParaNudge } from "../../src/memory/context.js";
import {
  lembretesVencidos,
  listarEventos,
  marcarLembreteEnviado,
} from "../../src/memory/eventos.js";
import { horaBr, todayIsoDate, weekdayBr } from "../../src/util/datetime.js";
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

    // Proteção: só a Vercel Cron (que manda Authorization: Bearer CRON_SECRET).
    if (!env.CRON_SECRET) {
      return new Response("CRON_SECRET não configurado.", { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Duas funções no mesmo endpoint (limite de 12 funções serverless do Hobby):
    //   ?acao=lembretes  → dispara lembretes vencidos (chamado 1×/min pelo pg_cron)
    //   (padrão)         → "bom dia" diário (Vercel Cron, 1×/dia)
    const acao = new URL(request.url).searchParams.get("acao");
    if (acao === "lembretes") {
      return await dispararLembretes();
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
async function dispararLembretes(): Promise<Response> {
  const agora = Date.now();
  const desde = new Date(agora - 2 * 60 * 60 * 1000).toISOString();
  const ate = new Date(agora).toISOString();

  let vencidos: Awaited<ReturnType<typeof lembretesVencidos>> = [];
  try {
    vencidos = await lembretesVencidos(desde, ate);
  } catch (err) {
    console.error(`[lembretes] erro ao buscar: ${err instanceof Error ? err.message : String(err)}`);
    return new Response("erro", { status: 500 });
  }

  let enviados = 0;
  for (const ev of vencidos) {
    try {
      const corpo = `⏰ *Lembrete:* ${ev.titulo}` + (ev.local ? `\n📍 ${ev.local}` : "");
      await sendTextMessage(ev.user_wa, corpo);
      await marcarLembreteEnviado(ev.id);
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
  return new Response(JSON.stringify({ ok: true, vencidos: vencidos.length, enviados }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
