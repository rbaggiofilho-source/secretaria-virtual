import { runSecretary } from "./agent/secretary.js";
import { getEnv } from "./config/env.js";
import {
  appendConversation,
  getUsuario,
  loadOwnerContext,
  loadRecentHistory,
  type UsuarioRow,
} from "./memory/context.js";
import { convitePendente } from "./memory/empresa.js";
import { setConfig } from "./memory/config.js";
import { tratarConvite } from "./corp/convites.js";
import { resolverEscopoEngenheiro } from "./corp/escopo.js";
import { uploadFoto } from "./memory/storage.js";
import { custoAudioUsd, incrementarUso } from "./memory/uso.js";
import {
  avisoOitentaPorCento,
  menuPacotes,
  pacoteDoTexto,
  resolverDireito,
  saldoDoUsuario,
  temRecurso,
  textoLimite,
  type Direito,
  type Saldo,
} from "./pay/cota.js";
import { iniciarCompraPacote } from "./pay/pacotes.js";
import { PLANOS } from "./pay/planos.js";
import { transcribe } from "./stt/index.js";
import {
  downloadMedia,
  sendInteractiveButtons,
  sendTextMessage,
  type BotaoResposta,
} from "./whatsapp/client.js";
import { interactiveReplyText, type WhatsAppMessage } from "./whatsapp/types.js";

/**
 * Orquestra o fluxo ponta a ponta de UMA mensagem recebida:
 *   áudio? -> baixa mídia -> STT -> texto
 *   texto  -> usa direto
 *   carrega contexto/memória + histórico
 *   roda o agente (Claude + tools)
 *   persiste histórico
 *   responde no WhatsApp
 *
 * Cada etapa tem tratamento de erro para NÃO derrubar o processo e para
 * garantir que o dono seja avisado (nada é descartado em silêncio).
 */
