import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Check, Pencil, ShieldCheck, Trash2, UserCog, UserPlus, Users, X } from 'lucide-react'
import { PageHead } from '../components/Page'
import {
  atribuirObra,
  convidarColaborador,
  criarEmpresa,
  criarObraEmpresa,
  getEmpresa,
  promoverMembro,
  removerMembro,
  renomearEmpresa,
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
  const [master, setMaster] = useState(false)
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
  const [convCargo, setConvCargo] = useState('')
  const [obraNome, setObraNome] = useState('')
  const [obraCliente, setObraCliente] = useState('')
  const [busy, setBusy] = useState(false)
  const [editNome, setEditNome] = useState(false)
  const [novoNome, setNovoNome] = useState('')

  async function recarregar() {
    const r = await getEmpresa()
    setTemEmpresa(!!r.empresa)
    setInfo(r.empresa)
    setMaster(!!r.master)
    setMembros(r.membros ?? [])
    setObras(r.obras ?? [])
    setPlanos(r.planosEmpresa ?? [])
  }

  useEffect(() => {
    recarregar().catch(() => setErro('Não consegui carregar a empresa.')).finally(() => setCarregando(false))
  }, [])

  // Colaboradores atribuíveis por obra: ativos E convidados (pré-atribuição; o
  // admin/master vê tudo automaticamente, então fica de fora). A atribuição de
  // um convidado passa a valer quando ele aceitar o convite.
  const engenheiros = useMemo(
    () => membros.filter((m) => (m.status === 'ativo' || m.status === 'convidado') && m.papel !== 'admin'),
    [membros],
  )
  const planoAtual = useMemo(() => planos.find((p) => p.id === info?.plano) ?? null, [planos, info])

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

  if (!temEmpresa) {
    return (
      <section className="page">
        <PageHead eyebrow="CORPORATIVO" title="Minha empresa" subtitle="Monte a conta da sua empresa e convide sua equipe." />
        <article className="config-card config-card--wide" style={{ maxWidth: 520 }}>
          <div className="config-icon"><Building2 size={20} /></div>
          <h3>Criar empresa</h3>
          <p>Crie a conta da sua empresa para adicionar colaboradores e organizar as obras da equipe.</p>
          <form className="config-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (nomeEmpresa.trim()) acao(() => criarEmpresa(nomeEmpresa.trim(), teto), 'Empresa criada!') }}>
            <label><span>Nome da empresa</span><input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Engetec Reformas Prediais" /></label>
            <label><span>Limite de membros (plano)</span><input type="number" min={1} max={50} value={teto} onChange={(e) => setTeto(Number(e.target.value))} /></label>
            {msg && <p className={`config-msg config-msg--${msg.tipo}`}>{msg.texto}</p>}
            <button className="config-btn" disabled={busy || !nomeEmpresa.trim()}>{busy ? 'Criando…' : 'Criar empresa'}</button>
          </form>
        </article>
      </section>
    )
  }

  const usados = info?.usados ?? 0
  const tetoM = info?.teto_membros ?? 0
  const livres = Math.max(0, tetoM - usados)

  return (
    <section className="page">
      <div className="emp-head">
        <div>
          <p className="eyebrow">CORPORATIVO</p>
          {editNome ? (
            <span className="emp-rename">
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus />
              <button className="icon-ok" title="Salvar" disabled={busy || !novoNome.trim()}
                onClick={() => acao(() => renomearEmpresa(novoNome.trim()), 'Nome atualizado.').then((ok) => ok && setEditNome(false))}><Check size={16} /></button>
              <button className="icon-del" title="Cancelar" onClick={() => setEditNome(false)}><X size={16} /></button>
            </span>
          ) : (
            <h1 className="emp-title">
              {info?.nome}
              <span className="emp-ativo">Ativo</span>
              {master && <button className="icon-mini" title="Renomear empresa" onClick={() => { setNovoNome(info?.nome ?? ''); setEditNome(true) }}><Pencil size={14} /></button>}
            </h1>
          )}
          <small className="emp-sub">{usados} de {tetoM} vagas usadas · {livres} livre{livres === 1 ? '' : 's'}</small>
        </div>
      </div>
      {msg && <p className={`config-msg config-msg--${msg.tipo}`} style={{ maxWidth: 620 }}>{msg.texto}</p>}

      <div className="config-grid">
        {/* Plano + vagas (somente leitura aqui; gestão em Minha conta) */}
        <article className="config-card">
          <div className="config-icon"><ShieldCheck size={20} /></div>
          <h3>Plano e vagas</h3>
          <dl>
            <div><dt>Plano</dt><dd>{planoAtual ? planoAtual.nome : `Até ${tetoM} membros`}</dd></div>
            <div><dt>Vagas usadas</dt><dd>{usados} de {tetoM}</dd></div>
            <div><dt>Vagas livres</dt><dd>{livres}</dd></div>
            <div><dt>Assinatura</dt><dd>{info?.assinatura_status === 'authorized' ? 'Ativa' : info?.assinatura_status === 'pendente' ? 'Pendente' : info?.assinatura_status === 'aguardando' ? 'Aguardando' : 'Sem cobrança'}</dd></div>
          </dl>
          <p>{master ? 'Para trocar de plano ou gerenciar o pagamento, vá em Minha conta.' : 'O plano é gerido pelo responsável (master) da empresa.'}</p>
        </article>

        {/* Equipe */}
        <article className="config-card config-card--wide">
          <div className="config-icon"><Users size={20} /></div>
          <h3>Equipe</h3>
          {master ? (
            <form className="inline-form" style={{ marginTop: 4 }}
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!convNum.trim()) return
                acao(() => convidarColaborador(convNome.trim(), convNum.trim(), convCargo.trim() || undefined), 'Convite enviado no WhatsApp!', {
                  sem_vaga: 'Limite de membros do plano atingido.',
                  ja_membro: 'Esse número já está na equipe.',
                }).then((ok) => { if (ok) { setConvNome(''); setConvNum(''); setConvCargo('') } })
              }}>
              <input placeholder="Nome do colaborador" value={convNome} onChange={(e) => setConvNome(e.target.value)} />
              <input placeholder="WhatsApp (ex.: 48 99999-8888)" value={convNum} onChange={(e) => setConvNum(e.target.value)} />
              <input placeholder="Cargo (ex.: Engenheiro, Mestre de obras)" value={convCargo} onChange={(e) => setConvCargo(e.target.value)} />
              <button className="btn-primary" disabled={busy || !convNum.trim()}><UserPlus size={16} /> Convidar</button>
            </form>
          ) : <p>Só o responsável (master) da empresa gerencia a equipe.</p>}
          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table>
              <thead><tr><th>NOME</th><th>WHATSAPP</th><th>CARGO</th><th>PAPEL</th><th>SITUAÇÃO</th>{master && <th></th>}</tr></thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nome ?? '—'}</td>
                    <td>{fmtWa(m.user_wa)}</td>
                    <td>{m.cargo ?? '—'}</td>
                    <td>{m.master ? <span className="papel-badge papel-badge--master">Master</span> : m.papel === 'admin' ? <span className="papel-badge papel-badge--admin">Admin</span> : 'Colaborador'}</td>
                    <td><span className={`mat-status mat-status--${m.status === 'ativo' ? 'entregue' : m.status === 'convidado' ? 'cotando' : 'cancelado'}`}>{STATUS_LABEL[m.status] ?? m.status}</span></td>
                    {master && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!m.master && m.status === 'ativo' && (
                          <button className="icon-mini" title={m.papel === 'admin' ? 'Rebaixar a colaborador' : 'Tornar admin'} disabled={busy}
                            onClick={() => acao(() => promoverMembro(m.id, m.papel === 'admin' ? 'engenheiro' : 'admin'), m.papel === 'admin' ? 'Agora é colaborador.' : 'Agora é admin.')}>
                            <UserCog size={15} />
                          </button>
                        )}
                        {!m.master && (
                          <button className="icon-del" title="Remover" disabled={busy}
                            onClick={() => acao(() => removerMembro(m.id), 'Membro removido.')}><Trash2 size={15} /></button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {master && <p style={{ marginTop: 8, fontSize: 11 }}>Admins veem todo o painel da empresa e gerenciam obras/clientes/contexto. Só você (master) muda nome da empresa, plano e equipe.</p>}
        </article>

        {/* Obras da empresa + atribuição */}
        <article className="config-card config-card--wide">
          <div className="config-icon"><Building2 size={20} /></div>
          <h3>Obras da empresa</h3>
          <p>Crie as obras e escolha quais colaboradores entram em cada uma. Cada colaborador só vê as obras em que foi incluído.</p>
          <form className="inline-form" style={{ marginTop: 10 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (!obraNome.trim()) return
              acao(() => criarObraEmpresa(obraNome.trim(), obraCliente.trim() || undefined), 'Obra criada!')
                .then((ok) => { if (ok) { setObraNome(''); setObraCliente('') } })
            }}>
            <input placeholder="Nome da obra" value={obraNome} onChange={(e) => setObraNome(e.target.value)} />
            <input placeholder="Cliente (opcional)" value={obraCliente} onChange={(e) => setObraCliente(e.target.value)} />
            <button className="btn-primary" disabled={busy || !obraNome.trim()}><Building2 size={16} /> Criar obra</button>
          </form>

          {obras.length === 0 ? (
            <p style={{ marginTop: 12 }}>Nenhuma obra da empresa ainda.</p>
          ) : (
            <div className="obra-atrib-list">
              {obras.map((o) => (
                <ObraAtribuicao key={o.id} obra={o} engenheiros={engenheiros} busy={busy}
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
  obra, engenheiros, busy, onSalvar,
}: {
  obra: ObraEmpresa
  engenheiros: MembroEmpresa[]
  busy: boolean
  onSalvar: (userWas: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(obra.membros)
  const toggle = (wa: string) => setSel((s) => (s.includes(wa) ? s.filter((x) => x !== wa) : [...s, wa]))
  const todos = () => setSel(engenheiros.map((m) => m.user_wa))
  const mudou = sel.slice().sort().join(',') !== obra.membros.slice().sort().join(',')
  return (
    <div className="obra-atrib">
      <div className="obra-atrib-head"><strong>{obra.nome}</strong>{obra.cliente && <small>{obra.cliente}</small>}</div>
      {engenheiros.length === 0 ? (
        <p className="obra-atrib-vazio">Convide e ative colaboradores para atribuí-los a esta obra.</p>
      ) : (
        <>
          <div className="obra-atrib-membros">
            {engenheiros.map((m) => (
              <label key={m.id} className="config-check" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={sel.includes(m.user_wa)} onChange={() => toggle(m.user_wa)} />
                <span>
                  {m.nome ?? fmtWa(m.user_wa)}{m.cargo ? ` · ${m.cargo}` : ''}
                  {m.status === 'convidado' && <em className="atrib-pend"> · convite pendente</em>}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" type="button" onClick={todos}>Todos</button>
            {mudou && <button className="config-btn" disabled={busy} onClick={() => onSalvar(sel)}>Salvar atribuições</button>}
          </div>
        </>
      )}
    </div>
  )
}
