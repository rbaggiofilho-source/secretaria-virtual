import type Anthropic from "@anthropic-ai/sdk";
import {
  createCalendarEvent,
  searchCalendarEvents,
  updateCalendarEvent,
  type CalendarAuth,
} from "../calendar/google.js";
import { oauthConfigured, signState } from "../oauth/google.js";
import { buildRdoPdf } from "../pdf/rdo.js";
import {
  sendDocumentMessage,
  sendImageMessage,
  sendTextMessage,
  uploadMedia,
} from "../whatsapp/client.js";
import {
  atualizarMemoria,
  buscarPrecosDoUsuario,
  concluirPendencia,
  consultarDocumentos,
  consultarFotos,
  consultarMateriais,
  consultarRDO,
  excluirDadosUsuario,
  getFoto,
  getOAuthToken,
  getPending,
  loadHistorySince,
  panoramaUsuario,
  registrarCusto,
  registrarDocumento,
  registrarFoto,
  registrarMaterial,
  registrarRDO,
  relatorioCustos,
  saveMemories,
  saveMemory,
  setDocumentoLembrete,
  setNudgeDiario,
  type CategoriaCusto,
  type Cotacao,
  type DocumentoRow,
  type EfetivoItem,
  type MaterialRow,
  type MaterialStatus,
  type TipoDocumento,
  type TipoFoto,
  type UsuarioRow,
} from "../memory/context.js";
import { downloadFoto } from "../memory/storage.js";
import { buscarObraPorNome } from "../memory/obras.js";
import { buscarPrecos } from "../precos/index.js";
import { getEnv } from "../config/env.js";
import { addDays, addMonths, daysBetween, formatDateBr, todayIsoDate, weekdayBr } from "../util/datetime.js";
import type { MemoryKind } from "../memory/supabase.js";