export async function handleIncomingMessage(message: WhatsAppMessage): Promise<void> {
  const from = message.from;

  // Autorização: a tabela secretaria_usuarios é a fonte da verdade (uma linha
  // ativa = número autorizado). ALLOWED_WHATSAPP_NUMBER fica como rede de
  // segurança legada: se a tabela não tiver a linha mas a env bater, atende
  // como dono (evita lockout do Ricardo por falha de seed).
  let usuario: UsuarioRow | null = null;
  try {
    usuario = await getUsuario(from);
  } catch (err) {
    logError("buscar usuário", err);
  }

  // Convite corporativo PENDENTE intercepta tudo até ser respondido — o
  // engenheiro convidado ainda não é usuário autorizado, então isto vem ANTES
  // do portão de autorização. (Fase 1 da versão corporativa.)
  try {
    const pend = await convitePendente(from);
    if (pend) {
      const texto =
        message.type === "text"
          ? ((message as { text: { body: string } }).text.body ?? "")
          : message.type === "interactive"
            ? interactiveReplyText(message)
            : "";
      await tratarConvite(from, pend.membro, pend.empresa.nome, texto);
      return;
    }
  } catch (err) {
    logError("convite corporativo", err);
  }

  if (!usuario || !usuario.ativo) {
    const allowed = getEnv().ALLOWED_WHATSAPP_NUMBER;
    if (allowed && from === allowed) {
      usuario = {
        user_wa: from,
        nome: "Ricardo",
        calendar_id: null,
        contextos: null,
        profissao: null,
        dono: true,
        ativo: true,
        nudge_diario: true,
      };
    } else {
      console.warn(`Mensagem ignorada de número não autorizado: ${from}`);
      return;
    }
  }

  // Plano e saldo do mês. Falha aqui NUNCA trava o usuário (fail-open): sem
  // saldo, só não aplicamos limite nesta mensagem.
  let direito: Direito;
  try {
    direito = await resolverDireito(usuario);
  } catch (err) {
    logError("resolver plano", err);
    direito = { plano: PLANOS.construtora, ilimitado: true };
  }
  let saldo: Saldo | null = null;
  if (!direito.ilimitado) {
    try {
      saldo = await saldoDoUsuario(usuario, direito);
    } catch (err) {
      logError("ler uso do mês", err);
    }
  }

  // "PACOTE 100" etc.: gera o link de pagamento sem passar pela IA (funciona
  // mesmo com o limite estourado, que é justamente quando ele é usado).
  if (message.type === "text") {
    const pacoteId = pacoteDoTexto((message as { text: { body: string } }).text.body ?? "");
    if (pacoteId) {
      await responderPacote(from, usuario, direito, pacoteId);
      return;
    }
  }

  // Limite de mensagens do mês (limite do plano + pacotes extras).
  if (saldo && saldo.mensagens.restante <= 0) {
    await safeReply(from, textoLimite("mensagens", direito));
    return;
  }
  if (message.type === "image") {
    if (!temRecurso(direito, "fotos")) {
      await safeReply(from, textoLimite("fotos_fora_do_plano", direito));
      return;
    }
    if (saldo && saldo.fotos.restante <= 0) {
      await safeReply(from, textoLimite("fotos", direito));
      return;
    }
  }

  let userText: string;
  let audioSeg = 0;
  let images: Array<{ base64: string; mimeType: string }> = [];
  // Caminhos dos arquivos já arquivados no Storage (para o registrar_foto ligar
  // a foto ao arquivo). Vazio quando não há imagem ou o arquivamento falhou.
  const imagePaths: string[] = [];

  try {
    if (message.type === "audio") {
      const audioId = (message as { audio: { id: string } }).audio.id;
      console.log(`[audio] Baixando mídia ${audioId}...`);
      const { buffer, mimeType } = await downloadMedia(audioId);
      audioSeg = estimarDuracaoAudioSeg(buffer.length);
      if (saldo && saldo.audioSeg.restante < audioSeg) {
        await safeReply(from, textoLimite("audio", direito));
        return;
      }
      console.log(
        `[audio] Mídia baixada: ${buffer.length} bytes (${mimeType}, ~${audioSeg}s). Transcrevendo...`,
      );
      userText = await transcribe({ buffer, mimeType });
      // Nunca logamos o conteúdo transcrito (é dado do dono) — só o tamanho.
      console.log(`[audio] Transcrição concluída (${userText.length} caracteres).`);
    } else if (message.type === "image") {
      // Imagem (foto de obra / nota fiscal): baixa os bytes e manda para o
      // Claude com visão. A legenda da foto vira o texto do usuário.
      const img = (message as { image: { id: string; caption?: string } }).image;
      console.log(`[image] Baixando imagem ${img.id}...`);
      const { buffer, mimeType } = await downloadMedia(img.id);
      console.log(`[image] Imagem baixada: ${buffer.length} bytes (${mimeType}).`);
      images = [{ base64: buffer.toString("base64"), mimeType }];
      userText = img.caption ?? "";
      // Arquiva o arquivo no Storage (não crítico): se falhar, seguimos com a
      // visão/descrição normalmente, só sem guardar o arquivo.
      try {
        imagePaths.push(await uploadFoto(from, buffer, mimeType));
      } catch (err) {
        logError("arquivar imagem no Storage", err);
      }
    } else {
      userText = await resolveUserText(message);
    }
  } catch (err) {
    logError("resolver entrada (STT/imagem/tipo)", err);
    await safeReply(
      from,
      "Não consegui entender sua mensagem (falha ao processar o áudio/imagem). Pode mandar de novo, por favor?",
    );
    return;
  }

  if (!userText.trim() && images.length === 0) {
    await safeReply(from, "Recebi sua mensagem, mas veio vazia. Pode repetir?");
    return;
  }

  try {
    const [context, history, escopoEmpresa] = await Promise.all([
      loadOwnerContext(from),
      loadRecentHistory(from),
      resolverEscopoEngenheiro(from).catch(() => null),
    ]);

    const { text: resposta, consumo, botoes, sugestaoBotoes } = await runSecretary({
      usuario,
      userText,
      images,
      imagePaths,
      history,
      context,
      wasAudio: message.type === "audio",
      // Sem histórico = primeiro contato: dispara as boas-vindas guiadas.
      primeiroContato: history.length === 0,
      direito,
      escopoEmpresa,
    });

    // Uso do mês: conta a mensagem + custo REAL (tokens da API + STT). Não
    // crítico: falha aqui não impede a resposta.
    try {
      await incrementarUso(from, {
        mensagens: 1,
        fotos: images.length,
        audioSeg,
        chamadasIa: consumo.chamadas,
        tokensEntrada: consumo.tokensEntrada,
        tokensSaida: consumo.tokensSaida,
        tokensCacheLeitura: consumo.tokensCacheLeitura,
        tokensCacheEscrita: consumo.tokensCacheEscrita,
        custoUsd: consumo.custoUsd + (audioSeg ? custoAudioUsd(audioSeg) : 0),
      });
    } catch (err) {
      logError("registrar uso", err);
    }
    const aviso = saldo
      ? avisoOitentaPorCento(saldo.mensagens.usado, saldo.mensagens.usado + 1, saldo.mensagens.limite)
      : null;

    // Botões a enviar, por ordem de preferência (determinístico — não depende do
    // Haiku chamar enviar_opcoes):
    //  1) o que o modelo pediu explicitamente (enviar_opcoes);
    //  2) botões de início, se a mensagem é "o que você faz / por onde começo"
    //     ou é o 1º contato;
    //  3) botões de CONTINUAÇÃO sugeridos por uma ação concluída (criar evento,
    //     lançar custo, registrar RDO).
    const inicio =
      queremBotoesDeInicio(userText) || history.length === 0
        ? { body: "É só tocar pra começar 👇", opcoes: botoesIniciais(direito) }
        : null;
    const botoesFinais = botoes ?? inicio ?? sugestaoBotoes;

    // Persiste histórico (não crítico) e responde (crítico). Para imagem sem
    // legenda, registra um marcador legível no histórico.
    await appendConversation(
      from,
      "user",
      userText.trim() || (images.length ? "[imagem enviada]" : userText),
    );

    if (botoesFinais && botoesFinais.opcoes.length > 0) {
      // Resposta com botões. Pode vir TEXTO antes (ex.: explicação longa) +
      // a mensagem de botões (corpo curto). Evita duplicar se o texto for igual
      // ao corpo dos botões.
      const temTexto = resposta.trim() && resposta.trim() !== botoesFinais.body.trim();
      if (temTexto) {
        await appendConversation(from, "assistant", resposta);
        await sendTextMessage(from, resposta);
      }
      // Registro legível no histórico (p/ revisar_conversa).
      const marcador = `${botoesFinais.body}\n[opções: ${botoesFinais.opcoes.map((o) => o.title).join(" | ")}]`;
      await appendConversation(from, "assistant", marcador);
      await sendInteractiveButtons(from, botoesFinais.body, botoesFinais.opcoes);
      // Não perde o aviso de 80% da cota: vai numa mensagem curta à parte.
      if (aviso) await safeReply(from, aviso.trim());
    } else {
      // Sem botões nesta resposta: remove um "👇" solto no fim (o modelo às
      // vezes gesticula pra botões que não existem — ex.: quando há opções
      // demais pra caber em 3 botões e ele lista em texto).
      const limpa = resposta.replace(/\s*👇\s*$/u, "").trimEnd();
      await appendConversation(from, "assistant", limpa);
      await sendTextMessage(from, aviso ? limpa + aviso : limpa);
    }
  } catch (err) {
    logError("agente/calendar/resposta", err);
    // Diagnóstico da VISÃO: quando havia imagem, grava o erro exato (status +
    // mensagem da API, sem segredos nem conteúdo) numa chave de config que dá
    // pra ler do banco — a visão nunca foi testada em produção e falha de forma
    // genérica no WhatsApp. Não bloqueia a resposta ao usuário.
    if (images.length > 0) {
      try {
        const e = err as { status?: number; name?: string; message?: string };
        const tamKb = Math.round((images[0]?.base64.length ?? 0) * 0.75 / 1024);
        await setConfig(
          "ultimo_erro_visao",
          JSON.stringify({
            quando: new Date().toISOString(),
            status: e.status ?? null,
            nome: e.name ?? null,
            mensagem: (e.message ?? String(err)).slice(0, 600),
            mime: images[0]?.mimeType ?? null,
            imagem_kb: tamKb,
          }),
        );
      } catch (err2) {
        logError("gravar diagnóstico de visão", err2);
      }
    }
    await safeReply(
      from,
      "Tive um problema ao processar sua solicitação e talvez nada tenha sido agendado. Pode repetir a última mensagem?",
    );
  }
}

