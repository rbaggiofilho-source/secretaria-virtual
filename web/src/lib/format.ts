export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0)

/** Formata um valor grande de forma compacta: 284600 -> "R$ 284,6 mil". */
export function formatCurrencyShort(value: number): string {
  const v = value || 0
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return formatCurrency(v)
}

/** "2026-09-17" -> "17 set. 2026" (com "Hoje"/"Ontem" quando aplicável). */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const hoje = new Date()
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const ontem = new Date(hoje.getTime() - 86400000)
  const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
  const base = `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  if (dia(d) === dia(hoje)) return `Hoje, ${d.getDate()} ${meses[d.getMonth()]}`
  if (dia(d) === dia(ontem)) return `Ontem, ${d.getDate()} ${meses[d.getMonth()]}`
  return base
}

const CATEGORIA_LABEL: Record<string, string> = {
  material: 'Material',
  mao_de_obra: 'Mão de obra',
  equipamento: 'Equipamento',
  servico: 'Serviço',
  outro: 'Outro',
}
export const categoriaLabel = (c: string) => CATEGORIA_LABEL[c] ?? c

const CATEGORIA_COR: Record<string, string> = {
  material: '#c4763b',
  mao_de_obra: '#285b50',
  equipamento: '#d6aa73',
  servico: '#8da59e',
  outro: '#a0968a',
}
export const categoriaCor = (c: string) => CATEGORIA_COR[c] ?? '#a0968a'

const TIPO_DOC_LABEL: Record<string, string> = {
  alvara: 'Alvará',
  art: 'ART',
  rrt: 'RRT',
  aso: 'ASO',
  licenca: 'Licença',
  seguro: 'Seguro',
  contrato: 'Contrato',
  certidao: 'Certidão',
  outro: 'Documento',
}
export const tipoDocLabel = (t: string) => TIPO_DOC_LABEL[t] ?? t

const MATERIAL_STATUS: Record<string, string> = {
  a_comprar: 'A comprar',
  cotando: 'Cotando',
  comprado: 'Comprado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}
export const materialStatusLabel = (s: string) => MATERIAL_STATUS[s] ?? s

/** Ordem de exibição no mapa de cotações: EM ANDAMENTO (cotando) no topo, depois
 *  a iniciar (a comprar), e os concluídos/cancelados por último. */
const MATERIAL_STATUS_ORDEM: Record<string, number> = {
  cotando: 0,
  a_comprar: 1,
  comprado: 2,
  entregue: 3,
  cancelado: 4,
}
export const materialStatusOrdem = (s: string) => MATERIAL_STATUS_ORDEM[s] ?? 9

/** Categorias de insumo (derivadas do NOME do item, por palavras-chave). Serve
 *  pra agrupar/filtrar compras (ex.: fechar todo o EPI com um fornecedor). */
export const CATEGORIAS_MATERIAL: { id: string; label: string }[] = [
  { id: 'epi', label: 'EPI e segurança' },
  { id: 'eletrica', label: 'Elétrica' },
  { id: 'hidraulica', label: 'Hidráulica' },
  { id: 'estrutura', label: 'Estrutura / concreto' },
  { id: 'acabamento', label: 'Acabamento' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'madeira', label: 'Madeira / esquadrias' },
  { id: 'ferramentas', label: 'Ferramentas / equipamentos' },
  { id: 'outros', label: 'Outros' },
]
const CAT_LABEL = new Map(CATEGORIAS_MATERIAL.map((c) => [c.id, c.label]))
export const categoriaMaterialLabel = (id: string) => CAT_LABEL.get(id) ?? 'Outros'

// Palavras-chave por categoria (ordem importa: a 1ª que casar vence).
const CAT_KEYWORDS: [string, string[]][] = [
  ['epi', ['epi', 'capacete', 'luva', 'bota', 'botina', 'oculos', 'protetor', 'protecao', 'cinto', 'talabarte', 'colete', 'mascara', 'abafador', 'respirador', 'seguranca', 'extintor', 'sinalizac', 'cone', 'zebrada', 'cadeado', 'crachá', 'cracha']],
  ['eletrica', ['fio', 'cabo', 'disjuntor', 'tomada', 'interruptor', 'eletroduto', 'lampada', 'quadro', 'reator', 'luminaria', 'condulete', 'eletric', 'dps', 'haste', 'spot', 'led', 'soquete']],
  ['hidraulica', ['tubo', 'cano', 'pvc', 'cpvc', 'conexao', 'joelho', 'registro', 'torneira', 'caixa d', 'sifao', 'valvula', 'hidraul', 'esgoto', 'ralo', 'veda rosca', 'flange', 'curva', 'adaptador', 'bucha']],
  ['estrutura', ['cimento', 'areia', 'brita', 'pedra', 'vergalhao', 'aco ', 'aço', 'concreto', 'bloco', 'tijolo', 'ferro', 'arame', 'estribo', 'viga', 'pilar', 'laje', 'graute', 'cal ', 'argamassa estrut']],
  ['pintura', ['tinta', 'verniz', 'selador', 'acrilic', 'solvente', 'rolo', 'pincel', 'lixa', 'preparador', 'esmalte', 'textura']],
  ['acabamento', ['revestimento', 'piso', 'porcelanato', 'ceramic', 'rejunte', 'gesso', 'argamassa', 'massa corrida', 'drywall', 'placa', 'rodape', 'soleira', 'granito', 'marmore', 'forro', 'louça', 'louca', 'metais', 'cuba', 'bancada']],
  ['madeira', ['madeira', 'compensado', 'caibro', 'ripa', 'tabua', 'mdf', 'sarrafo', 'portal', 'batente', 'porta', 'janela', 'esquadria']],
  ['ferramentas', ['furadeira', 'serra', 'martelo', 'parafusadeira', 'broca', 'trena', 'nivel', 'esmerilhadeira', 'betoneira', 'andaime', 'escada', 'carrinho', 'balde', 'colher de pedreiro', 'desempenadeira']],
]

/** Deriva a categoria (id) de um material pelo nome. Sem match -> 'outros'. */
export function categoriaMaterial(item: string | null): string {
  const t = (item ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!t.trim()) return 'outros'
  for (const [id, kws] of CAT_KEYWORDS) {
    if (kws.some((k) => t.includes(k))) return id
  }
  return 'outros'
}