/**
 * Definição das tools que o Claude pode chamar (function calling) e o
 * dispatcher que as executa. Cada tool retorna string (vira tool_result).
 *
 * Falhas são capturadas e devolvidas como resultado com marcador de erro,
 * para que a secretária AVISE o dono em vez de descartar em silêncio.
 */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_calendar_event",
    description:
      "Cria um evento no calendário PESSOAL do usuário (sempre o pessoal, nunca calendário de empresa). Use datas em ISO 8601 com offset do fuso America/Sao_Paulo (ex.: 2026-08-15T09:00:00-03:00). Em caso de erro, avise o usuário.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do compromisso" },
        start_iso: { type: "string", description: "Início em ISO 8601 com offset" },
        end_iso: { type: "string", description: "Fim em ISO 8601 com offset" },
        location: { type: "string", description: "Endereço/local (opcional)" },
        description: { type: "string", description: "Detalhes (opcional)" },
        reminder_minutes: {
          type: "integer",
          description: "Minutos antes para lembrete (opcional)",
        },
      },
      required: ["title", "start_iso", "end_iso"],
      additionalProperties: false,
    },
  },
  {
    name: "update_calendar_event",
    description:
      "Atualiza um evento existente no calendário pessoal. Use search_calendar_events antes para obter o event_id.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "ID do evento a atualizar" },
        start_iso: { type: "string", description: "Novo início ISO 8601 (opcional)" },
        end_iso: { type: "string", description: "Novo fim ISO 8601 (opcional)" },
        title: { type: "string", description: "Novo título (opcional)" },
        location: { type: "string", description: "Novo local (opcional)" },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_calendar_events",
    description:
      "Busca eventos do calendário pessoal numa janela de tempo. Use antes de atualizar um evento existente.",
    input_schema: {
      type: "object",
      properties: {
        start_iso: { type: "string", description: "Início da janela ISO 8601" },
        end_iso: { type: "string", description: "Fim da janela ISO 8601" },
      },
      required: ["start_iso", "end_iso"],
      additionalProperties: false,
    },
  },
  {
    name: "revisar_conversa",
    description:
      "Recupera um trecho MAIOR do histórico de conversa de vocês (além das últimas mensagens que você já tem em contexto), para revisar o que foi conversado nos últimos dias. Use quando o usuário pedir para 'revisar a semana', 'ver o que a gente falou', 'o que ficou pendente', 'o que ainda não agendei'. Depois de ler, CRUZE com a agenda (search_calendar_events) e com as pendências salvas, e proponha/agende o que faltou. Informe quantos DIAS voltar (padrão 7, máx 30). NUNCA responda que 'só vê a sessão atual' — você consegue puxar os últimos dias aqui.",
    input_schema: {
      type: "object",
      properties: {
        dias: { type: "integer", description: "Dias a revisar (padrão 7, máx 30)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "dia_da_semana",
    description:
      "Retorna o dia da semana correto de uma data. Use SEMPRE que precisar dizer ou confirmar em que dia da semana cai uma data — você NÃO calcula dia da semana de cabeça com confiabilidade. Se o usuário disser/corrigir um dia da semana, confira aqui em vez de só concordar. Data em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data em YYYY-MM-DD" },
      },
      required: ["data"],
      additionalProperties: false,
    },
  },
  {
    name: "resolver_data",
    description:
      "Converte uma data FUTURA/relativa na data exata (YYYY-MM-DD) + dia da semana, calculada com precisão no servidor. Use SEMPRE que a data pedida estiver ALÉM dos próximos ~16 dias da tabela de referência, ou quando o usuário falar em deslocamento ('daqui a um mês', 'daqui 45 dias', 'daqui 3 semanas', 'daqui 2 meses', 'mês que vem'). Você NÃO calcula datas futuras de cabeça com confiabilidade — use esta ferramenta. Informe os deslocamentos a partir de hoje (dias, semanas e/ou meses); opcionalmente uma data-base YYYY-MM-DD (padrão = hoje). Depois use o YYYY-MM-DD retornado para montar o start_iso do evento.",
    input_schema: {
      type: "object",
      properties: {
        base: {
          type: "string",
          description: "Data-base YYYY-MM-DD (opcional; padrão = hoje)",
        },
        dias: { type: "integer", description: "Dias a somar (pode ser negativo)" },
        semanas: { type: "integer", description: "Semanas a somar (pode ser negativo)" },
        meses: { type: "integer", description: "Meses a somar (pode ser negativo)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "conectar_agenda",
    description:
      "Envia ao usuário um link para ele conectar a PRÓPRIA agenda do Google à Rosana (login/autorização Google). Use quando o usuário ainda não tem a agenda conectada e quer criar/ver compromissos, ou quando ele pedir para conectar/trocar a agenda (inclusive se pedir 'outro link' / 'de novo' — SEMPRE chame a tool de novo, nunca reaproveite um link anterior). O PRÓPRIO SISTEMA já envia o link numa mensagem separada; você NÃO deve escrever, copiar nem inventar a URL — só confirme em 1 frase que enviou.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "save_memory",
    description:
      "Salva memória de longo prazo (persiste no banco — o histórico de conversa NÃO é memória e some depois). kind: 'fato', 'obra', 'apelido', 'pendencia' ou 'preferencia'. Para pendências, informe 'obra' quando fizer sentido. Quando o usuário passar VÁRIOS itens de uma vez (ex.: uma lista de pendências), mande TODOS de uma vez no array 'itens' numa única chamada — não deixe nenhum de fora. Só confirme que salvou DEPOIS de chamar esta tool.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["fato", "obra", "apelido", "pendencia", "preferencia"],
          description: "Tipo (para um único item)",
        },
        content: { type: "string", description: "Conteúdo da memória (para um único item)" },
        obra: {
          type: "string",
          description: "Obra/local associado (opcional, útil em pendências)",
        },
        itens: {
          type: "array",
          description:
            "Vários itens de uma vez (use para listas — ex.: 6 pendências de uma obra). Quando presente, os campos avulsos acima são ignorados.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["fato", "obra", "apelido", "pendencia", "preferencia"],
              },
              content: { type: "string", description: "Conteúdo do item" },
              obra: { type: "string", description: "Obra/local associado (opcional)" },
            },
            required: ["kind", "content"],
            additionalProperties: false,
          },
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "resumo_geral",
    description:
      "Retorna TUDO que está salvo do usuário: fatos, obras, apelidos, preferências, pendências abertas, documentos/prazos, materiais/compras e a contagem de custos, fotos e RDOs. Use quando ele pedir para ver/exportar tudo que você tem guardado, um panorama geral, 'o que você sabe sobre mim/minhas obras', ou uma auditoria da memória. Apresente organizado por seção; some as contagens quando não houver itens.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "excluir_meus_dados",
    description:
      "Exclui PERMANENTEMENTE a conta e TODOS os dados do usuário (memória, obras, custos, RDO, documentos, materiais, fotos, agenda conectada e a autorização de acesso). Ação IRREVERSÍVEL (LGPD/direito ao esquecimento). Fluxo OBRIGATÓRIO: (1) quando o usuário pedir para excluir a conta/apagar os dados, PRIMEIRO explique o que será apagado e que é irreversível, e peça para ele digitar EXATAMENTE a frase: EXCLUIR MEUS DADOS; (2) só chame esta tool DEPOIS que ele enviar essa frase, passando-a em 'confirmacao'. Se ele não confirmou com a frase exata, NÃO chame — apenas peça a confirmação.",
    input_schema: {
      type: "object",
      properties: {
        confirmacao: {
          type: "string",
          description: "A frase de confirmação exata digitada pelo usuário (ex.: 'EXCLUIR MEUS DADOS').",
        },
      },
      required: ["confirmacao"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_memoria",
    description:
      "Atualiza uma memória que já existe, quando algo MUDOU (a obra passou de fase, trocou o responsável/empreiteiro, um dado ficou desatualizado). Use no lugar de save_memory para NÃO criar fatos contraditórios/duplicados. 'busca' = um trecho do conteúdo atual que identifica a memória (ex.: 'Catamarã'); 'novo_conteudo' = o texto completo e atualizado. Se não encontrar, a tool avisa — aí peça ao usuário para esclarecer qual item.",
    input_schema: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Trecho que identifica a memória a atualizar (ex.: 'Catamarã')" },
        novo_conteudo: { type: "string", description: "Novo conteúdo completo e atualizado" },
        kind: {
          type: "string",
          enum: ["fato", "obra", "apelido", "pendencia", "preferencia"],
          description: "Tipo da memória (opcional, ajuda a achar a certa)",
        },
      },
      required: ["busca", "novo_conteudo"],
      additionalProperties: false,
    },
  },
  {
    name: "concluir_pendencia",
    description:
      "Marca uma pendência como CONCLUÍDA/resolvida, para ela sair das listas. Use SEMPRE que o usuário disser que terminou/resolveu algo ('já paguei o Agibank', 'resolvido o problema do Nissan') — nunca diga que marcou como resolvido sem chamar esta tool. 'busca' = trecho que identifica a pendência.",
    input_schema: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Trecho que identifica a pendência (ex.: 'Agibank')" },
      },
      required: ["busca"],
      additionalProperties: false,
    },
  },
  {
    name: "configurar_lembrete_diario",
    description:
      "Liga ou desliga a mensagem de 'bom dia' diária (dias úteis de manhã, um lembrete pra ajudar). Use quando o usuário pedir para PARAR de receber ('não quero mensagem de bom dia', 'para de me mandar de manhã') → ativar=false; ou para VOLTAR a receber → ativar=true. Só existe liga/desliga por enquanto (o horário é fixo, manhã em dias úteis); se ele pedir outro horário/dia, explique que por ora é só de manhã nos dias úteis.",
    input_schema: {
      type: "object",
      properties: {
        ativar: { type: "boolean", description: "true = receber o bom dia; false = parar de receber" },
      },
      required: ["ativar"],
      additionalProperties: false,
    },
  },
  {
    name: "get_pending",
    description:
      "Lista as pendências abertas do usuário, opcionalmente filtradas por obra/local.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra/local (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_preco",
    description:
      "Consulta preços de insumos da construção civil para estimar orçamentos. Use quando o usuário perguntar quanto custa um material, ou pedir um orçamento/estimativa (ex.: 'quanto tá o saco de cimento?', 'me faz um orçamento pra levantar uma parede'). Passe o termo do material ('cimento CP II', 'vergalhão 10mm', 'tijolo 6 furos', 'tinta acrílica'). Retorna DOIS blocos: 'seus_precos' = preços REAIS que ESTE usuário já pagou/cotou no histórico dele (PREFIRA estes, citando fornecedor e quando); 'referencia' = MÉDIA DE MERCADO (estimativa, NÃO cotação real — sempre marque como estimativa e recomende validar). Você pode multiplicar pelo quantitativo para montar o orçamento.",
    input_schema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Material a buscar (ex.: 'cimento', 'vergalhão 10mm', 'tinta acrílica')" },
      },
      required: ["termo"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_custo",
    description:
      "Lança um custo/gasto numa OBRA (centro de custo). Use quando o usuário disser que pagou/gastou algo numa obra (ex.: 'paguei 3000 de pedreiro na CCC'). Valor em reais (número). categoria: material, mao_de_obra, equipamento, servico ou outro. data em YYYY-MM-DD só se ele mencionar um dia diferente de hoje.",
    input_schema: {
      type: "object",
      properties: {
        valor: { type: "number", description: "Valor em reais (ex.: 3000.50)" },
        obra: { type: "string", description: "Obra/centro de custo (use o apelido se houver)" },
        categoria: {
          type: "string",
          enum: ["material", "mao_de_obra", "equipamento", "servico", "outro"],
          description: "Categoria do gasto",
        },
        descricao: { type: "string", description: "Descrição curta (opcional)" },
        data: { type: "string", description: "Data do gasto em YYYY-MM-DD (opcional)" },
      },
      required: ["valor"],
      additionalProperties: false,
    },
  },
  {
    name: "relatorio_custos",
    description:
      "Gera o total de custos e a divisão por categoria, opcionalmente por obra e intervalo de datas. Use quando o usuário perguntar quanto gastou (ex.: 'quanto já gastei na CCC esse mês?'). Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_rdo",
    description:
      "Registra o Relatório Diário de Obra (RDO) de uma obra num dia, a partir do relato do usuário (geralmente um áudio no fim do dia). Extraia clima, efetivo (mão de obra por função), atividades executadas, ocorrências e materiais recebidos. Envie SEMPRE o conteúdo completo do dia — reenviar substitui o RDO daquele dia. data em YYYY-MM-DD só se ele mencionar outro dia que não hoje. Se a obra não estiver clara, pergunte antes.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra do relatório (use o apelido se houver)" },
        data: { type: "string", description: "Data do RDO em YYYY-MM-DD (opcional, padrão hoje)" },
        clima: { type: "string", description: "Condições do tempo (opcional)" },
        efetivo: {
          type: "array",
          description: "Mão de obra presente por função",
          items: {
            type: "object",
            properties: {
              funcao: { type: "string", description: "Ex.: pedreiro, servente, carpinteiro" },
              qtd: { type: "integer", description: "Quantidade de pessoas nessa função" },
            },
            required: ["funcao", "qtd"],
            additionalProperties: false,
          },
        },
        atividades: { type: "string", description: "Atividades/serviços executados no dia" },
        ocorrencias: { type: "string", description: "Ocorrências, atrasos, problemas (opcional)" },
        materiais: { type: "string", description: "Materiais recebidos/entregas (opcional)" },
      },
      required: ["obra"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_rdo",
    description:
      "Consulta os RDOs registrados, por obra e/ou intervalo de datas. Use quando o usuário pedir o diário de uma obra ou um resumo do período. Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_foto",
    description:
      "Registra uma imagem que o usuário enviou (foto da obra ou nota fiscal). Você VÊ a imagem: gere uma descrição objetiva do que aparece. tipo: 'foto_obra' (andamento, serviço, problema) ou 'nota_fiscal'. Associe à obra (pergunte se não estiver claro). Se for NOTA FISCAL de um gasto de obra, ALÉM disso chame registrar_custo com o valor e itens lidos. data em YYYY-MM-DD só se diferente de hoje.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra associada (use o apelido se houver)" },
        tipo: {
          type: "string",
          enum: ["foto_obra", "nota_fiscal", "outro"],
          description: "Tipo da imagem",
        },
        descricao: { type: "string", description: "Descrição objetiva do que aparece na imagem" },
        data: { type: "string", description: "Data em YYYY-MM-DD (opcional)" },
      },
      required: ["descricao"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_fotos",
    description:
      "Lista o registro fotográfico (descrições), por obra, tipo e/ou intervalo de datas. Use quando o usuário perguntar o que foi fotografado/registrado numa obra. Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        tipo: {
          type: "string",
          enum: ["foto_obra", "nota_fiscal", "outro"],
          description: "Filtrar por tipo (opcional)",
        },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "enviar_foto",
    description:
      "Reenvia ao usuário uma FOTO/imagem que ele já mandou antes e que ficou arquivada. Use quando ele pedir para ver/reenviar uma foto ou nota fiscal específica (ex.: 'me manda de novo a foto da laje da CCC', 'reenvia aquela nota fiscal'). Primeiro use consultar_fotos para achar o id da imagem certa; depois chame enviar_foto com esse foto_id. O sistema envia a imagem no WhatsApp e você só confirma por texto.",
    input_schema: {
      type: "object",
      properties: {
        foto_id: { type: "integer", description: "id da foto (obtido em consultar_fotos)" },
      },
      required: ["foto_id"],
      additionalProperties: false,
    },
  },
  {
    name: "gerar_rdo_pdf",
    description:
      "Gera o PDF do Diário de Obra (RDO) de uma obra e ENVIA como documento no WhatsApp do usuário. Use quando ele(a) pedir o PDF/relatório do diário (ex.: 'me manda o PDF do diário da CCC desse mês'). Informe obra e, se ele delimitar, o período (desde/ate em YYYY-MM-DD). Depois de chamar, confirme por texto que o PDF foi enviado.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Obra do relatório (use o apelido se houver)" },
        desde: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
        ate: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
      },
      required: ["obra"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_documento",
    description:
      "Registra um DOCUMENTO ou PRAZO da obra (alvará, ART, RRT, ASO, licença ambiental, seguro, contrato, certidão, etc.) com sua data de vencimento. Use quando o usuário mencionar um documento com validade/prazo (ex.: 'o alvará da obra do centro vence em 10/12', 'ART protocolo 123 emitida hoje'). Extraia tipo, descrição, número (se houver), emissão e vencimento. Se houver vencimento e a agenda estiver conectada, o sistema cria automaticamente um LEMBRETE na agenda (por padrão 30 dias antes). Datas em YYYY-MM-DD. Se a obra não estiver clara, pergunte.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["alvara", "art", "rrt", "aso", "licenca", "seguro", "contrato", "certidao", "outro"],
          description: "Tipo do documento",
        },
        descricao: { type: "string", description: "Descrição curta do documento (ex.: 'Alvará de construção')" },
        obra: { type: "string", description: "Obra associada (use o apelido se houver)" },
        numero: { type: "string", description: "Número/protocolo do documento (opcional)" },
        emissao: { type: "string", description: "Data de emissão YYYY-MM-DD (opcional)" },
        vencimento: { type: "string", description: "Data de vencimento YYYY-MM-DD (opcional, mas recomendado)" },
        responsavel: { type: "string", description: "Responsável técnico/emissor (opcional)" },
        dias_antes_lembrete: {
          type: "integer",
          description: "Quantos dias antes do vencimento criar o lembrete na agenda (padrão 30)",
        },
      },
      required: ["descricao"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_documentos",
    description:
      "Lista os documentos/prazos da obra, com o status de cada um (vencido, vence em X dias, válido), do mais próximo do vencimento para o mais distante. Use quando o usuário perguntar sobre documentos, prazos, vencimentos, o que está para vencer, ou a situação de uma obra (ex.: 'o que vence esse mês?', 'quais documentos da CCC?'). Pode filtrar por obra e tipo.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        tipo: {
          type: "string",
          enum: ["alvara", "art", "rrt", "aso", "licenca", "seguro", "contrato", "certidao", "outro"],
          description: "Filtrar por tipo (opcional)",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "abrir_gps",
    description:
      "Gera um link de ROTA/GPS para o endereço de uma obra cadastrada. Use quando o usuário pedir para navegar/ir até uma obra (ex.: 'liga o gps pra Island', 'como chego na obra Aurora?', 'rota pro Edifício Belém'). Ache a obra pelo nome/apelido. O link abre uma página onde a pessoa escolhe Google Maps, Waze ou Apple Maps. Se a obra não tiver endereço cadastrado, avise e peça para cadastrar no painel.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Nome ou apelido da obra (ex.: 'Island', 'Aurora')" },
      },
      required: ["obra"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_material",
    description:
      "Registra ou atualiza um MATERIAL/compra de uma obra e suas cotações. É a mesma tool para todo o ciclo — chame de novo para o MESMO item+obra que ela atualiza (não duplica): 1) necessidade ('preciso de 100 sacos de cimento na obra do centro' → item, quantidade, unidade, obra); 2) cotações ('cotei o cimento: Votorantim 32 o saco, Cauê 30' → cotacoes=[{fornecedor,valor_unitario}]); 3) compra ('comprei o cimento da Cauê, 100 sacos a 30' → fornecedor, valor_unitario, status='comprado'; se ele quiser já lançar no custo da obra, passe lancar_custo=true); 4) entrega ('chegou o cimento' → status='entregue'). Use o MESMO nome de item nas chamadas seguintes. Datas em YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Nome do material (ex.: 'cimento CP-II', 'vergalhão 10mm')" },
        obra: { type: "string", description: "Obra associada (use o apelido se houver)" },
        quantidade: { type: "number", description: "Quantidade (opcional)" },
        unidade: { type: "string", description: "Unidade: saco, m³, kg, un, etc. (opcional)" },
        status: {
          type: "string",
          enum: ["a_comprar", "cotando", "comprado", "entregue", "cancelado"],
          description: "Situação do item (opcional; a tool infere quando não informado)",
        },
        fornecedor: { type: "string", description: "Fornecedor escolhido na compra (opcional)" },
        valor_unitario: { type: "number", description: "Valor unitário da compra (opcional)" },
        valor_total: { type: "number", description: "Valor total da compra (opcional; senão calcula qtd × unit)" },
        cotacoes: {
          type: "array",
          description: "Cotações a ANEXAR (comparação de fornecedores)",
          items: {
            type: "object",
            properties: {
              fornecedor: { type: "string", description: "Nome do fornecedor" },
              valor_unitario: { type: "number", description: "Preço unitário cotado" },
              obs: { type: "string", description: "Observação (prazo, condição, etc.)" },
            },
            required: ["fornecedor"],
            additionalProperties: false,
          },
        },
        previsao_entrega: { type: "string", description: "Previsão de entrega YYYY-MM-DD (opcional)" },
        data_compra: { type: "string", description: "Data da compra YYYY-MM-DD (opcional)" },
        observacoes: { type: "string", description: "Observações (opcional)" },
        lancar_custo: {
          type: "boolean",
          description: "Se true, também lança o valor no custo da obra (categoria material).",
        },
      },
      required: ["item"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_materiais",
    description:
      "Lista os materiais/compras de uma obra com a situação de cada um (a comprar, cotando, comprado, entregue) e as cotações. Use quando o usuário perguntar o que falta comprar, o andamento das compras, as cotações de um item, ou o que já chegou. Pode filtrar por obra e por status.",
    input_schema: {
      type: "object",
      properties: {
        obra: { type: "string", description: "Filtrar por obra (opcional)" },
        status: {
          type: "string",
          enum: ["a_comprar", "cotando", "comprado", "entregue", "cancelado"],
          description: "Filtrar por situação (opcional)",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

/**
 * Executa uma tool call. Retorna { text, isError }.
 * Nunca lança: erros viram tool_result com is_error para o modelo avisar o dono.
 */
export async function runTool(
  usuario: UsuarioRow,
  name: string,
  input: Record<string, unknown>,
  ctx?: { imagePaths?: string[] },
): Promise<{ text: string; isError: boolean }> {
  const userWa = usuario.user_wa;

  // Auth de calendário resolvida pelo SERVIDOR (nunca pelo modelo), sob demanda:
  // - OAuth: usuário conectou a própria conta Google -> escreve no "primary" dele;
  // - service + calendar_id: usuário compartilhou o calendário (legado);
  // - service + null (só dono): fallback GOOGLE_CALENDAR_ID (Ricardo);
  // - nenhum: SEM calendário — a tool avisa e oferece conectar, nunca cai no
  //   calendário de outra pessoa.
  let calAuthCache: { value: CalendarAuth | null } | undefined;
  async function resolveCalAuth(): Promise<CalendarAuth | null> {
    if (calAuthCache) return calAuthCache.value;
    let value: CalendarAuth | null = null;
    // O DONO escreve pela CONTA DE SERVIÇO (GOOGLE_CALENDAR_ID → a agenda pessoal
    // dele): esse caminho nunca expira. O refresh_token do OAuth em modo Testing
    // do Google morre a cada ~7 dias — era a causa de "a agenda vive
    // desconectando". Como a conta de serviço grava na MESMA agenda do dono, não
    // há motivo pra ele depender do OAuth. Beta (não-dono) usa OAuth próprio.
    if (usuario.dono) {
      value = { kind: "service", calendarId: usuario.calendar_id ?? null };
    } else {
      const tok = await getOAuthToken(userWa);
      if (tok) {
        value = { kind: "oauth", refreshToken: tok.refresh_token };
      } else if (usuario.calendar_id) {
        value = { kind: "service", calendarId: usuario.calendar_id };
      }
    }
    calAuthCache = { value };
    return value;
  }
  const SEM_CALENDARIO = JSON.stringify({
    ok: false,
    error:
      `A agenda do Google de ${usuario.nome} ainda não está conectada. ` +
      "Chame a tool conectar_agenda e envie o link para o usuário autorizar o acesso à agenda dele.",
  });

  try {
    switch (name) {
      case "revisar_conversa": {
        const dias =
          typeof input.dias === "number" && input.dias > 0 ? Math.min(input.dias, 30) : 7;
        const msgs = await loadHistorySince(userWa, dias);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            dias,
            total: msgs.length,
            aviso:
              msgs.length >= 300
                ? "Trecho no limite — pode haver mensagens ainda mais antigas fora deste recorte."
                : undefined,
            mensagens: msgs.map((m) => ({
              quando: m.created_at,
              quem: m.role === "user" ? "usuario" : "rosana",
              texto: m.content,
            })),
          }),
        };
      }

      case "dia_da_semana": {
        const data = String(input.data);
        const dia = weekdayBr(data);
        if (!dia) {
          return {
            isError: true,
            text: JSON.stringify({ ok: false, error: "Data inválida. Use YYYY-MM-DD." }),
          };
        }
        return { isError: false, text: JSON.stringify({ ok: true, data, dia_semana: dia }) };
      }

      case "resolver_data": {
        let base = input.base ? String(input.base) : todayIsoDate();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) base = todayIsoDate();
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
        let d = base;
        if (num(input.meses)) d = addMonths(d, num(input.meses));
        if (num(input.semanas)) d = addDays(d, num(input.semanas) * 7);
        if (num(input.dias)) d = addDays(d, num(input.dias));
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            base,
            data: d,
            dia_semana: weekdayBr(d),
            dias_a_partir_de_hoje: daysBetween(todayIsoDate(), d),
          }),
        };
      }

      case "conectar_agenda": {
        if (!oauthConfigured()) {
          return {
            isError: true,
            text: JSON.stringify({
              ok: false,
              error:
                "A conexão de agenda por OAuth ainda não está configurada no servidor. Avise o administrador.",
            }),
          };
        }
        // O SERVIDOR envia o link (não o modelo): a assinatura do state tem 43
        // caracteres aleatórios e o modelo corromperia ao transcrever de memória.
        // O state já é URL-safe (base64url + "."), então vai cru, sem encode.
        const url = `${getEnv().PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/oauth/start?s=${signState(userWa)}`;
        await sendTextMessage(
          userWa,
          "Para conectar sua agenda do Google, toque no link abaixo, escolha sua conta e autorize:\n\n" +
            url,
        );
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            enviado: true,
            instrucao:
              "O link JÁ FOI ENVIADO ao usuário numa mensagem separada. NÃO escreva/repita o link nem invente uma URL. Apenas confirme em 1 frase curta que enviou o link e que é só abrir, escolher a conta Google e autorizar (se aparecer aviso de app não verificado, tocar em Avançado → Continuar).",
          }),
        };
      }

      case "create_calendar_event": {
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
        const ev = await createCalendarEvent({
          title: String(input.title),
          startIso: String(input.start_iso),
          endIso: String(input.end_iso),
          location: input.location ? String(input.location) : undefined,
          description: input.description ? String(input.description) : undefined,
          reminderMinutes:
            typeof input.reminder_minutes === "number"
              ? input.reminder_minutes
              : undefined,
        }, calAuth);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            event_id: ev.id,
            title: ev.title,
            start: ev.start,
            end: ev.end,
            dia_semana: ev.start ? weekdayBr(ev.start) : null,
            link: ev.htmlLink,
          }),
        };
      }

      case "update_calendar_event": {
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
        const ev = await updateCalendarEvent({
          eventId: String(input.event_id),
          startIso: input.start_iso ? String(input.start_iso) : undefined,
          endIso: input.end_iso ? String(input.end_iso) : undefined,
          title: input.title ? String(input.title) : undefined,
          location: input.location ? String(input.location) : undefined,
        }, calAuth);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            event_id: ev.id,
            title: ev.title,
            start: ev.start,
            end: ev.end,
            dia_semana: ev.start ? weekdayBr(ev.start) : null,
          }),
        };
      }

      case "search_calendar_events": {
        const calAuth = await resolveCalAuth();
        if (!calAuth) return { isError: true, text: SEM_CALENDARIO };
        const events = await searchCalendarEvents(
          String(input.start_iso),
          String(input.end_iso),
          calAuth,
        );
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            events: events.map((e) => ({
              ...e,
              dia_semana: e.start ? weekdayBr(e.start) : null,
            })),
          }),
        };
      }

      case "save_memory": {
        // Lote: quando o usuário passa uma lista, salva TODOS de uma vez.
        if (Array.isArray(input.itens) && input.itens.length > 0) {
          const itens = (input.itens as unknown[]).map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            return {
              kind: o.kind as MemoryKind,
              content: String(o.content ?? ""),
              obra: o.obra ? String(o.obra) : null,
            };
          });
          const n = await saveMemories(userWa, itens);
          return { isError: false, text: JSON.stringify({ ok: true, salvos: n }) };
        }
        if (!input.content || !input.kind) {
          return {
            isError: true,
            text: JSON.stringify({
              ok: false,
              error: "Informe 'kind' e 'content' (ou uma lista em 'itens').",
            }),
          };
        }
        const row = await saveMemory(
          userWa,
          input.kind as MemoryKind,
          String(input.content),
          input.obra ? String(input.obra) : null,
        );
        return {
          isError: false,
          text: JSON.stringify({ ok: true, id: row.id, kind: row.kind }),
        };
      }

      case "resumo_geral": {
        const p = await panoramaUsuario(userWa);
        return { isError: false, text: JSON.stringify({ ok: true, ...p }) };
      }

      case "excluir_meus_dados": {
        // A conta do dono/administrador não é excluível por aqui (evita apagar
        // a conta-mãe por engano num teste).
        if (usuario.dono) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error:
                "A conta do administrador não pode ser excluída por este caminho.",
            }),
          };
        }
        // Confirmação literal obrigatória (normaliza acentos/caixa/espaços).
        const conf = String(input.confirmacao ?? "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();
        if (conf !== "EXCLUIR MEUS DADOS") {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              precisa_confirmar: true,
              error:
                "Confirmação ausente ou incorreta. NÃO exclua. Peça ao usuário para digitar EXATAMENTE: EXCLUIR MEUS DADOS",
            }),
          };
        }
        const r = await excluirDadosUsuario(userWa);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            excluido: true,
            registros_apagados: r.total,
            arquivos_apagados: r.arquivos,
          }),
        };
      }

      case "atualizar_memoria": {
        const row = await atualizarMemoria(
          userWa,
          String(input.busca),
          String(input.novo_conteudo),
          input.kind ? (input.kind as MemoryKind) : null,
        );
        if (!row) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              nao_encontrado: true,
              error:
                "Não achei uma memória que case com essa busca. Peça ao usuário para esclarecer qual item atualizar (ou salve como nova memória se for algo novo).",
            }),
          };
        }
        return {
          isError: false,
          text: JSON.stringify({ ok: true, id: row.id, kind: row.kind, atualizado: true }),
        };
      }

      case "concluir_pendencia": {
        const row = await concluirPendencia(userWa, String(input.busca));
        if (!row) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              nao_encontrado: true,
              error: "Não achei uma pendência aberta que case com essa busca. Confirme com o usuário qual é.",
            }),
          };
        }
        return {
          isError: false,
          text: JSON.stringify({ ok: true, id: row.id, concluida: true }),
        };
      }

      case "configurar_lembrete_diario": {
        const ativar = input.ativar === true;
        await setNudgeDiario(userWa, ativar);
        return { isError: false, text: JSON.stringify({ ok: true, nudge_diario: ativar }) };
      }

      case "get_pending": {
        const rows = await getPending(
          userWa,
          input.obra ? String(input.obra) : null,
        );
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            pendencias: rows.map((r) => ({
              id: r.id,
              content: r.content,
              obra: r.obra,
            })),
          }),
        };
      }

      case "consultar_preco": {
        const termo = String(input.termo);
        const seusPrecos = await buscarPrecosDoUsuario(userWa, termo, 6);
        const itens = buscarPrecos(termo, 8);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            // Preços REAIS que ESTE usuário já praticou. PREFIRA estes: são o
            // que ele de fato pagou/cotou. Cite fornecedor/data quando houver.
            seus_precos: seusPrecos.map((p) => ({
              item: p.item,
              unidade: p.unidade,
              obra: p.obra,
              preco: p.preco,
              fornecedor: p.fornecedor,
              origem: p.origem,
              quando: p.quando,
            })),
            // Base de REFERÊNCIA (média de mercado). Use como estimativa quando
            // não houver histórico do usuário, e sempre marque como estimativa.
            referencia: itens.map((p) => ({
              item: p.item,
              especificacao: p.especificacao,
              unidade: p.unidade,
              preco_medio: p.medio,
              faixa: { min: p.min, max: p.max },
              categoria: p.categoria,
              tipo: p.tipo,
            })),
          }),
        };
      }

      case "registrar_custo": {
        const row = await registrarCusto(userWa, {
          valor: Number(input.valor),
          obra: input.obra ? String(input.obra) : null,
          categoria: input.categoria
            ? (String(input.categoria) as CategoriaCusto)
            : undefined,
          descricao: input.descricao ? String(input.descricao) : null,
          data: input.data ? String(input.data) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            categoria: row.categoria,
            valor: row.valor,
            data: row.data,
          }),
        };
      }

      case "relatorio_custos": {
        const rel = await relatorioCustos(userWa, {
          obra: input.obra ? String(input.obra) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return { isError: false, text: JSON.stringify({ ok: true, ...rel }) };
      }

      case "registrar_rdo": {
        const efetivo = Array.isArray(input.efetivo)
          ? (input.efetivo as unknown[]).map((e) => {
              const o = (e ?? {}) as Record<string, unknown>;
              return { funcao: String(o.funcao ?? ""), qtd: Number(o.qtd ?? 0) } as EfetivoItem;
            })
          : undefined;
        const row = await registrarRDO(userWa, {
          obra: String(input.obra),
          data: input.data ? String(input.data) : null,
          clima: input.clima ? String(input.clima) : null,
          efetivo,
          atividades: input.atividades ? String(input.atividades) : null,
          ocorrencias: input.ocorrencias ? String(input.ocorrencias) : null,
          materiais: input.materiais ? String(input.materiais) : null,
        });
        const totalEfetivo = row.efetivo.reduce((s, e) => s + (Number(e.qtd) || 0), 0);
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            data: row.data,
            efetivo_total: totalEfetivo,
          }),
        };
      }

      case "consultar_rdo": {
        const rows = await consultarRDO(userWa, {
          obra: input.obra ? String(input.obra) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            rdos: rows.map((r) => ({
              data: r.data,
              obra: r.obra,
              clima: r.clima,
              efetivo: r.efetivo,
              atividades: r.atividades,
              ocorrencias: r.ocorrencias,
              materiais: r.materiais,
            })),
          }),
        };
      }

      case "registrar_foto": {
        // Liga a foto ao arquivo já arquivado no Storage (consumido da fila do
        // turno). Se não houver, salva só a descrição, como antes.
        const caminho =
          ctx?.imagePaths && ctx.imagePaths.length > 0 ? ctx.imagePaths.shift()! : null;
        const row = await registrarFoto(userWa, {
          obra: input.obra ? String(input.obra) : null,
          tipo: input.tipo ? (String(input.tipo) as TipoFoto) : undefined,
          descricao: input.descricao ? String(input.descricao) : null,
          data: input.data ? String(input.data) : null,
          caminho,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            obra: row.obra,
            tipo: row.tipo,
            data: row.data,
            arquivada: Boolean(caminho),
          }),
        };
      }

      case "consultar_fotos": {
        const rows = await consultarFotos(userWa, {
          obra: input.obra ? String(input.obra) : null,
          tipo: input.tipo ? (String(input.tipo) as TipoFoto) : null,
          desde: input.desde ? String(input.desde) : null,
          ate: input.ate ? String(input.ate) : null,
        });
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            fotos: rows.map((r) => ({
              id: r.id,
              data: r.data,
              obra: r.obra,
              tipo: r.tipo,
              descricao: r.descricao,
              arquivada: Boolean(r.caminho),
            })),
          }),
        };
      }

      case "enviar_foto": {
        const fotoId = Number(input.foto_id);
        const foto = await getFoto(userWa, fotoId);
        if (!foto) {
          return {
            isError: false,
            text: JSON.stringify({ ok: false, error: "Foto não encontrada." }),
          };
        }
        if (!foto.caminho) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error:
                "Essa foto foi registrada só com a descrição (sem arquivo guardado), então não dá para reenviar a imagem.",
            }),
          };
        }
        const { bytes, mimeType } = await downloadFoto(foto.caminho);
        const filename = `foto_${foto.id}.${mimeType.split("/")[1] ?? "jpg"}`;
        const mediaId = await uploadMedia(bytes, mimeType, filename);
        const caption = foto.descricao
          ? `${foto.descricao}${foto.obra ? ` — ${foto.obra}` : ""}`
          : undefined;
        await sendImageMessage(userWa, mediaId, caption);
        return {
          isError: false,
          text: JSON.stringify({ ok: true, enviado: true, id: foto.id }),
        };
      }

      case "gerar_rdo_pdf": {
        const obra = String(input.obra);
        const desde = input.desde ? String(input.desde) : null;
        const ate = input.ate ? String(input.ate) : null;
        const rdos = await consultarRDO(userWa, { obra, desde, ate });
        if (rdos.length === 0) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error: "Nenhum RDO encontrado para essa obra/período.",
            }),
          };
        }
        const periodoLabel =
          desde || ate ? `${desde ?? "início"} a ${ate ?? "hoje"}` : undefined;
        const bytes = await buildRdoPdf({ obra, rdos, periodoLabel });
        const slug = obra.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
        const filename = `RDO_${slug || "obra"}.pdf`;
        const mediaId = await uploadMedia(bytes, "application/pdf", filename);
        await sendDocumentMessage(userWa, mediaId, filename, `RDO — ${obra}`);
        return {
          isError: false,
          text: JSON.stringify({ ok: true, enviado: true, dias: rdos.length }),
        };
      }

      case "registrar_documento": {
        const vencimento = input.vencimento ? String(input.vencimento) : null;
        const doc = await registrarDocumento(userWa, {
          tipo: input.tipo ? (String(input.tipo) as TipoDocumento) : undefined,
          descricao: String(input.descricao),
          obra: input.obra ? String(input.obra) : null,
          numero: input.numero ? String(input.numero) : null,
          emissao: input.emissao ? String(input.emissao) : null,
          vencimento,
          responsavel: input.responsavel ? String(input.responsavel) : null,
        });

        // Cria o lembrete na agenda, se houver vencimento futuro e agenda conectada.
        let lembrete: string;
        if (!vencimento) {
          lembrete = "sem_vencimento";
        } else {
          const hoje = todayIsoDate();
          if (daysBetween(hoje, vencimento) < 0) {
            lembrete = "ja_vencido"; // não agenda lembrete para algo já vencido
          } else {
            const calAuth = await resolveCalAuth();
            if (!calAuth) {
              lembrete = "sem_agenda"; // registra o doc, mas não tem onde lembrar
            } else {
              const diasAntes =
                typeof input.dias_antes_lembrete === "number" && input.dias_antes_lembrete >= 0
                  ? input.dias_antes_lembrete
                  : 30;
              let quando = addDays(vencimento, -diasAntes);
              if (daysBetween(hoje, quando) < 0) quando = hoje; // não agenda no passado
              try {
                const ev = await createCalendarEvent(
                  {
                    title: `📄 ${doc.descricao} vence ${formatDateBr(vencimento)}`,
                    startIso: `${quando}T09:00:00-03:00`,
                    endIso: `${quando}T09:30:00-03:00`,
                    description:
                      `Documento: ${doc.descricao} (${doc.tipo})` +
                      (doc.obra ? `\nObra: ${doc.obra}` : "") +
                      (doc.numero ? `\nNº: ${doc.numero}` : "") +
                      (doc.responsavel ? `\nResponsável: ${doc.responsavel}` : "") +
                      `\nVencimento: ${formatDateBr(vencimento)}`,
                    reminderMinutes: 0,
                  },
                  calAuth,
                );
                await setDocumentoLembrete(userWa, doc.id, ev.id);
                lembrete = "agendado";
              } catch (e) {
                console.error(
                  `[documento] falha ao criar lembrete: ${e instanceof Error ? e.message : String(e)}`,
                );
                lembrete = "falha_lembrete";
              }
            }
          }
        }

        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: doc.id,
            tipo: doc.tipo,
            descricao: doc.descricao,
            obra: doc.obra,
            vencimento: doc.vencimento,
            lembrete,
          }),
        };
      }

      case "consultar_documentos": {
        const docs = await consultarDocumentos(userWa, {
          obra: input.obra ? String(input.obra) : null,
          tipo: input.tipo ? (String(input.tipo) as TipoDocumento) : null,
        });
        const hoje = todayIsoDate();
        const situacao = (d: DocumentoRow): string => {
          if (!d.vencimento) return "sem vencimento";
          const dias = daysBetween(hoje, d.vencimento);
          if (dias < 0) return `vencido há ${Math.abs(dias)} dia(s)`;
          if (dias === 0) return "vence hoje";
          return `vence em ${dias} dia(s)`;
        };
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            documentos: docs.map((d) => ({
              tipo: d.tipo,
              descricao: d.descricao,
              obra: d.obra,
              numero: d.numero,
              vencimento: d.vencimento,
              situacao: situacao(d),
            })),
          }),
        };
      }

      case "abrir_gps": {
        const termo = String(input.obra ?? "").trim();
        const obra = termo ? await buscarObraPorNome(userWa, termo) : null;
        if (!obra) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error: `Não encontrei uma obra cadastrada parecida com "${termo}". Confira o nome ou cadastre a obra no painel.`,
            }),
          };
        }
        if (!obra.endereco) {
          return {
            isError: false,
            text: JSON.stringify({
              ok: false,
              error: `A obra "${obra.nome}" ainda não tem endereço cadastrado. Peça para cadastrar o endereço no painel (Obras → editar).`,
            }),
          };
        }
        const WEB = "https://userosana.com.br";
        const link = `${WEB}/mapa?dest=${encodeURIComponent(obra.endereco)}&nome=${encodeURIComponent(obra.nome)}`;
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            obra: obra.nome,
            endereco: obra.endereco,
            link,
            instrucao:
              "Envie este link ao usuário (mande a URL como texto). Ao abrir, ele escolhe Google Maps, Waze ou Apple Maps para navegar.",
          }),
        };
      }

      case "registrar_material": {
        const novasCotacoes: Cotacao[] = Array.isArray(input.cotacoes)
          ? (input.cotacoes as unknown[]).map((c) => {
              const o = (c ?? {}) as Record<string, unknown>;
              return {
                fornecedor: String(o.fornecedor ?? ""),
                valor_unitario:
                  typeof o.valor_unitario === "number" ? o.valor_unitario : null,
                obs: o.obs ? String(o.obs) : null,
              } as Cotacao;
            })
          : [];

        const fornecedor = input.fornecedor ? String(input.fornecedor) : null;
        const valorUnitario =
          typeof input.valor_unitario === "number" ? input.valor_unitario : null;
        const valorTotal = typeof input.valor_total === "number" ? input.valor_total : null;
        const dataCompra = input.data_compra ? String(input.data_compra) : null;

        // Inferência simples de status (só avança): compra > cotação.
        let status = input.status ? (String(input.status) as MaterialStatus) : null;
        if (!status) {
          if (fornecedor && (valorUnitario != null || valorTotal != null || dataCompra)) {
            status = "comprado";
          } else if (novasCotacoes.length > 0) {
            status = "cotando";
          }
        }

        const row = await registrarMaterial(userWa, {
          item: String(input.item),
          obra: input.obra ? String(input.obra) : null,
          quantidade: typeof input.quantidade === "number" ? input.quantidade : null,
          unidade: input.unidade ? String(input.unidade) : null,
          status,
          fornecedor,
          valorUnitario,
          valorTotal,
          previsaoEntrega: input.previsao_entrega ? String(input.previsao_entrega) : null,
          dataCompra,
          observacoes: input.observacoes ? String(input.observacoes) : null,
          novasCotacoes,
        });

        // Opcional: lançar no custo da obra (categoria material).
        let custoLancado = false;
        if (input.lancar_custo === true && row.valor_total != null) {
          await registrarCusto(userWa, {
            valor: Number(row.valor_total),
            obra: row.obra,
            categoria: "material",
            descricao: [row.quantidade, row.unidade, row.item].filter(Boolean).join(" ").trim(),
            data: row.data_compra,
          });
          custoLancado = true;
        }

        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            id: row.id,
            item: row.item,
            obra: row.obra,
            status: row.status,
            quantidade: row.quantidade,
            unidade: row.unidade,
            valor_total: row.valor_total,
            cotacoes: row.cotacoes.length,
            custo_lancado: custoLancado,
          }),
        };
      }

      case "consultar_materiais": {
        const rows = await consultarMateriais(userWa, {
          obra: input.obra ? String(input.obra) : null,
          status: input.status ? (String(input.status) as MaterialStatus) : null,
        });
        const melhorCotacao = (m: MaterialRow) => {
          const validas = m.cotacoes.filter((c) => typeof c.valor_unitario === "number");
          if (validas.length === 0) return null;
          return validas.reduce((a, b) =>
            (a.valor_unitario ?? Infinity) <= (b.valor_unitario ?? Infinity) ? a : b,
          );
        };
        return {
          isError: false,
          text: JSON.stringify({
            ok: true,
            materiais: rows.map((m) => ({
              id: m.id,
              item: m.item,
              obra: m.obra,
              status: m.status,
              quantidade: m.quantidade,
              unidade: m.unidade,
              fornecedor: m.fornecedor,
              valor_unitario: m.valor_unitario,
              valor_total: m.valor_total,
              previsao_entrega: m.previsao_entrega,
              cotacoes: m.cotacoes,
              melhor_cotacao: melhorCotacao(m),
            })),
          }),
        };
      }

      default:
        return { isError: true, text: `Tool desconhecida: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Marcado como erro para o modelo AVISAR o dono (regra: nada em silêncio).
    return { isError: true, text: JSON.stringify({ ok: false, error: message }) };
  }
}
