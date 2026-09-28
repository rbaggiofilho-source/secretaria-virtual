/**
 * Cliente da API de ADMINISTRAÇÃO. Usa um token próprio (separado do token do
 * usuário do painel), guardado no localStorage sob outra chave. Fala com o
 * mesmo backend (/api/app/admin).
 */

const API_BASE = (
  import.meta.env.VITE_API_BASE ?? 'https://secretaria-virtual-seven.vercel.app'
).replace(/\/+$/, '')

const ADMIN_TOKEN_KEY = 'rosana.admin.token'

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null
  }
}
export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    /* storage bloqueado */
  }
}

async function adminCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken()
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

export interface Admin {
  email: string
  nome: string
}

export function adminBootstrap(email: string, token: string, senha: string, nome?: string) {
  return adminCall<{ ok: boolean; token: string; admin: Admin }>('/api/app/admin?acao=bootstrap', {
    method: 'POST',
    body: JSON.stringify({ email, token, senha, nome }),
  })
}
export function adminLogin(email: string, senha: string) {
  return adminCall<{ ok: boolean; token: string; admin: Admin }>('/api/app/admin?acao=login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  })
}
export function adminSession() {
  return adminCall<{ ok: boolean; admin: Admin }>('/api/app/admin?acao=session')
}
export function adminTrocarSenha(senhaAtual: string, novaSenha: string) {
  return adminCall<{ ok: boolean }>('/api/app/admin?acao=change-password', {
    method: 'POST',
    body: JSON.stringify({ senhaAtual, novaSenha }),
  })
}

export interface Overview {
  totais: {
    usuarios: number
    ativos: number
    pendentes: number
    cancelados: number
    novos30d: number
    saidas30d: number
  }
  porPlano: { plano: string; total: number; ativos: number }[]
  porStatusAssinatura: { status: string; total: number }[]
  novosPorDia: { data: string; total: number }[]
  topConsumo: { nome: string | null; email: string | null; mensagens: number }[]
  mensagensTotais: number
}
export function getOverview() {
  return adminCall<{ ok: boolean; data: Overview }>('/api/app/admin?recurso=overview')
}

export interface UsuarioAdmin {
  user_wa: string
  nome: string | null
  email: string | null
  plano: string | null
  status: string | null
  assinatura_status: string | null
  ativo: boolean
  dono: boolean
  criado_em: string | null
  assinatura_em: string | null
  mensagens: number
}
export function getUsuariosAdmin() {
  return adminCall<{ ok: boolean; usuarios: UsuarioAdmin[] }>('/api/app/admin?recurso=usuarios')
}
export function setUsuarioAtivo(user_wa: string, ativo: boolean) {
  return adminCall<{ ok: boolean }>('/api/app/admin?acao=set-usuario', {
    method: 'POST',
    body: JSON.stringify({ user_wa, ativo }),
  })
}

export interface PlanoAdmin {
  id: string
  nome: string
  valor: number
  descricao: string | null
  ativo: boolean
  ordem: number
}
export function getPlanosAdmin() {
  return adminCall<{ ok: boolean; planos: PlanoAdmin[] }>('/api/app/admin?recurso=planos')
}
export function salvarPlano(p: Partial<PlanoAdmin> & { id: string }) {
  return adminCall<{ ok: boolean; plano: PlanoAdmin }>('/api/app/admin?acao=set-plano', {
    method: 'POST',
    body: JSON.stringify(p),
  })
}
