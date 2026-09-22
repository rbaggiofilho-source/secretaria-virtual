import Anthropic from "@anthropic-ai/sdk";
import { runSecretary } from "./agent/secretary.js";
import { getEnv } from "./config/env.js";
import { consumirLimite } from "./auth/ratelimit.js";
import {
  adquirirTravaUsuario,
  appendConversation,
  canonicalWa,
  getUsuario,
  liberarTravaUsuario,
  loadOwnerContext,
  loadRecentHistory,
  registrarWaEnvio,
  type UsuarioRow,
} from "./memory/context.js";
import { uploadFoto } from "./memory/storage.js";
import { transcribe } from "./stt/index.js";
import { downloadMedia, sendTextMessage } from "./whatsapp/client.js";
import type { WhatsAppMessage } from "./whatsapp/types.js";

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
 * garantir que o usuário seja avisado (nada é descartado em silêncio).
 *
 * Duas identidades do número:
 *   - `from` (cru, como a Meta entregou) → usado para RESPONDER;
 *   - `wa` (canônico, ver canonicalWa) → chave dos DADOS em todas as tabelas.
 */

/** Limite da Vercel é 60s; o agente precisa responder antes disso. */
const PRAZO_PADRAO_MS = 45_000;
/** Claude aceita imagens de até ~5 MB. */
const MAX_IMAGEM_BYTES = 5 * 1024 * 1024;

const TIPOS_SEM_SUPORTE: Record<string, string> = {
  document:
    "Recebi um arquivo, mas ainda não consigo ler documentos (PDF, planilhas). Se for uma nota fiscal ou foto de obra, me manda como FOTO que eu leio. 📄",
  video: "Ainda não consigo assistir vídeos. 🎥 Se puder, me manda uma foto ou um áudio explicando.",
  sticker: "", // figurinha: ignora em silêncio
  reaction: "", // reação (👍): ignora em silêncio
  location:
    "Recebi a localização, mas ainda não consigo usá-la direto. Se for o endereço de uma obra, me escreve o endereço que eu anoto. 📍",
  contacts: "Recebi o contato, mas ainda não consigo salvá-lo sozinha. Me escreve nome e telefone que eu anoto. 👤",
};

export async function handleIncomingMessage(
  message: WhatsAppMessage,
  opts: { prazo?: number } = {},
): Promise<void> {
  const from = message.from;
  const wa = canonicalWa(from);
  const prazo = opts.prazo ?? Date.now() + PRAZO_PADRAO_MS;

  // Autorização: a tabela secretaria_usuarios é a fonte da verdade (uma linha
  // ativa = número autorizado). ALLOWED_WHATSAPP_NUMBER fica como rede de
  // segurança legada: se a tabela não tiver a linha mas a env bater, atende
  // como dono (evita lockout do Ricardo por falha de seed).
  let usuario: UsuarioRow | null = null;
  try {
    usuario = (await getUsuario(from)) ?? (from !== wa ? await getUsuario(wa) : null);
  } catch (err) {
    logError("buscar usuário", err);
  }
  if (!usuario || !usuario.ativo) {
    const allowed = getEnv().ALLOWED_WHATSAPP_NUMBER;
    if (allowed && (from === allowed || wa === canonicalWa(allowed))) {
      usuario = {
        user_wa: wa,
        nome: "Ricardo",
        calendar_id: null,
        contextos: null,
        profissao: null,
        dono: true,
        ativo: true,
        nudge_diario: true,
        wa_envio: null,
      };
    } else {
      console.warn("Mensagem ignorada de número não autorizado.");
      return;
    }
  }
  // Guarda a forma do número que a Meta ENTREGA (para mensagens que partem de
  // nós: código de login, "bom dia", aviso de agenda conectada).
  if (usuario.wa_envio !== from) await registrarWaEnvio(wa, from);
  // Dados SEMPRE pela chave canônica.
  usuario = { ...usuario, user_wa: wa };

  // Tipos sem suporte: resposta específica (antes: "falha ao processar o
  // áudio/imagem", que confundia). Reações/figurinhas são ignoradas.
  if (message.type !== "text" && message.type !== "audio" && message.type !== "image") {
    const aviso =
      TIPOS_SEM_SUPORTE[message.type] ??
      "Ainda não consigo ler esse tipo de mensagem. Pode me mandar em texto, áudio ou foto?";
    if (aviso) await safeReply(from, aviso);
    return;
  }

  // Uma mensagem por vez por usuário (áudio + foto seguidos não se cruzam).
  const travou = await adquirirTravaUsuario(wa, Math.max(0, Math.min(20_000, prazo - Date.now() - 30_000)));
  try {
    await processar(message, usuario, from, prazo);
  } finally {
    if (travou) await liberarTravaUsuario(wa);
  }
}

