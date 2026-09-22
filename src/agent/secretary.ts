import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env.js";
import type { OwnerContext, UsuarioRow } from "../memory/context.js";
import { buildSystemPromptParts } from "./system-prompt.js";
import { runTool, TOOLS, type ToolCtx } from "./tools.js";

/**
 * Loop de tool use com o Claude (Haiku mais recente por padrão).
 * Recebe a mensagem do usuário (texto já transcrito) + histórico + contexto,
 * executa as tool calls que o modelo pedir e devolve a resposta final em texto.
 *
 * Tem PRAZO: a função da Vercel morre em 60s. Antes de cada chamada ao Claude
 * confere o tempo restante; se não dá mais, encerra dizendo o que JÁ foi feito
 * (antes a função era morta no meio e o usuário ficava sem resposta nenhuma).
 */

const MAX_TURNS = 6; // guarda contra loop infinito de tool use
/** Margem mínima para mais uma chamada ao Claude + envio da resposta. */
const MARGEM_CHAMADA_MS = 12_000;

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: getEnv().ANTHROPIC_API_KEY,
      // Timeout por chamada (ms) e só 1 retry: 2 retries × 10 min estourariam
      // qualquer prazo da função serverless.
      timeout: 20_000,
      maxRetries: 0, // retry decidido por chamada, conforme o tempo restante
    });
  }
  return anthropic;
}

/** Rótulos amigáveis das ações, para o resumo quando o prazo estoura. */
const ROTULO_ACAO: Record<string, string> = {
  create_calendar_event: "criei o compromisso na agenda",
  update_calendar_event: "atualizei o compromisso na agenda",
  save_memory: "anotei na memória",
  atualizar_memoria: "atualizei a memória",
  concluir_pendencia: "marquei a pendência como concluída",
  registrar_custo: "lancei o custo",
  registrar_rdo: "registrei o diário de obra",
  registrar_foto: "arquivei a foto",
  enviar_foto: "reenviei a foto",
  gerar_rdo_pdf: "enviei o PDF do diário",
  registrar_documento: "registrei o documento",
  registrar_material: "registrei o material",
  configurar_lembrete_diario: "ajustei o bom-dia",
  conectar_agenda: "enviei o link da agenda",
};

