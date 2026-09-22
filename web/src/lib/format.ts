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
