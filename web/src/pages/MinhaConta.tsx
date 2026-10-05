import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CreditCard, Phone, Settings, UserRound } from 'lucide-react'
import { PageHead } from '../components/Page'
import {
  assinarEmpresa,
  formatarBRL,
  getConta,
  getEmpresa,
  salvarConta,
  type ContaData,
  type EmpresaInfo,
  type PlanoEmpresa,
} from '../lib/api'

/** Formata o wa_id salvo (ex.: 554888088057) como "+55 (48) 98808-8057". */
function formatarWhatsapp(wa: string): string {
  const d = wa.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const resto = d.slice(4)
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4)
    const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4)
    return `+55 (${ddd}) ${meio}-${fim}`
  }
  return `+${d}`
}

const STATUS_ASSINATURA: Record<string, string> = {
  nenhuma: 'Sem assinatura ativa',
  pendente: 'Pagamento pendente',
  pendente_pagamento: 'Pagamento pendente',
  authorized: 'Ativa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
}

const NOME_PLANO: Record<string, string> = {
  agenda: 'Agenda',
  obra: 'Obra',
  construtora: 'Construtora',
  essencial: 'Obra',
  profissional: 'Construtora',
}

export function MinhaConta() {
  const [conta, setConta] = useState<ContaData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Campos editáveis (controlados).
  const [nome, setNome] = useState('')
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [email, setEmail] = useState('')
  const [profissao, setProfissao] = useState('')
  const [resumoHora, setResumoHora] = useState('08:00')
  const [antecedencia, setAntecedencia] = useState(30)
  const [nudge, setNudge] = useState(true)

  // Empresa (se o usuário for o master, gerencia o plano aqui).
  const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null)
  const [souMaster, setSouMaster] = useState(false)
  const [planosEmp, setPlanosEmp] = useState<PlanoEmpresa[]>([])
  const [busyPlano, setBusyPlano] = useState(false)

  function preencher(c: ContaData) {
    setConta(c)
    setNome(c.nome ?? '')
    setNomeCompleto(c.nome_completo ?? '')
    setEmail(c.email ?? '')
    setProfissao(c.profissao ?? '')
    setResumoHora(c.resumo_hora ?? '08:00')
    setAntecedencia(typeof c.lembrete_antecedencia_min === 'number' ? c.lembrete_antecedencia_min : 30)
    setNudge(c.nudge_diario)
  }

  useEffect(() => {
    getConta()
      .then((r) => preencher(r.conta))
      .catch(() => setErro('Não consegui carregar seus dados.'))
      .finally(() => setCarregando(false))
    getEmpresa()
      .then((r) => { setEmpresa(r.empresa); setSouMaster(!!r.master); setPlanosEmp(r.planosEmpresa ?? []) })
      .catch(() => {})
  }, [])

  async function assinarPlano(planoId: string) {
    setMsg(null); setBusyPlano(true)
    try {
      const r = await assinarEmpresa(planoId)
      if (r.init_point) { window.location.href = r.init_point; return }
      const e = await getEmpresa()
      setEmpresa(e.empresa)
      setMsg({ tipo: 'ok', texto: 'Plano aplicado. O pagamento recorrente será ativado quando a cobrança estiver integrada.' })
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não consegui aplicar o plano agora.' })
    } finally {
      setBusyPlano(false)
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setMsg({ tipo: 'erro', texto: 'E-mail inválido.' })
    }
    setSalvando(true)
    try {
      const r = await salvarConta({
        nome: nome.trim(),
        nome_completo: nomeCompleto,
        email,
        profissao,
        resumo_hora: resumoHora,
        lembrete_antecedencia_min: antecedencia,
        nudge_diario: nudge,
      })
      preencher(r.conta)
      setMsg({ tipo: 'ok', texto: 'Dados salvos com sucesso.' })
    } catch (err) {
      const e2 = String((err as Error)?.message)
      setMsg({ tipo: 'erro', texto: e2 === 'email_invalido' ? 'E-mail inválido.' : 'Não consegui salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <section className="page">
        <PageHead eyebrow="SUA CONTA" title="Minha conta" />
        <div className="board-msg">Carregando…</div>
      </section>
    )
  }
  if (erro || !conta) {
    return (
      <section className="page">
        <PageHead eyebrow="SUA CONTA" title="Minha conta" />
        <div className="board-msg erro">{erro ?? 'Dados indisponíveis.'}</div>
      </section>
    )
  }

  const statusTxt = STATUS_ASSINATURA[conta.assinatura_status ?? 'nenhuma'] ?? conta.assinatura_status
  const planoTxt = conta.dono ? 'Sem limite (dono)' : conta.plano ? (NOME_PLANO[conta.plano] ?? conta.plano) : 'Beta'

  return (
    <section className="page">
      <PageHead eyebrow="SUA CONTA" title="Minha conta" subtitle="Seus dados de cadastro, preferências e assinatura." />

      <form className="config-form" onSubmit={salvar}>
        <div className="config-grid">
          <article className="config-card config-card--wide">
            <div className="config-icon"><UserRound size={20} /></div>
            <h3>Dados de cadastro</h3>
            <div className="config-form-row">
              <label><span>Nome de exibição</span><input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
              <label><span>Nome completo</span><input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} /></label>
            </div>
            <div className="config-form-row">
              <label><span>E-mail (recibos/avisos)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="voce@email.com" /></label>
              <label><span>Profissão</span><input value={profissao} onChange={(e) => setProfissao(e.target.value)} placeholder="Engenheiro(a) civil, mestre de obras…" /></label>
            </div>
          </article>

          <article className="config-card">
            <div className="config-icon"><Phone size={20} /></div>
            <h3>WhatsApp conectado</h3>
            <dl>
              <div><dt>Número</dt><dd>{formatarWhatsapp(conta.user_wa)}</dd></div>
            </dl>
            <p>É o número por onde você fala com a Rosana e a chave da sua conta. Para trocar, fale com o suporte no WhatsApp.</p>
          </article>

          <article className="config-card">
            <div className="config-icon"><BellRing size={20} /></div>
            <h3>Preferências</h3>
            <div className="config-form-row">
              <label><span>Horário do resumo diário</span><input type="time" value={resumoHora} onChange={(e) => setResumoHora(e.target.value)} /></label>
              <label><span>Lembrar com antecedência (min)</span><input type="number" min={0} max={1440} value={antecedencia} onChange={(e) => setAntecedencia(Number(e.target.value))} /></label>
            </div>
            <label className="config-check">
              <input type="checkbox" checked={nudge} onChange={(e) => setNudge(e.target.checked)} />
              <span>Receber o resumo diário (“bom dia” + agenda do dia)</span>
            </label>
          </article>

          {souMaster && empresa ? (
            <article className="config-card config-card--wide">
              <div className="config-icon"><CreditCard size={20} /></div>
              <h3>Assinatura da empresa</h3>
              <p>Plano por nº de membros da <b>{empresa.nome}</b>. Ao assinar um plano maior, o limite de vagas sobe na hora.</p>
              <div className="plano-emp-grid">
                {planosEmp.map((p) => {
                  const atual = empresa.teto_membros === p.tetoMembros
                  return (
                    <div key={p.id} className={`plano-emp ${atual ? 'plano-emp--atual' : ''}`}>
                      <strong>{p.nome}</strong>
                      <span className="plano-emp-valor">{formatarBRL(p.valor)}<small>/mês</small></span>
                      <small>Até {p.tetoMembros} membros</small>
                      <button type="button" className="config-btn" disabled={busyPlano || atual} onClick={() => assinarPlano(p.id)}>
                        {atual ? 'Plano atual' : 'Assinar'}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p style={{ marginTop: 10, fontSize: 11 }}>
                Situação: <b>{empresa.assinatura_status === 'authorized' ? 'Ativa' : empresa.assinatura_status === 'pendente' ? 'Pagamento pendente' : empresa.assinatura_status === 'aguardando' ? 'Aguardando integração de cobrança' : 'Sem cobrança'}</b>.
                O cartão é gerenciado no checkout do Mercado Pago ao assinar/alterar o plano.
              </p>
            </article>
          ) : (
            <article className="config-card">
              <div className="config-icon"><CreditCard size={20} /></div>
              <h3>Assinatura</h3>
              <dl>
                <div><dt>Plano</dt><dd>{planoTxt}</dd></div>
                <div><dt>Situação</dt><dd>{statusTxt}</dd></div>
                {conta.assinatura_em && (
                  <div><dt>Desde</dt><dd>{new Date(conta.assinatura_em).toLocaleDateString('pt-BR')}</dd></div>
                )}
              </dl>
              <p>Para trocar de plano ou gerenciar o pagamento, fale com a Rosana no WhatsApp.</p>
            </article>
          )}

          <article className="config-card">
            <div className="config-icon"><Settings size={20} /></div>
            <h3>Configurações</h3>
            <p>Trocar a senha e escolher o tema (claro/escuro) do painel.</p>
            <Link className="config-btn" to="/painel/config" style={{ display: 'inline-block', textDecoration: 'none' }}>Abrir configurações</Link>
          </article>
        </div>

        {msg && <p className={`config-msg config-msg--${msg.tipo}`}>{msg.texto}</p>}
        <button className="config-btn" disabled={salvando || !nome.trim()}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
    </section>
  )
}
