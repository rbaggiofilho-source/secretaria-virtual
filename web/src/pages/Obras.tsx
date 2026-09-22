import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, BookOpenText, FileClock, Images, PackageSearch, Plus, Search, X } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { criarObra, getObras, type ObraResumo } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'

const CORES = ['#c4763b', '#497a6d', '#888f68', '#b96730', '#527c8b', '#8a6d9c']

export function Obras() {
  const [params, setParams] = useSearchParams()
  const [obras, setObras] = useState<ObraResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState(params.get('q') ?? '')
  const [novo, setNovo] = useState(params.get('novo') === '1')
  const [nomeNovo, setNomeNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    setBusca(params.get('q') ?? '')
    if (params.get('novo') === '1') setNovo(true)
  }, [params])

  async function carregar() {
    setErro(null)
    try {
      const r = await getObras()
      setObras(r.obras)
    } catch {
      setErro('Não consegui carregar suas obras.')
    }
  }
  useEffect(() => { void carregar() }, [])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = obras ?? []
    return q ? lista.filter((o) => o.nome.toLowerCase().includes(q)) : lista
  }, [obras, busca])

  async function salvarObra(e: FormEvent) {
    e.preventDefault()
    const nome = nomeNovo.trim()
    if (!nome) return
    setSalvando(true)
    setAviso(null)
    try {
      const r = await criarObra(nome)
      setAviso(r.criada ? `Obra "${nome}" criada.` : `A obra "${nome}" já existia.`)
      setNomeNovo('')
      setNovo(false)
      params.delete('novo')
      setParams(params, { replace: true })
      await carregar()
    } catch {
      setAviso('Não consegui criar a obra agora.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="page">
      <PageHead eyebrow="PORTFÓLIO" title="Suas obras" subtitle="Tudo o que a Rosana já registrou, agrupado por obra."
        right={<button className="btn-primary" onClick={() => setNovo((v) => !v)}><Plus size={16} /> Nova obra</button>} />

      <div className="toolbar">
        <label className="filter-search">
          <Search size={16} />
          <input placeholder="Buscar obra pelo nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && <button type="button" aria-label="Limpar" onClick={() => setBusca('')}><X size={14} /></button>}
        </label>
      </div>

      {novo && (
        <form className="inline-form" onSubmit={salvarObra}>
          <input autoFocus placeholder="Nome da nova obra (ex.: Residencial Aurora)" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
          <button className="btn-primary" disabled={salvando || !nomeNovo.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" className="btn-ghost" onClick={() => setNovo(false)}>Cancelar</button>
        </form>
      )}
      {aviso && <div className="board-note">{aviso}</div>}

      <PageState loading={obras === null} error={erro} empty={!!obras && filtradas.length === 0}
        emptyMsg={busca ? 'Nenhuma obra encontrada para essa busca.' : 'Nenhuma obra ainda. Crie uma acima ou registre custos/RDO pela Rosana no WhatsApp.'}>
        <div className="card-grid">
          {filtradas.map((o, i) => {
            const cor = CORES[i % CORES.length]
            return (
              <article className="obra-card" key={o.nome}>
                <div className="obra-top">
                  <span className="obra-mark" style={{ background: `${cor}1e`, color: cor }}>⌂</span>
                  <div><h3>{o.nome}</h3><small>Última atividade: {formatDate(o.ultimaAtividade)}</small></div>
                </div>
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
    </section>
  )
}