async function processar(
  message: WhatsAppMessage,
  usuario: UsuarioRow,
  from: string,
  prazo: number,
): Promise<void> {
  const wa = usuario.user_wa;
  let userText: string;
  let images: Array<{ base64: string; mimeType: string }> = [];
  // Caminhos dos arquivos já arquivados no Storage (para o registrar_foto ligar
  // a foto ao arquivo). Vazio quando não há imagem ou o arquivamento falhou.
  const imagePaths: string[] = [];

  try {
    if (message.type === "image") {
      // Imagem (foto de obra / nota fiscal): baixa os bytes e manda para o
      // Claude com visão. A legenda da foto vira o texto do usuário.
      const img = (message as { image: { id: string; caption?: string } }).image;
      console.log(`[image] Baixando imagem ${img.id}...`);
      const { buffer, mimeType } = await downloadMedia(img.id);
      console.log(`[image] Imagem baixada: ${buffer.length} bytes (${mimeType}).`);
      const mime = mimeType.split(";")[0]!.trim().toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
        await safeReply(from, "Não consegui abrir esse formato de imagem. Pode mandar como foto normal (JPG/PNG)?");
        return;
      }
      if (buffer.length > MAX_IMAGEM_BYTES) {
        await safeReply(from, "Essa imagem é grande demais pra eu ler (acima de 5 MB). Pode mandar de novo como foto comum do WhatsApp?");
        return;
      }
      images = [{ base64: buffer.toString("base64"), mimeType: mime }];
      userText = img.caption ?? "";
      // Arquiva o arquivo no Storage (não crítico): se falhar, seguimos com a
      // visão/descrição normalmente, só sem guardar o arquivo.
      try {
        imagePaths.push(await uploadFoto(wa, buffer, mime));
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
      message.type === "audio"
        ? "Não consegui entender o áudio (falha na transcrição). Pode mandar de novo ou escrever, por favor?"
        : "Não consegui abrir a imagem. Pode mandar de novo, por favor?",
    );
    return;
  }

  if (!userText.trim() && images.length === 0) {
    await safeReply(from, "Recebi sua mensagem, mas veio vazia. Pode repetir?");
    return;
  }

  let reply: string;
  try {
    const [context, history] = await Promise.all([
      loadOwnerContext(wa),
      loadRecentHistory(wa),
    ]);

    reply = await runSecretary({
      usuario,
      userText,
      images,
      imagePaths,
      history,
      context,
      wasAudio: message.type === "audio",
      // Sem histórico = primeiro contato: dispara as boas-vindas guiadas.
      primeiroContato: history.length === 0,
      prazo,
      mensagemAtual: {
        texto: userText,
        tipo: message.type,
        encaminhada: Boolean(
          (message as { context?: { forwarded?: boolean; frequently_forwarded?: boolean } }).context
            ?.forwarded ||
            (message as { context?: { frequently_forwarded?: boolean } }).context?.frequently_forwarded,
        ),
      },
      replyTo: from,
    });
  } catch (err) {
    logError("agente", err);
    await avisarFalhaIA(err);
    await safeReply(from, mensagemDeFalha(err));
    return;
  }

  // Persiste histórico (não crítico). Para imagem sem legenda, registra um
  // marcador legível no histórico.
  await appendConversation(
    wa,
    "user",
    userText.trim() || (images.length ? "[imagem enviada]" : userText),
  );
  await appendConversation(wa, "assistant", reply);

  // Envio da resposta: falha AQUI não significa que as ações falharam (o
  // agendamento/registro já foi feito). Antes, a mensagem de erro dizia
  // "talvez nada tenha sido agendado" e o usuário repetia → duplicava.
  try {
    await sendTextMessage(from, reply);
  } catch (err) {
    logError("envio da resposta", err);
    await safeReply(
      from,
      "Fiz o que você pediu, mas não consegui te mandar a resposta completa. Pergunte de novo que eu te mostro — não precisa repetir o pedido.",
    );
  }
}

