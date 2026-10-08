import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Admin,
  adminBootstrap,
  adminLogin,
  adminSession,
  adminTrocarSenha,
  getAdminToken,
  setAdminToken,
  getOverview,
  getUsuariosAdmin,
  setUsuarioAtivo,
  setUsuarioPlano,
  concederPacote,
  getPlanosAdmin,
  salvarPlano,
  type Overview,
  type UsuarioAdmin,
  type PlanoAdmin,
  getNotasAdmin,
  reprocessarNota,
  type NotaFiscalAdmin,
} from '../lib/admin'
import { formatarBRL } from '../lib/api'
import { BrasilMapa } from '../components/BrasilMapa'
import '../styles/admin.css'

type Estado = { fase: 'checando' } | { fase: 'deslogado' } | { fase: 'logado'; admin: Admin }

function useNoindex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])
}

export function AdminApp() {
  useNoindex()
  const [estado, setEstado] = useState<Estado>({ fase: 'checando' })

  useEffect(() => {
    let vivo = true
    if (!getAdminToken()) { setEstado({ fase: 'deslogado' }); return }
    adminSession()
      .then((r) => { if (vivo) setEstado({ fase: 'logado', admin: r.admin }) })
      .catch(() => { setAdminToken(null); if (vivo) setEstado({ fase: 'deslogado' }) })
    return () => { vivo = false }
  }, [])

  if (estado.fase === 'checando') return <div className="adm"><div className="adm-login-wrap"><p style={{ color: '#90a69b' }}>Carregando…</p></div></div>
  if (estado.fase === 'deslogado') return <div className="adm"><AdminLogin onLogin={(admin) => setEstado({ fase: 'logado', admin })} /></div>
  return <div className="adm"><AdminDashboard admin={estado.admin} onLogout={() => { setAdminToken(null); setEstado({ fase: 'deslogado' }) }} /></div>
}

