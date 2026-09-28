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
} from '../lib/admin'
import { formatarBRL } from '../lib/api'
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
        <h1>Rosana <span style={{ color: '#57c99b' }}>Admin</span></h1>
        <p className="sub">{modo === 'login' ? 'Acesso da administração.' : 'Primeiro acesso — crie seu login de administrador.'}</p>
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

type Aba = 'visao' | 'usuarios' | 'planos' | 'conta'

function AdminDashboard({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [aba, setAba] = useState<Aba>('visao')
  return (
    <>
      <div className="adm-top">
        <strong>Rosana <i>Admin</i></strong>
        <span className="who">{admin.nome} · <button className="adm-link" style={{ display: 'inline' }} onClick={onLogout}><span style={{ color: '#57c99b', cursor: 'pointer' }}>sair</span></button></span>
      </div>
      <div className="adm-tabs">
        {([['visao', 'Visão geral'], ['usuarios', 'Usuários'], ['planos', 'Planos'], ['conta', 'Conta']] as [Aba, string][]).map(([id, label]) => (
          <button key={id} className={`adm-tab ${aba === id ? 'is-on' : ''}`} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      <div className="adm-main">
        {aba === 'visao' && <AbaVisao />}
        {aba === 'usuarios' && <AbaUsuarios />}
        {aba === 'planos' && <AbaPlanos />}
        {aba === 'conta' && <AbaConta />}
      </div>
    </>
  )
}

function AbaVisao() {
  const [data, setData] = useState<Overview | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => { getOverview().then((r) => setData(r.data)).catch(() => setErro(true)) }, [])
  if (erro) return <p className="adm-erro">Não consegui carregar as métricas.</p>
  if (!data) return <p style={{ color: '#90a69b' }}>Carregando métricas…</p>
  const maxDia = Math.max(1, ...data.novosPorDia.map((d) => d.total))
  const maxConsumo = Math.max(1, ...data.topConsumo.map((c) => c.mensagens))
  const maxCusto = Math.max(0, ...data.topConsumo.map((c) => c.custo_usd_mes))
  const t = data.totais
  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><span>Usuários</span><strong>{t.usuarios}</strong></div>
        <div className="adm-kpi good"><span>Ativos</span><strong>{t.ativos}</strong></div>
        <div className="adm-kpi warn"><span>Pendentes</span><strong>{t.pendentes}</strong></div>
        <div className="adm-kpi bad"><span>Cancelados</span><strong>{t.cancelados}</strong></div>
        <div className="adm-kpi good"><span>Novos (30d)</span><strong>{t.novos30d}</strong></div>
        <div className="adm-kpi bad"><span>Saídas (30d)</span><strong>{t.saidas30d}</strong></div>
      </div>

      <div className="adm-card">
        <h2>Novos cadastros — últimos 30 dias</h2>
        <div className="adm-spark">
          {data.novosPorDia.map((d) => (
            <i key={d.data} style={{ height: `${(d.total / maxDia) * 100}%` }} title={`${d.data}: ${d.total}`} />
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h2>Índices por plano</h2>
        <div className="adm-bars">
          {data.porPlano.length === 0 && <p style={{ color: '#90a69b', fontSize: 13 }}>Sem dados ainda.</p>}
          {data.porPlano.map((p) => (
            <div className="adm-bar-row" key={p.plano}>
              <span className="lbl">{p.plano}</span>
              <div className="adm-bar" style={{ width: `${(p.total / Math.max(1, t.usuarios)) * 100}%` }} />
              <span className="val">{p.ativos}/{p.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h2>Custo real de IA no mês <small>· medido da API (IA + transcrição), sem o dono: US$ {data.custoIaMesUsd.toFixed(2)}</small></h2>
        <div className="adm-bars">
          {data.topConsumo.length === 0 && <p style={{ color: '#90a69b', fontSize: 13 }}>Sem atividade ainda.</p>}
          {data.topConsumo.map((c, i) => (
            <div className="adm-bar-row" key={i}>
              <span className="lbl">{c.nome || c.email || '—'}{c.plano ? ` · ${c.plano}` : ''}</span>
              <div className="adm-bar" style={{ width: `${(maxCusto > 0 ? c.custo_usd_mes / maxCusto : c.mensagens / maxConsumo) * 100}%` }} />
              <span className="val">US$ {c.custo_usd_mes.toFixed(2)} · {c.mensagens_mes} msgs</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Pacotes extras que o admin pode conceder (mesmos ids de src/pay/planos.ts).
const PACOTES_ADMIN = [
  { id: 'mensagens_100', nome: '+100 mensagens' },
  { id: 'mensagens_300', nome: '+300 mensagens' },
  { id: 'fotos_50', nome: '+50 fotos' },
  { id: 'audio_120', nome: '+2h de áudio' },
]

/** Plano gravado → valor do select (ids antigos caem no equivalente). */
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
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null)
  const [erro, setErro] = useState(false)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = () => { getUsuariosAdmin().then((r) => setUsuarios(r.usuarios)).catch(() => setErro(true)) }
  useEffect(carregar, [])

  const filtrados = useMemo(() => {
    if (!usuarios) return []
    const q = busca.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter((u) => [u.nome, u.email, u.user_wa, u.plano].some((v) => (v ?? '').toLowerCase().includes(q)))
  }, [usuarios, busca])

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

  if (erro) return <p className="adm-erro">Não consegui carregar os usuários.</p>
  if (!usuarios) return <p style={{ color: '#90a69b' }}>Carregando usuários…</p>
  return (
    <div className="adm-card">
      <h2>Usuários <small>· {usuarios.length}</small></h2>
      <input className="adm-mini" style={{ width: '100%', height: 40, marginBottom: 12, boxSizing: 'border-box' }} placeholder="Buscar por nome, e-mail, número, plano…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table">
          <thead><tr><th>Nome</th><th>Contato</th><th>Plano</th><th>Status</th><th>Msgs (mês)</th><th>Custo IA (mês)</th><th>Desde</th><th></th></tr></thead>
          <tbody>
            {filtrados.map((u) => (
              <tr key={u.user_wa}>
                <td>{u.nome || '—'} {u.dono && <span className="adm-pill on">dono</span>}</td>
                <td style={{ color: '#90a69b' }}>{u.email || u.user_wa}</td>
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
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.mensagens_mes} <span style={{ color: '#90a69b' }}>/ {u.mensagens} total</span></td>
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
    </div>
  )
}

function AbaPlanos() {
  const [planos, setPlanos] = useState<PlanoAdmin[] | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => { getPlanosAdmin().then((r) => setPlanos(r.planos)).catch(() => setErro(true)) }, [])
  if (erro) return <p className="adm-erro">Não consegui carregar os planos.</p>
  if (!planos) return <p style={{ color: '#90a69b' }}>Carregando planos…</p>
  return (
    <div className="adm-card">
      <h2>Planos, valores e limites <small>· editar aqui muda o preço cobrado, o site e os limites aplicados no WhatsApp (as funções de cada plano são fixas no código)</small></h2>
      {planos.map((p) => <PlanoEditor key={p.id} plano={p} />)}
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
