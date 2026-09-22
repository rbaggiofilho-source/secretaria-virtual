import { getEnv } from "../../src/config/env.js";
import { limparMensagensProcessadas, usuariosAtivosParaNudge } from "../../src/memory/context.js";
import { todayIsoDate, weekdayBr } from "../../src/util/datetime.js";
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

    try {
      const usuarios = await usuariosAtivosParaNudge();
      const dia = weekdayBr(todayIsoDate());
      let enviados = 0;

      for (const u of usuarios) {
        try {
          await sendTextMessage(u.user_wa, montarBomDia(u.nome, dia));
          enviados++;
        } catch (err) {
          console.error(
            `[bomdia] falha ao enviar para um usuário: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      console.log(`[bomdia] elegíveis=${usuarios.length} enviados=${enviados}`);
      // Faxina diária: registros de dedup com mais de 30 dias não servem mais.
      await limparMensagensProcessadas(30);
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

/** Mensagem curta, calorosa e útil — com um leve tempero pelo dia da semana. */
function montarBomDia(nome: string, dia: string): string {
  const primeiro = nome.split(/\s+/)[0] || nome;
  const tempero =
    dia === "sexta-feira"
      ? "Sextou! 🎉 Bora fechar a semana."
      : dia === "segunda-feira"
        ? "Semana nova começando. 💪"
        : `Hoje é ${dia}.`;
  return (
    `${primeiro}, bom dia! ${tempero}\n\n` +
    "Como posso te ajudar hoje? Quer ver sua *agenda de hoje* ou suas *pendências*? " +
    "É só me falar. 👷"
  );
}