function AdminLogin({ onLogin }: { onLogin: (a: Admin) => void }) {
  const [modo, setModo] = useState<'login' | 'bootstrap'>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [token, setToken] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null); setLoading(true)
    try {
      const r = modo === 'login'
        ? await adminLogin(email, senha)
        : await adminBootstrap(email, token, senha, nome)
      setAdminToken(r.token)
      onLogin(r.admin)
    } catch (err) {
      const msg = (err as Error).message
      setErro(
        modo === 'login'
          ? 'E-mail ou senha incorretos.'
          : msg === 'token_invalido' ? 'Token de bootstrap incorreto.'
          : msg === 'bootstrap_desativado' ? 'Defina ADMIN_BOOTSTRAP_TOKEN na Vercel para criar o acesso.'
          : msg.includes('senha') ? msg : 'Não consegui criar o acesso. Confira os dados.',
      )
      setLoading(false)
    }
  }

  return (
    <div className="adm-login-wrap">
      <form className="adm-login" onSubmit={enviar}>
        <h1>Painel de <span style={{ color: '#57c99b' }}>controle</span></h1>
        <p className="sub">{modo === 'login' ? 'Acesso restrito à administração da Rosana.' : 'Primeiro acesso — crie seu login de administrador.'}</p>
        {erro && <p className="adm-erro">{erro}</p>}
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        {modo === 'bootstrap' && <label>Seu nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ricardo Baggio" /></label>}
        {modo === 'bootstrap' && <label>Token de bootstrap<input value={token} onChange={(e) => setToken(e.target.value)} placeholder="o valor de ADMIN_BOOTSTRAP_TOKEN" /></label>}
        <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="adm-btn" disabled={loading}>{loading ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Criar acesso'}</button>
        <p className="adm-link">
          {modo === 'login'
            ? <>Primeiro acesso? <button type="button" onClick={() => { setModo('bootstrap'); setErro(null) }}>Criar meu login</button></>
            : <>Já tem acesso? <button type="button" onClick={() => { setModo('login'); setErro(null) }}>Entrar</button></>}
        </p>
      </form>
    </div>
  )
}

type Aba = 'visao' | 'usuarios' | 'planos' | 'notas' | 'conta'

function AdminDashboard({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [aba, setAba] = useState<Aba>('visao')
  return (
    <>
      <div className="adm-top">
        <strong>Painel de <i>controle</i></strong>
        <span className="who">{admin.nome} · <button className="adm-link" style={{ display: 'inline' }} onClick={onLogout}><span style={{ color: '#57c99b', cursor: 'pointer' }}>sair</span></button></span>
      </div>
      <div className="adm-tabs">
        {([['visao', 'Visão geral'], ['usuarios', 'Usuários & mercado'], ['planos', 'Planos & lucro'], ['notas', 'Notas fiscais'], ['conta', 'Conta']] as [Aba, string][]).map(([id, label]) => (
          <button key={id} className={`adm-tab ${aba === id ? 'is-on' : ''}`} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      <div className="adm-main">
        {aba === 'visao' && <AbaVisao />}
        {aba === 'usuarios' && <AbaUsuarios />}
        {aba === 'planos' && <AbaPlanos />}
        {aba === 'notas' && <AbaNotas />}
        {aba === 'conta' && <AbaConta />}
      </div>
    </>
  )
}

/* ---------- utilidades de gráfico ---------- */

const PERIODOS: [number, string][] = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']]

function Segmentado({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <div className="adm-seg" role="tablist">
      {PERIODOS.map(([v, lbl]) => (
        <button key={v} role="tab" aria-selected={valor === v} className={valor === v ? 'on' : ''} onClick={() => onChange(v)}>{lbl}</button>
      ))}
    </div>
  )
}

/** Agrupa a série diária em barras legíveis: dia (≤31), senão semana/mês. */
function agregarSerie(serie: { data: string; total: number }[], periodo: number): { rotulo: string; total: number }[] {
  if (periodo <= 31) return serie.map((d) => ({ rotulo: d.data.slice(8, 10) + '/' + d.data.slice(5, 7), total: d.total }))
  if (periodo <= 90) {
    const out: { rotulo: string; total: number }[] = []
    for (let i = 0; i < serie.length; i += 7) {
      const bloco = serie.slice(i, i + 7)
      const total = bloco.reduce((s, d) => s + d.total, 0)
      out.push({ rotulo: bloco[0].data.slice(5), total })
    }
    return out
  }
  const meses = new Map<string, number>()
  for (const d of serie) {
    const k = d.data.slice(0, 7)
    meses.set(k, (meses.get(k) ?? 0) + d.total)
  }
  return [...meses.entries()].map(([k, total]) => ({ rotulo: k.slice(5) + '/' + k.slice(2, 4), total }))
}

/* ---------- Visão geral ---------- */

function AbaVisao() {
  const [periodo, setPeriodo] = useState(30)
  const [data, setData] = useState<Overview | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    getOverview(periodo)
      .then((r) => { if (vivo) { setData(r.data); setErro(false) } })
      .catch(() => { if (vivo) setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [periodo])

  const serie = useMemo(() => (data ? agregarSerie(data.novosPorDia, periodo) : []), [data, periodo])
  const maxDia = Math.max(1, ...serie.map((d) => d.total))
  const maxCusto = Math.max(0, ...(data?.topConsumo ?? []).map((c) => c.custo_usd_mes))
  const maxConsumo = Math.max(1, ...(data?.topConsumo ?? []).map((c) => c.mensagens))

  return (
    <>
      <div className="adm-head-row">
        <h1 className="adm-h1">Visão geral</h1>
        <Segmentado valor={periodo} onChange={setPeriodo} />
      </div>

      {erro && <p className="adm-erro">Não consegui carregar as métricas.</p>}
      {!data && !erro && <p style={{ color: '#90a69b' }}>Carregando métricas…</p>}

      {data && (
        <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
          <div className="adm-kpis">
            <div className="adm-kpi"><span>Usuários</span><strong>{data.totais.usuarios}</strong></div>
            <div className="adm-kpi good"><span>Ativos</span><strong>{data.totais.ativos}</strong></div>
            <div className="adm-kpi"><span>Inativos</span><strong>{data.totais.inativos}</strong></div>
            <div className="adm-kpi warn"><span>Pendentes</span><strong>{data.totais.pendentes}</strong></div>
            <div className="adm-kpi good"><span>Novos · {rotuloJanela(periodo)}</span><strong>{data.totais.novos}</strong></div>
            <div className="adm-kpi bad"><span>Saídas · {rotuloJanela(periodo)}</span><strong>{data.totais.saidas}</strong></div>
          </div>

          <div className="adm-card">
            <h2>Novos cadastros <small>· {rotuloJanela(periodo)}</small></h2>
            <div className="adm-spark" role="img" aria-label="Novos cadastros no período">
              {serie.map((d, i) => (
                <i key={i} style={{ height: `${(d.total / maxDia) * 100}%` }} title={`${d.rotulo}: ${d.total}`} />
              ))}
            </div>
          </div>

          <div className="adm-grid2">
            <div className="adm-card">
              <h2>Usuários por plano</h2>
              <div className="adm-bars">
                {data.porPlano.length === 0 && <p className="adm-vazio">Sem dados ainda.</p>}
                {data.porPlano.map((p) => (
                  <div className="adm-bar-row" key={p.plano}>
                    <span className="lbl">{p.plano}</span>
                    <div className="adm-bar" style={{ width: `${(p.total / Math.max(1, data.totais.usuarios)) * 100}%` }} title={`${p.ativos} ativos de ${p.total}`} />
                    <span className="val">{p.ativos}/{p.total}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="adm-card">
              <h2>Assinaturas por situação</h2>
              <div className="adm-bars">
                {data.porStatusAssinatura.length === 0 && <p className="adm-vazio">Sem dados ainda.</p>}
                {data.porStatusAssinatura.map((s) => (
                  <div className="adm-bar-row" key={s.status}>
                    <span className="lbl">{s.status}</span>
                    <div className="adm-bar alt" style={{ width: `${(s.total / Math.max(1, data.totais.usuarios)) * 100}%` }} />
                    <span className="val">{s.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="adm-card">
            <h2>Custo real de IA no mês <small>· medido da API (IA + transcrição), sem o dono: US$ {data.custoIaMesUsd.toFixed(2)}</small></h2>
            <div className="adm-bars">
              {data.topConsumo.length === 0 && <p className="adm-vazio">Sem atividade ainda.</p>}
              {data.topConsumo.map((c, i) => (
                <div className="adm-bar-row" key={i}>
                  <span className="lbl">{c.nome || c.email || '—'}{c.plano ? ` · ${c.plano}` : ''}</span>
                  <div className="adm-bar" style={{ width: `${(maxCusto > 0 ? c.custo_usd_mes / maxCusto : c.mensagens / maxConsumo) * 100}%` }} />
                  <span className="val">US$ {c.custo_usd_mes.toFixed(2)} · {c.mensagens_mes} msgs</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function rotuloJanela(p: number): string {
  return p >= 365 ? '12 meses' : `${p} dias`
}

/* ---------- Usuários & mercado ---------- */

const PACOTES_ADMIN = [
  { id: 'mensagens_100', nome: '+100 mensagens' },
  { id: 'mensagens_300', nome: '+300 mensagens' },
  { id: 'fotos_50', nome: '+50 fotos' },
  { id: 'audio_120', nome: '+2h de áudio' },
]

function planoAtual(plano: string | null): string {
  if (!plano) return ''
  if (plano === 'essencial') return 'obra'
  if (plano === 'profissional') return 'construtora'
  return plano
}

function statusPill(u: UsuarioAdmin) {
  if (u.ativo) return <span className="adm-pill on">ativo</span>
  if (u.assinatura_status === 'cancelled') return <span className="adm-pill off">cancelado</span>
  if (u.assinatura_status === 'pendente') return <span className="adm-pill pend">pendente</span>
  return <span className="adm-pill off">inativo</span>
}

function AbaUsuarios() {
  const [over, setOver] = useState<Overview | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null)
  const [erro, setErro] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [metrica, setMetrica] = useState<'total' | 'ativos'>('total')
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = () => { getUsuariosAdmin().then((r) => setUsuarios(r.usuarios)).catch(() => setErro(true)) }
  useEffect(() => {
    getOverview(30).then((r) => setOver(r.data)).catch(() => setErro(true))
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    if (!usuarios) return []
    const q = busca.trim().toLowerCase()
    return usuarios.filter((u) => {
      if (filtro === 'ativos' && !u.ativo) return false
      if (filtro === 'inativos' && u.ativo) return false
      if (!q) return true
      return [u.nome, u.email, u.user_wa, u.plano, u.profissao, u.uf].some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [usuarios, busca, filtro])

  async function alternar(u: UsuarioAdmin) {
    setSalvando(u.user_wa)
    try { await setUsuarioAtivo(u.user_wa, !u.ativo); carregar() } finally { setSalvando(null) }
  }
  async function trocarPlano(u: UsuarioAdmin, plano: string) {
    setSalvando(u.user_wa)
    try { await setUsuarioPlano(u.user_wa, plano); carregar() } finally { setSalvando(null) }
  }
  async function darPacote(u: UsuarioAdmin, pacote: string) {
    if (!pacote) return
    const nomePacote = PACOTES_ADMIN.find((p) => p.id === pacote)?.nome ?? pacote
    if (!window.confirm(`Conceder "${nomePacote}" para ${u.nome || u.user_wa} neste mês (sem cobrança)?`)) return
    setSalvando(u.user_wa)
    try { await concederPacote(u.user_wa, pacote); carregar() } finally { setSalvando(null) }
  }

  if (erro) return <p className="adm-erro">Não consegui carregar os dados.</p>

  const maxProf = Math.max(1, ...(over?.profissoes ?? []).map((p) => p.total))
  const maxCidade = Math.max(1, ...(over?.cidades ?? []).map((c) => c.total))

  return (
    <>
      <h1 className="adm-h1">Usuários &amp; mercado</h1>

      {/* Mapa + presença geográfica */}
      {over && (
        <div className="adm-grid-map">
          <div className="adm-card">
            <h2>Presença no Brasil <small>· por UF (DDD do número){metrica === 'ativos' ? ' · só ativos' : ''}</small>
              <span className="adm-seg mini" style={{ float: 'right' }}>
                <button className={metrica === 'total' ? 'on' : ''} onClick={() => setMetrica('total')}>Todos</button>
                <button className={metrica === 'ativos' ? 'on' : ''} onClick={() => setMetrica('ativos')}>Ativos</button>
              </span>
            </h2>
            <BrasilMapa dados={over.geo} metrica={metrica} />
          </div>

          <div className="adm-card">
            <h2>Estados com mais usuários</h2>
            <div className="adm-bars">
              {over.geo.length === 0 && <p className="adm-vazio">Nenhum número brasileiro identificado ainda.</p>}
              {over.geo.slice(0, 10).map((g) => (
                <div className="adm-bar-row" key={g.uf}>
                  <span className="lbl">{g.uf}</span>
                  <div className="adm-bar blue" style={{ width: `${(g.total / Math.max(1, over.geo[0]?.total ?? 1)) * 100}%` }} />
                  <span className="val">{g.ativos}/{g.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cidades/regiões + profissões */}
      {over && (
        <div className="adm-grid2">
          <div className="adm-card">
            <h2>Cidades / regiões <small>· aproximado pela praça do DDD</small></h2>
            <div className="adm-bars">
              {over.cidades.length === 0 && <p className="adm-vazio">Sem dados.</p>}
              {over.cidades.slice(0, 8).map((c) => (
                <div className="adm-bar-row wide" key={c.cidade}>
                  <span className="lbl" title={c.cidade}>{c.cidade}</span>
                  <div className="adm-bar blue" style={{ width: `${(c.total / maxCidade) * 100}%` }} />
                  <span className="val">{c.total}</span>
                </div>
              ))}
            </div>
            {over.cidades.length > 1 && (
              <p className="adm-nota">Mais usuários: <b>{over.cidades[0].cidade}</b> ({over.cidades[0].total}) · Menos: <b>{over.cidades[over.cidades.length - 1].cidade}</b> ({over.cidades[over.cidades.length - 1].total})</p>
            )}
          </div>

          <div className="adm-card">
            <h2>Quem usa a Rosana <small>· campo "profissão" (texto livre, agrupado)</small></h2>
            <div className="adm-bars">
              {over.profissoes.length === 0 && <p className="adm-vazio">Sem dados.</p>}
              {over.profissoes.slice(0, 8).map((p) => (
                <div className="adm-bar-row wide" key={p.profissao}>
                  <span className="lbl" title={p.profissao}>{p.profissao}</span>
                  <div className="adm-bar teal" style={{ width: `${(p.total / maxProf) * 100}%` }} />
                  <span className="val">{p.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tempo de uso (proxy) */}
      {over && (
        <div className="adm-card">
          <h2>Engajamento <small>· proxy por volume de mensagens e dias ativos (últimos 30 dias; {over.uso.usuariosComAtividade} usuário(s) com atividade)</small></h2>
          <div className="adm-kpis">
            <div className="adm-kpi"><span>Msgs / mês</span><strong>{over.uso.mediaMensagensMes.toFixed(0)}</strong></div>
            <div className="adm-kpi"><span>Msgs / semana</span><strong>{over.uso.mediaMensagensSemana.toFixed(1)}</strong></div>
            <div className="adm-kpi"><span>Msgs / dia</span><strong>{over.uso.mediaMensagensDia.toFixed(1)}</strong></div>
            <div className="adm-kpi"><span>Dias ativos / mês</span><strong>{over.uso.mediaDiasAtivosMes.toFixed(1)}</strong></div>
          </div>
          <p className="adm-nota">Não há cronômetro de sessão; medimos a <b>intensidade de uso</b> pelas mensagens trocadas e pelos dias em que o usuário falou com a Rosana.</p>
        </div>
      )}

      {/* Gestão de usuários */}
      <div className="adm-card">
        <div className="adm-head-row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Gestão de usuários {usuarios && <small>· {usuarios.length}</small>}</h2>
          <span className="adm-seg mini">
            {(['todos', 'ativos', 'inativos'] as const).map((f) => (
              <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </span>
        </div>
        <input className="adm-mini" style={{ width: '100%', height: 40, marginBottom: 12, boxSizing: 'border-box' }} placeholder="Buscar por nome, e-mail, número, plano, profissão, UF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {!usuarios ? <p style={{ color: '#90a69b' }}>Carregando usuários…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead><tr><th>Nome</th><th>Contato</th><th>UF</th><th>Profissão</th><th>Plano</th><th>Status</th><th>Msgs (mês)</th><th>Custo IA</th><th>Desde</th><th></th></tr></thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.user_wa}>
                    <td>{u.nome || '—'} {u.dono && <span className="adm-pill on">dono</span>}</td>
                    <td style={{ color: '#90a69b' }}>{u.email || u.user_wa}</td>
                    <td style={{ color: '#90a69b' }}>{u.uf || '—'}</td>
                    <td style={{ color: '#90a69b' }}>{u.profissao || '—'}</td>
                    <td>
                      {u.dono ? 'sem limite' : (
                        <select className="adm-mini" value={planoAtual(u.plano)} disabled={salvando === u.user_wa} onChange={(e) => trocarPlano(u, e.target.value)}>
                          {!u.plano && <option value="">beta (= construtora)</option>}
                          <option value="agenda">agenda</option>
                          <option value="obra">obra</option>
                          <option value="construtora">construtora</option>
                        </select>
                      )}
                    </td>
                    <td>{statusPill(u)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.mensagens_mes} <span style={{ color: '#90a69b' }}>/ {u.mensagens}</span></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>US$ {u.custo_usd_mes.toFixed(2)}</td>
                    <td style={{ color: '#90a69b' }}>{u.criado_em ? u.criado_em.slice(0, 10) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!u.dono && <button className="adm-mini" disabled={salvando === u.user_wa} onClick={() => alternar(u)}>{u.ativo ? 'Desativar' : 'Ativar'}</button>}
                      {!u.dono && (
                        <select className="adm-mini" style={{ marginLeft: 6 }} value="" disabled={salvando === u.user_wa} onChange={(e) => darPacote(u, e.target.value)}>
                          <option value="">+ pacote…</option>
                          {PACOTES_ADMIN.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/* ---------- Planos & lucro ---------- */

function AbaPlanos() {
  const [planos, setPlanos] = useState<PlanoAdmin[] | null>(null)
  const [over, setOver] = useState<Overview | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    getPlanosAdmin().then((r) => setPlanos(r.planos)).catch(() => setErro(true))
    getOverview(30).then((r) => setOver(r.data)).catch(() => { /* calculadora cai no padrão */ })
  }, [])
  if (erro) return <p className="adm-erro">Não consegui carregar os planos.</p>
  if (!planos) return <p style={{ color: '#90a69b' }}>Carregando planos…</p>
  return (
    <>
      <h1 className="adm-h1">Planos &amp; lucro</h1>
      <CalculadoraPlanos planos={planos} custoMsgUsd={over?.custoMedioMensagemUsd ?? 0} />
      <div className="adm-card">
        <h2>Editar planos, valores e limites <small>· muda o preço cobrado, o site e os limites aplicados no WhatsApp (as funções de cada plano são fixas no código)</small></h2>
        {planos.map((p) => <PlanoEditor key={p.id} plano={p} />)}
      </div>
    </>
  )
}

function CalculadoraPlanos({ planos, custoMsgUsd }: { planos: PlanoAdmin[]; custoMsgUsd: number }) {
  // Custo por mensagem: usa o MEDIDO quando houver; senão o de referência do CLAUDE.md.
  const custoPadrao = custoMsgUsd > 0 ? custoMsgUsd : 0.018
  const [custoMsg, setCustoMsg] = useState(String(custoPadrao.toFixed(4)))
  const [cotacao, setCotacao] = useState('5.40')
  const [taxa, setTaxa] = useState('11')
  const [meta, setMeta] = useState('5000')

  const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  const cUsd = num(custoMsg)
  const cot = num(cotacao)
  const txa = num(taxa) / 100
  const metaR = num(meta)

  const linhas = planos
    .filter((p) => p.valor > 0)
    .map((p) => {
      // Pior caso: cota de mensagens inteira consumida (onde o custo de IA domina).
      const custoBRL = p.limite_mensagens * cUsd * cot
      const receitaLiq = p.valor * (1 - txa)
      const lucro = receitaLiq - custoBRL
      const margem = p.valor > 0 ? (lucro / p.valor) * 100 : 0
      const paraMeta = lucro > 0 ? Math.ceil(metaR / lucro) : null
      return { p, custoBRL, receitaLiq, lucro, margem, paraMeta }
    })
    .sort((a, b) => b.lucro - a.lucro)

  const melhor = linhas[0]?.p.id
  const pior = linhas[linhas.length - 1]?.p.id

  return (
    <div className="adm-card">
      <h2>Calculadora de custo e lucro <small>· cenário de PIOR CASO (cota de mensagens cheia). {custoMsgUsd > 0 ? `Custo/msg medido: US$ ${custoMsgUsd.toFixed(4)}` : 'Sem custo medido ainda — usando referência US$ 0,0180/msg'}</small></h2>
      <div className="adm-calc-inputs">
        <label>Custo por mensagem (US$)<input value={custoMsg} onChange={(e) => setCustoMsg(e.target.value)} inputMode="decimal" /></label>
        <label>Cotação do dólar (R$)<input value={cotacao} onChange={(e) => setCotacao(e.target.value)} inputMode="decimal" /></label>
        <label>Taxas do gateway (%)<input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" /></label>
        <label>Meta de lucro / mês (R$)<input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table className="adm-table">
          <thead><tr><th>Plano</th><th>Preço</th><th>Custo máx.</th><th>Receita líq.</th><th>Lucro/assinante</th><th>Margem</th><th>Vendas p/ meta</th></tr></thead>
          <tbody>
            {linhas.map(({ p, custoBRL, receitaLiq, lucro, margem, paraMeta }) => (
              <tr key={p.id}>
                <td>{p.nome} {p.id === melhor && <span className="adm-pill on">+ lucro</span>}{p.id === pior && linhas.length > 1 && <span className="adm-pill pend">− lucro</span>}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatarBRL(p.valor)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: '#90a69b' }}>{formatarBRL(custoBRL)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: '#90a69b' }}>{formatarBRL(receitaLiq)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: lucro >= 0 ? '#57c99b' : '#d9705f' }}>{formatarBRL(lucro)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: margem >= 48 ? '#57c99b' : margem >= 0 ? '#dfa94e' : '#d9705f' }}>{margem.toFixed(0)}%</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{paraMeta !== null ? `${paraMeta}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-nota">Regra do projeto: margem ≥ 48% no pior caso. A coluna "Vendas p/ meta" diz quantos assinantes <b>daquele plano</b> pagam a meta de lucro mensal sozinhos.</p>
    </div>
  )
}

function PlanoEditor({ plano }: { plano: PlanoAdmin }) {
  const [nome, setNome] = useState(plano.nome)
  const [valor, setValor] = useState(String(plano.valor))
  const [descricao, setDescricao] = useState(plano.descricao ?? '')
  const [ativo, setAtivo] = useState(plano.ativo)
  const [msgs, setMsgs] = useState(String(plano.limite_mensagens ?? ''))
  const [fotos, setFotos] = useState(String(plano.limite_fotos ?? ''))
  const [audio, setAudio] = useState(String(plano.limite_audio_min ?? ''))
  const [obras, setObras] = useState(plano.limite_obras === null ? '' : String(plano.limite_obras ?? ''))
  const [estado, setEstado] = useState<'idle' | 'salvando' | 'ok' | 'erro'>('idle')

  async function salvar() {
    const v = Number(valor.replace(',', '.'))
    const inteiro = (s: string) => { const n = Math.floor(Number(s)); return Number.isFinite(n) && n >= 0 ? n : NaN }
    const lim = { m: inteiro(msgs), f: inteiro(fotos), a: inteiro(audio) }
    if (!Number.isFinite(v) || v < 0 || Number.isNaN(lim.m) || Number.isNaN(lim.f) || Number.isNaN(lim.a)) { setEstado('erro'); return }
    const limObras = obras.trim() === '' ? null : inteiro(obras)
    if (limObras !== null && Number.isNaN(limObras)) { setEstado('erro'); return }
    setEstado('salvando')
    try {
      await salvarPlano({
        id: plano.id, nome, valor: v, descricao, ativo,
        limite_mensagens: lim.m, limite_fotos: lim.f, limite_audio_min: lim.a, limite_obras: limObras,
      })
      setEstado('ok'); setTimeout(() => setEstado('idle'), 2000)
    } catch { setEstado('erro') }
  }

  return (
    <div className="adm-plano">
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <label>Valor mensal (R$)<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
      <label className="full">Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      <label>Ativo<select value={ativo ? '1' : '0'} onChange={(e) => setAtivo(e.target.value === '1')}><option value="1">Sim (aparece no site)</option><option value="0">Não</option></select></label>
      <label>Prévia<input value={formatarBRL(Number(valor.replace(',', '.')) || 0) + '/mês'} disabled /></label>
      <label>Mensagens/mês<input value={msgs} onChange={(e) => setMsgs(e.target.value)} inputMode="numeric" /></label>
      <label>Fotos/mês (0 = sem fotos)<input value={fotos} onChange={(e) => setFotos(e.target.value)} inputMode="numeric" /></label>
      <label>Áudio (min/mês)<input value={audio} onChange={(e) => setAudio(e.target.value)} inputMode="numeric" /></label>
      <label>Obras (vazio = ilimitado)<input value={obras} onChange={(e) => setObras(e.target.value)} inputMode="numeric" /></label>
      <div className="row-actions">
        {estado === 'ok' && <span style={{ color: '#57c99b', fontSize: 12, alignSelf: 'center' }}>Salvo ✓</span>}
        {estado === 'erro' && <span style={{ color: '#d9705f', fontSize: 12, alignSelf: 'center' }}>Erro ao salvar</span>}
        <button className="adm-btn" style={{ width: 'auto', padding: '0 22px', height: 40 }} disabled={estado === 'salvando'} onClick={salvar}>{estado === 'salvando' ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

/* ---------- Conta ---------- */

const STATUS_NOTA: Record<NotaFiscalAdmin['status'], { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'na fila', classe: 'pend' },
  aguardando_emissor: { rotulo: 'aguardando emissor', classe: 'pend' },
  processando: { rotulo: 'na prefeitura', classe: 'pend' },
  emitida: { rotulo: 'emitida', classe: 'on' },
  dados_faltando: { rotulo: 'falta CPF/e-mail', classe: 'off' },
  erro: { rotulo: 'recusada', classe: 'off' },
}

function AbaNotas() {
  const [dados, setDados] = useState<{ emissorConfigurado: boolean; notas: NotaFiscalAdmin[] } | null>(null)
  const [erro, setErro] = useState(false)
  const [salvando, setSalvando] = useState<number | null>(null)
  const carregar = () => { getNotasAdmin().then((r) => setDados(r)).catch(() => setErro(true)) }
  useEffect(carregar, [])

  async function reprocessar(id: number) {
    setSalvando(id)
    try { await reprocessarNota(id); carregar() } finally { setSalvando(null) }
  }

  if (erro) return <p className="adm-erro">Não consegui carregar as notas fiscais.</p>
  if (!dados) return <p style={{ color: '#90a69b' }}>Carregando notas…</p>
  return (
    <div className="adm-card">
      <h2>Notas fiscais <small>· emitidas automaticamente a cada pagamento aprovado (assinatura ou pacote)</small></h2>
      {!dados.emissorConfigurado && (
        <p className="adm-erro">Emissor ainda não configurado: as notas ficam na fila e saem sozinhas quando NFSE_API_KEY, NFSE_COMPANY_ID e NFSE_CITY_SERVICE_CODE estiverem na Vercel.</p>
      )}
      {dados.notas.length === 0 ? (
        <p style={{ color: '#90a69b', fontSize: 13 }}>Nenhum pagamento gerou nota ainda.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Origem</th><th>Valor</th><th>Status</th><th>Nº</th><th></th></tr></thead>
            <tbody>
              {dados.notas.map((n) => (
                <tr key={n.id}>
                  <td style={{ color: '#90a69b' }}>{n.created_at.slice(0, 10)}</td>
                  <td>{n.user_wa ?? `empresa ${n.empresa_id}`}</td>
                  <td>{n.origem}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatarBRL(Number(n.valor))}</td>
                  <td>
                    <span className={`adm-pill ${STATUS_NOTA[n.status].classe}`}>{STATUS_NOTA[n.status].rotulo}</span>
                    {n.status === 'emitida' && n.email_enviado && <span style={{ color: '#90a69b', fontSize: 12 }}> · e-mail enviado</span>}
                    {n.erro && n.status !== 'emitida' && <div style={{ color: '#90a69b', fontSize: 12, maxWidth: 320 }}>{n.erro}</div>}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{n.numero ?? '—'}</td>
                  <td>
                    {(n.status === 'erro' || n.status === 'dados_faltando') && (
                      <button className="adm-mini" disabled={salvando === n.id} onClick={() => reprocessar(n.id)}>Tentar de novo</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AbaConta() {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [estado, setEstado] = useState<'idle' | 'salvando' | 'ok'>('idle')
  const [erro, setErro] = useState<string | null>(null)

  async function trocar(e: FormEvent) {
    e.preventDefault()
    setErro(null); setEstado('salvando')
    try {
      await adminTrocarSenha(atual, nova)
      setEstado('ok'); setAtual(''); setNova('')
    } catch (err) {
      setEstado('idle')
      setErro((err as Error).message === 'credenciais' ? 'Senha atual incorreta.' : 'Não consegui trocar a senha.')
    }
  }

  return (
    <div className="adm-card" style={{ maxWidth: 420 }}>
      <h2>Trocar minha senha</h2>
      {erro && <p className="adm-erro">{erro}</p>}
      {estado === 'ok' && <p style={{ color: '#57c99b', fontSize: 13 }}>Senha atualizada ✓</p>}
      <form onSubmit={trocar}>
        <label className="adm-login" style={{ padding: 0, border: 0, background: 'none', display: 'block' }}>
          <div style={{ fontSize: 12, color: '#90a69b', marginBottom: 4 }}>Senha atual</div>
          <input className="adm-mini" style={{ width: '100%', height: 42, marginBottom: 12, boxSizing: 'border-box' }} type="password" value={atual} onChange={(e) => setAtual(e.target.value)} />
          <div style={{ fontSize: 12, color: '#90a69b', marginBottom: 4 }}>Nova senha (mín. 8)</div>
          <input className="adm-mini" style={{ width: '100%', height: 42, marginBottom: 14, boxSizing: 'border-box' }} type="password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </label>
        <button className="adm-btn" disabled={estado === 'salvando'}>{estado === 'salvando' ? 'Salvando…' : 'Trocar senha'}</button>
      </form>
    </div>
  )
}