/** Mensagem ao usuário conforme o tipo de falha do agente. */
function mensagemDeFalha(err: unknown): string {
  if (erroDeCreditoOuChave(err)) {
    return "Estou com uma instabilidade técnica agora e não consigo processar sua mensagem. Já avisei o responsável — tente de novo em alguns minutos. 🙏";
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return "Estou sobrecarregada neste momento. Pode repetir sua mensagem em um minutinho?";
  }
  return "Tive um problema ao processar sua solicitação. Algumas ações podem ter ficado pela metade — me pergunte o que ficou registrado antes de repetir.";
}

/** Crédito esgotado / chave inválida na Anthropic: tudo para até alguém agir. */
function erroDeCreditoOuChave(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return true;
  }
  return err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message);
}

/**
 * Avisa o dono (no máximo 1x a cada 3h) quando a IA está fora por crédito ou
 * chave — não há API de saldo, então este é o alarme.
 */
async function avisarFalhaIA(err: unknown): Promise<void> {
  if (!erroDeCreditoOuChave(err)) return;
  const dono = getEnv().ALLOWED_WHATSAPP_NUMBER;
  if (!dono) return;
  try {
    if (!(await consumirLimite("alerta_ia", 1, 3 * 60 * 60 * 1000))) return;
    await sendTextMessage(
      dono,
      "🚨 ALERTA: a IA da Rosana está recusando as chamadas (crédito esgotado ou chave inválida na Anthropic). " +
        "Os usuários estão recebendo aviso de instabilidade. Verifique o saldo/chave no console da Anthropic.",
    );
  } catch (e) {
    logError("alerta de falha da IA", e);
  }
}

/** Converte a mensagem em texto: usa o corpo (texto) ou transcreve (áudio). */
async function resolveUserText(message: WhatsAppMessage): Promise<string> {
  if (message.type === "text") {
    return (message as { text: { body: string } }).text.body ?? "";
  }

  if (message.type === "audio") {
    const audioId = (message as { audio: { id: string } }).audio.id;
    console.log(`[audio] Baixando mídia ${audioId}...`);
    const { buffer, mimeType } = await downloadMedia(audioId);
    console.log(
      `[audio] Mídia baixada: ${buffer.length} bytes (${mimeType}). Transcrevendo...`,
    );
    const text = await transcribe({ buffer, mimeType });
    // Nunca logamos o conteúdo transcrito (é dado do usuário) — só o tamanho.
    console.log(`[audio] Transcrição concluída (${text.length} caracteres).`);
    return text;
  }

  throw new Error(`Tipo de mensagem não suportado: ${message.type}`);
}

/** Envia uma resposta sem deixar um erro de envio derrubar o handler. */
async function safeReply(to: string, body: string): Promise<void> {
  try {
    await sendTextMessage(to, body);
  } catch (err) {
    logError("envio de resposta de fallback", err);
  }
}

function logError(step: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // Nunca logamos tokens ou conteúdo sensível — apenas etapa + mensagem de erro.
  console.error(`[pipeline] Erro em "${step}": ${message}`);
}