export async function runSecretary(params: {
  usuario: UsuarioRow;
  userText: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: OwnerContext;
  /** Imagens enviadas com a mensagem atual (foto de obra, nota fiscal, etc.). */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Caminhos das imagens já arquivadas no Storage, na ordem de `images`. */
  imagePaths?: string[];
  /** A mensagem atual veio de um áudio (foi transcrita antes de chegar aqui). */
  wasAudio?: boolean;
  /** Primeira interação deste usuário (sem histórico) — dispara onboarding. */
  primeiroContato?: boolean;
  /** Instante (epoch ms) até o qual a resposta precisa estar pronta. */
  prazo?: number;
  /** Mensagem atual CRUA (texto + tipo), para checagens no servidor. */
  mensagemAtual?: { texto: string; tipo: string; encaminhada?: boolean };
  /** Número para onde as mensagens extras (link, PDF, foto) são enviadas. */
  replyTo?: string;
}): Promise<string> {
  const env = getEnv();
  const client = getClient();
  const prazo = params.prazo ?? Date.now() + 50_000;
  // Quando a entrada veio de áudio, sinaliza para o modelo aplicar a seção
  // "Áudio e transcrição" do system prompt (modo comando vs. modo transcrição).
  const audioHint = params.wasAudio
    ? "\n\nA mensagem atual do usuário foi TRANSCRITA de um áudio. Aplique a " +
      'seção "Áudio e transcrição" para decidir entre AGIR sobre o pedido ou ' +
      "apenas devolver a transcrição."
    : "";
  // No primeiro contato (sem histórico), dispara as boas-vindas guiadas da
  // seção "Primeiro acesso" — de forma determinística, sem depender do modelo
  // perceber que é a estreia.
  const onboardingHint =
    params.primeiroContato && !params.usuario.dono
      ? "\n\nESTA É A PRIMEIRA MENSAGEM deste usuário (sem histórico). Conduza o " +
        'ONBOARDING da seção "Primeiro acesso e boas-vindas guiadas": apresente-se, ' +
        "diga em visão geral tudo que você faz, deixe claro que também ensina a te " +
        "usar (é só perguntar), proponha 2–3 primeiras ações com exemplo pronto, e " +
        "COMECE a conhecer o usuário com poucas perguntas (empresa, obras, fases, " +
        "responsáveis) — em CONVERSA, sem textão, salvando na memória o que aprender."
      : "";

  // Cache de prompt: tools + parte estática do system ficam no prefixo
  // cacheado; data/hora/memória (voláteis) vêm depois do ponto de cache.
  const partes = buildSystemPromptParts(params.context, params.usuario);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: partes.estatico, cache_control: { type: "ephemeral" } },
    { type: "text", text: partes.dinamico + audioHint + onboardingHint },
  ];

  // Monta o conteúdo da mensagem atual. Com imagem, usa blocos (visão);
  // sem imagem, mantém a string simples de sempre.
  const imgs = params.images ?? [];
  let currentContent: Anthropic.MessageParam["content"];
  if (imgs.length > 0) {
    const blocks: Anthropic.ContentBlockParam[] = imgs.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    }));
    blocks.push({
      type: "text",
      text: params.userText?.trim() ? params.userText : "(imagem enviada sem legenda)",
    });
    currentContent = blocks;
  } else {
    currentContent = params.userText;
  }

  // A janela de histórico pode começar numa fala da Rosana; a API exige que a
  // conversa comece pelo usuário.
  const historico = [...params.history];
  while (historico.length > 0 && historico[0]!.role !== "user") historico.shift();

  const messages: Anthropic.MessageParam[] = [
    ...historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentContent },
  ];

  // Contexto do turno passado às tools: fila de caminhos das imagens já
  // arquivadas (registrar_foto), mensagem crua (confirmações sensíveis) e o
  // número de resposta.
  const toolCtx: ToolCtx = {
    imagePaths: [...(params.imagePaths ?? [])],
    mensagemAtual: params.mensagemAtual,
    replyTo: params.replyTo,
  };
  const feitas: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const restante = prazo - Date.now();
    if (restante < MARGEM_CHAMADA_MS) return resumoPorPrazo(feitas);

    // O SDK repete a chamada após timeout/429/529: o tempo total pode chegar a
    // timeout × (retries+1). Só permite 1 retry se AMBAS as tentativas cabem
    // no prazo (sobrando margem para tools e para o envio da resposta).
    const util = restante - 8_000;
    const timeout = Math.max(5_000, Math.min(20_000, util));
    const response = await client.messages.create(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: 2048,
        system,
        tools: TOOLS,
        messages,
      },
      { timeout, maxRetries: util >= 2 * timeout ? 1 : 0 },
    );

    // Guarda o turno do assistente (com blocos de tool_use, se houver).
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      // Sem tempo para executar as ferramentas e ainda responder: para aqui.
      if (prazo - Date.now() < 8_000) return resumoPorPrazo(feitas);
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(
          params.usuario,
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
          toolCtx,
        );
        if (!result.isError && ROTULO_ACAO[tu.name]) feitas.push(ROTULO_ACAO[tu.name]!);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.text,
          is_error: result.isError,
        });
      }

      // Todos os resultados voltam numa única mensagem de user.
      messages.push({ role: "user", content: toolResults });
      continue; // deixa o modelo reagir aos resultados
    }

    // Sem mais tool use: extrai o texto final.
    const text = extractText(response);
    if (text) return text;

    // Resposta sem texto (raro): encerra com aviso.
    return feitas.length > 0 ? `Pronto: ${[...new Set(feitas)].join(", ")}.` : "Ok.";
  }

  // Estourou o limite de turnos — avisa em vez de silenciar.
  return (
    "Processei sua mensagem, mas precisei de muitos passos e parei por segurança." +
    (feitas.length > 0 ? ` Até aqui: ${[...new Set(feitas)].join(", ")}.` : "") +
    " Pode repetir o que faltou de forma mais direta?"
  );
}

/** Resposta quando o prazo da função está acabando: diz o que já foi feito. */
function resumoPorPrazo(feitas: string[]): string {
  const unicas = [...new Set(feitas)];
  return unicas.length > 0
    ? `Demorei mais que o normal e precisei parar no meio. Já fiz: ${unicas.join(", ")}. ` +
        "Me diga se ficou faltando algo que eu continuo."
    : "Demorei mais que o normal e não consegui concluir. Pode mandar de novo, de forma mais curta?";
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
