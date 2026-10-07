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
  periodoDias: number
  totais: {
    usuarios: number
    ativos: number
    inativos: number
    pendentes: number
    cancelados: number
    novos: number
    saidas: number
  }
  porPlano: { plano: string; total: number; ativos: number }[]
  porStatusAssinatura: { status: string; total: number }[]
  novosPorDia: { data: string; total: number }[]
  topConsumo: {
    nome: string | null
    email: string | null
    plano: string | null
    mensagens: number
    mensagens_mes: number
    custo_usd_mes: number
  }[]
  geo: { uf: string; total: number; ativos: number }[]
  cidades: { cidade: string; uf: string | null; total: number; ativos: number }[]
  profissoes: { profissao: string; total: number }[]
  uso: {
    usuariosComAtividade: number
    mediaMensagensMes: number
    mediaMensagensSemana: number
    mediaMensagensDia: number
    mediaDiasAtivosMes: number
  }
  mensagensTotais: number
  /** Custo REAL de IA+transcrição no mês (medido da API). */
  custoIaMesUsd: number
  /** Custo médio medido por mensagem (US$) — base da calculadora de planos. */
  custoMedioMensagemUsd: number
}
export function getOverview(periodoDias = 30) {
  return adminCall<{ ok: boolean; data: Overview }>(`/api/app/admin?recurso=overview&periodo=${periodoDias}`)
}

export interface UsuarioAdmin {
  user_wa: string
  nome: string | null
  email: string | null
  plano: string | null
  status: string | null
  assinatura_status: string | null
  profissao: string | null
  uf: string | null
  ativo: boolean
  dono: boolean
  criado_em: string | null
  assinatura_em: string | null
  mensagens: number
  mensagens_mes: number
  custo_usd_mes: number
  dias_ativos_30d: number
  mensagens_30d: number
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

export function setUsuarioPlano(user_wa: string, plano: string) {
  return adminCall<{ ok: boolean }>('/api/app/admin?acao=set-usuario-plano', {
    method: 'POST',
    body: JSON.stringify({ user_wa, plano }),
  })
}
/** Concede um pacote extra no mês (cortesia/venda manual). */
export function concederPacote(user_wa: string, pacote: string) {
  return adminCall<{ ok: boolean }>('/api/app/admin?acao=conceder-pacote', {
    method: 'POST',
    body: JSON.stringify({ user_wa, pacote }),
  })
}

export interface PlanoAdmin {
  id: string
  nome: string
  valor: number
  descricao: string | null
  ativo: boolean
  ordem: number
  limite_mensagens: number
  limite_fotos: number
  limite_audio_min: number
  /** null = ilimitado */
  limite_obras: number | null
}
export interface PacoteAdmin {
  id: string
  nome: string
  valor: number
}
export function getPlanosAdmin() {
  return adminCall<{ ok: boolean; planos: PlanoAdmin[]; pacotes: PacoteAdmin[] }>('/api/app/admin?recurso=planos')
}
export function salvarPlano(p: Partial<PlanoAdmin> & { id: string }) {
  return adminCall<{ ok: boolean; plano: PlanoAdmin }>('/api/app/admin?acao=set-plano', {
    method: 'POST',
    body: JSON.stringify(p),
  })
}

// ---------- Notas fiscais (NFS-e automática) ----------

export interface NotaFiscalAdmin {
  id: number
  mp_payment_id: string
  user_wa: string | null
  empresa_id: number | null
  origem: 'assinatura' | 'pacote'
  descricao: string
  valor: number
  status: 'pendente' | 'aguardando_emissor' | 'dados_faltando' | 'processando' | 'emitida' | 'erro'
  numero: string | null
  email_enviado: boolean | null
  erro: string | null
  created_at: string
  emitida_em: string | null
}
export function getNotasAdmin() {
  return adminCall<{ ok: boolean; emissorConfigurado: boolean; notas: NotaFiscalAdmin[] }>('/api/app/admin?recurso=notas')
}
export function reprocessarNota(id: number) {
  return adminCall<{ ok: boolean }>('/api/app/admin?acao=reprocessar-nota', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}
