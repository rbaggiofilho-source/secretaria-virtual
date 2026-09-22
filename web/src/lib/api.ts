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
  return call<{ ok: boolean; token: string; usuario: Usuario }>('/api/app/auth/login', {
    method: 'POST',
    body: JSON.stringify({ whatsapp, senha }),
  })
}

/** Pede um código pelo WhatsApp (usado para criar/redefinir a senha). */
export function requestCode(whatsapp: string) {
  return call<{ ok: boolean; nome?: string; error?: string }>('/api/app/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ whatsapp }),
  })
}

/** Cria/redefine a senha com o código do WhatsApp. Já devolve a sessão. */
export function setPassword(whatsapp: string, code: string, senha: string) {
  return call<{ ok: boolean; token: string; usuario: Usuario }>('/api/app/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ whatsapp, code, senha }),
  })
}

/** Confirma a sessão atual (token do localStorage). */
export function getSession() {
  return call<{ ok: boolean; usuario: Usuario }>('/api/app/session')
}

/** Carrega o panorama real do usuário logado. */
export function getDashboard() {
  return call<{ ok: boolean; data: DashboardData }>('/api/app/dashboard')
}
