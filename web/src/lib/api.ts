/**
 * Cliente da API da Rosana. A tela roda num domínio próprio e conversa com o
 * backend (funções /api/app/*) usando um token de sessão no header
 * Authorization: Bearer. O token fica no localStorage (por-dispositivo).
 *
 * A URL do backend vem de VITE_API_BASE (definida no build); em último caso cai
 * na URL de produção conhecida.
 */

const API_BASE = (
  import.meta.env.VITE_API_BASE ?? 'https://secretaria-virtual-seven.vercel.app'
).replace(/\/+$/, '')

const TOKEN_KEY = 'rosana.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* modo privado / storage bloqueado — segue sem persistir */
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = new Error(String(data.error ?? res.status)) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}

export interface Usuario {
  nome: string
  dono: boolean
  contextos: string | null
  profissao: string | null
}

export interface DashboardData {
  stats: {
    obrasAtivas: number
    custoTotal: number
    custoMes: number
    rdosMes: number
    prazosProximos: number
  }
  obras: Array<{
    nome: string
    gasto: number
    custos: number
    rdos: number
    ultimaAtividade: string | null
  }>
  custosPorCategoria: Array<{ categoria: string; valor: number }>
  custoTotal: number
  rdos: Array<{
    id: number
    data: string
    obra: string
    clima: string | null
    efetivo: number
    atividades: string | null
  }>
  documentosProximos: Array<{
    tipo: string
    descricao: string
    obra: string | null
    vencimento: string | null
  }>
  contadores: { fotos: number; materiais: number; pendencias: number }
}

/** Login por número do WhatsApp + senha. Devolve o token de sessão + usuário. */
export function login(whatsapp: string, senha: string) {
  return call<{ ok: boolean; token: string; usuario: Usuario }>('/api/app/auth?acao=login', {
    method: 'POST',
    body: JSON.stringify({ whatsapp, senha }),
  })
}

/** Pede um código pelo WhatsApp (usado para criar/redefinir a senha). */
export function requestCode(whatsapp: string) {
  return call<{ ok: boolean; nome?: string; error?: string }>('/api/app/auth?acao=request-code', {
    method: 'POST',
    body: JSON.stringify({ whatsapp }),
  })
}

/** Cria/redefine a senha com o código do WhatsApp. Já devolve a sessão. */
export function setPassword(whatsapp: string, code: string, senha: string) {
  return call<{ ok: boolean; token: string; usuario: Usuario }>('/api/app/auth?acao=set-password', {
    method: 'POST',
    body: JSON.stringify({ whatsapp, code, senha }),
  })
}

/** Confirma a sessão atual (token do localStorage). */
export function getSession() {
  return call<{ ok: boolean; usuario: Usuario }>('/api/app/auth?acao=session')
}

/** Carrega o panorama real do usuário logado. */
export function getDashboard() {
  return call<{ ok: boolean; data: DashboardData }>('/api/app/data?recurso=dashboard')
}

// ---------- Seções do painel ----------

export interface ObraResumo {
  nome: string
  gasto: number
  custos: number
  rdos: number
  materiais: number
  documentos: number
  fotos: number
  ultimaAtividade: string | null
}
export function getObras() {
  return call<{ ok: boolean; obras: ObraResumo[] }>('/api/app/data?recurso=obras')
}

export interface CustoItem {
  id: number
  obra: string | null
  categoria: string
  valor: number
  descricao: string | null
  data: string
}
export function getCustos(obra?: string) {
  const q = obra ? `&obra=${encodeURIComponent(obra)}` : ''
  return call<{ ok: boolean; total: number; porCategoria: Record<string, number>; itens: CustoItem[] }>(
    `/api/app/data?recurso=custos${q}`,
  )
}

export interface RdoItem {
  id: number
  data: string
  obra: string
  clima: string | null
  efetivo: Array<{ funcao: string; qtd: number }>
  atividades: string | null
  ocorrencias: string | null
  materiais: string | null
}
export function getRdos(obra?: string) {
  const q = obra ? `&obra=${encodeURIComponent(obra)}` : ''
  return call<{ ok: boolean; rdos: RdoItem[] }>(`/api/app/data?recurso=rdo${q}`)
}

export interface DocumentoItem {
  id: number
  obra: string | null
  tipo: string
  descricao: string
  numero: string | null
  emissao: string | null
  vencimento: string | null
  responsavel: string | null
  status: 'ativo' | 'arquivado'
}
export function getDocumentos() {
  return call<{ ok: boolean; documentos: DocumentoItem[] }>('/api/app/data?recurso=documentos')
}

export interface Cotacao {
  fornecedor: string
  valor_unitario: number | null
  obs?: string | null
}
export interface MaterialItem {
  id: number
  obra: string | null
  item: string
  quantidade: number | null
  unidade: string | null
  status: string
  fornecedor: string | null
  valor_unitario: number | null
  valor_total: number | null
  cotacoes: Cotacao[]
  previsao_entrega: string | null
  data_compra: string | null
  observacoes: string | null
}
export function getMateriais(obra?: string) {
  const q = obra ? `&obra=${encodeURIComponent(obra)}` : ''
  return call<{ ok: boolean; materiais: MaterialItem[] }>(`/api/app/data?recurso=materiais${q}`)
}

export interface FotoItem {
  id: number
  obra: string | null
  tipo: string
  descricao: string | null
  data: string
  url: string | null
}
export function getFotos() {
  return call<{ ok: boolean; fotos: FotoItem[] }>('/api/app/data?recurso=fotos')
}

/** Registra uma nova obra (memória kind='obra'). */
export function criarObra(nome: string) {
  return call<{ ok: boolean; criada: boolean }>('/api/app/data?recurso=obras', {
    method: 'POST',
    body: JSON.stringify({ nome }),
  })
}

/** Troca a senha estando logado (exige a senha atual). */
export function trocarSenha(senhaAtual: string, novaSenha: string) {
  return call<{ ok: boolean }>('/api/app/auth?acao=change-password', {
    method: 'POST',
    body: JSON.stringify({ senhaAtual, novaSenha }),
  })
}

/** Baixa o PDF do RDO de uma obra (fetch com token → download no navegador). */
export async function baixarRdoPdf(obra: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/app/rdo-pdf?obra=${encodeURIComponent(obra)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const err = new Error(String(res.status)) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `RDO-${obra.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
