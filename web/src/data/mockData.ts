export type ObraStatus = 'Em andamento' | 'Planejamento' | 'Em pausa'

export interface Obra {
  id: string
  nome: string
  local: string
  progresso: number
  status: ObraStatus
  orcamento: number
  gasto: number
  cor: string
}

export interface CategoriaCusto {
  nome: string
  valor: number
  cor: string
}

export interface Rdo {
  id: string
  data: string
  obra: string
  clima: 'Ensolarado' | 'Nublado' | 'Chuvoso'
  efetivo: number
  atividade: string
  status: 'Completo' | 'Rascunho'
}

export const obras: Obra[] = [
  { id: 'obra-01', nome: 'Residencial Aurora', local: 'Campinas, SP', progresso: 68, status: 'Em andamento', orcamento: 1850000, gasto: 1148200, cor: '#c4763b' },
  { id: 'obra-02', nome: 'Edifício Horizonte', local: 'São Paulo, SP', progresso: 42, status: 'Em andamento', orcamento: 3240000, gasto: 1275600, cor: '#497a6d' },
  { id: 'obra-03', nome: 'Casa Ipê', local: 'Valinhos, SP', progresso: 15, status: 'Planejamento', orcamento: 780000, gasto: 89400, cor: '#888f68' },
]

export const custos: CategoriaCusto[] = [
  { nome: 'Material', valor: 1268000, cor: '#c4763b' },
  { nome: 'Mão de obra', valor: 684300, cor: '#285b50' },
  { nome: 'Equipamento', valor: 311200, cor: '#d6aa73' },
  { nome: 'Serviço', valor: 249700, cor: '#8da59e' },
]

export const rdos: Rdo[] = [
  { id: 'RDO-184', data: 'Hoje, 17 set.', obra: 'Residencial Aurora', clima: 'Ensolarado', efetivo: 24, atividade: 'Concretagem da laje — bloco B', status: 'Completo' },
  { id: 'RDO-183', data: 'Ontem, 16 set.', obra: 'Edifício Horizonte', clima: 'Nublado', efetivo: 18, atividade: 'Instalações hidráulicas — 3º pav.', status: 'Completo' },
  { id: 'RDO-182', data: '15 set. 2026', obra: 'Residencial Aurora', clima: 'Chuvoso', efetivo: 12, atividade: 'Alvenaria e organização do canteiro', status: 'Completo' },
  { id: 'RDO-181', data: '14 set. 2026', obra: 'Casa Ipê', clima: 'Ensolarado', efetivo: 7, atividade: 'Locação e preparação do terreno', status: 'Rascunho' },
]

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
