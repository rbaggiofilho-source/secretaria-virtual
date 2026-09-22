import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, BookOpenText, CalendarRange, FileClock, Images, MapPin, PackageSearch, Pencil, Plus, Search, User, X } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { ObraForm } from '../components/ObraForm'
import { getObras, type ObraResumo } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'

const CORES = ['#c4763b', '#497a6d', '#888f68', '#b96730', '#527c8b', '#8a6d9c']
const STATUS_LABEL: Record<string, string> = { ativa: 'Ativa', pausada: 'Pausada', concluida: 'Concluída' }

export function Obras() {
  const [params, setParams] = useSearchParams()
  const [obras, setObras] = useState<ObraResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState(params.get('q') ?? '')
  const [form, setForm] = useState<{ obra: ObraResumo | null } | null>(null)

  async function carregar() {
    setErro(null)
    try {
      setObras((await getObras()).obras)
    } catch {
      setErro('Não consegui carregar suas obras.')
    }
  }
  useEffect(() => { void carregar() }, [])

  useEffect(() => {
    setBusca(params.get('q') ?? '')
    if (params.get('novo') === '1') { setForm({ obra: null }); params.delete('novo'); setParams(params, { replace: true }) }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = obras ?? []
    return q ? lista.filter((o) => o.nome.toLowerCase().includes(q) || (o.cliente ?? '').toLowerCase().includes(q)) : lista
  }, [obras, busca])

  return (
    <section className="page">
      <PageHead eyebrow="PORTFÓLIO" title="Suas obras" subtitle="Cadastro e panorama de cada obra."
        right={<button className="btn-primary" onClick={() => setForm({ obra: null })}><Plus size={16} /> Nova obra</button>} />

      <div className="toolbar">
        <label className="filter-search">
          <Search size={16} />
          <input placeholder="Buscar por obra ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && <button type="button" aria-label="Limpar" onClick={() => setBusca('')}><X size={14} /></button>}
        </label>
      </div>

      <PageState loading={obras === null} error={erro} empty={!!obras && filtradas.length === 0}
        emptyMsg={busca ? 'Nenhuma obra encontrada.' : 'Nenhuma obra ainda. Clique em "Nova obra" para cadastrar a primeira.'}>
        <div className="card-grid">
          {filtradas.map((o, i) => {
            const cor = CORES[i % CORES.length]
            return (
              <article className="obra-card" key={o.id ?? o.nome}>
                <div className="obra-top">
                  <span className="obra-mark" style={{ background: `${cor}1e`, color: cor }}>⌂</span>
                  <div className="obra-title">
                    <h3>{o.nome}</h3>
                    {o.status && <span className={`obra-badge obra-badge--${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>}
                  </div>
                  <button className="obra-edit" onClick={() => setForm({ obra: o })} aria-label="Editar obra"><Pencil size={15} /></button>
                </div>

                <div className="obra-meta">
                  {o.cliente && <span><User size={14} /> {o.cliente}</span>}
                  {o.endereco && <span><MapPin size={14} /> {o.endereco}</span>}
                  {(o.dataInicio || o.dataFimAlvo) && (
                    <span><CalendarRange size={14} /> {formatDate(o.dataInicio)} → {formatDate(o.dataFimAlvo)}</span>
                  )}
                </div>
                {o.contexto && <p className="obra-contexto">{o.contexto}</p>}
                {o.id == null && <p className="obra-organizar">Ainda não organizada — clique no lápis para preencher cliente, endereço e datas.</p>}

                <div className="obra-invest"><small>Investido</small><strong>{formatCurrency(o.gasto)}</strong></div>
                <div className="obra-stats">
                  <span><BarChart3 size={15} /> {o.custos} custos</span>
                  <span><BookOpenText size={15} /> {o.rdos} RDOs</span>
                  <span><PackageSearch size={15} /> {o.materiais} materiais</span>
                  <span><FileClock size={15} /> {o.documentos} docs</span>
                  <span><Images size={15} /> {o.fotos} fotos</span>
                </div>
              </article>
            )
          })}
        </div>
      </PageState>

      {form && <ObraForm inicial={form.obra} onClose={() => setForm(null)} onSaved={() => { setForm(null); void carregar() }} />}
    </section>
  )
}