/** Converte a mensagem de texto em texto (áudio e imagem são tratados antes). */
async function resolveUserText(message: WhatsAppMessage): Promise<string> {
  if (message.type === "text") {
    return (message as { text: { body: string } }).text.body ?? "";
  }

  // Resposta a botão/lista interativa: tratamos o título escolhido como se o
  // usuário tivesse digitado aquele texto.
  if (message.type === "interactive") {
    const escolha = interactiveReplyText(message);
    if (escolha) return escolha;
    throw new Error("Mensagem interativa sem texto reconhecível");
  }

  // Tipos não suportados (documento, vídeo, etc.)
  throw new Error(`Tipo de mensagem não suportado: ${message.type}`);
}

/**
 * Duração aproximada de um áudio do WhatsApp pelo tamanho: nota de voz é
 * OGG/Opus a ~16 kbps ≈ 2 KB por segundo. Serve para a cota de áudio (a
 * API do WhatsApp não informa a duração no webhook).
 */
function estimarDuracaoAudioSeg(bytes: number): number {
  return Math.max(1, Math.round(bytes / 2000));
}

/** Responde a "PACOTE X": link de pagamento ou o motivo de não dar. */
async function responderPacote(
  from: string,
  usuario: UsuarioRow,
  direito: Direito,
  pacoteId: string,
): Promise<void> {
  try {
    const r = await iniciarCompraPacote(usuario, direito, pacoteId);
    if (r.ok) {
      await safeReply(
        from,
        `Aqui está o link para pagar o ${r.pacote.nome} (R$ ${r.pacote.valor.toFixed(2).replace(".", ",")}):\n${r.link}\n\nAssim que o pagamento for aprovado, o crédito entra na hora e eu te aviso.`,
      );
    } else if (r.motivo === "fora_do_plano") {
      await safeReply(from, textoLimite("fotos_fora_do_plano", direito));
    } else if (r.motivo === "pagamento_indisponivel") {
      await safeReply(
        from,
        "A compra de pacotes pelo WhatsApp ainda está sendo liberada. Já avisei o time da Rosana — eles vão falar com você para liberar o seu pacote.",
      );
      console.warn(`[pacotes] pedido de ${pacoteId} por ${from} sem Mercado Pago configurado`);
    } else {
      await safeReply(from, `Não reconheci esse pacote. Opções:\n\n${menuPacotes(direito)}`);
    }
  } catch (err) {
    logError("comprar pacote", err);
    await safeReply(from, "Não consegui gerar o link de pagamento agora. Pode tentar de novo em instantes?");
  }
}

