import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, CreditCard, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { PageHead } from '../components/Page'
import {
  assinarEmpresa,
  atribuirObra,
  convidarColaborador,
  criarEmpresa,
  criarObraEmpresa,
  formatarBRL,
  getEmpresa,
  removerMembro,
  type EmpresaInfo,
  type MembroEmpresa,
  type ObraEmpresa,
  type PlanoEmpresa,
} from '../lib/api'

function fmtWa(wa: string): string {
  const d = wa.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const resto = d.slice(4)
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4)
    return `(${ddd}) ${meio}-${resto.slice(meio.length)}`
  }
  return wa
}

const STATUS_LABEL: Record<string, string> = {
  convidado: 'Convite enviado', ativo: 'Ativo', recusado: 'Recusou', removido: 'Removido',
}

export function Empresa() {
  const [info, setInfo] = useState<EmpresaInfo | null>(null)
  const [membros, setMembros] = useState<MembroEmpresa[]>([])
  const [obras, setObras] = useState<ObraEmpresa[]>([])
  const [planos, setPlanos] = useState<PlanoEmpresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [temEmpresa, setTemEmpresa] = useState(true)

  // Formulários
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [teto, setTeto] = useState(3)
  const [convNome, setConvNome] = useState('')
  const [convNum, setConvNum] = useState('')
  const [obraNome, setObraNome] = useState('')
  const [obraCliente, setObraCliente] = useState('')
  const [busy, setBusy] = useState(false)

  async function recarregar() {
    const r = await getEmpresa()
    setTemEmpresa(!!r.empresa)
    setInfo(r.empresa)
    setMembros(r.membros ?? [])
    setObras(r.obras ?? [])
    setPlanos(r.planosEmpresa ?? [])
  }

  async function assinar(planoId: string) {
    setMsg(null); setBusy(true)
    try {
      const r = await assinarEmpresa(planoId)
      if (r.init_point) { window.location.href = r.init_point; return }
      await recarregar()
      setMsg({ tipo: 'ok', texto: 'Plano aplicado. O pagamento recorrente será ativado em breve (integração de cobrança).' })
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não consegui aplicar o plano agora.' })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    recarregar().catch(() => setErro('Não consegui carregar a empresa.')).finally(() => setCarregando(false))
  }, [])

  const ativos = useMemo(() => membros.filter((m) => m.status === 'ativo'), [membros])

  async function acao<T>(fn: () => Promise<T>, okMsg: string, erros: Record<string, string> = {}) {
    setMsg(null); setBusy(true)
    try {
      await fn()
      await recarregar()
      setMsg({ tipo: 'ok', texto: okMsg })
      return true
    } catch (e) {
      const k = String((e as Error)?.message)
      setMsg({ tipo: 'erro', texto: erros[k] ?? 'Não consegui completar a ação.' })
      return false
    } finally {
      setBusy(false)
    }
  }

  if (carregando) {
    return <section className="page"><PageHead eyebrow="CORPORATIVO" title="Minha empresa" /><div className="board-msg">Carregando…</div></section>
  }
  if (erro) {
    return <section className="page"><PageHead eyebrow="CORPORATIVO" title="Minha empresa" /><div className="board-msg erro">{erro}</div></section>
  }

  // Sem empresa → oferecer criar.
  if (!temEmpresa) {
    return (
      <section className="page">
        <PageHead eyebrow="CORPORATIVO" title="Minha empresa" subtitle="Monte a conta da sua empresa e convide sua equipe." />
        <article className="config-card config-card--wide" style={{ maxWidth: 520 }}>
          <div className="config-icon"><Building2 size={20} /></div>
          <h3>Criar empresa</h3>
          <p>Crie a conta da sua empresa para adicionar engenheiros e organizar as obras da equipe.</p>
          <form className="config-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (nomeEmpresa.trim()) acao(() => criarEmpresa(nomeEmpresa.trim(), teto), 'Empresa criada!') }}>
            <label><span>Nome da empresa</span><input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: ENGETEC Construções" /></label>
            <label><span>Limite de membros (plano)</span><input type="number" min={1} max={50} value={teto} onChange={(e) => setTeto(Number(e.target.value))} /></label>
            {msg && <p className={`config-msg config-msg--${msg.tipo}`}>{msg.texto}</p>}
            <button className="config-btn" disabled={busy || !nomeEmpresa.trim()}>{busy ? 'Criando…' : 'Criar empresa'}</button>
          </form>
        </article>
      </section>
    )
  }

  return (
    <section className="page">
      <PageHead eyebrow="CORPORATIVO" title={info?.nome ?? 'Minha empresa'}
        subtitle={info ? `${info.usados} de ${info.teto_membros} vagas usadas` : undefined} />
      {msg && <p className={`config-msg config-msg--${msg.tipo}`} style={{ maxWidth: 560 }}>{msg.texto}</p>}

      <div className="config-grid">
        {/* Plano da empresa */}
        <article className="config-card config-card--wide">
          <div className="config-icon"><CreditCard size={20} /></div>
          <h3>Plano da empresa</h3>
          <p>Escolha o plano pelo número de membros da equipe. Ao assinar um plano maior, o limite de vagas sobe na hora.</p>
          <div className="plano-emp-grid">
            {planos.map((p) => {
              const atual = info?.teto_membros === p.tetoMembros
              return (
                <div key={p.id} className={`plano-emp ${atual ? 'plano-emp--atual' : ''}`}>
                  <strong>{p.nome}</strong>
                  <span className="plano-emp-valor">{formatarBRL(p.valor)}<small>/mês</small></span>
                  <small>Até {p.tetoMembros} membros</small>
                  <button className="config-btn" disabled={busy || atual} onClick={() => assinar(p.id)}>
                    {atual ? 'Plano atual' : 'Assinar'}
                  </button>
                </div>
              )
            })}
          </div>
          <p style={{ marginTop: 10, fontSize: 11 }}>Situação da assinatura: <b>{info?.assinatura_status === 'authorized' ? 'Ativa' : info?.assinatura_status === 'pendente' ? 'Pagamento pendente' : info?.assinatura_status === 'aguardando' ? 'Aguardando integração de cobrança' : 'Sem cobrança'}</b></p>
        </article>

        {/* Convidar + membros */}
        <article className="config-card config-card--wide">
          <div className="config-icon"><Users size={20} /></div>
          <h3>Equipe</h3>
          <form className="inline-form" style={{ marginTop: 4 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (!convNum.trim()) return
              acao(() => convidarColaborador(convNome.trim(), convNum.trim()), 'Convite enviado no WhatsApp!', {
                sem_vaga: 'Limite de membros do plano atingido.',
                ja_membro: 'Esse número já está na equipe.',
              }).then((ok) => { if (ok) { setConvNome(''); setConvNum('') } })
            }}>
            <input placeholder="Nome do colaborador" value={convNome} onChange={(e) => setConvNome(e.target.value)} />
            <input placeholder="WhatsApp (ex.: 48 99999-8888)" value={convNum} onChange={(e) => setConvNum(e.target.value)} />
            <button className="btn-primary" disabled={busy || !convNum.trim()}><UserPlus size={16} /> Convidar</button>
          </form>
          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table>
              <thead><tr><th>NOME</th><th>WHATSAPP</th><th>PAPEL</th><th>SITUAÇÃO</th><th></th></tr></thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nome ?? '—'}</td>
                    <td>{fmtWa(m.user_wa)}</td>
                    <td>{m.papel === 'admin' ? 'Admin' : 'Engenheiro'}</td>
                    <td><span className={`mat-status mat-status--${m.status === 'ativo' ? 'entregue' : m.status === 'convidado' ? 'cotando' : 'cancelado'}`}>{STATUS_LABEL[m.status] ?? m.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      {m.papel !== 'admin' && (
                        <button className="icon-del" title="Remover" disabled={busy}
                          onClick={() => acao(() => removerMembro(m.id), 'Membro removido.')}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Obras da empresa + atribuição */}
        <article className="config-card config-card--wide">
          <div className="config-icon"><Building2 size={20} /></div>
          <h3>Obras da empresa</h3>
          <p>Crie as obras e escolha quais engenheiros entram em cada uma. Cada engenheiro só vê as obras em que foi incluído.</p>
          <form className="inline-form" style={{ marginTop: 10 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (!obraNome.trim()) return
              acao(() => criarObraEmpresa(obraNome.trim(), obraCliente.trim() || undefined), 'Obra criada!')
                .then((ok) => { if (ok) { setObraNome(''); setObraCliente('') } })
            }}>
            <input placeholder="Nome da obra" value={obraNome} onChange={(e) => setObraNome(e.target.value)} />
            <input placeholder="Cliente (opcional)" value={obraCliente} onChange={(e) => setObraCliente(e.target.value)} />
            <button className="btn-primary" disabled={busy || !obraNome.trim()}><Plus size={16} /> Criar obra</button>
          </form>

          {obras.length === 0 ? (
            <p style={{ marginTop: 12 }}>Nenhuma obra da empresa ainda.</p>
          ) : (
            <div className="obra-atrib-list">
              {obras.map((o) => (
                <ObraAtribuicao key={o.id} obra={o} ativos={ativos} busy={busy}
                  onSalvar={(sel) => acao(() => atribuirObra(o.id, sel), 'Atribuições salvas.')} />
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

function ObraAtribuicao({
  obra, ativos, busy, onSalvar,
}: {
  obra: ObraEmpresa
  ativos: MembroEmpresa[]
  busy: boolean
  onSalvar: (userWas: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(obra.membros)
  const toggle = (wa: string) => setSel((s) => (s.includes(wa) ? s.filter((x) => x !== wa) : [...s, wa]))
  const mudou = sel.slice().sort().join(',') !== obra.membros.slice().sort().join(',')
  return (
    <div className="obra-atrib">
      <div className="obra-atrib-head"><strong>{obra.nome}</strong>{obra.cliente && <small>{obra.cliente}</small>}</div>
      {ativos.length === 0 ? (
        <p className="obra-atrib-vazio">Convide e ative engenheiros para atribuí-los a esta obra.</p>
      ) : (
        <div className="obra-atrib-membros">
          {ativos.map((m) => (
            <label key={m.id} className="config-check" style={{ marginBottom: 0 }}>
              <input type="checkbox" checked={sel.includes(m.user_wa)} onChange={() => toggle(m.user_wa)} />
              <span>{m.nome ?? fmtWa(m.user_wa)}</span>
            </label>
          ))}
        </div>
      )}
      {mudou && <button className="config-btn" disabled={busy} onClick={() => onSalvar(sel)}>Salvar atribuições</button>}
    </div>
  )
}
