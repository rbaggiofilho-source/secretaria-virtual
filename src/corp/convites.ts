import { ativarMembro } from "../memory/context.js";
import {
  canonWa,
  convidarMembro,
  responderConvite,
  type ConviteResultado,
  type EmpresaRow,
  type MembroRow,
} from "../memory/empresa.js";
import { waIdVariants } from "../memory/context.js";
import { sendInteractiveButtons, sendTextMessage } from "../whatsapp/client.js";

/**
 * Fluxo de CONVITE da versão corporativa (Fase 1): o admin convida um engenheiro
 * pelo número; a Rosana se apresenta e pede aceite com botões. O engenheiro
 * aceita (vira membro ativo e a Rosana passa a atendê-lo) ou recusa (agradece e
 * oferece o site). O tratamento do aceite/recusa fica no pipeline.
 */

const SITE_URL = "https://userosana.com.br";

const BOTOES_CONVITE = [
  { id: "conv_sim", title: "Aceitar" },
  { id: "conv_nao", title: "Agora não" },
];

function mensagemConvite(empresaNome: string): string {
  return (
    `Oi! Aqui é a *Rosana*, a secretária virtual de obras. 👷\n\n` +
    `Você foi convidado(a) a entrar na equipe da *${empresaNome}*. ` +
    `Se aceitar, eu passo a te ajudar no dia a dia da obra (agenda, custos, diário, fotos e mais) ` +
    `com o contexto que a empresa já montou pra você.\n\n` +
    `Posso te adicionar à equipe?`
  );
}

/**
 * Registra o convite (respeitando o teto do plano) e, se ok, envia a mensagem de
 * apresentação + botões. Manda para AS DUAS variantes do número (com/sem o nono
 * dígito) porque num convite "frio" não dá pra saber qual a Meta entrega — só uma
 * delas chega. Devolve o resultado do registro (ok / sem_vaga / ja_membro).
 */
export async function enviarConvite(
  empresa: EmpresaRow,
  wa: string,
  nome: string | null,
  cargo: string | null = null,
): Promise<ConviteResultado> {
  const r = await convidarMembro(empresa, wa, nome, cargo);
  if (!r.ok) return r;
  await mandarMensagemConvite(empresa.nome, wa);
  return r;
}

/**
 * Só ENVIA a mensagem de convite (botões) para as duas variantes do número.
 * Usado no RE-ENVIO (o membro já existe na tabela; só precisa receber de novo).
 */
export async function mandarMensagemConvite(empresaNome: string, wa: string): Promise<void> {
  const body = mensagemConvite(empresaNome);
  const destinos = [...new Set(waIdVariants(canonWa(wa)))];
  for (const dest of destinos) {
    try {
      await sendInteractiveButtons(dest, body, BOTOES_CONVITE);
    } catch (err) {
      console.error(`[convite] falha ao enviar para ${dest}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** Interpreta a resposta ao convite: aceitar / recusar / indefinido. */
function interpretarResposta(texto: string): "aceitar" | "recusar" | "indefinido" {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!t) return "indefinido";
  if (/\b(agora nao|depois|recus|nao quero|nao, |^nao$|nao obrigad)/.test(t)) return "recusar";
  if (/\b(aceit|sim|quero|bora|vamos|pode|entrar|topo|claro|ok)\b/.test(t)) return "aceitar";
  if (/\bnao\b/.test(t)) return "recusar";
  return "indefinido";
}

/**
 * Trata a resposta do engenheiro a um convite pendente. Chamado pelo pipeline
 * ANTES do fluxo normal (o convidado ainda não é usuário autorizado).
 */
export async function tratarConvite(
  from: string,
  membro: MembroRow,
  empresaNome: string,
  texto: string,
): Promise<void> {
  const decisao = interpretarResposta(texto);

  if (decisao === "aceitar") {
    await responderConvite(membro.id, true);
    await ativarMembro(from, membro.nome ?? "Colaborador");
    const primeiro = (membro.nome ?? "").trim().split(/\s+/)[0];
    await sendTextMessage(
      from,
      `${primeiro ? primeiro + ", que" : "Que"} bom ter você na equipe da *${empresaNome}*! 🎉\n\n` +
        `A partir de agora eu te ajudo com a agenda, os custos, o diário de obra (RDO), ` +
        `fotos e mais. Pode me mandar uma mensagem, um áudio ou uma foto quando precisar. ` +
        `Pra começar, me diga em qual obra você está hoje. 👷`,
    );
    return;
  }

  if (decisao === "recusar") {
    await responderConvite(membro.id, false);
    await sendTextMessage(
      from,
      `Tudo bem, obrigada pelo retorno! 🙏\n\n` +
        `Se quiser conhecer a Rosana (secretária virtual de obras por WhatsApp), ` +
        `dá uma olhada aqui: ${SITE_URL}\n\nQualquer coisa, é só chamar.`,
    );
    return;
  }

  // Resposta ambígua: repete o convite com os botões.
  await sendInteractiveButtons(
    from,
    `Só pra confirmar: você quer entrar na equipe da *${empresaNome}*?`,
    BOTOES_CONVITE,
  );
}