/** Envia uma resposta sem deixar um erro de envio derrubar o handler. */
async function safeReply(to: string, body: string): Promise<void> {
  try {
    await sendTextMessage(to, body);
  } catch (err) {
    logError("envio de resposta de fallback", err);
  }
}

/** Normaliza p/ casar frase sem depender de acento/maiúscula. */
function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A mensagem é um pedido de "o que você faz / por onde começo"? Nesses momentos
 * oferecemos botões de início de forma DETERMINÍSTICA (não dependemos do modelo
 * chamar enviar_opcoes, que o Haiku às vezes ignora).
 */
function queremBotoesDeInicio(texto: string): boolean {
  const t = normaliza(texto).trim();
  if (t.length > 60) return false; // frases longas não são "o que você faz?"
  return (
    /\bo que (voce|vc)\b.*\b(faz|pode fazer|consegue|faria|sabe fazer)\b/.test(t) ||
    /\bme (diz|conta|fala|explica|mostra)\b.*\bo que\b.*\b(faz|pode)\b/.test(t) ||
    /\bpor onde\b.*\bcomec/.test(t) ||
    /\bcomo\b.*\bcomec/.test(t) ||
    /\b(quero|vamos|bora)\b.*\bcomec/.test(t) ||
    /\bme ajuda a comec/.test(t) ||
    /\bo que (voce|vc) (faz|pode)\b/.test(t)
  );
}

/** Botões de ação iniciais, respeitando o que o plano libera (máx 3). */
function botoesIniciais(direito: Direito): BotaoResposta[] {
  const b: BotaoResposta[] = [{ id: "ini_agenda", title: "Marcar compromisso" }];
  if (temRecurso(direito, "custos")) b.push({ id: "ini_custo", title: "Lançar um custo" });
  if (b.length < 3 && temRecurso(direito, "rdo")) b.push({ id: "ini_rdo", title: "Gravar o RDO" });
  if (b.length < 3 && temRecurso(direito, "fotos")) b.push({ id: "ini_foto", title: "Mandar nota fiscal" });
  return b.slice(0, 3);
}

function logError(step: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // Nunca logamos tokens ou conteúdo sensível — apenas etapa + mensagem de erro.
  console.error(`[pipeline] Erro em "${step}": ${message}`);
}
